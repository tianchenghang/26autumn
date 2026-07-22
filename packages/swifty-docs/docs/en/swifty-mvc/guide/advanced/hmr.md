---
title: Hot Module Replacement
description: State-preserving hot swap for views and templates during development.
---

# Hot Module Replacement {#hmr}

Swifty MVC supports hot module replacement (HMR) for both templates and view setup functions. When a file changes during development, the framework hot-swaps the updated code into running views without losing state or requiring a full page reload.

## How HMR works {#how-hmr-works}

Swifty MVC provides several HMR strategies depending on what changed:

### Template-only HMR {#template-hmr}

When a `.html` template file changes:

1. The bundler re-compiles the template
2. The HMR accept handler fires
3. `hotSwapByTemplate(oldTemplate, newTemplate)` is called
4. All frames whose current view uses the old template are found
5. Each view's template function is replaced with the new one
6. `forceDigest()` is called to trigger an immediate re-render
7. View state (updater data, store subscriptions) is preserved

### View setup HMR {#view-setup-hmr}

When a `.ts` view file changes:

1. The bundler re-evaluates the view module
2. The HMR accept handler fires with the new setup function
3. `hotSwapByView(oldSetup, newSetup)` is called
4. The view registry is updated with the new setup
5. All frames mounted with this view path are found
6. Each frame's view is hot-swapped via `hotSwapView`
7. The new setup runs with the same `ViewCtx` — state is preserved where possible

### Full remount (legacy) {#full-remount}

`reloadViews(viewPath)` performs a complete unmount + remount cycle. State is lost. This is the fallback when the HMR system cannot determine a safe hot-swap path.

## HMR injection {#hmr-injection}

The bundler plugins inject HMR acceptance code into compiled modules.

### Template modules {#template-injection}

Compiled `.html` modules receive:

```ts
// Vite:
if (import.meta.hot) {
  let __swiftyOldTemplate = template;
  import.meta.hot.dispose((data) => {
    data.__swiftyOldTemplate = __swiftyOldTemplate;
  });
  import.meta.hot.accept((newModule) => {
    const __swiftyNewTemplate = newModule.default;
    if (__swiftyOldTemplate !== __swiftyNewTemplate) {
      hotSwapByTemplate(__swiftyOldTemplate, __swiftyNewTemplate);
    }
    __swiftyOldTemplate = __swiftyNewTemplate;
  });
}

// Webpack/Rspack:
if (typeof module !== "undefined" && module.hot) {
  let __swiftyOldTemplate = template;
  module.hot.dispose((data) => {
    data.__swiftyOldTemplate = __swiftyOldTemplate;
  });
  module.hot.accept((newModule) => {
    const __swiftyNewTemplate = newModule.default;
    if (__swiftyOldTemplate !== __swiftyNewTemplate) {
      import("@swifty.js/mvc").then(({ hotSwapByTemplate }) => {
        hotSwapByTemplate(__swiftyOldTemplate, __swiftyNewTemplate);
      });
    }
    __swiftyOldTemplate = __swiftyNewTemplate;
  });
}
```

### View modules {#view-injection}

View `.ts` modules are transformed by `injectViewHmr`:

1. `export default defineView(...)` is rewritten to `const __swiftyViewDefault = defineView(...); export default __swiftyViewDefault`
2. HMR accept/dispose handlers are appended that call `hotSwapByView`

```ts
// Injected snippet (Vite):
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    const __swiftyNewView = newModule.default;
    hotSwapByView(__swiftyOldView, __swiftyNewView);
    __swiftyOldView = __swiftyNewView;
  });
  import.meta.hot.dispose((data) => {
    data.__swiftyOldView = __swiftyOldView;
  });
}
```

## State preservation {#state-preservation}

During a hot swap, the framework attempts to preserve:

- Updater data (view-local state from `useState`)
- Store subscriptions (from `useStore`)
- Frame hierarchy (parent-child relationships)
- Router state (current URL and parameters)

What is NOT preserved:

- Effect closures (from `useEffect`) — these are re-created from the new setup
- Timer IDs (from `useInterval`/`useTimeout`) — old timers are cleared, new ones created
- Resource handles (from `useResource`) — old resources destroyed, new ones created

## Manual HMR API {#manual-api}

For custom HMR logic, the framework exposes the following HMR functions from `@swifty.js/mvc`:

- `acceptView(hot, viewPath)` — register a `hot.accept` callback that extracts the new setup from the updated module, registers it via the view registry, and calls `hotSwapFrames` to preserve state. Falls back to the existing registry entry if the new module is not a valid setup, or calls `hot.invalidate()` for a full page reload if neither is available.
- `disposeView(hot, viewPath)` — register a `hot.dispose` callback that evicts the view setup from the registry via `invalidateViewClass`, ensuring the old setup is removed before the new module executes.
- `reloadViews(viewPath)` — full unmount + remount (state lost)
- `hotSwapView(frame, newSetup)` — hot-swap a single frame's view setup in place, preserving the `ViewCtx`
- `hotSwapFrames(viewPath, newSetup)` — hot-swap all frames matching a view path
- `hotSwapByTemplate(oldTemplate, newTemplate)` — hot-swap by template function reference
- `hotSwapByView(oldSetup, newSetup)` — hot-swap by view setup, updating the registry and all mounted instances

