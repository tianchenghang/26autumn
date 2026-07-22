# @swifty.js/docs

Documentation site generator for `@swifty.js/mvc`.

If `@swifty.js/mvc` is to React or Vue, then `@swifty.js/docs` is to Docusaurus or VitePress -- providing an out-of-the-box documentation site experience built on top of the Swifty MVC framework.

## Features

- File-based routing: recursively scans a `docs/` directory and generates SPA routes
- Dual routing modes: supports `@swifty.js/mvc` Router in both `history` and `hash` modes
- Markdown compilation pipeline: `markdown-it` with four custom plugins (anchors, TOC, containers, code blocks)
- YAML frontmatter: metadata extraction via `js-yaml` for page titles, descriptions, sidebar positioning, and draft control
- Code syntax highlighting: Shiki-powered highlighting with lazy WASM initialization and singleton caching
- Admonition containers: `::: tip`, `::: warning`, `::: danger`, `::: details` rendered as DaisyUI alert components
- Auto-generated sidebar: directory-structure-based navigation with `sidebarPosition` and `sidebarLabel` frontmatter overrides
- Three search providers: MiniSearch-powered local modal (same engine as VitePress), Algolia DocSearch UI with local index (no account required), or disabled
- Table of contents: per-page heading outline with smooth-scroll navigation
- Three-column responsive layout: Tailwind CSS v4 + DaisyUI v5 with sticky navbar, frosted glass effect, and mobile-responsive sidebars
- Three bundler integrations: Vite, Webpack, and Rspack / Rsbuild
- Zero-config boot: `defineConfig()` auto-generates routes, sidebars, and search index into `.swifty-docs/generated/`
- Single-call theme registration: `registerThemeViews()` registers all theme components at once
- Dual-format library build: ships ESM + CJS with full TypeScript declarations

## Architecture

`@swifty.js/docs` operates in three phases:

**Phase 1 -- Configuration (build startup).** `defineConfig()` scans the docs directory, extracts frontmatter and headings from every `.md` file, auto-generates sidebar trees per path prefix, and writes a generated module to `.swifty-docs/generated/index.js`. This module provides dynamic content loaders, a route map, runtime site configuration, and a lazy search index builder.

**Phase 2 -- Compilation (bundler plugin).** Each `.md` import is intercepted by the bundler plugin (`swiftyDocsPlugin` for Vite, `SwiftyDocsPlugin` for Webpack/Rspack) and compiled through `compileMarkdown()`. The pipeline extracts YAML frontmatter, initializes the Shiki highlighter on first call (async singleton), parses the markdown body with `markdown-it` plus four custom plugins, renders to HTML, builds page metadata, and emits a JS module that exports `pageData` and `contentHtml`.

**Phase 3 -- Runtime (browser).** The `@swifty.js/mvc` Framework boots with the generated routes. The layout view stays mounted across navigation and asynchronously loads page content via `loadContent()`. Four theme Views (layout, sidebar, TOC, search) render the documentation UI. Search is lazily initialized on first query.

```
swifty-docs.config.ts          Bundler Plugin              Browser Runtime
       |                            |                          |
  defineConfig()              compileMarkdown()          Framework.boot()
       |                            |                          |
  scanDocsDir()               extractFrontmatter         registerThemeViews()
  generateSidebar()           createParser()             routes + loadContent
       |                      getHighlighter()           from generated module
       |                            |                          |
  .swifty-docs/generated/        JS module string          4 theme Views
  index.js                   ({pageData,                 render the docs UI
                               contentHtml})
```

## Quick Start

### 1. Install

```bash
pnpm add @swifty.js/docs @swifty.js/mvc tailwindcss daisyui @tailwindcss/typography
```

The theme templates use Tailwind CSS utility classes, DaisyUI components, and the Typography plugin for `prose` styling. All are peer dependencies -- your project must have them installed and configured in your CSS entry:

```css
@import "tailwindcss";
@plugin "daisyui";
@plugin "@tailwindcss/typography";
```

