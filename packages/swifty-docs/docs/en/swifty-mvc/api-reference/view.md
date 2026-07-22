---
title: View API
description: Complete API reference for defineView, ViewCtx, and view lifecycle.
---

# View API {#view-api}

Views are the primary unit of UI composition in Swifty MVC. This page documents the view definition API and the ViewCtx context object.

## defineView {#define-view}

```ts
defineView(setup: ViewSetup): ViewSetup
```

Identity function that declares a view. The setup function runs exactly once when the view is mounted.

**Parameters:**

- `setup` — function that receives `(ctx: ViewCtx, params?: unknown)` and returns a descriptor

**Returns:**

- The same setup function (identity)

**Example:**

```ts
import { defineView } from "@swifty.js/mvc";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template: '<button @click="increment">{{=getCount()}}</button>',
    events: {
      "increment<click>"() {
        setCount(getCount() + 1);
      },
    },
  };
});
```

## ViewCtx {#view-ctx}

The `ViewCtx` object is passed to every view's setup function. It provides access to all framework APIs.

### Properties {#ctx-properties}

#### ctx.id {#ctx-id}

```ts
ctx.id: string
```

Unique view identifier (same as the Frame's DOM element ID).

#### ctx.owner {#ctx-owner}

```ts
ctx.owner: FrameObj
```

The Frame that owns this view.

#### ctx.updater {#ctx-updater}

```ts
ctx.updater: UpdaterApi
```

Per-view data binding and digest engine. See [Updater API](/docs/en/swifty-mvc/api-reference/updater).

### Methods {#ctx-methods}

#### ctx.on {#ctx-on}

```ts
ctx.on(event: string, handler: Function): void
```

Subscribe to view lifecycle events.

**Events:**

- `"render"` — before each render cycle
- `"destroy"` — when the view is unmounted

```ts
ctx.on("render", () => {
  console.log("About to render");
});

ctx.on("destroy", () => {
  console.log("View destroyed");
});
```

#### ctx.fire {#ctx-fire}

```ts
ctx.fire(event: string, data?: unknown, remove?: boolean, lastToFirst?: boolean): void
```

Emit a view event.

#### ctx.render {#ctx-render}

```ts
ctx.render(): void
```

Trigger a manual re-render. Increments the signature, fires `"render"` event, destroys `destroyOnRender` resources, and calls the render method.

#### ctx.wrapAsync {#ctx-wrap-async}

```ts
ctx.wrapAsync<F extends Function>(fn: F): F
```

Create a signature-guarded async callback. The returned function only executes if the view is still alive and has not re-rendered since wrapping.

**Example:**

```ts
const safeCallback = ctx.wrapAsync((data) => {
  ctx.updater.set({ data }).digest();
});

fetch("/api/data")
  .then((res) => res.json())
  .then(safeCallback);
// If view unmounts before fetch completes, safeCallback silently no-ops
```

#### ctx.observeLocation {#ctx-observe-location}

```ts
ctx.observeLocation(keys: string, observePath?: boolean): void
```

Declare URL parameters this view reacts to. The dispatcher re-renders the view when observed parameters change.

**Parameters:**

- `keys` — comma-separated parameter names
- `observePath` — also observe path changes (default: `false`)

**Example:**

```ts
ctx.observeLocation("id,tab");
// View re-renders when 'id' or 'tab' query params change

ctx.observeLocation("path", true);
// View re-renders when the URL path changes
```

#### ctx.observeState {#ctx-observe-state}

```ts
ctx.observeState(keys: string): void
```

Declare State keys this view reacts to. The dispatcher re-renders the view when observed keys change.

**Example:**

```ts
ctx.observeState("user,theme");
// View re-renders when State.set({ user: ... }) or State.set({ theme: ... }) is called
```

#### ctx.leaveTip {#ctx-leave-tip}

```ts
ctx.leaveTip(message: string, condition: () => boolean): void
```

Register an unsaved-changes navigation guard.

**Parameters:**

- `message` — confirmation message (used in `beforeunload`)
- `condition` — function that returns `true` when there are unsaved changes

**Example:**

```ts
ctx.leaveTip("You have unsaved changes. Leave anyway?", () => {
  return ctx.updater.get("isDirty");
});
```

The guard is automatically cleaned up when the view is destroyed.

#### ctx.beginUpdate {#ctx-begin-update}

```ts
ctx.beginUpdate(zoneId?: string): void
```

Tear down child zone before re-render. Calls `frame.unmountZone(zoneId)`.

#### ctx.endUpdate {#ctx-end-update}

```ts
ctx.endUpdate(zoneId?: string, inner?: boolean): void
```

Re-mount child zone after re-render. Calls `frame.mountZone(zoneId)`. On first call, marks `rendered.value = true` and flushes deferred invoke queue.

## Hooks {#hooks}

Hooks must be called inside a `defineView` setup function. See [Hooks guide](/docs/en/swifty-mvc/guide/essentials/hooks).

### useState {#use-state}

```ts
useState<T>(key: string, initial: T): [() => T, (v: T) => void]
```

Create view-local state backed by the updater.

### useEffect {#use-effect}

```ts
useEffect(fn: () => (() => void) | void, deps?: unknown[]): void
```

Register a side effect with optional cleanup.

### useStore {#use-store}

```ts
useStore<T extends Record<string, unknown>>(store: StoreApi<T>, selector?: (state: T) => Partial<T>): () => Partial<T>
```

Bind a Store to the view's updater with automatic synchronization.

### useInterval {#use-interval}

```ts
useInterval(fn: () => void, delay: number): void
```

Create a `setInterval` that is automatically cleared on view destroy.

### useTimeout {#use-timeout}

```ts
useTimeout(fn: () => void, delay: number): void
```

Create a `setTimeout` that is automatically cleared if the view is destroyed before it fires.

### useResource {#use-resource}

```ts
useResource(key: string, resource: { destroy(): void }, destroyOnRender?: boolean): void
```

Capture a resource that should be destroyed on view unmount or re-render.

### useEvent {#use-event}

```ts
useEvent(event: string, handler: Function): void
```

Register a handler on the view's event emitter with automatic cleanup.

### useUrlState {#use-url-state}

```ts
useUrlState<S extends Record<string, string>>(
  view: ViewCtx,
  initialState?: S
): [Readonly<S>, (patch: Partial<S>) => void]
```

Synchronize view state with URL query parameters.

## Types {#types}

### ViewSetup {#view-setup-type}

```ts
type ViewSetup = (ctx: ViewCtx, params?: unknown) => ViewDescriptor;
```

### ViewDescriptor {#view-descriptor-type}

```ts
interface ViewDescriptor {
  template?: Function;
  events?: Record<string, Function>;
  assign?: (options?: unknown) => boolean | undefined;
}
```

### ViewCtx {#view-ctx-type}

```ts
interface ViewCtx {
  id: string;
  owner: FrameObj;
  updater: UpdaterApi;
  on(event: string, handler: Function): void;
  fire(
    event: string,
    data?: unknown,
    remove?: boolean,
    lastToFirst?: boolean,
  ): void;
  render(): void;
  wrapAsync<F extends Function>(fn: F): F;
  observeLocation(keys: string, observePath?: boolean): void;
  observeState(keys: string): void;
  leaveTip(message: string, condition: () => boolean): void;
  beginUpdate(zoneId?: string): void;
  endUpdate(zoneId?: string, inner?: boolean): void;
}
```

## Next steps {#next-steps}

- [Views guide](/docs/en/swifty-mvc/guide/essentials/views) — view authoring and templates
- [Hooks guide](/docs/en/swifty-mvc/guide/essentials/hooks) — state, effects, and subscriptions
- [Updater API](/docs/en/swifty-mvc/api-reference/updater) — data binding and digest
