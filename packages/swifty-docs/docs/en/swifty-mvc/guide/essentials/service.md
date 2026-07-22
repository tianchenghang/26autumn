---
title: Service
description: API request management with LFU caching, request deduplication, and before/after hooks.
---

# Service {#service}

The Service system provides a structured way to manage API requests in Swifty MVC. It includes built-in LFU caching, request deduplication, and before/after hooks for transforming request and response data.

## Creating a service {#creating-a-service}

```ts
import { createService } from "@swifty.js/mvc";

const userService = createService(async (params) => {
  const response = await fetch(`/api/users/${params.id}`);
  return response.json();
});
```

`createService` takes an async function and optional cache configuration:

```ts
const service = createService(
  asyncFn,
  cacheMax, // max cache entries (default: 20)
  cacheBuffer, // buffer size for eviction (default: 5)
);
```

## Calling a service {#calling-a-service}

Services return `ServiceInstance` objects when called:

```ts
const instance = userService({ id: 42 });

instance.on("success", (data) => {
  console.log("User:", data);
});

instance.on("error", (error) => {
  console.error("Failed:", error);
});
```

### ServiceInstance lifecycle {#instance-lifecycle}

A `ServiceInstance` goes through these states:

1. Created — the service function has been called but the request has not started
2. Pending — the async function is executing
3. Success — the function resolved with data
4. Error — the function threw or rejected

Events:

- `success` — fires with the response data
- `error` — fires with the error
- `complete` — fires after success or error

### Service API events {#api-events}

The service itself (not the instance) also fires events:

```ts
userService.on("success", (data) => {
  // Fires on every successful call to this service
});

userService.on("error", (error) => {
  // Fires on every failed call to this service
});
```

## Caching {#caching}

Services include an LFU (Least Frequently Used) cache that stores responses by parameter key:

```ts
const userService = createService(
  async (params) => {
    const res = await fetch(`/api/users/${params.id}`);
    return res.json();
  },
  50, // max 50 entries
  10, // buffer of 10 before eviction kicks in
);
```

### Cache behavior {#cache-behavior}

- Cache keys are derived from the parameters object (JSON-serialized)
- On cache hit, the `success` event fires immediately with the cached data — no network request is made
- On cache miss, the async function executes and the result is stored in the cache
- When the cache reaches capacity (`maxSize + bufferSize`), the `bufferSize` least frequently accessed entries are evicted, bringing the size back down to `maxSize`

### Cache resolution order {#cache-resolution}

When a service is called:

1. Check the LFU cache for a matching key
2. If found, fire `success` with cached data and return
3. If not found, check for a pending in-flight request with the same key
4. If found, attach listeners to the existing request (deduplication)
5. If no pending request, execute the async function

### Clearing the cache {#clearing-cache}

```ts
// Clear via cleanKeys in service metadata
const createUser = createService(
  async (data) => {
    return fetch("/api/users", { method: "POST", body: JSON.stringify(data) });
  },
  0,
  0,
  {
    cleanKeys: "userList",
  },
);
// After createUser completes, the 'userList' cache entry is invalidated
```

## Before and after hooks {#hooks}

Service metadata supports `before` and `after` hooks for transforming data:

```ts
// The before hook transforms request parameters before the async function runs
// The after hook transforms the response data before success listeners receive it
```

## Payload {#payload}

`createPayload` wraps API response data with a mutable payload object:

```ts
import { createPayload } from "@swifty.js/mvc";

const payload = createPayload({ users: [], total: 100 });
```

### PayloadApi {#payload-api}

```ts
interface PayloadApi {
  get<T = unknown>(key: string): T;
  set(keyOrData: string | Record<string, unknown>, value?: unknown): PayloadApi;
  data: Record<string, unknown>;
  cacheInfo?: ServiceCacheInfo;
}
```

| Method/Property          | Description                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `get<T>(key)`            | Retrieve a value by key from the payload data                                                 |
| `set(keyOrData, value?)` | Set a key-value pair or merge an object into the payload. Returns the PayloadApi for chaining |
| `data`                   | Direct access to the underlying data object                                                   |
| `cacheInfo?`             | Cache metadata (set internally when caching is enabled)                                       |

```ts
payload.get("users"); // []
payload.set("page", 2); // returns payload for chaining
payload.set({ page: 2, limit: 50 }); // merge object
payload.data; // { users: [], total: 100, page: 2, limit: 50 }
```

## Integration with views {#view-integration}

Services are typically used in views with `wrapAsync` for safe async handling:

```ts
export default defineView((ctx) => {
  const [getUsers, setUsers] = useState("users", []);
  const [getLoading, setLoading] = useState("loading", false);

  const safeSetUsers = ctx.wrapAsync((data) => {
    setUsers(data);
    setLoading(false);
  });

  function loadUsers() {
    setLoading(true);
    const instance = userService({ page: 1 });
    instance.on("success", safeSetUsers);
    instance.on("error", (err) => {
      setLoading(false);
      console.error(err);
    });
  }

  return {
    template,
    events: {
      "loadBtn<click>"() {
        loadUsers();
      },
    },
  };
});
```

### With useEffect {#with-use-effect}

For loading data on mount:

```ts
export default defineView((ctx) => {
  const [getData, setData] = useState("data", null);

  useEffect(() => {
    const safeSetData = ctx.wrapAsync((data) => {
      setData(data);
    });

    const instance = apiService({ id: ctx.owner.params.id });
    instance.on("success", safeSetData);
  });

  return { template };
});
```

## Service patterns {#patterns}

### Singleton service {#singleton-service}

```ts
// services.ts
export const fetchUser = createService(async ({ id }) => {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

export const updateUser = createService(
  async ({ id, data }) => {
    const res = await fetch(`/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  0,
  0,
  {
    cleanKeys: "userDetail", // invalidate user detail cache after update
  },
);
```

### Optimistic updates {#optimistic-updates}

```ts
function toggleFavorite(itemId) {
  // Immediately update UI
  const current = State.get("favorites");
  const updated = current.includes(itemId)
    ? current.filter((id) => id !== itemId)
    : [...current, itemId];
  State.set({ favorites: updated });
  State.digest();

  // Send request
  const instance = toggleFavoriteService({ id: itemId });
  instance.on("error", () => {
    // Revert on failure
    State.set({ favorites: current });
    State.digest();
  });
}
```

## LFU cache details {#lfu-cache}

The cache used by Service is the same `createCache` primitive available as a standalone utility:

```ts
import { createCache } from "@swifty.js/mvc";

const cache = createCache({
  maxSize: 100,
  bufferSize: 20,
  onRemove: (key) => {
    console.log("Evicted:", key);
  },
});

cache.set("key", { data: "value" });
cache.get("key"); // { data: 'value' }
cache.has("key"); // true
cache.getSize(); // 1
cache.del("key"); // remove specific entry
cache.clear(); // remove all entries
```

The LFU eviction strategy tracks access frequency. When the cache reaches capacity (`maxSize + bufferSize`), the `bufferSize` entries with the lowest access count are evicted, bringing the size back down to `maxSize`. This avoids thrashing by not evicting on every single insert.

## Next steps {#next-steps}

- [Template Syntax](/docs/en/swifty-mvc/guide/essentials/template-syntax) — complete template operator reference
- [State Management](/docs/en/swifty-mvc/guide/essentials/state) — State and Store for client-side data
- [Cache API](/docs/en/swifty-mvc/api-reference/cache) — createCache reference