### 2. Configure

Create `swifty-docs.config.ts`:

```ts
import { defineConfig } from "@swifty.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  routeMode: "history",
  title: "My Library",
  description: "Documentation for My Library",
  nav: [
    { text: "Guide", link: "/docs/guide/" },
    { text: "API", link: "/docs/api/" },
  ],
  sidebar: {
    "/docs/guide/": "auto",
    "/docs/api/": "auto",
  },
  highlight: {
    theme: "github-dark",
    languages: ["typescript", "javascript", "html", "css", "bash", "json"],
  },
  search: { provider: "local" },
});
```

`defineConfig()` is an identity function that also triggers route generation. It scans the docs directory, generates sidebar trees, and writes the generated module -- all at configuration load time.

### 3. Configure Your Bundler

**Vite:**

```ts
import { defineConfig } from "vite";
import { swiftyDocsPlugin } from "@swifty.js/docs/vite";
import { swiftyMvcPlugin7 } from "@swifty.js/mvc/vite";
import tailwindcss from "@tailwindcss/vite";
import docsConfig from "./swifty-docs.config";
import { resolve } from "node:path";

const PKG_DIR = import.meta.dirname;

export default defineConfig({
  root: resolve(PKG_DIR, "app"),
  plugins: [
    swiftyDocsPlugin({ config: docsConfig }),
    swiftyMvcPlugin7({ debug: true, vdom: true }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@swifty-docs/generated": resolve(PKG_DIR, ".swifty-docs/generated"),
    },
  },
});
```

**Webpack:**

```ts
import { SwiftyDocsPlugin } from "@swifty.js/docs/webpack";
import docsConfig from "./swifty-docs.config";

export default {
  plugins: [new SwiftyDocsPlugin({ config: docsConfig })],
};
```

**Rspack:**

```ts
import { SwiftyDocsPlugin } from "@swifty.js/docs/rspack";
import docsConfig from "./swifty-docs.config";

export default {
  plugins: [new SwiftyDocsPlugin({ config: docsConfig })],
};
```

### 4. Boot

Create `app/boot.ts`:

```ts
import { Framework, State } from ".js/mvc";
import type { FrameworkConfig } from "@swifty.js/mvc";

// Auto-generated by defineConfig()
import {
  routes,
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@swifty-docs/generated";

// Theme views (layout, sidebar, toc, search) -- registered in one call.
// The framework imports and compiles the .html templates internally,
// so consumers don't need to import .html files or call registerViewClass
// for each theme component.
import { registerThemeViews } from "@swifty.js/docs/theme";

import "./main.css";

// === Register theme views ===

registerThemeViews();

// === Inject site data + content loader into State ===

State.set({ docsConfig, loadContent, getSearchIndex });

// === Boot ===

const config: FrameworkConfig = {
  rootId: "app",
  routeMode: "history",
  defaultPath: "/docs/",
  // All /docs/* routes map to "theme/docs-layout" (see generated routes).
  // The layout stays mounted across navigation; observeLocation triggers
  // an async render that loads the matching .md content via loadContent.
  defaultView: "theme/docs-layout",
  routes,
  unmatchedView: "theme/docs-layout",
};

Framework.boot(config);
```

### 5. TypeScript Setup

Create `shims.d.ts` in your project root:

```ts
/// <reference types="@swifty.js/docs/client" />
/// <reference types="vite/client" />
```

The `/// <reference types="@swifty.js/docs/client" />` directive loads ambient module declarations for `@swifty-docs/generated` (routes, docsConfig, loadContent, getSearchIndex, SearchEntry) and `*.html` template imports.

Add a `paths` mapping in `tsconfig.json` to help the IDE resolve the generated module:

```json
{
  "compilerOptions": {
    "paths": {
      "@swifty-docs/generated/*": ["./.swifty-docs/generated/*"]
    }
  }
}
```

