---
title: Architecture Overview
description: Understand the core architecture of Swifty MVC — the Frame tree, rendering pipeline, event delegation, and data flow.
---

# Architecture Overview {#architecture-overview}

Swifty MVC follows a strict Model-View-Controller separation with a functional-first design. This page explains how the major subsystems fit together before diving into each one individually.

## High-level flow {#high-level-flow}

```
Framework.boot(config)
    |
    +-- Router (history/hash, two-phase change confirmation)
    |
    +-- State (observable cross-view data singleton)
    |
    +-- Frame Tree (mount/unmount, parent-child, zones)
    |       |
    |       +-- createFrame(id, parentId) -> FrameObj
    |               |
    |               +-- mountView(path, params) -> ViewCtx
    |                       |
    |                       +-- setup(ctx, params) -> {template, events, assign}
    |                               |
    |                               +-- Hooks (useState/useEffect/useStore/...)
    |                                       |
    |                                       +-- Updater (per-view data binding + digest)
    |                                               |
    |                                               +-- String mode: dom.ts (real-DOM diff)
    |                                               +-- VDOM mode: vdom.ts (LIS reconciliation)
    |
    +-- EventDelegator (capture-phase delegation on document.body)
```

## The singleton pattern {#singletons}

The framework uses four singleton objects, each implemented as a plain object literal (not a class):

- `Framework` — configuration, boot sequence, task scheduler, utilities
- `Router` — URL parsing, navigation, two-phase change confirmation
- `State` — cross-view observable data store
- `EventDelegator` — DOM event delegation with reference counting

These singletons are module-level objects that are imported directly. There is no dependency injection container — the singletons are the container. This keeps the architecture transparent: you can read the source of any module and see exactly which singletons it interacts with.

## The Frame tree {#frame-tree}

The Frame tree is the structural backbone of a Swifty MVC application. Each Frame corresponds to a DOM element and optionally holds a mounted View.

```
Frame (root, id="app")
  |-- View: LayoutView (template contains <div v-swifty="sidebar"> and <div v-swifty="main">)
       |
       +-- Frame (id="sidebar")
       |    +-- View: SidebarView
       |
       +-- Frame (id="main")
            +-- View: HomeView
```

A Frame is created by calling `createFrame(id, parentId)`. The factory returns a `FrameObj` — a plain object with methods like `mountView`, `unmountView`, `mountFrame`, and `invoke`. The Frame tree mirrors the DOM hierarchy: child frames are mounted inside DOM elements that carry the `v-swifty` attribute within their parent view's template.

Key properties of the Frame tree:

- Each Frame has at most one mounted View at a time
- Mounting a new View automatically unmounts the previous one
- Unmounting a Frame recursively unmounts all its child Frames
- The root Frame is created during `Framework.boot` and attached to the `rootId` element

## The View lifecycle {#view-lifecycle}

A View is defined with `defineView(setup)`. The setup function runs exactly once when the view is mounted — not on every render. It receives a `ViewCtx` (view context) and optional route parameters, and returns a descriptor object:

```ts
defineView((ctx, params) => {
  // Setup runs ONCE on mount.
  // Register hooks, initialize state, subscribe to stores.

  return {
    template, // compiled template function
    events: {
      // event handler map
      "btn<click>"() {
        /* ... */
      },
    },
    assign: {
      // additional properties merged onto ctx
      myHelper() {
        /* ... */
      },
    },
  };
});
```

The complete lifecycle of a View:

1. `createCtx(frame)` — create a fresh ViewCtx with an updater, emitter, and resource bag
2. `setCurrentCtx(ctx)` — make the context available to hooks
3. `setup(ctx, params)` — run the setup function; hooks register state, effects, and subscriptions
4. `setCurrentCtx(null)` — reset the hook context
5. Wire `template`, `events`, `assign` onto the context
6. `ctx.signature.value = 1` — activate the view (signatures > 0 mean the view is alive)
7. `frame.view = ctx` — wire the view onto the frame before rendering
8. `registerEvents(ctx)` — register event handlers with the EventDelegator
9. `ctx.render()` — trigger the first render via `updater.digest()`
10. On subsequent state changes, the dispatcher re-invokes `ctx.render()` if observed keys changed
11. `unmountCtx(ctx)` — run cleanup: effects in reverse, unregister events, destroy resources, fire "destroy"

## The rendering pipeline {#rendering-pipeline}

Rendering in Swifty MVC is a three-step process:

### Step 1: Template compilation (build time) {#compilation}

The bundler plugin intercepts `.html` imports and runs them through the compiler:

```
home.html
  -> protectComments()      // preserve <!-- --> across syntax conversion
  -> convertArtSyntax()     // {{expr}} -> <% expr %> internal syntax
  -> processViewEvents()    // @click -> encoded event attributes
  -> restoreComments()      // restore HTML comments
  -> extractGlobalVars()    // AST-based variable detection via Babel
  -> compileToFunction()    // or compileToVDomFunction()
  -> ES module wrapping     // imports from @swifty.js/mvc/runtime
```

The output is a JavaScript module that exports a function. When called with the view's data object, it returns either an HTML string (string mode) or a VDomNode tree (VDOM mode).

### Step 2: Template execution (runtime) {#execution}

During a digest cycle, the Updater calls the compiled template function with the current data:

```ts
// String mode: returns HTML string
const html = template(updater.data);

// VDOM mode: returns VDomNode tree
const vdom = template(updater.data);
```

### Step 3: DOM reconciliation {#reconciliation}

The framework compares the new output against the previous DOM state and applies minimal mutations:

- String mode (`dom.ts`): Parses the HTML string into a detached DOM tree via `document.implementation.createHTMLDocument()`. Walks the new and old trees in parallel, building a keyed index of existing nodes. Nodes are moved, updated, or removed based on key matching. Special handling for form elements (value, checked, selected) ensures user-facing state is preserved.

- VDOM mode (`vdom.ts`): Uses a three-phase algorithm:
  1. Head fast-path: match identical nodes from the start
  2. Tail fast-path: match identical nodes from the end
  3. KeyMap reconciliation with LIS (Longest Increasing Subsequence): build a key-to-node index, compute the LIS via patience sorting, keep LIS nodes in place, move others via `insertBefore`

Both modes encode DOM mutations as operation tuples and apply them in a single batch at the end, minimizing layout thrashing.

## Event delegation {#event-delegation}

Swifty MVC uses a single capture-phase event listener per event type, attached to `document.body`. When a DOM event fires, the `EventDelegator` walks from the event target upward through the DOM tree, looking for elements with encoded event attributes (`@click`, `@input`, etc.). Each attribute is parsed to extract the handler name, optional CSS selector, and modifier keys. The delegator then walks the Frame tree to find the view that registered the handler and invokes it.

This design means:

- No per-element event listeners are ever attached
- Adding or removing views does not require attaching or detaching listeners
- Event types are reference-counted: the first view to register `click` attaches the body listener; the last view to unregister it removes it

## Data flow {#data-flow}

Data in Swifty MVC flows in two channels:

### State (simple cross-view data) {#state-flow}

`State` is a module-level key-value store. Views declare which keys they observe via `ctx.observeState('key1,key2')`. When `State.set()` followed by `State.digest()` is called, the framework's dispatcher checks which views observed the changed keys and re-renders only those views.

```
View A: State.set({ user: newUser }); State.digest()
  -> Dispatcher receives CHANGED event with keys: Set{"user"}
  -> View B observed "user" -> re-render
  -> View C observed "theme" -> no re-render (theme did not change)
```

### Store (complex state with actions) {#store-flow}

`Store` follows the Zustand pattern. A store encapsulates state and actions in a closure. Views bind to a store via `useStore(store, selector)`, which subscribes to changes and syncs the selected slice to the view's updater.

```
store.setState({ count: 1 })
  -> Store compares with Object.is
  -> Recomputes computed properties whose deps changed
  -> Fires subscriber callbacks
  -> View's useStore subscriber calls updater.set() + updater.digest()
  -> View re-renders
```

### Updater (view-local data) {#updater-flow}

Each View has its own Updater, which holds view-local data. The `useState` hook creates a getter/setter pair backed by the updater. When the setter is called, the updater bumps its version counter and triggers a digest, which re-runs the template function and reconciles the DOM.

## Navigation flow {#navigation-flow}

The Router uses a two-phase change confirmation protocol:

```
1. URL changes (pushState, popstate, hashchange)
   |
2. watchChange() fires
   |
3. Build changeEvent with reject()/resolve()/prevent()
   |
4. Fire Router.CHANGE (preventable)
   |
   +-- If a listener called prevent() -> suspend navigation
   +-- If a listener called reject() -> revert URL
   +-- If a listener called resolve() -> commit immediately
   |
5. If no listener handled it AND beforeEachGuards exist:
   |
   +-- Chain guards sequentially
   +-- Any guard returns false or throws -> reject()
   +-- All guards pass -> resolve()
   |
6. resolve() -> updateBrowserUrl() -> Router.diff()
   |
7. Router.diff() fires Router.CHANGED
   |
8. Framework dispatcher listens on CHANGED
   -> Walks Frame tree
   -> Re-renders views whose observed URL params changed
```

This protocol ensures that navigation guards (e.g., "unsaved changes" prompts) can intercept and potentially cancel navigation before the URL is committed.

## Micro-frontend composition {#micro-frontend-composition}

The Frame tree naturally supports micro-frontend boundaries. A parent view can declare zones where child frames are mounted:

```html
<div v-swifty="sidebar"></div>
<div v-swifty="main"></div>
```

Each zone can load a view from a different module, potentially served by a different team or build pipeline. The `FrameworkConfig.require` hook enables integration with Module Federation:

```ts
Framework.boot({
  require(names) {
    // Delegate to Module Federation's remote container
    return Promise.all(names.map((name) => import(name)));
  },
  extensions: ["remote-app/shell"],
});
```

Each micro-frontend operates within its own Frame subtree, with its own views, state, and event handlers. The Frame tree ensures proper lifecycle management: when a parent frame unmounts, all child frames in all zones are recursively unmounted.

## Next steps {#next-steps}

- [Views and Templates](/docs/en/swifty-mvc/guide/essentials/views) — the complete view authoring experience
- [The Frame Tree](/docs/en/swifty-mvc/guide/essentials/frame) — frame creation, lifecycle, zones, and cross-view invocation
- [Routing](/docs/en/swifty-mvc/guide/essentials/routing) — navigation guards, route modes, and URL parsing
