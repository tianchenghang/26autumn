---
title: Framework API
description: Complete API reference for the Framework singleton.
---

# Framework API {#framework-api}

The `Framework` singleton is the main entry point for Swifty MVC applications. It provides configuration, boot sequence, task scheduling, and utility functions.

## Methods {#methods}

### Framework.boot {#boot}

```ts
Framework.boot(cfg: FrameworkConfig): void
```

Initialize the framework with the given configuration. This is the main entry point for every Swifty MVC application.

**Sequence:**

1. Merge config with defaults
2. Set Router configuration (routes, mode, etc.)
3. Bind Router and State CHANGED events to the dispatcher
4. Mark framework as booted
5. Install Devtool Bridge (if enabled)
6. Create root Frame
7. Bind Router (popstate/hashchange listeners)
8. Mount defaultView if configured and not already mounted

**Example:**

```ts
Framework.boot({
  rootId: "app",
  routeMode: "history",
  routes: {
    "/": "home",
    "/about": "about",
  },
  defaultView: "home",
  unmatchedView: "not-found",
});
```

### Framework.getConfig {#get-config}

```ts
Framework.getConfig(): FrameworkConfig
Framework.getConfig<T>(key: string): T | undefined
```

Read the entire configuration object or a single key.

```ts
const config = Framework.getConfig();
const vdom = Framework.getConfig<boolean>("vdom");
```

### Framework.setConfig {#set-config}

```ts
Framework.setConfig<T>(patch: Partial<FrameworkConfig>): FrameworkConfig & T
```

Update configuration at runtime. Returns the merged configuration.

```ts
Framework.setConfig({ vdom: true });
```

### Framework.isBooted {#is-booted}

```ts
Framework.isBooted(): boolean
```

Returns `true` if `Framework.boot` has been called.

### Framework.task {#task}

```ts
Framework.task(fn: Function, args?: unknown[], context?: unknown): void
```

Queue a function for deferred, chunked execution. Heavy operations are split across microtasks to avoid blocking the main thread.

The scheduler uses `scheduler.postTask()` with `{ priority: 'background' }` when available (Priority Scheduler API), falling back to `requestIdleCallback`, then `setTimeout(0)`.

```ts
Framework.task((data) => processLargeDataset(data), [dataset], null);
```

### Framework.delay {#delay}

```ts
Framework.delay(time: number): Promise<void>
```

Promise-based `setTimeout`.

```ts
await Framework.delay(1000);
// Waits 1 second
```

### Framework.use {#use}

```ts
Framework.use(names: string[], callback?: (...modules: unknown[]) => void): Promise<unknown[]>
```

Load modules asynchronously. Uses `FrameworkConfig.require` if configured, otherwise falls back to dynamic `import()`.

```ts
const [moduleA, moduleB] = await Framework.use(["module-a", "module-b"]);

// With callback:
Framework.use(["module-a"], (moduleA) => {
  // moduleA is loaded
});
```

### Framework.dispatchEvent {#dispatch-event}

```ts
Framework.dispatchEvent(target: EventTarget, eventType: string, eventInit?: EventInit): void
```

Fire a custom DOM event on the given target.

```ts
Framework.dispatchEvent(document, "app-ready", { detail: { version: "1.0" } });
```

### Framework.waitZoneViewsRendered {#wait-zone}

```ts
Framework.waitZoneViewsRendered(viewId: string, timeout?: number): Promise<number>
```

Poll until all child frames in a zone have rendered. Returns `1` (OK) or `0` (timeout or not found).

```ts
const result = await Framework.waitZoneViewsRendered("main-content", 5000);
if (result === Framework.WAIT_OK) {
  console.log("All children rendered");
}
```

### Framework.mark / Framework.unmark {#mark-unmark}

```ts
Framework.mark(host: object, key: string): () => boolean
Framework.unmark(host: object): void
```

Create and invalidate async callback validity checkers. Used internally by views for `wrapAsync`.

```ts
const isValid = Framework.mark(myObject, "request");
// Later:
if (isValid()) {
  // myObject has not been unmarked
}

Framework.unmark(myObject);
// isValid() now returns false
```

### Framework.toUri / Framework.parseUri {#uri-utils}

```ts
Framework.toUri(path: string, params?: Record<string, string>): string
Framework.parseUri(uri: string): { path: string, params: Record<string, string> }
```

Convert between paths with parameters and URI strings.

```ts
Framework.toUri("/users", { id: "42", tab: "settings" });
// -> '/users?id=42&tab=settings'

Framework.parseUri("/users?id=42");
// -> { path: '/users', params: { id: '42' } }
```

