# Event System API Reference

This page documents the three event-related subsystems that form the foundation of swifty-mvc's event handling architecture: the DOM EventDelegator, the programmatic Event Emitter, and the LFU Cache. All three are designed for minimal memory overhead and predictable lifecycle management.

## EventDelegator

The EventDelegator is a module-level singleton exported from `event-delegator.ts`. It manages all DOM event delegation for the application by attaching a single capture-phase listener per event type on `document.body`, rather than attaching listeners to individual elements.

### Architecture Overview

Unlike traditional frameworks that attach listeners to individual DOM elements, swifty-mvc uses a single capture-phase listener per event type on `document.body`. This approach provides several advantages:

- Memory efficiency: no per-element listener objects to garbage-collect.
- Automatic lifecycle: listeners are attached when the first view needs an event type and removed when the last view releases it.
- No stale references: destroyed views cannot leak listeners because the delegator never holds direct element references.

When a DOM event fires, the delegator walks from `event.target` upward through the DOM tree, resolving view boundaries and matching registered handlers at each level. The walk stops at the first Frame whose view has a template, preventing cross-view event leaking.

### Reference Counting

The delegator maintains two counters per event type:

- `rootEvents[eventType]`: total number of views that have bound this event type.
- `selectorEvents[eventType]`: number of those bindings that use CSS-selector delegation.

When the first view calls `bind("click")`, the delegator attaches a single capture-phase listener:

```js
document.body.addEventListener("click", domEventProcessor, true);
```

When a second view also binds `"click"`, the counter increments but no additional listener is attached. Only when the counter returns to zero via `unbind` calls is the listener removed.

### Single Capture-Phase Listener

All DOM events are captured in the capture phase (`useCapture: true`), meaning the delegator sees events before they reach their target element. This allows the framework to:

1. Resolve the owning Frame before the event reaches application code.
2. Intercept events at view boundaries for range-event support.
3. Respect `stopPropagation()` across Frame boundaries.

### Interface

```ts
interface EventDelegatorApi {
  bind(eventType: string, hasSelector?: boolean): void;
  unbind(eventType: string, hasSelector?: boolean): void;
  clearRangeEvents(viewId: string): void;
  setFrameGetter(getter: (id: string) => FrameObj | undefined): void;
  nextElementGuid(): number;
}
```

### bind

Register interest in an event type on `document.body`. Uses reference counting so that multiple views registering the same event type do not attach duplicate listeners, and a single unbind does not remove a listener still needed by another view.

Parameters:

- `eventType`: DOM event type such as `"click"`, `"input"`, `"keydown"`.
- `hasSelector`: whether this binding uses CSS-selector delegation (e.g., `$selector<click>`). Defaults to `false`.

The `hasSelector` flag enables the selector-event resolution path in `findFrameInfo`. When no views use selector events for a given type, that resolution path is skipped for performance.

Example:

```js
import { EventDelegator } from "swifty-mvc";

// Register a click listener (first call attaches to document.body)
EventDelegator.bind("click");

// Register a second click listener (counter increments, no new listener)
EventDelegator.bind("click");

// Register a click listener with selector delegation
EventDelegator.bind("click", true);
```

### unbind

Deregister interest in an event type from `document.body`. Decrements the reference counter; the capture-phase listener is only removed when the counter reaches zero.

Parameters:

- `eventType`: DOM event type to unbind.
- `hasSelector`: whether this binding used CSS-selector delegation. Defaults to `false`.

Example:

```js
// Unbind a click listener (counter decrements)
EventDelegator.unbind("click");

// When counter reaches zero, listener is removed from document.body
EventDelegator.unbind("click");
```

### clearRangeEvents

Remove all range-event registrations for a destroyed view. Range events stop propagation at view boundaries. When a view is destroyed, its range-event entries must be cleaned up to prevent leaks.

Parameters:

- `viewId`: the Frame ID of the destroyed view.

Example:

```js
// Called automatically when a view is destroyed
EventDelegator.clearRangeEvents("frame-123");
```

### setFrameGetter

Inject the Frame lookup function. Called by `Framework.boot` so the delegator can resolve DOM element IDs to `FrameObj` instances without importing `frame.ts` directly (avoiding a circular dependency).

Parameters:

- `getter`: a function that takes a Frame ID and returns the corresponding FrameObj, or undefined if not found.

This method is called internally by the framework during initialization and should not be called directly by application code.

### nextElementGuid

Allocate the next element GUID for range-event tagging. Each element that participates in range events gets a unique numeric ID so the delegator can track it independently of DOM element identity.

Returns a unique numeric ID.

Example:

```js
const guid = EventDelegator.nextElementGuid();
element.setAttribute("data-range-guid", String(guid));
```

## Event Emitter

The Event Emitter is a factory function that creates multi-cast event emitter objects. It replaces the former class-based `EventEmitter` with a functional API.

### createEmitter

```js
import { createEmitter } from "swifty-mvc";

const emitter = createEmitter<T>();
```

