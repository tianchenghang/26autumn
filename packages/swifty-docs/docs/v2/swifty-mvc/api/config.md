# Configuration Reference {#configuration-reference}

This page documents every configuration option exposed by swifty-mvc. Configuration is split into three surfaces: the runtime FrameworkConfig passed to `Framework.boot()`, the compile-time CompileOptions consumed by the template compiler, and the Bundler Plugin Options accepted by the Vite, Webpack, and Rspack integrations.

## FrameworkConfig {#framework-config}

The `FrameworkConfig` interface defines all runtime options for a swifty-mvc application. It is passed as the single argument to `Framework.boot()` and is readable at any point via `Framework.getConfig()`. Properties may be mutated after boot with `Framework.setConfig(patch)`.

### rootId {#framework-config-rootid}

- Type: `string`
- Required: yes (no default value)

The DOM element ID where the root view mounts. This property is required in the `FrameworkConfig` type definition and the element must exist in the HTML document before `Framework.boot()` is called. The framework creates the root frame inside this container and renders the default view into it.

```ts
Framework.boot({
  rootId: "app",
});
```

```html
<!-- index.html -->
<div id="app"></div>
```

### routeMode {#framework-config-routemode}

- Type: `"history" | "hash"`
- Default: `"history"`

Selects the routing strategy. In `"history"` mode, the router uses `history.pushState` and the `popstate` event, producing clean URLs like `/home`. In `"hash"` mode, the router uses the URL hash fragment with a configurable prefix (see hashbang), producing URLs like `#!/home`.

History mode requires server-side configuration to serve the entry HTML for all application routes. Hash mode works without any server configuration.

```ts
Framework.boot({
  routeMode: "hash",
});
```

### defaultView {#framework-config-defaultview}

- Type: `string`
- Default: `undefined`

The view path rendered when the current URL does not match any entry in the routes map and no view is currently mounted. Typically points to a home or landing page view.

```ts
Framework.boot({
  defaultView: "app/views/home",
});
```

### defaultPath {#framework-config-defaultpath}

- Type: `string`
- Default: `"/"`

The URL path used when the hash portion of the URL is empty. Only relevant in hash routing mode. When the user navigates to a URL with no hash, the router substitutes this path before resolving the view.

```ts
Framework.boot({
  defaultPath: "/home",
});
```

### routes {#framework-config-routes}

- Type: `Record<string, string | RouteViewConfig>`
- Default: `{}`

A mapping from URL paths to view paths. Values may be either a plain string (the view path) or a configuration object with a required `view` property and optional extra properties that are merged into the parsed Location object.

```ts
interface RouteViewConfig {
  view: string;
  [k: string]: unknown;
}
```

```ts
Framework.boot({
  routes: {
    "/home": "app/views/home",
    "/list": "app/views/list",
    "/detail": { view: "app/views/detail", title: "Detail Page" },
  },
});
```

Use the rewrite option for path transformation logic that runs before route matching.

### hashbang {#framework-config-hashbang}

- Type: `string`
- Default: `"#!"`

The prefix inserted before the hash path in hash routing mode. Only consulted when routeMode is set to `"hash"`. Changing this value is rarely necessary; the default matches the Google AJAX crawling convention.

```ts
Framework.boot({
  routeMode: "hash",
  hashbang: "#!/",
});
```

### error {#framework-config-error}

- Type: `(error: Error) => void`
- Default: `undefined`

A global error handler invoked when the framework catches exceptions during view rendering, route transitions, or other internal operations. The handler receives the original Error object. Do not re-throw errors from within this callback, as doing so may interrupt the framework's internal scheduling loop.

```ts
Framework.boot({
  error(err) {
    console.error("[swifty]", err);
    reportToSentry(err);
  },
});
```

### extensions {#framework-config-extensions}

- Type: `string[]`
- Default: `[]`

An array of view paths loaded and initialized before the application boots. Extension views execute in order and are useful for registering global services, plugins, analytics scripts, or middleware that must be available before the root view mounts.

```ts
Framework.boot({
  extensions: ["app/extensions/analytics", "app/extensions/error-reporter"],
});
```

