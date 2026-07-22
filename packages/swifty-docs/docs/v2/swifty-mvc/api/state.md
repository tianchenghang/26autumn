# State and Store API Reference

This document covers the core state management APIs in swifty-mvc. Use `State` for simple cross-view data sharing, `createStore` for complex reactive state with derived values, `createUpdater` for per-view data binding, and `createService` for API request management.

## State

<a id="state"></a>

`State` is an observable in-memory data singleton designed for lightweight cross-view data sharing: counters, toggles, page titles, session information, and similar shared values. For complex reactive state requiring handlers, derived data, multi-instance isolation, or store-internal reactions, prefer `createStore`.

The typical write cycle involves calling `State.set(data)` followed by `State.digest()` to flush changes and notify observers. Multiple `set()` calls accumulate changed keys, and a single `digest()` call fires one `changed` event containing all of them.

### Methods

#### set

<a id="state-set"></a>

```ts
State.set(data: Record<string, unknown>, excludes?: ReadonlySet<string>): StateApi
```

Shallow-merge `data` into the global state object, tracking which keys have actually changed. Changed keys accumulate until the next `digest()` call. The optional `excludes` parameter accepts a set of key names to skip during change tracking — useful for high-frequency updates where you want to suppress observer notifications for specific keys.

Returns `State` for method chaining.

```ts
State.set({ count: 1, title: "Home" });
State.digest();

// With excludes
State.set({ count: 1, scrollY: 120 }, new Set(["scrollY"]));
State.digest();
```

#### digest

<a id="state-digest"></a>

```ts
State.digest(data?: Record<string, unknown>, excludes?: ReadonlySet<string>): void
```

Flush accumulated changes and notify observers. If `data` is provided, it is passed to `set()` first. When at least one key has changed since the last digest, a `changed` event is fired carrying the set of changed keys. After firing, the internal change tracker is reset.

```ts
State.set({ count: 2 });
State.digest();
// Observers receive { keys: Set(["count"]) }

// Shortcut: set + digest in one call
State.digest({ count: 3 });
```

#### get

<a id="state-get"></a>

```ts
State.get<T = unknown>(key?: string): T
```

Read a value from the global state. When called with a key, returns the value at that key. When called without arguments, returns the entire state object.

```ts
const count = State.get<number>("count");
const allState = State.get();
```

#### diff

<a id="state-diff"></a>

```ts
State.diff(): ReadonlySet<string>
```

Return the set of keys that changed during the most recent `digest()` call. Useful inside `changed` event handlers to determine which specific keys were modified.

```ts
State.on("changed", () => {
  const changedKeys = State.diff();
  if (changedKeys.has("count")) {
    // count was modified
  }
});
```

#### clean

<a id="state-clean"></a>

```ts
State.clean(keys: string): (ctx: { on: (event: string, handler: () => void) => void }) => void
```

Create a cleanup function that manages reference-counted lifecycle for observed state keys. Call inside a view's setup function to register automatic teardown when the view is destroyed. The reference count prevents premature cleanup when multiple views observe the same key — data is deleted from the global state only when the last observer is destroyed.

```ts
// In a view setup
defineView((ctx) => {
  ctx.observeState("count,title");
  State.clean("count,title")(ctx);
  // ...
});
```

#### on

<a id="state-on"></a>

```ts
State.on(event: string, handler: (e?: ChangeEvent) => void): StateApi
```

Bind an event listener. The primary event is `"changed"`, fired by `digest()` when state data actually changes. Returns `State` for chaining.

```ts
State.on("changed", (e) => {
  console.log("State changed:", e?.keys);
});
```

#### off

<a id="state-off"></a>

```ts
State.off(event: string, handler?: AnyFunc): StateApi
```

Unbind an event listener. If `handler` is omitted, all listeners for the given event are removed. Returns `State` for chaining.

```ts
const handler = (e) => {
  /* ... */
};
State.on("changed", handler);
State.off("changed", handler);
```

#### fire

<a id="state-fire"></a>

```ts
State.fire(event: string, data?: Record<string, unknown>, remove?: boolean): StateApi
```

Manually fire an event. The `remove` parameter, when true, removes the handler after it fires once. Returns `State` for chaining.

```ts
State.fire("custom-event", { key: "value" });
```

### markBooted

<a id="state-markBooted"></a>

```ts
markBooted(): void
```

