# Bundler Integration

swifty-docs provides seamless integration with Vite, Webpack, and Rspack to transform Markdown files into documentation pages at build time. This page explains how each bundler plugin works, the build configuration options, and the specialized theme compilation system.

## Overview {#overview}

The swifty-docs build system operates in two distinct phases:

1. **Configuration phase**: Scans the docs directory, extracts frontmatter metadata, generates sidebar trees, and creates a runtime module at `.swifty-docs/generated/`
2. **Compilation phase**: Intercepts `.md` imports during the build and transforms them into JavaScript modules that export page data and rendered HTML

Each bundler plugin implements this compilation phase using the native loader or plugin API, ensuring optimal performance and integration with the bundler's module graph.

## Vite Plugin {#vite-plugin}

The Vite integration provides a complete build solution through the `swiftyDocsPlugin` function, which returns an array of two plugins that work together to handle both Markdown compilation and template processing.

### Basic Usage {#vite-basic-usage}

```ts
import { defineConfig } from "vite";
import { swiftyDocsPlugin } from "swifty-docs/vite";
import docsConfig from "./swifty-docs.config";

export default defineConfig({
  plugins: [
    ...swiftyDocsPlugin({
      config: docsConfig,
      debug: false,
      vdom: false,
    }),
  ],
});
```

The spread operator is required because `swiftyDocsPlugin` returns an array containing two plugins: one for Markdown compilation and one for template processing.

### Plugin Architecture {#vite-plugin-architecture}

The `swiftyDocsPlugin` function creates two Vite plugins that work together:

1. **swifty-docs plugin**: Intercepts `.md` file imports and compiles them through the Markdown pipeline
2. **swifty-template plugin**: Compiles `.html` template files using the swifty-mvc template engine (included automatically)

Both plugins use `enforce: "pre"` to ensure they run before other Vite plugins, allowing them to transform files before any other processing occurs.

### Markdown Compilation {#vite-markdown-compilation}

When a `.md` file is imported in your application, the swifty-docs plugin intercepts the import through the `resolveId` hook. The hook resolves the file path to an absolute path and appends a `?swifty-docs` query parameter to mark it for special handling.

```ts
// When your code imports:
import content from "./guide/getting-started.md";

// The plugin resolves it to:
("/absolute/path/to/guide/getting-started.md?swifty-docs");
```

The `load` hook then checks for the `?swifty-docs` marker and compiles the Markdown source through the full pipeline:

1. Extract YAML frontmatter metadata (title, description, sidebar position)
2. Parse the Markdown body using markdown-it with custom plugins
3. Generate syntax-highlighted code blocks using Shiki (lazy initialization)
4. Build page metadata object with title, headings, and navigation data
5. Emit a JavaScript module that exports `pageData` and `contentHtml`

The compiled output looks like this:

```js
export const pageData = {
  title: "Getting Started",
  description: "Learn how to use swifty-docs",
  headings: [
    { level: 2, text: "Installation", slug: "installation" },
    { level: 2, text: "Configuration", slug: "configuration" },
  ],
};

export const contentHtml = `
  <h2 id="installation">Installation</h2>
  <p>Install swifty-docs using your package manager...</p>
  <h2 id="configuration">Configuration</h2>
  <p>Create a swifty-docs.config.ts file...</p>
`;
```

### Template Compilation {#vite-template-compilation}

The swifty-template plugin handles `.html` template files used by theme views. It compiles swifty-mvc template syntax into JavaScript functions that render HTML strings or virtual DOM nodes.

Template operators supported:

- `{{=variable}}` for HTML-escaped text interpolation
- `{{!variable}}` for raw (unescaped) HTML
- `{{if condition}}` for conditional rendering
- `{{each items as item}}` for iteration
- `{{@ ref}}` for reference lookups (swifty-mvc feature, not used in the default theme)
- `{{: binding}}` for two-way data binding (swifty-mvc feature, not used in the default theme)

The plugin auto-extracts global variables from templates using AST analysis, eliminating the need to manually declare template dependencies.

```ts
// Template file: theme/layout.html
<div class="layout">
  {{if showSidebar}}
    <aside>{{! sidebarHtml}}</aside>
  {{/if}}
  <main>{{! contentHtml}}</main>
</div>

// Compiled to:
export default function(data, viewId, refData) {
  const { showSidebar, sidebarHtml, contentHtml } = data;
  return `<div class="layout">
    ${showSidebar ? `<aside>${sidebarHtml}</aside>` : ""}
    <main>${contentHtml}</main>
  </div>`;
}
```