> **Important:** Use `/// <reference types="..." />` (not `/// <reference path="..." />`) for referencing type declarations inside `node_modules`. The `types` directive uses TypeScript's full module resolution algorithm, which correctly resolves pnpm workspace symlinks and package `exports` fields. The `path` directive performs raw filesystem path lookup and does not understand package structure or symlink resolution.

### 6. Write Markdown

````markdown
---
title: Getting Started
description: Learn how to use the framework
sidebar_position: 1
---

# Getting Started

Welcome to the documentation.

## Installation

Install via npm:

```bash
pnpm add @swifty.js/mvc
```

::: tip
Always call `registerThemeViews` before `Framework.boot()`.
:::
````

## Configuration Reference

The `DocsConfig` interface defines all configuration options:

| Field         | Type                            | Default                 | Description                                     |
| ------------- | ------------------------------- | ----------------------- | ----------------------------------------------- |
| `docs`        | `string`                        | `"docs"`                | Docs source directory, relative to project root |
| `baseUrl`     | `string`                        | `"/docs/"`              | Base URL prefix for all generated routes        |
| `routeMode`   | `"history" \| "hash"`           | `"history"`             | Routing mode, maps to `@swifty.js/mvc` Router   |
| `title`       | `string`                        | (required)              | Site title displayed in the navbar              |
| `description` | `string`                        | `""`                    | Site description for meta tags                  |
| `lang`        | `string`                        | `"en-US"`               | Language code                                   |
| `nav`         | `NavItem[]`                     | `[]`                    | Top navigation items                            |
| `sidebar`     | `Record<string, SidebarConfig>` | `{}`                    | Sidebar config per path prefix                  |
| `markdown`    | `MarkdownOptions`               | `{}`                    | Markdown processing options                     |
| `highlight`   | `HighlightOptions`              | `undefined`             | Shiki code highlighting options                 |
| `search`      | `SearchOptions`                 | `{ provider: "local" }` | Search provider configuration                   |

### NavItem

```ts
interface NavItem {
  text: string; // Display text
  link: string; // Link URL (internal or external)
  items?: NavItem[]; // Nested dropdown items
}
```

### Sidebar Configuration

Each sidebar prefix maps to either `"auto"` (filesystem-based generation) or an explicit `SidebarItem[]` array.

```ts
sidebar: {
  "/docs/guide/": "auto",        // auto-generate from directory structure
  "/docs/api/": [                 // explicit items
    { text: "Overview", link: "/docs/api/" },
    { text: "Classes", link: "/docs/api/classes" },
  ],
}
```

Auto-generated sidebars group routes by subdirectory, sort by `sidebarPosition` frontmatter (then alphabetically), and use `sidebarLabel` frontmatter for display text when provided.

### MarkdownOptions

| Field              | Type                                | Default    | Description                    |
| ------------------ | ----------------------------------- | ---------- | ------------------------------ |
| `anchor.permalink` | `boolean`                           | `true`     | Add permalink anchors to h1-h3 |
| `containers`       | `Record<string, { label: string }>` | (built-in) | Custom container labels        |

### HighlightOptions

| Field       | Type       | Default            | Description       |
| ----------- | ---------- | ------------------ | ----------------- |
| `theme`     | `string`   | `"github-dark"`    | Shiki theme name  |
| `languages` | `string[]` | (common web langs) | Languages to load |

When `highlight` is configured, the Shiki highlighter is initialized as a lazy singleton on the first `.md` compilation. The WASM and TextMate grammars are loaded once and cached for all subsequent files. Languages not in the loaded list fall back to the `"text"` grammar.

### SearchOptions

| Provider      | Description                                                                                |
| ------------- | ------------------------------------------------------------------------------------------ |
| `"local"`     | Built-in search modal with substring matching and weighted scoring                         |
| `"docsearch"` | Algolia DocSearch UI widget backed by the local search index (no Algolia account required) |
| `"none"`      | Disable search entirely                                                                    |

## Frontmatter