Create a multi-cast event emitter. The emitter supports the `on{EventName}` convention: setting `emitter.onDestroy = fn` causes `fire("destroy", ...)` to call `fn`. This is how View, Frame, Router, and State lifecycle callbacks work.

Returns an `EmitterApi<T>` object with `on`, `off`, `fire` methods.

Example:

```js
import { createEmitter } from "swifty-mvc";

const emitter = createEmitter();

// Subscribe
emitter.on("change", (e) => {
  console.log("changed:", e.type, e.key, e.value);
});

// Unsubscribe
emitter.off("change", handler);

// Emit
emitter.fire("change", { key: "name", value: "Alice" });
```

### on

```js
emitter.on(event: string, handler: (e: ChangeEvent) => void): EmitterApi<T>
```

Subscribe to an event. The handler receives a `ChangeEvent` object with at least a `type` property set to the event name.

Parameters:

- `event`: the event name (e.g., `"change"`, `"destroy"`).
- `handler`: callback function that receives the event object.

Returns the emitter for chaining.

Example:

```js
const handler = (e) => {
  console.log("User logged in:", e.userId);
};

emitter.on("user:login", handler);
```

### off

```js
emitter.off(event: string, handler?: AnyFunc): EmitterApi<T>
```

Unsubscribe from an event. If `handler` is provided, only that handler is removed. If `handler` is omitted, all handlers for the event are removed.

Parameters:

- `event`: the event name to unsubscribe from.
- `handler`: optional handler function to remove. If omitted, removes all handlers.

Returns the emitter for chaining.

Re-entrant safety: if `off` is called while `fire` is iterating the listener list, the removal is deferred until the outermost `fire` completes. This prevents skipped handlers and broken iteration.

Example:

```js
// Remove a specific handler
emitter.off("user:login", handler);

// Remove all handlers for an event
emitter.off("user:login");
```

### fire

```js
emitter.fire(
  event: string,
  data?: Record<string, unknown>,
  remove?: boolean,
  lastToFirst?: boolean
): EmitterApi<T>
```

Emit an event, invoking all registered handlers. The `fire` method automatically sets `e.type` to the event name. Additional properties passed as the second argument are merged into the event object.

Parameters:

- `event`: the event name to fire.
- `data`: optional object whose properties are merged into the event object.
- `remove`: if `true`, all handlers for this event are removed after firing (one-shot event). Defaults to `false`.
- `lastToFirst`: if `true`, handlers are invoked in reverse registration order (last registered fires first). Defaults to `false`.

Returns the emitter for chaining.

Example:

```js
// Fire a simple event
emitter.fire("change", { key: "name", value: "Alice" });

// Fire a one-shot event (handlers are removed after firing)
emitter.fire("init", { timestamp: Date.now() }, true);

// Fire in reverse order
emitter.fire("cleanup", {}, false, true);
```

### onEventName Convention

If the emitter object has a method named `on{EventName}` (capitalized), `fire` will call it after invoking the registered listener list. This is how lifecycle callbacks work on framework objects.

Example:

```js
const view = createEmitter();

view.onDestroy = (e) => {
  console.log("view is being destroyed");
};

// Later:
view.fire("destroy");
// Calls view.onDestroy automatically
```

This convention is used by View, Frame, Router, and State objects for lifecycle events such as `created`, `destroy`, `change`, and `changed`.

### Re-entrant Safety

The emitter tracks `firingDepth` to handle re-entrant scenarios safely. If a handler calls `off()` to remove itself or another handler while `fire()` is iterating the listener list, the removal is deferred:

1. The handler reference is replaced with `noop` (a no-op function).
2. The key is added to a `pendingCompaction` set.
3. When the outermost `fire()` call completes (depth returns to zero), all marked entries are compacted from their listener arrays.

This prevents skipped handlers and broken iteration that would otherwise occur if the array were mutated during traversal.

Example:

```js
emitter.on("init", function handler(e) {
  doOneTimeSetup();
  emitter.off("init", handler); // Safe: deferred until fire() completes
});
```

### Chaining

All methods return the emitter object, supporting method chaining:

```js
emitter.on("init", handleInit).on("change", handleChange).fire("init");
```

### Custom Events

Custom events are application-defined events that travel through the same emitter system. They are not limited to DOM interactions and can model any publish-subscribe pattern.

Example:

```js
// In a shared module
export const appEvents = createEmitter();

// In a producer
appEvents.fire("user:login", { userId: 42 });

// In a consumer
appEvents.on("user:login", (e) => {
  loadUserProfile(e.userId);
});
```

By convention, use colons to namespace custom events: `"module:action"`. This prevents collisions between unrelated modules:

```js
appEvents.fire("cart:itemAdded", { item });
appEvents.fire("cart:itemRemoved", { item });
appEvents.fire("user:preferencesChanged", { prefs });
```

### Cleanup

Always unsubscribe when a view or component is destroyed to prevent memory leaks:

```js
export default function setup(ctx) {
  const handleChange = (e) => {
    /* ... */
  };
  appEvents.on("data:changed", handleChange);

  ctx.onDestroy = () => {
    appEvents.off("data:changed", handleChange);
  };

  return {
    /* ... */
  };
}
```