Mark the framework as booted. Called internally by `Framework.boot()` after initialization completes. This is a framework-internal function and is rarely called directly by application code.

## Store

<a id="store"></a>

`createStore` provides a Zustand-aligned state management pattern with support for computed (derived) properties, action functions, and per-store isolation. Use it for complex reactive state where `State` is insufficient.

### createStore

<a id="store-createStore"></a>

```ts
createStore<T extends object>(name: string, creator: StateCreator<T>): StoreApi<T>
```

Create a named store. The `creator` function receives `(set, get)` and executes once during store creation. Its return value is analyzed as follows:

- Functions become actions, attached to the state object. Writes to action keys via `setState` are silently ignored.
- `computed(deps, fn)` markers become derived properties. The function runs once for the initial value and recomputes whenever any dependency key changes via `setState`. Writes to computed keys via `setState` are silently ignored.
- All other fields become initial state values.

State is a plain object with no Proxy. All writes go through `setState` or actions. If no value actually changes (determined via `Object.is`), the update is a no-op and listeners are not notified. After merging, any computed property whose dependencies changed is recomputed before listeners fire.

The store is registered in a global registry keyed by `name`.

```ts
const useCountStore = createStore("count", (set, get) => ({
  count: 0,
  doubled: computed(["count"], () => get().count * 2),
  increment() {
    set((prev) => ({ count: prev.count + 1 }));
  },
}));
```

#### StoreApi

<a id="store-StoreApi"></a>

```ts
interface StoreApi<T = object> {
  getState(): T;
  setState(partial: Partial<T> | ((prev: T) => Partial<T>)): void;
  subscribe(listener: Listener<T>): () => void;
  destroy(): void;
}
```

- `getState()` returns the current state snapshot.
- `setState(partial)` shallow-merges a partial object or updater function into state. Computed and action keys are skipped. If nothing changed, listeners are not notified. After merging, computed properties whose dependencies changed are recomputed before listeners fire.
- `subscribe(listener)` registers a listener that receives `(state, prevState)` on every change. Returns an unsubscribe function.
- `destroy()` tears down the store: clears all listeners and removes it from the global registry. Further `setState` calls become no-ops.

```ts
const store = useCountStore;

// Read state
const { count, doubled } = store.getState();

// Update state
store.setState({ count: 5 });
store.setState((prev) => ({ count: prev.count + 1 }));

// Subscribe to changes
const unsub = store.subscribe((state, prevState) => {
  console.log("count:", state.count, "was:", prevState.count);
});

// Later: unsubscribe
unsub();

// Tear down
store.destroy();
```

### computed

<a id="store-computed"></a>

```ts
computed<T>(deps: readonly string[], fn: () => T): T
```

Declare a derived (computed) store property. The `deps` array lists the state keys the computed value reads. Whenever any dependency changes via `setState`, the computed function re-evaluates before listeners are notified. The return value is typed as `T` for the caller, but internally carries a marker that `createStore` intercepts.

Writes to a computed key via `setState` are silently ignored.

```ts
const store = createStore("cart", (set, get) => ({
  items: [] as Item[],
  taxRate: 0.08,
  subtotal: computed(["items"], () =>
    get().items.reduce((sum, item) => sum + item.price * item.qty, 0),
  ),
  total: computed(["items", "taxRate"], () => {
    const { subtotal, taxRate } = get();
    return subtotal * (1 + taxRate);
  }),
}));
```

### bindStore

<a id="store-bindStore"></a>

```ts
bindStore<T>(
  view: unknown,
  store: StoreApi<T>,
  selector?: (state: T) => Record<string, unknown>,
): () => void
```

Bind a store to a Swifty View. Subscribes to store changes and auto-unsubscribes when the view is destroyed. On each state change, the selected state slice is forwarded to the view's updater via `updater.set()` and `updater.digest()`.

The `view` parameter must be a valid Swifty View instance with `updater.set`/`updater.digest` methods and an `on("destroy", ...)` handler. If the view is invalid, the function returns a no-op unsubscribe function.

When `selector` is omitted, only non-function state keys are forwarded — actions are excluded automatically.

Returns an unsubscribe function.

```ts
// In a view setup
defineView((ctx) => {
  const store = createStore("page", (set) => ({
    title: "Home",
    setTitle(t: string) {
      set({ title: t });
    },
  }));

  // Observe all non-function state
  bindStore(ctx, store);

  // Or observe with a selector
  bindStore(ctx, store, (s) => ({ title: s.title }));
});
```

