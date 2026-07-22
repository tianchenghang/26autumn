# @swifty.js/mvc

A lightweight TypeScript MVC frontend framework for single-page applications and micro-frontend scenarios.

Version: 0.0.19
License: ISC
Package: @swifty.js/mvc

## Overview

swifty-mvc is a functional-first MVC framework that provides a complete application architecture with zero runtime dependencies. It features a real-DOM diff engine (with optional VDOM mode), compile-time template transformation, two-phase route confirmation, zustand-aligned state management, and built-in HMR support across Vite, Webpack, and Rspack.

Design principles:

- Functional API: no class, no this, no prototype, no mixin
- Zero runtime dependencies (Babel is build-time only)
- Real DOM diff via innerHTML plus keyed comparison (VDOM mode available via config)
- Module Federation support for micro-frontends
- Compile-time template compilation with zero-config variable extraction
- Two rendering modes: string mode (real-DOM diff) and VDOM mode (LIS reconciliation)

## Architecture

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

## Installation

```bash
# pnpm
pnpm add @swifty.js/mvc

# npm
npm install @swifty.js/mvc

# yarn
yarn add @swifty.js/mvc
```

### Peer dependencies

- Vite 8+ (optional, for the Vite plugin)

### Bundler plugin

Install the bundler plugin matching your build tool:

```ts
// vite.config.ts
import { swiftyMvcPlugin } from "@swifty.js/mvc/vite";

export default defineConfig({
  plugins: [swiftyMvcPlugin()],
});
```

```ts
// webpack.config.js
const { swiftyMvcLoader } = require("@swifty.js/mvc/webpack");

module.exports = {
  module: {
    rules: [{ test: /\.html$/, use: swiftyMvcLoader() }],
  },
};
```

```ts
// rspack.config.js
const { swiftyMvcLoader } = require("@swifty.js/mvc/rspack");

module.exports = {
  module: {
    rules: [{ test: /\.html$/, use: swiftyMvcLoader() }],
  },
};
```

## Quick Start

### 1. Define a view

```ts
// src/views/home.ts
import { defineView, useState } from "@swifty.js/mvc";
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

### 2. Write a template

```html
<!-- src/views/home.html -->
<div class="home">
  <h1>Welcome to Swifty MVC</h1>
  <p>Count: {{=count}}</p>
  <button @click="increment()">Increment</button>
</div>
```

### 3. Boot the framework

```ts
// src/main.ts
import { Framework } from "@swifty.js/mvc";

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

### 4. HTML entry point

```html
<!doctype html>
<html>
  <head>
    <title>Swifty MVC App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## Core Concepts

### Views

A view is defined via `defineView()`. The setup function runs once on mount, receives a `ViewCtx`, and returns `{ template, events, assign? }`.

```ts
import { defineView, useState, useEffect } from "@swifty.js/mvc";
import template from "./my-view.html";

export default defineView((ctx, params) => {
  // View-local state
  const [getName, setName] = useState("name", "world");

  // Side effect with cleanup
  useEffect(() => {
    const timer = setInterval(() => console.log("tick"), 1000);
    return () => clearInterval(timer);
  });

  return {
    template,
    events: {
      "greet<click>"() {
        setName("Swifty");
      },
    },
    // Optional: custom data assignment logic
    assign(options) {
      ctx.updater.set({ greeting: `Hello, ${getName()}!` }).digest();
      return true;
    },
  };
});
```

#### ViewCtx

The `ViewCtx` is the first argument to every setup function. It provides all framework APIs:

| Method                        | Description                              |
| ----------------------------- | ---------------------------------------- |
| `ctx.render()`                | Force re-render the view                 |
| `ctx.observeLocation(params)` | Declare URL params this view reacts to   |
| `ctx.observeState(keys)`      | Declare State keys this view reacts to   |
| `ctx.capture(key, resource)`  | Register a destroyable resource          |
| `ctx.release(key)`            | Remove and destroy a resource            |
| `ctx.on(event, handler)`      | Listen to view lifecycle events          |
| `ctx.fire(event, data)`       | Emit a view event                        |
| `ctx.wrapAsync(fn)`           | Wrap async callback with signature guard |
| `ctx.beginUpdate(zoneId)`     | Begin zone update (unmount children)     |
| `ctx.endUpdate(zoneId)`       | End zone update (remount children)       |
| `ctx.updater`                 | Per-view data binding API                |
| `ctx.id`                      | View ID (same as owner frame ID)         |
| `ctx.owner`                   | Owner frame reference                    |

#### View Lifecycle

```
mountView(viewPath)
       |
   createCtx(frame)
       |
   setCurrentCtx(ctx)
       |
   setup(ctx, params)
       |
   +-- hooks: useState, useEffect, useStore, ...
       |
   setCurrentCtx(null)
       |
   wire template / events / assign
       |
   signature.value = 1
       |
   frame.view = ctx
       |
   registerEvents(ctx)
       |
   ctx.render() --> updater.digest() --> DOM diff --> endUpdate()
