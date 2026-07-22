---
title: Rendering Engine
description: Deep dive into the string-mode DOM diff and VDOM-mode LIS reconciliation engines.
---

# Rendering Engine {#rendering-engine}

Swifty MVC ships with two rendering engines that share the same template syntax but differ in how they reconcile DOM updates. The choice between them is a single configuration flag.

## String mode (default) {#string-mode}

In string mode, compiled templates return HTML strings. The `dom.ts` module handles parsing, diffing, and applying mutations to the real DOM.

### How it works {#string-mode-flow}

```
1. Template function returns HTML string
2. domGetNode() parses the string into a detached DOM tree
3. domSetChildNodes() walks old and new trees in parallel
4. Keyed nodes are matched, moved, or created
5. Attributes are diffed and applied
6. Form element state (value, checked, selected) is synced directly
7. Encoded DOM operations are applied in batch
```

### Node parsing {#node-parsing}

`domGetNode(html, refNode)` converts an HTML string into a real DOM node:

- Standard elements are parsed via `document.implementation.createHTMLDocument()` and `innerHTML`
- Special elements (table rows, select options, SVG, MathML) use wrapper elements to avoid parsing quirks:

```ts
// <tr> must be parsed inside <table><tbody>
// <option> must be parsed inside <select>
// <svg> elements need createElementNS
```

After parsing, the wrapper is stripped and the target node is extracted.

### Keyed diffing {#keyed-diff}

`domSetChildNodes` performs a keyed reconciliation of child nodes:

1. Build a `keyedNodes` Map from the old children. Each child's key is derived from:
   - Its `id` attribute (if present)
   - Its `v-swifty` attribute value (for embedded child frames)
   - If neither is present, the compare key is an empty string (no position fallback)
2. Walk the new children in order
3. For each new child, look up the matching old child by key
4. If found, diff in place (attributes, text content, children)
5. If not found, create a new DOM node
6. Unmatched old nodes are moved to the end
7. Extra old nodes are removed (with Frame cleanup for `v-swifty` elements)

### DOM operation batching {#dom-batching}

Mutations are encoded as operation tuples during the diff walk and applied in a single pass at the end:

| Code | Operation      | Arguments                    |
| ---- | -------------- | ---------------------------- |
| 1    | `appendChild`  | `[parent, child]`            |
| 2    | `removeChild`  | `[parent, child]`            |
| 4    | `replaceChild` | `[parent, newNode, oldNode]` |
| 8    | `insertBefore` | `[parent, newNode, refNode]` |

Batching minimizes layout thrashing by separating reads (the diff walk) from writes (the mutation pass).

### Attribute diffing {#attribute-diff}

`domSetAttributes` compares old and new attribute maps:

- New attributes not in old: set via `setAttribute`
- Old attributes not in new: remove via `removeAttribute`
- Changed attributes: update via `setAttribute`
- The `id` attribute is deferred to avoid interfering with keyed lookups during the diff

### Form element handling {#form-elements}

The `domSpecialDiff` function synchronizes form element state directly on DOM properties rather than attributes:

```ts
// For <input>:
element.value = newValue; // preserves cursor position
element.checked = newChecked; // preserves user interaction state

// For <textarea>:
element.value = newValue;
```

This is critical because setting `value` via `setAttribute` would reset the cursor position, and setting `checked` via `setAttribute` does not reflect the actual checked state.

### Frame cleanup on removal {#frame-cleanup}

When a keyed node with a `v-swifty` attribute is removed during diffing, the framework must unmount the child Frame:

```ts
// domUnmountFrames walks the removed DOM subtree,
// finds all v-swifty elements, and calls frame.unmountFrame()
// for each one. This ensures proper view lifecycle.
```

## VDOM mode {#vdom-mode}

VDOM mode compiles templates to functions that return virtual DOM node trees. The `vdom.ts` module performs a three-phase diffing algorithm with LIS reconciliation.

### VDomNode structure {#vdom-node}

```ts
interface VDomNode {
  tag: string | number; // element tag name, or 0 for text, or SPLITTER for raw HTML
  html: string; // serialized tree representation for short-circuit comparison
  attrs?: string; // serialized attributes string
  attrsMap?: Record<string, unknown>; // parsed attribute key-value pairs
  attrsSpecials?: Record<string, string>; // attributes requiring special DOM property handling
  children?: VDomNode[]; // child nodes
  compareKey?: string; // key for keyed reconciliation (from id or v-swifty attribute)
  reused?: Record<string, number>; // reuse tracking for optimization
  views?: [string, string, string, Record<string, string>][]; // embedded child view descriptors
  selfClose?: boolean; // self-closing element marker
  isSwiftyView?: string; // marks element as a child Frame mount point
}
```

