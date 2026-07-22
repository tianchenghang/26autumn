---
title: Bundler Integration
description: Configure Vite, Webpack, and Rspack plugins for Swifty MVC template compilation.
---

# Bundler Integration {#bundler-integration}

Swifty MVC compiles `.html` templates at build time using bundler-specific plugins. Each plugin intercepts `.html` imports and runs them through the compiler pipeline, producing optimized JavaScript modules.

## Vite plugin {#vite-plugin}

### Basic setup {#vite-basic}

```ts
import { defineConfig } from "vite";
import { swiftyMvcPlugin } from "@swifty.js/mvc/vite";

export default defineConfig({
  plugins: [swiftyMvcPlugin()],
});
```

### Options {#vite-options}

```ts
interface SwiftyMvcVitePluginOptions {
  debug?: boolean; // Enable line tracking in compiled output (default: false)
  vdom?: boolean; // Generate VDOM-mode functions (default: false)
}
```

#### debug {#vite-debug}

When `true`, the compiler embeds source line numbers into the generated JavaScript. This helps trace runtime errors back to the original template source:

```ts
swiftyMvcPlugin({ debug: true });
```

#### vdom {#vite-vdom}

When `true`, templates compile to VDOM-mode functions that return `VDomNode` trees instead of HTML strings:

```ts
swiftyMvcPlugin({ vdom: true });
```

### Vite 7 support {#vite-7}

For Vite 7 specifically, use the dedicated entry:

```ts
import { swiftyMvcPlugin7 } from "@swifty.js/mvc/vite";
// or
import { swiftyMvcPluginLegacy7 } from "@swifty.js/mvc/vite";
```

The `swiftyMvcPluginLegacy` export is also available for projects using the legacy Vite plugin API:

```ts
import { swiftyMvcPluginLegacy } from "@swifty.js/mvc/vite";
```

The explicit entries (`swiftyMvcPlugin7`, `swiftyMvcPluginLegacy`, `swiftyMvcPluginLegacy7`) are available for edge cases and to avoid version-detection ambiguity.

### Vite 8 support {#vite-8}

Vite 8 uses Rolldown (a Rust-based bundler) as its internal engine. The `swiftyMvcPlugin` is compatible with Vite 8 because it relies on standard Vite plugin hooks (`load`, `transform`) that Rolldown supports. No changes to your plugin configuration are required when upgrading to Vite 8.

### How the Vite plugin works {#vite-internals}

The plugin uses Vite's `load` hook to intercept `.html` file imports and a `transform` hook to inject view-class HMR into `.ts` files that import `.html`:

1. When Vite encounters `import template from './view.html'`, the plugin's `load` hook fires
2. The raw HTML source is read from disk
3. The compiler pipeline processes the source (syntax conversion, event encoding, variable extraction)
4. The output JavaScript module is returned to Vite
5. For `.ts` files that import `.html` templates, the `transform` hook injects HMR code that enables view-class hot swapping
6. Vite handles the rest (transform, bundle, HMR)

HMR is handled automatically: when a `.html` file changes, Vite's HMR system triggers a re-import, and the `swiftyMvcPlugin` re-compiles the template. When a `.ts` view file changes, the `transform` hook's injected HMR code calls `hotSwapByView` to update all mounted instances.

## Webpack plugin {#webpack-plugin}

### Setup {#webpack-setup}

```js
const { SwiftyMvcPlugin } = require("@swifty.js/mvc/webpack");

module.exports = {
  module: {
    // Do NOT add .html to module.rules — the plugin handles it
  },
  plugins: [
    new SwiftyMvcPlugin({
      test: /\.html$/,
      exclude: /node_modules/,
    }),
  ],
};
```

### Options {#webpack-options}

```ts
interface SwiftyMvcWebpackPluginOptions {
  test?: RegExp; // File pattern to match (default: /\.html$/)
  exclude?: RegExp; // Files to skip (default: /node_modules/)
  debug?: boolean; // Enable line tracking in compiled output (default: false)
  vdom?: boolean; // Generate VDOM-mode functions (default: false)
}
```

### How the Webpack plugin works {#webpack-internals}

