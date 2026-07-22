/**
 * Virtual DOM Engine for Swifty MVC (VDOM-mode rendering pipeline).
 *
 * When `FrameworkConfig.vdom` is **true**, the Updater uses this engine
 * instead of the string-based real-DOM diff in `dom.ts`. The compiled template
 * produces a `VDomNode` tree (via `vdomCreate`), which is then diffed against
 * the previous tree using a three-phase algorithm with LIS-based reconciliation.
 *
 * ## Three-phase diff algorithm
 *
 * `vdomSetChildNodes` processes children in three phases:
 * 1. **Head fast-path** — match identical nodes from the start (no DOM moves)
 * 2. **Tail fast-path** — match identical nodes from the end (no DOM moves)
 * 3. **KeyMap reconciliation** — build a `compareKey → node` index, compute the
 *    Longest Increasing Subsequence (LIS) to minimize DOM moves, then insert /
 *    move / remove remaining nodes
 *
 * ## Core functions
 *
 * - `vdomCreate` — create `VDomNode` trees (compiled templates call this)
 * - `vdomSetChildNodes` — diff old and new VDOM trees, apply DOM mutations
 * - `vdomCreateNode` — convert a `VDomNode` to a real DOM node
 * - `vdomSetAttributes` — diff attributes between two `VDomNode`s
 * - `createVDomRef` — create a diff operation tracker
 */
import {
  SPLITTER,
  V_TEXT_NODE,
  VDOM_NS_MAP,
  SWIFTY_VIEW,
  encodeHTML,
} from "./common";
import { parseUri, hasOwnProperty, callFunction } from "./utils";
import { domUnmountFrames } from "./dom";
import type { VDomNode, VDomRef, FrameObj, ViewCtx } from "./types";

// ============================================================
// Constants
// ============================================================

/** Special element properties synced as DOM properties (not attributes) */
const DOM_SPECIALS: Record<string, string[]> = {
  INPUT: ["value", "checked"],
  TEXTAREA: ["value"],
  OPTION: ["selected"],
};

// ============================================================
// vdomCreate — VNode creation
// ============================================================

/**
 * Create a virtual DOM node.
 *
 * Text node: `vdomCreate(0, 'text content')`
 * Element: `vdomCreate('div', { class: 'row' }, [child1, child2])`
 * Self-closing: `vdomCreate('br', null, 1)`
 * Raw HTML: `vdomCreate(0, '<b>bold</b>', 1)` (children truthy → raw HTML node)
 * Root: `vdomCreate(viewId, 0, [children])`
 */
