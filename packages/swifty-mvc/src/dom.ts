/**
 * Real-DOM Diff Engine (string-mode rendering pipeline).
 *
 * When `FrameworkConfig.vdom` is **false** (the default), the Updater uses
 * this engine: the compiled template produces an HTML string, which is
 * parsed into a temporary DOM tree via `document.implementation.createHTMLDocument`,
 * then diffed against the live DOM using keyed comparison.
 *
 * ## Keyed diff algorithm
 *
 * `domSetChildNodes` builds a `keyedNodes` map from old children (bucketed by
 * `compareKey`), then walks new children trying to reuse old nodes by key.
 * Unmatched old nodes are removed; unmatched new nodes are appended.
 *
 * ## Special elements
 *
 * `domGetNode` handles context-sensitive tags (`<table>`, `<select>`, `<svg>`,
 * `<math>`) by wrapping them in the correct parent during parsing — the native
 * HTML parser handles these for free.
 */
import { SVG_NS, MATH_NS, TAG_NAME_REGEXP, SWIFTY_VIEW } from "./common";
import { parseUri } from "./utils";
import type { DomRef, DomOp, DomElement, FrameObj } from "./types";

// ============================================================
// Wrap meta for special HTML elements
// ============================================================

const wrapMeta: Record<string, [number, string]> = {
  option: [1, "<select multiple>"],
  thead: [1, "<table>"],
  col: [2, "<table><colgroup>"],
  tr: [2, "<table><tbody>"],
  td: [3, "<table><tbody><tr>"],
  area: [1, "<map>"],
  param: [1, "<object>"],
  svg: [1, '<svg xmlns="' + SVG_NS + '">'],
  math: [1, '<math xmlns="' + MATH_NS + '">'],
  _: [0, ""],
};

wrapMeta["optgroup"] = wrapMeta["option"];
wrapMeta["tbody"] =
  wrapMeta["tfoot"] =
  wrapMeta["colgroup"] =
  wrapMeta["caption"] =
    wrapMeta["thead"];
wrapMeta["th"] = wrapMeta["td"];

// ============================================================
// Virtual document for parsing HTML strings
// ============================================================

const VDoc = document.implementation.createHTMLDocument("");
const VBase = VDoc.createElement("base");
VBase.href = document.location.href;
VDoc.head.appendChild(VBase);

// ============================================================
// Special element properties (direct DOM property diff)
// ============================================================

const DomSpecials: Record<string, string[]> = {
  INPUT: ["value", "checked"],
  TEXTAREA: ["value"],
  OPTION: ["selected"],
};

// ============================================================
// Core DOM functions
// ============================================================

/**
 * Unmount child Frames contained within a DOM node before it's removed.
 *
 * Checks for an `id` attribute; if present, unmounts the zone and any
 * matching child Frame so their views are cleaned up before the DOM node
 * is detached.
 */
export function domUnmountFrames(frame: FrameObj, node: ChildNode): void {
  if (!(node instanceof Element)) return;
  const id = node.getAttribute("id");
  if (!id) return;
  frame.unmountZone(id);
  // Check if this is a child frame
  if (frame.children().includes(id)) {
    frame.unmountFrame(id);
  }
}

/**
 * Parse HTML string into a DOM element.
 * Handles special elements (table, SVG, MathML) with wrapper elements.
 */
export function domGetNode(html: string, refNode: Element): Element {
  const tmp = VDoc.createElement("div");
  const ns = refNode.namespaceURI;
  let tag: string;

  if (ns === SVG_NS) {
    tag = "svg";
  } else if (ns === MATH_NS) {
    tag = "math";
  } else {
    const match = TAG_NAME_REGEXP.exec(html);
    tag = match ? match[1] : "";
  }

  const wrap = wrapMeta[tag] || wrapMeta["_"];
  tmp.innerHTML = wrap[1] + html;

  let j = wrap[0];
  while (j--) {
    const last = tmp.lastChild;
    if (last) tmp.replaceChildren(last);
  }

  return tmp;
}

/**
 * Get compare key for a DOM node (for keyed diff).
 * Uses id or v-swifty path.
 */
export function domGetCompareKey(node: ChildNode): string | undefined {
  if (node.nodeType !== 1) return undefined;
  const el = node as DomElement;

  if (el.compareKeyCached) {
    return el.cachedCompareKey;
  }

  let key = el.autoId ? "" : el.getAttribute("id") || undefined;

  if (!key) {
    const swiftyView = el.getAttribute(SWIFTY_VIEW);
    if (swiftyView) {
      key = parseUri(swiftyView).path || undefined;
    }
  }

  el.compareKeyCached = 1;
  el.cachedCompareKey = key || "";
  return key;
}