The `SwiftyMvcPlugin` is a Webpack 5 plugin that auto-registers the `swiftyMvcLoader`:

1. The plugin directly pushes a rule to `compiler.options.module.rules` that matches `.html` files and uses `swiftyMvcLoader`
2. The loader is an async function that receives the raw HTML source and returns a `Promise`
3. It runs the compiler pipeline and returns the compiled JavaScript as a resolved `Promise`
4. The loader options (`debug`, `vdom`) are passed via the plugin configuration

The loader uses `this.getOptions()` to read configuration and returns a `Promise<string>` for async completion.

## Rspack plugin {#rspack-plugin}

### Setup {#rspack-setup}

```js
const { SwiftyMvcPlugin } = require("@swifty.js/mvc/rspack");

module.exports = {
  plugins: [
    new SwiftyMvcPlugin({
      test: /\.html$/,
      exclude: /node_modules/,
    }),
  ],
};
```

### Options {#rspack-options}

Same as Webpack:

```ts
interface SwiftyMvcWebpackPluginOptions {
  test?: RegExp; // default: /\.html$/
  exclude?: RegExp; // default: /node_modules/
  debug?: boolean; // Enable line tracking in compiled output (default: false)
  vdom?: boolean; // Generate VDOM-mode functions (default: false)
}
```

### Differences from Webpack {#rspack-differences}

The Rspack loader and Webpack loader both return a `Promise` — both bundlers support async loaders natively via Promise return values. The compilation logic is identical.

## Compiler API {#compiler-api}

For custom build pipelines, you can use the compiler directly:

```ts
import { compileTemplate } from "@swifty.js/mvc/compiler";

const result = await compileTemplate(htmlSource, {
  debug: false,
  vdom: false,
  file: "path/to/template.html",
});
// result is a JavaScript module source string
```

### compileTemplate options {#compile-options}

| Option       | Type       | Default | Description                                                                                            |
| ------------ | ---------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `debug`      | `boolean`  | `false` | Embed line tracking                                                                                    |
| `vdom`       | `boolean`  | `false` | Generate VDOM-mode output                                                                              |
| `file`       | `string`   | —       | Source file path (for error messages)                                                                  |
| `globalVars` | `string[]` | —       | Global variable names to destructure from `$data`. When omitted, auto-extracts via `extractGlobalVars` |

### extractGlobalVars {#extract-global-vars}

For advanced use cases, the AST-based variable extraction is available separately:

```ts
import { extractGlobalVars } from "@swifty.js/mvc/compiler";

const vars = await extractGlobalVars(jsSource);
// Returns an array of variable names referenced in the template
```

## HMR integration {#hmr-integration}

### Vite HMR {#vite-hmr}

The Vite plugin supports HMR out of the box. When a `.html` template changes:

1. Vite detects the file change and triggers HMR
2. The plugin re-compiles the template
3. The HMR injection appends `import.meta.hot.accept()` to the compiled module
4. Swifty MVC's `hotSwapByTemplate` replaces the template function in all mounted views
5. Views re-render with the new template — state is preserved

### Webpack/Rspack HMR {#webpack-hmr}

For Webpack and Rspack, the loader injects HMR acceptance code:

```ts
// Injected at the end of compiled template modules:
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

View modules (`.ts` files that export `defineView`) also receive HMR injection via `injectViewHmr`, which rewrites `export default` to use a named constant and appends accept/dispose handlers.

## TypeScript support {#typescript-support}

Add the client type declarations to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@swifty.js/mvc/client"]
  }
}
```

This provides:

```ts
// *.html modules export a template function
declare module "*.html" {
  const template: (data: Record<string, unknown>) => string;
  export default template;
}

// v-swifty attribute support
declare namespace JSX {
  interface IntrinsicAttributes {
    "v-swifty"?: string;
  }
}
```

## Next steps {#next-steps}

- [HMR](/docs/en/swifty-mvc/guide/advanced/hmr) — hot module replacement in depth
- [Rendering Engine](/docs/en/swifty-mvc/guide/advanced/rendering-engine) — string mode and VDOM mode internals
- [Micro-Frontends](/docs/en/swifty-mvc/guide/advanced/micro-frontends) — cross-build template loading