export function vdomCreate(
  tag: string | number,
  props?: Record<string, unknown> | string | number | null,
  children?: VDomNode[] | string | number | null,
  specials?: Record<string, string>,
): VDomNode {
  // ── Text / raw-HTML node ──
  if (!tag) {
    return {
      tag: children ? SPLITTER : V_TEXT_NODE,
      html: String(props ?? ""),
    };
  }

  // ── Element node ──
  const propsObj: Record<string, unknown> =
    typeof props === "object" && props !== null ? props : {};
  const specialsObj = specials || {};
  const unary = children === 1;

  let compareKey: string | undefined;
  let innerHTML = "";
  let newChildren: VDomNode[] | undefined;
  let reused: Record<string, number> | undefined;
  let reusedTotal = 0;
  let viewList: VDomNode["views"];
  let isSwiftyView: string | undefined;
  let attrs = `<${tag}`;
  let hasSpecials: Record<string, string> | undefined;
  let prevChild: VDomNode | undefined;

  // 1. Process children array
  if (children && children !== 1) {
    for (const c of children as VDomNode[]) {
      if (c.attrs !== undefined) {
        // Element child: serialize as opening tag + innerHTML + closing tag
        innerHTML += c.attrs + (c.selfClose ? "/>" : `>${c.html}</${c.tag}>`);
      } else {
        // Text or raw-HTML child
        if (c.tag === V_TEXT_NODE) {
          innerHTML += encodeHTML(c.html);
        } else {
          innerHTML += c.html;
        }
      }

      // Merge adjacent text nodes
      if (c.tag === V_TEXT_NODE && prevChild && prevChild.tag === V_TEXT_NODE) {
        prevChild.html += c.html;
      } else {
        if (!newChildren) newChildren = [];
        newChildren.push(c);
        prevChild = c;
      }

      // Collect reused keys
      if (c.compareKey) {
        if (!reused) reused = {};
        reused[c.compareKey] = (reused[c.compareKey] || 0) + 1;
        reusedTotal++;
      }

      // Propagate nested reused keys upward
      if (c.reused) {
        if (!reused) reused = {};
        for (const key in c.reused) {
          reused[key] = (reused[key] || 0) + c.reused[key];
          reusedTotal += c.reused[key];
        }
      }

      // Propagate sub-view references
      if (c.views) {
        if (!viewList) viewList = [];
        viewList.push(...c.views);
      }
    }
  }

  // 2. Process props
  hasSpecials = specials || undefined;

  for (const prop in propsObj) {
    let value = propsObj[prop];

    // Boolean / null handling
    if (value === false || value == null) {
      if (!specialsObj[prop]) {
        delete propsObj[prop];
      }
      continue;
    } else if (value === true) {
      propsObj[prop] = value = specialsObj[prop] ? value : "";
    }

    // Compare key candidates: #, id
    if ((prop === "#" || prop === "id") && !compareKey) {
      compareKey = value as string;
      if (prop !== "id") {
        delete propsObj[prop];
        continue;
      }
    }

    // v-swifty sub-view detection
    if (prop === SWIFTY_VIEW && value) {
      const parsed = parseUri(value as string);
      isSwiftyView = parsed.path;
      if (!viewList) viewList = [];
      viewList.push([
        isSwiftyView,
        propsObj["swifty-owner"] as string,
        value as string,
        parsed.params,
      ]);
      if (!compareKey) {
        compareKey = tag + SPLITTER + isSwiftyView;
      }
    }

    // View params key
    // textarea value: write as innerHTML, not as attribute
    if (prop === "value" && tag === "textarea") {
      innerHTML = String(value);
      delete propsObj[prop];
      continue;
    }

    // Serialize attribute
    attrs += ` ${prop}="${value && encodeHTML(value)}"`;
  }

  return {
    tag,
    html: innerHTML,
    attrs,
    attrsMap: propsObj,
    attrsSpecials: specialsObj,
    hasSpecials,
    children: newChildren,
    compareKey,
    reused,
    reusedTotal,
    views: viewList,
    selfClose: unary,
    isSwiftyView,
  };
}

// ============================================================
// isSameVDomNode — Node matching predicate
// ============================================================

/**
 * Determine whether two VDomNodes represent the same logical node.
 *
 * Two nodes are "same" if:
 * 1. Both have compareKey and keys match, OR
 * 2. Neither has compareKey and tags match, OR
 * 3. Either node is a SPLITTER (raw HTML) node
 */
function isSameVDomNode(a: VDomNode, b: VDomNode): boolean {
  return (
    (a.compareKey && b.compareKey === a.compareKey) ||
    (!a.compareKey && !b.compareKey && a.tag === b.tag) ||
    a.tag === SPLITTER ||
    b.tag === SPLITTER
  );
}

// ============================================================
// vdomCreateNode — Convert VDomNode to real DOM
// ============================================================

/**
 * Create a real DOM node from a VDomNode.
 *
 * Text node → `document.createTextNode(html)`
 * Element → `createElementNS` + `vdomSetAttributes` + `innerHTML`
 */