### Hot Module Replacement {#vite-hmr}

The Vite plugins automatically inject HMR code that enables instant template updates during development without full page reloads. When a `.html` template file changes, the compiled template module self-accepts the update and calls `hotSwapByView()` to replace the template function on all mounted view instances.

```ts
// Auto-injected HMR snippet
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule) {
      hotSwapByView(oldTemplateFn, newModule.default);
    }
  });
}
```

This provides React/Vue-style hot reload behavior for swifty-mvc templates without requiring any manual HMR setup in your theme code.

### Configuration Options {#vite-options}

```ts
interface SwiftyDocsVitePluginOptions {
  /** Full documentation site configuration */
  config: DocsConfig;

  /** Enable debug mode with line tracking (default: false) */
  debug?: boolean;

  /** Generate virtual DOM output instead of HTML strings (default: false) */
  vdom?: boolean;
}
```

The `vdom` option controls whether templates compile to HTML strings (default) or virtual DOM nodes. This is useful when integrating with frameworks that expect VDOM output rather than raw HTML.

## Webpack Plugin {#webpack-plugin}

The Webpack integration provides a plugin that automatically registers a loader for `.md` files, enabling seamless Markdown compilation within Webpack's module system.

### Basic Usage {#webpack-basic-usage}

```js
// webpack.config.js
import { SwiftyDocsPlugin } from "swifty-docs/webpack";
import docsConfig from "./swifty-docs.config.js";

export default {
  // ... other webpack config
  plugins: [
    new SwiftyDocsPlugin({
      config: docsConfig,
      debug: process.env.NODE_ENV !== "production",
    }),
  ],
};
```

The plugin approach is recommended for most use cases because it automatically configures the loader rule and handles edge cases like excluding `node_modules`.

### Manual Loader Configuration {#webpack-manual-loader}

For advanced scenarios where you need fine-grained control over the loader chain, you can configure the loader manually:

```js
// webpack.config.js
export default {
  module: {
    rules: [
      {
        test: /\.md$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "swifty-docs/webpack",
            options: {
              config: docsConfig,
              debug: false,
            },
          },
        ],
      },
    ],
  },
};
```

### Loader Implementation {#webpack-loader-implementation}

The Webpack loader uses the standard `this.callback()` pattern for asynchronous result delivery, which is the recommended approach for Webpack 5 loaders:

```ts
export function swiftyDocsLoader(
  this: WebpackLoaderContext,
  source: string,
): void {
  const callback = this.callback;
  const options = this.getOptions();

  compileMarkdown(source, {
    config: options.config,
    filePath: this.resourcePath,
    debug: options.debug,
  })
    .then((result) => callback(null, result))
    .catch((err: unknown) =>
      callback(err instanceof Error ? err : new Error(String(err))),
    );
}
```

The loader receives the raw Markdown source, compiles it through the same pipeline used by the Vite plugin, and returns a JavaScript module string via the callback.

### Plugin Auto-Registration {#webpack-plugin-auto-registration}

The `SwiftyDocsPlugin` class implements the Webpack plugin interface and automatically adds the loader rule to `module.rules` when applied:

```ts
export class SwiftyDocsPlugin {
  apply(compiler: WebpackCompiler): void {
    const test = this.options.test || /\.md$/;
    const exclude = this.options.exclude || /node_modules/;

    compiler.options.module.rules.push({
      test,
      exclude,
      use: [
        {
          loader: __filename,
          options: this.options,
        },
      ],
    });
  }
}
```

The `__filename` reference is resolved by Webpack to the absolute path of the compiled loader module, allowing Webpack to locate and execute the loader function.

### Configuration Options {#webpack-options}

```ts
interface SwiftyDocsWebpackOptions {
  /** Full documentation site configuration */
  config: DocsConfig;

  /** Enable debug mode (default: false) */
  debug?: boolean;

  /** Test regex for files to process (default: /\.md$/) */
  test?: RegExp;

  /** Exclude regex for files to skip (default: /node_modules/) */
  exclude?: RegExp;
}
```

## Rspack Plugin {#rspack-plugin}

