# Bundler Integration {#bundler-integration}

swifty-mvc provides first-class integration with three major build tools: Vite, Webpack, and Rspack. Each bundler has a dedicated plugin or loader that automatically compiles `.html` template files into JavaScript render functions at build time.

## Overview {#overview}

The swifty-mvc package exposes bundler-specific entry points:

- `swifty-mvc/vite` — Vite plugin
- `swifty-mvc/webpack` — Webpack loader and plugin
- `swifty-mvc/rspack` — Rspack loader and plugin

All integrations share the same compilation pipeline and support identical features:

- Template syntax operators: `=` (escape), `!` (raw), `@` (ref lookup), `:` (binding)
- Event attribute processing with `@event` syntax
- URI encoding (`$encUri`), quote encoding (`$encQuote`), reference lookup (`$refFn`)
- Debug mode with line tracking and error reporting
- View ID injection for scoped event delegation
- Automatic variable extraction via AST analysis
- Hot Module Replacement (HMR) with zero configuration
- Virtual DOM output mode (optional)

The plugins transform `.html` files into ES modules that export a render function with the signature `(data, viewId, refData) => string | VDomNode`.

## Vite Plugin {#vite-plugin}

The Vite plugin is the recommended integration for Vite-based projects. It provides zero-configuration template compilation with automatic HMR support.

### Installation {#vite-installation}

Install Vite as a development dependency:

```bash
npm install -D vite
```

### Configuration {#vite-configuration}

Create or update your `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import { swiftyMvcPlugin } from "swifty-mvc/vite";

export default defineConfig({
  plugins: [
    swiftyMvcPlugin({
      debug: false,
      vdom: false,
    }),
  ],
});
```

### Plugin Options {#vite-options}

The `swiftyMvcPlugin` accepts an options object with the following properties:

debug (boolean, default: `false`)

Enable debug mode with line tracking. When enabled, runtime errors include the original template expression and line number, making debugging easier during development.

```typescript
swiftyMvcPlugin({
  debug: process.env.NODE_ENV !== "production",
});
```

vdom (boolean, default: `false`)

Enable virtual DOM output. When enabled, compiled templates return VDomNode structures instead of HTML strings. The framework uses a VDOM diff algorithm with LIS (Longest Increasing Subsequence) reconciliation for efficient updates.

```typescript
swiftyMvcPlugin({
  vdom: true,
});
```

### How It Works {#vite-how-it-works}

The plugin implements three Vite hooks:

1. `resolveId` — Intercepts `.html` imports and marks them with a `?swifty-template` query parameter
2. `load` — Reads the HTML file, extracts global variables via AST analysis, compiles the template, and injects HMR code
3. `transform` — Injects view-class HMR into TypeScript files that import HTML templates

The plugin automatically extracts template variables using `extractGlobalVars()`, so you do not need to manually declare which variables your template uses. This provides a zero-configuration experience.

### HMR Support {#vite-hmr}

The plugin automatically injects HMR code into compiled templates and view files. When you edit a `.html` template, the changes hot-swap across all mounted views without losing view-local state. When you edit a view's TypeScript file, the setup function is hot-swapped while preserving state.

No manual `import.meta.hot` code is required.

## Webpack Integration {#webpack-integration}

swifty-mvc provides two integration modes for Webpack: a loader for manual configuration and a plugin for zero-configuration setup.

### Installation {#webpack-installation}

Install Webpack and related dependencies:

```bash
npm install -D webpack webpack-cli webpack-dev-server html-webpack-plugin ts-loader
```

### Plugin Mode (Recommended) {#webpack-plugin}

The `SwiftyMvcPlugin` class automatically registers the loader for `.html` files. This is the recommended approach for most projects.

```javascript
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { SwiftyMvcPlugin } = require("swifty-mvc/webpack");

module.exports = {
  entry: "./src/main.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new SwiftyMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
      vdom: false,
    }),
    new HtmlWebpackPlugin({
      template: "./index.html",
    }),
  ],
  resolve: {
    extensions: [".ts", ".js"],
  },
};
```

### Plugin Options {#webpack-plugin-options}

The `SwiftyMvcPlugin` constructor accepts an options object:

debug (boolean, default: `false`)

Enable debug mode with line tracking for better error messages during development.

vdom (boolean, default: `false`)

Enable virtual DOM output instead of HTML string output.

test (RegExp, default: `/\.html$/`)

File extension pattern to match. Defaults to all `.html` files.

exclude (RegExp, default: `/node_modules/`)

Pattern for files to exclude from compilation. Defaults to excluding `node_modules`.

### Loader Mode (Manual) {#webpack-loader}

For fine-grained control, you can use the loader directly in your Webpack configuration:

```javascript
module.exports = {
  module: {
    rules: [
      {
        test: /\.html$/,
        use: [
          {
            loader: "swifty-mvc/webpack",
            options: {
              debug: false,
              vdom: false,
            },
          },
        ],
      },
    ],
  },
};
```

The loader mode gives you full control over which files are processed and allows you to chain loaders or apply conditional logic.

### How It Works {#webpack-how-it-works}

The Webpack integration uses an async loader that:

1. Reads the HTML source
2. Extracts global variables via AST analysis using Babel
3. Compiles the template through the standard compilation pipeline
4. Injects HMR code for hot module replacement
5. Returns the compiled ES module

The plugin mode automatically adds the loader rule to your Webpack configuration, so you do not need to manually configure `module.rules`.

## Rspack Integration {#rspack-integration}

Rspack is a fast Rust-based bundler with a Webpack-compatible API. swifty-mvc provides identical integration for Rspack with the same API surface as Webpack.

### Installation {#rspack-installation}

Install Rspack:

```bash
npm install -D @rspack/cli @rspack/core html-rspack-plugin
```

### Plugin Mode (Recommended) {#rspack-plugin}

The `SwiftyMvcPlugin` class works exactly like the Webpack version:

```javascript
const path = require("path");
const { HtmlRspackPlugin } = require("@rspack/core");
const { SwiftyMvcPlugin } = require("swifty-mvc/rspack");

module.exports = {
  entry: "./src/main.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: "builtin:swc-loader",
          options: {
            jsc: {
              parser: {
                syntax: "typescript",
              },
            },
          },
        },
      },
    ],
  },
  plugins: [
    new SwiftyMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
      vdom: false,
    }),
    new HtmlRspackPlugin({
      template: "./index.html",
    }),
  ],
  resolve: {
    extensions: [".ts", ".js"],
  },
};
```

### Loader Mode (Manual) {#rspack-loader}

Use the loader directly for manual configuration:

```javascript
module.exports = {
  module: {
    rules: [
      {
        test: /\.html$/,
        use: [
          {
            loader: "swifty-mvc/rspack",
            options: {
              debug: false,
              vdom: false,
            },
          },
        ],
      },
    ],
  },
};
```

### Differences from Webpack {#rspack-differences}

The Rspack integration is API-compatible with Webpack, but there is one internal difference: Rspack async loaders must return the result directly rather than calling `this.callback()`. The loader handles this automatically, so the public API remains identical.

## CompileOptions {#compile-options}

All bundler integrations use the same compilation pipeline. The `CompileOptions` interface defines the available options:

```typescript
interface CompileOptions {
  /** Enable debug mode with line tracking (default: false) */
  debug?: boolean;
  /** Global variable names to destructure from data (default: auto-extracted) */
  globalVars?: string[];
  /** File path for debug error messages (default: undefined) */
  file?: string;
  /** Generate VDOM output instead of HTML string (default: false) */
  vdom?: boolean;
}
```

### debug {#compile-debug}

When `debug` is `true`, the compiler wraps template expressions in error tracking code. If a runtime error occurs during rendering, the error message includes:

- The original template expression (e.g., `{{=user.name}}`)
- The source art directive (if applicable)
- The file path (when `file` option is provided)

Example error output:

```
render error: Cannot read property 'name' of undefined
  src art: {{user.name}}
  translate to: <%=$data.user.name%>
  at file: src/views/home.html
```

This makes it much easier to identify which template expression caused the error.

### globalVars {#compile-global-vars}

The `globalVars` array specifies variable names that should be destructured from the `data` object passed to the template function. By default, the compiler automatically extracts these variables using AST analysis via Babel.