### initModule {#framework-config-initmodule}

- Type: `string`
- Default: `undefined`

A module path loaded and executed after extensions but before the root view mounts. The module's default export should be a function that receives the Framework object. Use this for one-time initialization logic such as prefetching data or configuring third-party libraries.

```ts
Framework.boot({
  initModule: "app/init",
});
```

```ts
// app/init.ts
import { Framework } from "swifty-mvc";

export default function init() {
  // Prefetch user profile
  fetch("/api/user")
    .then((r) => r.json())
    .then((user) => {
      Framework.State.set({ user });
    });
}
```

### rewrite {#framework-config-rewrite}

- Type: `(path: string, params: Record<string, string>, routes: Record<string, string>) => string`
- Default: `undefined`

A function that transforms URL paths before route matching. Receives the original path, the parsed parameters, and the routes map. Returns the path that should be used for view resolution. Useful for implementing URL aliases, redirects, path normalization, or A/B testing routing logic.

```ts
Framework.boot({
  rewrite(path, params, routes) {
    if (path === "/old-page") return "/new-page";
    if (params.lang === "zh") return "/i18n" + path;
    return path;
  },
});
```

### unmatchedView {#framework-config-unmatchedview}

- Type: `string`
- Default: `undefined`

The view path rendered when no entry in the routes map matches the current URL. Typically points to a 404 or not-found view. When omitted, the framework falls back to defaultView.

```ts
Framework.boot({
  unmatchedView: "app/views/404",
});
```

### require {#framework-config-require}

- Type: `(names: string[], params?: Record<string, unknown>) => Promise<unknown[]> | undefined`
- Default: `undefined`

A custom module loader function called by `Framework.use()` when a view class is not found in the registry. Receives an array of module names and optional parameters. Returns a Promise resolving to an array of loaded module exports, or `undefined` to signal that the default dynamic import fallback should be used.

This option is the primary integration point for Webpack Module Federation, SystemJS, or any custom dynamic loading strategy in micro-frontend scenarios.

```ts
Framework.boot({
  require(names) {
    return Promise.all(
      names.map(
        (name) => import(/* webpackIgnore: true */ `remote-app/${name}`),
      ),
    );
  },
});
```

### skipViewRendered {#framework-config-skipviewrendered}

- Type: `boolean`
- Default: `false`

When set to `true`, disables the automatic re-render guard that prevents duplicate renders when state changes occur rapidly within the same microtask. Enable this for manual render control or when integrating with external scheduling systems that manage their own deduplication.

```ts
Framework.boot({
  skipViewRendered: true,
});
```

### projectName {#framework-config-projectname}

- Type: `string`
- Default: `undefined`

Identifies the current project in micro-frontend scenarios. Used by the Module Federation bridge to determine whether a view path belongs to the local project or should be resolved from a remote container. Each project in a micro-frontend topology should declare a unique projectName.

```ts
Framework.boot({
  projectName: "dashboard-app",
});
```

### vdom {#framework-config-vdom}

- Type: `boolean`
- Default: `false`

Enables virtual DOM mode instead of string-based DOM diffing. When enabled, compiled templates return `VDomNode` trees and the framework uses a VDOM diff engine with LIS (Longest Increasing Subsequence) reconciliation for DOM updates. VDOM mode provides better performance for complex UIs with frequent incremental updates but increases the runtime bundle size by approximately 8 KB (gzipped).

This option should also be enabled in the bundler plugin options so that compiled templates produce VDOM output. See the Bundler Plugin Options section below.

```ts
Framework.boot({
  vdom: true,
});
```

### devtool {#framework-config-devtool}

- Type: `boolean`
- Default: `true`

Controls whether the Frame Devtool Bridge is installed. When `true`, the framework attaches a `postMessage` listener that allows the Swifty DevTool browser extension to inspect the frame tree, view state, and render performance. Set to `false` to suppress the bridge in environments where the extension is not available or causes console errors.

```ts
Framework.boot({
  devtool: process.env.NODE_ENV === "development",
});
```

### Full Example {#framework-config-full-example}