The Rspack integration mirrors the Webpack plugin API but uses Rspack's async loader convention, which requires returning a Promise directly rather than calling `this.callback()`.

### Basic Usage {#rspack-basic-usage}

```ts
// rspack.config.ts
import { SwiftyDocsPlugin } from "swifty-docs/rspack";
import docsConfig from "./swifty-docs.config";

export default {
  // ... other rspack config
  plugins: [
    new SwiftyDocsPlugin({
      config: docsConfig,
      debug: process.env.NODE_ENV !== "production",
    }),
  ],
};
```

### Loader Implementation {#rspack-loader-implementation}

The Rspack loader returns a Promise directly, which is the required pattern for Rspack async loaders:

```ts
export async function swiftyDocsLoader(
  this: RspackLoaderContext,
  source: string,
): Promise<string> {
  const options = this.getOptions();
  return await compileMarkdown(source, {
    config: options.config,
    filePath: this.resourcePath,
    debug: options.debug,
  });
}
```

This differs from the Webpack loader, which uses `this.callback()` for async delivery. Calling `callback()` inside an async function in Rspack causes "callback already called" errors because the resolved Promise also signals completion.

### Manual Loader Configuration {#rspack-manual-loader}

```ts
// rspack.config.ts
export default {
  module: {
    rules: [
      {
        test: /\.md$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "swifty-docs/rspack",
            options: {
              config: docsConfig,
              debug: false,
            },
          },
        ],
      },
    ],
  },
};
```

### Configuration Options {#rspack-options}

```ts
interface SwiftyDocsRspackOptions {
  /** Full documentation site configuration */
  config: DocsConfig;

  /** Enable debug mode (default: false) */
  debug?: boolean;

  /** Test regex for files to process (default: /\.md$/) */
  test?: RegExp;

  /** Exclude regex for files to skip (default: /node_modules/) */
  exclude?: RegExp;
}
```

## Build Configuration {#build-configuration}

The swifty-docs package uses a dual-mode build system that produces both a distributable library and a documentation site from the same codebase. This is controlled through Vite's `--mode` flag.

### Library Mode {#library-mode}

Library mode builds the swifty-docs package for distribution, producing multiple entry points in both ESM and CommonJS formats:

```bash
vite build --mode lib
```

The library build configuration:

```ts
function libConfig(options?: { isDev?: boolean }): UserConfig {
  return {
    build: {
      lib: {
        cssFileName: "swifty-docs",
        entry: {
          index: resolve(PKG_DIR, "src/index.ts"),
          compiler: resolve(PKG_DIR, "src/compiler.ts"),
          vite: resolve(PKG_DIR, "src/vite.ts"),
          webpack: resolve(PKG_DIR, "src/webpack.ts"),
          rspack: resolve(PKG_DIR, "src/rspack.ts"),
          runtime: resolve(PKG_DIR, "src/runtime.ts"),
          theme: resolve(PKG_DIR, "src/theme/index.ts"),
        },
        formats: ["es", "cjs"],
        fileName: (format: string, entryName: string) =>
          format === "es" ? `${entryName}.js` : `${entryName}.cjs`,
      },
      rollupOptions: {
        external: (id: string) =>
          EXTERNAL_PKGS.some((e) => id === e || id.startsWith(e + "/")),
      },
      outDir: "dist",
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
    },
    plugins: [
      themeDualMode({ debug: isDev }),
      // ... other plugins
    ],
  };
}
```

Key aspects of library mode:

- **Multiple entry points**: Produces separate bundles for `index`, `compiler`, `vite`, `webpack`, `rspack`, `runtime`, and `theme`
- **Dual format output**: Generates both `.js` (ESM) and `.cjs` (CommonJS) files for each entry
- **External dependencies**: Dependencies like `markdown-it`, `shiki`, and `swifty-mvc` are externalized, requiring consumers to install them
- **No minification**: Library code is not minified to preserve readability and enable tree-shaking
- **CJS shims**: Injects `__filename` and `__dirname` shims for ESM chunks that reference them (needed by webpack.ts and rspack.ts loader self-references)

### Docs Mode {#docs-mode}

Docs mode builds the swifty-docs documentation site itself, using swifty-docs to document swifty-docs:

```bash
vite build --mode docs
```

The docs build configuration:

```ts
function docsConfig(options?: { isDev?: boolean }): UserConfig {
  return {
    base: isDev ? "/" : "/swifty/",
    root: resolve(PKG_DIR, "app"),
    publicDir: resolve(PKG_DIR, "public"),
    plugins: [
      themeDualMode({ debug: isDev }),
      ...swiftyDocsPlugin({
        config: swiftyDocsConfig,
        vdom: false,
        debug: true,
      }),
      tailwindcss(),
      VitePWA({
        // ... PWA configuration
      }),
    ],
    resolve: {
      alias: {
        "@swifty-docs/generated": resolve(PKG_DIR, ".swifty-docs/generated"),
        "swifty-docs": resolve(PKG_DIR, "src"),
        "swifty-mvc": resolve(PKG_DIR, "../swifty-mvc/dist"),
      },
    },
    build: {
      outDir: resolve(PKG_DIR, "dist-docs"),
      emptyOutDir: true,
    },
    server: {
      port: 3200,
      open: true,
    },
  };
}
```

Key aspects of docs mode:

- **Self-documenting**: Uses swifty-docs to build its own documentation
- **Development server**: Configures a dev server on port 3200 with auto-open
- **Path aliases**: Resolves `@swifty-docs/generated` to the generated runtime module
- **PWA support**: Integrates `vite-plugin-pwa` for offline support and installability
- **Tailwind CSS**: Uses the Tailwind Vite plugin for utility-first styling

### Mode Selection {#mode-selection}

The build mode is selected through Vite's `--mode` flag or the `mode` property in the config function:

```ts
export default defineConfig(({ mode, command }) => {
  const isDev = command === "serve";

  if (mode === "lib") {
    return libConfig({ isDev });
  }

  if (mode === "docs") {
    return docsConfig({ isDev });
  }

  return docsConfig({ isDev });
});
```

## themeDualMode Plugin {#theme-dual-mode}

The `themeDualMode` plugin is a specialized Vite plugin that compiles theme template files in both string and VDOM modes, allowing the bundled theme to support either rendering mode at runtime based on the consumer's configuration.

### Purpose {#theme-dual-mode-purpose}

swifty-mvc supports two rendering modes:

1. **String mode**: Templates compile to functions that return HTML strings (default, simpler)
2. **VDOM mode**: Templates compile to functions that return virtual DOM nodes (better for dynamic updates)

Theme authors write templates once using swifty-mvc template syntax, and the `themeDualMode` plugin compiles each template twice (once for each mode), producing a dual-mode module that exports both versions.

### Implementation {#theme-dual-mode-implementation}

The plugin uses virtual modules to avoid conflicts with the standard `swiftyMvcPlugin`, which intercepts all `.html` imports:

```ts
function themeDualMode(options?: { debug?: boolean }): PluginOption {
  const { debug = false } = options ?? {};
  const THEME_DIR = resolve(PKG_DIR, "src", "theme");
  const VIRTUAL_PREFIX = "virtual:swifty-docs/";
  const RESOLVED_PREFIX = "\0virtual:swifty-docs/";
  const TEMPLATE_NAMES = ["docs-layout", "sidebar", "toc", "search"];

  return {
    name: "theme-dual-mode",
    enforce: "pre",

    resolveId(source: string) {
      if (source.startsWith(VIRTUAL_PREFIX)) {
        return "\0" + source;
      }
      return undefined;
    },

    async load(id: string) {
      if (!id.startsWith(RESOLVED_PREFIX)) return null;

      const name = id.slice(RESOLVED_PREFIX.length);
      if (!TEMPLATE_NAMES.includes(name)) return null;

      const filePath = resolve(THEME_DIR, name + ".html");
      const raw = await readFile(filePath, "utf-8");
      const globalVars = await extractGlobalVars(raw);

      // Compile in both modes
      const [strResult, vdomResult] = await Promise.all([
        compileTemplate(raw, { globalVars, vdom: false }),
        compileTemplate(raw, { globalVars, vdom: true }),
      ]);

      // Split and merge imports
      const strMod = splitModule(strResult);
      const vdomMod = splitModule(vdomResult);
      const uniqueImports = mergeImports([
        ...strMod.imports,
        ...vdomMod.imports,
      ]);

      // Emit dual-mode module
      const content = [
        ...uniqueImports,
        "",
        `const __str = ${strMod.body}\n`,
        `const __vdom = ${vdomMod.body}\n`,
        "export { __str, __vdom };",
      ].join("\n");

      return content;
    },
  };
}
```

