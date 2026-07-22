import { describe, it, expect } from "vitest";
import {
  domGetNode,
  domGetCompareKey,
  domSetChildNodes,
  domSetAttributes,
  domSpecialDiff as domSpecialDiff,
  createDomRef as createDomRef,
  applyDomOps,
  applyIdUpdates,
} from "../src/dom";
import {
  encodeHTML,
  strSafe,
  encodeURIExtra,
  encodeQuote,
  SWIFTY_VIEW,
} from "../src/common";
import { Frame, createFrame } from "../src/frame";
import type { FrameObj } from "../src/types";

function makeFrame(id: string): FrameObj {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id);
}

function cleanup(id: string): void {
  const el = document.getElementById(id);
  if (el) el.remove();
  (Frame.getAll() as Map<string, FrameObj>).delete(id);
}

describe("DOM Diff Engine", () => {
  describe("domGetNode", () => {
    it("parses a div fragment", () => {
      const ref = document.createElement("div");
      const wrapper = domGetNode("<p>hi</p>", ref);
      expect(wrapper.firstElementChild?.tagName).toBe("P");
    });

    it("parses <tr> via the table wrapper so the cell is preserved", () => {
      const ref = document.createElement("div");
      const wrapper = domGetNode("<tr><td>x</td></tr>", ref);
      // The <tr> survives somewhere under the wrapper — exact unwrap depth
      // depends on the browser HTML parser.
      const td = wrapper.querySelector("td");
      expect(td?.textContent).toBe("x");
    });
  });

  describe("domGetCompareKey", () => {
    it("uses element id as the compare key", () => {
      const el = document.createElement("div");
      el.id = "k1";
      expect(domGetCompareKey(el)).toBe("k1");
    });

    it("falls back to v-swifty path when present", () => {
      // v-swifty is a valid HTML attribute name, so setAttribute works directly.
      // start char — v-swifty has no such limitation.)
      const el = document.createElement("div");
      el.setAttribute(SWIFTY_VIEW, "views/home?x=1");
      expect(domGetCompareKey(el)).toBe("views/home");
    });

    it("returns undefined for text nodes", () => {
      const tx = document.createTextNode("hi");
      expect(domGetCompareKey(tx)).toBeUndefined();
    });
  });

  describe("domSetChildNodes - keyed diff", () => {
    it("appends a missing keyed child to the end", () => {
      const frame = makeFrame("vd1");
      const oldParent = document.createElement("div");
      oldParent.innerHTML = '<p id="a">A</p>';
      const newParent = document.createElement("div");
      newParent.innerHTML = '<p id="a">A</p><p id="b">B</p>';

      const ref = createDomRef();
      domSetChildNodes(oldParent, newParent, ref, frame);
      applyDomOps(ref.domOps);
      applyIdUpdates(ref.idUpdates);

      expect(oldParent.children).toHaveLength(2);
      expect(oldParent.children[1].id).toBe("b");
      cleanup("vd1");
    });

    it("removes extra old children", () => {
      const frame = makeFrame("vd2");
      const oldParent = document.createElement("div");
      oldParent.innerHTML = '<p id="a">A</p><p id="b">B</p><p id="c">C</p>';
      const newParent = document.createElement("div");
      newParent.innerHTML = '<p id="a">A</p>';

      const ref = createDomRef();
      domSetChildNodes(oldParent, newParent, ref, frame);
      applyDomOps(ref.domOps);

      expect(oldParent.children).toHaveLength(1);
      expect(oldParent.children[0].id).toBe("a");
      cleanup("vd2");
    });

    it("reorders keyed siblings without re-creating nodes", () => {
      const frame = makeFrame("vd3");
      const oldParent = document.createElement("div");
      oldParent.innerHTML = '<p id="a">A</p><p id="b">B</p><p id="c">C</p>';
      const aBefore = oldParent.children[0];
      const bBefore = oldParent.children[1];
      const cBefore = oldParent.children[2];

      const newParent = document.createElement("div");
      newParent.innerHTML = '<p id="c">C</p><p id="b">B</p><p id="a">A</p>';

      const ref = createDomRef();
      domSetChildNodes(oldParent, newParent, ref, frame);
      applyDomOps(ref.domOps);

      // Same node identities, reordered.
      expect(oldParent.children).toHaveLength(3);
      const ids = Array.from(oldParent.children).map((el) => el.id);
      expect(ids).toEqual(["c", "b", "a"]);
      // None of the original elements were destroyed
      expect(oldParent.contains(aBefore)).toBe(true);
      expect(oldParent.contains(bBefore)).toBe(true);
      expect(oldParent.contains(cBefore)).toBe(true);
      cleanup("vd3");
    });

    it("handles the same key appearing in old and new (1:1 match)", () => {
      // Document the supported case: when the same id appears 1:1 in old
      // and new sibling sets, the existing node is reused and patched in
      // place. (Having duplicate IDs in a single parent is undefined
      // behavior — element IDs must be unique inside their owner frame.)
      const frame = makeFrame("vd4");
      const oldParent = document.createElement("div");
      oldParent.innerHTML = '<p id="vd4-x">old text</p>';
      const oldNode = oldParent.children[0];
      const newParent = document.createElement("div");
      newParent.innerHTML = '<p id="vd4-x">new text</p>';

      const ref = createDomRef();
      domSetChildNodes(oldParent, newParent, ref, frame);
      applyDomOps(ref.domOps);
      // Same node identity, text patched.
      expect(oldParent.children[0]).toBe(oldNode);
      expect(oldNode.textContent).toBe("new text");
      cleanup("vd4");
    });
  });

  describe("domSetAttributes", () => {
    it("adds, updates, and removes attributes (no id changes)", () => {
      const oldEl = document.createElement("div");
      oldEl.setAttribute("class", "old");
      oldEl.setAttribute("data-x", "1");
      const newEl = document.createElement("div");
      newEl.setAttribute("class", "new");
      newEl.setAttribute("data-y", "2");

      const ref = createDomRef();
      domSetAttributes(oldEl, newEl, ref);

      expect(oldEl.getAttribute("class")).toBe("new");
      expect(oldEl.getAttribute("data-y")).toBe("2");
      expect(oldEl.getAttribute("data-x")).toBeNull();
      expect(ref.hasChanged).toBe(1);
    });

    it("routes id mutations through ref.idUpdates", () => {
      const oldEl = document.createElement("div");
      oldEl.id = "old";
      const newEl = document.createElement("div");
      newEl.id = "new";
      const ref = createDomRef();
      domSetAttributes(oldEl, newEl, ref);
      expect(ref.idUpdates).toEqual([[oldEl, "new"]]);
    });
  });

  describe("domSpecialDiff", () => {
    it("syncs input.value across diff", () => {
      const oldInput = document.createElement("input");
      oldInput.value = "old";
      const newInput = document.createElement("input");
      newInput.value = "new";
      const changed = domSpecialDiff(oldInput, newInput);
      expect(changed).toBe(1);
      expect(oldInput.value).toBe("new");
    });

    it("returns 0 for non-special tag", () => {
      const oldDiv = document.createElement("div");
      const newDiv = document.createElement("div");
      expect(domSpecialDiff(oldDiv, newDiv)).toBe(0);
    });
  });

  describe("encoders", () => {
    it("encodeHTML escapes critical entities", () => {
      expect(encodeHTML(`<a href="x">&y</a>`)).toBe(
        "&lt;a href=&#34;x&#34;&gt;&amp;y&lt;/a&gt;",
      );
    });

    it("encodeSafe stringifies null / undefined to ''", () => {
      expect(strSafe(null)).toBe("");
      expect(strSafe(undefined)).toBe("");
      expect(strSafe(42)).toBe("42");
    });

    it("encodeURIExtra percent-encodes !', ()*", () => {
      expect(encodeURIExtra("a!b'c(d)e*f")).toBe("a%21b%27c%28d%29e%2Af");
    });

    it("encodeQ escapes quotes and backslashes", () => {
      expect(encodeQuote(`a"b'c\\d`)).toBe(`a\\"b\\'c\\\\d`);
    });
  });
});