## Cache

The Cache is a factory function that creates LFU-style bounded caches with frequency-based eviction. Entries are tracked in a flat array plus a `Map` for O(1) get/set. On `get`, the entry's frequency and last-access timestamp are bumped. When capacity is exceeded, the worst entries are evicted in a single pass.

### createCache

```js
import { createCache } from "swifty-mvc";

const cache = createCache<T>(options?: CacheOptions<T>);
```

Create an LFU-style bounded cache.

Parameters:

- `options`: optional configuration object.
  - `maxSize`: maximum cache size before eviction triggers. Defaults to `20`.
  - `bufferSize`: buffer size for eviction. Defaults to `5`.
  - `onRemove`: callback invoked when an entry is removed (either via explicit deletion or eviction). Receives the original key as argument.
  - `sortComparator`: custom comparator for sorting entries during eviction. Defaults to a comparator that prefers higher frequency, then more recent access.

Returns a `CacheApi<T>` object with `get`, `set`, `del`, `has`, `clear`, `forEach`, `getSize` methods.

Example:

```js
import { createCache } from "swifty-mvc";

const cache = createCache({ maxSize: 20, bufferSize: 5 });
cache.set("user", { name: "Alice" });
const user = cache.get("user");
cache.has("user"); // true
cache.del("user");
```

### get

```js
cache.get(key: string): T | undefined
```

Read a value by key. On cache hit, bumps the entry's frequency and last-access timestamp.

Parameters:

- `key`: the cache key to retrieve.

Returns the cached value, or `undefined` if the key does not exist.

Example:

```js
const user = cache.get("user");
if (user) {
  console.log("Cache hit:", user.name);
} else {
  console.log("Cache miss");
}
```

### set

```js
cache.set(key: string, value: T): void
```

Store a value under `key`. If the key exists, updates the value and bumps frequency. If the cache is at capacity, evicts the worst entries first.

Parameters:

- `key`: the cache key.
- `value`: the value to store.

Returns nothing.

Example:

```js
cache.set("user", { name: "Alice", age: 30 });
cache.set("config", { theme: "dark" });
```

### del

```js
cache.del(key: string): void
```

Remove a key from the cache immediately. Fires `onRemove` callback if configured.

Parameters:

- `key`: the cache key to remove.

Returns nothing.

Example:

```js
cache.del("user");
```

### has

```js
cache.has(key: string): boolean
```

Check whether a key exists in the cache without bumping its frequency or timestamp.

Parameters:

- `key`: the cache key to check.

Returns `true` if the key exists, `false` otherwise.

Example:

```js
if (cache.has("user")) {
  const user = cache.get("user");
}
```

### clear

```js
cache.clear(): void
```

Remove all entries from the cache. Fires `onRemove` callback for each entry if configured.

Returns nothing.

Example:

```js
cache.clear();
```

### forEach

```js
cache.forEach(callback: (value: T | undefined) => void): void
```

Iterate over all cached values in insertion order.

Parameters:

- `callback`: function called for each cached value.

Returns nothing.

Example:

```js
cache.forEach((value) => {
  console.log("Cached value:", value);
});
```

### getSize

```js
cache.getSize(): number
```

Get the current number of cached entries.

Returns the number of entries currently in the cache.

Example:

```js
const size = cache.getSize();
console.log("Cache contains", size, "entries");
```

### LFU Eviction

When the cache reaches capacity (`maxSize + bufferSize`), it evicts the `bufferSize` worst entries. Eviction uses single-pass partial selection (O(n\*k)) instead of sorting the entire array (O(n log n)). For the typical `bufferSize = 5`, this is effectively a linear scan with at most 5 in-bucket comparisons per iteration.

The eviction algorithm:

1. Maintains a `worst` array sorted so that `worst[0]` is the worst-of-worst and `worst[bufferSize-1]` is the best-of-worst (the eviction boundary).
2. Iterates through all entries, keeping only the `bufferSize` worst entries in the `worst` array.
3. Removes all entries in the `worst` array from the cache.
4. Fires `onRemove` callback for each evicted entry if configured.

Entries are compared by frequency (lower is worse) and last-access timestamp (older is worse). The default comparator prefers higher frequency and more recent access.

Example with custom comparator:

```js
const cache = createCache({
  maxSize: 20,
  bufferSize: 5,
  onRemove: (key) => {
    console.log("Evicted:", key);
  },
  sortComparator: (a, b) => {
    // Custom comparison: prefer entries with lower priority
    return b.priority - a.priority || b.lastTimestamp - a.lastTimestamp;
  },
});
```

### Integration with EventDelegator

The EventDelegator uses an internal cache to store parsed event info from `@event` attributes. The cache is configured with `maxSize: 30` and `bufferSize: 10`:

```js
const eventInfoCache = createCache<Record<string, string>>({
  maxSize: 30,
  bufferSize: 10,
});
```

This cache improves performance by avoiding repeated parsing of event attribute strings during event resolution.
