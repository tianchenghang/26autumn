# Rendering Modes

swifty-mvc supports two rendering modes that determine how templates produce output and how DOM updates are applied. The choice of rendering mode affects the entire update pipeline, from template compilation to DOM mutation strategy. Both modes share the same template syntax and view setup API; the difference lies in what the compiled template function returns and how the updater reconciles old and new output.

## Overview {#overview}

The framework selects a rendering mode based on the `vdom` flag in `FrameworkConfig`:

| Mode        | Config                  | Template Output | Diff Strategy                                 |
| ----------- | ----------------------- | --------------- | --------------------------------------------- |
| String Mode | `vdom: false` (default) | HTML string     | Keyed real-DOM diff via temporary parse tree  |
| VDOM Mode   | `vdom: true` (opt-in)   | VDomNode tree   | Three-phase VDOM diff with LIS reconciliation |

The updater determines which pipeline to execute by inspecting the return type of the compiled template function. If the template returns a `string`, the string-mode path runs. If it returns a `VDomNode` object, the VDOM-mode path runs. This check happens at runtime inside `createUpdater`, so both modes can coexist in the same application if different builds produce different template outputs.

```typescript
// In updater.ts, the branching point:
const result = template(
  data,
  viewId,
  refData,
  encodeHTML,
  strSafe,
  encodeURIExtra,
  refFn,
  encodeQuote,
);

if (typeof result === "string") {
  // String rendering path
} else {
  // VDOM rendering path
}
```

## String Mode {#string-mode}

String mode is the default rendering pipeline. It is selected when `FrameworkConfig.vdom` is `false` or omitted. The compiled template function returns an HTML string, which the updater parses into a temporary DOM tree and then diffs against the live DOM using keyed comparison.

### Pipeline Overview {#string-mode-pipeline}

The string-mode update cycle proceeds through four stages:

```
Template function
  └─ Returns HTML string
       └─ domGetNode(html, node)
            └─ Parses HTML into temporary DOM tree via createHTMLDocument
                 └─ domSetChildNodes(oldParent, newParent, ref, frame, keys)
                      └─ Keyed diff: build keyedNodes Map, walk new children, reuse by key
                           └─ applyDomOps(ref.domOps)
                                └─ Applies encoded mutations to live DOM
```

### Template Produces HTML String {#string-mode-template}

In string mode, the template compiler generates a JavaScript function that concatenates HTML fragments into a single string. The function receives eight arguments: `data`, `viewId`, `refData`, `encodeHTML`, `strSafe`, `encodeURIExtra`, `refFn`, and `encodeQuote`. These encoder functions handle escaping and reference tokenization inline.

Given this template:

```html
<div class="counter">
  <h1>Count: {{=count}}</h1>
  <button @click="increment()">+1</button>
</div>
```

The compiled output is roughly:

```js
function template(
  data,
  viewId,
  refData,
  encodeHTML,
  strSafe,
  encodeURIExtra,
  refFn,
  encodeQuote,
) {
  return (
    '<div class="counter">' +
    "<h1>Count: " +
    encodeHTML(data.count) +
    "</h1>" +
    '<button @click="increment()">+1</button>' +
    "</div>"
  );
}
```

The function is pure with respect to its inputs: given the same `data` and `refData`, it always produces the same string. No DOM APIs are called during template execution.

### domGetNode: HTML Parsing {#string-mode-parse}

`domGetNode` takes the HTML string and parses it into a temporary DOM tree that lives in an off-screen document. This temporary tree serves as the "new" side of the diff.

```js
export function domGetNode(html: string, refNode: Element): Element {
  const tmp = VDoc.createElement("div")
  const ns = refNode.namespaceURI
  let tag: string

  if (ns === SVG_NS) {
    tag = "svg"
  } else if (ns === MATH_NS) {
    tag = "math"
  } else {
    const match = TAG_NAME_REGEXP.exec(html)
    tag = match ? match[1] : ""
  }

  const wrap = wrapMeta[tag] || wrapMeta["_"]
  tmp.innerHTML = wrap[1] + html

  let j = wrap[0]
  while (j--) {
    const last = tmp.lastChild
    if (last) tmp.replaceChildren(last)
  }

  return tmp
}
```

The virtual document `VDoc` is created once at module load time via `document.implementation.createHTMLDocument("")`. A `<base>` element is appended to its head so that relative URLs in parsed HTML resolve correctly against the current page location.

