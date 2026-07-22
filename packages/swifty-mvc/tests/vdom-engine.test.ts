import { describe, it, expect } from "vitest";
import {
  vdomCreate,
  vdomCreateNode,
  vdomSetChildNodes,
  vdomSetAttributes,
  createVDomRef,
} from "../src/vdom";
import { V_TEXT_NODE, SPLITTER } from "../src/common";
import { Frame, createFrame } from "../src/frame";
import type { VDomNode, FrameObj } from "../src/types";

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

describe("VDOM Engine", () => {
  // ============================================================
  // vdomCreate — Node Creation
  // ============================================================
  describe("vdomCreate", () => {
    it("creates a text node with tag = V_TEXT_NODE", () => {
      const node = vdomCreate(0, "hello");
      expect(node.tag).toBe(V_TEXT_NODE);
      expect(node.html).toBe("hello");
      expect(node.children).toBeUndefined();
      expect(node.attrs).toBeUndefined();
    });

    it("creates a text node with null props → empty string", () => {
      const node = vdomCreate(0, null);
      expect(node.tag).toBe(V_TEXT_NODE);
      expect(node.html).toBe("");
    });

    it("creates a raw HTML node when children is truthy", () => {
      const node = vdomCreate(0, "<b>bold</b>", 1);
      expect(node.tag).toBe(SPLITTER);
      expect(node.html).toBe("<b>bold</b>");
    });

    it("creates an element node with attrs and children", () => {
      const textChild = vdomCreate(0, "world");
      const node = vdomCreate("div", { class: "row" }, [textChild]);
      expect(node.tag).toBe("div");
      expect(node.attrs).toBe('<div class="row"');
      expect(node.attrsMap).toEqual({ class: "row" });
      expect(node.children).toHaveLength(1);
      expect(node.html).toBe("world"); // text child encoded in innerHTML
    });

    it("creates a self-closing element when children = 1", () => {
      const node = vdomCreate("br", null, 1);
      expect(node.tag).toBe("br");
      expect(node.selfClose).toBe(true);
      expect(node.children).toBeUndefined();
    });

    it("uses id as compareKey (keeps id in attrsMap)", () => {
      const node = vdomCreate("div", { id: "main" });
      expect(node.compareKey).toBe("main");
      expect(node.attrsMap?.["id"]).toBe("main");
    });

    it("serializes nested children into innerHTML", () => {
      const text = vdomCreate(0, "click me");
      const btn = vdomCreate("button", { id: "run", class: "btn" }, [text]);
      const wrapper = vdomCreate("div", { class: "container" }, [btn]);
      expect(wrapper.html).toContain("<button");
      expect(wrapper.html).toContain('id="run"');
      expect(wrapper.html).toContain("click me");
      expect(wrapper.html).toContain("</button>");
    });

    it("builds reused map for keyed children", () => {
      const child1 = vdomCreate("li", { id: "a" }, [vdomCreate(0, "A")]);
      const child2 = vdomCreate("li", { id: "b" }, [vdomCreate(0, "B")]);
      const parent = vdomCreate("ul", null, [child1, child2]);
      expect(parent.reused).toEqual({ a: 1, b: 1 });
      expect(parent.reusedTotal).toBe(2);
    });

    it("detects v-swifty sub-views", () => {
      const node = vdomCreate("div", { "v-swifty": "components/child" });
      expect(node.isSwiftyView).toBe("components/child");
      expect(node.views).toHaveLength(1);
      expect(node.views![0][0]).toBe("components/child");
      expect(node.compareKey).toBe("div" + SPLITTER + "components/child");
    });

    it("deletes false/null props from attrsMap", () => {
      const node = vdomCreate("input", {
        disabled: false,
        readonly: null,
        type: "text",
      });
      expect(node.attrsMap?.["disabled"]).toBeUndefined();
      expect(node.attrsMap?.["readonly"]).toBeUndefined();
      expect(node.attrsMap?.["type"]).toBe("text");
    });

    it("sets true boolean props to empty string", () => {
      const node = vdomCreate("input", { checked: true });
      expect(node.attrsMap?.["checked"]).toBe("");
    });

    it("handles empty children array", () => {
      const node = vdomCreate("div", null, []);
      expect(node.children).toBeUndefined(); // empty array becomes undefined
      expect(node.html).toBe("");
    });

    it("merges adjacent text nodes", () => {
      const t1 = vdomCreate(0, "hello ");
      const t2 = vdomCreate(0, "world");
      const parent = vdomCreate("div", null, [t1, t2]);
      // Adjacent text nodes should be merged
      expect(parent.children).toHaveLength(1);
      expect(parent.children![0].html).toBe("hello world");
    });

    it("does not merge non-adjacent text nodes", () => {
      const t1 = vdomCreate(0, "hello");
      const span = vdomCreate("span", null, [vdomCreate(0, "middle")]);
      const t2 = vdomCreate(0, "world");
      const parent = vdomCreate("div", null, [t1, span, t2]);
      expect(parent.children).toHaveLength(3);
    });

    it("handles textarea value as innerHTML", () => {
      const node = vdomCreate("textarea", { value: "some text" });
      // textarea value should be written as innerHTML, not attribute
      expect(node.html).toBe("some text");
      expect(node.attrsMap?.["value"]).toBeUndefined();
    });

    it("propagates views from nested children", () => {
      const child = vdomCreate("div", { "v-swifty": "views/nested" });
      const parent = vdomCreate("div", null, [child]);
      expect(parent.views).toBeDefined();
      expect(parent.views!.length).toBeGreaterThan(0);
    });

    it("sets reused map for nested keyed children", () => {
      const inner = vdomCreate("li", { id: "x" }, [vdomCreate(0, "X")]);
      const ul = vdomCreate("ul", null, [inner]);
      const wrapper = vdomCreate("div", null, [ul]);
      // wrapper should have reused from nested keyed child
      expect(wrapper.reused).toBeDefined();
      expect(wrapper.reused!["x"]).toBe(1);
    });
  });

  // ============================================================
  // vdomCreateNode — VDOM to DOM conversion
  // ============================================================
  describe("vdomCreateNode", () => {
    it("creates a text node from VDomNode", () => {
      const ref = createVDomRef("test");
      const owner = document.createElement("div");
      const vnode = vdomCreate(0, "hello world");
      const dom = vdomCreateNode(vnode, owner, ref);
      expect(dom.nodeType).toBe(Node.TEXT_NODE);
      expect(dom.nodeValue).toBe("hello world");
    });

    it("creates an element node with attributes and innerHTML", () => {
      const ref = createVDomRef("test");
      const owner = document.createElement("div");
      const text = vdomCreate(0, "content");
      const vnode = vdomCreate("p", { class: "para", id: "p1" }, [text]);
      const dom = vdomCreateNode(vnode, owner, ref) as Element;
      expect(dom.tagName).toBe("P");
      expect(dom.getAttribute("class")).toBe("para");
      expect(dom.getAttribute("id")).toBe("p1");
      expect(dom.innerHTML).toBe("content");
    });

    it("handles SVG namespace", () => {
      const ref = createVDomRef("test");
      const owner = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      const vnode = vdomCreate("circle", { r: "10" });
      const dom = vdomCreateNode(vnode, owner, ref) as Element;
      expect(dom.namespaceURI).toBe("http://www.w3.org/2000/svg");
      expect(dom.tagName).toBe("circle");
    });

    it("vdomCreateNode creates raw HTML from SPLITTER tag via <template> parsing", () => {
      // SPLITTER (raw HTML) vnodes are created via vdomCreate(0, html, 1).
      // vdomCreateNode parses the raw HTML through a <template> element to
      // avoid the InvalidCharacterError that createElementNS(ns, "\x1e")
      // would throw — SPLITTER is U+001E, not a valid XML QName.
      //
      // This test was previously a deception: it only asserted
      // `vnode.tag === SPLITTER` without ever invoking vdomCreateNode,
      // masking the broken creation path. After the source fix, it now
      // verifies that raw HTML is correctly parsed and injected as a real
      // DOM node (not escaped as text).
      const ref = createVDomRef("test");
      const owner = document.createElement("div");
      const vnode = vdomCreate(0, "<b>raw</b>", 1);
      expect(vnode.tag).toBe(SPLITTER);
      expect(vnode.html).toBe("<b>raw</b>");

      const dom = vdomCreateNode(vnode, owner, ref) as Element;
      expect(dom.nodeType).toBe(Node.ELEMENT_NODE);
      expect(dom.tagName).toBe("B");
      expect(dom.textContent).toBe("raw");

      // Verify the raw HTML was parsed (not HTML-encoded as text)
      owner.appendChild(dom);
      expect(owner.querySelector("b")?.textContent).toBe("raw");
      expect(owner.innerHTML).toContain("<b>raw</b>");
    });

    it("vdomCreateNode returns empty text node for empty SPLITTER html", () => {
      const ref = createVDomRef("test");
      const owner = document.createElement("div");
      const vnode = vdomCreate(0, "", 1);
      expect(vnode.tag).toBe(SPLITTER);

      const dom = vdomCreateNode(vnode, owner, ref);
      expect(dom.nodeType).toBe(Node.TEXT_NODE);
      expect(dom.nodeValue).toBe("");
    });

    it("vdomCreateNode renders only the first top-level node for multi-node raw HTML", () => {
      // Known limitation: SPLITTER raw HTML with multiple top-level nodes
      // only renders the first node, because vdomCreateNode returns a single
      // ChildNode. This matches the single-ChildNode return contract and is
      // acceptable for the {{!}} use case (typically single-node or text).
      const ref = createVDomRef("test");
      const owner = document.createElement("div");
      const vnode = vdomCreate(0, "<b>first</b><b>second</b>", 1);
      expect(vnode.tag).toBe(SPLITTER);

      const dom = vdomCreateNode(vnode, owner, ref) as Element;
      expect(dom.tagName).toBe("B");
      expect(dom.textContent).toBe("first");
    });
  });

  // ============================================================
  // vdomSetAttributes — Attribute diffing
  // ============================================================
  describe("vdomSetAttributes", () => {
    it("adds new attributes when no lastVDom", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("div");
      const vnode = vdomCreate("div", { class: "foo", id: "bar" });
      const changed = vdomSetAttributes(el, vnode, ref);
      expect(changed).toBe(1);
      expect(el.getAttribute("class")).toBe("foo");
      expect(el.getAttribute("id")).toBe("bar");
    });

    it("removes old attributes not in new", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("div");
      el.setAttribute("class", "old");
      el.setAttribute("data-x", "gone");
      const oldVDom = vdomCreate("div", { class: "old", "data-x": "gone" });
      const newVDom = vdomCreate("div", { class: "new" });
      const changed = vdomSetAttributes(el, newVDom, ref, oldVDom);
      expect(changed).toBe(1);
      expect(el.getAttribute("class")).toBe("new");
      expect(el.hasAttribute("data-x")).toBe(false);
    });

    it("returns 0 when attributes unchanged", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("div");
      el.setAttribute("class", "same");
      const oldVDom = vdomCreate("div", { class: "same" });
      const newVDom = vdomCreate("div", { class: "same" });
      const changed = vdomSetAttributes(el, newVDom, ref, oldVDom);
      expect(changed).toBe(0);
    });

    it("sets special attributes as DOM properties via ref.nodeProps", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("input");
      const newVDom = vdomCreate("input", { value: "new" }, null, {
        value: "value",
      });
      vdomSetAttributes(el, newVDom, ref);
      // The property assignment is deferred in ref.nodeProps
      expect(ref.nodeProps).toHaveLength(1);
      expect(ref.nodeProps[0][1]).toBe("value");
      expect(ref.nodeProps[0][2]).toBe("new");
    });

    it("handles undefined attrsMap gracefully", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("div");
      // Construct VDomNode with undefined attrsMap directly
      const vnode: VDomNode = { tag: "div", html: "" } as VDomNode;
      // This should NOT throw even though attrsMap is undefined
      const changed = vdomSetAttributes(el, vnode, ref);
      expect(changed).toBe(0);
    });

    it("handles removing all attributes when new has none", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("div");
      el.setAttribute("class", "old");
      el.setAttribute("id", "old-id");
      const oldVDom = vdomCreate("div", { class: "old", id: "old-id" });
      const newVDom = vdomCreate("div", null);
      vdomSetAttributes(el, newVDom, ref, oldVDom);
      expect(el.hasAttribute("class")).toBe(false);
      // id removal goes through idUpdates, not removeAttribute
    });
  });

  // ============================================================
  // vdomSetChildNodes — Double-pointer diff
  // ============================================================
  describe("vdomSetChildNodes", () => {
    it("fast path: sets innerHTML on first render (no lastVDom)", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("div");
      const frame = makeFrame("vdom-test-1");
      const view = { rendered: false, endUpdate: () => {} } as any;
      const newVDom = vdomCreate("div", null, [
        vdomCreate("p", null, [vdomCreate(0, "hello")]),
      ]);
      vdomSetChildNodes(
        el,
        undefined,
        newVDom,
        ref,
        frame,
        new Set(),
        view,
        () => {},
      );
      expect(ref.changed).toBe(1);
      expect(el.innerHTML).toContain("<p>hello</p>");
      cleanup("vdom-test-1");
    });

    it("no-op when both old and new have no children", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("div");
      const frame = makeFrame("vdom-test-2");
      const view = { rendered: true, endUpdate: () => {} } as any;
      const oldVDom = vdomCreate("div", null, null);
      const newVDom = vdomCreate("div", null, null);
      vdomSetChildNodes(
        el,
        oldVDom,
        newVDom,
        ref,
        frame,
        new Set(),
        view,
        () => {},
      );
      expect(ref.changed).toBe(0);
      cleanup("vdom-test-2");
    });

    it("appends new children when old is empty", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("ul");
      const frame = makeFrame("vdom-test-3");
      const view = { rendered: true, endUpdate: () => {} } as any;
      const oldVDom = vdomCreate("ul", null, []);
      const newVDom = vdomCreate("ul", null, [
        vdomCreate("li", { id: "a" }, [vdomCreate(0, "A")]),
        vdomCreate("li", { id: "b" }, [vdomCreate(0, "B")]),
      ]);

      vdomSetChildNodes(
        el,
        oldVDom,
        newVDom,
        ref,
        frame,
        new Set(),
        view,
        () => {},
      );
      expect(ref.changed).toBe(1);
      expect(el.children.length).toBe(2);
      expect(el.children[0].tagName).toBe("LI");
      expect(el.children[0].textContent).toBe("A");
      cleanup("vdom-test-3");
    });

    it("removes extra old children", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("ul");
      el.innerHTML = "<li>A</li><li>B</li><li>C</li>";
      const frame = makeFrame("vdom-test-4");
      const view = { rendered: true, endUpdate: () => {} } as any;

      const oldVDom = vdomCreate("ul", null, [
        vdomCreate("li", null, [vdomCreate(0, "A")]),
        vdomCreate("li", null, [vdomCreate(0, "B")]),
        vdomCreate("li", null, [vdomCreate(0, "C")]),
      ]);
      const newVDom = vdomCreate("ul", null, [
        vdomCreate("li", null, [vdomCreate(0, "A")]),
      ]);

      vdomSetChildNodes(
        el,
        oldVDom,
        newVDom,
        ref,
        frame,
        new Set(),
        view,
        () => {},
      );
      expect(ref.changed).toBe(1);
      expect(el.children.length).toBe(1);
      expect(el.children[0].textContent).toBe("A");
      cleanup("vdom-test-4");
    });

    it("preserves node identity on keyed reorder", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("ul");
      el.innerHTML = '<li id="a">A</li><li id="b">B</li><li id="c">C</li>';

      const nodeA = el.children[0];
      const nodeB = el.children[1];
      const nodeC = el.children[2];

      const frame = makeFrame("vdom-test-5");
      const view = { rendered: true, endUpdate: () => {} } as any;

      // Old: a, b, c → New: c, a, b
      const oldVDom = vdomCreate("ul", null, [
        vdomCreate("li", { id: "a" }, [vdomCreate(0, "A")]),
        vdomCreate("li", { id: "b" }, [vdomCreate(0, "B")]),
        vdomCreate("li", { id: "c" }, [vdomCreate(0, "C")]),
      ]);
      const newVDom = vdomCreate("ul", null, [
        vdomCreate("li", { id: "c" }, [vdomCreate(0, "C")]),
        vdomCreate("li", { id: "a" }, [vdomCreate(0, "A")]),
        vdomCreate("li", { id: "b" }, [vdomCreate(0, "B")]),
      ]);

      vdomSetChildNodes(
        el,
        oldVDom,
        newVDom,
        ref,
        frame,
        new Set(),
        view,
        () => {},
      );

      // Nodes should be reordered, not re-created
      expect(el.children[0]).toBe(nodeC);
      expect(el.children[1]).toBe(nodeA);
      expect(el.children[2]).toBe(nodeB);
      cleanup("vdom-test-5");
    });

    it("updates text node value in place", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("div");
      el.innerHTML = "<span>old</span>";
      const frame = makeFrame("vdom-test-6");
      const view = { rendered: true, endUpdate: () => {} } as any;

      const oldVDom = vdomCreate("div", null, [
        vdomCreate("span", null, [vdomCreate(0, "old")]),
      ]);
      const newVDom = vdomCreate("div", null, [
        vdomCreate("span", null, [vdomCreate(0, "new")]),
      ]);

      vdomSetChildNodes(
        el,
        oldVDom,
        newVDom,
        ref,
        frame,
        new Set(),
        view,
        () => {},
      );

      expect(ref.changed).toBe(1);
      expect(el.querySelector("span")?.textContent).toBe("new");
      cleanup("vdom-test-6");
    });

    it("replaces node on tag mismatch", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("div");
      el.innerHTML = "<span>old</span>";
      const frame = makeFrame("vdom-test-8");
      const view = { rendered: true, endUpdate: () => {} } as any;

      const oldVDom = vdomCreate("div", null, [
        vdomCreate("span", null, [vdomCreate(0, "old")]),
      ]);
      const newVDom = vdomCreate("div", null, [
        vdomCreate("p", null, [vdomCreate(0, "new")]),
      ]);

      vdomSetChildNodes(
        el,
        oldVDom,
        newVDom,
        ref,
        frame,
        new Set(),
        view,
        () => {},
      );

      expect(ref.changed).toBe(1);
      expect(el.children[0].tagName).toBe("P");
      expect(el.children[0].textContent).toBe("new");
      cleanup("vdom-test-8");
    });
    it("replaces all keyed children with entirely new keys", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("tbody");
      // First render: 5 rows with ids 1-5
      el.innerHTML =
        '<tr id="row-1"><td>1</td></tr><tr id="row-2"><td>2</td></tr><tr id="row-3"><td>3</td></tr><tr id="row-4"><td>4</td></tr><tr id="row-5"><td>5</td></tr>';

      const frame = makeFrame("vdom-test-replace");
      const view = { rendered: true, endUpdate: () => {} } as any;

      const oldVDom = vdomCreate("tbody", null, [
        vdomCreate("tr", { id: "row-1" }, [
          vdomCreate("td", null, [vdomCreate(0, "1")]),
        ]),
        vdomCreate("tr", { id: "row-2" }, [
          vdomCreate("td", null, [vdomCreate(0, "2")]),
        ]),
        vdomCreate("tr", { id: "row-3" }, [
          vdomCreate("td", null, [vdomCreate(0, "3")]),
        ]),
        vdomCreate("tr", { id: "row-4" }, [
          vdomCreate("td", null, [vdomCreate(0, "4")]),
        ]),
        vdomCreate("tr", { id: "row-5" }, [
          vdomCreate("td", null, [vdomCreate(0, "5")]),
        ]),
      ]);
      // Replace with entirely new ids 101-105
      const newVDom = vdomCreate("tbody", null, [
        vdomCreate("tr", { id: "row-101" }, [
          vdomCreate("td", null, [vdomCreate(0, "101")]),
        ]),
        vdomCreate("tr", { id: "row-102" }, [
          vdomCreate("td", null, [vdomCreate(0, "102")]),
        ]),
        vdomCreate("tr", { id: "row-103" }, [
          vdomCreate("td", null, [vdomCreate(0, "103")]),
        ]),
        vdomCreate("tr", { id: "row-104" }, [
          vdomCreate("td", null, [vdomCreate(0, "104")]),
        ]),
        vdomCreate("tr", { id: "row-105" }, [
          vdomCreate("td", null, [vdomCreate(0, "105")]),
        ]),
      ]);

      vdomSetChildNodes(
        el,
        oldVDom,
        newVDom,
        ref,
        frame,
        new Set(),
        view,
        () => {},
      );

      expect(ref.changed).toBe(1);
      expect(el.children.length).toBe(5);
      expect(el.children[0].id).toBe("row-101");
      expect(el.children[1].id).toBe("row-102");
      expect(el.children[2].id).toBe("row-103");
      expect(el.children[3].id).toBe("row-104");
      expect(el.children[4].id).toBe("row-105");
      expect(el.children[0].querySelector("td")?.textContent).toBe("101");
      cleanup("vdom-test-replace");
    });

    it("correctly swaps two keyed rows", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("tbody");
      el.innerHTML =
        '<tr id="row-1"><td>1</td></tr><tr id="row-2"><td>2</td></tr><tr id="row-3"><td>3</td></tr><tr id="row-4"><td>4</td></tr><tr id="row-5"><td>5</td></tr>';

      const frame = makeFrame("vdom-test-swap");
      const view = { rendered: true, endUpdate: () => {} } as any;

      const oldVDom = vdomCreate("tbody", null, [
        vdomCreate("tr", { id: "row-1" }, [
          vdomCreate("td", null, [vdomCreate(0, "1")]),
        ]),
        vdomCreate("tr", { id: "row-2" }, [
          vdomCreate("td", null, [vdomCreate(0, "2")]),
        ]),
        vdomCreate("tr", { id: "row-3" }, [
          vdomCreate("td", null, [vdomCreate(0, "3")]),
        ]),
        vdomCreate("tr", { id: "row-4" }, [
          vdomCreate("td", null, [vdomCreate(0, "4")]),
        ]),
        vdomCreate("tr", { id: "row-5" }, [
          vdomCreate("td", null, [vdomCreate(0, "5")]),
        ]),
      ]);
      // Swap rows 2 and 4
      const newVDom = vdomCreate("tbody", null, [
        vdomCreate("tr", { id: "row-1" }, [
          vdomCreate("td", null, [vdomCreate(0, "1")]),
        ]),
        vdomCreate("tr", { id: "row-4" }, [
          vdomCreate("td", null, [vdomCreate(0, "4")]),
        ]),
        vdomCreate("tr", { id: "row-3" }, [
          vdomCreate("td", null, [vdomCreate(0, "3")]),
        ]),
        vdomCreate("tr", { id: "row-2" }, [
          vdomCreate("td", null, [vdomCreate(0, "2")]),
        ]),
        vdomCreate("tr", { id: "row-5" }, [
          vdomCreate("td", null, [vdomCreate(0, "5")]),
        ]),
      ]);

      vdomSetChildNodes(
        el,
        oldVDom,
        newVDom,
        ref,
        frame,
        new Set(),
        view,
        () => {},
      );

      expect(ref.changed).toBe(1);
      expect(el.children.length).toBe(5);
      expect(el.children[0].id).toBe("row-1");
      expect(el.children[1].id).toBe("row-4");
      expect(el.children[2].id).toBe("row-3");
      expect(el.children[3].id).toBe("row-2");
      expect(el.children[4].id).toBe("row-5");
      cleanup("vdom-test-swap");
    });

    it("handles duplicate compareKeys in old children", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("ul");
      el.innerHTML = '<li id="dup">A</li><li id="dup">B</li>';
      const frame = makeFrame("vdom-dup-key");
      const view = { rendered: true, endUpdate: () => {} } as any;

      const oldVDom = vdomCreate("ul", null, [
        vdomCreate("li", { id: "dup" }, [vdomCreate(0, "A")]),
        vdomCreate("li", { id: "dup" }, [vdomCreate(0, "B")]),
      ]);
      const newVDom = vdomCreate("ul", null, [
        vdomCreate("li", { id: "dup" }, [vdomCreate(0, "C")]),
      ]);

      vdomSetChildNodes(
        el,
        oldVDom,
        newVDom,
        ref,
        frame,
        new Set(),
        view,
        () => {},
      );
      // Should handle without throwing
      expect(el.children.length).toBeGreaterThanOrEqual(1);
      cleanup("vdom-dup-key");
    });

    it("no-op when html is identical between old and new", () => {
      const ref = createVDomRef("test");
      const el = document.createElement("div");
      el.innerHTML = "<p>same</p>";
      const frame = makeFrame("vdom-noop");
      const view = { rendered: true, endUpdate: () => {} } as any;

      const oldVDom = vdomCreate("div", null, [
        vdomCreate("p", null, [vdomCreate(0, "same")]),
      ]);
      const newVDom = vdomCreate("div", null, [
        vdomCreate("p", null, [vdomCreate(0, "same")]),
      ]);

      vdomSetChildNodes(
        el,
        oldVDom,
        newVDom,
        ref,
        frame,
        new Set(),
        view,
        () => {},
      );
      expect(ref.changed).toBe(0);
      cleanup("vdom-noop");
    });
  });

  // ============================================================
  // createVDomRef
  // ============================================================
  describe("createVDomRef", () => {
    it("creates a ref with correct defaults", () => {
      const ref = createVDomRef("view-123");
      expect(ref.viewId).toBe("view-123");
      expect(ref.nodeProps).toEqual([]);
      expect(ref.asyncCount).toBe(0);
      expect(ref.changed).toBe(0);
    });
  });
});