Creating nodes:

```ts
vdomCreate("div", { class: "row" }, [child1, child2]);
vdomCreate(0, "text content"); // text node
vdomCreate("br", null, 1); // self-closing
vdomCreate(0, "<b>bold</b>", 1); // raw HTML (tag = SPLITTER)
vdomCreate(viewId, 0, [children]); // root node
```

### Three-phase diff {#three-phase-diff}

`vdomSetChildNodes` reconciles old and new VDomNode arrays in three phases:

#### Phase 1: Head fast-path {#head-fast-path}

Walk from the start of both arrays. While nodes at the same index have matching keys, diff them in place and advance. No DOM moves are needed:

```
Old: [A, B, C, D, E]
New: [A, B, X, D, E]
      ^  ^           <- matched, diff in place
```

#### Phase 2: Tail fast-path {#tail-fast-path}

Walk from the end of both arrays (backward from where Phase 1 stopped). While nodes match, diff in place:

```
Old: [A, B, C, D, E]
New: [A, B, X, D, E]
               ^  ^  <- matched from tail
```

#### Phase 3: KeyMap reconciliation with LIS {#keymap-lis}

For the remaining unmatched middle section:

1. Build a `compareKey -> [VDomNode]` index from the old nodes
2. Map each new node to its old counterpart (or null if new)
3. Compute the Longest Increasing Subsequence (LIS) of old indices in the new order
4. Nodes in the LIS stay in place — they are already in the correct relative order
5. Nodes not in the LIS are moved via `insertBefore` or created via `vdomCreateNode`

The LIS is computed using patience sorting with binary search, achieving O(n log n) complexity.

### LIS algorithm {#lis-algorithm}

The LIS (Longest Increasing Subsequence) identifies the maximum set of nodes that are already in the correct relative order. These nodes do not need to be moved:

```
Old order: [A(0), B(1), C(2), D(3), E(4)]
New order: [B, D, A, E, C]

Old indices in new order: [1, 3, 0, 4, 2]
LIS: [1, 3, 4] (B, D, E)
These three stay in place. A and C are moved.
```

### Short-circuit optimization {#short-circuit}

Before any diffing occurs, VDOM mode checks if the entire template output is identical:

```ts
if (lastVDom.html === newVDom.html) {
  // Skip diff entirely — nothing changed
  return;
}
```

The `html` property stores a serialized representation of the VDomNode tree. For views that re-render with the same data (e.g., when State changes but the view's specific data did not), this check avoids all diff work.

### Node creation {#vdom-create-node}

`vdomCreateNode` converts a VDomNode to a real DOM element:

- Text nodes: `document.createTextNode(text)`
- Raw HTML: parsed via `<template>` element's `content` property
- Regular elements: `document.createElementNS` (for SVG) or `document.createElement`
- Children are recursively created and appended
- Attributes are set via `vdomSetAttributes`

### Snapshot before mutation {#snapshot}

Before applying DOM mutations, the algorithm snapshots all old DOM node references. This is necessary because the DOM is a live structure — moving a node changes its position in parent's `childNodes` NodeList, which would corrupt the diff algorithm's index calculations.

## Choosing a rendering mode {#choosing-mode}

| Consideration         | String mode                          | VDOM mode                               |
| --------------------- | ------------------------------------ | --------------------------------------- |
| Bundle size           | Smaller (no VDomNode creation)       | Slightly larger                         |
| Memory                | HTML strings are transient           | VDomNode trees held in memory           |
| Diff precision        | Keyed node matching                  | LIS-optimal move minimization           |
| Large list reordering | O(n) key lookup                      | O(n log n) LIS, fewer DOM moves         |
| Simple updates        | Fast (innerHTML-style)               | Short-circuit check skips diff          |
| Best for              | Content-heavy pages, few reorderings | Interactive lists, frequent reorderings |

Enable VDOM mode:

```ts
Framework.boot({ vdom: true });
// or in the bundler plugin:
swiftyMvcPlugin({ vdom: true });
```

## Next steps {#next-steps}

- [Bundler Integration](/docs/en/swifty-mvc/guide/advanced/bundler-integration) — compiler options and plugin configuration
- [HMR](/docs/en/swifty-mvc/guide/advanced/hmr) — hot module replacement for views and templates
- [Performance](/docs/en/swifty-mvc/guide/advanced/performance) — optimization techniques
