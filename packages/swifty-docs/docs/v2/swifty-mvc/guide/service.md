# Service Layer {#service-layer}

Network requests are a first-class concern in swifty-mvc. Rather than scattering `fetch` calls across views, the framework provides a dedicated Service layer that handles request orchestration, response caching, deduplication, lifecycle events, and serial task queues. All of these are delivered through a single factory function, `createService`, with no class, no `this`, and no prototype involved.

This guide covers the full Service API from the ground up: creating a service type, registering endpoint metadata, fetching data in different modes, working with payloads, listening to lifecycle events, managing the LFU cache, and integrating with Module Federation in a micro-frontend environment.

## Overview {#overview}

The Service layer sits between your views and the network. It wraps a transport function of your choice and adds four capabilities that would otherwise require substantial boilerplate:

LFU caching with frequency-based eviction. Responses are cached by a composite key derived from the request attributes and endpoint metadata. When the cache grows beyond its configured capacity, the least-frequently-accessed entries are removed first, keeping hot data available and cold data out of memory.

Request deduplication. If two views request the same endpoint with the same parameters at the same time, only one network call is made. Every waiter receives the response when it arrives.

Serial task queues. Operations that must run one at a time, such as sequential uploads or dependent API calls, can be enqueued on a service instance. The queue drains automatically when the instance is idle.

Lifecycle events. Every request passes through a `begin` / `done` / `fail` / `end` event stream. Both the service type (shared across all instances) and each individual instance emit these events, making it straightforward to wire up loading indicators, error logging, and analytics.

The entire Service module is a pure function factory. Calling `createService` produces an isolated closure with its own metadata registry, payload cache, pending-request table, and static emitter. Different service types never share state.

## Creating a Service Type {#creating-a-service-type}

`createService` is the single entry point. It accepts a transport function and two optional cache parameters.

```ts
import { createService } from "swifty-mvc";

const HttpService = createService(
  (payload, callback) => {
    const url = payload.get<string>("url");
    const method = payload.get<string>("method") ?? "GET";
    const body = payload.data.body;

    fetch(url, { method, body: body ? JSON.stringify(body) : undefined })
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

### Signature {#createservice-signature}

```ts
createService(
  syncFn: (payload: PayloadApi, callback: (error?: unknown) => void) => void,
  cacheMax?: number,
  cacheBuffer?: number,
): ServiceApi
```

The `syncFn` parameter is transport-agnostic. It receives a `PayloadApi` carrying the request metadata and parameters, plus a completion callback. Call `callback()` with no argument on success, or `callback(error)` on failure. This design lets you plug in any transport: `fetch`, `XMLHttpRequest`, a GraphQL client, a WebSocket bridge, or even a mock for testing.

The `cacheMax` parameter (default: 20) sets the maximum number of cached responses before eviction begins. The `cacheBuffer` parameter (default: 5) controls how many entries are evicted in a single pass. The cache capacity is `cacheMax + cacheBuffer`, meaning eviction fires when the cache reaches `cacheMax + cacheBuffer` entries and removes `cacheBuffer` entries at once. This amortized strategy avoids running the eviction algorithm on every single insertion.

Each call to `createService` returns a `ServiceApi` with the following methods:

| Method                   | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `add(attrs)`             | Register one or more endpoint metadata entries     |
| `meta(attrs)`            | Look up endpoint metadata by name                  |
| `create(attrs)`          | Build a payload without dispatching a request      |
| `get(attrs, createNew?)` | Get-or-create a payload, respecting cache          |
| `cached(attrs)`          | Read from cache only, returns undefined on miss    |
| `clear(names)`           | Evict cached payloads for the given endpoint names |
| `on(event, handler)`     | Listen to static lifecycle events                  |
| `off(event, handler?)`   | Remove a lifecycle event listener                  |
| `fire(event, data?)`     | Manually fire a lifecycle event                    |
| `instance()`             | Create a new service instance for fetching         |

## Service Configuration {#service-configuration}

Before a service can issue requests, it needs to know about the endpoints it serves. The `add` method registers endpoint metadata entries that describe how each request should be prepared, cached, and post-processed.

### add(attrs) {#add}

```ts
HttpService.add([
  { name: "getUser", url: "/api/user", cache: 60_000 },
  { name: "getOrders", url: "/api/orders", cache: 10_000 },
  { name: "createUser", url: "/api/user", cleanKeys: "getUser,getUsers" },
]);
```

`add` accepts a single entry or an array. Each entry is a `ServiceMetaEntry` with these fields:

| Field       | Type                            | Description                                                                                                                                                                 |
| ----------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`      | `string`                        | Unique endpoint identifier within this service type                                                                                                                         |
| `url`       | `string`                        | Request URL                                                                                                                                                                 |
| `cache`     | `number`                        | Cache TTL in milliseconds. 0 or omitted means no caching                                                                                                                    |
| `before`    | `(payload: PayloadApi) => void` | Hook that runs before the transport is invoked. Use it to transform request parameters, inject headers, or normalize data                                                   |
| `after`     | `(payload: PayloadApi) => void` | Hook that runs after a successful response, before the data reaches the view callback. Use it to reshape response data                                                      |
| `cleanKeys` | `string`                        | Comma-separated list of endpoint names whose cache should be cleared when this endpoint completes successfully. Useful for invalidating read caches after a write operation |

