# Introduction

swifty-mvc is a TypeScript MVC frontend framework for building single-page applications and micro-frontends with a functional-first API, zero runtime dependencies, and compile-time template optimization.

## What is swifty-mvc? {#what-is-swifty-mvc}

swifty-mvc is a modern frontend framework that brings the Model-View-Controller (MVC) architectural pattern to TypeScript applications. Unlike component-based frameworks that blur the lines between structure, behavior, and presentation, swifty-mvc maintains clear separation of concerns through its three-layer architecture:

- Model layer manages application state through a Zustand-aligned store with computed properties and a service layer with LFU caching for API requests
- View layer renders user interfaces using compile-time HTML templates and a functional setup API with hooks
- Controller layer coordinates routing, event delegation, and frame tree traversal to orchestrate the application lifecycle

The framework is designed for teams building large-scale enterprise applications where predictable behavior, minimal bundle size, and long-term maintainability matter more than chasing the latest frontend trends.

:::info Why MVC in 2026?
While component-based architectures dominate modern frontend development, MVC remains a proven pattern for complex business applications. swifty-mvc combines the clarity of MVC with modern functional programming techniques, giving you the best of both worlds: structured architecture without class-based boilerplate.
:::

## Core Philosophy {#core-philosophy}

### Functional-First Design {#functional-first}

swifty-mvc eliminates classes, prototypes, and mixins entirely. Every API in the framework is a pure function or a factory that returns closures:

```typescript
// No classes, no this, no prototype
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

This approach avoids the cognitive overhead of class lifecycle methods, `this` binding rules, and prototype chain debugging. State lives in closures, behavior lives in functions, and composition happens through standard JavaScript patterns.

### Compile-Time Optimization {#compile-time}

HTML templates are compiled to JavaScript functions at build time, eliminating runtime template parsing and interpretation. The compiler analyzes your template syntax and generates optimized render functions that directly manipulate the DOM:

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

The compiled output is a JavaScript function that performs minimal DOM operations, similar to what you would write by hand for maximum performance.

### Zero Runtime Dependencies {#zero-dependencies}

The swifty-mvc runtime has no external dependencies. Babel is used only at build time for template compilation. This means:

- Smaller bundle sizes (the core framework is under 20KB gzipped)
- No dependency version conflicts
- No supply chain security concerns
- Predictable behavior across environments

## Key Features {#key-features}

### Dual Rendering Modes {#rendering}

swifty-mvc supports two rendering strategies, letting you choose the right trade-off for each view:

Real-DOM diffing (default) compiles templates to string-based render functions that perform character-level diffing on the real DOM. This is the fastest option for most use cases and works without a virtual DOM overhead:

```typescript
// Default: string mode with real-DOM diff
const View = defineView((ctx) => {
  return { template }; // template compiled to string render function
});
```

VDOM mode (opt-in) uses a virtual DOM with LIS (Longest Increasing Subsequence) reconciliation for complex dynamic views where fine-grained updates matter more than raw speed:

```typescript
// Opt-in: VDOM mode
const ComplexView = defineView((ctx) => {
  return { template, vdom: true };
});
```

:::tip Choosing a rendering mode
Use real-DOM diffing for 90% of your views. Switch to VDOM only for views with deeply nested dynamic content or frequent partial updates where you need surgical DOM manipulation.
:::

### Two-Phase Routing {#routing}

The router implements a two-phase navigation model with async guards, preventing invalid state transitions and enabling features like route-level code splitting and data prefetching:

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
  // Async guard: check permissions, prefetch data
  const allowed = await checkAccess(to.params.id);
  return allowed ? true : (Router.to("/unauthorized"), false);
});
```

The router supports both history and hash modes, nested routes, and parameter validation.

### Zustand-Aligned State Management {#state-management}

The store system follows Zustand's API design, providing a minimal surface area for state management with computed properties:

```typescript
const counterStore = createStore("counter", (set, get) => ({
  count: 0,
  doubled: computed(["count"], () => get().count * 2),

  increment: () => set({ count: get().count + 1 }),
  reset: () => set({ count: 0 }),
}));

// In a view
const CounterView = defineView((ctx) => {
  const state = useStore(counterStore);

  return {
    template,
    events: {
      "increment<click>": () => counterStore.getState().increment(),
    },
  };
});
```