#### Special Element Wrapping {#special-element-wrapping}

Certain HTML elements cannot be parsed by setting `innerHTML` on a plain `<div>`. The browser's HTML parser requires them to appear inside specific parent elements. `domGetNode` handles this through a `wrapMeta` table that maps tag names to their required wrapper depth and wrapper HTML:

```js
const wrapMeta = {
  option: [1, "<select multiple>"],
  thead: [1, "<table>"],
  col: [2, "<table><colgroup>"],
  tr: [2, "<table><tbody>"],
  td: [3, "<table><tbody><tr>"],
  area: [1, "<map>"],
  param: [1, "<object>"],
  svg: [1, '<svg xmlns="...">'],
  math: [1, '<math xmlns="...">'],
  _: [0, ""],
};
```

The first element of each tuple is the wrapper depth (how many levels to unwrap after parsing), and the second is the wrapper HTML prepended before the target HTML. After `innerHTML` assignment, the code walks down `wrap[0]` levels by replacing the container's children with its last child, effectively stripping the wrapper layers.

For example, a `<tr>` element requires depth 2 with wrapper `<table><tbody>`. After parsing `<table><tbody><tr>...</tr>`, the code unwraps twice: first extracting `<tbody>`, then extracting `<tr>`.

### domSetChildNodes: Keyed Diff {#string-mode-diff}

`domSetChildNodes` performs a keyed diff between the children of the old (live) parent element and the new (temporary) parent element. The algorithm has three logical steps.

#### Step 1: Build keyedNodes Map {#build-keyed-nodes}

The function iterates all old children (from `oldParent.lastChild` backward) and builds a `Map<string, ChildNode[]>` that buckets old nodes by their compare key. A second pass over new children counts how many times each key appears in the new tree:

```js
const keyedNodes = new Map<string, ChildNode[]>()
const newKeyedNodes = new Map<string, number>()

while (oldNode) {
  extra++
  const nodeKey = domGetCompareKey(oldNode)
  if (nodeKey) {
    let bucket = keyedNodes.get(nodeKey)
    if (!bucket) {
      bucket = []
      keyedNodes.set(nodeKey, bucket)
    }
    bucket.push(oldNode)
  }
  oldNode = oldNode.previousSibling
}
```

Using a `Map` rather than a plain object avoids prototype-chain collisions and makes iteration GC-friendly.

#### Step 2: Walk New Children and Reuse by Key {#walk-and-reuse}

The function then walks new children from `newParent.firstChild` forward. For each new child:

1. Compute its compare key via `domGetCompareKey`.
2. Look up the key in `keyedNodes`. If found, pop a matching old node from the bucket.
3. If a match is found, move intervening old nodes (those between the current old cursor and the matched node) to the end of the parent via `appendChild`, then diff the matched pair in place via `domSetNode`.
4. If no match is found but an old node exists at the current position, check whether the old node's key is still needed later (present in both `keyedNodes` and `newKeyedNodes`). If so, schedule an `insertBefore` operation to make room. Otherwise, diff the old and new nodes in place.
5. If no old node exists at the current position, schedule an `appendChild` operation for the new node.

After all new children are processed, any remaining old children (tracked by the `extra` counter) are unmounted and scheduled for removal.

#### Step 3: domSetNode Recursive Diff {#dom-set-node}

`domSetNode` handles the per-node comparison between an old live DOM node and a new temporary DOM node:

- If `isEqualNode` returns `true` and no form-state special diff is needed, the node is skipped entirely. This is the fastest path: no attribute iteration, no child traversal.
- If nodes are the same type (same `nodeType` and `nodeName`), attributes are diffed via `domSetAttributes` and children are recursively diffed via `domSetChildNodes`.
- If the node hosts a sub-view (`v-swifty` attribute) and the view path has not changed, child diffing is skipped to preserve the existing sub-view instance.
- If nodes are different types (e.g., `<div>` vs `<span>`, or element vs text), a `replaceChild` operation is scheduled and the old node's sub-frames are unmounted.

### applyDomOps: Apply Mutations {#string-mode-apply}

DOM mutations are not applied inline during the diff. Instead, they are encoded as tuples and collected into `ref.domOps`. After the diff completes, `applyDomOps` executes them in order:

```js
export function applyDomOps(ops: DomOp[]): void {
  for (const op of ops) {
    switch (op[0]) {
      case 1: op[1].appendChild(op[2]); break
      case 2: op[1].removeChild(op[2]); break
      case 4: op[1].replaceChild(op[2], op[3]); break
      case 8: op[1].insertBefore(op[2], op[3]); break
    }
  }
}
```

The op codes correspond to DOM mutation methods:

| Code | Operation    | Tuple Shape                       |
| ---- | ------------ | --------------------------------- |
| 1    | appendChild  | `[1, parent, newChild]`           |
| 2    | removeChild  | `[2, parent, oldChild]`           |
| 4    | replaceChild | `[4, parent, newChild, oldChild]` |
| 8    | insertBefore | `[8, parent, newChild, refChild]` |

Deferring mutations has two benefits. First, the diff algorithm can freely reorder operations without worrying about live DOM side effects. Second, ID updates are applied separately via `applyIdUpdates` before `applyDomOps`, ensuring that Frame lookups during the diff use stable IDs.

### CompareKey Derivation {#string-mode-compare-key}

The compare key is the identity token that allows the diff algorithm to recognize the same logical node across renders. `domGetCompareKey` derives it from the DOM element:

```js
export function domGetCompareKey(node: ChildNode): string | undefined {
  if (node.nodeType !== 1) return undefined
  const el = node as DomElement

  if (el.compareKeyCached) {
    return el.cachedCompareKey
  }

  let key = el.autoId ? "" : el.getAttribute("id") || undefined

  if (!key) {
    const swiftyView = el.getAttribute(SWIFTY_VIEW)
    if (swiftyView) {
      key = parseUri(swiftyView).path || undefined
    }
  }

  el.compareKeyCached = 1
  el.cachedCompareKey = key || ""
  return key
}
```

The derivation follows a priority order:

1. `id` attribute: the most common source. If an element has `id="header"`, its compare key is `"header"`. Elements with auto-generated IDs (marked by `autoId`) are excluded.
2. `v-swifty` attribute: for sub-view host elements without an explicit `id`, the view path (extracted via `parseUri`) serves as the key. This ensures that sub-view instances are preserved across re-renders even when no `id` is assigned.
3. No key: elements without either attribute have no compare key and are diffed positionally.

The result is cached on the element via `compareKeyCached` and `cachedCompareKey` to avoid repeated `getAttribute` calls during the diff walk. The cache is invalidated by `domSetAttributes`, which deletes `compareKeyCached` before syncing attributes.

## VDOM Mode {#vdom-mode}

VDOM mode is an opt-in rendering pipeline. It is selected when `FrameworkConfig.vdom` is set to `true`. Instead of producing an HTML string, the compiled template function produces a tree of `VDomNode` objects. The updater diffs the new VDomNode tree against the previous tree using a three-phase algorithm with LIS-based reconciliation, then applies minimal DOM mutations directly.

### Pipeline Overview {#vdom-mode-pipeline}

The VDOM update cycle proceeds through three stages:

```
Template function
  └─ Returns VDomNode tree via vdomCreate
       └─ vdomSetChildNodes(realNode, lastVDom, newVDom, ref, frame, keys, view, ready)
            └─ Phase 1: Head fast-path
            └─ Phase 2: Tail fast-path
            └─ Phase 3: KeyMap + LIS reconciliation
                 └─ Direct DOM mutations via insertBefore, removeChild, replaceChild
```

### Template Produces VDomNode Tree {#vdom-mode-template}

In VDOM mode, the template compiler generates a function that calls `vdomCreate` to build a tree of `VDomNode` objects. The function receives only three arguments: `data`, `viewId`, and `refData`. The extra encoder arguments used in string mode are ignored because VDOM nodes carry raw values and handle encoding during DOM creation.

Given this template:

```html
<div class="counter">
  <h1>Count: {{=count}}</h1>
  <button @click="increment()">+1</button>
</div>
```

The compiled VDOM output is roughly:

```js
import { vdomCreate as h } from "swifty-mvc";

function template(data, viewId, refData) {
  return h("div", { class: "counter" }, [
    h("h1", null, [h(0, "Count: "), h(0, data.count)]),
    h("button", { "@click": "increment()" }, [h(0, "+1")]),
  ]);
}
```

The `vdomCreate` function accepts three calling conventions:

```js
// Text node: vdomCreate(0, "text content")
// Element:   vdomCreate("div", { class: "row" }, [child1, child2])
// Self-closing: vdomCreate("br", null, 1)
// Raw HTML:  vdomCreate(0, "<b>bold</b>", 1)
```

### VDomNode Structure {#vdom-node-structure}

A `VDomNode` is a plain object with the following properties:

```typescript
interface VDomNode {
  tag: string | number;
  html: string;
  attrs?: string;
  attrsMap?: Record<string, unknown>;
  attrsSpecials?: Record<string, string>;
  hasSpecials?: Record<string, string> | undefined;
  children?: VDomNode[] | undefined;
  compareKey?: string | undefined;
  reused?: Record<string, number> | undefined;
  reusedTotal?: number;
  views?: [string, string, string, Record<string, string>][] | undefined;
  selfClose?: boolean;
  isSwiftyView?: string | undefined;
}
```

Property semantics:

- `tag`: Element tag name (string), `0` for text nodes (`V_TEXT_NODE`), or `SPLITTER` (U+001E) for raw HTML nodes.
- `html`: Serialized inner HTML. For text nodes, this is the text content. For elements, this is the concatenation of all serialized children.
- `attrs`: Serialized opening tag string, e.g. `'<div class="row"'`. Used for fast equality checks: if both `attrs` and `html` match between old and new nodes, the entire subtree is unchanged.
- `attrsMap`: Attribute key-value pairs for diffing. Only present on element nodes.
- `attrsSpecials`: Attributes that must be set as DOM properties rather than HTML attributes (e.g., `value` on `<input>`).
- `children`: Child `VDomNode` array. Undefined for text, raw HTML, and self-closing nodes.
- `compareKey`: The identity key for keyed diff. Derived from `id`, `#` attribute, or `v-swifty` path.
- `reused`: A map of child compare keys to their occurrence count. Propagated upward from children to enable fast subtree-level key lookups.
- `views`: Sub-view reference tuples `[viewPath, owner, uri, params]` collected from `v-swifty` attributes in the subtree.
- `selfClose`: True when the node was created with `children === 1`, indicating a void element.
- `isSwiftyView`: The view path if this node hosts a sub-view via `v-swifty`.

### vdomCreate: Node Creation {#vdom-create}

`vdomCreate` processes its arguments in two passes:

Pass 1 (children): iterates the children array, serializing each child into the `innerHTML` accumulator. Adjacent text nodes are merged. Keyed children contribute to the `reused` map. Sub-view references are propagated upward into the `views` array.

Pass 2 (props): iterates the props object, handling boolean/null values, extracting the compare key from `#` or `id`, detecting `v-swifty` sub-views, and serializing each attribute into the `attrs` string.

The compare key is derived in the following priority order:

1. `#` attribute: if present, used as the compare key and removed from the props map (it has no DOM meaning).
2. `id` attribute: used as the compare key but kept in the props map (it is a valid HTML attribute).
3. `v-swifty` attribute: the parsed view path is used as the compare key, prefixed with the tag name (e.g., `"div\x1eapp/views/detail"`).

### Three-Phase Diff Algorithm {#vdom-three-phase-diff}

`vdomSetChildNodes` implements the core diff algorithm. It receives the real DOM parent element, the previous VDomNode tree (`lastVDom`), and the new VDomNode tree (`newVDom`). The algorithm proceeds in three phases.

#### Fast Path: First Render {#vdom-first-render}

When `lastVDom` is undefined (first render), the function takes a fast path: it sets `realNode.innerHTML` directly from the serialized `newVDom.html` string. This avoids creating individual DOM nodes and is the fastest way to populate an empty container.

#### Short-Circuit: HTML Equality {#vdom-html-equality}

Before entering the diff, the function checks whether `lastVDom.html === newVDom.html`. If the serialized innerHTML is identical, no DOM changes are needed and the function returns immediately. This catches the common case where data is set but has not actually changed.

#### Phase 1: Head Fast-Path {#vdom-head-fast-path}

Starting from the beginning of both old and new children arrays, the algorithm matches nodes that are identical by `isSameVDomNode`. For each matched pair, `vdomSetNode` updates the node in place without any DOM move operations:

```js
while (headIdx <= tailIdx && newHead <= newTail) {
  const oc = oldChildren[headIdx];
  const nc = newChildren[newHead];
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
```