### Virtual Module Convention {#theme-dual-mode-virtual-modules}

The plugin uses the `virtual:swifty-docs/` prefix for virtual module IDs, which is a Rollup convention for marking modules as "owned by this plugin." The `\0` prefix in the resolved ID prevents other plugins from attempting to load these modules.

```ts
// Virtual module ID:
"virtual:swifty-docs/docs-layout";

// Resolved to:
"\0virtual:swifty-docs/docs-layout";
```

This approach avoids conflicts with the `swiftyMvcPlugin`, which intercepts imports ending in `.html`. Since virtual module IDs never end in `.html`, they bypass the standard template plugin entirely.

### Import Merging {#theme-dual-mode-import-merging}

String-mode and VDOM-mode compilation produce overlapping but not identical import sets from the same modules. The `mergeImports` function deduplicates these imports per source module:

```ts
// String mode imports:
import { encHtml, strSafe, encUri, encQuote, refFn } from "swifty-mvc/runtime";

// VDOM mode imports:
import { strSafe, encUri, encQuote, refFn } from "swifty-mvc/runtime";

// Merged result:
import { encHtml, strSafe, encUri, encQuote, refFn } from "swifty-mvc/runtime";
```

The merging logic parses import statements using a regex, extracts specifiers and source modules, and builds a map of local names to imported names per module. Overlapping specifiers are deduplicated by local name.

### Output Format {#theme-dual-mode-output}

Each virtual module exports two template functions:

```js
// virtual:swifty-docs/docs-layout
import { encHtml, strSafe, encUri, encQuote, refFn } from "swifty-mvc/runtime";

const __str = function (data, viewId, refData) {
  // String-mode template implementation
  return `<div class="layout">${data.content}</div>`;
};

const __vdom = function (data, viewId, refData) {
  // VDOM-mode template implementation
  return { type: "div", props: { class: "layout" }, children: [data.content] };
};

export { __str, __vdom };
```

Theme views import the dual-mode module and select the appropriate function based on the runtime configuration:

```ts
import { __str, __vdom } from "virtual:swifty-docs/docs-layout";

const templateFn = config.vdom ? __vdom : __str;
```

### Debug Mode {#theme-dual-mode-debug}

When `debug: true` is passed to the plugin, it writes intermediate compilation results to `.swifty-docs/tmp/theme-dual-mode.jsonl`:

```ts
function debugLog(entry: Record<string, unknown>): void {
  if (!debug) return;
  mkdirSync(DEBUG_DIR, { recursive: true });
  appendFileSync(DEBUG_FILE, JSON.stringify(entry) + "\n");
}
```

The debug log captures three stages for each template:

1. **compile**: Raw output from `compileTemplate()` in both modes
2. **split**: Result of separating imports from function body
3. **output**: Final merged module content

This is useful for debugging template compilation issues or understanding how the dual-mode system transforms templates.

## Performance Considerations {#performance}

The bundler plugins are designed for optimal performance through lazy initialization and caching:

### Lazy Shiki Initialization {#performance-shiki}

The Shiki syntax highlighter initializes as a lazy singleton on the first `.md` compilation. The WASM runtime and TextMate grammars load once and cache for all subsequent files, avoiding the overhead of reinitializing the highlighter for each Markdown file.

```ts
// First .md file triggers Shiki init
let highlighter: Highlighter | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ["github-dark"],
      langs: ["typescript", "javascript", "json", "bash"],
    });
  }
  return highlighter;
}
```

### Compile-Time Processing {#performance-compile-time}

All Markdown parsing and HTML rendering occurs at build time. The compiled JavaScript modules export pre-rendered HTML strings, eliminating the need for runtime Markdown processing in the browser.

### Search Index Generation {#performance-search-index}

The search index is built during the configuration phase from page titles, headings, and excerpts. The index is loaded lazily in the browser on the first search interaction, avoiding any impact on initial page load performance.

## Next Steps {#next-steps}

- [Configuration](./configuration) -- complete reference for `swifty-docs.config.ts`
- [Theme System](./theme) -- default theme layout and customization
- [Deploy](./deploy) -- build and deploy the generated documentation site