/**
 * Special diff for form elements (value, checked, selected).
 * Form elements carry state on the DOM node (e.g. `input.value`) that isn't
 * reflected in attributes, so we have to sync those properties separately.
 */
export function domSpecialDiff(oldNode: ChildNode, newNode: ChildNode): number {
  const specials = DomSpecials[oldNode.nodeName];
  if (!specials) return 0;

  // We've matched by nodeName so both nodes are the same element type; the
  // property access (`value`/`checked`/`selected`) is intentionally untyped
  // because TS's HTMLElement union doesn't capture the per-tag overlap.
  let result = 0;

  for (const prop of specials) {
    if (Reflect.get(oldNode, prop) !== Reflect.get(newNode, prop)) {
      result = 1;
      Reflect.set(oldNode, prop, Reflect.get(newNode, prop));
    }
  }
  return result;
}

/**
 * Set attributes from new element onto old element, tracking changes in ref.
 */
export function domSetAttributes(
  oldNode: Element,
  newNode: Element,
  ref: DomRef,
  keepId?: boolean,
): void {
  // Reset compare key cache
  const oldEl = oldNode as DomElement;
  Reflect.deleteProperty(oldEl, "compareKeyCached");

  const oldAttrs = oldNode.attributes;
  const newAttrs = newNode.attributes;

  // Remove attributes not in new
  for (let i = oldAttrs.length; i--; ) {
    const name = oldAttrs[i].name;
    if (!newNode.hasAttribute(name)) {
      if (name === "id") {
        if (!keepId) {
          ref.idUpdates.push([oldNode, ""]);
        }
      } else {
        ref.hasChanged = 1;
        oldNode.removeAttribute(name);
      }
    }
  }

  // Add/update attributes from new
  for (let i = newAttrs.length; i--; ) {
    const attr = newAttrs[i];
    const key = attr.name;
    const value = attr.value;
    if (oldNode.getAttribute(key) !== value) {
      if (key === "id") {
        ref.idUpdates.push([oldNode, value]);
      } else {
        ref.hasChanged = 1;
        oldNode.setAttribute(key, value);
      }
    }
  }
}

/**
 * Set child nodes from new parent onto old parent using keyed diff algorithm.
 */
export function domSetChildNodes(
  oldParent: Element,
  newParent: Element,
  ref: DomRef,
  frame: FrameObj,
  keys_?: ReadonlySet<string>,
): void {
  let oldNode: ChildNode | null = oldParent.lastChild;
  let newNode: ChildNode | null = newParent.firstChild;
  let extra = 0;

  // Build keyed-node map from old children (bucket per key).
  // Maps used instead of plain objects so iteration / cleanup is GC-friendly
  // and string keys collide-free with built-in property names.
  const keyedNodes = new Map<string, ChildNode[]>();
  const newKeyedNodes = new Map<string, number>();

  while (oldNode) {
    extra++;
    const nodeKey = domGetCompareKey(oldNode);
    if (nodeKey) {
      let bucket = keyedNodes.get(nodeKey);
      if (!bucket) {
        bucket = [];
        keyedNodes.set(nodeKey, bucket);
      }
      bucket.push(oldNode);
    }
    oldNode = oldNode.previousSibling;
  }

  // Count new keyed nodes
  while (newNode) {
    const nodeKey = domGetCompareKey(newNode);
    if (nodeKey) {
      newKeyedNodes.set(nodeKey, (newKeyedNodes.get(nodeKey) ?? 0) + 1);
    }
    newNode = newNode.nextSibling;
  }

  // Match and diff
  newNode = newParent.firstChild;
  oldNode = oldParent.firstChild;

  while (newNode) {
    extra--;
    const tempNew = newNode;
    newNode = newNode.nextSibling;
    const nodeKey = domGetCompareKey(tempNew);
    let foundNode = nodeKey ? keyedNodes.get(nodeKey) : undefined;

    if (foundNode && (foundNode = foundNode.slice()) && foundNode.length) {
      // `foundNode.length > 0` ⇒ pop is non-undefined.
      const matched = foundNode.pop() as ChildNode;
      while (matched !== oldNode) {
        if (!oldNode) break;
        const next = oldNode.nextSibling;
        oldParent.appendChild(oldNode);
        oldNode = next;
      }
      oldNode = matched.nextSibling;
      if (nodeKey) {
        const c = newKeyedNodes.get(nodeKey);
        if (c) newKeyedNodes.set(nodeKey, c - 1);
      }
      domSetNode(matched, tempNew, oldParent, ref, frame, keys_);
    } else if (oldNode) {
      const tempOld = oldNode;
      const oldKey = domGetCompareKey(tempOld);
      if (oldKey && keyedNodes.has(oldKey) && newKeyedNodes.get(oldKey)) {
        extra++;
        ref.hasChanged = 1;
        ref.domOps.push([8, oldParent, tempNew, tempOld]);
      } else {
        oldNode = oldNode.nextSibling;
        domSetNode(tempOld, tempNew, oldParent, ref, frame, keys_);
      }
    } else {
      ref.hasChanged = 1;
      ref.domOps.push([1, oldParent, tempNew]);
    }
  }

  // Remove extra old nodes
  let tempOld: ChildNode | null = oldParent.lastChild;
  while (extra-- > 0) {
    if (tempOld) {
      domUnmountFrames(frame, tempOld);
      ref.domOps.push([2, oldParent, tempOld]);
      tempOld = tempOld.previousSibling;
      ref.hasChanged = 1;
    }
  }
}