```

On unmount:

```
unmountView()
       |
   run useEffect cleanups (reverse order)
       |
   unregisterEvents(ctx)
       |
   destroyAllResources(ctx, true)
       |
   fire("destroy")
       |
   signature.value = 0
```

### Frame System

The Frame system manages the view lifecycle tree. Each Frame is a plain object with closure-based methods, registered in a global Map keyed by DOM element ID.

```ts
import { Frame, createFrame } from "@swifty.js/mvc";

// Create the root frame (called by Framework.boot)
const root = Frame.createRoot("root");

// Mount a view into a DOM element
root.mountView("src/views/home");

// Mount a child frame
const child = root.mountFrame("child-id", "src/views/detail", { id: "123" });

// Navigate the tree
const parent = child.parent();
const children = root.children();

// Cross-view method invocation
child.invoke("loadData", [{ id: "456" }]);

// Zone management: mount/unmount child frames in a DOM region
root.mountZone("zone-id");
root.unmountZone("zone-id");

// Unmount
child.unmountView();
root.unmountFrame("child-id");
```

#### Frame Singleton API

| Method                      | Description                                 |
| --------------------------- | ------------------------------------------- |
| `Frame.get(id)`             | Get frame by DOM element ID                 |
| `Frame.getAll()`            | Get all frames as a Map                     |
| `Frame.getRoot()`           | Get the root frame                          |
| `Frame.createRoot(rootId)`  | Create (or return) the singleton root frame |
| `Frame.on(event, handler)`  | Listen to static frame events (add/remove)  |
| `Frame.off(event, handler)` | Unbind static frame event                   |
| `Frame.fire(event, data)`   | Fire static frame event                     |

#### Frame Instance Methods

| Method                                | Description                                   |
| ------------------------------------- | --------------------------------------------- |
| `frame.mountView(path, params?)`      | Mount a view (sync or async load)             |
| `frame.unmountView()`                 | Unmount current view                          |
| `frame.mountFrame(id, path, params?)` | Mount a child frame                           |
| `frame.unmountFrame(id?)`             | Unmount a child frame                         |
| `frame.mountZone(zoneId?)`            | Find and mount all \v-swifty elements in zone |
| `frame.unmountZone(zoneId?)`          | Unmount child frames in zone                  |
| `frame.parent(level?)`                | Navigate up the tree                          |
| `frame.invoke(name, args?)`           | Cross-view method call                        |
| `frame.children()`                    | Get child frame IDs                           |
| `frame.on/off/fire`                   | Frame-level events                            |

#### Embedded Views (v-swifty)

Child views are embedded in templates via the `v-swifty` attribute:

```html
<div v-swifty="src/views/detail"></div>
```

The compiler encodes the view path. At render time, `mountZone` scans for `v-swifty` elements and calls `mountFrame` for each one.

#### Component Props & Events

Pass data to child views with `*prop` and bind child-to-parent events with `@event`:

```html
<div
  v-swifty="components/counter-updater"
  *count="{{=count}}"
  *step="{{=step}}"
  *history="{{@history}}"
  @increment="increment"
  @decrement="decrement"
  @clearHistory="clearHistory"