```ts
import { Framework } from "swifty-mvc";

Framework.boot({
  rootId: "app",
  routeMode: "history",
  defaultView: "app/views/home",
  defaultPath: "/home",
  routes: {
    "/home": "app/views/home",
    "/list": "app/views/list",
    "/detail": { view: "app/views/detail", title: "Detail" },
  },
  rewrite(path, params) {
    if (path === "/legacy") return "/home";
    return path;
  },
  unmatchedView: "app/views/404",
  error(err) {
    console.error(err);
  },
  extensions: ["app/extensions/analytics"],
  initModule: "app/init",
  projectName: "my-app",
  vdom: false,
  devtool: true,
});
```

## CompileOptions {#compile-options}

The `CompileOptions` interface configures the `compileTemplate()` function, which transforms raw HTML template source into an ES module exporting a render function. This interface is consumed by the bundler plugins and is rarely used directly by application code.

Import path: `swifty-mvc/compiler`

```ts
import { compileTemplate } from "swifty-mvc/compiler";
```

### debug {#compile-options-debug}

- Type: `boolean`
- Default: `false`

Enables debug mode with line tracking. When enabled, the compiled output includes source position markers that map runtime errors back to the original template expression and line number. The markers appear as comments in the generated JavaScript, adding approximately 10-20% to the output size.

```ts
const output = await compileTemplate(source, {
  debug: true,
});
```

### globalVars {#compile-options-globalvars}

- Type: `string[]`
- Default: `[]` (auto-detected via AST analysis)

An explicit list of global variable names to destructure from the `$$` (refData) context object at the top of the compiled function. When omitted, the bundler plugins call `extractGlobalVars()` to detect globals automatically using AST scope analysis.

Pass this option only when the automatic extraction produces incorrect results for an unusual template pattern.

```ts
const output = await compileTemplate(source, {
  globalVars: ["config", "currentUser", "formatDate"],
});
```

### file {#compile-options-file}

- Type: `string`
- Default: `undefined`

The file path of the template being compiled. Used in debug error messages to identify which template file caused a compilation or runtime error. The bundler plugins set this automatically from the loader context.

```ts
const output = await compileTemplate(source, {
  file: "src/views/home.html",
});
```

### vdom {#compile-options-vdom}

- Type: `boolean`
- Default: `false`

Generates VDOM output instead of an HTML string. When enabled, the compiled module exports a function with the signature `(data, viewId, refData) => VDomNode` instead of `(data, viewId, refData) => string`. The VDomNode tree is consumed by the framework's VDOM diff engine.

This option must be consistent with the `vdom` setting in FrameworkConfig and the bundler plugin options.

```ts
const output = await compileTemplate(source, {
  vdom: true,
});
```

### Full Example {#compile-options-full-example}

```ts
import { compileTemplate } from "swifty-mvc/compiler";

const source = `<div>{{=title}}</div>`;

const moduleCode = await compileTemplate(source, {
  debug: process.env.NODE_ENV !== "production",
  file: "src/views/home.html",
  vdom: false,
});
```

## Bundler Plugin Options {#bundler-plugin-options}

Each bundler integration accepts a plugin options object that controls compilation behavior and HMR injection. The core options are shared across all three bundlers; the Webpack and Rspack plugins add file-matching options.

### Vite Plugin Options {#vite-plugin-options}

Import path: `swifty-mvc/vite`

```ts
interface SwiftyMvcVitePluginOptions {
  debug?: boolean;
  vdom?: boolean;
}
```

```ts
import { swiftyMvcPlugin } from "swifty-mvc/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    swiftyMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
      vdom: false,
    }),
  ],
});
```

#### debug {#vite-plugin-options-debug}

- Type: `boolean`
- Default: `false`

Enables debug mode with line tracking in the compiled template output. Runtime errors include the original template expression and source line number. Enable during development; disable in production builds to reduce output size.

```ts
swiftyMvcPlugin({
  debug: process.env.NODE_ENV !== "production",
});
```

#### vdom {#vite-plugin-options-vdom}

- Type: `boolean`
- Default: `false`

Enables virtual DOM output mode. Compiled templates return `VDomNode` structures instead of HTML strings. Must be consistent with `FrameworkConfig.vdom`.