Two nodes are considered "same" if both have matching `compareKey` values, or if neither has a `compareKey` and their `tag` values match, or if either node is a `SPLITTER` (raw HTML) node.

This phase handles the common case where the beginning of a list is stable (e.g., a header section that does not change).

#### Phase 2: Tail Fast-Path {#vdom-tail-fast-path}

After the head fast-path stalls, the algorithm attempts to match nodes from the end of the remaining ranges:

```js
while (headIdx <= tailIdx && newHead <= newTail) {
  const oc = oldChildren[tailIdx];
  const nc = newChildren[newTail];
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
```

This handles the common case where the end of a list is stable (e.g., a footer section). Together, the head and tail fast-paths handle append-only and prepend-only updates with zero DOM moves.

#### Phase 3: KeyMap with LIS {#vdom-keymap-lis}

When both fast-paths stall, the algorithm enters the general reconciliation phase.

First, it snapshots all old DOM node references before any mutations. This is critical because `childNodes` is a live NodeList that shifts as insertions and removals occur:

```js
const oldDomNodes: ChildNode[] = new Array(oldLen)
for (let i = 0; i < oldLen; i++) {
  oldDomNodes[i] = nodes[i] as ChildNode
}
```

Then it builds a `keyMap` from the remaining old children (those between `headIdx` and `tailIdx`), mapping each `compareKey` to an array of `{ domNode, vdomNode }` entries. Arrays support duplicate keys.

Next, it constructs a `sequence` array. For each remaining new child (from `newHead` to `newTail`), the sequence records the index of the matching old child in `oldChildren`, or `-1` if no match exists:

```js
for (let i = 0; i < newRemaining; i++) {
  const nc = newChildren[newHead + i];
  const cKey = nc.compareKey;
  const entries = cKey ? keyMap[cKey] : undefined;
  if (entries && entries.length > 0) {
    const entry = entries.shift();
    const oldIdx = oldChildren.indexOf(entry.vdomNode, headIdx);
    sequence[i] = oldIdx >= 0 ? oldIdx : -1;
    usedOldDomNodes.add(entry.domNode);
  } else {
    sequence[i] = -1;
  }
}
```

### computeLIS: Patience Sorting {#vdom-compute-lis}

The Longest Increasing Subsequence (LIS) of the `sequence` array identifies the largest set of old nodes that are already in the correct relative order for the new tree. Nodes at LIS positions do not need to move; all other matched nodes are relocated via `insertBefore`.

`computeLIS` uses patience sorting with binary search for O(n log n) performance:

```js
function computeLIS(sequence: number[]): number[] {
  const len = sequence.length
  if (len === 0) return []

  const result: number[] = []
  const tails: number[] = []
  const predecessors: number[] = new Array(len)
  let lisLength = 0

  for (let i = 0; i < len; i++) {
    const value = sequence[i]
    if (value < 0) continue  // skip unmatched entries

    // Binary search: find leftmost tail with value >= current value
    let lo = 0
    let hi = lisLength
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (sequence[tails[mid]] < value) lo = mid + 1
      else hi = mid
    }

    tails[lo] = i
    predecessors[i] = lo > 0 ? tails[lo - 1] : -1

    if (lo === lisLength) lisLength++
  }

  // Backtrack to reconstruct the LIS indices
  let cursor = tails[lisLength - 1]
  for (let i = lisLength - 1; i >= 0; i--) {
    result[i] = cursor
    cursor = predecessors[cursor]
  }

  return result
}
```

The algorithm maintains a `tails` array where `tails[i]` holds the index (in `sequence`) of the smallest tail value for an increasing subsequence of length `i + 1`. For each non-negative value in the sequence, a binary search finds the correct position in `tails`. The `predecessors` array records the chain for backtracking.

Entries with value `-1` (unmatched new nodes) are skipped entirely, as they have no old node to preserve.

### LIS-Based Reconciliation {#vdom-reconciliation}

After computing the LIS, the algorithm iterates backward through the remaining new children. A `lisCursor` tracks the current position in the LIS result array:

- If the current index matches the LIS cursor position, the node is part of the longest increasing subsequence. It stays in place and is updated via `vdomSetNode` without a DOM move.
- If the current index has a matching old node (sequence value >= 0) but is not in the LIS, the old DOM node is moved to the correct position via `insertBefore` and then updated.
- If the current index has no matching old node (sequence value === -1), a new DOM node is created via `vdomCreateNode` and inserted.

