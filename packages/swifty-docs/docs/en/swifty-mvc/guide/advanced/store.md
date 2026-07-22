---
title: Store Deep Dive
description: Advanced patterns for createStore, computed properties, and store composition.
---

# Store Deep Dive {#store-deep-dive}

This page covers advanced patterns and internals of the Store system. For the basics, see [State Management](/docs/en/swifty-mvc/guide/essentials/state#store).

## Internal architecture {#internals}

A Store is implemented as a closure with three registries:

```
createStore(name, creator)
  |
  +-- state: plain object (no Proxy)
  +-- actions: functions attached to state but excluded from setState
  +-- computedDefs: Map<string, { deps, fn }> for computed properties
  +-- listeners: Set of subscriber functions
```

### setState mechanics {#setstate-mechanics}

When `setState(partial)` is called:

1. Each key in `partial` is compared to the current value using `Object.is`
2. Keys that are actions or computed properties are skipped
3. Only changed keys are written to the state object
4. `recomputeIfNeeded` runs — only computed properties whose deps actually changed are recomputed
5. If any state changed, all subscribers are notified

`setState` also accepts a function updater that receives the previous state and returns a partial update:

```ts
store.setState((prev) => ({ count: prev.count + 1 }));
```

This is useful for updates that depend on the current state, avoiding stale closures.

### Computed recomputation {#computed-recomputation}

Computed properties are recomputed synchronously during `setState`, before subscribers are notified:

```ts
store.setState({ items: newItems });
// 1. items changed -> written to state
// 2. computed(['items'], ...) -> recomputed
// 3. computed(['items', 'discount'], ...) -> recomputed if items or discount changed
// 4. subscribers notified with final state
```

This ensures subscribers always see a consistent state where all derived values are up to date.

## Advanced patterns {#patterns}

### Async actions {#async-actions}

Actions can be async. The store does not track async state automatically — manage loading/error states explicitly:

```ts
const userStore = createStore("users", (set, get) => ({
  users: [],
  loading: false,
  error: null,

  async loadUsers() {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/users");
      const users = await res.json();
      set({ users, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },
}));
```

### Store composition {#composition}

Compose stores by importing and calling other stores' actions:

```ts
const authStore = createStore("auth", (set, get) => ({
  user: null,

  async login(credentials) {
    const user = await authenticate(credentials);
    set({ user });
    // Notify the analytics store
    analyticsStore.getState().trackLogin(user);
  },
}));

const analyticsStore = createStore("analytics", (set, get) => ({
  events: [],

  trackLogin(user) {
    set({ events: [...get().events, { type: "login", userId: user.id }] });
  },
}));
```

### Optimistic updates with rollback {#optimistic-rollback}

```ts
const todoStore = createStore("todos", (set, get) => ({
  items: [],

  async toggleTodo(id) {
    const previous = get().items;
    // Optimistic update
    set({
      items: previous.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    });

    try {
      await api.toggleTodo(id);
    } catch {
      // Rollback
      set({ items: previous });
    }
  },
}));
```

### Middleware pattern {#middleware-pattern}

Wrap `setState` to add logging, persistence, or analytics:

```ts
function createLoggedStore(name, creator) {
  return createStore(name, (set, get) => {
    const loggedSet = (partial) => {
      console.log(`[${name}] setState:`, partial);
      set(partial);
    };
    return creator(loggedSet, get);
  });
}
```

### Persistence {#persistence}

Persist store state to localStorage:

```ts
function createPersistentStore(name, creator, storageKey) {
  const saved = localStorage.getItem(storageKey);
  const initialState = saved ? JSON.parse(saved) : {};

  return createStore(name, (set, get) => {
    const persistentSet = (partial) => {
      set(partial);
      localStorage.setItem(storageKey, JSON.stringify(get()));
    };

    // Merge saved state with defaults
    set(initialState);

    return creator(persistentSet, get);
  });
}
```

## Testing stores {#testing}

Stores are plain objects and can be tested without any framework setup:

```ts
import { describe, it, expect } from "vitest";
import { createStore, computed } from "@swifty.js/mvc";

describe("counterStore", () => {
  it("increments count", () => {
    const store = createStore("test-counter", (set, get) => ({
      count: 0,
      increment() {
        set({ count: get().count + 1 });
      },
    }));

    store.getState().increment();
    expect(store.getState().count).toBe(1);

    store.destroy();
  });

  it("computes derived values", () => {
    const store = createStore("test-derived", (set, get) => ({
      items: [1, 2, 3],
      sum: computed(["items"], () => get().items.reduce((a, b) => a + b, 0)),
    }));

    expect(store.getState().sum).toBe(6);

    store.setState({ items: [1, 2, 3, 4] });
    expect(store.getState().sum).toBe(10);

    store.destroy();
  });
});
```

## Next steps {#next-steps}

- [State Management basics](/docs/en/swifty-mvc/guide/essentials/state) — State and Store fundamentals
- [Performance](/docs/en/swifty-mvc/guide/advanced/performance) — store optimization techniques
- [API Reference: Store](/docs/en/swifty-mvc/api-reference/store) — complete API
