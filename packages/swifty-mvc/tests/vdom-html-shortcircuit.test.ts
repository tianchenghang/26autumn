import { describe, it, expect } from "vitest";
import { vdomCreate, vdomSetChildNodes, createVDomRef } from "../src/vdom";
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

describe("VDOM html short-circuit optimization", () => {
  it("skips child diff when attrs + html are both equal", () => {
    // DOM has a parent div with one child div (containing a span)
    const el = document.createElement("div");
    el.innerHTML = '<div class="old"><span>child content</span></div>';
    const divBefore = el.children[0] as HTMLElement;
    const spanBefore = el.querySelector("span")!;

    const frame = makeFrame("html-sc-1");
    const view = { rendered: true, endUpdate: () => {} } as any;
    const ref = createVDomRef("html-sc-1");

    // Container represents el — its children are the diffed nodes
    // Old: div.outer > span.same > text
    const textChild = vdomCreate(0, "child content");
    const spanOld = vdomCreate("span", { class: "same" }, [textChild]);
    const divOld = vdomCreate("div", { class: "old" }, [spanOld]);
    const containerOld = vdomCreate("section", null, [divOld]);

    // New: div.new > span.same > text (div class changes, span identical)
    const textChild2 = vdomCreate(0, "child content");
    const spanNew = vdomCreate("span", { class: "same" }, [textChild2]);
    const divNew = vdomCreate("div", { class: "new" }, [spanNew]);
    const containerNew = vdomCreate("section", null, [divNew]);

    vdomSetChildNodes(
      el,
      containerOld,
      containerNew,
      ref,
      frame,
      new Set(),
      view,
      () => {},
    );

    // div class updated (attrs differ → attribute diff ran)
    expect(divBefore.getAttribute("class")).toBe("new");
    // Same div DOM node (not replaced)
    expect(el.children[0]).toBe(divBefore);
    // span should be the exact same DOM node — child diff was short-circuited
    // because span's attrs + html are equal between old and new
    expect(el.querySelector("span")).toBe(spanBefore);
    expect(spanBefore.textContent).toBe("child content");

    cleanup("html-sc-1");
  });

  it("runs attribute diff but skips child diff when attrs differ but html equal", () => {
    const el = document.createElement("div");
    el.innerHTML = '<span class="old">text</span>';
    const spanBefore = el.querySelector("span")!;

    const frame = makeFrame("html-sc-2");
    const view = { rendered: true, endUpdate: () => {} } as any;
    const ref = createVDomRef("html-sc-2");

    // Container children: single span element
    const textOld = vdomCreate(0, "text");
    const spanOld = vdomCreate("span", { class: "old" }, [textOld]);
    const containerOld = vdomCreate("div", null, [spanOld]);

    const textNew = vdomCreate(0, "text");
    const spanNew = vdomCreate("span", { class: "new" }, [textNew]);
    const containerNew = vdomCreate("div", null, [spanNew]);

    vdomSetChildNodes(
      el,
      containerOld,
      containerNew,
      ref,
      frame,
      new Set(),
      view,
      () => {},
    );

    // Attribute diff ran: class updated from "old" to "new"
    expect(el.querySelector("span")!.getAttribute("class")).toBe("new");
    // Same DOM node (not replaced)
    expect(el.querySelector("span")).toBe(spanBefore);
    // Children unchanged: html equal → child diff was skipped by short-circuit
    expect(spanBefore.textContent).toBe("text");

    cleanup("html-sc-2");
  });

  it("syncs form state even when attrs + html are equal (hasSpecials)", () => {
    const el = document.createElement("div");
    const input = document.createElement("input");
    input.setAttribute("type", "text");
    input.setAttribute("value", "hello");
    input.value = "hello";
    el.appendChild(input);

    // Simulate user typing — DOM value diverges from attribute
    input.value = "user typed";
    expect(input.value).toBe("user typed");

    const frame = makeFrame("html-sc-3");
    const view = { rendered: true, endUpdate: () => {} } as any;
    const ref = createVDomRef("html-sc-3");

    // Old: container has just the input
    const inputOld = vdomCreate(
      "input",
      { type: "text", value: "hello" },
      null,
      {
        value: "value",
      },
    );
    const containerOld = vdomCreate("div", null, [inputOld]);

    // New: container has input + a new sibling span (forces container html
    // to differ so the container-level short-circuit does not fire, allowing
    // the input's vdomSetNode fast path to be reached)
    const inputNew = vdomCreate(
      "input",
      { type: "text", value: "hello" },
      null,
      {
        value: "value",
      },
    );
    const sibling = vdomCreate("span", null, [vdomCreate(0, "new")]);
    const containerNew = vdomCreate("div", null, [inputNew, sibling]);

    vdomSetChildNodes(
      el,
      containerOld,
      containerNew,
      ref,
      frame,
      new Set(),
      view,
      () => {},
    );

    // vdomSyncFormState sets DOM properties directly (not via ref.nodeProps),
    // so the value should already be synced after vdomSetChildNodes returns.
    // Form state should be synced: value restored to template value "hello"
    // even though input's attrs + html were equal, hasSpecials triggered
    // vdomSyncFormState in the vdomSetNode fast path.
    expect(input.value).toBe("hello");
    // The sibling span should have been inserted
    expect(el.querySelector("span")?.textContent).toBe("new");

    cleanup("html-sc-3");
  });

  it("skips both attribute and child diff for deeply unchanged subtrees", () => {
    const el = document.createElement("ul");
    el.innerHTML =
      '<li id="a"><span>same</span></li><li id="b"><em>changed</em></li>';
    const liABefore = el.querySelector("#a")!;
    const spanBefore = el.querySelector("#a span")!;
    const liBBefore = el.querySelector("#b")!;

    const frame = makeFrame("html-sc-4");
    const view = { rendered: true, endUpdate: () => {} } as any;
    const ref = createVDomRef("html-sc-4");

    // Old tree: ul > [li#a > span > "same", li#b > em > "changed"]
    const spanChild = vdomCreate(0, "same");
    const spanNode = vdomCreate("span", null, [spanChild]);
    const liA_old = vdomCreate("li", { id: "a" }, [spanNode]);

    const emChild = vdomCreate(0, "changed");
    const emNode = vdomCreate("em", null, [emChild]);
    const liB_old = vdomCreate("li", { id: "b" }, [emNode]);

    const ulOld = vdomCreate("ul", null, [liA_old, liB_old]);

    // New tree: li#a is identical, li#b has different text
    const spanChild2 = vdomCreate(0, "same");
    const spanNode2 = vdomCreate("span", null, [spanChild2]);
    const liA_new = vdomCreate("li", { id: "a" }, [spanNode2]);

    const emChild2 = vdomCreate(0, "new content");
    const emNode2 = vdomCreate("em", null, [emChild2]);
    const liB_new = vdomCreate("li", { id: "b" }, [emNode2]);

    const ulNew = vdomCreate("ul", null, [liA_new, liB_new]);

    vdomSetChildNodes(el, ulOld, ulNew, ref, frame, new Set(), view, () => {});

    // li#a: attrs + html equal → entire subtree short-circuited
    // Both li and its child span should be the same DOM nodes
    expect(el.querySelector("#a")).toBe(liABefore);
    expect(el.querySelector("#a span")).toBe(spanBefore);
    expect(spanBefore.textContent).toBe("same");

    // li#b: html differs → child diff runs, em content updated
    expect(el.querySelector("#b")).toBe(liBBefore);
    expect(el.querySelector("#b em")!.textContent).toBe("new content");

    cleanup("html-sc-4");
  });

  it("does NOT short-circuit when html differs", () => {
    const el = document.createElement("div");
    el.innerHTML = '<span class="same">old text</span>';
    const spanBefore = el.querySelector("span")!;
    void spanBefore.firstChild;

    const frame = makeFrame("html-sc-no-skip");
    const view = { rendered: true, endUpdate: () => {} } as any;
    const ref = createVDomRef("html-sc-no-skip");

    const spanOld = vdomCreate("span", { class: "same" }, [
      vdomCreate(0, "old text"),
    ]);
    const containerOld = vdomCreate("div", null, [spanOld]);

    const spanNew = vdomCreate("span", { class: "same" }, [
      vdomCreate(0, "new text"),
    ]);
    const containerNew = vdomCreate("div", null, [spanNew]);

    vdomSetChildNodes(
      el,
      containerOld,
      containerNew,
      ref,
      frame,
      new Set(),
      view,
      () => {},
    );

    // Same span DOM node (tag match, in-place update)
    expect(el.querySelector("span")).toBe(spanBefore);
    // But text content should be updated
    expect(spanBefore.textContent).toBe("new text");
    // ref.changed should be set
    expect(ref.changed).toBe(1);

    cleanup("html-sc-no-skip");
  });

  it("does NOT short-circuit for form elements with hasSpecials even when attrs+html equal", () => {
    const el = document.createElement("div");
    const input = document.createElement("input");
    input.setAttribute("type", "text");
    input.setAttribute("value", "original");
    input.value = "user-typed";
    el.appendChild(input);

    const frame = makeFrame("html-sc-specials");
    const view = { rendered: true, endUpdate: () => {} } as any;
    const ref = createVDomRef("html-sc-specials");

    // Old and new have identical attrs and html
    const inputOld = vdomCreate(
      "input",
      { type: "text", value: "original" },
      null,
      {
        value: "value",
      },
    );
    const containerOld = vdomCreate("div", null, [inputOld]);

    const inputNew = vdomCreate(
      "input",
      { type: "text", value: "original" },
      null,
      {
        value: "value",
      },
    );
    // Add a sibling to prevent container-level short-circuit
    const sibling = vdomCreate("span", null, [vdomCreate(0, "x")]);
    const containerNew = vdomCreate("div", null, [inputNew, sibling]);

    vdomSetChildNodes(
      el,
      containerOld,
      containerNew,
      ref,
      frame,
      new Set(),
      view,
      () => {},
    );

    // Form state should be synced: input.value should be restored to "original"
    // even though attrs+html were equal, because hasSpecials triggers vdomSyncFormState
    expect(input.value).toBe("original");

    cleanup("html-sc-specials");
  });

  it("short-circuit preserves deeply nested unchanged DOM nodes", () => {
    const el = document.createElement("div");
    el.innerHTML =
      '<div class="wrapper"><ul><li id="a"><span>deep</span></li></ul></div>';
    const deepSpan = el.querySelector("#a span")!;
    const liA = el.querySelector("#a")!;

    const frame = makeFrame("html-sc-deep");
    const view = { rendered: true, endUpdate: () => {} } as any;
    const ref = createVDomRef("html-sc-deep");

    const spanNode = vdomCreate("span", null, [vdomCreate(0, "deep")]);
    const liNode = vdomCreate("li", { id: "a" }, [spanNode]);
    const ulNode = vdomCreate("ul", null, [liNode]);
    const wrapperOld = vdomCreate("div", { class: "wrapper" }, [ulNode]);
    const containerOld = vdomCreate("div", null, [wrapperOld]);

    // New tree is identical
    const spanNode2 = vdomCreate("span", null, [vdomCreate(0, "deep")]);
    const liNode2 = vdomCreate("li", { id: "a" }, [spanNode2]);
    const ulNode2 = vdomCreate("ul", null, [liNode2]);
    const wrapperNew = vdomCreate("div", { class: "wrapper" }, [ulNode2]);
    const containerNew = vdomCreate("div", null, [wrapperNew]);

    vdomSetChildNodes(
      el,
      containerOld,
      containerNew,
      ref,
      frame,
      new Set(),
      view,
      () => {},
    );

    // All deeply nested nodes should be the exact same DOM references
    expect(el.querySelector("#a")).toBe(liA);
    expect(el.querySelector("#a span")).toBe(deepSpan);
    expect(ref.changed).toBe(0);

    cleanup("html-sc-deep");
  });
});