export function vdomCreateNode(
  vnode: VDomNode,
  owner: Element,
  ref: VDomRef,
): ChildNode {
  const tag = vnode.tag;
  if (tag === V_TEXT_NODE) {
    return document.createTextNode(vnode.html);
  }

  if (tag === SPLITTER) {
    // Raw HTML node: parse via <template> to avoid the InvalidCharacterError
    // that createElementNS(ns, "\x1e") would throw — SPLITTER is U+001E,
    // which is not a valid XML QName localName.
    //
    // The <template> element parses HTML in a namespace-agnostic way,
    // matching string-mode innerHTML semantics so {{!rawHtml}} renders
    // identically in both string and VDOM modes.
    //
    // Returns the first child node; if the raw HTML is empty or produces no
    // nodes, falls back to an empty text node to keep the ChildNode return
    // contract. Multi-top-level-node raw HTML only renders the first node —
    // a known limitation of the single-ChildNode return type.
    const template = document.createElement("template");
    template.innerHTML = vnode.html;
    return template.content.firstChild || document.createTextNode("");
  }

  const sTag = typeof tag === "string" ? tag : tag.toString();
  const ns = VDOM_NS_MAP[sTag] || owner.namespaceURI;
  const el = document.createElementNS(ns, sTag);
  vdomSetAttributes(el, vnode, ref);
  el.innerHTML = vnode.html;
  return el;
}

// ============================================================
// vdomSetAttributes — Attribute diff
// ============================================================

/**
 * Set/update attributes on a real DOM element from a VDomNode.
 *
 * If `lastVDom` is provided, removes old attributes not present in new.
 * Special attributes are set as DOM properties; others via setAttribute.
 *
 * Returns 1 if any attribute changed, 0 otherwise.
 */
export function vdomSetAttributes(
  realNode: Element,
  newVDom: VDomNode,
  ref: VDomRef,
  lastVDom?: VDomNode,
): number {
  let changed = 0;
  const nMap = newVDom.attrsMap || {};
  const nsMap = newVDom.attrsSpecials || {};

  if (lastVDom) {
    const oMap = lastVDom.attrsMap || {};
    const osMap = lastVDom.attrsSpecials || {};

    // Remove old attributes not in new
    for (const key in oMap) {
      if (!hasOwnProperty(nMap, key)) {
        changed = 1;
        const sValue = osMap[key];
        if (sValue) {
          if (ref) {
            ref.nodeProps.push([realNode, sValue, ""]);
          } else {
            Reflect.set(realNode, sValue, "");
          }
        } else {
          realNode.removeAttribute(key);
        }
      }
    }
  }

  // Add/update new attributes
  for (const key in nMap) {
    const value = nMap[key];
    const sKey = nsMap[key];

    if (sKey) {
      // Special: set as DOM property — compare against DOM real-time value
      // to detect user-interaction changes (e.g., typing in input)
      if (Reflect.get(realNode, sKey) !== value) {
        changed = 1;
        if (ref) {
          ref.nodeProps.push([realNode, sKey, value]);
        } else {
          Reflect.set(realNode, sKey, value);
        }
      }
    } else {
      // Normal: set as attribute
      const oldMap = lastVDom?.attrsMap;
      if (!oldMap || oldMap[key] !== value) {
        changed = 1;
        realNode.setAttribute(key, String(value ?? ""));
      }
    }
  }

  return changed;
}

// ============================================================
// vdomSyncFormState — Form element state sync
// ============================================================

/**
 * Sync form element state properties (value, checked, selected)
 * directly from the VDomNode's attrsMap to the real DOM element.
 *
 * These properties carry DOM state not reflected in HTML attributes
 * (e.g., user-typed input value vs. the `value` attribute).
 *
 * Replaces the old vdomSpecialDiff approach which created a throwaway
 * DOM element via vdomCreateNode — that called setAttribute for ALL
 * attributes (including @event names) on the throwaway, causing
 * InvalidCharacterError in browsers with strict XML Name validation.
 */
function vdomSyncFormState(realNode: ChildNode, newVDom: VDomNode): number {
  const specials = DOM_SPECIALS[realNode.nodeName];
  if (!specials) return 0;

  const nMap = newVDom.attrsMap || {};
  let result = 0;

  for (const prop of specials) {
    const newVal = nMap[prop];
    if (newVal !== undefined && Reflect.get(realNode, prop) !== newVal) {
      result = 1;
      Reflect.set(realNode, prop, newVal);
    }
  }
  return result;
}

