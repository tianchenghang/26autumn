# Frame Tree

The Frame Tree is the view lifecycle management system in swifty-mvc. It provides a hierarchical structure for organizing views, managing their mount/unmount cycles, and enabling cross-view communication without tight coupling.

## What is the Frame Tree {#what-is-frame-tree}

The Frame Tree is a runtime registry that tracks every view instance in your application. Each view is wrapped in a Frame object that manages its lifecycle, parent-child relationships, and event propagation. The tree structure mirrors the DOM hierarchy where views are mounted, but operates at a higher abstraction level that understands view semantics rather than just DOM nodes.

Unlike component-based frameworks where parent-child relationships are declared in JSX or templates, swifty-mvc builds the tree dynamically as views mount other views. This allows for flexible composition patterns where a view can mount child views into arbitrary DOM containers without knowing their implementation details at authoring time.

The Frame system is implemented as a functional factory (`createFrame`) rather than a class. Each Frame is a plain object with closure-based methods, avoiding the cognitive overhead of `this` binding and prototype chains. A singleton `Frame` object provides registry-level operations like retrieving frames by ID or creating the root frame.

:::info Why a tree instead of a flat registry?
Views in real applications are rarely isolated. A dashboard view mounts chart widgets, a form view mounts validation subviews, a layout view mounts navigation and content regions. The tree structure captures these relationships so that lifecycle events (like "all children are ready") can bubble naturally, and operations like unmounting a subtree can be performed atomically.
:::

## Frame System Overview {#frame-system-overview}

The Frame system consists of three layers:

The Frame singleton provides global registry operations. You use it to retrieve frames by ID, access the root frame, create the root frame, and listen to frame-level events like when a frame is added or removed from the registry.

Frame instances represent individual view containers. Each frame has an ID, a reference to its mounted view (if any), a map of child frames, and methods for mounting views, managing children, and firing events. Frames are created internally by the framework when you mount a view or a zone.

The dispatcher is the change notification system that walks the frame tree when router or state changes occur. It uses an iterative LIFO stack traversal to avoid blowing the JavaScript call stack on deeply nested trees, and only re-renders views that have observed the changed keys.

The lifecycle of a typical frame follows this sequence: the framework boots and creates the root frame, the root frame mounts the initial view, that view's template contains `v-swifty` attributes that trigger child frame creation, each child frame mounts its own view, and the `created` event bubbles up once all children in a subtree are ready. When the user navigates or state changes, the dispatcher walks the tree and selectively re-renders views. When a view is unmounted, its frame is removed from the registry and the `remove` event fires.

## Frame Singleton API {#frame-singleton-api}

The `Frame` singleton is exported from `swifty-mvc` and provides static-like methods for working with the global frame registry. These methods do not operate on a specific frame instance; instead, they provide access to the registry itself.

### Frame.get(id) {#frame-get}

Retrieves a frame by its ID. Returns `undefined` if no frame with that ID exists in the registry.

```typescript
import { Frame } from "swifty-mvc";

const frame = Frame.get("dashboard-widget-1");
if (frame) {
  frame.invoke("refresh");
}
```

Frame IDs are strings that correspond to DOM element IDs. When a frame is created, it is associated with a DOM element that has the same ID. This allows the framework to locate the container element when mounting or unmounting views.

### Frame.getAll() {#frame-getall}

Returns the entire frame registry as a `Map<string, FrameObj>`. This is primarily used for debugging, devtools integration, or advanced scenarios where you need to iterate over all active frames.

```typescript
const allFrames = Frame.getAll();
allFrames.forEach((frame, id) => {
  console.log(id, frame.getViewPath());
});
```

The returned map is the live registry, not a copy. Mutating it directly will corrupt the framework state. Treat it as read-only.

### Frame.getRoot() {#frame-getroot}

Returns the root frame, or `undefined` if the framework has not booted yet. The root frame is created during `Framework.boot()` and serves as the entry point for the view tree.

```typescript
const root = Frame.getRoot();
if (root) {
  console.log("Root view:", root.getViewPath());
}
```

The root frame is a singleton. Once created, subsequent calls to `Frame.createRoot()` return the same instance regardless of the ID passed in.

### Frame.createRoot(rootId) {#frame-createroot}

Creates or returns the singleton root frame. The `rootId` parameter specifies the DOM element ID where the root view will be mounted. If no element with that ID exists, the framework falls back to `document.body` and assigns it the specified ID.

