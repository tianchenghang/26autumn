# Hot Module Replacement {#hmr}

## Overview {#overview}

Hot Module Replacement (HMR) in swifty-mvc swaps view code in the browser without a full page reload. When a template file or a view setup file changes on disk, the bundler pushes the updated module to the client and swifty-mvc patches the running application in place. View-local state such as counter values, form input, and scroll-derived data survives the update.

HMR operates on two independent layers:

1. The template layer handles `.html` file changes. When a compiled template module updates, every mounted view that references the old template function is found, the reference is replaced, and the view is force-rendered. The `ViewCtx`, its `updater.data`, and all registered resources remain untouched.

2. The view setup layer handles `.ts` (or `.js`) file changes. When a view module updates, the view setup registry is patched and every mounted frame running the old setup function is hot-swapped in place. The existing `ViewCtx` instance is reused; only the setup function, template, events, and assign function are replaced.

Both layers are orchestrated by bundler plugins that inject HMR boilerplate at compile time. Application code never calls `import.meta.hot` or `module.hot` directly.

## Template Layer: hotSwapByTemplate(old, new) {#hotSwapByTemplate}

`hotSwapByTemplate` is the entry point for template-only HMR. It receives the old template function reference and the new one, then walks every mounted frame looking for views whose template matches the old reference.

```ts
import { hotSwapByTemplate } from "swifty-mvc";

hotSwapByTemplate(oldTemplate, newTemplate);
```

For each matching view, the following steps are performed:

1. `view.setTemplate(newTemplate)` replaces the template function.
2. `signature.value` is incremented, which invalidates any pending `wrapAsync` wrappers captured under the previous signature.
3. `fire("render")` emits the render event so subscribers can react.
4. `destroyAllResources(view, false)` destroys transient resources (those captured with `destroyOnRender = true`).
5. `view.updater.forceDigest()` re-renders the view regardless of whether data changed.

Event handlers are not re-delegated. They live in the `events` map returned by the setup function, not in the template itself. Only the template function reference is swapped.

If `oldTemplate` and `newTemplate` are the same reference, or if either is falsy, the function returns immediately without iterating frames.

This function is called by the auto-injected HMR snippet in compiled template modules. Application code rarely calls it directly.

## View Setup Layer: hotSwapByView(old, new) {#hotSwapByView}

`hotSwapByView` handles updates to view setup functions (the function returned by `defineView`). It performs two passes:

1. Walk the view setup registry and replace every entry equal to `oldSetup` with `newSetup`.
2. Walk all mounted frames and call `hotSwapView` on any frame whose registry entry now points to `newSetup`.

```ts
import { hotSwapByView } from "swifty-mvc";

hotSwapByView(oldSetup, newSetup);
```

Like `hotSwapByTemplate`, this function short-circuits when `oldSetup === newSetup` or when either argument is falsy.

The registry update in step one ensures that any future mounts of the same view path will use the new setup. The frame walk in step two ensures that already-mounted instances are patched in place.

## State Preservation: hotSwapView {#state-preservation}

`hotSwapView` is the core state-preserving primitive. It hot-swaps a single frame's view setup without destroying the `ViewCtx`. The entire context object, including `updater.data`, `resources`, `emitter`, `signature`, `id`, and `owner`, is preserved across the swap.

The sequence of operations is:

1. Run old `useEffect` cleanups in reverse registration order. Each cleanup function returned from a `useEffect` call is invoked.
2. Unregister old DOM event listeners via `unregisterEvents(oldView)`.
3. Destroy transient resources via `destroyAllResources(oldView, false)`.
4. Set `currentCtx` to the old view so hooks inside the new setup can find the context.
5. Run `newSetup(oldView, undefined)` against the preserved context. The setup returns a new descriptor with `{ template, events, assign }`.
6. Clear `currentCtx`.
7. Apply the new descriptor: `setTemplate`, `setEvents`, `setAssign`.
8. Register new DOM event listeners via `registerEvents(oldView)`.
9. Increment `signature`, fire `"render"`, destroy transient resources again, and call `updater.forceDigest()` to re-render.

```ts
import { hotSwapView } from "swifty-mvc";

hotSwapView(frame, newSetup);
```

Because the setup function re-runs against the preserved `ViewCtx`, any data previously set via `ctx.updater.set()` survives the swap. The new setup may call `ctx.updater.set()` to add or overwrite keys, but keys that are not touched retain their previous values.

If the frame has no existing view (the view was not yet mounted), `hotSwapView` falls back to `frame.mountView(viewPath)`, performing a full mount instead of a swap.

### Batch Swap with hotSwapFrames {#hotSwapFrames}

`hotSwapFrames` is a convenience wrapper that finds all mounted frames matching a given view path and applies `hotSwapView` to each one.

```ts
import { hotSwapFrames } from "swifty-mvc";

hotSwapFrames("app/views/counter", newSetup);
```

This is what `acceptView` and `hotSwapByView` use internally to update all instances of a view.

### Legacy Full Remount with reloadViews {#reloadViews}

`reloadViews` is the legacy HMR strategy. It unmounts and re-mounts every frame matching the given view path. The `ViewCtx` is destroyed and a fresh one is created, so all view-local state is lost.

```ts
import { reloadViews } from "swifty-mvc";

reloadViews("app/views/counter");
```

Query parameters in the view path are stripped for matching purposes but preserved when re-mounting, so a frame mounted at `"app/views/counter?id=42"` is correctly re-mounted with its parameters intact.