// ============================================================
// vdomSetNode — Per-node update
// ============================================================

/**
 * Diff and update a single DOM node against a new VDomNode.
 *
 * Handles text updates, attribute diffing, static key short-circuit,
 * sub-view preservation, recursive child diff, and tag mismatch replacement.
 */
function vdomSetNode(
  realNode: ChildNode,
  oldParent: Element,
  lastVDom: VDomNode,
  newVDom: VDomNode,
  ref: VDomRef,
  frame: FrameObj,
  keys: ReadonlySet<string>,
  rootView: ViewCtx,
  ready: () => void,
): void {
  // Text/raw-HTML nodes: if tags differ between text and raw, just replace
  const lastTag = lastVDom.tag;
  const newTag = newVDom.tag;

  if (lastTag === V_TEXT_NODE || newTag === V_TEXT_NODE) {
    // Text node update
    if (lastTag === newTag) {
      if (lastVDom.html !== newVDom.html) {
        ref.changed = 1;
        realNode.nodeValue = newVDom.html;
      }
    } else {
      // Tag mismatch: replace
      ref.changed = 1;
      domUnmountFrames(frame, realNode);
      oldParent.replaceChild(vdomCreateNode(newVDom, oldParent, ref), realNode);
    }
    return;
  }

  // Element nodes
  if (lastTag === newTag) {
    // ── SPLITTER (raw HTML) nodes: no attrs or children to diff ──
    // When the raw HTML content differs, replace the entire DOM node via
    // vdomCreateNode (which parses the new HTML via <template>). The
    // general attrs+html short-circuit and attribute-diff paths below are
    // no-ops for SPLITTER (attrsMap is undefined), so without this branch
    // the DOM would silently fail to update when raw HTML changes.
    if (newTag === SPLITTER) {
      if (lastVDom.html !== newVDom.html) {
        ref.changed = 1;
        domUnmountFrames(frame, realNode);
        oldParent.replaceChild(
          vdomCreateNode(newVDom, oldParent, ref),
          realNode,
        );
      }
      return;
    }

    // ── Fast path: attrs + html equality short-circuit ──
    // When both the serialized opening tag (attrs) and serialized innerHTML
    // (html) are identical, neither attributes nor children changed.
    // This avoids the O(children) recursive diff and attribute iteration.
    //
    // The only exception is form elements with DOM property bindings
    // (hasSpecials): user interaction may have changed value/checked/selected
    // independently of the template output, so we still sync form state.
    if (lastVDom.attrs === newVDom.attrs && lastVDom.html === newVDom.html) {
      if (newVDom.hasSpecials) {
        vdomSyncFormState(realNode, newVDom);
      }
      return;
    }

    // Attribute diff
    let attrChanged = 0;
    if (lastVDom.attrs !== newVDom.attrs || newVDom.hasSpecials) {
      attrChanged = vdomSetAttributes(
        realNode as Element,
        newVDom,
        ref,
        lastVDom,
      );
      if (attrChanged) ref.changed = 1;
    }

    // Sub-view handling
    let updateChildren = true;
    if (newVDom.isSwiftyView) {
      const oldFrameId = (realNode as Element).getAttribute("id") || "";
      const newViewPath = newVDom.isSwiftyView;
      const oldViewPath = lastVDom.isSwiftyView || "";

      if (oldFrameId && newViewPath === oldViewPath) {
        // Same view: preserve existing sub-view
        updateChildren = false;
      }
    }

    // Form element special diff: sync value/checked/selected directly
    // from VDomNode.attrsMap to avoid creating a throwaway DOM element
    // (which would call setAttribute for @event attributes and throw).
    vdomSyncFormState(realNode, newVDom);

    // Recursive child diff
    if (updateChildren && !newVDom.selfClose) {
      vdomSetChildNodes(
        realNode as Element,
        lastVDom,
        newVDom,
        ref,
        frame,
        keys,
        rootView,
        ready,
      );
    }
  } else {
    // Tag mismatch: replace entire node
    ref.changed = 1;
    domUnmountFrames(frame, realNode);
    oldParent.replaceChild(vdomCreateNode(newVDom, oldParent, ref), realNode);
  }
}