## Updater

<a id="updater"></a>

`createUpdater` produces a per-view data binding object with change detection and DOM diff triggering. Each view has its own Updater instance that tracks local data changes, digests them, and triggers re-rendering when necessary.

### createUpdater

<a id="updater-createUpdater"></a>

```ts
createUpdater(viewId: string): UpdaterApi
```

Create an Updater for the given view. The updater maintains a local data object initialized with `{ vId: viewId }`, tracks changed keys, and coordinates with the view's template to produce DOM updates.

#### get

<a id="updater-get"></a>

```ts
updater.get<T = unknown>(key?: string): T
```

Read a value from the updater's local data. When called with a key, returns the value at that key. When called without arguments, returns the entire data object.

```ts
const count = updater.get<number>("count");
const allData = updater.get();
```

#### set

<a id="updater-set"></a>

```ts
updater.set(data: Record<string, unknown>, excludes?: ReadonlySet<string>): UpdaterApi
```

Shallow-merge `data` into the updater's local data object, tracking changed keys. Bumps the internal version counter if any key actually changed. Returns the updater API for chaining.

```ts
updater.set({ count: 1, label: "hello" });
updater.digest();
```

#### digest

<a id="updater-digest"></a>

```ts
updater.digest(
  data?: Record<string, unknown>,
  excludes?: ReadonlySet<string>,
  callback?: () => void,
): void
```

Trigger a digest cycle. Optionally merges `data` first, then re-renders the view if any data has changed. Supports re-entry: calling `digest()` during an active digest queues the callback and processes it after the current cycle completes. The optional `callback` runs after the digest completes, even if no render occurred.

```ts
updater.digest({ count: 2 });

// With callback
updater.digest({ count: 3 }, undefined, () => {
  console.log("digest complete");
});
```

#### forceDigest

<a id="updater-forceDigest"></a>

```ts
updater.forceDigest(): void
```

Force a full re-render regardless of whether data changed. Marks every current data key as changed, then calls `digest()`. Used by HMR to apply a new template against preserved data — since the data is the same but the template changed, a normal `digest()` would not re-render.

```ts
// After HMR template swap
updater.forceDigest();
```

#### snapshot

<a id="updater-snapshot"></a>

```ts
updater.snapshot(): UpdaterApi
```

Record the current internal version number for later comparison via `altered()`. Call at the top of an `assign()` function, then use `altered()` at the bottom to determine whether a re-render is needed.

```ts
function assign() {
  updater.snapshot();
  // ... possibly call set() ...
  return updater.altered();
}
```

#### altered

<a id="updater-altered"></a>

```ts
updater.altered(): boolean | undefined
```

Check whether the internal version changed since the last `snapshot()` call. Returns `true` if data changed, `false` if it did not, and `undefined` if `snapshot()` was never called.

```ts
updater.snapshot();
updater.set({ count: 5 });
updater.altered(); // true

updater.snapshot();
updater.altered(); // false (no changes)
```

#### getChangedKeys

<a id="updater-getChangedKeys"></a>

```ts
updater.getChangedKeys(): ReadonlySet<string>
```

Return the set of keys changed since the last successful render. Useful for conditional logic that depends on which specific keys were modified.

```ts
const changed = updater.getChangedKeys();
if (changed.has("count")) {
  // count was modified
}
```

## Service

<a id="service"></a>

`createService` provides API request management with LFU caching, request deduplication, serial task queuing, and lifecycle events. It is transport-agnostic: you supply the request executor function, and the service handles caching, dedup, and fan-out.

### createService

<a id="service-createService"></a>

```ts
createService(
  syncFn: (payload: PayloadApi, callback: () => void) => void,
  cacheMax?: number,
  cacheBuffer?: number,
): ServiceApi
```

Create a service type with a custom request executor. The `syncFn` is called for each cache miss — it receives a `PayloadApi` containing the request metadata and parameters, and a `callback` to invoke when the request completes. Each call to `createService` produces independent closure state (`metaList`, `payloadCache`, `pendingCacheKeys`), ensuring full isolation between different service types.

- `cacheMax` sets the maximum number of cache entries before LFU eviction (default 20).
- `cacheBuffer` sets the eviction batch size (default 5).

