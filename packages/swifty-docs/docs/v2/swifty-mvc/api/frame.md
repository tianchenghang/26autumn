# Frame API Reference

The Frame module provides the view lifecycle management system in swifty-mvc. It is organized into three layers: the Frame singleton for registry-level operations, frame instances for per-view lifecycle control, and a set of module-level functions for creating frames and managing the view class registry.

All Frame APIs are exported from the main entry point:

```typescript
import {
  Frame,
  createFrame,
  registerViewClass,
  invalidateViewClass,
} from "swifty-mvc";
```

## Frame Singleton {#frame-singleton}

The `Frame` singleton provides static-like methods for querying the global frame registry and listening to registry-level events. It does not represent a specific frame; instead, it offers access to the registry that tracks every active frame in the application.

### Frame.get(id) {#frame-get}

Retrieves a frame by its ID. Returns the `FrameObj` instance or `undefined` if no frame with that ID exists.

Signature:

```typescript
get(id: string): FrameObj | undefined
```

Frame IDs correspond to DOM element IDs. When a frame is created, it is associated with a DOM element that carries the same ID. This allows the framework to locate the container element when mounting or unmounting views.

Example:

```typescript
const frame = Frame.get("dashboard-widget-1");
if (frame) {
  frame.invoke("refresh");
}
```

### Frame.getAll() {#frame-getall}

Returns the entire frame registry as a `Map<string, FrameObj>`. This is primarily used for debugging, devtools integration, or advanced scenarios where you need to iterate over all active frames.

Signature:

```typescript
getAll(): Map<string, FrameObj>
```

The returned map is the live registry, not a copy. Mutating it directly corrupts the framework state. Treat it as read-only.

Example:

```typescript
const allFrames = Frame.getAll();
allFrames.forEach((frame, id) => {
  console.log(id, frame.getViewPath());
});
```

### Frame.getRoot() {#frame-getroot}

Returns the root frame, or `undefined` if the framework has not booted yet. The root frame is created during `Framework.boot()` or via an explicit call to `Frame.createRoot()` and serves as the entry point for the view tree.

Signature:

```typescript
getRoot(): FrameObj | undefined
```

The root frame is a singleton. Once created, subsequent calls to `Frame.createRoot()` return the same instance regardless of the ID passed in.

Example:

```typescript
const root = Frame.getRoot();
if (root) {
  console.log("Root view:", root.getViewPath());
}
```

### Frame.createRoot(rootId?) {#frame-createroot}

Creates or returns the singleton root frame. The optional `rootId` parameter specifies the DOM element ID where the root view will be mounted. If no element with that ID exists, the framework falls back to `document.body` and assigns it the specified ID. If `rootId` is omitted, the default value `"root"` is used.

Signature:

```typescript
createRoot(rootId?: string): FrameObj
```

`createRoot` is idempotent. Calling it multiple times returns the same root frame instance. This matters when multiple parts of the application might attempt to initialize the framework.

Example:

```typescript
import { Framework, Frame } from "swifty-mvc";

Framework.boot({
  rootId: "app",
  defaultView: "views/home",
});

const root = Frame.getRoot();
console.log(root.id); // 'app'
```

### Frame.on(event, handler) {#frame-singleton-on}

Binds an event listener at the frame registry level. The two built-in events are `add` and `remove`, which fire when frames are created or destroyed.

Signature:

```typescript
on(event: string, handler: AnyFunc): FrameApi
```

Returns the `Frame` singleton itself, allowing method chaining.

Example:

```typescript
Frame.on("add", (e) => {
  console.log("Frame added:", e.frame.id);
});

Frame.on("remove", (e) => {
  console.log("Frame removed:", e.frame.id);
});
```

The `add` event fires immediately after a frame is created and registered. The `remove` event fires after a frame is unmounted and removed from the registry. Both events receive an object with a `frame` property containing the frame instance. The `remove` event also carries an `fcc` boolean indicating whether the frame's children had finished mounting before removal.

### Frame.off(event, handler?) {#frame-singleton-off}

Unbinds an event listener from the frame registry. If `handler` is omitted, all listeners for that event are removed.

Signature:

```typescript
off(event: string, handler?: AnyFunc): FrameApi
```

Returns the `Frame` singleton for method chaining.

Example:

```typescript
const handler = (e) => console.log(e.frame.id);
Frame.on("add", handler);

// Remove a specific handler
Frame.off("add", handler);

// Remove all handlers for the event
Frame.off("add");
```

### Frame.fire(event, data?) {#frame-singleton-fire}