```ts
import { hotSwapByView, hotSwapByTemplate, reloadViews } from "@swifty.js/mvc";

// In a view module (Vite example):
if (import.meta.hot) {
  let __swiftyOldView = __swiftyViewDefault;
  import.meta.hot.accept((newModule) => {
    const __swiftyNewView = newModule.default;
    hotSwapByView(__swiftyOldView, __swiftyNewView);
    __swiftyOldView = __swiftyNewView;
  });
  import.meta.hot.dispose((data) => {
    data.__swiftyOldView = __swiftyOldView;
  });
}
```

### acceptView {#accept-view}

```ts
import { acceptView } from "@swifty.js/mvc";

acceptView(hot: HotContext, viewPath: string): void
```

Registers a `hot.accept` callback for a view module. When the module updates:

1. Extracts the new setup function from `newModule.default` (Vite) or the re-executed module itself (Webpack/Rspack)
2. If the extracted value is a valid function, registers it via `registerViewClass(viewPath, candidate)` and calls `hotSwapFrames(viewPath, candidate)` to preserve state across all mounted instances
3. If the new module does not export a valid setup, falls back to the existing registry entry via `getViewClass(viewPath)` and hot-swaps with that
4. If neither source yields a valid setup, calls `hot.invalidate()` to trigger a full page reload

No-op when `hot` is `undefined` (production builds).

### disposeView {#dispose-view}

```ts
import { disposeView } from "@swifty.js/mvc";

disposeView(hot: HotContext, viewPath: string): void
```

Registers a `hot.dispose` callback that calls `invalidateViewClass(viewPath)` to remove the view setup from the registry. This ensures the stale setup is evicted before the new module executes, so the next `accept` phase loads fresh code.

Typically called alongside `acceptView` in the same module:

```ts
import { acceptView, disposeView } from "@swifty.js/mvc";

if (import.meta.hot) {
  acceptView(import.meta.hot, "app/views/home");
  disposeView(import.meta.hot, "app/views/home");
}
```

No-op when `hot` is `undefined` (production builds).

### hotSwapByTemplate {#hot-swap-by-template}

Replaces the template function in all mounted views that reference the old template:

1. Scans all frames for views whose template matches `oldTemplate`
2. Replaces each view's template with `newTemplate`
3. Calls `forceDigest()` to trigger an immediate re-render

### hotSwapByView {#hot-swap-by-view}

Updates the view registry and hot-swaps all mounted instances:

1. Replaces the old setup function with the new one in the view registry
2. Finds all frames mounted with the old setup
3. Runs the new setup with the same `ViewCtx` — state is preserved where possible

## DevTool bridge {#devtool-bridge}

The `@swifty.js/mvc/devtool` entry provides a Frame Devtool Bridge that communicates the Frame tree state to browser extensions via `postMessage`:

```ts
import { installFrameDevtoolBridge } from "@swifty.js/mvc/devtool";

if (process.env.NODE_ENV === "development") {
  installFrameDevtoolBridge();
}
```

The bridge serializes the Frame tree into a structured format:

```ts
interface SerializedFrameNode {
  id: string;
  viewPath?: string;
  children: SerializedFrameNode[];
  viewInfo?: SerializedViewInfo;
}
```

This enables browser devtools extensions to visualize the Frame tree, inspect view state, and debug component hierarchies.

The bridge is enabled by default in development (controlled by `FrameworkConfig.devtool`, default `true`).

### installFrameDevtoolBridge {#install-frame-devtool-bridge}

```ts
import { installFrameDevtoolBridge } from "@swifty.js/mvc/devtool";

installFrameDevtoolBridge(): void
```

Installs a `postMessage` listener on `window` that responds to devtool panel requests (`MSG_PING` and `MSG_REQUEST_TREE`) with serialized frame tree data. It also subscribes to `Frame.on("add")` and `Frame.on("remove")` events to push delta updates whenever the frame tree changes.

The function is idempotent — calling it multiple times has no additional effect. It is a no-op in non-browser environments (`typeof window === "undefined"`).

Called automatically by `Framework.boot()` when `FrameworkConfig.devtool` is not `false`. Call it manually only when you need the bridge outside the standard boot flow.

## Next steps {#next-steps}

- [Bundler Integration](/docs/en/swifty-mvc/guide/advanced/bundler-integration) — plugin configuration details
- [View Lifecycle](/docs/en/swifty-mvc/guide/advanced/view-lifecycle) — mount/unmount internals
- [Micro-Frontends](/docs/en/swifty-mvc/guide/advanced/micro-frontends) — HMR across module boundaries
