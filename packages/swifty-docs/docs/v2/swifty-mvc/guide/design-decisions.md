# Design Decisions

Every framework is a collection of trade-offs. swifty-mvc makes a small number of deliberate architectural choices, each shaped by the constraints of large-scale enterprise applications: predictable performance under heavy DOM, minimal bundle size, long-term maintainability, and a mental model that stays close to the platform. This page documents the reasoning behind those choices so you can evaluate whether the framework fits your project.

## Functional Over OOP {#functional-over-oop}

swifty-mvc eliminates classes, prototypes, and mixins from its public API. Every user-facing construct is either a pure function or a factory that returns closures.

### Rationale

Class-based view definitions carry three categories of overhead that compound in large codebases.

First, the `this` binding. JavaScript class methods lose their receiver when passed as callbacks, requiring `.bind(this)`, arrow-function wrappers, or class-field arrow syntax at every call site. In a framework where event handlers, async callbacks, and scheduler tasks routinely cross function boundaries, the binding problem becomes a persistent source of bugs. A closure-based API sidesteps it entirely: the setup function captures state in its lexical scope, and every handler closes over the same references.

Second, lifecycle method ordering. Class frameworks typically expose `created`, `mounted`, `updated`, and `destroyed` hooks as named methods on a base class. Developers must memorize which hooks run synchronously, which are async, and in what order they fire relative to child components. With a setup function that runs once, all lifecycle logic is expressed as explicit function calls in the order the developer writes them. There is no hidden orchestration between inherited methods.

Third, prototype chain debugging. When a framework relies on class inheritance for shared behavior, tracing a bug through `super` calls, mixin application orders, and prototype chain resolution adds cognitive cost. Composition via closures and higher-order functions uses standard JavaScript patterns that every developer already understands.

```typescript
// No class, no this, no prototype chain
const HomeView = defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "increment<click>": () => setCount(getCount() + 1),
    },
  };
});
```

The functional approach does sacrifice one feature that OOP provides: shared mutable state via instance properties. swifty-mvc replaces this with explicit state management through `useState` and `createStore`, which makes state ownership visible and testable.

## Real-DOM Diff as Default {#real-dom-diff-as-default}

The default rendering pipeline compiles templates to functions that return HTML strings. The updater parses each string into a temporary DOM tree via `document.implementation.createHTMLDocument`, then diffs it against the live DOM using keyed comparison.

### Rationale

A virtual DOM is not free. Every render allocates a tree of vnode objects, diffs it against the previous tree through recursive comparison, and then translates the diff into DOM mutations. This three-step process (allocate, diff, patch) was originally designed to amortize the cost of manual DOM manipulation in frameworks that lacked a compilation step. When a compiler is present, the vnode allocation is redundant work.

swifty-mvc compiles templates at build time, so the template execution step is already optimized. The remaining question is how to apply the resulting HTML to the live DOM with the minimum number of mutations. The real-DOM diff approach answers this directly:

1. Produce an HTML string from the compiled template (fast: straight-line concatenation).
2. Parse it into a detached DOM tree via `innerHTML` on a temporary element (fast: the browser's native HTML parser is highly optimized).
3. Diff the detached tree against the live tree using keyed comparison, collecting mutations into a batch.
4. Apply the batch in a single pass, minimizing layout thrashing.

This pipeline avoids vnode allocation entirely. The temporary DOM tree is short-lived and collected in the same minor GC cycle. For the majority of views, where most of the template structure is stable between renders, the `isEqualNode` fast-path skips unchanged subtrees without any attribute iteration.

The real-DOM diff is not universally faster. For views with large, frequently reordered lists, the keyed comparison may produce more DOM moves than necessary. This is precisely the scenario where VDOM mode with LIS reconciliation performs better, which is why VDOM remains available as an opt-in.

```typescript
// Default: string mode with real-DOM diff
const View = defineView((ctx) => {
  return { template };
});
```

## VDOM as Opt-In {#vdom-as-opt-in}

VDOM mode is available per-view but is not the default. It is enabled by setting `vdom: true` in the framework configuration or by returning a VDOM template from the setup function.

### Rationale

Making VDOM the default would impose its overhead on every view, including the 90% of views that never benefit from it. The VDOM pipeline carries three costs that string mode avoids:

Per-render allocation. Each render constructs a tree of `VDomNode` objects with multiple properties (tag, html, attrs, attrsMap, children, compareKey, reused, views). For a template with 200 elements, this means 200 object allocations plus their associated arrays and maps.

Retained memory. The VDomNode tree is stored as `lastVDom` between renders for diffing. This persistent reference prevents the GC from collecting the previous render's tree until the next render replaces it.

Recursive diff cost. Even with the head/tail fast-paths and LIS optimization, the worst-case diff complexity is O(n log n) due to the patience sorting computation. String mode's keyed diff is O(n + m).

These costs are justified only when the view benefits from one of two VDOM-specific optimizations: the attrs+html equality fast-path that skips unchanged subtrees without walking their children, and the LIS algorithm that minimizes DOM move operations when reordering keyed children.

By making VDOM opt-in, the framework lets developers pay this cost only where profiling shows a measurable benefit. The two modes can coexist in the same application because the updater branches on the return type of the compiled template function, not on a global flag.

```typescript
// Opt-in: VDOM mode for views that need LIS reconciliation
const SortableView = defineView((ctx) => {
  return { template, vdom: true };
});
```

## Compile-Time Templates {#compile-time-templates}

HTML templates are compiled to JavaScript functions at build time by the swifty-mvc compiler. The compilation step runs inside the bundler plugin (Vite, Webpack, or Rspack) and transforms template syntax into optimized render functions.

### Rationale

Runtime template interpretation carries two costs that are unacceptable for a performance-sensitive framework. The first is parsing: the template string must be tokenized and converted to an intermediate representation on every render, or cached after the first parse. The second is evaluation: the intermediate representation must be walked to produce output, which involves repeated property lookups, conditional branching, and string construction in an interpreter loop.

Compile-time compilation eliminates both costs. The template is parsed once at build time, and the output is a JavaScript function that directly concatenates strings (in string mode) or constructs VDomNode trees (in VDOM mode). The generated function is amenable to JIT inlining because it consists of straight-line code with no dynamic dispatch.

```html
<!-- home.html -->
<div>
  <h1>{{=title}}</h1>
  <ul>
    {{each items as item}}
    <li>{{=item.name}}</li>
    {{/each}}
  </ul>
</div>
```

The compiled output for string mode is roughly:

```js
function template(data, viewId, refData, encodeHTML, strSafe) {
  let out = "<div><h1>" + encodeHTML(data.title) + "</h1><ul>";
  const items = data.items;
  for (let i = 0; i < items.length; i++) {
    out += "<li>" + encodeHTML(items[i].name) + "</li>";
  }
  return out + "</ul></div>";
}
```

The compiler also handles HTML encoding inline by passing encoder functions (`encodeHTML`, `strSafe`, `encodeURIExtra`) as arguments to the template function. This avoids the overhead of a runtime escaping pipeline that must inspect each interpolated value to determine the appropriate encoding strategy.

Build-time compilation has one downside: template errors surface at build time rather than at author time. The compiler mitigates this by producing source maps and clear error messages with line numbers that reference the original HTML file.

## Two-Phase Routing {#two-phase-routing}

The router implements a two-phase navigation model. Phase one runs async guards that can inspect the target route, perform side effects (permission checks, data prefetching), and either allow the navigation, redirect to a different route, or cancel it. Phase two applies the navigation by updating the URL, firing change events, and triggering the dispatcher to update affected views.

### Rationale

Single-phase routers apply the navigation immediately and then let views react to the new URL. This creates a window where the application state is inconsistent: the URL has changed, but the data for the new route has not been loaded. Views that render during this window must handle loading states, error states, and missing data, which multiplies the number of code paths in each view.

Two-phase routing eliminates this window. The async guard runs before the URL changes, so the navigation either completes with all required data available or never happens at all.

```typescript
Router.config({
  routes: {
    "/dashboard": {
      view: "views/dashboard",
    },
  },
});

// Async guards are registered separately after boot via Router.beforeEach
Router.beforeEach(async (to, from) => {
  const allowed = await checkAccess(to.params.id);
  if (!allowed) {
    Router.to("/unauthorized");
    return false;
  }
  await prefetchDashboardData(to.params.id);
  return true;
});
```

The guard can return `true` (allow), `false` (cancel), or redirect via `Router.to()`. This covers the three outcomes that single-phase routers handle through separate mechanisms (redirect components, loading boundaries, error boundaries).

The two-phase model does add latency to navigation: the URL does not update until the guard resolves. For guards that perform network requests, this means a brief delay before the browser's address bar reflects the new URL. This trade-off is acceptable for enterprise applications where data consistency matters more than perceived navigation speed.

## Reference-Counted Events {#reference-counted-events}

All DOM events in swifty-mvc are delegated to `document.body` in the capture phase. The `EventDelegator` manages capture-phase listeners through reference counting so that multiple views registering the same event type share a single native listener.

### Rationale

Attaching event listeners directly to DOM elements does not scale. An application with 500 list items, each with a click handler, would attach 500 listeners. Each listener consumes memory for the closure and the native listener object, and each must be cleaned up when the corresponding DOM element is removed.

Event delegation solves the scaling problem by attaching a single listener to a common ancestor. swifty-mvc takes this further by using the capture phase on `document.body`, which ensures that events are intercepted before any element-level handlers can interfere, and before the event reaches any shadow DOM boundaries.

The reference counting is necessary because views mount and unmount independently. Without it, the first view to register a `click` handler would attach the listener, and the first view to unmount would remove it, breaking all other views that are still listening for `click` events. With reference counting, the listener is attached when the first view registers and removed only when the last view unregisters.

```typescript
bind(eventType: string, hasSelector = false): void {
  const counter = rootEvents[eventType] || 0
  if (counter === 0) {
    document.body.addEventListener(eventType, domEventProcessor, true)
  }
  rootEvents[eventType] = counter + 1
}

unbind(eventType: string, hasSelector = false): void {
  const counter = rootEvents[eventType] || 0
  if (counter <= 1) {
    document.body.removeEventListener(eventType, domEventProcessor, true)
    delete rootEvents[eventType]
  } else {
    rootEvents[eventType] = counter - 1
  }
}
```

An application with 50 views all listening for `click` events has exactly one `click` listener on `document.body`. When the 50th view unmounts, the counter drops to zero and the listener is removed. There are no leaked listeners and no orphaned handlers.

Event information parsed from `@event` attributes is cached in an LFU cache (`eventInfoCache`) with `maxSize: 30` and `bufferSize: 10`, so repeated parsing of the same event attribute string is avoided.

## Capture-Phase Event Delegation {#capture-phase-event-delegation}

All DOM events in swifty-mvc are delegated to `document.body` in the capture phase rather than the bubble phase.

### Rationale

The bubble phase is the default for most event delegation libraries, but it has a fundamental weakness: if any element between the target and the delegation root calls `stopPropagation()`, the event never reaches the delegated listener. The capture phase runs before any element-level handlers can interfere, ensuring that the framework always sees every event regardless of what happens in the bubble chain.

Capture-phase delegation also provides predictable ordering. Events are intercepted at the top of the DOM tree and flow downward before any bubble-phase listeners fire. This means that the framework's event processor runs first, before any user-attached bubble-phase listeners, giving it the opportunity to route events to the correct view handler before other code can cancel or transform them.

The combination of capture-phase delegation with reference counting produces a system where thousands of views can share a handful of native listeners on `document.body`, each view declares its own handlers declaratively in the `events` map, and no handler is ever missed due to `stopPropagation()` calls in unrelated parts of the DOM tree.

```typescript
// All events are captured at document.body in the capture phase
document.body.addEventListener(eventType, domEventProcessor, true);
// The third argument `true` enables capture phase
```

The trade-off is that capture-phase listeners cannot be attached to elements inside shadow DOM boundaries without additional bridging. For most applications this is not a constraint, but teams building shadow-DOM-heavy architectures should be aware of it.

## LFU Cache with Frequency Eviction {#lfu-cache}

The service layer caches API responses using an LFU (Least Frequently Used) strategy. Unlike LRU, which evicts the least recently accessed entry, LFU tracks an access frequency counter per entry and evicts the entries with the lowest frequency.

### Rationale

Dashboard-style workloads exhibit a power-law access pattern: a small number of endpoints account for the majority of requests. LRU eviction performs poorly under this pattern because a single access to a rarely-used endpoint can evict a frequently-used entry that was accessed slightly less recently. LFU avoids this by considering the total access count rather than just the recency.

The eviction algorithm uses single-pass partial selection sort with complexity O(n \* k), where n is the number of entries and k is `bufferSize`. This is faster than sorting the entire array (O(n log n)) when k is small. For the typical `bufferSize = 5`, it is effectively a linear scan with at most 5 in-bucket comparisons per iteration.

```typescript
const cache = createCache({ maxSize: 40, bufferSize: 10 });
cache.set("user-profile", userData);
const user = cache.get("user-profile"); // bumps frequency counter
```

Each cache entry stores its frequency and last-access timestamp. On `get`, both values are bumped. When the cache grows beyond `maxSize + bufferSize`, eviction triggers, removing the `bufferSize` entries with the lowest frequency. Entries with equal frequency are ordered by last-access time, so the least recently used among equally-frequent entries is evicted first.

The LFU cache is used in three places: the service layer for API response caching, the event delegator for parsed event info caching, and the router for URL parsing result caching. All three benefit from the frequency-aware eviction strategy.

## Async Callback Validity (mark/unmark) {#async-callback-validity}

The `mark` and `unmark` functions provide signature-based lifecycle tracking for async callbacks. When a view initiates an async operation, it calls `mark(host, key)` to obtain a validity checker. When the view re-renders or is destroyed, `unmark(host)` invalidates all existing checkers. Stale callbacks that arrive after the view has moved on silently skip their work.

### Rationale

Async callbacks that outlive their originating view are a persistent source of bugs in frontend applications. A fetch request initiated in a view's setup function may resolve after the user has navigated away. If the callback attempts to update the destroyed view's state, it either throws an error or silently corrupts the state of a different view that now occupies the same frame.

The mark/unmark system solves this with a lightweight validity token. Each `mark` call returns a closure that checks whether the host's signature still matches the signature at the time of marking. If the host has been unmarked (re-rendered or destroyed), the signature no longer matches and the checker returns `false`.

```typescript
const hostStore = new WeakMap<object, HostRecord>();

export function mark(host: object, key: string): () => boolean {
  const record = getOrCreate(host);
  if (record.deleted) return () => false;
  const sign = (record.signs.get(key) ?? 0) + 1;
  record.signs.set(key, sign);
  return () => {
    const current = hostStore.get(host);
    return !!current && !current.deleted && current.signs.get(key) === sign;
  };
}
```

State is stored in a module-level `WeakMap`, not on the host object. This design choice has three consequences: it never pollutes user objects with magic properties, it never breaks on `Object.freeze`-ed inputs, and it never shows up in debug snapshots. The `WeakMap` also ensures that when a host object is garbage collected, its mark records are collected with it, preventing memory leaks.

The `wrapAsync` method on `ViewCtx` is built on top of mark/unmark, using the view's signature counter:

```typescript
const fetchData = ctx.wrapAsync(async () => {
  const res = await api.getData();
  ctx.updater.digest({ data: res });
});
```

If the view re-renders or is destroyed before `api.getData()` resolves, the wrapper silently skips the digest call. No error is thrown, no stale state is written, and no cleanup is needed from the developer.

## Cooperative Time-Slicing {#cooperative-time-slicing}

The framework includes two cooperative schedulers that break long-running tasks into short batches, yielding to the browser between batches to maintain 60fps animations and responsive user input.

### Rationale

Long-running JavaScript blocks starve the browser's event loop. A 50ms task that runs synchronously prevents the browser from processing user input, scrolling, or advancing CSS animations during that window. On a 60fps display, each frame has a 16.6ms budget. A 50ms task causes at least two dropped frames.

swifty-mvc solves this with two schedulers that operate at different priority levels.

The internal scheduler (`callFunction` in `utils.ts`) processes a FIFO queue of deferred tasks. Each batch runs for up to 9ms (the `CALL_BREAK_TIME` constant in `utils.ts`), then yields to the browser. The yield strategy uses a two-tier approach: `scheduler.yield()` when available, or `setTimeout(0)` as a fallback. This scheduler is used by the framework itself to defer DOM callbacks such as `endUpdate`, `nodeProps` synchronization, and sub-view re-renders.

The external scheduler (`Framework.task()` in `framework.ts`) handles user-facing background task queuing with a 48ms budget (the `CALL_BREAK_TIME` constant in `common.ts`) and a three-tier strategy: `scheduler.postTask` with background priority, `requestIdleCallback` with adaptive deadline-based chunk sizing, or `setTimeout(0)` as a universal fallback. This scheduler is appropriate for non-urgent work like analytics logging or deferred data processing.

```typescript
// Internal: deferred DOM callbacks
Framework.callFunction(endUpdateCallback);

// External: background task queuing
Framework.task(heavyComputation, [arg1, arg2]);
```

The 9ms batch limit for the internal scheduler is chosen to leave approximately 7ms of headroom within a 16.6ms frame for the browser to process input events and paint. This is not a hard guarantee: if a single task within a batch takes longer than 9ms, the batch will overrun. The scheduler minimizes overruns by keeping individual tasks small and yielding frequently.

## Iterative Tree Traversal {#iterative-tree-traversal}

When the router or global state changes, the dispatcher walks the frame tree to notify views that observed the changed keys. The walk uses an explicit LIFO stack instead of recursion.

### Rationale

A recursive tree walk calls itself once per frame in the tree. For a deeply nested hierarchy (which is common in enterprise applications with multi-level layouts, nested tabs, and embedded detail views), the recursion depth can exceed the JavaScript call stack limit. V8's call stack is approximately 10,000 frames, and each recursive call consumes stack space for its local variables and return address.

An explicit stack avoids this limitation entirely. The stack is a heap-allocated array, so its size is limited only by available memory. Children are pushed in reverse order so that `pop()` visits them in the original declaration order, preserving the expected update sequence.

```typescript
function dispatcherUpdate(
  frame: FrameObj,
  stateKeys?: ReadonlySet<string>,
): void {
  const stack: FrameObj[] = [frame];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const view = current.view;

    if (!view || current.dispatcherUpdateTag === dispatcherUpdateTag) {
      continue;
    }
    current.dispatcherUpdateTag = dispatcherUpdateTag;

    const isChanged = stateKeys
      ? stateIsObserveChanged(view, stateKeys)
      : viewIsObserveChanged(view);

    if (isChanged) {
      view.render();
    }

    const children = current.children();
    for (let i = children.length - 1; i >= 0; i--) {
      const child = Frame.get(children[i]);
      if (child) stack.push(child);
    }
  }
}
```

A `dispatcherUpdateTag` counter prevents the same frame from being visited twice within a single update cycle. This is necessary because the dispatcher may be called multiple times during a single navigation (once for the route change, once for parameter changes, once for state changes).

When a view's `render()` returns a promise (for async rendering), the subtree under that frame is deferred until the promise resolves, while sibling subtrees continue draining synchronously. This prevents a slow async render in one branch from blocking updates in other branches.

## Setup Runs Once {#setup-runs-once}

The setup function returned by `defineView` executes exactly once when the view mounts. It does not re-run on subsequent re-renders. All closure captures, hook registrations, and event handler definitions happen a single time.

### Rationale

Frameworks that re-execute component bodies on every render (React, SolidJS) require developers to manage the consequences of repeated execution. State must be stored in a separate mechanism (refs, signals, external stores) to survive re-execution. Event handlers must be wrapped in `useCallback` or `useMemo` to preserve referential identity. Effects must declare dependency arrays to avoid running on every render.

swifty-mvc eliminates this entire category of problems by running the setup function once. State lives in closures that are created once and persist for the lifetime of the view. Event handlers close over these stable references and never need memoization. Hooks register themselves with the view context during setup and remain active until the view is destroyed.

```typescript
const ProfileView = defineView((ctx, params) => {
  // Runs once. These closures persist for the view's lifetime.
  const [getName, setName] = useState("name", "");
  const [getAge, setAge] = useState("age", 0);

  useEffect(() => {
    const ws = new WebSocket("/api/updates");
    ws.onmessage = (e) => setName(e.data);
    return () => ws.close();
  });

  return {
    template,
    events: {
      "save<click>": () => saveProfile(getName(), getAge()),
    },
  };
});
```

Re-renders only invoke the compiled template function and the optional `assign` method. The setup function's closures are not re-created, so there is no allocation overhead on re-render, no stale closure problem (getters always read current values from `updater.data`), and no need for dependency arrays or memoization.

The trade-off is that the setup function cannot reactively respond to prop changes by re-running its body. Instead, views observe specific location parameters and state keys via `ctx.observeLocation` and `ctx.observeState`, and re-render only when those observed values change. This is more explicit than automatic re-execution, but it makes the update graph predictable and debuggable.

:::info Summary
These eleven decisions form a coherent architecture: compile-time templates eliminate runtime parsing, real-DOM diffing avoids vnode overhead for most views, the functional API removes class-related complexity, the setup-runs-once model eliminates re-execution overhead, and the cooperative scheduler keeps the main thread responsive. VDOM, LFU caching, mark/unmark, reference-counted events, iterative traversal, and two-phase routing each solve a specific problem without introducing unnecessary abstraction.
:::
