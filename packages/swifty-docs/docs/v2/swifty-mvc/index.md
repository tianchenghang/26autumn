---
title: swifty-mvc
description: A lightweight TypeScript MVC frontend framework for building single-page applications and micro-frontends with zero runtime dependencies and compile-time template optimization.
---

# swifty-mvc

A lightweight TypeScript MVC frontend framework for single-page applications and micro-frontend scenarios.

swifty-mvc provides a complete application architecture with a functional-first API, zero runtime dependencies, and compile-time template transformation. It ships a real-DOM diff engine by default with an optional VDOM mode, two-phase route confirmation, Zustand-aligned state management, and built-in HMR support across Vite, Webpack, and Rspack.

## Design Principles

- Functional API: no class, no this, no prototype, no mixin
- Zero runtime dependencies (Babel is build-time only)
- Real DOM diff via innerHTML plus keyed comparison, with VDOM mode available via config
- Module Federation support for micro-frontends
- Compile-time template compilation with zero-config variable extraction
- Two rendering modes: string mode (real-DOM diff) and VDOM mode (LIS reconciliation)

## Key Features

### Functional-First API

Every API in the framework is a pure function or a factory that returns closures. There are no classes, no `this` binding, and no prototype chains. State lives in closures, behavior lives in functions, and composition happens through standard JavaScript patterns.

### Dual Rendering Modes

String mode (default) compiles templates to string-based render functions and performs real-DOM diffing against a temporary DOM tree. VDOM mode (opt-in via `vdom: true`) uses a virtual DOM with LIS (Longest Increasing Subsequence) reconciliation for views that benefit from fine-grained updates.

### Two-Phase Routing

The router implements a two-phase navigation model. A preventable `change` event fires before navigation, allowing rejection or suspension. Async `beforeEach` guards run between phases. A `changed` event fires after navigation completes, triggering view updates. Both history and hash modes are supported.

### Zustand-Aligned State Management

`createStore` provides a minimal surface area for state management with computed properties and subscription-based reactivity. A lighter `State` singleton is available for simple cross-view data. Both integrate with the view lifecycle through `bindStore` and `useStore`.

### LFU-Cached Service Layer

`createService` manages API requests with LFU caching, request deduplication, serial queuing, and lifecycle events. Endpoint metadata is registered declaratively with `before` and `after` hooks for request and response transformation.

### Capture-Phase Event Delegation

All DOM events are delegated to `document.body` in the capture phase. The `EventDelegator` walks from `event.target` up to the owning frame, matching handlers with support for selector delegation, multi-event binding, and modifier keys. Reference counting per event type prevents duplicate listeners.

### Compile-Time Templates

HTML templates are compiled at build time into JavaScript render functions. The compiler uses `@babel/parser` for AST-based variable extraction, providing zero-config template variable detection. No template parsing occurs at runtime.

### Cooperative Time-Slicing

The task scheduler processes long-running work in 9ms batches, yielding to the browser via `scheduler.yield()` (Chrome 115+) or `setTimeout(0)` fallback to maintain responsive user input and smooth animations.

### Module Federation Support

The framework supports Module Federation and cross-project view loading via `FrameworkConfig.require`. Host applications can load views from remote modules, enabling micro-frontend architectures where multiple teams develop and deploy independently.

### Built-In HMR

Two-layer hot module replacement covers both templates and view setup functions. Template changes force-re-render affected views. View setup changes re-run the setup function against the existing `ViewCtx`, preserving view-local state. The bundler plugins auto-inject HMR boilerplate at compile time.

## Architecture Overview

```
                          Framework.boot(config)
                                |
          +---------------------+---------------------+
          |                     |                     |
       Router               State                Frame Tree
    (history/hash)       (observable)          (mount/unmount)
          |                     |                     |
    two-phase              get/set/digest         createFrame
    confirmation           change tracking       parent-child
          |                     |                     |
          +----------+----------+                     |
                     |                                |
              dispatcherNotifyChange                  |
                     |                                |
              dispatcherUpdate (walk tree)            |
                     |                                |
                   ViewCtx <----+----> mountCtx / unmountCtx
                     |          |
              +------+-------+  |
              |      |       |  |
           updater  events  hooks
              |      |       |
         digest()  delegator  useState/useEffect/...
              |
     +--------+--------+
     |                 |
  string mode      VDOM mode
  (real-DOM diff)  (LIS reconciliation)
     |                 |
  dom.ts           vdom.ts
```

The framework boots by merging configuration, initializing the router, wiring the event delegator, binding state and router change events to the dispatcher, creating the root frame, and mounting the default view. When the router or state changes, the dispatcher walks the frame tree using an iterative LIFO stack traversal, rendering only the views that observed the changed keys.

## Quick Start

Install swifty-mvc and the bundler plugin for your build tool.

```bash
pnpm add swifty-mvc
pnpm add -D vite
```

Configure the bundler plugin in `vite.config.ts`.