`reloadViews` is retained for backward compatibility. New code should prefer `hotSwapFrames`, which preserves state.

## Auto-Injection by Bundler Plugins {#auto-injection}

Swifty-next provides bundler plugins for Vite, Webpack, and Rspack that inject HMR boilerplate at compile time. Application developers never write `import.meta.hot` or `module.hot` calls themselves.

### Two Injection Targets {#injection-targets}

The plugins inject HMR code into two kinds of modules:

1. Template modules compiled from `.html` files. The compiled module exports a template function. The injected snippet registers a `hot.dispose` callback that saves the current template reference into `hot.data`, and a `hot.accept` callback that retrieves the old reference, obtains the new one, and calls `hotSwapByTemplate(old, new)`.

2. View class modules (`.ts` files that import `.html` templates). The plugin rewrites `export default defineView(...)` into a named const declaration (`const __swiftyViewDefault = defineView(...); export default __swiftyViewDefault;`) so the HMR callback can capture the old reference by name. The injected snippet then calls `hotSwapByView(old, new)` when the module updates.

Files that do not import a `.html` template are left untouched by the view class transform.

### Cross-Bundler Differences {#cross-bundler-differences}

The three supported bundlers expose different HMR APIs:

| Bundler | HMR context       | Accept callback receives new module |
| ------- | ----------------- | ----------------------------------- |
| Vite    | `import.meta.hot` | Yes, as `newModule.default`         |
| Webpack | `module.hot`      | No, module has already re-executed  |
| Rspack  | `module.hot`      | No, module has already re-executed  |

In Vite, the accept callback runs in the old module's scope, so local variables still hold old values. The new module is passed as an argument. In Webpack and Rspack, the module has already re-executed by the time the accept callback runs, so local variables already hold new values and the callback receives no argument.

The `hotSwapByTemplate` and `hotSwapByView` functions are loaded via a dynamic `import("swifty-mvc")` inside the accept callback. This avoids pulling the entire framework into the template module's dependency graph at build time. In production builds, the HMR `if` block is dead code (the HMR API is undefined) and is eliminated by tree-shaking.

### injectTemplateHmrSnippet {#injectTemplateHmrSnippet}

Appends the HMR accept/dispose snippet to a compiled template module source string. Called by the Vite `load` hook and the Webpack/Rspack loader after template compilation.

```ts
import { injectTemplateHmrSnippet } from "swifty-mvc";

const output = injectTemplateHmrSnippet(compiledSource, "vite");
```

The `bundler` parameter accepts `"vite"`, `"webpack"`, or `"rspack"` and selects the appropriate HMR API.

### injectViewHmr {#injectViewHmr}

Transforms a `.ts` view file source to add view class HMR. The function checks whether the source imports a `.html` template. If not, it returns the source unchanged. Otherwise it rewrites the `export default` declaration into a named const, then appends the HMR snippet.

```ts
import { injectViewHmr } from "swifty-mvc";

const output = injectViewHmr(tsSource, "vite");
```

If the source has no `export default` declaration, or if parsing fails, the source is returned unchanged. This graceful degradation means the file will simply not have HMR support rather than causing a build error.

### importsHtmlTemplate {#importsHtmlTemplate}

A utility function that checks whether a `.ts` source contains an import of a `.html` file. Used by the plugin's `transform` hook to decide whether to inject view class HMR.

```ts
import { importsHtmlTemplate } from "swifty-mvc";

importsHtmlTemplate('import template from "./home.html";'); // true
importsHtmlTemplate('import View from "../view";'); // false
```

## HMR API Reference {#api-reference}

The following functions are exported from `"swifty-mvc"` for use in HMR scenarios. Most application code does not call these directly; the bundler plugins generate the necessary calls automatically.

### reloadViews {#api-reloadViews}

```ts
function reloadViews(viewPath: string): void;
```

Legacy full-remount HMR. Unmounts and re-mounts every frame matching the given view path. The `ViewCtx` and all view-local state are destroyed before a fresh view is created. Prefer `hotSwapFrames` for state-preserving HMR.

### hotSwapView {#api-hotSwapView}

```ts
function hotSwapView(frame: FrameObj, newSetup: ViewSetup): void;
```

Hot-swap a single frame's view setup in place, preserving the `ViewCtx`. Runs old `useEffect` cleanups, unregisters old events, destroys transient resources, re-runs the new setup against the same context, applies the new template/events/assign, registers new events, and force-renders. Falls back to `frame.mountView(viewPath)` if the frame has no existing view.

### hotSwapFrames {#api-hotSwapFrames}

```ts
function hotSwapFrames(viewPath: string, newSetup: ViewSetup): void;
```

Batch hot-swap every frame matching `viewPath` with `newSetup`. Convenience wrapper around `hotSwapView`.

### hotSwapByTemplate {#api-hotSwapByTemplate}

```ts
function hotSwapByTemplate(
  oldTemplate: ViewTemplate,
  newTemplate: ViewTemplate,
): void;
```

Template-only HMR. Finds every mounted view whose template function matches `oldTemplate`, replaces it with `newTemplate`, and force-renders. Short-circuits when the two references are identical or either is falsy.

### hotSwapByView {#api-hotSwapByView}

```ts
function hotSwapByView(oldSetup: ViewSetup, newSetup: ViewSetup): void;
```

View setup HMR. Updates the view-registry entries matching `oldSetup` to point to `newSetup`, then hot-swaps every mounted frame using that setup. Short-circuits when the two references are identical or either is falsy.
