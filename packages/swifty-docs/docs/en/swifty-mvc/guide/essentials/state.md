---
title: State Management
description: Cross-view observable State and Zustand-aligned Store for managing application data.
---

# State Management {#state-management}

Swifty MVC provides two layers of state management: `State` for simple cross-view data sharing, and `Store` for complex state with actions and computed properties.

## State {#state}

`State` is a module-level observable key-value store. It is the simplest way to share data between views. Any view can read, write, and observe State keys.

### Reading and writing {#reading-writing}

```ts
import { State } from "@swifty.js/mvc";

// Write data
State.set({ user: { name: "Alice" }, theme: "dark" });

// Read a single key
const user = State.get("user"); // { name: 'Alice' }

// Read the entire state
const all = State.get(); // { user: ..., theme: ... }
```

`State.set` performs a shallow merge. Only top-level keys are tracked for change detection — nested mutations within a value are not automatically detected.

### Digest and change detection {#digest}

After calling `State.set`, you must call `State.digest()` to fire change notifications:

```ts
State.set({ count: 42 });
State.digest();
// Fires "changed" event with { keys: Set{"count"} }
```

The `digest` method compares the new values against the previous ones using strict equality. Only keys whose values actually changed are included in the change set.

You can combine set and digest:

```ts
State.set({ count: 43 });
State.digest();
```

### Observing State in views {#observing-state}

Views declare which State keys they depend on using `observeState`:

```ts
export default defineView((ctx) => {
  ctx.observeState("user,theme");

  return {
    template: '<p>Welcome, {{=State.get("user").name}}</p>',
  };
});
```

When `State.digest()` fires with changed keys, the framework's dispatcher checks which views observed those keys and re-renders only the affected views.

### State.diff {#state-diff}

After a digest, `State.diff()` returns the set of keys that changed in the most recent digest cycle:

```ts
State.on("changed", () => {
  const changed = State.diff();
  if (changed.has("theme")) {
    document.body.classList.toggle("dark", State.get("theme") === "dark");
  }
});
```

### State.clean — reference-counted cleanup {#state-clean}

When views that observe a State key are destroyed, you may want to clean up the data. `State.clean` provides reference-counted auto-cleanup:

```ts
export default defineView((ctx) => {
  ctx.observeState("userProfile");
  State.clean("userProfile")(ctx);

  // When this view is destroyed AND no other view
  // is observing 'userProfile', the key is deleted from State
  return { template };
});
```

This prevents memory leaks when views that load expensive data are unmounted. The cleanup only fires when the last observer is destroyed — if two views observe the same key, the data persists until both are gone.

### State events {#state-events}

State has its own event emitter:

```ts
State.on("changed", (data) => {
  // data.keys -> Set<string> of changed keys
});
```

## Store {#store}

`Store` is a Zustand-aligned state management solution for complex application state. It provides encapsulated state, actions, computed properties, and subscription-based updates.

### Creating a store {#creating-a-store}

```ts
import { createStore, computed } from "@swifty.js/mvc";

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

The `createStore` function takes a name and a creator function. The creator receives `set` and `get` functions and returns an object that mixes state fields, actions (functions), and computed markers.

### State fields {#state-fields}

Non-function values in the creator's return object are state fields:

```ts
const store = createStore("app", (set, get) => ({
  users: [],
  loading: false,
  error: null,
}));
```

### Actions {#actions}

Functions are treated as actions. They are attached to the state object but excluded from `setState` merging:

```ts
const store = createStore("todos", (set, get) => ({
  items: [],

  add(text) {
    set({ items: [...get().items, { text, done: false }] });
  },

  toggle(index) {
    const items = get().items.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item,
    );
    set({ items });
  },

  clearCompleted() {
    set({ items: get().items.filter((item) => !item.done) });
  },
}));
```

### Computed properties {#computed-properties}

Use `computed(deps, fn)` to declare derived state that automatically recomputes when its dependencies change:

```ts
import { computed } from "@swifty.js/mvc";