></div>
```

| Syntax                 | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `*prop="{{=expr}}"`    | Pass string value (HTML-escaped)                   |
| `*prop="{{@expr}}"`    | Pass object/array reference (resolved via refData) |
| `@event="handlerName"` | Bind child event to parent handler                 |

**Props flow:** Parent `updater.set().digest()` → template re-renders → `p-swifty-*` attributes update → `mountZone` reads and pushes to `childView.updater.set(props).digest()` → child re-renders.

**Events flow:** Child calls `ctx.owner.fire("eventName", data?)` → parent handler found by prefix-matching in events map → handler called with data.

Event matching is case-insensitive (emitter lowercases event keys, so `fire("clearHistory")` matches `on("clearhistory")` from HTML-lowercased attribute names).

```ts
// Child view
export default defineView((ctx, params) => {
  const p = (params || {}) as Record<string, unknown>;
  ctx.updater.digest({
    count: p["count"] ?? 0,
    step: p["step"] ?? 1,
    history: p["history"] ?? [],
  });
  return {
    template,
    events: {
      "increment<click>": () => ctx.owner.fire("increment"),
      "clearHistory<click>": () => ctx.owner.fire("clearHistory"),
    },
  };
});
```

### Routing

The Router supports two modes with a two-phase change confirmation protocol.

```ts
import { Router } from "@swifty.js/mvc";

// Navigate
Router.to("/list", { page: 2 });
Router.to({ page: 3 }); // update params only, keep current path
Router.to("/detail", { id: "123" }, true); // replace history entry

// Parse current URL
const loc = Router.parse();
console.log(loc.path); // "/list"
console.log(loc.params); // { page: "2" }
console.log(loc.get("page")); // "2"
console.log(loc.get("missing", "default")); // "default"

// Compute diff
const diff = Router.diff();
// { params: { page: { from: "1", to: "2" } }, path: { from: "/home", to: "/list" }, changed: true }

// Join path segments
Router.join("/api", "v1", "users"); // "/api/v1/users"
```

#### Two-Phase Change Confirmation

```
User action (Router.to, back/forward, link click)
       |
   CHANGE event (preventable)
       |
   +---+---+
   |       |
 reject  resolve  prevent
 (revert) (commit) (suspend)
   |       |
   |   beforeEach guards (async)
   |       |
   |   +---+---+
   |   |       |
   | false   true/undefined
   |   |       |
   | reject  resolve
   |           |
   CHANGED event (final)
       |
   dispatcherNotifyChange
       |
   mount new view / update params
```

```ts
// Listen to route changes
Router.on("change", (e) => {
  // e.reject() -- revert URL
  // e.prevent() -- pause navigation
  // e.resolve() -- commit navigation
});

Router.on("changed", (e) => {
  // e.params -- changed params { key: { from, to } }
  // e.path -- path diff
  // e.view -- view diff
  // e.changed -- whether anything changed
});

// Async navigation guard
const unGuard = Router.beforeEach(async (to, from) => {
  if (to.path === "/admin") {
    return await checkAuth(); // false aborts navigation
  }
  return true;
});

// Later: unGuard() to remove the guard
```

#### Routing Modes

```ts
Framework.boot({
  routeMode: "history", // default: uses pushState/popstate, clean URLs
  // routeMode: "hash",  // uses location.hash with #! prefix
});
```

#### Route Configuration

```ts
Framework.boot({
  rootId: "root",
  routes: {
    "/home": "app/views/home",
    "/detail": { view: "app/views/detail", title: "Detail Page" },
    "/admin": "app/views/admin",
  },
  defaultView: "app/views/home",
  unmatchedView: "app/views/not-found",
  defaultPath: "/home",
  rewrite(path, params, routes) {
    // Custom path rewriting logic
    if (path === "/" && !routes[path]) return "/home";
    return path;
  },
});
```

### State Management

swifty-mvc provides two state management layers:

#### State (Simple Cross-View Data)

`State` is a singleton for lightweight shared values (counters, toggles, session info).

```ts
import { State } from "@swifty.js/mvc";

// Write
State.set({ count: 1, title: "Hello" });
State.digest(); // fire changed event, notify views

// Read
const count = State.get("count");
const all = State.get(); // entire state object

// Get changed keys from last digest
const keys = State.diff(); // ReadonlySet<string>

// In view setup: observe specific keys
export default defineView((ctx) => {
  ctx.observeState("count,title");
  // When count or title changes via State.digest(), this view re-renders

  // Auto-cleanup on view destroy (reference-counted)
  State.clean("count,title")(ctx);

  return { template };
});
```

#### createStore (Complex Reactive State)

For complex state with handlers, derived data, or fine-grained subscriptions:

```ts
import { createStore, computed } from "@swifty.js/mvc";