Each `.md` file can include YAML frontmatter delimited by `---`:

```yaml
---
title: Page Title
description: Page description for SEO and search
sidebar_position: 1
sidebar_label: Custom Label
draft: false
---
```

| Field              | Type      | Description                                                                                                                                               |
| ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`            | `string`  | Page title. Falls back to first `# heading`, then filename-derived title                                                                                  |
| `description`      | `string`  | Page description for meta tags and search index. Falls back to filename-derived title                                                                     |
| `sidebar_position` | `number`  | Sort order in auto-generated sidebar (lower = higher). Uses all-or-nothing rule: if any page in a group lacks this field, all pages sort by filename only |
| `sidebar_label`    | `string`  | Override sidebar display text                                                                                                                             |
| `draft`            | `boolean` | When `true`, excluded from production builds via `excludeDrafts` option                                                                                   |

### Title Resolution Chain

The page title is resolved in this priority order:

1. `title` field in frontmatter
2. First `# heading` in the markdown body (excluding headings inside fenced code blocks)
3. Filename-derived title: `index.md` uses the parent directory name (title-cased), other files use the stem with dashes replaced by spaces

The root `index.md` (at the docs directory root) falls back to `"Home"`.

## Markdown Extensions

### Heading Anchors

All h1, h2, and h3 headings automatically receive:

- An `id` attribute derived from the heading text via `slugify()` (lowercase, strip non-word chars, dashes for spaces)
- A `#` permalink link injected as a child anchor element (when `markdown.anchor.permalink` is not `false`)
- A `scroll-mt-20` CSS class to offset the sticky navbar height during scroll-to-anchor
- Slug deduplication: if two headings produce the same slug, the second gets a `-1` suffix, the third `-2`, etc.

### Internal Links

Links starting with `/` or `#` are automatically tagged with `data-swifty-nav="true"` for SPA navigation interception by the swifty-mvc Router. External links receive `target="_blank"` and `rel="noopener noreferrer"`.

### Table of Contents

Insert `[[toc]]` anywhere in your markdown to render a table of contents inline. The `[[toc]]` marker is compiled to `<div v-swifty="theme/toc"></div>`, which mounts the TOC theme View at that position.

### Admonition Containers

Four container types are supported via the `:::` fenced syntax:

```markdown
::: tip
Useful advice displayed in an info-styled alert.
:::

::: warning
Cautionary note displayed in a warning-styled alert.
:::

::: danger
Critical warning displayed in an error-styled alert.
:::

::: details Click to expand
Hidden content revealed on click.
:::
```

Containers are rendered as DaisyUI `alert` components:

- `tip` maps to `alert-info`
- `warning` maps to `alert-warning`
- `danger` maps to `alert-error`
- `details` maps to a `<details>` element with `<summary>`, styled as `alert-neutral`

Container labels can be customized via `markdown.containers` config.

### Code Blocks

Fenced code blocks with a language identifier are syntax-highlighted when Shiki is configured:

````markdown
```typescript
const x: number = 42;
```
````

Without Shiki, code blocks fall back to a styled `<pre>` with `bg-neutral text-neutral-content rounded-box p-4 overflow-x-auto` classes.

## Theme System

The theme consists of four View factories, each paired with an HTML template. The `registerThemeViews()` convenience function registers all of them in a single call.

### View Factories

| Factory                          | View ID             | Purpose                                               |
| -------------------------------- | ------------------- | ----------------------------------------------------- |
| `createDocsLayoutView(template)` | `theme/docs-layout` | Root layout: navbar, three-column body, prev/next nav |
| `createSidebarView(template)`    | `theme/sidebar`     | Left sidebar navigation tree                          |
| `createTocView(template)`        | `theme/toc`         | Right-side heading outline with smooth scroll         |
| `createSearchView(template)`     | `theme/search`      | Search modal (local provider only)                    |

### registerThemeViews

The recommended way to set up the theme:

```ts
// No need to import View — registerThemeViews uses defineView internally
import { registerThemeViews } from "@swifty.js/docs/theme";

registerThemeViews();
```

This function imports all `.html` templates internally (compiled by `swiftyMvcPlugin` at build time), creates the view classes, and calls `registerViewClass()` for each. Consumers never need to import `.html` files or call `registerViewClass` manually.

### Layout Structure

```
docs-layout (root)
+-- Navbar (sticky top, backdrop-blur)
|   +-- Site title
|   +-- Nav items (horizontal menu, hidden on mobile)
|   +-- Search (local button or DocSearch container)
+-- Flex container (max-w-7xl, centered)
|   +-- Sidebar (w-64, left, visible on lg+)
|   +-- Content (flex-1, prose max-w-none)
|   +-- TOC (w-56, right, visible on xl+)
+-- Prev/Next navigation (bottom of content)
+-- Search modal (conditional, local provider only)
```

The layout view stays mounted across all `/docs/*` routes. When the user navigates, `observeLocation` triggers an async `render()` that calls `loadContent(path)` to fetch the new page's compiled markdown, then updates the view data. The compiled markdown HTML is rendered inline via `contentHtml`.

### Responsive Behavior

- Below `lg` breakpoint (1024px): sidebar is hidden
- Below `xl` breakpoint (1280px): TOC is hidden
- Nav items hidden on small screens, visible from `md` breakpoint
- Search button always visible; DocSearch provides its own keyboard shortcut (Ctrl+K)

### Icons

Theme views use `lucide-static` for SVG icons, imported as raw strings via Vite's `?raw` suffix. Icons are centralized in `src/theme/icons.ts` and set in `init()` (not `assign()`) since they are static data. Templates render icons with the raw output operator:

```html
<span class="h-5 w-5 [&>svg]:h-full [&>svg]:w-full"> {{!icons.search}} </span>
```

The wrapper `<span>` controls sizing. Tailwind utilities `[&>svg]:w-full [&>svg]:h-full` force the child `<svg>` to fill the container. Icons inherit `currentColor` from their parent, so color is controlled via standard CSS utilities (e.g., `text-primary`).

## Search System

### Local Search (provider: "local")