Fires a custom event at the registry level. This is rarely used in application code, but is available for advanced scenarios where you need to broadcast events to all frame registry listeners.

Signature:

```typescript
fire(event: string, data?: Record<string, unknown>): void
```

Example:

```typescript
Frame.fire("customRegistryEvent", { key: "value" });
```

## Frame Instance {#frame-instance}

Each frame instance provides methods for managing its view, children, and events. Frames are plain objects with closure-based methods created by the `createFrame` factory. They do not rely on `this` binding.

The `FrameObj` type describes the shape of every frame instance:

```typescript
interface FrameObj {
  id: string;
  getViewPath(): string | undefined;
  readonly parentId: string | undefined;
  view: ViewCtx | undefined;
  invokeList: FrameInvokeEntry[];
  signature: number;
  destroyed: number;
  holdFireCreated: number;
  childrenCreated: number;
  childrenAlter: number;
  childrenMap: Record<string, string>;
  childrenCount: number;
  readyCount: number;
  readyMap: Set<string>;
  emitter: EmitterApi;
  // Methods documented below
}
```

### mountView(viewPath, viewInitParams?) {#mountview}

Mounts a view into the frame's associated DOM element. The `viewPath` is a string that identifies the view class, typically a module path like `views/dashboard`. The optional `viewInitParams` object is passed to the view's setup function.

Signature:

```typescript
mountView(viewPath: string, viewInitParams?: Record<string, unknown>): void
```

`mountView` performs several steps in sequence: it saves the original DOM template for restoration on unmount, parses the view path and parameters, translates any reference tokens from the parent view's `refData`, loads the view class (synchronously if already registered, asynchronously via the configured `require` function otherwise), and finally calls the internal `mountCtx` to create the view context and run the setup function.

If the view class is loaded asynchronously, `mountView` increments the frame's signature and guards against stale mounts. If the frame is unmounted or re-mounted before the async load completes, the stale callback is discarded.

Example:

```typescript
const frame = Frame.get("my-container");
frame.mountView("views/user-profile", { userId: "123" });
```

### unmountView() {#unmountview}

Unmounts the current view from the frame. This triggers the view's cleanup cycle, unmounts all child frames in the zone, restores the original DOM template, and increments the frame's signature to invalidate any pending async operations.

Signature:

```typescript
unmountView(): void
```

`unmountView` sets the `destroyed` flag on the frame and fires the `alter` event up the tree to notify parent frames that content has changed. It also clears the view's invoke list and calls `unmountCtx` to run cleanup functions registered by `useEffect`.

After unmounting, the frame remains in the registry but its `view` property is `undefined`. The frame can be reused by calling `mountView` again with a new view path.

Example:

```typescript
const frame = Frame.get("my-container");
frame.unmountView();
```

### mountFrame(frameId, viewPath, viewInitParams?) {#mountframe}

Creates a child frame and mounts a view into it. The `frameId` specifies the DOM element ID where the child view will be mounted. Returns the child frame instance.

Signature:

```typescript
mountFrame(
  frameId: string,
  viewPath: string,
  viewInitParams?: Record<string, unknown>,
): FrameObj
```

If a frame with the specified ID already exists in the registry, `mountFrame` reuses it and mounts the new view into the existing frame. The child frame is added to the parent's `childrenMap`, and the parent's `childrenCount` is incremented.

`mountFrame` fires the `alter` event on the parent before creating the child, signaling that the parent's content is about to change.

Example:

```typescript
const parent = Frame.get("dashboard");
const child = parent.mountFrame("widget-1", "views/chart", { type: "bar" });
```

### unmountFrame(id?) {#unmountframe}

Unmounts and removes a child frame. If `id` is omitted, the frame unmounts itself.

Signature:

```typescript
unmountFrame(id?: string): void
```

`unmountFrame` calls `unmountView` on the target frame, removes it from the registry (firing the `remove` event), and deletes it from the parent's `childrenMap`. The parent's `childrenCount` is decremented, and the `created` event may fire if the parent's subtree is now fully ready.

Example:

```typescript
const parent = Frame.get("dashboard");
parent.unmountFrame("widget-1");
```

### mountZone(zoneId?) {#mountzone}

Scans a DOM element for `v-swifty` attributes and mounts a child frame for each. If `zoneId` is omitted, the frame's own ID is used as the zone.

Signature:

```typescript
mountZone(zoneId?: string): void
```

