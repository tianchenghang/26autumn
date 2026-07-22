# State Management

Swifty-next offers a layered approach to state management, ranging from view-local data to global reactive stores and server-side data orchestration. Understanding the boundary between each layer is the key to building scalable applications on top of the framework.

This guide covers the four building blocks shipped in the `swifty-mvc` runtime: `State`, `Store`, `Updater`, and `Service`. Each section explains the mental model, the full public API, and the scenarios where that primitive is the right choice.

## Two Tiers of State Management

Applications built on swifty-mvc typically split their state into two categories:

Lightweight cross-view data. A handful of shared values such as the current user, a page title, a session token, or a feature flag. These values rarely drive complex derivations and are read by many views at once. The `State` singleton is purpose-built for this case.

Complex reactive state. Feature domains with their own handlers, derived values, multi-instance isolation, or internal reactions. A shopping cart, a filter panel with computed aggregations, or a collaborative editor all belong in a `Store`, which follows the Zustand-aligned API and supports selectors, subscriptions, and computed derivations.

As a rule of thumb: reach for `State` when you only need a shared bag of values. Reach for `Store` when the data comes with behavior, or when you want strict isolation between unrelated feature domains.

In addition to these two tiers, every view has its own `Updater` for view-local data, and `Service` handles anything that crosses the network boundary. Together, the four primitives cover the full state lifecycle from a keystroke in an input to a response coming back from the server.

## State: The Global Singleton

`State` is an observable in-memory object exported as a singleton from `swifty-mvc`. It is the simplest mechanism for sharing data across views and is intentionally minimal: `set`, `get`, `digest`, `diff`, `clean`, plus a small event surface.

### Writing Data

`State.set(data)` shallow-merges `data` into the internal state object. Mutations are accumulated until `State.digest()` is called, which then fires a single `changed` event carrying the full set of changed keys. Batching this way keeps multiple writes from producing multiple renders.

```ts
import { State } from "swifty-mvc";

State.set({ user: currentUser, title: "Dashboard" });
State.digest();
```

You can also pass the data directly to `digest`, which is equivalent to calling `set` and `digest` back to back:

```ts
State.digest({ user: currentUser, title: "Dashboard" });
```

Both `set` and `digest` accept an optional second argument, `excludes`, which is a `ReadonlySet<string>` of keys that should be written without being flagged as changed. This is useful when you want to prime a value without triggering a re-render.

```ts
const silent = new Set(["lastSyncedAt"]);
State.set({ lastSyncedAt: Date.now() }, silent);
State.digest();
```

### Reading Data

`State.get(key)` reads a single key. `State.get()` with no argument returns the entire data object.

```ts
const user = State.get<User>("user");
const all = State.get<AppState>();
```

Because `State` is a plain object under the hood, returned references are mutable. Treat them as read-only at the call site and always go through `set` + `digest` when updating.

### Observing Changes

Views subscribe to the `changed` event via the standard emitter surface:

```ts
State.on("changed", (e) => {
  console.log("Changed keys:", e.keys);
});
```

Inside a view setup function, prefer `ctx.observeState(keys)`, which wires the subscription to the view lifecycle and removes it automatically when the view is destroyed:

```ts
defineView((ctx) => {
  ctx.observeState("user,title");
  return {
    // view body
  };
});
```

### Inspecting the Last Change Set

`State.diff()` returns a `ReadonlySet<string>` of the keys that were mutated by the most recent `digest`. It is the recommended way to decide whether a view needs to react to a particular event:

```ts
State.on("changed", () => {
  const changed = State.diff();
  if (changed.has("user")) {
    refreshProfile();
  }
});
```

The set is stashed on every `digest` and stays stable until the next digest runs, so reading it inside an event handler is safe.

### Reference-Counted Cleanup

Shared keys often outlive the views that used them, which can leak memory if nobody ever removes them. `State.clean("keys")` returns a function that registers a destroy hook on the caller's context. When the last observer of a key is destroyed, the key's data is deleted from the state object automatically.

