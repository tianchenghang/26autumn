---
title: Performance
description: Optimization techniques for Swifty MVC applications.
---

# Performance {#performance}

Swifty MVC is designed for performance by default — zero runtime dependencies, compile-time template optimization, keyed DOM diffing, and LFU caching. This page covers techniques for further optimization.

## Rendering optimization {#rendering}

### Minimize re-renders {#minimize-rerenders}

Only observe the State keys and URL parameters your view actually uses:

```ts
// Good: observe only what you need
ctx.observeState("currentUser");

// Bad: observe everything
ctx.observeState("currentUser,theme,locale,notifications,sidebarOpen");
```

The dispatcher re-renders views whose observed keys changed. Observing unnecessary keys causes wasted re-renders.

### Use excludes for high-frequency updates {#excludes}

When updating data that should not trigger a re-render (e.g., tracking mouse position):

```ts
ctx.updater.set({ mouseX: event.clientX }, "mouseX");
ctx.updater.digest();
// 'mouseX' is excluded from change detection — no re-render
```

### Batch state updates {#batch-updates}

Multiple `set` calls followed by a single `digest` trigger only one re-render:

```ts
ctx.updater.set({ loading: false });
ctx.updater.set({ data: result });
ctx.updater.set({ error: null });
ctx.updater.digest();
// Single re-render with all three changes applied
```

### VDOM short-circuit {#vdom-short-circuit}

In VDOM mode, if the template output is identical to the previous render, the diff is skipped entirely. This means re-renders triggered by observed State changes that do not affect the template output are nearly free.

## Store optimization {#store-optimization}

### Use selectors {#use-selectors}

Bind only the store fields your view needs:

```ts
const getStore = useStore(largeStore, (state) => ({
  relevantField: state.relevantField,
}));
```

Without a selector, the entire store state is synced to the updater on every change, potentially triggering unnecessary re-renders.

### Computed properties {#computed-props}

Use `computed` to derive values instead of computing them in the template:

```ts
// Good: computed in store
total: computed(['items'], () => get().items.reduce(...))

// Bad: computed in template on every render
{{=items.reduce(...)}}
```

Computed properties are cached and only recomputed when their dependencies change.

## Service optimization {#service-optimization}

### Enable caching {#enable-caching}

Services include LFU caching by default. Ensure cache keys are stable:

```ts
// Good: stable parameter shape
fetchUser({ id: 42 });

// Bad: unstable parameter shape (new object every call)
fetchUser({ id: 42, timestamp: Date.now() });
```

### Request deduplication {#dedup}

In-flight requests with the same parameters are automatically deduplicated. Multiple views requesting the same data will share a single network call.

## Template optimization {#template-optimization}

### Prefer forOf with stable IDs {#stable-ids}

When rendering lists, give each item a stable `id` attribute:

```html
{{forOf items as item}}
<div id="item-{{=item.id}}">{{=item.name}}</div>
{{/forOf}}
```

The DOM diff engine uses `id` attributes as keys. Stable IDs allow the engine to match and move nodes instead of destroying and recreating them.

### Avoid deep nesting {#avoid-deep-nesting}

Deeply nested templates generate larger DOM trees that take longer to diff. Flatten where possible.

## Framework-level optimization {#framework-level}

### Task scheduling {#task-scheduling}

`Framework.task` queues work for deferred, chunked execution. Heavy operations are split across microtasks to avoid blocking the main thread:

```ts
Framework.task(heavyFunction, args, context);
```

The scheduler uses `scheduler.postTask()` with `{ priority: 'background' }` when available (Priority Scheduler API), falling back to `requestIdleCallback`, then `setTimeout(0)`.

### LFU cache sizing {#cache-sizing}

Size caches appropriately for your data:

```ts
createCache({
  maxSize: 100, // maximum entries
  bufferSize: 20, // evict 20 entries when capacity (120) is reached, back to 100
});
```

A larger `bufferSize` reduces eviction frequency but uses more memory.

### Async safety {#async-safety}

Always use `ctx.wrapAsync` for async callbacks. Stale callbacks that update destroyed views cause errors and memory leaks:

```ts
const safeCallback = ctx.wrapAsync((data) => {
  ctx.updater.set({ data }).digest();
});
```

## Measuring performance {#measuring}

### Frame Devtool Bridge {#devtool-bridge}

Enable the Devtool Bridge to inspect the Frame tree in browser devtools:

```ts
Framework.boot({
  devtool: true, // default in development
});
```

### Render timing {#render-timing}

Subscribe to view render events to measure render duration:

```ts
ctx.on("render", () => {
  performance.mark(`render-start-${ctx.id}`);
});

// After render completes (in endUpdate):
performance.mark(`render-end-${ctx.id}`);
performance.measure(
  `render-${ctx.id}`,
  `render-start-${ctx.id}`,
  `render-end-${ctx.id}`,
);
```

## Next steps {#next-steps}

- [Rendering Engine](/docs/en/swifty-mvc/guide/advanced/rendering-engine) — understand the diff algorithms
- [Store Deep Dive](/docs/en/swifty-mvc/guide/advanced/store) — advanced store patterns
- [TypeScript](/docs/en/swifty-mvc/guide/typescript/overview) — type-safe development