`mountZone` queries the DOM for all elements with the `v-swifty` attribute within the specified zone, assigns IDs to elements that lack them (using the `frame_` prefix), and calls `mountFrame` for each. Elements that already have a frame bound (indicated by the `frameBound` property) are skipped to prevent double-mounting.

The method sets `holdFireCreated` to 1 before scanning, preventing premature `created` events while children are being mounted. After all children are mounted, it releases the hold and calls the internal `notifyCreated` helper to potentially fire the `created` event.

Example:

```typescript
const frame = Frame.get("layout");
frame.mountZone("layout");
```

### unmountZone(zoneId?) {#unmountzone}

Unmounts all child frames in a zone. If `zoneId` is specified, only children whose IDs do not match the zone ID are unmounted, which is useful for preserving a specific child.

Signature:

```typescript
unmountZone(zoneId?: string): void
```

`unmountZone` iterates over the frame's `childrenMap` and calls `unmountFrame` for each qualifying child. After all children are unmounted, it calls `notifyCreated` to update the parent's ready state.

Example:

```typescript
const frame = Frame.get("layout");
frame.unmountZone();
```

### parent(level?) {#parent}

Returns the parent frame at the specified level. The `level` parameter defaults to 1, returning the immediate parent. A `level` of 2 returns the grandparent, and so on.

Signature:

```typescript
parent(level?: number): FrameObj | undefined
```

If the frame has no parent (for example, the root frame), or if the specified level exceeds the tree depth, `parent` returns `undefined`. The method walks up the tree by following `parentId` links and retrieving each ancestor from the global registry.

Example:

```typescript
const frame = Frame.get("widget-1");
const parent = frame.parent(1);
const grandparent = frame.parent(2);
```

### invoke(name, args?) {#invoke}

Calls a method on the frame's mounted view. If the view is rendered, the method is invoked immediately. If the view is not yet rendered, the invocation is deferred and added to the frame's `invokeList`, which is flushed after the view renders.

Signature:

```typescript
invoke(name: string, args?: unknown[]): unknown
```

`invoke` uses `Reflect.get` to retrieve the method from the view context and calls it with the provided arguments. If the same method is invoked multiple times before the view renders, each invocation is added to the list. The framework tracks whether consecutive invocations use the same arguments reference; if they do, the earlier invocation is marked as `removed` and skipped during replay.

This mechanism enables cross-view communication without requiring the caller to know whether the target view is ready.

Example:

```typescript
const frame = Frame.get("chart-widget");
frame.invoke("updateData", [newData]);
```

### children() {#children}

Returns an array of child frame IDs. This is a shallow operation; it does not recursively return grandchildren.

Signature:

```typescript
children(): string[]
```

The returned array is a snapshot. Changes to the frame's `childrenMap` after calling `children()` are not reflected in the array.

Example:

```typescript
const frame = Frame.get("dashboard");
const childIds = frame.children();
console.log(childIds); // ['widget-1', 'widget-2', 'widget-3']
```

### frame.on(event, handler) {#frame-instance-on}

Binds an event listener on the frame instance. Returns the frame for method chaining.

Signature:

```typescript
on(event: string, handler: AnyFunc): FrameObj
```