// ============================================================
// computeLIS — Longest Increasing Subsequence
// ============================================================

/**
 * Compute the Longest Increasing Subsequence (LIS) of non-negative values.
 *
 * Uses patience sorting with binary search for O(n log n) performance.
 * Returns indices (into the input array) that form the LIS.
 * Entries with value < 0 (sentinel for "unmatched") are skipped.
 *
 * Example: sequence = [2, -1, 0, 3] → LIS values = [2, 3], returns [0, 3]
 *
 * Used in Phase 3 of the diff to minimize DOM move operations:
 * nodes at LIS positions stay in place; all others are moved via insertBefore.
 */
function computeLIS(sequence: number[]): number[] {
  const len = sequence.length;
  if (len === 0) return [];

  const result: number[] = [];
  const tails: number[] = []; // tails[i] = index in sequence with smallest tail value for LIS of length i+1
  const predecessors: number[] = new Array(len);
  let lisLength = 0;

  for (let i = 0; i < len; i++) {
    const value = sequence[i];
    if (value < 0) continue; // skip unmatched entries

    // Binary search: find leftmost tail with value >= current value
    let lo = 0;
    let hi = lisLength;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sequence[tails[mid]] < value) lo = mid + 1;
      else hi = mid;
    }

    tails[lo] = i;
    predecessors[i] = lo > 0 ? tails[lo - 1] : -1;

    if (lo === lisLength) lisLength++;
  }

  // Backtrack to reconstruct the LIS indices
  let cursor = tails[lisLength - 1];
  for (let i = lisLength - 1; i >= 0; i--) {
    result[i] = cursor;
    cursor = predecessors[cursor];
  }

  return result;
}

// ============================================================
// vdomSetChildNodes — Three-phase diff
// ============================================================

/**
 * Diff children of a real DOM parent against old and new VDOM trees.
 *
 * Three-phase algorithm:
 * 1. Head fast-path: match identical nodes from the start
 * 2. Tail fast-path: match identical nodes from the end
 * 3. KeyMap reconciliation: build key→node index, process remaining children
 *
 * Old DOM node references are snapshotted before any mutations to ensure
 * correct removal regardless of DOM position shifts.
 *
 * Fast path: on first render (lastVDom undefined), sets innerHTML directly.
 */
