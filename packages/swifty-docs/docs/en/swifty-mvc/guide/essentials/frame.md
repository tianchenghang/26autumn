---
title: The Frame Tree
description: How Frames organize the view hierarchy, manage parent-child relationships, and enable micro-frontend composition.
---

# The Frame Tree {#frame-tree}

The Frame tree is the structural backbone of every Swifty MVC application. Each Frame corresponds to a DOM element and optionally holds a mounted View. Frames form a parent-child hierarchy that mirrors the DOM, enabling nested view composition and micro-frontend boundaries.

## Core concepts {#core-concepts}

A Frame is a plain object created by the `createFrame(id, parentId)` factory. It has:

- An `id` that matches a DOM element's `id` attribute
- A reference to its parent Frame (if any)
- A list of child Frame IDs
- An optional mounted View (`ViewCtx`)
- Lifecycle event emitters

```ts
import { Frame, createFrame } from "@swifty.js/mvc";

// The root frame is created automatically during Framework.boot
const rootFrame = Frame.getRoot();

// Create a child frame attached to a DOM element with id="sidebar"
const sidebarFrame = createFrame("sidebar", "app");
```

## The root Frame {#root-frame}

During `Framework.boot`, the framework creates the root Frame and attaches it to the element specified by `rootId` (default `"root"`):

```ts
Framework.boot({
  rootId: "app",
});
// Internally: Frame.createRoot('app')
```

If the specified DOM element does not exist, the framework falls back to `document.body`. The root Frame is accessible via `Frame.getRoot()`.

## Frame lifecycle {#frame-lifecycle}

### Creation {#creation}

```ts
const frame = createFrame(id, parentId);
```

When a Frame is created:

1. It is registered in the global Frame Map (keyed by `id`)
2. It is attached to the DOM element with the matching `id`
3. A `Frame.on("add")` event fires with `{ frame }` payload

### Mounting a view {#mounting-a-view}

```ts
frame.mountView(viewPath, viewInitParams?)
```

When a view is mounted on a Frame:

1. Any previously mounted view is unmounted
2. The setup function is looked up by `viewPath` from the view registry
3. If the setup is not yet loaded (async module), it is fetched via `Framework.use`
4. `createCtx` + `mountCtx` run the full view lifecycle
5. The view's template is rendered and diffed into the Frame's DOM element

### Unmounting a view {#unmounting-a-view}

```ts
frame.unmountView();
```

When a view is unmounted:

1. The invoke queue is cleared
2. All child zones are unmounted (`unmountZone`)
3. A `"alter"` event fires on the frame
4. `unmountCtx` runs the view cleanup sequence
5. The original `innerHTML` of the DOM element is restored
6. All marks on the frame are invalidated (`unmark`)

### Destruction {#destruction}

```ts
frame.unmountFrame(childId?)
```

When a Frame is destroyed:

1. Its view is unmounted
2. It is removed from the global Frame Map
3. Its parent's `childrenMap` entry is cleaned
4. A `Frame.on("remove")` event fires

## Zones and child frames {#zones}

Zones are the mechanism for nesting views inside other views. A parent view's template declares zones using the `v-swifty` attribute:

```html
<div class="layout">
  <nav v-swifty="navigation"></nav>
  <main v-swifty="content"></main>
  <aside v-swifty="sidebar"></aside>
</div>
```

Each `v-swifty` element becomes a mount point for a child Frame. When the parent view calls `ctx.endUpdate()` (which happens automatically after the first render), the framework scans the rendered DOM for `[v-swifty]` elements and creates child Frames:

```ts
// Inside a view's setup:
// The template above will create three zones:
// "navigation", "content", "sidebar"
// Child views can be mounted to these zones:

frame.mountFrame("navigation", "nav-view");
frame.mountFrame("content", "home-view");
frame.mountFrame("sidebar", "sidebar-view");
```

### Zone lifecycle {#zone-lifecycle}

- `frame.mountZone(zoneId?)` — scan for `[v-swifty]` elements and mount child Frames. If `zoneId` is provided, only that zone is scanned.
- `frame.unmountZone(zoneId?)` — unmount all child Frames. If `zoneId` is provided, children in that zone are unmounted but the zone element itself is preserved.

Zones are typically managed automatically:

- After the first render, `endUpdate` calls `mountZone` to set up children
- Before a re-render, `beginUpdate` calls `unmountZone` to tear down stale children
- After the re-render, `endUpdate` calls `mountZone` again to re-create children

## Cross-view invocation {#cross-view-invocation}

The `frame.invoke(name, args?)` method enables parent views to call methods on their child views:

```ts
// Parent view:
frame.invoke("refresh", { force: true });

// Child view (in its setup):
return {
  assign: {
    refresh(params) {
      // Handle refresh
    },
  },
};
```

If the child view has not yet rendered (the method is not available), the invocation is queued in `invokeList`. Once the child view finishes rendering, queued invocations are flushed via `setTimeout` to ensure the view is fully ready.

Invocations are deduplicated by key — if you invoke the same method name multiple times before the child renders, only the latest invocation is kept.

## The Frame registry {#registry}

All Frames are stored in a module-level `Map<string, FrameObj>`. The `Frame` singleton provides static methods to query the registry:

```ts
Frame.get(id); // Get a frame by its DOM element ID
Frame.getAll(); // Get the entire Map
Frame.getRoot(); // Get the root frame
```

### Static events {#static-events}

The `Frame` singleton fires events when frames are created or destroyed:

```ts
Frame.on("add", ({ frame }) => {
  console.log("Frame created:", frame.id);
});

Frame.on("remove", ({ frame }) => {
  console.log("Frame destroyed:", frame.id);
});
```

These events are useful for devtools integration, analytics, and cross-cutting concerns.

## Frame instance events {#instance-events}

Each Frame instance has its own event emitter for lifecycle events:

| Event     | When it fires                                                         |
| --------- | --------------------------------------------------------------------- |
| `created` | All child zones have been mounted (after `mountZone`)                 |
| `alter`   | Child content has changed (after `unmountZone` or child view changes) |

```ts
frame.on("created", () => {
  console.log("All children mounted for", frame.id);
});
```

## Parent traversal {#parent-traversal}

Navigate up the Frame tree:

```ts
frame.parent(); // immediate parent (level=1)
frame.parent(2); // grandparent (level=2)
frame.parent(0); // the frame itself (level=0)
```

## Children {#children}

Get the list of child Frame IDs:

```ts
const childIds = frame.children();
// ['sidebar', 'content', 'navigation']
```

## Practical patterns {#practical-patterns}

### Layout with dynamic content zones {#layout-pattern}

```ts
// layout.ts
export default defineView((ctx) => {
  ctx.observeLocation("path");

  return {
    template: layoutTemplate,
    assign: {
      navigateTo(path) {
        Router.to(path);
      },
    },
  };
});
```

```html
<!-- layout.html -->
<div class="app-shell">
  <header v-swifty="header"></header>
  <div class="body">
    <aside v-swifty="sidebar"></aside>
    <main v-swifty="main"></main>
  </div>
</div>
```

### Conditional zone rendering {#conditional-zones}

Not all zones need to be present in every render. If a `v-swifty` element is inside a `{{if}}` block that evaluates to false, the zone simply does not exist and no child Frame is created:

```html
{{if showSidebar}}
<aside v-swifty="sidebar"></aside>
{{/if}}
```

When `showSidebar` becomes false on a re-render, `beginUpdate` unmounts the sidebar zone, and `endUpdate` does not recreate it.

### Nested micro-frontends {#nested-micro-frontends}

Each micro-frontend can mount its own Frame subtree. The parent application does not need to know about the internal structure of child micro-frontends:

```ts
// Parent app mounts a child frame:
frame.mountFrame("remote-widget", "remote-app/widget");

// The remote view has its own zones:
// widget.html:
// <div>
//   <div v-swifty="chart"></div>
//   <div v-swifty="legend"></div>
// </div>

// The remote view's endUpdate() automatically creates
// and manages its own child frames
```

## Next steps {#next-steps}

- [Routing](/docs/en/swifty-mvc/guide/essentials/routing) — how the Router interacts with the Frame tree
- [Views and Templates](/docs/en/swifty-mvc/guide/essentials/views) — the view lifecycle in detail
- [Micro-Frontends](/docs/en/swifty-mvc/guide/advanced/micro-frontends) — building composed applications