```ts
defineView((ctx) => {
  State.clean("user")(ctx);
  // view body
});
```

Internally, every key tracks a reference count of observers. The count is incremented when `clean` is called and decremented when the registered destroy hook fires. When the count reaches zero, both the key and its value are removed from the state object. This makes `State` safe to use even in highly dynamic micro-frontend scenarios where views are mounted and unmounted frequently.

## Store: Zustand-Aligned Reactive State

`Store` is the right primitive when your state has behavior. Defined via `createStore(name, creator)`, each store exposes a Zustand-aligned API: `getState`, `setState`, `subscribe`, and `destroy`. Stores are registered by name, so the same store can be retrieved from any view that needs it.

### Creating a Store

The creator function receives `set` and `get` callbacks and returns the initial state object. Functions in the returned object become actions; plain values become state.

```ts
import { createStore } from "swifty-mvc";

const counterStore = createStore("counter", (set, get) => ({
  count: 0,
  increment: () => set({ count: get().count + 1 }),
  decrement: () => set({ count: get().count - 1 }),
  reset: () => set({ count: 0 }),
}));
```

`createStore` runs the creator exactly once and registers the store under the given name. Subsequent calls with the same name overwrite the previous registration.

### Reading and Writing

`getState` returns the current snapshot. `setState` accepts either a partial object or an updater function and performs a shallow merge. Updates that do not actually change any value (determined via `Object.is`) are no-ops and do not notify listeners.

```ts
const { count } = counterStore.getState();

counterStore.setState({ count: 42 });

counterStore.setState((prev) => ({ count: prev.count + 1 }));
```

Writing to a key that holds an action or a computed value is silently ignored, so you can safely pass partial updates without worrying about clobbering behavior.

### Subscribing

`subscribe` attaches a listener that receives both the new state and the previous state. It returns an unsubscribe function.

```ts
const unsubscribe = counterStore.subscribe((state, prevState) => {
  if (state.count !== prevState.count) {
    renderCount(state.count);
  }
});

// Later
unsubscribe();
```

### Destroying a Store

`destroy` clears all listeners and removes the store from the global registry. Any further `setState` call becomes a no-op.

```ts
counterStore.destroy();
```

### Computed (Derived) State

`computed(deps, fn)` declares a derived value that recomputes automatically whenever any of its dependencies change through `setState`. The computation runs before listeners are notified, so subscribers always see a consistent snapshot.

```ts
import { createStore, computed } from "swifty-mvc";

const cartStore = createStore("cart", (set, get) => ({
  items: [] as CartItem[],
  total: computed(["items"], () =>
    get().items.reduce((sum, item) => sum + item.price * item.qty, 0),
  ),
  addItem: (item: CartItem) =>
    set((prev) => ({ items: [...prev.items, item] })),
}));
```

`deps` is a list of state key names. Computed keys cannot be written through `setState`; the framework silently drops such writes to protect the derivation.

### Binding a Store to a View

`bindStore(view, store, selector?)` wires a store to a Swifty view. On every state change, the selected slice is pushed into the view's `updater` and a digest is triggered. The subscription is automatically removed when the view is destroyed.

```ts
defineView((ctx) => {
  bindStore(ctx, cartStore, (state) => ({
    items: state.items,
    total: state.total,
  }));

  return {
    // view body
  };
});
```

If no selector is provided, `bindStore` forwards every non-function state key. Inside the `useStore` hook, the same behavior is available with a more ergonomic call site:

```ts
defineView((ctx) => {
  const state = useStore(counterStore);
  return {
    template,
    events: {
      "increment<click>"() {
        counterStore.setState({ count: state.count + 1 });
      },
    },
  };
});
```

## Updater: Per-View Data Binding

Every view owns its own `Updater`, created by `createUpdater(viewId)`. The updater is the bridge between view-local data and the DOM: it tracks changed keys, triggers re-renders through either the real-DOM diff or the VDOM reconciler, and exposes a stable API to hooks and templates.

The public surface is deliberately small:

```ts
updater.get<T>(key?)         // Read a key or the whole data object
updater.set(data, excludes?) // Shallow-merge data, tracking changes
updater.digest(data?, excludes?, callback?) // Flush changes and re-render
updater.forceDigest()        // Re-render regardless of change detection
updater.snapshot()           // Record the current version
updater.altered()            // True if version changed since last snapshot
updater.getChangedKeys()     // ReadonlySet of keys changed since last render
updater.translate(value)     // Resolve SPLITTER-prefixed ref tokens
updater.parse(expression)    // Safe path parser for template expressions
```

### Typical Usage Inside a View

Most views interact with the updater through the `useState` hook, which returns a getter/setter pair backed by `updater.data`:

```ts
defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "increment<click>"() {
        setCount(getCount() + 1);
      },
    },
  };
});
```

Under the hood, `useState` writes to `ctx.updater` and calls `digest`, which then re-renders only the parts of the template that reference changed keys.

### Snapshot and Altered

When an external caller (such as an `assign` method on a legacy view class) wants to know whether a view actually changed during a mutation, it can take a snapshot before the work and check `altered` after:

```ts
ctx.updater.snapshot();
applyMutations(ctx);
return ctx.updater.altered(); // true, false, or undefined if no snapshot was taken
```

The underlying `version` counter bumps every time `set` produces an actual change, so `altered` is a reliable signal even when many small writes happen inside the mutation block.

### Force Digest

`forceDigest` is primarily used by the HMR system. When a template is hot-swapped, the data has not changed but the view still needs to re-render against the new template. `forceDigest` marks every current key as changed and then triggers a normal digest.

```ts
if (import.meta.hot) {
  hotSwapByTemplate(moduleId, () => {
    ctx.updater.forceDigest();
  });
}
```

## Service: Data Orchestration

`Service` is the framework's answer to anything that crosses the network boundary. Built around the `createService(syncFn, cacheMax, cacheBuffer)` factory, it provides LFU caching, request deduplication, serial task queues, and a lifecycle event stream.

### Creating a Service Type

`createService` takes a transport function and optional cache parameters. The transport function receives a `Payload` and a completion callback, leaving the actual network call to the application.

```ts
import { createService } from "swifty-mvc";

const HttpService = createService(
  (payload, callback) => {
    fetch(payload.get<string>("url"), {
      method: payload.get<string>("method") ?? "GET",
      body: payload.data.body,
    })
      .then((res) => res.json())
      .then((json) => {
        payload.set("data", json);
        callback();
      })
      .catch((err) => callback(err));
  },
  40, // cacheMax
  10, // cacheBuffer
);
```

Every call to `createService` produces an isolated closure with its own metadata registry, payload cache, and pending-request table. You typically create one service per transport (HTTP, GraphQL, WebSocket bridge, and so on).

### Registering Endpoints

`add` registers one or more endpoint descriptors. Each descriptor has a `name`, a `url`, an optional `cache` TTL in milliseconds, and optional `before` / `after` hooks.

```ts
HttpService.add([
  { name: "getUser", url: "/api/user", cache: 60_000 },
  { name: "getOrders", url: "/api/orders", cache: 10_000 },
]);
```

### Fetching Data

An instance obtained via `HttpService.instance()` offers three fetching modes:

`all(attrs, done)` fires all requests in parallel and invokes `done` once when every request has settled. The callback receives an array of errors followed by one payload per request.

```ts
const service = HttpService.instance();
service.all(
  [{ name: "getUser" }, { name: "getOrders" }],
  (errors, user, orders) => {
    if (errors.length) return handleError(errors);
    render({ user: user.data, orders: orders.data });
  },
);
```

`one(attrs, done)` invokes `done` once per request as each response arrives, with `(error, payload, isLast, index)` arguments.

```ts
service.one(
  [{ name: "getUser" }, { name: "getOrders" }],
  (err, payload, isLast, idx) => {
    updateTile(idx, err, payload);
    if (isLast) enableInteractions();
  },
);
```

`save(attrs, done)` bypasses the cache entirely, forcing a fresh request regardless of TTL. It is intended for write operations.