```ts
import { defineConfig } from "vite";
import { swiftyMvcPlugin } from "swifty-mvc/vite";

export default defineConfig({
  plugins: [swiftyMvcPlugin()],
});
```

Define a view in `src/views/home.ts`.

```ts
import { defineView, useState } from "swifty-mvc";
import template from "./home.html";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "increment<click>"() {
        setCount(getCount() + 1);
      },
    },
  };
});
```

Write the template in `src/views/home.html`.

```html
<div class="home">
  <h1>Welcome to swifty-mvc</h1>
  <p>Count: {{=count}}</p>
  <button @click="increment()">Increment</button>
</div>
```

Boot the framework in `src/main.ts`.

```ts
import { Framework } from "swifty-mvc";

Framework.boot({
  rootId: "root",
  routeMode: "history",
  defaultView: "src/views/home",
  routes: {
    "/": "src/views/home",
    "/about": "src/views/about",
  },
});
```

Create the HTML entry point `index.html`.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>swifty-mvc App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Start the dev server with `pnpm exec vite`.

## Guide

The guide section walks through the core concepts of swifty-mvc, from foundational ideas to advanced patterns.

- [Introduction](./guide/introduction) -- Framework overview, design philosophy, and comparison with other frameworks
- [Quick Start](./guide/quick-start) -- Installation, project setup, and your first view
- [Views](./guide/views) -- View definition, lifecycle, ViewCtx API, and embedded views
- [Routing](./guide/routing) -- Two-phase navigation, route configuration, guards, and modes
- [State Management](./guide/state-management) -- State singleton, createStore, computed properties, and store binding
- [Template Syntax](./guide/template-syntax) -- Output operators, control flow, loops, variable declarations, and event binding
- [Event Handling](./guide/event-handling) -- Capture-phase delegation, handler naming, selector delegation, and modifiers
- [Hooks](./guide/hooks) -- useState, useEffect, useStore, useInterval, useTimeout, useResource, useEvent, useUrlState
- [Service Layer](./guide/service) -- createService, LFU caching, request deduplication, and serial queuing
- [Frame Tree](./guide/frame-tree) -- Frame lifecycle, parent-child navigation, zone management, and cross-view invocation
- [Rendering](./guide/rendering) -- String mode, VDOM mode, change detection, and DOM diff engines
- [Bundler Integration](./guide/bundler-integration) -- Vite plugin, Webpack loader, and Rspack loader configuration
- [Hot Module Replacement](./guide/hmr) -- Two-layer HMR, state preservation, and auto-injection
- [Micro-Frontends](./guide/micro-frontends) -- Module Federation support and cross-project view loading
- [Performance](./guide/performance) -- Cooperative time-slicing, reference-counted events, and LFU cache

## API Reference

The API reference section provides detailed documentation for every exported function, type, and configuration option.

- [Framework](./api/framework) -- Framework.boot, FrameworkConfig, defineView, createEmitter, createCache
- [Router](./api/router) -- Router.to, Router.parse, Router.diff, two-phase events, beforeEach guards
- [State](./api/state) -- State singleton, createStore, computed, bindStore, useUrlState
- [View](./api/view) -- defineView, ViewCtx, ViewSetup, mount and unmount lifecycle
- [Hooks](./api/hooks) -- useState, useEffect, useStore, useInterval, useTimeout, useResource, useEvent
- [Frame](./api/frame) -- Frame singleton API, frame instance methods, createFrame, zone management
- [Events](./api/events) -- EventDelegator, handler naming convention, reference counting
- [Compiler](./api/compiler) -- compileTemplate, extractGlobalVars, compilation pipeline

## Comparison

| Aspect       | swifty-mvc                      | React                      | Vue                             | Angular                        |
| ------------ | ------------------------------- | -------------------------- | ------------------------------- | ------------------------------ |
| Architecture | MVC with functional API         | Component-based with hooks | Component-based with reactivity | Component-based with DI        |
| Templates    | Compile-time HTML               | JSX (runtime)              | HTML with directives (runtime)  | HTML with directives (runtime) |
| Rendering    | Real-DOM diff (default) or VDOM | VDOM                       | VDOM                            | Incremental DOM                |
| Routing      | Two-phase with async guards     | External (React Router)    | External (Vue Router)           | Built-in                       |
| State        | Zustand-aligned store           | External (Redux, Zustand)  | Built-in reactivity             | RxJS services                  |
| Dependencies | Zero runtime                    | React + ReactDOM           | Vue runtime                     | Angular + RxJS + Zone.js       |
| Bundlers     | Vite, Webpack, Rspack           | Vite, Webpack              | Vite, Webpack                   | Angular CLI (Webpack)          |

swifty-mvc is optimized for enterprise business applications where long-term maintainability, predictable performance, and small bundle size matter more than a large third-party ecosystem. Teams already familiar with MVC patterns will find the learning curve gentle and the functional API familiar.