const counterStore = createStore("counter", (set, get) => ({
  count: 0,
  step: 1,

  // Computed: auto-recomputes when deps change
  doubled: computed(["count"], () => get().count * 2),

  // Actions: functions attached to state
  increment() {
    set({ count: get().count + get().step });
  },
  decrement() {
    set({ count: get().count - get().step });
  },
  setStep(step: number) {
    set({ step });
  },
}));

// Read state
const state = counterStore.getState();
console.log(state.count); // 0
console.log(state.doubled); // 0

// Update state
counterStore.setState({ count: 5 });

// Subscribe to changes
const unSub = counterStore.subscribe((state, prevState) => {
  console.log("count changed:", prevState.count, "->", state.count);
});

// Use in view
export default defineView((ctx) => {
  const getState = useStore(counterStore, (s) => ({
    count: s.count,
    doubled: s.doubled,
  }));

  return {
    template,
    events: {
      "inc<click>"() {
        counterStore.getState().increment();
      },
    },
  };
});

// Cleanup
unSub();
counterStore.destroy();
```

#### bindStore (View Lifecycle Binding)

```ts
import { bindStore } from "@swifty.js/mvc";

export default defineView((ctx) => {
  // Auto-syncs store state to updater.data
  // Auto-unsubscribes on view destroy
  bindStore(ctx, counterStore, (s) => ({
    count: s.count,
    doubled: s.doubled,
  }));

  return { template };
});
```

### Service Layer

The Service system manages API requests with LFU caching, deduplication, serial queuing, and lifecycle events.

```ts
import { createService } from "@swifty.js/mvc";

// Create a service type with a transport function
const apiService = createService(
  (payload, callback) => {
    const url = payload.get("url");
    const method = payload.get("method") || "GET";
    const data = payload.get("data");

    fetch(url, { method, body: data ? JSON.stringify(data) : undefined })
      .then((res) => res.json())
      .then((result) => {
        payload.set("result", result);
        callback();
      })
      .catch((err) => {
        payload.set("error", err);
        callback();
      });
  },
  20, // cacheMax
  5, // cacheBuffer
);

// Register endpoint metadata
apiService.add({
  name: "getUser",
  url: "/api/user",
  cache: 30000, // 30s TTL
  before(payload) {
    // Transform request data before fetch
    const id = payload.get("id");
    payload.set("url", `/api/user/${id}`);
  },
  after(payload) {
    // Transform response data after fetch
    const result = payload.get("result");
    payload.set("userName", result.name);
  },
  cleanKeys: "listUsers", // Clear listUsers cache after this call
});

apiService.add({
  name: "listUsers",
  url: "/api/users",
  cache: 60000,
});

