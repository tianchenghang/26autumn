---
title: Bundler Integration
description: Configuring Vite, Webpack, and Rspack plugins for Swifty Docs.
---

# Bundler Integration {#bundler-integration}

Swifty Docs provides bundler plugins for Vite, Webpack, and Rspack. Each plugin intercepts `.md` file imports and compiles them through the Markdown pipeline.

## Vite plugin {#vite-plugin}

### Setup {#vite-setup}

```ts
import { defineConfig } from "vite";
import { swiftyDocsPlugin } from "@swifty.js/docs/vite";
import docsConfig from "./swifty-docs.config";

export default defineConfig({
  plugins: [swiftyDocsPlugin({ config: docsConfig })],
});
```

### Options {#vite-options}

The Vite plugin accepts only the `config` option. File matching is controlled by the Vite resolver itself — there are no `test` or `exclude` options on the Vite plugin.

### How it works {#vite-how}

The `swiftyDocsPlugin` function returns an array of two Vite plugins (the docs plugin and an MVC template plugin). The docs plugin uses a two-step resolve mechanism:

1. Vite encounters `import content from './page.md'`
2. The plugin's `resolveId` hook resolves the import and appends a `?swifty-docs` query suffix to the resolved id
3. The plugin's `load` hook checks for the `?swifty-docs` query parameter — if present, it processes the file
4. The raw Markdown source is read from disk
5. `compileMarkdown()` processes the source
6. The compiled JavaScript module is returned to Vite
7. Vite handles bundling and HMR

### HMR {#vite-hmr}

When a `.md` file changes during development:

1. Vite detects the file change
2. The plugin re-compiles the Markdown
3. Vite's HMR system updates the module
4. The layout view re-renders with the new content

## Webpack plugin {#webpack-plugin}

### Setup {#webpack-setup}

```js
const { SwiftyDocsPlugin } = require("@swifty.js/docs/webpack");
const docsConfig = require("./swifty-docs.config");

module.exports = {
  plugins: [new SwiftyDocsPlugin({ config: docsConfig })],
};
```

### Options {#webpack-options}

```ts
interface SwiftyDocsWebpackPluginOptions {
  test?: RegExp; // default: /\.md$/
  exclude?: RegExp; // default: /node_modules/
}
```

### How it works {#webpack-how}

The `SwiftyDocsPlugin` auto-registers the `swiftyDocsLoader`:

1. In `apply()`, the plugin synchronously pushes a rule to `compiler.options.module.rules`
2. The rule matches `.md` files and uses `swiftyDocsLoader`
3. The loader is an async Webpack loader that receives raw Markdown
4. It runs `compileMarkdown()` and calls `this.callback(null, jsSource)`
5. Webpack bundles the compiled module

## Rspack plugin {#rspack-plugin}

### Setup {#rspack-setup}

```js
const { SwiftyDocsPlugin } = require("@swifty.js/docs/rspack");
const docsConfig = require("./swifty-docs.config");

module.exports = {
  plugins: [new SwiftyDocsPlugin({ config: docsConfig })],
};
```

### Options {#rspack-options}

Same as Webpack:

```ts
interface SwiftyDocsWebpackPluginOptions {
  test?: RegExp; // default: /\.md$/
  exclude?: RegExp; // default: /node_modules/
}
```

### Differences from Webpack {#rspack-differences}

The Rspack loader returns a `Promise` directly (Rspack supports async loaders natively), while the Webpack loader uses `this.callback()`. The compilation logic is identical.

## Compiler API {#compiler-api}

For custom build pipelines, you can use the compiler directly:

```ts
import { compileMarkdown } from "@swifty.js/docs/compiler";

const result = await compileMarkdown(markdownSource, {
  config: docsConfig,
  filePath: "/path/to/page.md",
});
// result is a JavaScript module source string
```

### CompileMarkdownOptions {#compile-options}

```ts
interface CompileMarkdownOptions {
  config: DocsConfig;
  filePath: string;
  debug?: boolean;
  projectRoot?: string;
}
```

## Next steps {#next-steps}

- [Configuration Reference](/docs/en/swifty-docs/reference/site-config) — all configuration options
- [Markdown Extensions](/docs/en/swifty-docs/guide/markdown) — syntax highlighting and containers
- [API Reference](/docs/en/swifty-docs/api/overview) — compiler and plugin APIs