### The before Hook {#before-hook}

The `before` hook receives the payload after it has been populated with the endpoint metadata and the caller's request attributes. This is the place to add computed parameters, attach authentication tokens, or coerce types.

```ts
HttpService.add({
  name: "getUser",
  url: "/api/user",
  cache: 60_000,
  before(payload) {
    const userId = payload.get<string>("id");
    payload.set("url", `/api/user/${userId}`);
    payload.set("headers", { Authorization: `Bearer ${getToken()}` });
  },
});
```

If `before` throws, the error is caught by the framework and does not propagate to the transport. The request is still dispatched, but the payload will not contain whatever the hook was trying to set after the throw point.

### The after Hook {#after-hook}

The `after` hook runs only when the transport reports success. It receives the same payload, now populated with response data, and can reshape it before the view callback sees it.

```ts
HttpService.add({
  name: "getOrders",
  url: "/api/orders",
  after(payload) {
    const raw = payload.get<RawOrder[]>("data");
    payload.set("data", raw.map(normalizeOrder));
  },
});
```

### cleanKeys for Cache Invalidation {#cleankeys}

Write operations typically render read caches stale. The `cleanKeys` field automates this: when the endpoint completes without error, every cached payload associated with the listed endpoint names is evicted.

```ts
HttpService.add({
  name: "createOrder",
  url: "/api/orders",
  cleanKeys: "getOrders,getOrderStats",
});
```

After a successful `createOrder` call, any cached responses for `getOrders` and `getOrderStats` are removed, ensuring the next read fetches fresh data from the server.

## Service Instance {#service-instance}

Calling `HttpService.instance()` creates an independent service instance. Each instance has its own event emitter, its own serial task queue, and its own `busy` and `destroyed` flags. Instances share the service type's metadata registry and payload cache, but their operational state is fully isolated.

```ts
const service = HttpService.instance();
```

A service instance exposes three fetching modes and a task queue:

| Method              | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `all(attrs, done)`  | Fetch all requests, callback once when every request settles |
| `one(attrs, done)`  | Fetch all requests, callback per request as each settles     |
| `save(attrs, done)` | Fetch all requests, bypassing cache entirely                 |
| `enqueue(callback)` | Append a task to the serial queue                            |
| `dequeue(...args)`  | Drain the next task when idle                                |
| `destroy()`         | Cancel pending tasks and mark the instance unusable          |

### all(attrs, done) {#all}

`all` dispatches every request in `attrs` and invokes `done` exactly once when all of them have settled (either success or failure). The callback receives an array of errors as the first argument, followed by one payload per request.

```ts
const service = HttpService.instance();

service.all(
  [
    { name: "getUser", id: 42 },
    { name: "getOrders", page: 1 },
  ],
  (errors, user, orders) => {
    if (errors.length) {
      handleError(errors);
      return;
    }
    render({
      user: user.get("data"),
      orders: orders.get("data"),
    });
  },
);
```

The `attrs` argument is flexible. A plain string is treated as `{ name: string }`. A single object is wrapped in an array. An array can mix strings and objects.