Frame instances emit several built-in events: `created` (fired when all child frames are ready), `alter` (fired when a child frame's content changes), and custom events fired by application code.

Example:

```typescript
const frame = Frame.get("widget-1");
frame.on("created", () => {
  console.log("All children are ready");
});
```

### frame.off(event, handler?) {#frame-instance-off}

Unbinds an event listener from the frame instance. If `handler` is omitted, all listeners for that event are removed. Returns the frame for method chaining.

Signature:

```typescript
off(event: string, handler?: AnyFunc): FrameObj
```

Example:

```typescript
const handler = () => console.log("ready");
frame.on("created", handler);
frame.off("created", handler);
```

### frame.fire(event, data?) {#frame-instance-fire}

Fires an event on the frame instance. Returns the frame for method chaining.

Signature:

```typescript
fire(event: string, data?: Record<string, unknown>): FrameObj
```

Example:

```typescript
frame.fire("customEvent", { key: "value" });
```

## Frame Events {#frame-events}

The Frame system emits several events that signal lifecycle transitions. These events can be observed at two levels: the frame registry (via `Frame.on`) and individual frame instances (via `frame.on`).

### add {#event-add}

Fired on the frame registry when a new frame is created. The event data contains the frame instance.

Event shape:

```typescript
{
  frame: FrameObj;
}
```

This event fires immediately after `createFrame` is called, before the frame's view is mounted. It is useful for devtools integration, logging, or setting up frame-level observers.

Example:

```typescript
Frame.on("add", (e) => {
  console.log("Frame created:", e.frame.id);
});
```

### remove {#event-remove}

Fired on the frame registry when a frame is removed. The event data contains the frame instance and a boolean `fcc` (frame children created) indicating whether the frame's children had finished mounting before removal.

Event shape:

```typescript
{ frame: FrameObj, fcc: boolean }
```

This event fires after the frame's view is unmounted and the frame is deleted from the registry. It is useful for cleanup, devtools integration, or updating external state that tracks active views.

Example:

```typescript
Frame.on("remove", (e) => {
  console.log("Frame removed:", e.frame.id, "was ready:", e.fcc);
});
```

### created {#event-created}

Fired on a frame instance when all its child frames have finished mounting. A frame is considered "created" when `childrenCount === readyCount` and the `childrenCreated` flag is not yet set.

Event shape: no additional payload beyond the event type.

The `created` event bubbles up the tree. When a child frame fires `created`, its parent increments `readyCount` and checks whether it should itself fire `created`. This allows you to listen for "entire subtree is ready" signals at any level.

The event is suppressed while `holdFireCreated` is set (for example, during `mountZone`), preventing premature firing while children are still being mounted.

Example:

```typescript
const frame = Frame.get("dashboard");
frame.on("created", () => {
  console.log("All widgets are ready");
});
```

### alter {#event-alter}

Fired on a frame instance when a child frame's content changes, for example before unmounting. The event data contains the ID of the child that changed.

Event shape:

```typescript
{
  id: string;
}
```

Like `created`, `alter` bubbles up the tree. When a child fires `alter`, its parent decrements `readyCount` and may itself fire `alter`. This allows parent frames to react to changes in their subtree, such as showing a loading indicator while a child re-renders.

The `alter` event transitions the frame from the "created" state (`childrenCreated = 1`) to the "alter" state (`childrenAlter = 1`). Once in the alter state, the frame will not fire `created` again until all children are re-mounted and ready.

Example:

```typescript
const frame = Frame.get("dashboard");
frame.on("alter", (e) => {
  console.log("Widget changed:", e.id);
});
```

## Module-Level Functions {#module-level-functions}

These functions are exported alongside `Frame` from the main `swifty-mvc` entry point. They operate at the framework level rather than on a specific frame instance.

### createFrame(id, parentId?) {#createframe}

Creates a new frame object and registers it in the global frame registry. This is the internal factory used by `mountFrame` and `createRoot`. Application code rarely calls `createFrame` directly; prefer `Frame.createRoot()` or `frame.mountFrame()` instead.

Signature:

```typescript
function createFrame(id: string, parentId?: string): FrameObj;
```

The `id` parameter specifies the DOM element ID that the frame is associated with. The optional `parentId` links the new frame to its parent in the tree.

After creation, the frame is registered in the global registry, the corresponding DOM element (if present) has its `frame` and `frameBound` properties set, and the `add` event is fired on the frame singleton.

Example:

```typescript
import { createFrame } from "swifty-mvc";

const frame = createFrame("custom-widget", "dashboard");
```

### registerViewClass(viewPath, setup) {#registerviewclass}

Registers a view setup function for a given view path. Called internally after module loading completes, but can also be called up front during boot to pre-register views.

Signature:

```typescript
function registerViewClass(viewPath: string, setup: ViewSetup): void;
```

The `viewPath` is a string identifying the view, optionally containing query parameters. The `setup` parameter is a `ViewSetup` function (typically produced by `defineView`) that is called by the framework when the view is mounted.

The function parses the path and stores the setup function under the canonical path key. Subsequent calls to `mountView` with the same path resolve the setup synchronously from the registry.

Example:

```typescript
import { registerViewClass, defineView } from "swifty-mvc";

const myView = defineView((ctx, params) => {
  return {
    template: (data) => `<div>Hello ${data.name}</div>`,
  };
});

registerViewClass("views/my-view", myView);
```

### invalidateViewClass(viewPath) {#invalidateviewclass}

Removes a view setup function from the registry. Used by the hot module replacement (HMR) system to force re-loading of a view module when its source changes.

Signature:

```typescript
function invalidateViewClass(viewPath: string): void;
```

The function parses the path and deletes the corresponding entry from the internal registry. The next time a frame mounts a view with that path, the framework falls through to the async module loader configured via `FrameworkConfig.require`.

Example:

```typescript
import { invalidateViewClass } from "swifty-mvc";

// During HMR, invalidate the old version
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    invalidateViewClass("views/my-view");
  });
}
```