```typescript
import { Framework, Frame } from "swifty-mvc";

Framework.boot({
  rootId: "app",
  defaultView: "views/home",
});

// The root frame is now available
const root = Frame.getRoot();
console.log(root.id); // 'app'
```

`createRoot` is idempotent. Calling it multiple times returns the same root frame instance. This is important for scenarios where multiple parts of your application might attempt to initialize the framework.

### Frame.on(event, handler) {#frame-singleton-on}

Binds an event listener at the frame registry level. The two built-in events are `add` and `remove`, which fire when frames are created or destroyed.

```typescript
Frame.on("add", (e) => {
  console.log("Frame added:", e.frame.id);
});

Frame.on("remove", (e) => {
  console.log("Frame removed:", e.frame.id);
});
```

The `add` event fires immediately after a frame is created and registered. The `remove` event fires after a frame is unmounted and removed from the registry. Both events receive an object with a `frame` property containing the frame instance.

`Frame.on` returns the `Frame` singleton itself, allowing method chaining.

### Frame.off(event, handler) {#frame-singleton-off}

Unbinds an event listener from the frame registry. If `handler` is omitted, all listeners for that event are removed.

```typescript
const handler = (e) => console.log(e.frame.id);
Frame.on("add", handler);

// Later, remove the specific handler
Frame.off("add", handler);

// Or remove all handlers for the event
Frame.off("add");
```

### Frame.fire(event, data) {#frame-singleton-fire}

Fires a custom event at the registry level. This is rarely used in application code, but available for advanced scenarios where you need to broadcast events to all frame registry listeners.

```typescript
Frame.fire("customEvent", { key: "value" });
```

## Frame Instance Methods {#frame-instance-methods}

Each frame instance provides methods for managing its view, children, and events. These methods are closure-based and do not rely on `this` binding.

### mountView(viewPath, viewInitParams) {#mountview}

Mounts a view into the frame's associated DOM element. The `viewPath` is a string that identifies the view class (typically a module path like `views/dashboard`). The optional `viewInitParams` object is passed to the view's setup function.

```typescript
const frame = Frame.get("my-container");
frame.mountView("views/user-profile", { userId: "123" });
```

`mountView` performs several steps: it saves the original DOM template (for restoration on unmount), parses the view path and parameters, translates any reference tokens from the parent view's `refData`, loads the view class (synchronously if already registered, asynchronously via the configured `require` function otherwise), and finally calls `mountCtx` to create the view context and run the setup function.

If the view class is loaded asynchronously, `mountView` increments the frame's signature and guards against stale mounts. If the frame is unmounted or re-mounted before the async load completes, the stale callback is discarded.

### unmountView() {#unmountview}

Unmounts the current view from the frame. This triggers the view's cleanup cycle, unmounts all child frames in the zone, restores the original DOM template, and increments the frame's signature to invalidate any pending async operations.

```typescript
const frame = Frame.get("my-container");
frame.unmountView();
```

`unmountView` sets the `destroyed` flag on the frame and fires the `alter` event up the tree to notify parent frames that content has changed. It also clears the view's invoke list and calls `unmountCtx` to run cleanup functions registered by `useEffect`.

After unmounting, the frame remains in the registry but its `view` property is `undefined`. The frame can be reused by calling `mountView` again with a new view path.

### mountFrame(frameId, viewPath, viewInitParams) {#mountframe}

Creates a child frame and mounts a view into it. The `frameId` specifies the DOM element ID where the child view will be mounted. Returns the child frame instance.

```typescript
const parent = Frame.get("dashboard");
const child = parent.mountFrame("widget-1", "views/chart", { type: "bar" });
```

If a frame with the specified ID already exists in the registry, `mountFrame` reuses it and mounts the new view into the existing frame. The child frame is added to the parent's `childrenMap`, and the parent's `childrenCount` is incremented.

`mountFrame` fires the `alter` event on the parent before creating the child, signaling that the parent's content is about to change.

### unmountFrame(id) {#unmountframe}

Unmounts and removes a child frame. If `id` is omitted, the frame unmounts itself.

```typescript
const parent = Frame.get("dashboard");
parent.unmountFrame("widget-1");
```

`unmountFrame` calls `unmountView` on the target frame, removes it from the registry (firing the `remove` event), and deletes it from the parent's `childrenMap`. The parent's `childrenCount` is decremented, and the `created` event may fire if the parent's subtree is now fully ready.

### mountZone(zoneId) {#mountzone}