export function vdomSetChildNodes(
  realNode: Element,
  lastVDom: VDomNode | undefined,
  newVDom: VDomNode,
  ref: VDomRef,
  frame: FrameObj,
  keys: ReadonlySet<string>,
  view: ViewCtx,
  ready: () => void,
): void {
  // Fast path: first render
  if (!lastVDom) {
    ref.changed = 1;
    realNode.innerHTML = newVDom.html;
    callFunction(ready, []);
    return;
  }

  // Short-circuit when HTML is identical.
  // Avoids the full diff loop for no-op re-renders (data set but unchanged).
  if (lastVDom.html === newVDom.html) {
    callFunction(ready, []);
    return;
  }

  const oldChildren = lastVDom.children;
  const newChildren = newVDom.children;
  const oldLen = oldChildren?.length || 0;
  const newLen = newChildren?.length || 0;

  // Both empty: nothing to do
  if (oldLen === 0 && newLen === 0) {
    callFunction(ready, []);
    return;
  }

  const nodes = realNode.childNodes;

  // ── Snapshot all old DOM node references BEFORE any mutations. ──
  // This ensures we always know which DOM nodes belong to the old children,
  // regardless of how insertBefore/removeChild reshuffles the NodeList.
  const oldDomNodes: ChildNode[] = new Array(oldLen);
  for (let i = 0; i < oldLen; i++) {
    oldDomNodes[i] = nodes[i] as ChildNode;
  }

  // Track which old DOM nodes are reused (to remove unused ones later)
  const usedOldDomNodes = new Set<ChildNode>();

  let headIdx = 0;
  let tailIdx = oldLen - 1;
  let newHead = 0;
  let newTail = newLen - 1;

  // ── Phase 1: Head fast-path ──
  // Match identical nodes from the start. No DOM moves — only in-place updates.
  while (headIdx <= tailIdx && newHead <= newTail) {
    const oc = oldChildren![headIdx];
    const nc = newChildren![newHead];
    if (!isSameVDomNode(nc, oc)) break;
    if (nc.tag === SPLITTER || oc.tag === SPLITTER) break;

    vdomSetNode(
      oldDomNodes[headIdx],
      realNode,
      oc,
      nc,
      ref,
      frame,
      keys,
      view,
      ready,
    );
    usedOldDomNodes.add(oldDomNodes[headIdx]);
    headIdx++;
    newHead++;
  }

  // ── Phase 2: Tail fast-path ──
  // Match identical nodes from the end. No DOM moves — only in-place updates.
  while (headIdx <= tailIdx && newHead <= newTail) {
    const oc = oldChildren![tailIdx];
    const nc = newChildren![newTail];
    if (!isSameVDomNode(nc, oc)) break;
    if (nc.tag === SPLITTER || oc.tag === SPLITTER) break;

    vdomSetNode(
      oldDomNodes[tailIdx],
      realNode,
      oc,
      nc,
      ref,
      frame,
      keys,
      view,
      ready,
    );
    usedOldDomNodes.add(oldDomNodes[tailIdx]);
    tailIdx--;
    newTail--;
  }

  // All matched? Early exit
  if (headIdx > tailIdx && newHead > newTail) {
    if (ref.asyncCount === 0) callFunction(ready, []);
    return;
  }

  // ── Phase 3: Build keyMap from remaining old children ──
  // Maps compareKey → [{ domNode, vdomNode }] for keyed lookup.
  // Duplicate keys are stored as arrays to support repeated keys.
  const keyMap: Record<
    string,
    Array<{ domNode: ChildNode; vdomNode: VDomNode }>
  > = {};
  for (let i = headIdx; i <= tailIdx; i++) {
    const c = oldChildren![i];
    if (c?.compareKey) {
      if (!keyMap[c.compareKey]) keyMap[c.compareKey] = [];
      keyMap[c.compareKey].push({ domNode: oldDomNodes[i], vdomNode: c });
    }
  }

  // ── Build sequence[]: for each remaining new child, the old index (or -1) ──
  // sequence[j - newHead] = index in oldChildren of the matching old node.
  // -1 means no matching old node (must create new).
  const newRemaining = newTail - newHead + 1;
  const sequence: number[] = new Array(newRemaining);

  for (let i = 0; i < newRemaining; i++) {
    const nc = newChildren![newHead + i];
    const cKey = nc.compareKey;
    const entries = cKey ? keyMap[cKey] : undefined;
    if (entries && entries.length > 0) {
      const entry = entries.shift()!;
      if (entries.length === 0) delete keyMap[cKey!];
      // Map the old child's index within the remaining range [headIdx, tailIdx]
      const oldIdx = oldChildren!.indexOf(entry.vdomNode, headIdx);
      sequence[i] = oldIdx >= 0 ? oldIdx : -1;
      usedOldDomNodes.add(entry.domNode);
    } else {
      sequence[i] = -1;
    }
  }

  // ── Short-circuit: all new children matched, only old nodes remain ──
  // Unmount remaining old DOM nodes and return.
  if (newHead > newTail) {
    for (let i = 0; i < oldLen; i++) {
      const domNode = oldDomNodes[i];
      if (
        domNode &&
        !usedOldDomNodes.has(domNode) &&
        domNode.parentNode === realNode
      ) {
        domUnmountFrames(frame, domNode);
        ref.changed = 1;
        realNode.removeChild(domNode);
      }
    }
    if (ref.asyncCount === 0) callFunction(ready, []);
    return;
  }

  // ── Short-circuit: all old children consumed, only new nodes remain ──
  // Insert all remaining new nodes before the tail anchor.
  if (headIdx > tailIdx) {
    const insertRef: ChildNode | null =
      tailIdx < oldLen ? (oldDomNodes[tailIdx + 1] ?? null) : null;
    for (let i = newHead; i <= newTail; i++) {
      ref.changed = 1;
      const newNode = vdomCreateNode(newChildren![i], realNode, ref);
      realNode.insertBefore(newNode, insertRef);
    }
    if (ref.asyncCount === 0) callFunction(ready, []);
    return;
  }

  // ── LIS-based reconciliation ──
  // Compute LIS of old indices in sequence[]. Nodes at LIS positions stay
  // in place (their relative order in the DOM already matches the new order).
  // All other matched nodes are moved; unmatched nodes (sequence[i] === -1)
  // are created fresh.
  //
  // This minimizes DOM move operations: if LIS length is L and there are N
  // remaining new children, at most N - L moves are needed.
  const lis = computeLIS(sequence);
  let lisCursor = lis.length - 1;

  // Iterate backward through remaining new children.
  // `nextNode` is always the correct insertion anchor: the DOM node that
  // should come immediately after the current position. By iterating
  // right-to-left, each processed node becomes the anchor for the next.
  let nextNode: ChildNode | null =
    tailIdx + 1 < oldLen ? oldDomNodes[tailIdx + 1] : null;

  for (let j = newRemaining - 1; j >= 0; j--) {
    const newIdx = newHead + j;
    const nc = newChildren![newIdx];

    if (lisCursor >= 0 && lis[lisCursor] === j) {
      // Node at this position is in the LIS — already in correct relative
      // order. Update in place without DOM move.
      const oldIdx = sequence[j];
      vdomSetNode(
        oldDomNodes[oldIdx],
        realNode,
        oldChildren![oldIdx],
        nc,
        ref,
        frame,
        keys,
        view,
        ready,
      );
      nextNode = oldDomNodes[oldIdx];
      lisCursor--;
    } else if (sequence[j] >= 0) {
      // Matched old node not in LIS — move to correct position.
      const oldIdx = sequence[j];
      ref.changed = 1;
      realNode.insertBefore(oldDomNodes[oldIdx], nextNode);
      vdomSetNode(
        oldDomNodes[oldIdx],
        realNode,
        oldChildren![oldIdx],
        nc,
        ref,
        frame,
        keys,
        view,
        ready,
      );
      nextNode = oldDomNodes[oldIdx];
    } else {
      // New node with no matching old node — create and insert.
      ref.changed = 1;
      const newNode = vdomCreateNode(nc, realNode, ref);
      realNode.insertBefore(newNode, nextNode);
      nextNode = newNode;
    }
  }

  // ── Remove unused old DOM nodes ──
  // Uses the snapshot references, not live NodeList positions.
  for (let i = 0; i < oldLen; i++) {
    const domNode = oldDomNodes[i];
    if (
      domNode &&
      !usedOldDomNodes.has(domNode) &&
      domNode.parentNode === realNode
    ) {
      domUnmountFrames(frame, domNode);
      ref.changed = 1;
      realNode.removeChild(domNode);
    }
  }

  // P2 #7: Defer the ready callback to the scheduler queue.
  // DOM operations above are synchronous (fast), but the ready callback
  // (which triggers endUpdate, nodeProps, and sub-view re-renders) is
  // deferred so the browser can process events and paint between the
  // DOM mutations and post-processing. This prevents long tasks from
  // blocking user interaction during large updates.
  if (ref.asyncCount === 0) {
    callFunction(ready, []);
  }
}

// ============================================================
// createVDomRef — Create diff operation tracker
// ============================================================

/**
 * Create an empty VDomRef for tracking diff operations.
 */
export function createVDomRef(viewId: string): VDomRef {
  return {
    viewId,
    nodeProps: [],
    asyncCount: 0,
    changed: 0,
  };
}