// Use in a view
export default defineView((ctx) => {
  const service = apiService.instance();

  // Capture the service instance for auto-destroy
  ctx.capture("api", service);

  return {
    template,
    events: {
      "loadUser<click>"() {
        service.all([{ name: "getUser", id: "123" }], (errors, payload) => {
          ctx.updater.set({ userName: payload.get("userName") }).digest();
        });
      },
    },
  };
});
```

#### Service Instance API

| Method                       | Description                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `instance.all(attrs, done)`  | Fetch all, callback with `(errors, p1, p2, ...)`                         |
| `instance.one(attrs, done)`  | Fetch all, callback per-attribute with `(error, payload, isLast, index)` |
| `instance.save(attrs, done)` | Fetch all, skip cache (always request)                                   |
| `instance.enqueue(callback)` | Add to serial task queue                                                 |
| `instance.dequeue()`         | Process next task                                                        |
| `instance.destroy()`         | Cancel pending requests                                                  |
| `instance.on/off/fire`       | Instance-level events                                                    |

#### Service Type API

| Method              | Description                                |
| ------------------- | ------------------------------------------ |
| `api.add(meta)`     | Register endpoint metadata                 |
| `api.meta(name)`    | Look up endpoint metadata                  |
| `api.cached(attrs)` | Read from cache without fetching           |
| `api.clear(names)`  | Clear cached responses for endpoints       |
| `api.on/off/fire`   | Type-level events (begin, done, fail, end) |
| `api.instance()`    | Create a new service instance              |

### Hooks

All hooks are called inside the `defineView` setup function. The setup runs once on mount (not on every render like React).

#### useState

View-local state backed by `ctx.updater.data`. Returns a `[getter, setter]` pair.

```ts
const [getCount, setCount] = useState("count", 0);
// getter always reads latest from updater.data (no stale closures)
// setter writes to updater.data and triggers digest
```

#### useEffect

Register a side effect with optional cleanup. Runs synchronously during setup.

```ts
useEffect(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer); // cleanup on destroy
});
```

#### useStore

Bind a zustand-aligned store to the view's updater. Auto-syncs and auto-unsubscribes.

```ts
const getState = useStore(counterStore, (s) => ({ count: s.count }));
```

#### useInterval

Set up an interval that is automatically cleared on view destroy.

```ts
useInterval(() => {
  ctx.updater.set({ time: Date.now() }).digest();
}, 1000);
```

#### useTimeout

Set up a timeout that is automatically cleared on view destroy.

```ts
useTimeout(() => {
  console.log("fired");
}, 5000);
```

#### useResource

Capture a resource that is automatically destroyed on view destroy or render.

```ts
const service = createService(syncFn);
useResource("myService", service.instance(), true); // destroyOnRender = true
```

#### useEvent

Register an event handler on the view's internal emitter. Auto-cleaned on destroy.

```ts
useEvent("destroy", () => console.log("View destroyed"));
useEvent("render", () => console.log("View rendered"));
```

#### useUrlState

Sync view state with URL query parameters.

```ts
const [state, setState] = useUrlState(ctx, { page: "1", size: "20" });
// state.page reads from URL, defaults to "1"
// setState({ page: "2" }) updates URL via Router.to()
```

### Template System

Templates are `.html` files compiled at build time into JavaScript render functions.

#### Output Operators

| Syntax      | Description                                            |
| ----------- | ------------------------------------------------------ |
| `{{=expr}}` | HTML-escaped output (safe for embedding in markup)     |
| `{{:expr}}` | Two-way binding (same as = for rendering)              |
| `{{!expr}}` | Raw output (no HTML escaping, use with caution)        |
| `{{@expr}}` | Reference lookup for passing JS objects to child views |

#### Control Flow

```html
{{if user.isAdmin}}
<div class="admin-panel">Welcome, admin</div>
{{else if user.isEditor}}
<div class="editor-panel">Welcome, editor</div>
{{else}}
<div class="user-panel">Welcome, user</div>
{{/if}}
```

#### Loops

```html
<!-- forOf: array iteration -->
{{forOf items as item index}}
<div class="item" id="item-{{=index}}">{{=index}}: {{=item.name}}</div>
{{/forOf}}

<!-- forOf with first/last helpers -->
{{forOf items as item index last first}}
<div class="{{if first}}first{{/if}}{{if last}}last{{/if}}">{{=item.name}}</div>
{{/forOf}}

<!-- forOf with destructuring -->
{{forOf entries as {key, value} index}}
<div>{{=key}}: {{=value}}</div>
{{/forOf}}

<!-- forIn: object iteration -->
{{forIn config as val key}}
<div>{{=key}} = {{=val}}</div>
{{/forIn}}

<!-- for: generic loop -->
{{for(let i = 0; i < count; i++)}}
<span>{{=i}}</span>
{{/for}}
```

#### Variable Declaration

```html
{{set formattedDate = new Date(date).toLocaleDateString()}}
<p>Date: {{=formattedDate}}</p>
```

#### Event Binding

```html
<!-- Direct handler -->
<button @click="handleClick()">Click me</button>

<!-- With parameters -->
<button @click="deleteItem({id: item.id})">Delete</button>

<!-- Multiple events -->
<input @input,change="validate()" />

<!-- With modifiers -->
<button @click<ctrl>="specialAction()">Ctrl+Click</button>
```

#### Compilation Pipeline

```
.html source
    |
protectComments()      -- preserve HTML comments
    |
convertArtSyntax()     -- {{}} to <% %> internal syntax
    |
processViewEvents()    -- @event attribute encoding
    |
restoreComments()      -- restore HTML comments
    |
extractGlobalVars()    -- AST-based variable auto-detection
    |
compileToFunction()    -- <% %> to JS template function (string mode)
    or
compileToVDomFunction() -- <% %> to VDomNode tree builder (VDOM mode)
    |
