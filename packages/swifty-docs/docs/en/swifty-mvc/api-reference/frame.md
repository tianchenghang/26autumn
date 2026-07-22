---
title: Frame API
description: Complete API reference for the Frame singleton and FrameObj instance.
---

# Frame API {#frame-api}

The Frame tree is the structural backbone of Swifty MVC applications. Each Frame corresponds to a DOM element and optionally holds a mounted View.

## Frame singleton {#frame-singleton}

### Frame.get {#get}

```ts
Frame.get(id: string): FrameObj | undefined
```

Look up a Frame by its DOM element ID.

```ts
const sidebar = Frame.get("sidebar");
```

### Frame.getAll {#get-all}

```ts
Frame.getAll(): Map<string, FrameObj>
```

Returns the entire Frame registry.

### Frame.getRoot {#get-root}

```ts
Frame.getRoot(): FrameObj | undefined
```

Returns the root Frame (created during `Framework.boot`).

### Frame.createRoot {#create-root}

```ts
Frame.createRoot(rootId?: string): FrameObj
```

Idempotent root creation. If the DOM element with `rootId` does not exist, falls back to `document.body`.

### Frame.on / Frame.off / Frame.fire {#events}

```ts
Frame.on(event: string, handler: Function): void
Frame.off(event: string, handler?: Function): void
Frame.fire(event: string, data?: unknown): void
```

Static event emitter for Frame lifecycle events.

**Events:**

- `"add"` — fired when a Frame is created, carries `{ frame: FrameObj }`
- `"remove"` — fired when a Frame is destroyed, carries `{ frame: FrameObj }`

```ts
Frame.on("add", ({ frame }) => {
  console.log("Frame created:", frame.id);
});
```

## createFrame {#create-frame}

```ts
createFrame(id: string, parentId?: string): FrameObj
```

Factory function that creates a new Frame and registers it in the global Map.

**Parameters:**

- `id` — DOM element ID
- `parentId` — parent Frame ID (optional)

**Returns:**

- `FrameObj` — the new Frame instance

## FrameObj instance {#frame-obj}

### frame.mountView {#mount-view}

```ts
frame.mountView(viewPath: string, viewInitParams?: unknown): void
```

Mount a view on this Frame. Unmounts any previously mounted view.

**Parameters:**

- `viewPath` — registered view path
- `viewInitParams` — optional parameters passed to the view's setup function

**Example:**

```ts
frame.mountView("home", { userId: 42 });
```

### frame.unmountView {#unmount-view}

```ts
frame.unmountView(): void
```

Unmount the current view. Clears invoke queue, unmounts zones, fires events, runs cleanup.

### frame.mountFrame {#mount-frame}

```ts
frame.mountFrame(frameId: string, viewPath: string, viewInitParams?: unknown): FrameObj
```

Create or reuse a child Frame and mount a view on it.

**Parameters:**

- `frameId` — child Frame ID (matches `v-swifty` attribute)
- `viewPath` — view to mount
- `viewInitParams` — optional parameters

**Returns:**

- The child `FrameObj`

**Example:**

```ts
const sidebarFrame = frame.mountFrame("sidebar", "sidebar-view");
```

### frame.unmountFrame {#unmount-frame}

```ts
frame.unmountFrame(id?: string): void
```

Unmount a child Frame. If `id` is omitted, unmounts the Frame itself.

### frame.mountZone {#mount-zone}

```ts
frame.mountZone(zoneId?: string): void
```

Scan for `[v-swifty]` elements and create child Frames. If `zoneId` is provided, only that zone is scanned.

### frame.unmountZone {#unmount-zone}

```ts
frame.unmountZone(zoneId?: string): void
```

Unmount all child Frames. If `zoneId` is provided, only children in that zone are unmounted.

### frame.parent {#parent}

```ts
frame.parent(level?: number): FrameObj | undefined
```

Walk up the Frame tree.

**Parameters:**

- `level` — how many levels to traverse (default: 1)

**Examples:**

```ts
frame.parent(); // immediate parent
frame.parent(2); // grandparent
frame.parent(0); // the frame itself
```

### frame.invoke {#invoke}

```ts
frame.invoke(name: string, args?: unknown): unknown
```

Call a method on the mounted view. If the view has not yet rendered, the invocation is queued.

**Parameters:**

- `name` — method name (must be in the view's `assign` object)
- `args` — arguments to pass

**Example:**

```ts
frame.invoke("refresh", { force: true });
```

### frame.children {#children}

```ts
frame.children(): string[]
```

Returns an array of child Frame IDs.

### frame.on / frame.off / frame.fire {#instance-events}

```ts
frame.on(event: string, handler: Function): void
frame.off(event: string, handler?: Function): void
frame.fire(event: string, data?: unknown): void
```

Per-Frame event emitter.

**Events:**

- `"created"` — all child zones have been mounted
- `"alter"` — child content has changed

```ts
frame.on("created", () => {
  console.log("All children mounted");
});
```

## registerViewClass {#register-view-class}

```ts
registerViewClass(viewPath: string, setup: ViewSetup): void
```

Register a view setup function by path.

```ts
import HomeView from "./views/home";
registerViewClass("home", HomeView);
```

## invalidateViewClass {#invalidate-view-class}

```ts
invalidateViewClass(viewPath: string): void
```

Remove a view from the registry. Used internally by HMR.

## Types {#types}

### FrameObj {#frame-obj-type}

```ts
interface FrameObj {
  id: string;
  view?: ViewCtx;
  mountView(viewPath: string, params?: unknown): void;
  unmountView(): void;
  mountFrame(frameId: string, viewPath: string, params?: unknown): FrameObj;
  unmountFrame(id?: string): void;
  mountZone(zoneId?: string): void;
  unmountZone(zoneId?: string): void;
  parent(level?: number): FrameObj | undefined;
  invoke(name: string, args?: unknown): unknown;
  children(): string[];
  on(event: string, handler: Function): void;
  off(event: string, handler?: Function): void;
  fire(event: string, data?: unknown): void;
}
```

### ViewSetup {#view-setup-type}

```ts
type ViewSetup<P = unknown> = (ctx: ViewCtx, params?: P) => ViewDescriptor;

interface ViewDescriptor {
  template?: Function;
  events?: Record<string, Function>;
  assign?: Record<string, unknown>;
}
```

## Next steps {#next-steps}

- [Frame Tree guide](/docs/en/swifty-mvc/guide/essentials/frame) — architecture and patterns
- [View Lifecycle](/docs/en/swifty-mvc/guide/advanced/view-lifecycle) — mount/unmount internals
- [Micro-Frontends](/docs/en/swifty-mvc/guide/advanced/micro-frontends) — Frame tree composition