Stores are singletons by name, support subscription-based reactivity, and integrate with the view lifecycle through `bindStore`.

### LFU-Cached Service Layer {#services}

The service layer manages API requests with built-in caching, deduplication, and request queuing:

```typescript
const UserService = createService(syncFn, 100, 10);

UserService.add({
  name: "getUser",
  url: "/api/users/:id",
  method: "GET",
});

// In a view
const ProfileView = defineView((ctx, params) => {
  const service = UserService.instance();

  useEffect(() => {
    service.all({ getUser: { id: params.userId } }, (data) => {
      ctx.updater.set({ user: data.getUser });
      ctx.updater.digest();
    });
  }, [params.userId]);

  return { template };
});
```

The LFU (Least Frequently Used) cache automatically evicts rarely-accessed entries while keeping hot data in memory.

### Capture-Phase Event Delegation {#events}

All DOM events are delegated to `document.body` in the capture phase, eliminating the need for manual event listener management and enabling efficient event handling across thousands of elements:

```typescript
const ListView = defineView((ctx) => {
  return {
    template,
    events: {
      // Root element event
      "submit<click>": (e) => handleSubmit(e),

      // Delegated to child elements matching .item
      "$.item<click>": (e) => handleItemClick(e),

      // Global window event
      "$window<resize>": (e) => handleResize(e),

      // Modifier key support
      "save<click><ctrl>": (e) => handleSave(e),
    },
  };
});
```

The event delegator uses reference counting to share listeners across views, preventing memory leaks and duplicate handlers.

### Cooperative Time-Slicing {#scheduler}

The framework includes two cooperative schedulers designed to keep the browser responsive.

An internal deferred-task scheduler in `utils.ts` processes a FIFO queue of framework operations such as `endUpdate` and `nodeProps` synchronization. Each batch runs for up to 9ms before yielding to the browser.

A user-facing scheduler in `framework.ts` is exposed via `Framework.task()`. It uses a 48ms time budget and a three-tier scheduling strategy: `scheduler.postTask` with background priority, `requestIdleCallback`, or `setTimeout` as a universal fallback.

```typescript
// Queue a long-running operation for background processing
Framework.task(longComputation, [arg1, arg2]);

// The user-facing scheduler will:
// 1. Execute work in 48ms chunks
// 2. Yield to browser between chunks
// 3. Resume via scheduler.postTask, requestIdleCallback, or setTimeout
```

### Module Federation Support {#micro-frontends}

swifty-mvc includes built-in support for Module Federation, enabling micro-frontend architectures where multiple teams can independently develop and deploy features:

```typescript
// Host application
Framework.boot({
  rootId: "app",
  defaultView: "views/home",
  require: (viewPath) => import(`./views/${viewPath}`),
});

// Remote module (exposed via Module Federation)
export const DashboardView = defineView((ctx) => {
  return { template };
});
```

Views are loaded asynchronously through the configured `require` function, supporting both local imports and remote module federation containers.

### Hot Module Replacement {#hmr}

The framework provides two-layer HMR for both templates and views, preserving component state during development:

```typescript
// Vite plugin configuration
import { swiftyMvcPlugin } from "swifty-mvc/vite";

export default {
  plugins: [swiftyMvcPlugin()],
};
```

When you edit a template file, only the affected views re-render. When you edit a view's setup function, the view remounts while preserving parent frame state. HMR is injected automatically by the plugin with no configuration option required.

## Architecture Overview {#architecture}

The framework boots through a carefully orchestrated sequence that initializes the router, state system, and frame tree before mounting the root view:

```
Framework.boot(config)
  ├─ Merge configuration
  ├─ Router._setConfig(config)
  ├─ EventDelegator.setFrameGetter()
  ├─ Bind Router.CHANGED → dispatcherNotifyChange
  ├─ Bind State.CHANGED → dispatcherNotifyChange
  ├─ Frame.createRoot(config.rootId)
  ├─ Router._bind() (listen to popstate/hashchange)
  └─ Mount defaultView (if router didn't initiate a mount)
       └─ Frame.mountView(viewPath)
            ├─ Load view class via config.require
            ├─ mountCtx(frame, setup, params)
            │    ├─ Create ViewCtx with updater, emitter
            │    ├─ setCurrentCtx(ctx)
            │    ├─ Execute setup(ctx, params)
            │    │    └─ Hooks register state, effects, subscriptions
            │    └─ Wire template, events, assign to ctx
            └─ ctx.render()
                 ├─ Increment signature
                 ├─ Fire 'render' event
                 └─ updater.digest()
                      ├─ Detect changed keys
                      ├─ Execute compiled template function
                      ├─ Apply DOM diff (string or VDOM)
                      └─ Run digest callbacks
```

When the router or state changes, the dispatcher walks the frame tree using an iterative LIFO stack traversal, rendering only the views that observed the changed keys:

```
Router/State change
  └─ dispatcherNotifyChange(event)
       ├─ If view changed: rootFrame.mountView(newViewPath)
       └─ If params/state changed:
            ├─ Increment dispatcherUpdateTag
            └─ dispatcherUpdate(rootFrame, stateKeys)
                 └─ Iterative LIFO stack traversal:
                      ├─ Pop frame from stack
                      ├─ Check if observed keys changed
                      ├─ If changed: view.render()
                      └─ Push children (reverse order) to stack
```

This architecture ensures that deeply nested frame trees cannot blow the JavaScript call stack, and async renders are properly sequenced without blocking sibling subtrees.

## Comparison with Other Frameworks {#comparison}

swifty-mvc occupies a distinct position in the frontend framework landscape:

Versus React: React uses a component-based architecture with JSX, hooks, and a virtual DOM. swifty-mvc uses MVC with HTML templates, a functional setup API, and defaults to real-DOM diffing. React's ecosystem is larger, but swifty-mvc offers smaller bundles, simpler mental models for business logic, and better separation of concerns for large teams.

Versus Vue: Vue combines component-based architecture with template syntax and a reactivity system. swifty-mvc shares Vue's template approach but enforces MVC separation and eliminates the reactivity proxy magic in favor of explicit state management. Vue is more approachable for beginners, but swifty-mvc provides more predictable behavior for complex applications.

Versus Angular: Angular is a full-featured framework with dependency injection, decorators, and RxJS. swifty-mvc is minimal by comparison, focusing on core MVC primitives without the architectural overhead. Angular suits teams that want a complete solution, while swifty-mvc suits teams that want control over their architecture.

:::warning When not to use swifty-mvc
If you are building a small personal project, a content-heavy marketing site, or an application where you need a large ecosystem of third-party components, React or Vue may be better choices. swifty-mvc is optimized for enterprise business applications where long-term maintainability and predictable performance matter more than rapid prototyping.
:::

## Quick Example {#quick-example}

Here is a complete counter application that demonstrates the core swifty-mvc APIs:

```typescript
// main.ts
import { Framework } from "swifty-mvc";

Framework.boot({
  rootId: "app",
  defaultView: "views/counter",
});
```

```typescript
// views/counter.ts
import { defineView, useState } from "swifty-mvc";
import template from "./counter.html";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "increment<click>": () => setCount(getCount() + 1),
      "decrement<click>": () => setCount(getCount() - 1),
      "reset<click>": () => setCount(0),
    },
  };
});
```

```html
<!-- views/counter.html -->
<div class="counter">
  <h1>Counter: {{=count}}</h1>

  <div class="controls">
    <button @click="decrement()">-</button>
    <button @click="reset()">Reset</button>
    <button @click="increment()">+</button>
  </div>
</div>
```

The setup function runs once when the view mounts, registering state and event handlers. The template is compiled at build time to an optimized render function. When you click a button, the event delegator routes the event to the handler, which updates the state and triggers a digest cycle. The updater detects the changed `count` key, re-executes the template function, and applies a minimal DOM diff to update only the `<h1>` text content.

:::tip Next steps
To start building with swifty-mvc, read the Getting Started guide for installation instructions and your first view. For a deeper dive into the architecture, see the MVC Architecture documentation.
:::