ES module output       -- exports default __swifty_template__
```

### Updater

The Updater provides per-view data binding with change detection and DOM diff triggering.

```ts
// Inside a view setup function
ctx.updater.set({ name: "Alice", age: 30 }); // set data
ctx.updater.get("name"); // read data
ctx.updater.get(); // read entire data object
ctx.updater.digest(); // trigger re-render if data changed
ctx.updater.digest({ count: 1 }); // set + digest in one call
ctx.updater.forceDigest(); // force re-render regardless of changes
ctx.updater.snapshot(); // record current version
ctx.updater.altered(); // check if version changed since snapshot
ctx.updater.getChangedKeys(); // keys changed in current digest
```

#### Change Detection

The Updater tracks changes via `setData()`: for each key in the new data, it compares against the old value. Only non-primitive, non-function values trigger comparison; primitives are always considered changed if the reference differs. Changed keys are collected into a `Set<string>` and passed through the diff pipeline.

#### Rendering Modes

String mode (default, `vdom: false`):

1. Template function produces an HTML string
2. `domGetNode()` parses HTML into a temporary DOM tree via `document.implementation.createHTMLDocument`
3. `domSetChildNodes()` performs keyed diff against the live DOM
4. `applyDomOps()` applies mutations (appendChild, removeChild, replaceChild, insertBefore)

VDOM mode (`vdom: true`):

1. Template function produces a `VDomNode` tree via `vdomCreate`
2. `vdomSetChildNodes()` performs three-phase diff:
   - Phase 1: Head fast-path (match identical nodes from start)
   - Phase 2: Tail fast-path (match identical nodes from end)
   - Phase 3: KeyMap reconciliation with LIS (Longest Increasing Subsequence) to minimize DOM moves
3. DOM mutations are applied directly

## Bundler Integration

### Vite Plugin

```ts
import { swiftyMvcPlugin } from "@swifty.js/mvc/vite";

export default defineConfig({
  plugins: [
    swiftyMvcPlugin({
      debug: false, // enable debug mode with line tracking
      vdom: false, // enable VDOM output mode
    }),
  ],
});
```

The Vite plugin:

- Resolves `.html` imports and compiles them via `compileTemplate`
- Auto-extracts template variables (zero-config)
- Auto-injects HMR snippets for both template and view modules
- Handles Vite 7 and Vite 8 compatibility

### Webpack Loader

```ts
import { swiftyMvcLoader } from "@swifty.js/mvc/webpack";

module.exports = {
  module: {
    rules: [
      {
        test: /\.html$/,
        use: swiftyMvcLoader({ debug: false, vdom: false }),
      },
    ],
  },
};
```

### Rspack Loader

```ts
import { swiftyMvcLoader } from "@swifty.js/mvc/rspack";

