---
title: Store API
description: Complete API reference for createStore, computed, and bindStore.
---

# Store API {#store-api}

The Store system provides Zustand-aligned state management with actions, computed properties, and subscriptions.

## createStore {#create-store}

```ts
createStore<T>(name: string, creator: (set: SetState<T>, get: GetState<T>) => T): StoreApi<T>
```

Create a store with encapsulated state, actions, and computed properties.

**Parameters:**

- `name` — unique store identifier (registered globally)
- `creator` — function that receives `set` and `get` and returns the store shape

**Returns:**

- `StoreApi<T>` — the store instance

**Example:**

```ts
const counterStore = createStore("counter", (set, get) => ({
  count: 0,

  increment() {
    set({ count: get().count + 1 });
  },

  decrement() {
    set({ count: get().count - 1 });
  },

  doubleCount: computed(["count"], () => get().count * 2),
}));
```

## StoreApi {#store-api-type}

### store.getState {#get-state}

```ts
store.getState(): T
```

Returns the current state object, including actions and computed properties.

```ts
const state = counterStore.getState();
console.log(state.count); // 0
state.increment(); // call action
console.log(state.doubleCount); // 2 (computed)
```

### store.setState {#set-state}

```ts
store.setState(partial: Partial<T> | ((prev: T) => Partial<T>)): void
```

Update state. Performs shallow merge, recomputes affected computed properties, and notifies subscribers.

**Behavior:**

- Uses `Object.is` for comparison — only changed keys trigger updates
- Skips action keys and computed keys (writes to computed are silently ignored)
- Recomputes computed properties synchronously before notifying subscribers

**Example:**

```ts
counterStore.setState({ count: 10 });
// count: 0 -> 10 (changed)
// doubleCount: recomputed (deps: ['count'])
// subscribers notified

// Function updater form — useful for updates that depend on the current state:
counterStore.setState((prev) => ({ count: prev.count + 1 }));
```

### store.subscribe {#subscribe}

```ts
store.subscribe(listener: (state: T) => void): () => void
```

Register a subscriber that fires on every state change. Returns an unsubscribe function.

```ts
const off = counterStore.subscribe((state) => {
  console.log("Count:", state.count);
});

// Later:
off();
```

### store.destroy {#destroy}

```ts
store.destroy(): void
```

Clear all subscribers and remove from the global registry.

## computed {#computed}

```ts
computed<T>(deps: readonly string[], fn: () => T): T
```

Declare a derived property that automatically recomputes when its dependencies change.

**Parameters:**

- `deps` — array of state keys this computed property depends on
- `fn` — function that computes the derived value

**Returns:**

- A marker object (detected by `createStore`)

**Example:**

```ts
const cartStore = createStore("cart", (set, get) => ({
  items: [],
  discount: 0,

  subtotal: computed(["items"], () =>
    get().items.reduce((sum, item) => sum + item.price * item.qty, 0),
  ),

  total: computed(["subtotal", "discount"], () => {
    const { subtotal, discount } = get();
    return subtotal * (1 - discount);
  }),
}));
```

**Behavior:**

- Computed on store creation (initial value)
- Recomputed synchronously during `setState` when deps change
- Writes via `setState` are silently ignored
- Supports chained dependencies (e.g., `total` depends on `subtotal` which depends on `items`)

## bindStore {#bind-store}

```ts
bindStore<T>(
  view: ViewCtx,
  store: StoreApi<T>,
  selector?: (state: T) => Partial<T>
): () => void
```

Bind a store to a view's updater. Syncs store state to the view and auto-unsubscribes on destroy.

**Parameters:**

- `view` — the ViewCtx to bind to
- `store` — the store to bind
- `selector` — optional function to extract a subset of the store

**Returns:**

- Unsubscribe function (also called automatically on view destroy)

**Example:**

```ts
export default defineView((ctx) => {
  const off = bindStore(ctx, counterStore, (state) => ({
    count: state.count,
  }));

  // Store state is synced to ctx.updater
  // View re-renders when store changes

  return { template };
});
```

## Types {#types}

### StoreApi {#store-api-interface}

```ts
interface StoreApi<T> {
  getState(): T;
  setState(partial: Partial<T> | ((prev: T) => Partial<T>)): void;
  subscribe(listener: (state: T) => void): () => void;
  destroy(): void;
}
```

### SetState {#set-state-type}

```ts
type SetState<T> = (partial: Partial<T> | ((prev: T) => Partial<T>)) => void;
```

### GetState {#get-state-type}

```ts
type GetState<T> = () => T;
```

## Next steps {#next-steps}

- [State Management guide](/docs/en/swifty-mvc/guide/essentials/state) — State and Store patterns
- [Store Deep Dive](/docs/en/swifty-mvc/guide/advanced/store) — advanced patterns
- [View API](/docs/en/swifty-mvc/api-reference/view) — useStore hook