const store = createStore("cart", (set, get) => ({
  items: [],
  discount: 0,

  subtotal: computed(["items"], () =>
    get().items.reduce((sum, item) => sum + item.price * item.qty, 0),
  ),

  total: computed(["items", "discount"], () => {
    const { subtotal, discount } = get();
    return subtotal * (1 - discount);
  }),
}));
```

Computed properties:

- Are recomputed only when their declared dependencies actually change (checked with `Object.is`)
- Are recomputed synchronously during `setState`, before subscribers are notified
- Cannot be written to via `setState` (writes are silently ignored)
- Support chained dependencies (e.g., `total` depends on `subtotal` which depends on `items`)

### Reading and writing {#store-read-write}

```ts
// Read state
const state = store.getState(); // { count: 0, increment: fn, ... }
const count = store.getState().count;

// Write state
store.setState({ count: 5 }); // partial update, triggers recompute + subscribers

// Function updater form
store.setState((prev) => ({ count: prev.count + 1 }));

// Call actions
store.getState().increment(); // equivalent to setState internally
```

`setState` accepts both an object and a function updater. The function form receives the previous state and returns a partial update, which is useful for updates that depend on the current state.

### Subscribing to changes {#subscribing}

```ts
const unsubscribe = store.subscribe((state) => {
  console.log("Store changed:", state);
});

// Later
unsubscribe();
```

### Binding a store to a view {#binding-to-view}

The `useStore` hook binds a store to a view's lifecycle:

```ts
import { useStore } from "@swifty.js/mvc";

export default defineView((ctx) => {
  const getStore = useStore(counterStore);

  // getStore() returns the selected slice of the store
  // It automatically syncs with the view's updater

  return {
    template: "<p>Count: {{=getStore().count}}</p>",
    events: {
      "btn<click>"() {
        counterStore.getState().increment();
      },
    },
  };
});
```

You can pass a selector to observe only a subset of the store:

```ts
const getStore = useStore(cartStore, (state) => ({
  total: state.total,
  itemCount: state.items.length,
}));
```

When the store changes, only the selected fields are synced to the view's updater, minimizing re-renders.

### Manual binding with bindStore {#bind-store}

For cases where you need more control, use `bindStore` directly:

```ts
import { bindStore } from "@swifty.js/mvc";

export default defineView((ctx) => {
  const off = bindStore(ctx, counterStore, (state) => ({
    count: state.count,
  }));

  // off() is called automatically on view destroy

  return { template };
});
```

### Store registry {#store-registry}

Stores are registered globally by name. You can look up a store by name:

```ts
import { createStore } from "@swifty.js/mvc";

// In module A:
createStore("user", (set, get) => ({ name: "" }));

// In module B:
// The same store instance is returned if already created
```

### Destroying a store {#destroying-store}

```ts
store.destroy();
// Clears all subscribers and removes from the global registry
```

## Choosing between State and Store {#choosing}

| Scenario                                    | Use     |
| ------------------------------------------- | ------- |
| Simple key-value data shared across views   | `State` |
| Data that needs computed/derived values     | `Store` |
| Data with associated actions/mutations      | `Store` |
| Data that follows a unidirectional flow     | `Store` |
| Quick prototyping or small apps             | `State` |
| Complex domain models (users, carts, forms) | `Store` |

## Data flow patterns {#patterns}

### Top-down with State {#top-down-state}

```ts
// On boot:
State.set({ currentUser: user, permissions: perms });
State.digest();

// In views:
ctx.observeState("currentUser");
```

### Store per domain {#store-per-domain}

```ts
const authStore = createStore("auth", (set, get) => ({
  user: null,
  token: null,
  login(credentials) {
    /* ... */
  },
  logout() {
    set({ user: null, token: null });
  },
}));

const cartStore = createStore("cart", (set, get) => ({
  items: [],
  addItem(product) {
    /* ... */
  },
}));
```

### State for UI, Store for domain {#mixed-pattern}

```ts
// UI-level state in State:
State.set({ sidebarOpen: true, activeTab: "overview" });

// Domain state in Store:
const orderStore = createStore("orders", (set, get) => ({
  orders: [],
  loadOrders() {
    /* ... */
  },
}));
```

## Next steps {#next-steps}

- [Hooks](/docs/en/swifty-mvc/guide/essentials/hooks) — useState, useEffect, useStore, and more
- [Service](/docs/en/swifty-mvc/guide/essentials/service) — API request management with caching
- [Store deep dive](/docs/en/swifty-mvc/guide/advanced/store) — advanced store patterns
