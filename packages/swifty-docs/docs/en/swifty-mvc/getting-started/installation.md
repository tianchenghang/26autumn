---
title: Installation
description: How to install Swifty MVC and its bundler plugins.
---

# Installation {#installation}

## Package manager {#package-manager}

Install `@swifty.js/mvc` using your preferred package manager:

::: code-group

```sh [npm]
$ npm install @swifty.js/mvc
```

```sh [pnpm]
$ pnpm add @swifty.js/mvc
```

```sh [yarn]
$ yarn add @swifty.js/mvc
```

```sh [bun]
$ bun add @swifty.js/mvc
```

:::

## Bundler plugin {#bundler-plugin}

Swifty MVC requires a bundler plugin to compile `.html` templates at build time. Plugins are available for Vite, Webpack, and Rspack.

### Vite {#vite}

Install Vite as a peer dependency if you have not already:

```sh
npm install -D vite
```

Add the Swifty MVC Vite plugin to your `vite.config.ts`:

```ts [vite.config.ts]
import { defineConfig } from "vite";
import { swiftyMvcPlugin } from "@swifty.js/mvc/vite";

export default defineConfig({
  plugins: [
    swiftyMvcPlugin({
      // Optional: enable VDOM rendering mode
      vdom: false,
      // Optional: enable debug line tracking
      debug: false,
    }),
  ],
});
```

The Vite plugin supports both Vite 7 and Vite 8. For Vite 7 specifically, you can use the dedicated entry:

```ts
import { swiftyMvcPlugin7 } from "@swifty.js/mvc/vite";
```

### Webpack 5 {#webpack}

Add the Swifty MVC Webpack plugin to your `webpack.config.js`:

```js [webpack.config.js]
const { SwiftyMvcPlugin } = require("@swifty.js/mvc/webpack");

module.exports = {
  plugins: [
    new SwiftyMvcPlugin({
      // Optional: customize which files are processed
      test: /\.html$/,
      exclude: /node_modules/,
    }),
  ],
};
```

The `SwiftyMvcPlugin` automatically registers the `swiftyMvcLoader` for `.html` files. You do not need to add it to `module.rules` manually.

### Rspack {#rspack}

Add the Swifty MVC Rspack plugin to your `rspack.config.js`:

```js [rspack.config.js]
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

## TypeScript configuration {#typescript-configuration}

Swifty MVC ships with full TypeScript declarations. Add the client type declarations to your `tsconfig.json` to enable ambient module support for `.html` template imports:

```json [tsconfig.json]
{
  "compilerOptions": {
    "types": ["@swifty.js/mvc/client"]
  }
}
```

This provides type declarations for:

- `*.html` module imports (template modules)
- `v-swifty` attribute in HTML
- DOM event extensions

## Verifying the installation {#verifying}

After installation, verify everything works by creating a minimal application:

```ts [src/main.ts]
import { Framework, defineView, registerViewClass } from "@swifty.js/mvc";

const HomeView = defineView((ctx) => {
  return {
    template: "<h1>Hello, Swifty MVC!</h1>",
  };
});

registerViewClass("home", HomeView);

Framework.boot({
  rootId: "app",
  routes: {
    "/": "home",
  },
});
```

```html [index.html]
<!DOCTYPE html>
<html>
  <head>
    <title>Swifty MVC App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Start your dev server and navigate to the application. You should see "Hello, Swifty MVC!" rendered on the page.

## Package exports {#package-exports}

The `@swifty.js/mvc` package provides multiple entry points:

| Import path               | Purpose                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `@swifty.js/mvc`          | Main runtime API — Framework, Router, State, hooks, etc.     |
| `@swifty.js/mvc/vite`     | Vite plugin (`swiftyMvcPlugin`)                              |
| `@swifty.js/mvc/webpack`  | Webpack loader + plugin                                      |
| `@swifty.js/mvc/rspack`   | Rspack loader + plugin                                       |
| `@swifty.js/mvc/compiler` | Build-time compiler (`compileTemplate`, `extractGlobalVars`) |
| `@swifty.js/mvc/runtime`  | Template runtime helpers (imported by compiled templates)    |
| `@swifty.js/mvc/devtool`  | Frame Devtool Bridge for browser extensions                  |
| `@swifty.js/mvc/client`   | Ambient type declarations only (no runtime code)             |

## Next steps {#next-steps}

With Swifty MVC installed, proceed to the [Quick Start](/docs/en/swifty-mvc/getting-started/quick-start) guide to build your first application.