Scans a DOM element for `v-swifty` attributes and mounts a child frame for each. If `zoneId` is omitted, the frame's own ID is used as the zone.

```typescript
const frame = Frame.get("layout");
frame.mountZone("layout");
```

`mountZone` queries the DOM for all elements with the `v-swifty` attribute, assigns IDs to elements that lack them (using the `frame_` prefix), and calls `mountFrame` for each. Elements that already have a frame bound (indicated by the `frameBound` property) are skipped to prevent double-mounting.

The method sets `holdFireCreated` to 1 before scanning, preventing premature `created` events while children are being mounted. After all children are mounted, it releases the hold and calls `notifyCreated` to potentially fire the `created` event.

### unmountZone(zoneId) {#unmountzone}

Unmounts all child frames in a zone. If `zoneId` is specified, only children whose IDs do not match the zone ID are unmounted (useful for preserving a specific child).

```typescript
const frame = Frame.get("layout");
frame.unmountZone();
```

`unmountZone` iterates over the frame's `childrenMap` and calls `unmountFrame` for each child. After all children are unmounted, it calls `notifyCreated` to update the parent's ready state.

### parent(level) {#parent}

Returns the parent frame at the specified level. `level` defaults to 1, returning the immediate parent. `level` of 2 returns the grandparent, and so on.

```typescript
const frame = Frame.get("widget-1");
const parent = frame.parent(1);
const grandparent = frame.parent(2);
```

If the frame has no parent (e.g., the root frame), or if the specified level exceeds the tree depth, `parent` returns `undefined`.

### invoke(name, args) {#invoke}

Calls a method on the frame's mounted view. If the view is rendered, the method is invoked immediately. If the view is not yet rendered, the invocation is deferred and added to the frame's `invokeList`, which is flushed after the view renders.

```typescript
const frame = Frame.get("chart-widget");
frame.invoke("updateData", [newData]);
```

`invoke` uses `Reflect.get` to retrieve the method from the view context and calls it with the provided arguments. If the same method is invoked multiple times before the view renders, each invocation is added to the list. The framework tracks whether consecutive invocations use the same arguments reference; if they do, the earlier invocation is marked as `removed` and skipped during replay.

This mechanism enables cross-view communication without requiring the caller to know whether the target view is ready. The caller simply invokes the method, and the framework handles the timing.

### children() {#children}

Returns an array of child frame IDs.

```typescript
const frame = Frame.get("dashboard");
const childIds = frame.children();
console.log(childIds); // ['widget-1', 'widget-2', 'widget-3']
```

The returned array is a snapshot. Changes to the frame's `childrenMap` after calling `children` are not reflected in the array.

### on(event, handler) {#frame-instance-on}

Binds an event listener on the frame instance. Returns the frame for method chaining.

```typescript
const frame = Frame.get("widget-1");
frame.on("created", () => {
  console.log("All children are ready");
});
```

