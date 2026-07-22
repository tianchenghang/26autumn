---
title: Introduction
description: Learn what Swifty MVC is, its core philosophy, and why it was built.
---

# What is Swifty MVC? {#what-is-swifty-mvc}

Swifty MVC (`@swifty.js/mvc`) is a functional-first, zero-runtime-dependency MVC framework for building single-page applications and micro-frontends in the browser. Unlike class-based or component-based frameworks, Swifty MVC deliberately avoids classes, `this` context, prototypes, and mixins. Every abstraction — views, frames, routers, state containers, event emitters — is implemented as plain objects and closures.

The framework provides a complete application architecture with clearly separated concerns:

- Model: `State` for cross-view observable data and `Store` for Zustand-aligned complex state management
- View: Compile-time HTML templates with a custom expression language, rendered through either a real-DOM diffing engine or a virtual DOM reconciliation system
- Controller: `defineView` setup functions that wire data, events, and lifecycle hooks into a `ViewCtx` context object

## Why Swifty MVC? {#why-swifty-mvc}

### Functional-first design {#functional-first-design}

Every framework primitive is a plain object returned by a factory function. There are no classes to instantiate, no `this` binding to manage, and no prototype chains to debug. This leads to code that is easier to reason about, easier to test, and less prone to the subtle bugs that arise from implicit context.

```ts
import { defineView, useState, useEffect } from "@swifty.js/mvc";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

  useEffect(() => {
    const timer = setInterval(() => setCount(getCount() + 1), 1000);
    return () => clearInterval(timer);
  });

  return {
    template: "<div>Count: {{=getCount()}}</div>",
    events: {
      "button<click>"() {
        setCount(0);
      },
    },
  };
});
```

### Zero runtime dependencies {#zero-runtime-dependencies}

The main runtime entry (`@swifty.js/mvc`) has no production dependencies. The compiler dependencies (`@babel/parser`, `@babel/types`, `htmlparser2`) are only used at build time. Compiled templates import only a handful of encoding helpers from `@swifty.js/mvc/runtime`, keeping the browser bundle minimal.

### Micro-frontend ready {#micro-frontend-ready}

The Frame tree architecture naturally supports micro-frontend composition. Child frames can be mounted inside parent views via the `v-swifty` attribute, each loading its view setup from a separate module — potentially from a different build artifact or team. The `FrameworkConfig.require` hook integrates with Module Federation for cross-boundary module loading.

### Two rendering modes {#two-rendering-modes}

Swifty MVC ships with two rendering engines:

- String mode (default): Templates compile to functions that return HTML strings. The framework performs a keyed real-DOM diff against the existing DOM, moving and updating nodes in place. This mode has no virtual DOM overhead.
- VDOM mode: Templates compile to functions that return virtual DOM node trees. A three-phase diffing algorithm with Longest Increasing Subsequence (LIS) reconciliation minimizes DOM mutations.

Both modes are selected via a single configuration flag (`vdom: true`), and the same template source works with either mode.

### Compile-time optimization {#compile-time-optimization}

Templates are compiled at build time into optimized JavaScript functions. The compiler performs:

- Expression extraction: `{{}}` template expressions are converted to JavaScript control flow
- Variable analysis: AST-based extraction (via Babel) identifies which closure variables the template references, generating precise import declarations
- Event encoding: `@event` attributes are encoded with view-scoped identifiers for the delegation system
- Dual-mode output: The same template can produce either string-mode or VDOM-mode functions

## Who is it for? {#who-is-it-for}

Swifty MVC is designed for teams that:

- Want a lightweight, dependency-free framework for building SPAs and micro-frontends
- Prefer functional composition over class inheritance
- Need fine-grained control over rendering performance
- Work in environments where bundle size matters
- Value explicit data flow and clear separation of concerns

## Comparison with other frameworks {#comparison}

| Feature          | Swifty MVC              | React                   | Vue                            | Svelte                |
| ---------------- | ----------------------- | ----------------------- | ------------------------------ | --------------------- |
| Paradigm         | MVC, functional         | Component, functional   | Component, options/composition | Component, compiler   |
| Runtime deps     | None                    | react, react-dom        | vue                            | None (compiled)       |
| Rendering        | String DOM diff / VDOM  | VDOM (reconciler)       | VDOM (with proxies)            | Compiled imperative   |
| State            | State + Store           | useState/context/redux  | reactive/ref/provide           | stores/writable       |
| Routing          | Built-in (history/hash) | External (react-router) | External (vue-router)          | External (svelte-kit) |
| Micro-frontends  | Native (Frame tree)     | Module Federation       | Module Federation              | Module Federation     |
| Template         | HTML + `{{}}` syntax    | JSX                     | SFC template                   | SFC template          |
| Classes required | No                      | No (with hooks)         | No (composition API)           | No                    |

## Next steps {#next-steps}

- To start using Swifty MVC right away, head to [Quick Start](/docs/en/swifty-mvc/getting-started/quick-start).
- To understand the framework architecture in depth, read [Architecture Overview](/docs/en/swifty-mvc/guide/essentials/architecture).
- For the complete API surface, see the [API Reference](/docs/en/swifty-mvc/api-reference/framework).