```ts
service.save({ name: "updateProfile", body: form }, (errors, payload) => {
  if (!errors.length) State.digest({ user: payload.get("data") });
});
```

All three modes accept a string, an object, or an array. A plain string is treated as `{ name: string }`.

### LFU Cache with Frequency-Based Eviction

Each service type owns a bounded cache created by `createCache`. Entries track an access frequency counter and a last-access timestamp. When the cache grows beyond `cacheMax + cacheBuffer`, the `bufferSize` least-valuable entries are evicted in a single pass, preferring to keep the most frequently and recently accessed entries. This is strictly better than LRU for typical dashboard workloads where a handful of endpoints dominate the traffic.

Cache keys are derived from both the request attributes and the endpoint metadata, so the same endpoint called with different parameters produces distinct cache entries.

```ts
// Both requests are cached independently
service.all({ name: "getOrders", page: 1 }, renderPage1);
service.all({ name: "getOrders", page: 2 }, renderPage2);
```

### Request Deduplication

If two views request the same endpoint with the same attributes at the same time, `Service` fires a single network call and fans the response out to every waiter. The in-flight request is tracked in `pendingCacheKeys`; subsequent callers are appended to a list and invoked once the original call completes.

This behavior is transparent to the caller: the API surface remains the same whether the response comes from the cache, an in-flight request, or a fresh network call.

### Clearing the Cache

`clear(names)` evicts every cached payload associated with the given endpoint names. Use it after a mutation to invalidate stale reads.

```ts
service.save({ name: "createOrder", body: form }, () => {
  HttpService.clear("getOrders");
  refreshOrdersView();
});
```

### Lifecycle Events

Both the service type and each instance expose an emitter with four lifecycle events:

`begin` fires before the transport is invoked, carrying the prepared payload.

`done` fires when the transport completes successfully.

`fail` fires when the transport reports an error.

`end` fires after either `done` or `fail`, providing a single place for cleanup.

```ts
HttpService.on("begin", ({ payload }) => showSpinner(payload.get("name")));
HttpService.on("end", ({ payload }) => hideSpinner(payload.get("name")));
HttpService.on("fail", ({ payload, error }) => logError(payload, error));
```

### Serial Queues

For operations that must run one at a time (for example, sequential uploads or animations), `enqueue` appends a task to the instance's queue. `dequeue` drains the next task when the instance is idle.

```ts
const service = HttpService.instance();
service.enqueue(() => service.all({ name: "step1" }, () => service.dequeue()));
service.enqueue(() => service.all({ name: "step2" }, () => service.dequeue()));
service.dequeue();
```

Calling `destroy` on the instance cancels pending tasks and marks the instance as unusable. Always destroy long-lived instances in your view's destroy hook.

### Payload Wrapper

`createPayload(data?)` creates a mutable response wrapper that flows through the entire pipeline. `before` hooks write into it, the transport populates it, and `after` hooks transform it before the data reaches the view callback.

```ts
import { createPayload } from "swifty-mvc";

const payload = createPayload({ url: "/api/user" });
payload.set("method", "GET");
payload.get<string>("url"); // "/api/user"
```

## When to Use Which Approach

View-local UI state. Use the `Updater` through the `useState` hook. The data lives with the view, dies with the view, and never escapes into the global namespace.

Shared values with no behavior. Use `State`. A handful of primitives (`set`, `get`, `digest`, `diff`, `clean`) cover the common cases, and reference-counted cleanup keeps the memory footprint predictable.

Feature domains with behavior. Use `Store`. Actions, computed derivations, and selector-based view binding give you the ergonomics of Zustand with tight integration into the Swifty view lifecycle.

Anything on the network. Use `Service`. The combination of LFU caching, deduplication, lifecycle events, and serial queues removes most of the boilerplate that usually surrounds data fetching.

In practice, a typical view ends up touching all four: it reads shared flags from `State`, binds to a feature `Store`, stores ephemeral UI state in its `Updater`, and issues requests through a `Service`. Each primitive is small on its own; together they form the complete state management story of swifty-mvc.