The backward iteration ensures that `nextNode` (the insertion anchor) always points to the correct reference node. Each processed node becomes the anchor for the next iteration:

```js
let nextNode: ChildNode | null = tailIdx + 1 < oldLen ? oldDomNodes[tailIdx + 1] : null

for (let j = newRemaining - 1; j >= 0; j--) {
  // ... LIS check, move, or create
  nextNode = processedNode
}
```

After reconciliation, any old DOM nodes not present in `usedOldDomNodes` are removed from the parent. Before removal, `domUnmountFrames` is called to clean up any child Frames and sub-views contained within the node.

### Minimizing DOM Moves {#vdom-minimizing-moves}

The LIS-based approach guarantees that the number of DOM move operations is minimized. If there are N remaining new children and the LIS has length L, at most N - L moves are needed. This is optimal: the LIS identifies the maximum set of nodes that can stay in place while all others are repositioned around them.

For example, given old children with indices `[0, 1, 2, 3, 4]` and a new order that maps to old indices `[2, 0, 3, 1, 4]`, the LIS is `[0, 3, 4]` (length 3). The algorithm moves at most 5 - 3 = 2 nodes.

### vdomSetNode: Per-Node Update {#vdom-set-node}

`vdomSetNode` handles the update of a single DOM node against a new VDomNode. It has several fast paths:

- Text nodes: if the tag is the same (both text), compare `html` strings and update `nodeValue` only if different.
- Raw HTML nodes (SPLITTER): if the HTML string changed, replace the entire DOM node.
- Element nodes with identical `attrs` and `html`: the entire subtree is unchanged. The only exception is form elements with `hasSpecials`, where `vdomSyncFormState` syncs `value`, `checked`, and `selected` properties that may have changed through user interaction.
- Tag mismatch: replace the entire DOM node via `vdomCreateNode`.

For element nodes that pass the fast-path checks, attribute diffing via `vdomSetAttributes` and recursive child diffing via `vdomSetChildNodes` are applied.

### vdomSetAttributes: Attribute Diff {#vdom-set-attributes}

`vdomSetAttributes` syncs attributes from a new VDomNode onto a real DOM element. When a `lastVDom` is provided, it first removes old attributes not present in the new node, then adds or updates new attributes:

- Normal attributes are set via `setAttribute`.
- Special attributes (those in `attrsSpecials`) are set as DOM properties via `Reflect.set`. This is necessary for form element properties like `value`, `checked`, and `selected` that do not correspond 1:1 with HTML attributes.

The function returns `1` if any attribute changed, `0` otherwise. This return value feeds into the `ref.changed` flag that determines whether `endUpdate` is called.

## When to Use Which Mode {#when-to-use}

### Use String Mode When {#use-string-mode}

String mode is the default and is the right choice for the majority of views. It performs well when:

- The view renders a moderate number of elements (tens to low hundreds).
- Updates tend to change text content or attributes rather than reorder large lists.
- The view structure is relatively stable between renders (the fast `isEqualNode` path catches unchanged subtrees).
- You want the simplest possible mental model: template in, HTML string out, DOM patched.

String mode has lower per-render overhead because it avoids constructing VDomNode objects and running the LIS algorithm. The HTML string is produced by simple string concatenation, which JavaScript engines optimize aggressively.

### Use VDOM Mode When {#use-vdom-mode}

VDOM mode is beneficial when:

- The view contains large, frequently re-ordered lists (hundreds to thousands of items).
- Items are inserted, removed, or moved in the middle of a list rather than appended or prepended.
- Fine-grained DOM reuse matters: keyed nodes with stable IDs are preserved across renders, retaining scroll position, focus state, and event listeners.
- The view has deeply nested dynamic content where the string-mode `isEqualNode` short-circuit rarely fires.

VDOM mode trades higher per-render CPU cost (VDomNode tree construction, three-phase diff, LIS computation) for fewer and more precise DOM mutations. When list reordering is common, the LIS algorithm minimizes the number of `insertBefore` calls, which are expensive for the browser's layout engine.

### Mixing Modes {#mixing-modes}