module.exports = {
  module: {
    rules: [
      {
        test: /\.html$/,
        use: swiftyMvcLoader({ debug: false, vdom: false }),
      },
    ],
  },
};
```

## Hot Module Replacement

HMR hot-swaps view code without a full page reload, preserving view-local state.

### Two HMR Layers

1. Template layer (`.html` changes): `hotSwapByTemplate(old, new)` finds every mounted view whose template matches the old reference, replaces it, and force-renders.

2. View setup layer (`.ts` changes): `hotSwapByView(old, new)` updates the view-registry and calls `hotSwapFrames(viewPath, newSetup)` which runs `hotSwapView` on every matching frame.

### State Preservation

`hotSwapView` preserves the entire `ViewCtx`: `updater.data`, `resources`, `emitter`, `signature`, `id`, and `owner` all stay the same. The sequence:

1. Run old `useEffect` cleanups
2. Unregister old events
3. Destroy `destroyOnRender` resources
4. Re-run `newSetup(ctx)` against the same ctx
5. Update template/events/assign from the new descriptor
6. Register new events
7. Increment signature, fire `render`, force re-render

### Auto-Injection

The bundler plugins auto-inject HMR boilerplate at compile time. Users never need to write `import.meta.hot` or `module.hot` themselves. The injection:

- For `.html` modules: self-accepts, calls `hotSwapByTemplate(old, new)`
- For `.ts` view modules: self-accepts, calls `hotSwapByView(old, new)`

## Micro-Frontend Support

swifty-mvc supports Module Federation and cross-project view loading via `FrameworkConfig.require`.

```ts
Framework.boot({
  rootId: "root",
  projectName: "host-app",
  require(names, params) {
    // Integrate with Webpack Module Federation or dynamic import
    return Promise.all(
      names.map((name) => {
        if (name.startsWith("remote-app/")) {
          return import("remote_app/" + name.slice("remote-app/".length));
        }
        return import("./src/" + name);
      }),
    );
  },
  routes: {
    "/": "host-app/views/home",
    "/remote": "remote-app/views/detail",
  },
});
```

## Event Delegation

All DOM events are delegated to `document.body` in the capture phase. The EventDelegator walks from `event.target` up to `document.body`, resolving the owning Frame and matching handlers.

### Handler Naming Convention

| Syntax                     | Meaning                                          |
| -------------------------- | ------------------------------------------------ |
| `handler<click>`           | Event on the view's root element                 |
| `$selector<click>`         | Delegated to child elements matching `.selector` |
| `$<click>`                 | Empty selector, fires only at the Frame boundary |
| `$window<resize>`          | Delegated to `window`                            |
| `$document<keydown>`       | Delegated to `document`                          |
| `handler<click,mousedown>` | Multi-event binding                              |
| `name<click><ctrl>`        | Fires only when the Ctrl modifier is held        |

### Reference Counting

`bind`/`unbind` use reference counting per event type so multiple views registering the same event type do not attach duplicate listeners.

## API Reference

### Exports

| Category  | Exports                                                                                     |
| --------- | ------------------------------------------------------------------------------------------- |
| Framework | `Framework`, `defineView`, `EventDelegator`                                                 |
| State     | `State`, `createStore`, `computed`, `bindStore`, `useUrlState`                              |
| Router    | `Router`                                                                                    |
| View      | `defineView`, `ViewCtx`, `ViewSetup` (types)                                                |
| Hooks     | `useState`, `useEffect`, `useStore`, `useInterval`, `useTimeout`, `useResource`, `useEvent` |
| Frame     | `Frame`, `createFrame`, `registerViewClass`, `invalidateViewClass`, `FrameApi` (type)       |
| Service   | `createService`, `ServiceApi`, `ServiceInstance` (types)                                    |
| VDOM      | `vdomCreate` (used by compiled templates)                                                   |
| Types     | All types from `./types` via `export *`                                                     |

### Bundler Entry Points

| Import                    | Description                                                                    |
| ------------------------- | ------------------------------------------------------------------------------ |
| `@swifty.js/mvc`          | Main runtime API                                                               |
| `@swifty.js/mvc/vite`     | Vite plugin (`swiftyMvcPlugin`)                                                |
| `@swifty.js/mvc/webpack`  | Webpack loader (`swiftyMvcLoader`)                                             |
| `@swifty.js/mvc/rspack`   | Rspack loader (`swiftyMvcLoader`)                                              |
| `@swifty.js/mvc/runtime`  | Template runtime helpers (`encHtml`, `strSafe`, `encUri`, `encQuote`, `refFn`) |
| `@swifty.js/mvc/compiler` | Build-time compiler (`compileTemplate`, `extractGlobalVars`)                   |
| `@swifty.js/mvc/devtool`  | Devtool bridge (`installFrameDevtoolBridge`)                                   |
| `@swifty.js/mvc/client`   | Client-side type declarations (DOM augmentations, `*.html` module types)       |

## Configuration

### FrameworkConfig

| Key                | Type                                        | Default     | Description                                 |
| ------------------ | ------------------------------------------- | ----------- | ------------------------------------------- |
| `rootId`           | `string`                                    | `"root"`    | DOM root element ID                         |
| `routeMode`        | `"history" or "hash"`                       | `"history"` | Routing mode                                |
| `defaultView`      | `string`                                    | -           | Default view path when URL matches no route |
| `defaultPath`      | `string`                                    | `"/"`       | Default path when URL hash/query is empty   |
| `routes`           | `Record<string, string or RouteViewConfig>` | -           | Path-to-view mapping                        |
| `hashbang`         | `string`                                    | `"#!"`      | Hash prefix (hash mode only)                |
| `error`            | `(error: Error) => void`                    | throws      | Global error handler                        |
| `extensions`       | `string[]`                                  | -           | Extension view paths loaded at startup      |
| `initModule`       | `string`                                    | -           | Init module to load at startup              |
| `rewrite`          | `(path, params, routes) => string`          | -           | Route rewriting function                    |
| `unmatchedView`    | `string`                                    | -           | View path for 404 pages                     |
| `require`          | `(names, params?) => Promise<unknown[]>`    | -           | Async module loader (Module Federation)     |
| `skipViewRendered` | `boolean`                                   | -           | Skip view rendered check                    |
| `projectName`      | `string`                                    | -           | Project name for micro-frontend bridge      |
| `vdom`             | `boolean`                                   | `false`     | Enable VDOM rendering mode                  |
| `devtool`          | `boolean`                                   | `true`      | Enable Frame Devtool Bridge                 |

### RouteViewConfig

```ts
interface RouteViewConfig {
  view: string; // View path
  [k: string]: unknown; // Additional properties merged into location
}
```

## Development

### Build

```bash
# Build with tsup (recommended)
pnpm build