```ts
const MyService = createService(
  (payload, callback) => {
    const { url, method, data } = payload.data;
    fetch(url, { method, body: JSON.stringify(data) })
      .then((res) => res.json())
      .then((json) => {
        payload.set("response", json);
        callback();
      })
      .catch((err) => {
        callback();
      });
  },
  50,
  10,
);
```

### createPayload

<a id="service-createPayload"></a>

```ts
createPayload(data?: Record<string, unknown>): PayloadApi
```

Create a mutable wrapper around API response data. Payloads are the data carriers passed through the service pipeline: `before` hooks write to them, `syncFn` populates them, and `after` hooks transform their contents before they reach view callbacks. Application code rarely calls this directly — payloads are created internally by the service.

#### PayloadApi

<a id="service-PayloadApi"></a>

```ts
interface PayloadApi {
  data: Record<string, unknown>;
  get<T = unknown>(key: string): T;
  set(
    keyOrData: string | Record<string, unknown> | ServiceMetaEntry,
    value?: unknown,
  ): PayloadApi;
  cacheInfo?: ServiceCacheInfo;
}
```

- `data` is the raw data object. All request parameters, metadata, and response data live here.
- `get(key)` retrieves a value by key from `data`.
- `set(keyOrData, value?)` writes data. Accepts a key-value pair, a plain object merged into `data`, or a `ServiceMetaEntry` merged into `data`. Returns the payload for chaining.
- `cacheInfo` is present when the payload participates in caching, containing the endpoint name, cache key, after-hook reference, clean keys, and cache timestamp.

```ts
// Inside a before hook
function before(payload: PayloadApi) {
  payload.set("normalized", true);
}

// Inside a done callback
function done(errors, payload) {
  const response = payload.get("response");
}
```

### ServiceApi

<a id="service-ServiceApi"></a>

```ts
interface ServiceApi {
  add(attrs: ServiceMetaEntry | ServiceMetaEntry[]): void;
  meta(attrs: string | Record<string, unknown>): ServiceMetaEntry;
  create(attrs: Record<string, unknown>): PayloadApi;
  get(
    attrs: Record<string, unknown>,
    createNew?: boolean,
  ): { entity: PayloadApi; needsUpdate: boolean };
  cached(attrs: Record<string, unknown>): PayloadApi | undefined;
  clear(names: string | string[]): void;
  on(event: string, handler: AnyFunc): void;
  off(event: string, handler?: AnyFunc): void;
  fire(event: string, data?: Record<string, unknown>): void;
  instance(): ServiceInstance;
}
```

#### add

<a id="service-add"></a>

```ts
add(attrs: ServiceMetaEntry | ServiceMetaEntry[]): void
```

Register one or more API endpoint metadata entries. Each entry requires `name` and `url`, and may include `cache` (TTL in milliseconds), `before` (pre-request hook), `after` (post-response hook), and `cleanKeys` (comma-separated endpoint names whose cache should be cleared after a successful request).

```ts
MyService.add([
  {
    name: "getUser",
    url: "/api/user",
    cache: 60000,
    after(payload) {
      const data = payload.get("response");
      payload.set("userName", data.name);
    },
  },
  {
    name: "saveUser",
    url: "/api/user/save",
    cleanKeys: "getUser",
  },
]);
```

#### instance

<a id="service-instance"></a>

```ts
instance(): ServiceInstance
```

Create a new service instance for making requests. Each instance has its own task queue, event emitter, and lifecycle. Instances should be created per-view and destroyed when the view is destroyed.

```ts
defineView((ctx) => {
  const service = MyService.instance();
  // use service.all(), service.one(), service.save()
  ctx.on("destroy", () => service.destroy());
});
```

#### cached

<a id="service-cached"></a>

```ts
cached(attrs: Record<string, unknown>): PayloadApi | undefined
```

Look up a cached payload for the given attributes. Returns the cached payload if a valid (non-expired) cache entry exists, or `undefined` otherwise. Also checks for in-flight (pending) requests with matching cache keys.

#### clear

<a id="service-clear"></a>

```ts
clear(names: string | string[]): void
```

Clear cached payloads for the given endpoint names. Accepts a comma-separated string or an array of names.

```ts
MyService.clear("getUser");
MyService.clear(["getUser", "getList"]);
```

### ServiceInstance

<a id="service-ServiceInstance"></a>