### Framework.generateId {#generate-id}

```ts
Framework.generateId(prefix?: string): string
```

Generate a unique ID with optional prefix.

```ts
Framework.generateId("view"); // -> 'view-123'
```

### Framework.createCache {#create-cache}

```ts
Framework.createCache<T>(options?: CacheOptions<T>): CacheApi<T>
```

Create an LFU bounded cache. See [Cache API](/docs/en/swifty-mvc/api-reference/cache).

### Framework.createEmitter {#create-emitter}

```ts
Framework.createEmitter<T>(): EmitterApi<T>
```

Create a multi-cast event emitter. See [Event API](/docs/en/swifty-mvc/api-reference/events).

### Framework.defineView {#define-view}

```ts
Framework.defineView(setup: ViewSetup): ViewSetup
```

Identity function that declares a view. See [Views](/docs/en/swifty-mvc/guide/essentials/views).

## Properties {#properties}

### Framework.Router {#router-property}

```ts
Framework.Router: typeof Router
```

Reference to the Router singleton.

### Framework.State {#state-property}

```ts
Framework.State: typeof State
```

Reference to the State singleton.

### Framework.Frame {#frame-property}

```ts
Framework.Frame: typeof Frame
```

Reference to the Frame singleton.

### Framework.WAIT_OK / Framework.WAIT_TIMEOUT_OR_NOT_FOUND {#wait-constants}

```ts
Framework.WAIT_OK: 1
Framework.WAIT_TIMEOUT_OR_NOT_FOUND: 0
```

Return values for `waitZoneViewsRendered`.

## Configuration {#configuration}

### FrameworkConfig {#framework-config}

```ts
interface FrameworkConfig {
  rootId?: string;
  routeMode?: "history" | "hash";
  defaultView?: string;
  defaultPath?: string;
  routes?: Record<string, string | RouteViewConfig>;
  hashbang?: string;
  error?: (error: Error) => void;
  extensions?: string[];
  initModule?: string;
  rewrite?: (
    path: string,
    params: Record<string, string>,
    routes: Record<string, string>,
  ) => string;
  unmatchedView?: string;
  require?: (
    names: string[],
    params?: unknown,
  ) => Promise<unknown[]> | undefined;
  skipViewRendered?: boolean;
  projectName?: string;
  vdom?: boolean;
  devtool?: boolean;
}
```

| Field              | Type                                        | Default          | Description                             |
| ------------------ | ------------------------------------------- | ---------------- | --------------------------------------- |
| `rootId`           | `string`                                    | `"root"`         | DOM element ID for the root Frame       |
| `routeMode`        | `"history" \| "hash"`                       | `"history"`      | URL routing strategy                    |
| `defaultView`      | `string`                                    | —                | View to mount when no route matches     |
| `defaultPath`      | `string`                                    | `"/"`            | Default path when URL is empty          |
| `routes`           | `Record<string, string \| RouteViewConfig>` | `{}`             | Path-to-view mapping                    |
| `hashbang`         | `string`                                    | `"#!"`           | Hash prefix for hash mode               |
| `error`            | `Function`                                  | `(e) => throw e` | Global error handler                    |
| `extensions`       | `string[]`                                  | `[]`             | View paths loaded at startup            |
| `initModule`       | `string`                                    | —                | Module to load at startup               |
| `rewrite`          | `Function`                                  | —                | Transform path before route lookup      |
| `unmatchedView`    | `string`                                    | —                | View for unmatched routes (404)         |
| `require`          | `Function`                                  | —                | Async module loader (Module Federation) |
| `skipViewRendered` | `boolean`                                   | `false`          | Skip view rendered check                |
| `projectName`      | `string`                                    | —                | Project name for micro-frontend bridge  |
| `vdom`             | `boolean`                                   | `false`          | Enable VDOM rendering mode              |
| `devtool`          | `boolean`                                   | `true`           | Enable Frame Devtool Bridge             |

### RouteViewConfig {#route-view-config}

```ts
interface RouteViewConfig {
  view: string;
  [key: string]: unknown;
}
```

Route values can be objects with a required `view` field and arbitrary additional properties that are merged into the Location object.

## Next steps {#next-steps}

- [Router API](/docs/en/swifty-mvc/api-reference/router) — navigation and URL parsing
- [State API](/docs/en/swifty-mvc/api-reference/state) — cross-view observable data
- [Frame API](/docs/en/swifty-mvc/api-reference/frame) — frame tree and lifecycle