# Build with rollup (alternative)
pnpm build:rollup
```

### Test

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test:coverage
```

### Type Check

```bash
pnpm typecheck
```

### Format

```bash
pnpm format
```

### Project Structure

```
packages/swifty-mvc/
  src/
    index.ts              -- public API barrel export
    types.ts              -- all shared type definitions
    common.ts             -- constants, encoding helpers
    utils.ts              -- utility functions, task scheduler
    framework.ts          -- Framework.boot, dispatcher, task queue
    view.ts               -- defineView, ViewCtx, mount/unmount lifecycle
    view-registry.ts      -- view setup function registry
    frame.ts              -- Frame tree, createFrame, mount/unmount
    router.ts             -- Router with two-phase change confirmation
    state.ts              -- State singleton for cross-view data
    store.ts              -- createStore, computed, bindStore
    service.ts            -- createService, API management
    hooks.ts              -- useState, useEffect, useStore, etc.
    updater.ts            -- per-view data binding and digest
    dom.ts                -- real-DOM diff engine (string mode)
    vdom.ts               -- VDOM diff engine (VDOM mode)
    event-emitter.ts      -- multi-cast event system
    event-delegator.ts    -- DOM event delegation
    cache.ts              -- LFU-style bounded cache
    url-state.ts          -- useUrlState hook
    module-loader.ts      -- async module loading
    mark.ts               -- async callback validity tracking
    hmr.ts                -- HMR hot-swap logic
    hmr-inject.ts         -- HMR code generation for bundlers
    runtime.ts            -- template runtime helpers
    devtool.ts            -- Frame Devtool Bridge
    client.d.ts           -- ambient type declarations
    vite.ts               -- Vite plugin
    webpack.ts            -- Webpack loader
    rspack.ts             -- Rspack loader
    compiler.ts           -- compiler barrel export
    compiler/
      template-syntax.ts        -- {{}} to <% %> conversion, @event processing
      compile-template.ts       -- main compilation pipeline
      compile-to-vdom-function.ts -- VDOM compilation via htmlparser2
      extract-global-vars.ts    -- AST-based variable extraction
  tests/                  -- vitest test suite
  dist/                   -- built output
```

### Key Design Decisions

1. Functional over OOP: All APIs use factory functions and closures. No class, this, or prototype anywhere in the framework.

2. Real-DOM diff as default: String mode parses HTML into a temporary DOM tree and performs keyed comparison. This avoids the overhead of maintaining a virtual DOM for most use cases.

3. VDOM as opt-in: When enabled via `vdom: true`, templates compile to `vdomCreate` calls and the engine uses a three-phase diff with LIS reconciliation.

4. Compile-time templates: Templates are compiled at build time into JavaScript functions. The compiler uses `@babel/parser` for AST-based variable extraction, providing zero-config template variable detection.

5. Two-phase routing: The Router fires a `change` event before navigation (allowing rejection) and a `changed` event after (triggering view updates). Navigation guards run asynchronously between the two phases.

6. Reference-counted events: The EventDelegator uses reference counting per event type on `document.body`, ensuring a single capture-phase listener per event type regardless of how many views register handlers.

7. LFU cache with frequency eviction: The bounded cache uses single-pass partial selection (O(n\*k)) instead of full sorting, making eviction efficient for the typical buffer size of 5.

8. Async callback validity: The `mark`/`unmark` system and `wrapAsync` prevent stale callbacks from executing after a view is re-rendered or destroyed.

9. Cooperative time-slicing: The task scheduler in `utils.ts` processes tasks in 9ms batches, yielding to the browser via `scheduler.yield()` (Chrome 115+) or `setTimeout(0)` fallback.