Both modes can coexist in the same application. The rendering mode is determined by the compiled template output type, not by a global flag. If your build system produces string-mode templates for some views and VDOM-mode templates for others, the updater will select the correct pipeline for each view automatically.

However, the global `vdom` flag in `FrameworkConfig` affects the template compiler's output. In practice, most applications use one mode consistently. The build-time compiler (via the Vite, Webpack, or Rspack plugin) reads the `vdom` option and generates the corresponding template function.

## Performance Characteristics {#performance}

### String Mode Performance {#string-mode-performance}

String mode has the following performance profile:

Template execution is fast. The compiled function is a series of string concatenations with inline encoding calls. JavaScript engines inline these operations effectively, and the result is a single string allocation.

HTML parsing has a cost. `domGetNode` sets `innerHTML` on a temporary element in the virtual document, which invokes the browser's HTML parser. For large templates, this parsing step is the dominant cost. However, the parser is highly optimized in all modern browsers and handles typical view templates in sub-millisecond time.

The keyed diff is O(n + m) where n is the number of old children and m is the number of new children. Building the `keyedNodes` map requires one pass over old children, and the reconciliation walk requires one pass over new children. The `isEqualNode` check provides a fast exit for unchanged subtrees.

DOM mutations are batched. All mutations are encoded as `DomOp` tuples during the diff and applied in a single pass by `applyDomOps`. This avoids layout thrashing during the diff phase.

The temporary DOM tree is garbage collected after each render. The `VDoc.createElement("div")` call creates a short-lived element that is never attached to the live document. For views that re-render frequently, this creates GC pressure proportional to the template size.

### VDOM Mode Performance {#vdom-mode-performance}

VDOM mode has a different performance profile:

Template execution allocates more. Each `vdomCreate` call produces a VDomNode object with multiple properties. For a template with 100 elements, this means 100 object allocations plus their associated arrays and maps. The GC pressure is higher than string mode, but the objects are short-lived and typically collected in the same minor GC cycle.

The three-phase diff is O(n log n) in the worst case due to the LIS computation. However, the head and tail fast-paths handle the common cases (append, prepend, stable list) in O(k) where k is the number of matching prefix/suffix nodes. The LIS computation only processes the remaining unmatched nodes.

DOM mutations are applied inline during the diff, not batched. This means each `insertBefore`, `removeChild`, or `replaceChild` call happens immediately. For small numbers of mutations, this is faster than the batch approach because it avoids the overhead of encoding and decoding operations. For very large numbers of mutations, the inline approach may cause more layout recalculations.

The VDomNode tree is retained between renders. The `lastVDom` reference is stored in the updater's closure and compared against the new tree on the next digest. This means VDOM mode uses more persistent memory than string mode, which discards the temporary DOM tree after each render.

### Comparative Summary {#comparative-summary}

| Aspect                 | String Mode                       | VDOM Mode                                 |
| ---------------------- | --------------------------------- | ----------------------------------------- |
| Template output        | HTML string                       | VDomNode tree                             |
| Parsing cost           | HTML parser via innerHTML         | Object allocation via vdomCreate          |
| Diff complexity        | O(n + m) keyed walk               | O(n log n) worst case (LIS)               |
| Fast-path coverage     | isEqualNode short-circuit         | Head/tail fast-path, attrs+html equality  |
| DOM mutations          | Batched (encoded as DomOp tuples) | Inline (applied during diff)              |
| Memory between renders | None (temporary tree discarded)   | VDomNode tree retained                    |
| GC pressure per render | Temporary DOM tree                | VDomNode objects                          |
| Best for               | Stable structure, text updates    | Large reordered lists, fine-grained reuse |
| Sub-view preservation  | v-swifty path comparison          | isSwiftyView path comparison              |

### Practical Guidance {#practical-guidance}

For most business application views, string mode is faster. The `isEqualNode` fast path catches unchanged subtrees, the HTML parser is extremely fast for typical template sizes, and there is no persistent memory overhead.

Switch to VDOM mode when profiling reveals that DOM mutation cost dominates render time. The typical trigger is a view with a sortable or filterable list of hundreds of items where reordering causes the string mode to replace large portions of the DOM instead of moving existing nodes.

Always measure before switching. The VDOM mode's higher allocation cost and retained memory can be a net negative for views that do not benefit from LIS-based reconciliation. Use browser profiling tools to compare frame times and GC frequency between modes for your specific view.
