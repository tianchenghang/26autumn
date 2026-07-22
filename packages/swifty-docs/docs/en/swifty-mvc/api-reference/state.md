---
title: State API
description: Complete API reference for the State singleton.
---

# State API {#state-api}

The `State` singleton is a module-level observable key-value store for sharing data across views.

## Methods {#methods}

### State.get {#get}

```ts
State.get<T>(key?: string): T
```

Read a single key or the entire state object.

```ts
const user = State.get<User>("user");
const allState = State.get();
```

### State.set {#set}

```ts
State.set(data: Record<string, unknown>, excludes?: ReadonlySet<string>): typeof State
```

Shallow-merge data into the state. Returns `State` for chaining.

**Parameters:**

- `data` — object to merge into state
- `excludes` — set of keys to skip during change detection

**Example:**

```ts
State.set({ user: newUser, theme: "dark" });
State.set({ count: 42 }, new Set(["count"])); // 'count' excluded from change tracking
```

### State.digest {#digest}

```ts
State.digest(data?: Record<string, unknown>, excludes?: ReadonlySet<string>): void
```

Optionally set data, then fire the `"changed"` event if any tracked keys changed.

**Example:**

```ts
State.set({ count: 43 });
State.digest();
// Fires "changed" with { keys: Set{"count"} }

// Combined:
State.digest({ theme: "light" });
```

### State.diff {#diff}

```ts
State.diff(): ReadonlySet<string>
```

Returns the set of keys that changed in the most recent digest cycle.

```ts
State.on("changed", () => {
  const changed = State.diff();
  if (changed.has("theme")) {
    applyTheme(State.get("theme"));
  }
});
```

### State.clean {#clean}

```ts
State.clean(keys: string): (ctx: ViewCtx) => void
```

Returns a function that registers reference-counted auto-cleanup on view destroy. When the last observer of a key is destroyed, the key is deleted from State.

**Example:**

```ts
export default defineView((ctx) => {
  ctx.observeState("userProfile");
  State.clean("userProfile")(ctx);

  // When this view is destroyed AND no other view
  // observes 'userProfile', the key is deleted

  return { template };
});
```

### State.on / State.off / State.fire {#events}

```ts
State.on(event: string, handler: Function): void
State.off(event: string, handler?: Function): void
State.fire(event: string, data?: unknown): void
```

Event emitter methods.

## Events {#events}

### changed {#changed-event}

Fired after `State.digest()` if any tracked keys changed. Carries `{ keys: Set<string> }`.

```ts
State.on("changed", ({ keys }) => {
  console.log("Changed keys:", Array.from(keys));
});
```

## Usage in views {#usage-in-views}

### Observing State {#observing}

Views declare which State keys they depend on:

```ts
export default defineView((ctx) => {
  ctx.observeState("user,theme,locale");

  return {
    template: '<p>Welcome, {{=State.get("user").name}}</p>',
  };
});
```

When `State.digest()` fires with changed keys, the dispatcher re-renders only views that observed those keys.

### Writing State from views {#writing}

```ts
export default defineView((ctx) => {
  return {
    events: {
      "themeBtn<click>"() {
        State.set({ theme: State.get("theme") === "dark" ? "light" : "dark" });
        State.digest();
      },
    },
  };
});
```

## Next steps {#next-steps}

- [State Management guide](/docs/en/swifty-mvc/guide/essentials/state) — State and Store patterns
- [Router API](/docs/en/swifty-mvc/api-reference/router) — navigation
- [Frame API](/docs/en/swifty-mvc/api-reference/frame) — frame tree