```ts
swiftyMvcPlugin({
  vdom: true,
});
```

### Webpack Plugin Options {#webpack-plugin-options}

Import path: `swifty-mvc/webpack`

```ts
interface SwiftyMvcWebpackPluginOptions extends SwiftyMvcVitePluginOptions {
  test?: RegExp;
  exclude?: RegExp;
}
```

The Webpack plugin auto-registers the swifty-mvc loader. It extends the Vite options with two additional properties for controlling which files are processed.

```ts
import { SwiftyMvcPlugin } from "swifty-mvc/webpack";

export default {
  plugins: [
    new SwiftyMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
      vdom: false,
      test: /\.html$/,
      exclude: /node_modules/,
    }),
  ],
};
```

#### debug {#webpack-plugin-options-debug}

- Type: `boolean`
- Default: `false`

Same as the Vite plugin debug option. Enables debug mode with line tracking.

#### vdom {#webpack-plugin-options-vdom}

- Type: `boolean`
- Default: `false`

Same as the Vite plugin vdom option. Enables virtual DOM output mode.

#### test {#webpack-plugin-options-test}

- Type: `RegExp`
- Default: `/\.html$/`

A regular expression that determines which files are processed by the swifty-mvc loader. Only files whose paths match this pattern are compiled.

```ts
new SwiftyMvcPlugin({
  test: /\.(html|tpl)$/,
});
```

#### exclude {#webpack-plugin-options-exclude}

- Type: `RegExp`
- Default: `/node_modules/`

A regular expression for paths that should be skipped by the loader. Files matching this pattern are not compiled, even if they match the `test` pattern.

```ts
new SwiftyMvcPlugin({
  exclude: /node_modules|dist/,
});
```

### Rspack Plugin Options {#rspack-plugin-options}

Import path: `swifty-mvc/rspack`

The Rspack plugin uses the same `SwiftyMvcWebpackPluginOptions` interface as the Webpack plugin. All options behave identically.

```ts
import { SwiftyMvcPlugin } from "swifty-mvc/rspack";

export default {
  plugins: [
    new SwiftyMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
      vdom: false,
      test: /\.html$/,
      exclude: /node_modules/,
    }),
  ],
};
```

#### debug {#rspack-plugin-options-debug}

- Type: `boolean`
- Default: `false`

Same as the Webpack plugin debug option. Enables debug mode with line tracking.

#### vdom {#rspack-plugin-options-vdom}

- Type: `boolean`
- Default: `false`

Same as the Webpack plugin vdom option. Enables virtual DOM output mode.

#### test {#rspack-plugin-options-test}

- Type: `RegExp`
- Default: `/\.html$/`

Same as the Webpack plugin test option. Controls which files are processed.

#### exclude {#rspack-plugin-options-exclude}

- Type: `RegExp`
- Default: `/node_modules/`

Same as the Webpack plugin exclude option. Controls which paths are skipped.

### Rspack Loader (Manual Configuration) {#rspack-loader-manual}

If you prefer manual loader configuration over the plugin, add a rule to your Rspack config:

```ts
export default {
  module: {
    rules: [
      {
        test: /\.html$/,
        loader: "swifty-mvc/rspack",
        options: {
          debug: false,
          vdom: false,
        },
      },
    ],
  },
};
```

The loader accepts the same `debug` and `vdom` options as the plugin. The `test` and `exclude` options are not applicable in loader mode because the rule itself controls file matching.

## Configuration Consistency {#configuration-consistency}

Several options must be kept consistent across the runtime and build-time configuration surfaces:

| Option | Runtime (FrameworkConfig) | Build-time (Plugin Options) |
| ------ | ------------------------- | --------------------------- |
| vdom   | `vdom: true`              | `vdom: true`                |
| debug  | N/A                       | `debug: true`               |

The `vdom` flag must match between `FrameworkConfig.vdom` and the bundler plugin's `vdom` option. A mismatch causes the framework to receive either a VDomNode tree when it expects a string, or a string when it expects a VDomNode tree, resulting in a runtime error.

The `debug` flag is build-time only. There is no corresponding runtime option because debug markers are embedded in the compiled output at build time.