```ts
interface ServiceInstance {
  id: string;
  busy: number;
  destroyed: number;
  emitter: EmitterApi;
  all(attrs, done): ServiceInstance;
  one(attrs, done): ServiceInstance;
  save(attrs, done): ServiceInstance;
  enqueue(callback): ServiceInstance;
  dequeue(...args): void;
  destroy(): void;
  on(event: string, handler: AnyFunc): ServiceInstance;
  off(event: string, handler?: AnyFunc): ServiceInstance;
  fire(event: string, data?: Record<string, unknown>): ServiceInstance;
}
```

#### all

<a id="service-all"></a>

```ts
all(
  attrs: string | Record<string, unknown> | (string | Record<string, unknown>)[],
  done: AnyFunc,
): ServiceInstance
```

Fetch all specified endpoints and invoke `done` once when all requests complete. The callback receives `(errors, payload1, payload2, ...)` where `errors` is an array of error values (empty entries for successful requests). Uses caching when configured — cache hits skip the network request entirely.

```ts
service.all(
  ["getUser", "getProfile"],
  (errors, userPayload, profilePayload) => {
    if (errors.length) {
      // handle errors
    }
    updater.digest({
      user: userPayload.get("response"),
      profile: profilePayload.get("response"),
    });
  },
);
```

#### one

<a id="service-one"></a>

```ts
one(
  attrs: string | Record<string, unknown> | (string | Record<string, unknown>)[],
  done: AnyFunc,
): ServiceInstance
```

Fetch all specified endpoints and invoke `done` once per completion. The callback receives `(error, payload, isLast, index)` for each request. This is useful for progressive UI updates as each response arrives.

```ts
service.one(["getUser", "getProfile"], (error, payload, isLast, index) => {
  // Called twice: once per endpoint
  if (isLast) {
    // All requests complete
  }
});
```

#### save

<a id="service-save"></a>

```ts
save(
  attrs: string | Record<string, unknown> | (string | Record<string, unknown>)[],
  done: AnyFunc,
): ServiceInstance
```

Like `all()`, but bypasses caching entirely. Forces a fresh network request for every endpoint. Use for write operations (POST, PUT, DELETE) where cached data is inappropriate.

```ts
service.save({ name: "saveUser", data: formData }, (errors, payload) => {
  if (!errors.length) {
    // Saved successfully; getUser cache was cleared by cleanKeys
  }
});
```

#### enqueue / dequeue

<a id="service-enqueue"></a>

```ts
enqueue(callback: AnyFunc): ServiceInstance
dequeue(...args: unknown[]): void
```

Manage a serial task queue. `enqueue` appends a callback and immediately attempts to dequeue. `dequeue` runs the next queued task if the instance is not busy and not destroyed. Tasks execute asynchronously via `setTimeout(0)`.

```ts
service.enqueue(() => {
  // This runs after the current request completes
  service.all(["getNext"], (errors, payload) => {
    /* ... */
  });
});
```

#### destroy

<a id="service-destroy"></a>

```ts
destroy(): void
```

Tear down the service instance: marks it as destroyed, clears the task queue, and prevents further requests. Any pending requests still in flight will complete but their callbacks will be ignored. Always call this when the owning view is destroyed.

```ts
ctx.on("destroy", () => service.destroy());
```

### Events

<a id="service-events"></a>

Both `ServiceApi` (static-level) and `ServiceInstance` (instance-level) expose `on`, `off`, and `fire` for event handling.

#### Static events (on ServiceApi)

The service type fires these lifecycle events:

- `"begin"` — fired when a new payload is created and its `before` hook has run. Event data: `{ payload }`.
- `"done"` — fired when a request completes successfully. Event data: `{ payload }`.
- `"fail"` — fired when a request encounters an error. Event data: `{ payload, error }`.
- `"end"` — fired after `done` or `fail`, as a final notification. Event data: `{ payload, error }`.

```ts
MyService.on("begin", ({ payload }) => {
  showLoading();
});

MyService.on("end", ({ payload, error }) => {
  hideLoading();
});

MyService.on("fail", ({ payload, error }) => {
  showError(error);
});
```

#### Instance events (on ServiceInstance)

Each instance has its own isolated emitter. Use it for instance-specific coordination without polluting the global service events.

```ts
const service = MyService.instance();
service.on("custom", (data) => {
  // handle custom event
});
service.fire("custom", { key: "value" });
```