The built-in search is powered by [MiniSearch](https://github.com/lucaong/minisearch) (the same engine used by VitePress). It provides a modal dialog with:

- Prefix matching: typing "conf" matches "configuration"
- Fuzzy matching: tolerates typos (fuzzy factor 0.2)
- Field-weighted scoring: title matches boosted 2x, headings 1.5x, excerpt 1x
- Highlighted results: matched terms wrapped in `<mark>` in both title and excerpt
- Lazy index construction: the MiniSearch instance is built on first query from the build-time `searchIndex`, then reused to subsequent searches
- Open/close state driven by `State.searchOpen` so the navbar button can toggle the modal without a direct view reference

### DocSearch Integration (provider: "docsearch")

The DocSearch provider renders Algolia's styled search button and modal UI, but queries the local search index instead of Algolia's hosted API. No Algolia account or credentials are required.

Implementation: `createLocalSearchClient(index)` returns an Algolia-compatible search client with a `search(requests)` method. The client is injected into the DocSearch widget via `transformSearchClient`, replacing the default Algolia API call. The search client converts `SearchEntry[]` results into DocSearch's expected hit format with `hierarchy.lvl0` (page title), `hierarchy.lvl1` (first heading), `url`, `_highlightResult`, and `_snippetResult` fields.

The DocSearch widget provides:

- Styled search button in the navbar
- Modal with keyboard shortcut (Ctrl+K / Cmd+K)
- Recent searches (stored in localStorage)
- Result highlighting

## Bundler Plugins

### Vite Plugin

```ts
import { swiftyDocsPlugin } from "@swifty.js/docs/vite";

export default defineConfig({
  plugins: [swiftyDocsPlugin({ config: docsConfig, debug: false })],
});
```

The plugin runs in the `pre` enforcement phase. Its `resolveId` hook appends a `?swifty-docs` suffix to `.md` imports so Vite does not treat them as static assets. Its `load` hook reads the raw markdown, compiles it through `compileMarkdown()`, and returns the JS module string.

Options: `{ config: DocsConfig, debug?: boolean }`.

### Webpack Plugin + Loader

```ts
import { SwiftyDocsPlugin } from "@swifty.js/docs/webpack";

export default {
  plugins: [new SwiftyDocsPlugin({ config: docsConfig })],
};
```

`SwiftyDocsPlugin` pushes a loader rule onto `compiler.options.module.rules` at the `compilation` hook. The loader (`swiftyDocsLoader`) uses Webpack 5's `this.callback()` pattern for async result delivery. It self-references via `__filename` to resolve the loader path.

Options: `{ config: DocsConfig, test?: RegExp, exclude?: RegExp }`. Defaults: `test: /\.md$/`, `exclude: /node_modules/`.

### Rspack Plugin + Loader

```ts
import { SwiftyDocsPlugin } from "@swifty.js/docs/rspack";

export default {
  plugins: [new SwiftyDocsPlugin({ config: docsConfig })],
};
```

Same API as Webpack, but the loader returns `Promise<string>` directly (Rspack async loader convention, no `this.callback()`).

## Package Exports

| Sub-path                   | Description                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `@swifty.js/docs`          | Main barrel: all types, scanner, sidebar, markdown, compiler, runtime, theme factories                          |
| `@swifty.js/docs/compiler` | `compileMarkdown()` + `CompileMarkdownOptions` type                                                             |
| `@swifty.js/docs/vite`     | `swiftyDocsPlugin()` Vite plugin + build-time utility re-exports                                                |
| `@swifty.js/docs/webpack`  | `SwiftyDocsPlugin` class + `swiftyDocsLoader()` function                                                        |
| `@swifty.js/docs/rspack`   | `SwiftyDocsPlugin` class + `swiftyDocsLoader()` async function                                                  |
| `@swifty.js/docs/runtime`  | `slugify()` (browser-safe, no build deps)                                                                       |
| `@swifty.js/docs/theme`    | `registerThemeViews()` + 4 view factories + `createLocalSearchClient` + `icons`                                 |
| `@swifty.js/docs/client`   | Types-only: ambient module declarations for `@swifty-docs/generated` and `*.html` (for `/// <reference types>`) |

The `/vite`, `/webpack`, and `/rspack` sub-paths re-export build-time utilities (`scanDocsDir`, `generateSidebar`, `defineConfig`) to avoid pulling in the main entry's `lucide-static` SVG `?raw` imports, which are not valid in Node.js contexts.

The `/client` sub-path is types-only (no runtime code). It ships `client.d.ts` which provides `declare module "@swifty-docs/generated"` and `declare module "*.html"` ambient declarations. Consumer projects reference it via `/// <reference types="@swifty.js/docs/client" />` in their `shims.d.ts`.

## API Reference

### `defineConfig(config: DocsConfig, projectRoot?: string): DocsConfig`

Type-safe configuration helper. Returns the config unchanged while triggering route generation. The optional `projectRoot` parameter controls path resolution for the `docs` directory and the generated output. Defaults to `process.cwd()`.

### `registerThemeViews(options?: RegisterThemeViewsOptions): void`

Registers all four theme views (layout, sidebar, TOC, search) with the swifty-mvc view registry. Imports the `.html` templates internally so consumers don't need to handle them.

### `scanDocsDir(docsDir: string, baseUrl: string, options?: { excludeDrafts?: boolean }): DocsRoute[]`

Recursively scans a docs directory and returns route entries. Skips entries starting with `_` or `.`, plus `node_modules`, `__tests__`, `__fixtures__`, `.git`, `.vitepress`, `.swifty-docs`, and `dist`. `index.md` maps to the directory root without trailing `/`.

### `generateSidebar(routes: DocsRoute[], prefix: string): SidebarItem[]`

Auto-generates sidebar items for routes under a given prefix. Groups by subdirectory, sorts by `sidebarPosition` then title, produces a `SidebarItem[]` tree.

### `compileMarkdown(source: string, options: CompileMarkdownOptions): Promise<string>`

Compiles a `.md` source string into a JS module string that exports `pageData` and `contentHtml`. The pipeline: extract frontmatter, create parser, optionally initialize Shiki, parse and render to HTML, build page metadata, emit JS module.

### `slugify(text: string): string`

Converts text to a URL-safe slug: lowercase, strip non-word chars (except spaces and dashes), replace whitespace with dashes, collapse consecutive dashes.

### Theme View Factories

```ts
createDocsLayoutView(template); // root layout
createSidebarView(template); // sidebar navigation
createTocView(template); // heading outline
createSearchView(template); // search modal
createLocalSearchClient(index); // Algolia-compatible search client
```

## Type Definitions

All types are exported from the main entry and available for import:

```ts
import type {
  DocsConfig,
  NavItem,
  SidebarConfig,
  SidebarItem,
  MarkdownOptions,
  HighlightOptions,
  SearchOptions,
  PageData,
  HeadingInfo,
  DocsRoute,
  SearchEntry,
  FrontmatterResult,
  CompileMarkdownOptions,
} from "@swifty.js/docs";
```

## Generated Output

`defineConfig()` writes a generated module to `.swifty-docs/generated/index.js` (a dot directory at project root, similar to VitePress's `.vitepress/` and Docusaurus's `.docusaurus/`). This directory should be added to `.gitignore`.

The generated module exports:

- `loadContent(path)` -- dynamically imports the compiled `.md` module for a given route path, returns `{ pageData, contentHtml }` or `null`
- `routes: Record<string, string>` -- maps every docs path to the layout view `"theme/docs-layout"`
- `docsConfig` -- the runtime site configuration (title, description, lang, nav, sidebar)
- `getSearchIndex()` -- lazily builds the search index by loading all non-virtual `.md` modules on first call (filtering through `_searchablePaths` to exclude virtual index routes), returns `SearchEntry[]`

```ts
// vite.config.ts
resolve: {
  alias: {
    "@swifty-docs/generated": resolve(PKG_DIR, ".swifty-docs/generated"),
  },
}

// boot.ts
import { routes, docsConfig, loadContent, getSearchIndex } from "@swifty-docs/generated";
```

Type declarations for `@swifty-docs/generated` are provided by the `@swifty.js/docs/client` package export via `/// <reference types>` directive -- no generated `.d.ts` file is needed.

## Dependencies

**Runtime:**

- `@docsearch/css` ^4.6.3 -- DocSearch widget styles (dynamic import, only for `"docsearch"` provider)
- `@docsearch/js` ^4.6.3 -- DocSearch widget (dynamic import, only for `"docsearch"` provider)
- `@swifty.js/mvc` ^0.0.17 -- MVC framework (re-exported by `@swifty.js/docs` so consumers do not need to install it separately)
- `ejs` ^3.1.10 -- Template engine for generated module output
- `js-yaml` ^5.2.0 -- YAML frontmatter parsing
- `lucide-static` ^1.21.0 -- SVG icons via `?raw` import
- `markdown-it` ^14.2.0 -- Markdown parser
- `markdown-it-container` ^4.0.0 -- Admonition container syntax
- `minisearch` ^7.2.0 -- Full-text search engine (same as VitePress)
- `shiki` ^4.3.0 -- Code syntax highlighting (dynamic import, lazy singleton)
- `zod` ^4.4.3 -- Runtime schema validation for State-injected values

**Peer:**

- `@tailwindcss/typography` ^0.5.0 -- `prose` class for markdown content
- `daisyui` ^5.0.0 -- UI component classes
- `tailwindcss` ^4.0.0 -- Utility-first CSS

## License

MIT