```ts
// All three are equivalent
service.all("getUser", done);
service.all({ name: "getUser" }, done);
service.all([{ name: "getUser" }], done);
```

### one(attrs, done) {#one}

`one` dispatches every request but invokes `done` once per request as each response arrives. The callback receives four arguments: the error (or null), the payload, a boolean indicating whether this is the last response, and the zero-based index.

```ts
service.one(
  [{ name: "getUser" }, { name: "getOrders" }, { name: "getStats" }],
  (error, payload, isLast, index) => {
    if (error) {
      showError(index, error);
    } else {
      renderTile(index, payload.get("data"));
    }
    if (isLast) {
      enableInteractions();
    }
  },
);
```

This mode is ideal for dashboards where each tile loads independently and should render as soon as its data arrives, rather than waiting for the slowest request.

### save(attrs, done) {#save}

`save` behaves like `all` but bypasses the cache entirely. Every call produces a fresh network request regardless of TTL. This is the intended mode for write operations (POST, PUT, DELETE) where caching would be semantically wrong.

```ts
service.save({ name: "updateProfile", body: formData }, (errors, payload) => {
  if (!errors.length) {
    State.digest({ user: payload.get("data") });
  }
});
```

### Serial Task Queue {#serial-task-queue}

Some operations must run sequentially. File uploads that depend on each other, animation sequences, or a chain of API calls where each step uses the previous step's result are all natural fits for the serial queue.

`enqueue` appends a callback to the instance's task queue. `dequeue` drains the next task when the instance is idle. The queue respects the instance's `busy` and `destroyed` flags: tasks are not executed while the instance is busy or destroyed.

```ts
const service = HttpService.instance();

service.enqueue(async () => {
  await service.all({ name: "step1" }, (errors, payload) => {
    processStep1(payload);
    service.dequeue();
  });
});

service.enqueue(async () => {
  await service.all({ name: "step2" }, (errors, payload) => {
    processStep2(payload);
    service.dequeue();
  });
});

// Start draining the queue
service.dequeue();
```

Each task is executed with `setTimeout(..., 0)` scheduling, which prevents long chains from blocking the main thread. The `busy` flag is set to 1 while a task runs and reset to 0 when it completes, ensuring strict sequential execution.

## Payload API {#payload-api}

A Payload is a mutable wrapper around a data object. It is the data carrier that flows through the entire Service pipeline: `before` hooks write into it, the transport populates it, `after` hooks transform it, and the view callback reads from it.

### createPayload {#createpayload}

`createPayload` is exported from `swifty-mvc` and can be used directly, though most payloads are created internally by the Service module.

```ts
import { createPayload } from "swifty-mvc";

const payload = createPayload({ url: "/api/user" });
```

### Reading Data with get {#payload-get}

`payload.get<T>(key)` retrieves a value by key, with an optional type parameter for type safety.

```ts
const url = payload.get<string>("url");
const data = payload.get<UserResponse>("data");
const count = payload.get<number>("count");
```

### Writing Data with set {#payload-set}

`payload.set` supports three calling conventions:

```ts
// Key-value pair
payload.set("method", "POST");

// Object merge
payload.set({
  method: "POST",
  headers: { "Content-Type": "application/json" },
});

// Endpoint metadata (used internally)
payload.set(metaEntry);
```

`set` returns the payload itself, enabling method chaining:

```ts
payload.set("method", "POST").set("url", "/api/data");
```

### Direct Data Access {#payload-data}

The `payload.data` property is the underlying data object. The transport function typically writes response data here:

```ts
const HttpService = createService((payload, callback) => {
  fetch(payload.get<string>("url"))
    .then((res) => res.json())
    .then((json) => {
      payload.set("data", json);
      callback();
    });
});
```

### cacheInfo {#payload-cacheinfo}

When a payload is associated with a cacheable endpoint, the framework attaches a `cacheInfo` object:

```ts
interface ServiceCacheInfo {
  name: string; // Endpoint name
  after?: AnyFunc; // Reference to the after hook
  cleans?: string; // cleanKeys value
  key: string; // Composite cache key
  time: number; // Timestamp when cached (Date.now())
}
```

This is primarily used internally for TTL checks and cache invalidation, but it is available for inspection when debugging.

## Service Events {#service-events}