Frame instances emit several built-in events: `created` (fired when all child frames are ready), `alter` (fired when a child frame's content changes), and custom events fired by application code.

### off(event, handler) {#frame-instance-off}

Unbinds an event listener from the frame instance. If `handler` is omitted, all listeners for that event are removed. Returns the frame for method chaining.

```typescript
const handler = () => console.log("ready");
frame.on("created", handler);
frame.off("created", handler);
```

### fire(event, data) {#frame-instance-fire}

Fires an event on the frame instance. Returns the frame for method chaining.

```typescript
frame.fire("customEvent", { key: "value" });
```

## Parent-Child Relationships {#parent-child-relationships}

The Frame Tree maintains parent-child relationships through two mechanisms: the `parentId` property on each frame, and the `childrenMap` on parent frames.

When a frame mounts a child via `mountFrame`, the child's `parentId` is set to the parent's ID, and the child's ID is added to the parent's `childrenMap`. The parent's `childrenCount` is incremented. This creates a bidirectional link: children know their parent, and parents know their children.

The `parent(level)` method walks up the tree by following `parentId` links. It does not rely on the parent's `childrenMap`; instead, it retrieves each ancestor from the global registry. This means the method works even if the parent's `childrenMap` has been manually modified (though this is not recommended).

The `children()` method returns the keys of the parent's `childrenMap`. This is a shallow operation; it does not recursively return grandchildren.

Parent-child relationships are used for several purposes:

Lifecycle event propagation. When a child frame's content changes, the `alter` event bubbles up to the parent, which decrements its `readyCount` and may itself fire `alter`. When all children in a subtree are ready, the `created` event bubbles up, incrementing the parent's `readyCount` and potentially firing `created` on the parent.

Zone unmounting. When a parent frame is unmounted, `unmountView` calls `unmountZone`, which iterates over the `childrenMap` and unmounts each child. This ensures that the entire subtree is cleaned up atomically.

Dispatcher traversal. When the dispatcher walks the tree to notify views of changes, it retrieves children via `frame.children()` and pushes them onto the stack for processing.

## Zone Mounting {#zone-mounting}

Zone mounting is the mechanism by which a frame scans a DOM region for `v-swifty` attributes and automatically mounts child frames. This is the primary way views compose other views in swifty-mvc.

When a view's template contains elements with `v-swifty` attributes, those elements are candidates for zone mounting:

```html
<div id="dashboard">
  <div id="widget-1" v-swifty="views/chart?type=bar"></div>
  <div id="widget-2" v-swifty="views/table"></div>
</div>
```

After the parent view renders, it calls `mountZone()` (either explicitly or implicitly via the framework's lifecycle hooks). `mountZone` queries the DOM for all elements with the `v-swifty` attribute within the specified zone, assigns IDs to elements that lack them, and calls `mountFrame` for each.

Elements that already have the `frameBound` property set to 1 are skipped. This prevents double-mounting when a zone is scanned multiple times (e.g., after a parent view re-renders but the child elements are preserved).

The `v-swifty` attribute value is a view path string, optionally with query parameters. The framework parses this string using `parseUri`, extracting the view class name and any parameters. Parameters can include reference tokens (prefixed with a special splitter character) that are translated back to actual JavaScript values from the parent view's `refData` before being passed to the child view's setup function.

Zone mounting is synchronous from the caller's perspective, but the actual view mounts may be asynchronous if the view classes need to be loaded via the configured `require` function. The `holdFireCreated` flag ensures that the `created` event does not fire until all children have at least started their mount process.

## Frame Events {#frame-events}

The Frame system emits several events that signal lifecycle transitions. These events can be observed at two levels: the frame registry (via `Frame.on`) and individual frame instances (via `frame.on`).

### add {#event-add}

Fired on the frame registry when a new frame is created. The event data contains the frame instance.

```typescript
Frame.on("add", (e) => {
  console.log("Frame created:", e.frame.id);
});
```

This event fires immediately after `createFrame` is called, before the frame's view is mounted. It is useful for devtools integration, logging, or setting up frame-level observers.

### remove {#event-remove}

Fired on the frame registry when a frame is removed. The event data contains the frame instance and a boolean `fcc` (frame children created) indicating whether the frame's children had finished mounting before removal.

```typescript
Frame.on("remove", (e) => {
  console.log("Frame removed:", e.frame.id, "was ready:", e.fcc);
});
```

This event fires after the frame's view is unmounted and the frame is deleted from the registry. It is useful for cleanup, devtools integration, or updating external state that tracks active views.

### created {#event-created}

Fired on a frame instance when all its child frames have finished mounting. A frame is considered "created" when `childrenCount === readyCount` and the `childrenCreated` flag is not yet set.

```typescript
const frame = Frame.get("dashboard");
frame.on("created", () => {
  console.log("All widgets are ready");
});
```

The `created` event bubbles up the tree. When a child frame fires `created`, its parent increments `readyCount` and checks whether it should itself fire `created`. This allows you to listen for "entire subtree is ready" signals at any level.

The event is suppressed while `holdFireCreated` is set (e.g., during `mountZone`), preventing premature firing while children are still being mounted.

### alter {#event-alter}

Fired on a frame instance when a child frame's content changes (e.g., before unmounting). The event data contains the ID of the child that changed.

```typescript
const frame = Frame.get("dashboard");
frame.on("alter", (e) => {
  console.log("Widget changed:", e.id);
});
```

Like `created`, `alter` bubbles up the tree. When a child fires `alter`, its parent decrements `readyCount` and may itself fire `alter`. This allows parent frames to react to changes in their subtree, such as showing a loading indicator while a child re-renders.

The `alter` event transitions the frame from the "created" state (`childrenCreated = 1`) to the "alter" state (`childrenAlter = 1`). Once in the alter state, the frame will not fire `created` again until all children are re-mounted and ready.

## Dispatcher Update {#dispatcher-update}

The dispatcher is the change notification system that re-renders views when router or state changes occur. It is implemented in `framework.ts` and consists of three main functions: `dispatcherNotifyChange`, `dispatcherUpdate`, and two change detection helpers.

### dispatcherNotifyChange(e) {#dispatchernotifychange}

This function is bound to the `changed` events emitted by `Router` and `State` during framework boot. It receives a `ChangeEvent` object and decides whether to mount a new view or update existing views.

```typescript
Router.on(RouterEvents.CHANGED, (data) => {
  if (data) dispatcherNotifyChange(data);
});

State.on(RouterEvents.CHANGED, (data) => {
  if (data) dispatcherNotifyChange(data);
});
```

If the event contains a `view` property (indicating a route change), `dispatcherNotifyChange` calls `rootFrame.mountView(viewPath)` to mount the new root view. Otherwise, it increments the `dispatcherUpdateTag` and calls `dispatcherUpdate` with the set of changed state keys.

### dispatcherUpdate(frame, stateKeys) {#dispatcherupdate}

This function walks the frame tree iteratively, re-rendering views whose observed keys have changed. It uses an explicit LIFO stack to avoid blowing the JavaScript call stack on deeply nested trees.

```typescript
function dispatcherUpdate(frame, stateKeys) {
  const stack = [frame];
  const tag = ++dispatcherUpdateTag;

  while (stack.length > 0) {
    const current = stack.pop();
    const view = current.view;

    if (!view || current.dispatcherUpdateTag === tag) {
      continue;
    }
    current.dispatcherUpdateTag = tag;

    const isChanged = stateKeys
      ? stateIsObserveChanged(view, stateKeys)
      : viewIsObserveChanged(view);

    if (isChanged) {
      view.render();
    }

    const children = current.children();
    for (let i = children.length - 1; i >= 0; i--) {
      const child = Frame.get(children[i]);
      if (child) stack.push(child);
    }
  }
}
```

The algorithm works as follows:

1. Push the root frame onto the stack.
2. Pop a frame from the stack.
3. If the frame has no view, or has already been visited in this update cycle (checked via `dispatcherUpdateTag`), skip it.
4. Mark the frame as visited by setting its `dispatcherUpdateTag` to the current tag.
5. Check whether the view's observed keys have changed (using `viewIsObserveChanged` or `stateIsObserveChanged`).
6. If changed, call `view.render()` to re-render the view.
7. Retrieve the frame's children and push them onto the stack in reverse order (so that `pop()` visits them in the original order).
8. Repeat until the stack is empty.

The `dispatcherUpdateTag` prevents infinite loops in case a view's render triggers another state change. Each update cycle uses a unique tag, and frames that have already been visited are skipped.

### viewIsObserveChanged and stateIsObserveChanged {#observe-checks}

These two helper functions determine whether a view needs to re-render based on its observation configuration.

`viewIsObserveChanged` is used for router changes. It checks whether the view has called `observeLocation` and whether the changed route parameters or path match the observed keys:

```typescript
function viewIsObserveChanged(view) {
  const loc = view.locationObserved;
  if (!loc.flag) return false;

  if (loc.observePath) {
    const lastChanged = Router.diff();
    if (lastChanged.path) return true;
  }

  if (loc.keys.length) {
    const lastChanged = Router.diff();
    const changedParams = lastChanged.params;
    if (changedParams) {
      for (const key of loc.keys) {
        if (changedParams.hasOwnProperty(key)) return true;
      }
    }
  }

  return false;
}
```

`stateIsObserveChanged` is used for state changes. It checks whether the view has called `observeState` and whether any of the changed state keys match the observed keys:

```typescript
function stateIsObserveChanged(view, stateKeys) {
  const observedKeys = view.getObservedStateKeys();
  if (!observedKeys) return false;

  for (const key of observedKeys) {
    if (stateKeys.has(key)) return true;
  }

  return false;
}
```

Views that have not called `observeLocation` or `observeState` are never re-rendered by the dispatcher. This is an important optimization: views that do not depend on router or state changes are left alone, reducing unnecessary re-renders.

### Async Branch Support {#async-branch-support}

The dispatcher supports async rendering. If a view's `render()` method returns a thenable (e.g., a Promise), the dispatcher defers processing of that frame's children until the promise resolves. Sibling frames continue to be processed synchronously.

This is implemented by checking the return value of `view.render()`:

```typescript
const renderResult = view.render();
if (isThenable(renderResult)) {
  renderResult.then(() => {
    const children = current.children();
    for (let i = children.length - 1; i >= 0; i--) {
      const child = Frame.get(children[i]);
      if (child) stack.push(child);
    }
  });
} else {
  const children = current.children();
  for (let i = children.length - 1; i >= 0; i--) {
    const child = Frame.get(children[i]);
    if (child) stack.push(child);
  }
}
```

This allows views to perform async operations (e.g., data fetching) during render without blocking the entire dispatcher walk. Sibling views can render while one view is waiting for its async operation to complete.

## Cross-view Communication via Frame.invoke {#cross-view-communication}

`Frame.invoke` is the primary mechanism for calling methods on views that may not yet be mounted or rendered. It provides a fire-and-forget API that buffers invocations until the target view is ready.

### How It Works {#invoke-how-it-works}

When you call `frame.invoke('methodName', [args])`, the framework checks whether the frame's view is rendered (via `view.rendered.value`). If it is, the method is called immediately:

```typescript
const frame = Frame.get("chart-widget");
frame.invoke("updateData", [newData]);
// If the view is rendered, updateData is called immediately
```

If the view is not yet rendered, the invocation is added to the frame's `invokeList`:

```typescript
const frame = Frame.get("chart-widget");
frame.invoke("updateData", [newData]);
// The view is not rendered yet, so the invocation is buffered
```

After the view renders, the framework flushes the `invokeList` by calling each buffered method. This happens in `runInvokes`, which is called by `doMountView` after the view's setup function has executed and the template has rendered.

### Deduplication {#invoke-deduplication}

The framework tracks whether consecutive invocations of the same method use the same arguments reference. If they do, the earlier invocation is marked as `removed` and skipped during replay:

```typescript
const frame = Frame.get("widget");
const args = { data: "value" };

frame.invoke("update", [args]);
frame.invoke("update", [args]); // Same reference, marks first as removed

// When the view renders, only the second invocation is executed
```

This prevents redundant calls when the same method is invoked multiple times with the same arguments before the view is ready. If the arguments are different references (even if they have the same content), both invocations are executed.

### Use Cases {#invoke-use-cases}

Cross-view communication is common in scenarios where views are loosely coupled and do not know about each other at authoring time. Typical use cases include:

Parent-to-child communication. A parent view mounts a child view and needs to pass data or trigger actions after the child is ready:

```typescript
const parent = Frame.get("dashboard");
const child = parent.mountFrame("widget-1", "views/chart");
child.invoke("setData", [chartData]);
```

Sibling communication. Two sibling views need to coordinate without a shared parent. One view retrieves the other via `Frame.get` and invokes a method:

```typescript
const filterView = Frame.get("filter-panel");
const listView = Frame.get("item-list");

filterView.on("filterChanged", (e) => {
  listView.invoke("applyFilter", [e.filter]);
});
```

External triggers. Code outside the view tree (e.g., a service, a router guard, or a global event handler) needs to notify a view:

```typescript
Router.on("changed", () => {
  const frame = Frame.get("breadcrumb");
  if (frame) {
    frame.invoke("updatePath", [Router.location.path]);
  }
});
```

In all these cases, `invoke` abstracts away the timing complexity. The caller does not need to know whether the target view is mounted, rendered, or still loading. The framework ensures that the method is called at the right time.

## Summary {#summary}

The Frame Tree is the backbone of view lifecycle management in swifty-mvc. It provides a hierarchical registry for tracking view instances, managing parent-child relationships, propagating lifecycle events, and enabling cross-view communication.

Key concepts to remember:

The Frame singleton provides global registry operations like `get`, `getAll`, `getRoot`, and `createRoot`. It also emits `add` and `remove` events when frames are created or destroyed.

Frame instances provide methods for mounting views (`mountView`, `mountFrame`, `mountZone`), unmounting views (`unmountView`, `unmountFrame`, `unmountZone`), navigating the tree (`parent`, `children`), and cross-view communication (`invoke`).

Parent-child relationships are maintained through `parentId` and `childrenMap`, and are used for lifecycle event propagation and subtree cleanup.

Zone mounting scans the DOM for `v-swifty` attributes and automatically mounts child frames, enabling declarative view composition.

The dispatcher walks the frame tree when router or state changes occur, re-rendering only the views that have observed the changed keys. It uses an iterative LIFO stack traversal to handle deeply nested trees without blowing the call stack.

`Frame.invoke` buffers method calls until the target view is rendered, enabling fire-and-forget cross-view communication without timing concerns.

Understanding the Frame Tree is essential for building scalable applications with swifty-mvc. It provides the structure that allows views to compose, communicate, and react to changes in a predictable and efficient manner.
