# View API Reference {#view-api-reference}

## defineView() {#defineview}

```ts
function defineView(setup: ViewSetup): ViewSetup;
```

### Details {#defineview-details}

`defineView` is the public factory for declaring a view. It accepts a `ViewSetup` function and returns it unchanged. Its primary purpose is documentation and type narrowing: any module that exports the result of `defineView` is recognized by the framework and the devtools as a view module.

The setup function is invoked exactly once, when the view is mounted. It receives the `ViewCtx` as its first argument and an optional `params` object. Inside the setup body, hooks such as `useState`, `useEffect`, `useStore`, `useInterval`, `useEvent`, and `useResource` may be called. The setup function returns a descriptor object with three optional fields: `template`, `events`, and `assign`.

Because setup runs once, not on every render, closures capture the `ViewCtx` reference rather than any specific value. State is read from `ctx.updater.data` through the getter returned by `useState`, ensuring that event handlers always observe the current value.

### Example {#defineview-example}

```ts
import { defineView, useState } from "swifty-mvc";
import template from "./counter.html";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "incr<click>": () => setCount(getCount() + 1),
      "decr<click>": () => setCount(getCount() - 1),
    },
  };
});
```

### See Also {#defineview-see-also}

- [ViewSetup](#viewsetup)
- [ViewCtx](#viewctx)
- [Views guide - Defining a View](../guide/views#defining-a-view-with-defineview)

---

## ViewSetup {#viewsetup}

```ts
type ViewSetup = (
  ctx: ViewCtx,
  params?: unknown,
) => {
  template?: ViewTemplate | VDomTemplate;
  events?: Record<string, AnyFunc>;
  assign?: (options?: unknown) => boolean | undefined;
};
```

### Details {#viewsetup-details}

`ViewSetup` is the signature of the function passed to `defineView`. It is called by `mountCtx` during the mount phase.

The returned descriptor object may contain:

| Field      | Type                                          | Purpose                                                                                                                                                                                             |
| ---------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `template` | `ViewTemplate \| VDomTemplate`                | Compiled template function used by the updater to render HTML or produce a VDOM tree.                                                                                                               |
| `events`   | `Record<string, AnyFunc>`                     | Map of declarative event bindings. Keys are parsed by `registerEvents` to extract the handler name, the DOM event type, and an optional CSS selector or global target (`$window`, `$document`).     |
| `assign`   | `(options?: unknown) => boolean \| undefined` | Incremental update function applied on every re-render. It may call `updater.snapshot()` and `updater.set(...)` and return `updater.altered()` to decide whether the template should be re-invoked. |

All three fields are optional. If `template` is omitted, the view acts as a container for child frames and `endUpdate()` is called in place of `render()` after setup completes.

### Example {#viewsetup-example}

```ts
import { defineView } from "swifty-mvc";
import template from "./list.html";

export default defineView((ctx, params) => {
  const assign = () => {
    ctx.updater.snapshot();
    ctx.updater.set({ filtered: filter(ctx.updater.get("items")) });
    return ctx.updater.altered();
  };

  return {
    template,
    events: {
      "item<click>": (e) => ctx.owner.invoke("select", [e.params.id]),
    },
    assign,
  };
});
```

### See Also {#viewsetup-see-also}

- [defineView()](#defineview)
- [ViewCtx](#viewctx)
- [Views guide - View Registration](../guide/views#view-registration)

---

## ViewCtx {#viewctx}

```ts
interface ViewCtx {
  id: string;
  owner: FrameObj;
  updater: UpdaterApi;
  signature: Ref<number>;
  rendered: Ref<boolean>;
  locationObserved: ViewLocationObserved;
  resources: Record<string, ViewResourceEntry>;
  emitter: EmitterApi;
  vdom?: VDomNode;
  renderMethod?: AnyFunc;
  cleanups: Array<() => void>;

  getTemplate(): ViewTemplate | VDomTemplate | undefined;
  setTemplate(v: ViewTemplate | VDomTemplate | undefined): void;

  getObservedStateKeys(): string[] | undefined;
  setObservedStateKeys(v: string[] | undefined): void;

  getEndUpdatePending(): number | undefined;
  setEndUpdatePending(v: number | undefined): void;

  getEvents(): Record<string, AnyFunc> | undefined;
  setEvents(v: Record<string, AnyFunc> | undefined): void;

  getAssign(): ((options?: unknown) => boolean | undefined) | undefined;
  setAssign(v: ((options?: unknown) => boolean | undefined) | undefined): void;

  render(): void;
  init(params?: unknown): void;
  beginUpdate(id?: string): void;
  endUpdate(id?: string, inner?: boolean): void;

  wrapAsync<Fn extends AnyFunc>(
    fn: Fn,
    context?: unknown,
  ): (...args: Parameters<Fn>) => ReturnType<Fn> | undefined;

  observeLocation(
    params: string | string[] | Record<string, unknown>,
    observePath?: boolean,
  ): void;

  observeState(keys: string | string[]): void;

  capture(key: string, resource?: unknown, destroyOnRender?: boolean): unknown;
  release(key: string, destroy?: boolean): unknown;

  leaveTip(message: string, condition: () => boolean): void;

  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): void;
  on(event: string, handler: AnyFunc): () => void;
  off(event: string, handler?: AnyFunc): void;
}
```

The sections below describe each member in detail.

### id {#viewctx-id}

```ts
id: string;
```

The view identifier. It is identical to the owning frame's `id` and is used to scope delegated DOM events and to key the view in internal registries.

### owner {#viewctx-owner}

```ts
owner: FrameObj;
```

A reference to the frame that owns this view. Through `owner` you can access parent frames, mount child frames, and invoke methods on sibling or child views.

### updater {#viewctx-updater}

```ts
updater: UpdaterApi;
```

The per-view data binding layer. It exposes `get`, `set`, `digest`, `forceDigest`, `snapshot`, `altered`, `refData`, `translate`, `parse`, and `getChangedKeys`. The typical flow is to merge new data with `set` and then trigger a render with `digest`. `useState` wraps this behind a getter/setter pair.

```ts
ctx.updater.get("count");
ctx.updater.set({ count: 1 });
ctx.updater.digest({ count: 2 });
ctx.updater.snapshot();
ctx.updater.altered();
ctx.updater.getChangedKeys();
ctx.updater.forceDigest();
ctx.updater.refData;
```

### signature {#viewctx-signature}

```ts
signature: Ref<number>;
```

A mutable reference cell whose value is greater than zero while the view is alive. It is set to `1` at the end of the mount phase, incremented on every call to `render()`, and reset to `0` on destroy. `wrapAsync` captures the signature at wrap time and uses it to drop stale callbacks.

```ts
if (ctx.signature.value > 0) {
  // view is still alive
}
```

### rendered {#viewctx-rendered}

```ts
rendered: Ref<boolean>;
```

A mutable reference cell that becomes `true` after the first successful `endUpdate()` call. It is used internally to decide whether a view has produced DOM output at least once.

### getTemplate / setTemplate {#viewctx-template}

```ts
getTemplate(): ViewTemplate | VDomTemplate | undefined
setTemplate(v: ViewTemplate | VDomTemplate | undefined): void
```

Read or replace the template function wired to this view during mount. The template is invoked by the updater on every digest.

### getObservedStateKeys / setObservedStateKeys {#viewctx-observed-state-keys}

```ts
getObservedStateKeys(): string[] | undefined
setObservedStateKeys(v: string[] | undefined): void
```

Read or replace the list of `State` keys this view observes. These keys are populated by `observeState`.

### getEndUpdatePending / setEndUpdatePending {#viewctx-end-update-pending}

```ts
getEndUpdatePending(): number | undefined
setEndUpdatePending(v: number | undefined): void
```

Internal flag used by `beginUpdate` and `endUpdate` to defer child frame re-mounting until the digest cycle completes.

### getEvents / setEvents {#viewctx-events-accessors}

```ts
getEvents(): Record<string, AnyFunc> | undefined
setEvents(v: Record<string, AnyFunc> | undefined): void
```

Read or replace the event map returned by the setup function. `registerEvents` parses this map during mount.

### getAssign / setAssign {#viewctx-assign}

```ts
getAssign(): ((options?: unknown) => boolean | undefined) | undefined
setAssign(v: ((options?: unknown) => boolean | undefined) | undefined): void
```

Read or replace the incremental update function returned by setup.

### render() {#viewctx-render}

```ts
function render(): void;
```

Triggers a re-render. It increments `signature`, fires the `"render"` event, destroys all resources captured with `destroyOnRender = true`, and calls `updater.digest()` (or `ctx.renderMethod` if one has been installed). It is a no-op when `signature === 0`.

```ts
ctx.render();
```

### init() {#viewctx-init}

```ts
function init(params?: unknown): void;
```

Lifecycle hook called by the frame system after setup completes. In the current implementation it is a no-op; initialization parameters are passed directly to the setup function.

### beginUpdate() {#viewctx-beginupdate}

```ts
function beginUpdate(id?: string): void;
```

Opens a zone update cycle. It unmounts child frames inside the given zone (or the view's own zone when `id` is omitted) so that stale child views are torn down before new template output is diffed.

```ts
ctx.beginUpdate(zoneId);
```

### endUpdate() {#viewctx-endupdate}

```ts
function endUpdate(id?: string, inner?: boolean): void;
```

Closes a zone update cycle. It re-mounts child frames via `frame.mountZone` and schedules a flush of deferred `invoke` calls. On the first invocation it also marks the view as rendered.

```ts
ctx.endUpdate(zoneId);
```

### wrapAsync() {#viewctx-wrapasync}

```ts
function wrapAsync<Fn extends AnyFunc>(
  fn: Fn,
  context?: unknown,
): (...args: Parameters<Fn>) => ReturnType<Fn> | undefined;
```

Captures the current `signature` and returns a wrapper that executes `fn` only if the signature still matches. Stale callbacks that arrive after the view has re-rendered or been destroyed are silently dropped.

```ts
const fetchData = ctx.wrapAsync(async () => {
  const res = await api.getData();
  ctx.updater.digest({ data: res });
});

setTimeout(fetchData, 1000);
```

### observeLocation() {#viewctx-observelocation}

```ts
function observeLocation(
  params: string | string[] | Record<string, unknown>,
  observePath?: boolean,
): void;
```

Declares which URL parameters, and optionally the path, the view observes. When any observed key changes through `Router.to()` or browser navigation, the framework calls `ctx.render()` automatically.

```ts
ctx.observeLocation("page,size");
ctx.observeLocation(["page", "size"]);
ctx.observeLocation({ params: ["page"], path: true });
ctx.observeLocation(["page"], true);
```

### observeState() {#viewctx-observestate}

```ts
function observeState(keys: string | string[]): void;
```

Declares which `State` keys the view observes. When any observed key changes via `State.digest()`, the view re-renders.

```ts
ctx.observeState("user,theme");
ctx.observeState(["user", "theme"]);
```

### capture() {#viewctx-capture}

```ts
function capture(
  key: string,
  resource?: unknown,
  destroyOnRender?: boolean,
): unknown;
```

Registers a destroyable resource tied to the view lifecycle. Each resource has a unique key and an optional `destroy()` method. When the view is destroyed, every captured resource is destroyed. Resources marked with `destroyOnRender = true` are additionally destroyed on each call to `render()`.

When called with only a `key`, it returns the previously stored entity (or `undefined`). When called with an existing key, the old resource's `destroy()` is called before the new one replaces it.

```ts
ctx.capture("timer", {
  destroy() {
    clearInterval(handle);
  },
});

const timer = ctx.capture("timer");
```

### release() {#viewctx-release}

```ts
function release(key: string, destroy?: boolean): unknown;
```

Removes a resource entry and optionally calls its `destroy()` method. Returns the removed entity.

```ts
ctx.release("timer");
ctx.release("timer", false);
```

### leaveTip() {#viewctx-leavetip}

```ts
function leaveTip(message: string, condition: () => boolean): void;
```

Registers an unsaved-changes guard. When `condition()` returns `true`, route navigations are prevented and the browser `beforeunload` dialog shows `message`. The guard is automatically cleaned up on view destroy.

```ts
ctx.leaveTip("You have unsaved changes. Leave anyway?", () => {
  return ctx.updater.get("isDirty") === true;
});
```

### on() {#viewctx-on}

```ts
function on(event: string, handler: AnyFunc): () => void;
```

Subscribes to a lifecycle event on this view. Returns an unsubscribe function.

```ts
const off = ctx.on("destroy", () => {
  console.log("View destroyed");
});
off();
```

### off() {#viewctx-off}

```ts
function off(event: string, handler?: AnyFunc): void;
```

Unsubscribes from a lifecycle event. When `handler` is omitted, all listeners for the event are removed.

```ts
ctx.off("destroy", handler);
```

### fire() {#viewctx-fire}

```ts
function fire(
  event: string,
  data?: Record<string, unknown>,
  remove?: boolean,
  lastToFirst?: boolean,
): void;
```

Emits a lifecycle event. When `remove` is `true`, listeners are removed after being invoked. When `lastToFirst` is `true`, listeners are invoked in reverse registration order.

```ts
ctx.fire("render");
```

### See Also {#viewctx-see-also}

- [ViewSetup](#viewsetup)
- [defineView()](#defineview)
- [Views guide - ViewCtx](../guide/views#viewctx)

---

## View Lifecycle Events {#view-lifecycle-events}

A view passes through three lifecycle phases: mount, render, and unmount. Each phase emits events that can be observed via `ctx.on`, `useEvent`, or `useEffect`.

### render {#lifecycle-event-render}

Fires at the start of every render cycle, after `signature` has been incremented and before transient resources are destroyed. Listeners registered with `ctx.on("render", ...)` or `useEvent("render", ...)` are notified.

```ts
ctx.on("render", () => {
  console.log("render #", ctx.signature.value);
});
```

### destroy {#lifecycle-event-destroy}

Fires when the view is being torn down. The event is emitted with `remove = true` and `lastToFirst = true`, so handlers run in reverse registration order and are then removed. After this event completes, `signature` is set to `0`.

```ts
ctx.on("destroy", () => {
  cleanupExternalResources();
});
```

### unload {#lifecycle-event-unload}

Fires when a view is about to be unloaded due to a route change. It is emitted before the router confirms the navigation, giving the view a chance to participate in the two-phase confirmation flow. `leaveTip` internally subscribes to this event.

```ts
ctx.on("unload", (e) => {
  if (hasUnsavedWork()) {
    e.prevent();
  }
});
```

### See Also {#lifecycle-events-see-also}

- [Views guide - View Lifecycle](../guide/views#view-lifecycle)
- [ViewCtx.on()](#viewctx-on)

---

## View Registry {#view-registry}

The view setup registry maps a view path (for example `"app/views/home"`) to the setup function returned by `defineView`. It is consulted by `frame.mountView` whenever a view needs to be mounted.

### registerViewClass() {#registerviewclass}

```ts
function registerViewClass(viewPath: string, setup: ViewSetup): void;
```

#### Details {#registerviewclass-details}

Registers a view setup function for the given path. The path is parsed via `Framework.parseUri`, so any query string or hash fragment is stripped before the key is stored.

If the view module is loaded synchronously during boot, `registerViewClass` can be called up front. When a view is loaded asynchronously through the configured `require` function, the framework calls `registerViewClass` automatically after the module resolves.

#### Example {#registerviewclass-example}

```ts
import { registerViewClass } from "swifty-mvc";
import homeSetup from "./views/home";

registerViewClass("app/views/home", homeSetup);
```

#### See Also {#registerviewclass-see-also}

- [getViewClass()](#getviewclass)
- [invalidateViewClass()](#invalidateviewclass)

### getViewClass() {#getviewclass}

```ts
function getViewClass(path: string): ViewSetup | undefined;
```

#### Details {#getviewclass-details}

Looks up a previously registered view setup function by path. Returns `undefined` when no setup is registered for the given path. The path is used as-is, without query-string parsing.

#### Example {#getviewclass-example}

```ts
import { getViewClass } from "swifty-mvc";

const setup = getViewClass("app/views/home");
if (setup) {
  // setup is a ViewSetup function
}
```

#### See Also {#getviewclass-see-also}

- [registerViewClass()](#registerviewclass)
- [getViewClassRegistry()](#getviewclassregistry)

### invalidateViewClass() {#invalidateviewclass}

```ts
function invalidateViewClass(viewPath: string): void;
```

#### Details {#invalidateviewclass-details}

Removes a view setup from the registry. The path is parsed via `Framework.parseUri`, stripping any query parameters. This function is used by the HMR runtime to force a module reload on the next mount of the invalidated path.

#### Example {#invalidateviewclass-example}

```ts
import { invalidateViewClass } from "swifty-mvc";

invalidateViewClass("app/views/home");
```

#### See Also {#invalidateviewclass-see-also}

- [registerViewClass()](#registerviewclass)
- [Views guide - View Registration](../guide/views#view-registration)

### getViewClassRegistry() {#getviewclassregistry}

```ts
function getViewClassRegistry(): Record<string, ViewSetup>;
```

#### Details {#getviewclassregistry-details}

Returns a reference to the internal view setup registry object. The returned object is the live registry, not a copy: mutations are visible to the framework. It is intended for HMR runtimes and devtools integrations, not for application code.

#### Example {#getviewclassregistry-example}

```ts
import { getViewClassRegistry } from "swifty-mvc";

const registry = getViewClassRegistry();
for (const path of Object.keys(registry)) {
  console.log("registered:", path);
}
```

#### See Also {#getviewclassregistry-see-also}

- [registerViewClass()](#registerviewclass)
- [getViewClass()](#getviewclass)
