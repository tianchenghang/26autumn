# Getting Started

## Prerequisites {#prerequisites}

- [Node.js](https://nodejs.org/) version 20 or higher
- Terminal for accessing swifty-docs via its command line interface
- Text editor with [Markdown](https://en.wikipedia.org/wiki/Markdown) syntax support
  - [VSCode](https://code.visualstudio.com/) is recommended
- One of the supported bundlers: Vite, Webpack, or Rspack
- [Tailwind CSS](https://tailwindcss.com/) v4 with [daisyUI](https://daisyui.com/) v5 and [@tailwindcss/typography](https://github.com/tailwindlabs/tailwindcss-typography) (peer dependencies)

swifty-docs is an ESM-only package. Your nearest `package.json` must contain `"type": "module"`. Do not use `require()` to import it.

## Installation {#installation}

swifty-docs can be used on its own or installed into an existing project. In both cases, install it with your preferred package manager:

::: code-group

```sh [npm]
$ npm add -D swifty-docs
$ npm add -D swifty-mvc tailwindcss daisyui @tailwindcss/typography
```

```sh [pnpm]
$ pnpm add -D swifty-docs
$ pnpm add -D swifty-mvc tailwindcss daisyui @tailwindcss/typography
```

```sh [yarn]
$ yarn add -D swifty-docs
$ yarn add -D swifty-mvc tailwindcss daisyui @tailwindcss/typography
```

```sh [bun]
$ bun add -D swifty-docs
$ bun add -D swifty-mvc tailwindcss daisyui @tailwindcss/typography
```

:::

::: tip Note
swifty-docs lists `swifty-mvc` as a direct dependency, so it is installed automatically by npm, pnpm, or yarn. Tailwind CSS, daisyUI, and @tailwindcss/typography are peer dependencies and must be installed separately.
:::

## Project Setup {#project-setup}

If you are building a standalone documentation site, scaffold the project in your current directory. If you are installing swifty-docs in an existing project alongside other source code, place the documentation source in a nested directory (e.g., `./docs`) so that it is separate from the rest of the project.

Assuming you scaffold the project in `./docs`, the generated file structure should look like this:

```
.
├─ docs/
│  ├─ guide/
│  │  ├─ getting-started.md
│  │  └─ configuration.md
│  ├─ reference/
│  │  └─ api.md
│  └─ index.md
├─ app/
│  ├─ index.html
│  ├─ boot.ts
│  └─ main.css
├─ .swifty-docs/
│  └─ generated/
│     └─ index.js
├─ swifty-docs.config.ts
├─ vite.config.ts
└─ package.json
```

The `docs/` directory is the source directory for your Markdown files. The `app/` directory contains the application entry point and boot file. The `.swifty-docs/` directory is auto-generated and should be added to your `.gitignore`. The `swifty-docs.config.ts` file is the main configuration file.

::: tip
By default, swifty-docs stores generated runtime modules in `.swifty-docs/generated/` and build output in `dist-docs/`. If you are using Git, add both directories to your `.gitignore`.
:::

## Configuration {#configuration}

Create a `swifty-docs.config.ts` file in your project root. This file uses `defineConfig` from `swifty-docs/vite` to configure your documentation site:

```ts [swifty-docs.config.ts]
import { defineConfig } from "swifty-docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Documentation",
  description: "Documentation for my library",
  nav: [
    { text: "Guide", link: "/guide/getting-started" },
    { text: "Reference", link: "/reference/api" },
  ],
  sidebar: {
    "/guide/": "auto",
    "/reference/": "auto",
  },
  highlight: { theme: "github-light" },
  search: { provider: "local" },
});
```

The configuration options are:

| Option        | Type                            | Description                                                                        |
| ------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `docs`        | `string`                        | Source directory for Markdown files, relative to project root. Default: `"docs"`   |
| `baseUrl`     | `string`                        | Base URL prefix for all generated routes. Default: `"/docs/"`                      |
| `title`       | `string`                        | Site title displayed in the navbar                                                 |
| `description` | `string`                        | Site description for meta tags                                                     |
| `nav`         | `NavItem[]`                     | Top navigation items                                                               |
| `sidebar`     | `Record<string, SidebarConfig>` | Sidebar configuration per path prefix. `"auto"` generates from directory structure |
| `highlight`   | `HighlightOptions`              | Shiki syntax highlighting options                                                  |
| `search`      | `SearchOptions`                 | Search provider configuration (`"local"`, `"docsearch"`, or `"none"`)              |
| `markdown`    | `MarkdownOptions`               | Markdown processing options (anchors, TOC levels, containers)                      |

Consult the [Configuration Reference](./configuration) for full details on all options.

## Boot File Setup {#boot-file-setup}

The boot file initializes the swifty-mvc Framework with your documentation site. Create `app/boot.ts`:

```ts [app/boot.ts]
import {
  Framework,
  State,
  registerThemeViews,
  type FrameworkConfig,
} from "swifty-docs";

// Auto-generated by defineConfig()
import {
  routes,
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@swifty-docs/generated";

// CSS
import "./main.css";

// === Config ===

const config: FrameworkConfig = {
  rootId: "app",
  routeMode: "history",
  routes,
  vdom: false,
  defaultPath: "/",
  defaultView: "theme/docs-layout",
  unmatchedView: "theme/docs-layout",
  error(e: Error) {
    console.error("[swifty-docs]", e);
  },
};

// === Register theme views ===

registerThemeViews({ vdom: config.vdom });

// === Inject site data + content loader into State ===

State.set({ docsConfig, loadContent, getSearchIndex });

// === Boot ===

Framework.boot(config);
```

Create the HTML entry point `app/index.html`:

```html [app/index.html]
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#ecfdf5" />
    <title>My Documentation</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./boot.ts"></script>
  </body>
</html>
```

Create the CSS file `app/main.css`:

```css [app/main.css]
@import "tailwindcss";
@import "swifty-docs/client.css";

/* Scan theme templates for Tailwind class names */
@source "../node_modules/swifty-docs/dist/theme.js";

@plugin "daisyui" {
  themes:
    light --default,
    dark --prefersdark;
}

@plugin "@tailwindcss/typography";
```

## Vite Configuration {#vite-configuration}

Create a `vite.config.ts` that integrates the swifty-docs plugin:

```ts [vite.config.ts]
import { defineConfig } from "vite";
import { swiftyDocsPlugin } from "swifty-docs/vite";
import tailwindcss from "@tailwindcss/vite";
import swiftyDocsConfig from "./swifty-docs.config";

export default defineConfig({
  root: "app",
  publicDir: "public",
  plugins: [
    ...swiftyDocsPlugin({
      config: swiftyDocsConfig,
      vdom: false,
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@swifty-docs/generated": "./.swifty-docs/generated",
    },
  },
  build: {
    outDir: "dist-docs",
    emptyOutDir: true,
  },
  server: {
    port: 3200,
    open: true,
  },
});
```

::: tip
The `swiftyDocsPlugin` returns an array of two Vite plugins: one for `.md` file compilation and one for `.html` template compilation. The second plugin is the `swiftyMvcPlugin` from `swifty-mvc/vite`, which is integrated automatically. If your project already registers `swiftyMvcPlugin` separately, remove it to avoid double-registration. Spread the result into your plugins array with `...swiftyDocsPlugin(...)`.
:::

## Add npm Scripts {#add-npm-scripts}

Add the following scripts to your `package.json`:

```json [package.json]
{
  "scripts": {
    "docs:dev": "vite",
    "docs:build": "vite build",
    "docs:preview": "vite preview"
  }
}
```

## Dev Server {#dev-server}

Start the development server with hot module replacement:

::: code-group

```sh [npm]
$ npm run docs:dev
```

```sh [pnpm]
$ pnpm run docs:dev
```

```sh [yarn]
$ yarn docs:dev
```

```sh [bun]
$ bun run docs:dev
```

:::

The dev server should be running at `http://localhost:3200`. Visit the URL in your browser to see your documentation site. Changes to Markdown files trigger instant hot updates.

## Build for Production {#build-for-production}

Build the static site for deployment:

::: code-group

```sh [npm]
$ npm run docs:build
```

```sh [pnpm]
$ pnpm run docs:build
```

```sh [yarn]
$ yarn docs:build
```

```sh [bun]
$ bun run docs:build
```

:::

The production build outputs to `dist-docs/`. Deploy this directory to any static hosting service.

Preview the production build locally:

::: code-group

```sh [npm]
$ npm run docs:preview
```

```sh [pnpm]
$ pnpm run docs:preview
```

```sh [yarn]
$ yarn docs:preview
```

```sh [bun]
$ bun run docs:preview
```

:::

## Webpack and Rspack Support {#webpack-and-rspack-support}

swifty-docs supports Webpack and Rspack in addition to Vite. Import the plugin from the corresponding subpath:

::: code-group

```ts [webpack.config.js]
import { SwiftyDocsPlugin } from "swifty-docs/webpack";

export default {
  // ... other webpack config
  plugins: [new SwiftyDocsPlugin({ config: docsConfig })],
};
```

```ts [rspack.config.js]
import { SwiftyDocsPlugin } from "swifty-docs/rspack";

export default {
  // ... other rspack config
  plugins: [new SwiftyDocsPlugin({ config: docsConfig })],
};
```

:::

## TypeScript Integration {#typescript-integration}

For full TypeScript support, add the client types reference to your `tsconfig.json` or a `.d.ts` file in your project:

```ts [env.d.ts]
/// <reference types="swifty-docs/client" />
```

This provides ambient module declarations for the `@swifty-docs/generated` alias, enabling type checking for `routes`, `docsConfig`, `loadContent`, and `getSearchIndex`.

## What's Next? {#whats-next}

- To understand how Markdown files map to routes, read the [Routing](./routing) guide.

- To learn about Markdown extensions such as custom containers, TOC directives, and frontmatter, see [Markdown Features](./markdown).

- To explore the default theme layout, navigation, and styling, consult [Theme System](./theme).

- To set up local search or DocSearch UI, read [Search](./search).

- To deploy your site to production, follow the [Deploy](./deploy) guide.