Both the service type (static level) and each service instance emit lifecycle events. The static emitter is shared across all instances of a service type, making it suitable for global concerns like loading indicators and error logging. The instance emitter is local to one instance, suitable for per-view concerns.

### Event Types {#event-types}

| Event   | When                             | Payload              |
| ------- | -------------------------------- | -------------------- |
| `begin` | Before the transport is invoked  | `{ payload }`        |
| `done`  | Transport completes successfully | `{ payload }`        |
| `fail`  | Transport reports an error       | `{ payload, error }` |
| `end`   | After either `done` or `fail`    | `{ payload, error }` |

The `end` event always fires after `done` or `fail`, providing a single place for cleanup logic that must run regardless of success or failure.

### Static (Service-Type-Level) Events {#static-events}

Static events are emitted by the `ServiceApi` and heard by every listener registered on the service type. They are ideal for global UI concerns.

```ts
HttpService.on("begin", ({ payload }) => {
  showSpinner(payload.get<string>("name"));
});

HttpService.on("end", ({ payload }) => {
  hideSpinner(payload.get<string>("name"));
});

HttpService.on("fail", ({ payload, error }) => {
  logError({
    endpoint: payload.get<string>("name"),
    error,
    timestamp: Date.now(),
  });
});
```

### Instance-Level Events {#instance-events}

Instance events use the same emitter API but are scoped to a single instance. This is useful when a specific view needs to react to its own requests without hearing about requests from other views.

```ts
const service = HttpService.instance();

service.on("begin", () => {
  ctx.updater.set({ loading: true });
  ctx.updater.digest();
});

service.on("end", () => {
  ctx.updater.set({ loading: false });
  ctx.updater.digest();
});

service.all({ name: "getUser" }, (errors, user) => {
  // ...
});
```

### Removing Listeners {#removing-listeners}

`off` removes a specific handler, or all handlers for an event if no handler is provided:

```ts
HttpService.off("begin", specificHandler);
HttpService.off("begin"); // removes all begin listeners
```

## Cache Management {#cache-management}

The Service layer uses an LFU (Least Frequently Used) cache implemented by `createCache`. Unlike LRU, which evicts the oldest entry regardless of how often it is accessed, LFU tracks an access frequency counter and a last-access timestamp for every entry. This produces strictly better results for typical dashboard workloads where a small number of endpoints dominate the traffic.

### Cache Architecture {#cache-architecture}

The cache maintains a flat array of entries alongside a `Map` for O(1) lookups. Each entry stores:

| Field           | Type     | Description                                           |
| --------------- | -------- | ----------------------------------------------------- |
| `originalKey`   | `string` | The unmodified cache key                              |
| `value`         | `T`      | The cached payload                                    |
| `frequency`     | `number` | Access counter, incremented on every `get`            |
| `lastTimestamp` | `number` | Monotonically increasing counter from the last access |

### Eviction Strategy {#eviction-strategy}

When the number of entries reaches `maxSize + bufferSize`, the cache evicts `bufferSize` entries in a single pass. The eviction algorithm uses single-pass partial selection with O(n \* k) complexity, where n is the number of entries and k is the buffer size. This is more efficient than sorting the entire array (O(n log n)) for the typical buffer size of 5.

The comparator ranks entries by frequency first and recency second:

```ts
function sortCacheEntries(a, b) {
  return b.frequency - a.frequency || b.lastTimestamp - a.lastTimestamp;
}
```

Entries with the lowest frequency and the oldest timestamp are evicted first.

### Cache Key Derivation {#cache-key-derivation}

Cache keys are derived from both the request attributes and the endpoint metadata:

```ts
function defaultCacheKey(meta, attrs) {
  return JSON.stringify(attrs) + SPLITTER + JSON.stringify(meta);
}
```

This composite key ensures that the same endpoint called with different parameters produces distinct cache entries:

```ts
// Two separate cache entries
service.all({ name: "getOrders", page: 1 }, renderPage1);
service.all({ name: "getOrders", page: 2 }, renderPage2);
```

The endpoint metadata JSON is cached in a `WeakMap` keyed by the meta object reference, avoiding repeated `JSON.stringify` calls for the same endpoint on every request.

### TTL Expiration {#ttl-expiration}

When a cached payload is retrieved, the framework checks whether the TTL has expired:

```ts
if (Date.now() - cachedPayload.cacheInfo.time > cache) {
  payloadCache.del(cacheKey);
  return undefined; // cache miss, fetch fresh
}
```

The TTL is configured per-endpoint via the `cache` field in the metadata entry and can be overridden per-request by passing a `cache` property in the request attributes.

### Manual Cache Clearing {#manual-cache-clearing}

`clear(names)` evicts every cached payload associated with the given endpoint names. Accepts a single name or a comma-separated string.

```ts
// Clear a single endpoint
HttpService.clear("getOrders");

// Clear multiple endpoints
HttpService.clear("getUser,getOrders,getStats");
```

This is typically called after a mutation to invalidate stale read caches, though the `cleanKeys` metadata field can automate this for common patterns.

### Frequency Tracking {#frequency-tracking}

Every `get` operation bumps the entry's frequency counter and updates its last-access timestamp. This means frequently accessed data accumulates a high frequency score, protecting it from eviction even when many new entries are added. Infrequently accessed data naturally migrates toward the eviction boundary.

The timestamp uses a monotonically increasing counter rather than `Date.now()`, which avoids clock-skew issues and provides a reliable total ordering of accesses.

## Request Deduplication {#request-deduplication}

When two views request the same endpoint with the same attributes simultaneously, the Service layer fires a single network call and fans the response out to every waiter. The in-flight request is tracked in `pendingCacheKeys`; subsequent callers are appended to a list and invoked once the original call completes.

```ts
// View A requests user data
serviceA.all({ name: "getUser", id: 42 }, renderA);

// View B requests the same data before the first call completes
serviceB.all({ name: "getUser", id: 42 }, renderB);

// Only one fetch call is made. Both renderA and renderB
// receive the same payload when the response arrives.
```

This behavior is transparent to the caller. The API surface remains the same whether the response comes from the cache, an in-flight request, or a fresh network call. Deduplication is based on the same composite cache key used for caching, so different parameters produce independent requests.

## Resource Management {#resource-management}

Service instances hold resources: a task queue, an event emitter, and references to in-flight requests. In a long-running application, instances created inside a view must be destroyed when the view is unmounted to prevent memory leaks and stale callbacks.

### ctx.capture {#ctx-capture}

The recommended pattern is to bind the service instance to the view's lifecycle using `ctx.capture`. The `capture` method stores the instance in the view's resource map and returns it. When the view is destroyed, all captured resources are cleaned up automatically.

```ts
defineView("dashboard", (ctx) => {
  const service = ctx.capture("api", HttpService.instance());

  service.all(
    [{ name: "getUser" }, { name: "getOrders" }],
    (errors, user, orders) => {
      if (!errors.length) {
        ctx.updater.set({
          user: user.get("data"),
          orders: orders.get("data"),
        });
        ctx.updater.digest();
      }
    },
  );

  return {
    template,
  };
});
```

The first argument to `capture` is a string key that identifies the resource within the view. The second is the resource itself. The optional third argument, `destroyOnRender`, controls whether the resource is destroyed when the view re-renders (default: false).

### Manual Destruction {#manual-destruction}

If you manage the instance outside of a view's lifecycle, call `destroy` explicitly:

```ts
const service = HttpService.instance();
service.all({ name: "longRunning" }, handleResult);

// Later, when the instance is no longer needed
service.destroy();
```

`destroy` sets the instance's `destroyed` flag to 1 and clears the task queue. Any pending requests will still complete, but their callbacks will be skipped because the instance checks `destroyed` before invoking user code. Any subsequent calls to `all`, `one`, `save`, or `enqueue` become no-ops.

## Integration with Module Federation {#module-federation}

In a micro-frontend architecture, multiple independently deployed applications share the same page. Each remote application may define its own service types, and the host application needs to coordinate caching and events across them.

### Service Types as Shared Singletons {#shared-singletons}

The simplest approach is to create service types in a shared module that both the host and remotes import. Because `createService` produces closure-based state, the same module imported by different remotes produces the same service type with the same cache and metadata registry.

```ts
// shared/services.ts (in a shared package or MF shared scope)
import { createService } from "swifty-mvc";

export const HttpService = createService(transport, 40, 10);
```