For example, if your template contains `{{=userName}}` and `{{=userEmail}}`, the compiler automatically generates:

```javascript
let userName = $data.userName,
  userEmail = $data.userEmail;
```

You can override this behavior by explicitly providing `globalVars`:

```javascript
{
  globalVars: ["userName", "userEmail", "isAdmin"];
}
```

### file {#compile-file}

The `file` option specifies the file path to include in debug error messages. This is useful when the compilation is performed by a build tool that knows the original file location.

```javascript
{
  debug: true,
  file: 'src/views/home.html'
}
```

### vdom {#compile-vdom}

When `vdom` is `true`, the compiler generates a template function that returns a `VDomNode` tree instead of an HTML string. The framework uses a virtual DOM diff algorithm with LIS reconciliation for efficient updates.

VDOM mode is recommended for applications with:

- Large, complex view hierarchies
- Frequent, granular updates
- Performance-critical rendering paths

For most applications, the default string mode (real DOM diff) provides excellent performance with simpler output.

## Module Federation Support {#module-federation}

swifty-mvc includes built-in support for micro-frontend architectures via Module Federation. The framework provides two key integration points: `Framework.use()` and `FrameworkConfig.require`.

### Framework.use() {#framework-use}

`Framework.use()` is the primary API for loading view modules asynchronously. It supports two calling conventions:

With callback:

```typescript
Framework.use("app/views/home", (homeView) => {
  // Use the loaded view
});
```

Multiple modules:

```typescript
Framework.use(["app/views/home", "app/views/about"], (homeView, aboutView) => {
  // Both modules are now available
});
```

### FrameworkConfig.require {#framework-config-require}

Configure a custom module loader for advanced scenarios like Webpack Module Federation:

```typescript
import { Framework } from "swifty-mvc";

Framework.boot({
  rootId: "root",
  routeMode: "history",
  require: async (names, params) => {
    // Custom loading logic
    return Promise.all(
      names.map((name) => {
        // Load from remote federation container
        return loadRemoteModule(name);
      }),
    );
  },
});
```

When `require` is configured, `Framework.use()` delegates to it instead of using dynamic `import()`.

### Webpack Module Federation Example {#webpack-mf-example}

Configure Webpack Module Federation to share views across micro-frontends:

Host application (webpack.config.js):

```javascript
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "host",
      remotes: {
        remoteApp: "remoteApp@http://localhost:3001/remoteEntry.js",
      },
    }),
  ],
};
```

Remote application (webpack.config.js):

```javascript
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "remoteApp",
      filename: "remoteEntry.js",
      exposes: {
        "./views/home": "./src/views/home",
      },
    }),
  ],
};
```

Host application entry (main.ts):

```typescript
import { Framework } from "swifty-mvc";

Framework.boot({
  rootId: "root",
  routeMode: "history",
  routes: {
    "/": "app/views/home",
    "/remote": "remoteApp/views/home",
  },
  require: async (names) => {
    return Promise.all(
      names.map((name) => {
        if (name.startsWith("remoteApp/")) {
          // Load from federated module
          return import(/* webpackIgnore: true */ name);
        }
        // Load local module
        return import(`./${name}`);
      }),
    );
  },
});
```

### Dynamic Import Fallback {#dynamic-import-fallback}

When `FrameworkConfig.require` is not configured, `Framework.use()` falls back to dynamic `import()`:

```typescript
Framework.use("app/views/home");
// Internally becomes:
import("./app/views/home");
```

The fallback automatically handles ESM compatibility, extracting the `default` export when present.

## Build Configuration {#build-configuration}

swifty-mvc uses tsup as the primary build tool, with rollup available as an alternative. Both produce ESM and CommonJS bundles.

### tsup Configuration {#tsup-configuration}

The `tsup.config.ts` defines multiple build configurations:

```typescript
import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Core framework
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: { resolve: true },
    clean: true,
  },
  {
    // Compiler (bundles @babel/parser and @babel/types)
    entry: ["src/compiler.ts"],
    format: ["esm", "cjs"],
    dts: true,
    noExternal: ["@babel/parser", "@babel/types"],
  },
  {
    // Bundler plugins (vite, webpack, rspack)
    entry: ["src/vite.ts", "src/webpack.ts", "src/rspack.ts"],
    format: ["esm", "cjs"],
    dts: true,
    noExternal: ["@babel/parser", "@babel/types"],
    shims: true,
    splitting: false,
  },
  {
    // Runtime helpers (imported by compiled templates)
    entry: ["src/runtime.ts", "src/devtool.ts"],
    format: ["esm", "cjs"],
    dts: true,
  },
]);
```

Key configuration details:

- `noExternal: ['@babel/parser', '@babel/types']` — Babel packages are bundled into the compiler and plugin outputs rather than treated as external dependencies. This ensures the build-time compilation pipeline is self-contained.
- `shims: true` — Injects `__filename` and `__dirname` shims for ESM output. The Webpack and Rspack plugins use `__filename` to locate the loader at runtime.
- `splitting: false` — Ensures each plugin entry produces a single self-contained file with no shared chunk extraction. This is critical because each plugin needs its own `__filename` pointing to its specific file.

### Rollup Configuration {#rollup-configuration}

The `rollup.config.mjs` provides an alternative build pipeline with additional output formats:

```javascript
const entries = [
  { name: "index", external: true, umd: true },
  { name: "compiler", external: false, umd: false },
  { name: "webpack", external: false, umd: false },
  { name: "rspack", external: false, umd: false },
  { name: "vite", external: false, umd: false },
  { name: "runtime", external: true, umd: true },
  { name: "devtool", external: true, umd: false },
];
```

Rollup generates:

- ESM (`.js`) — For modern bundlers and tree-shaking
- CommonJS (`.cjs`) — For Node.js and older tools
- UMD (`.umd.js`) — For browser script tags (index and runtime only)
- AMD (`.amd.js`) — For AMD module loaders (index and runtime only)
- Type declarations (`.d.ts` and `.d.cts`) — For TypeScript consumers

The `cjsShims()` plugin injects `__filename` and `__dirname` polyfills for ESM outputs, mirroring tsup's `shims: true` behavior.

### Build Scripts {#build-scripts}

Add build scripts to your `package.json`:

```json
{
  "scripts": {
    "build:tsup": "tsup",
    "build:rollup": "rollup -c rollup.config.mjs",
    "build": "pnpm build:tsup"
  }
}
```

### Output Structure {#output-structure}

After building, the `dist/` directory contains:

```
dist/
├── index.js           (ESM)
├── index.cjs          (CommonJS)
├── index.d.ts         (Type declarations)
├── index.d.cts        (CJS type declarations)
├── compiler.js        (ESM)
├── compiler.cjs       (CommonJS)
├── vite.js            (ESM plugin)
├── vite.cjs           (CJS plugin)
├── webpack.js         (ESM plugin/loader)
├── webpack.cjs        (CJS plugin/loader)
├── rspack.js          (ESM plugin/loader)
├── rspack.cjs         (CJS plugin/loader)
├── runtime.js         (ESM runtime helpers)
├── runtime.cjs        (CJS runtime helpers)
└── client.d.ts        (Client-side types)
```

The `package.json` `exports` field maps these files to the public API:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./vite": {
      "import": "./dist/vite.js",
      "require": "./dist/vite.cjs"
    },
    "./webpack": {
      "import": "./dist/webpack.js",
      "require": "./dist/webpack.cjs"
    },
    "./rspack": {
      "import": "./dist/rspack.js",
      "require": "./dist/rspack.cjs"
    },
    "./runtime": {
      "import": "./dist/runtime.js",
      "require": "./dist/runtime.cjs"
    }
  }
}
```

## Choosing a Bundler {#choosing-a-bundler}

Each bundler has different strengths:

Vite — Fastest development experience with instant HMR and optimized dev server. Best for new projects and rapid prototyping.

Webpack — Mature ecosystem with extensive plugin support. Best for complex build requirements and Module Federation micro-frontends.

Rspack — Webpack-compatible API with significantly faster build times. Best when you need Webpack compatibility but want better performance.

All three bundlers produce identical runtime output, so you can switch between them without changing application code.