/**
 * Diff two DOM nodes and apply changes.
 */
export function domSetNode(
  oldNode: ChildNode,
  newNode: ChildNode,
  oldParent: Element,
  ref: DomRef,
  frame: FrameObj,
  keys_?: ReadonlySet<string>,
): void {
  // Narrow once and reuse: when both nodes are Elements, use the Element-typed
  // references rather than repeated `as Element` casts.
  const oldAsEl = oldNode instanceof Element ? oldNode : null;
  const newAsEl = newNode instanceof Element ? newNode : null;

  const equalAsNodes =
    oldAsEl !== null &&
    newAsEl !== null &&
    oldAsEl.isEqualNode &&
    oldAsEl.isEqualNode(newAsEl);

  if (domSpecialDiff(oldNode, newNode) || !equalAsNodes) {
    // Same type (same nodeName and nodeType) → diff in place
    if (
      oldNode.nodeType === newNode.nodeType &&
      oldNode.nodeName === newNode.nodeName
    ) {
      if (oldAsEl !== null && newAsEl !== null) {
        const oldEl = oldAsEl;
        const newEl = newAsEl;

        // Diff attributes and children
        const newSwiftyView = newEl.getAttribute(SWIFTY_VIEW);
        let updateChildren = true;

        // If same v-swifty, keep existing view
        if (newSwiftyView) {
          const oldFrameId = oldEl.getAttribute("id") || "";
          const newViewPath = parseUri(newSwiftyView).path;
          const oldSwiftyView = oldEl.getAttribute(SWIFTY_VIEW);
          const oldViewPath = oldSwiftyView ? parseUri(oldSwiftyView).path : "";

          if (oldFrameId && newViewPath === oldViewPath) {
            updateChildren = false;
          }
        }

        domSetAttributes(oldEl, newEl, ref, !!newSwiftyView);
        if (updateChildren) {
          domSetChildNodes(oldEl, newEl, ref, frame, keys_);
        }
      } else if (oldNode.nodeValue !== newNode.nodeValue) {
        // Text or Comment node: update nodeValue
        ref.hasChanged = 1;
        oldNode.nodeValue = newNode.nodeValue;
      }
    } else {
      // Different type (e.g. DIV vs H1, element vs comment) → replace
      ref.hasChanged = 1;
      domUnmountFrames(frame, oldNode);
      ref.domOps.push([4, oldParent, newNode, oldNode]);
    }
  }
  // else: nodes are equal, no update needed
}

/**
 * Create an empty DomRef for tracking diff operations.
 */
export function createDomRef(): DomRef {
  return {
    idUpdates: [],
    domOps: [],
    hasChanged: 0,
  };
}

/**
 * Apply a batch of DOM mutation operations.
 *
 * Operations are encoded as tuples: `[opCode, parent, child?, refChild?]`.
 * - `1` → `appendChild`
 * - `2` → `removeChild`
 * - `4` → `replaceChild`
 * - `8` → `insertBefore`
 */
export function applyDomOps(ops: DomOp[]): void {
  for (const op of ops) {
    switch (op[0]) {
      case 1: // appendChild
        op[1].appendChild(op[2]);
        break;
      case 2: // removeChild
        op[1].removeChild(op[2]);
        break;
      case 4: // replaceChild
        op[1].replaceChild(op[2], op[3]);
        break;
      case 8: // insertBefore
        op[1].insertBefore(op[2], op[3]);
        break;
    }
  }
}

/**
 * Apply element ID changes deferred during the diff.
 *
 * ID updates are deferred (rather than applied inline) because changing an
 * element's ID mid-diff would invalidate `frameGetter` lookups for subsequent
 * sibling nodes.
 */
export function applyIdUpdates(updates: [Element, string][]): void {
  for (const [element, newId] of updates) {
    if (newId) {
      element.setAttribute("id", newId);
    } else {
      element.removeAttribute("id");
    }
  }
}