```ts
// remote-app/views/dashboard.ts
import { HttpService } from "shared/services";

HttpService.add({ name: "getRemoteData", url: "/api/remote/data" });
```

```ts
// host-app/views/home.ts
import { HttpService } from "shared/services";

HttpService.add({ name: "getHostData", url: "/api/host/data" });
```

Both remotes and the host register their endpoints on the same service type. The shared cache means that if two remotes happen to request the same endpoint with the same parameters, they benefit from deduplication and caching transparently.

### Per-Remote Service Isolation {#per-remote-isolation}

When stronger isolation is needed, each remote can create its own service type. This gives each remote an independent cache and metadata registry, preventing one remote's cache from interfering with another's.

```ts
// remote-app/services.ts
import { createService } from "swifty-mvc";

export const RemoteService = createService(transport, 20, 5);
RemoteService.add([
  { name: "getRemoteData", url: "/api/remote/data", cache: 30_000 },
]);
```

### Framework.require and Async Loading {#framework-require}

The framework's `require` configuration option integrates with Module Federation's dynamic loading. When a view from a remote application is requested, `Framework.require` loads the remote's entry chunk and resolves the view module. Service types defined in the remote's module scope are initialized at that point.

```ts
Framework.boot({
  rootId: "root",
  require(names, params) {
    // Delegate to Webpack Module Federation or Rspack
    return Promise.all(
      names.map((name) => import(/* webpackIgnore: true */ name)),
    );
  },
});
```

Because service types are closures rather than global singletons, they initialize cleanly regardless of load order. A remote loaded lazily gets its own fully initialized service type the moment its module executes.

### Cross-Application Event Coordination {#cross-app-events}

Static events on a shared service type are visible to every application that imports it. The host can listen for all requests across all remotes:

```ts
// host-app/bootstrap.ts
import { HttpService } from "shared/services";

HttpService.on("fail", ({ payload, error }) => {
  globalErrorReporter({
    source: payload.get<string>("name"),
    error,
    app: Framework.getConfig("projectName"),
  });
});
```

Each remote can also listen to its own instance-level events for view-specific concerns without polluting the global event stream.

## Error Handling {#error-handling}

Errors flow through the Service layer in two channels: the `fail` event and the error argument in callbacks.

### Callback Errors {#callback-errors}

In `all` mode, the first argument to the callback is an array of errors. The array is sparse: positions corresponding to successful requests hold `undefined`, while failed requests hold the error value.

```ts
service.all(
  [{ name: "getUser" }, { name: "getOrders" }],
  (errors, user, orders) => {
    // errors is an array: [undefined, Error("network")] if orders failed
    const failed = errors.filter(Boolean);
    if (failed.length) {
      showPartialError(failed);
    }
    // Successful payloads are still available
    if (user) renderUser(user.get("data"));
  },
);
```

In `one` mode, the first argument is the error for that specific request, or null on success.

```ts
service.one(
  [{ name: "getUser" }, { name: "getOrders" }],
  (error, payload, isLast, index) => {
    if (error) {
      showErrorForTile(index, error);
    } else {
      renderTile(index, payload.get("data"));
    }
  },
);
```

### Event-Based Error Handling {#event-based-errors}

The `fail` event fires for every request error, providing a centralized error handling point:

```ts
HttpService.on("fail", ({ payload, error }) => {
  const endpoint = payload.get<string>("name");
  analytics.track("api_error", { endpoint, error: String(error) });
});
```

### Transport-Level Errors {#transport-errors}

The transport function decides what constitutes an error. A 404 response might be an error in one application and a valid empty state in another. The transport should call `callback(error)` for anything it considers a failure:

```ts
const HttpService = createService((payload, callback) => {
  fetch(payload.get<string>("url"))
    .then((res) => {
      if (!res.ok) {
        callback(new Error(`HTTP ${res.status}: ${res.statusText}`));
        return;
      }
      return res.json();
    })
    .then((json) => {
      if (json) {
        payload.set("data", json);
        callback();
      }
    })
    .catch(callback);
});
```

## Complete Example {#complete-example}

A full example tying together the major concepts:

```ts
import { createService, defineView, State } from "swifty-mvc";

// 1. Create the service type
const HttpService = createService(
  (payload, callback) => {
    const url = payload.get<string>("url");
    const method = payload.get<string>("method") ?? "GET";
    const body = payload.data.body;

    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        payload.set("data", json);
        callback();
      })
      .catch(callback);
  },
  30, // cacheMax
  5, // cacheBuffer
);

// 2. Register endpoints
HttpService.add([
  {
    name: "getUser",
    url: "/api/user",
    cache: 60_000,
    before(payload) {
      payload.set("url", `/api/user/${payload.get("id")}`);
    },
  },
  {
    name: "getOrders",
    url: "/api/orders",
    cache: 10_000,
    after(payload) {
      const data = payload.get<Order[]>("data");
      payload.set(
        "data",
        data.sort((a, b) => b.date - a.date),
      );
    },
  },
  {
    name: "createOrder",
    url: "/api/orders",
    cleanKeys: "getOrders",
  },
]);

// 3. Global event listeners
HttpService.on("begin", () => State.digest({ globalLoading: true }));
HttpService.on("end", () => State.digest({ globalLoading: false }));
HttpService.on("fail", ({ error }) => console.error("API error:", error));

// 4. Use in a view
export default defineView((ctx) => {
  const service = ctx.capture("api", HttpService.instance());

  service.all(
    [{ name: "getUser", id: 42 }, { name: "getOrders" }],
    (errors, user, orders) => {
      if (errors.filter(Boolean).length) return;
      ctx.updater.set({
        user: user.get("data"),
        orders: orders.get("data"),
      });
      ctx.updater.digest();
    },
  );

  return {
    template,
    events: {
      "createOrder<click>"() {
        service.save(
          { name: "createOrder", body: { item: "widget", qty: 3 } },
          (errors) => {
            if (!errors.length) {
              // getOrders cache is auto-cleared by cleanKeys
              service.all({ name: "getOrders" }, (e, fresh) => {
                ctx.updater.set({ orders: fresh.get("data") });
                ctx.updater.digest();
              });
            }
          },
        );
      },
    },
  };
});
```

## API Summary {#api-summary}

### createService(syncFn, cacheMax?, cacheBuffer?) {#api-createservice}

Creates a service type with isolated cache, metadata, and events.

### ServiceApi {#api-serviceapi}

| Method                   | Description                            |
| ------------------------ | -------------------------------------- |
| `add(attrs)`             | Register endpoint metadata             |
| `meta(attrs)`            | Look up metadata by name               |
| `create(attrs)`          | Build a payload without fetching       |
| `get(attrs, createNew?)` | Get-or-create a payload                |
| `cached(attrs)`          | Read from cache only                   |
| `clear(names)`           | Evict cached payloads by endpoint name |
| `on(event, handler)`     | Listen to static lifecycle events      |
| `off(event, handler?)`   | Remove a static event listener         |
| `fire(event, data?)`     | Fire a static event                    |
| `instance()`             | Create a service instance              |

### ServiceInstance {#api-serviceinstance}

| Method                 | Description                               |
| ---------------------- | ----------------------------------------- |
| `all(attrs, done)`     | Fetch all, callback once with all results |
| `one(attrs, done)`     | Fetch all, callback per result            |
| `save(attrs, done)`    | Fetch all, bypass cache                   |
| `enqueue(callback)`    | Add task to serial queue                  |
| `dequeue(...args)`     | Drain next task                           |
| `destroy()`            | Cancel pending work                       |
| `on(event, handler)`   | Listen to instance events                 |
| `off(event, handler?)` | Remove an instance event listener         |
| `fire(event, data?)`   | Fire an instance event                    |

### PayloadApi {#api-payloadapi}

| Method            | Description                                 |
| ----------------- | ------------------------------------------- |
| `get<T>(key)`     | Read a value by key                         |
| `set(key, value)` | Write a key-value pair                      |
| `set(data)`       | Merge an object into the payload            |
| `data`            | Direct access to the underlying data object |
| `cacheInfo`       | Cache metadata (when applicable)            |

### Lifecycle Events {#api-lifecycle-events}

| Event   | Fires                       |
| ------- | --------------------------- |
| `begin` | Before transport invocation |
| `done`  | On successful completion    |
| `fail`  | On error                    |
| `end`   | After `done` or `fail`      |
