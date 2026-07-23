# @swifty.js/docs

A documentation site generator with a SolidJS + shadcn-style theme.

If SolidJS is to React, then `@swifty.js/docs` is to Docusaurus or VitePress -- an out-of-the-box documentation site experience: a `markdown-it` build pipeline that compiles your `.md` files, paired with a polished, accessible SolidJS theme (shadcn-style primitives on Tailwind CSS v4) that renders them at runtime.

## Features

- File-based routing: recursively scans a `docs/` directory and generates SPA routes
- SolidJS runtime: a single catch-all route keeps the layout mounted; only the content column swaps on navigation (`@solidjs/router`, history mode)
- Markdown compilation pipeline: `markdown-it` with four custom plugins (anchors, TOC, containers, code blocks)
- YAML frontmatter: metadata extraction via `js-yaml` for page titles, descriptions, sidebar positioning, and draft control
- Code syntax highlighting: Shiki with lazy WASM initialization, singleton caching, and dual-theme output (light + dark tokens that switch with the color scheme, no rebuild)
- Code-block chrome: language chip, hover border, and a copy-to-clipboard button on every fence
- Admonition containers: `::: tip`, `::: warning`, `::: danger`, `::: details` rendered as themed callouts with inline SVG glyphs
- Auto-generated sidebar: directory-structure-based navigation with `sidebarPosition` and `sidebarLabel` frontmatter overrides, collapsible groups, and active-item tracking
- Three search providers: a MiniSearch-powered command palette (same engine as VitePress) with keyboard navigation, Algolia DocSearch UI backed by the local index (no account required), or disabled
- Table of contents: per-page heading outline with an IntersectionObserver scroll-spy and a springing active marker
- Light/dark theme: shadcn-style semantic tokens, a no-FOUC inline bootstrap script, and `localStorage` persistence
- Responsive three-column layout: sticky frosted navbar, left sidebar rail, prose column, right TOC rail, and a slide-in mobile drawer
- Accessible primitives: shadcn-style components built on `@kobalte/core` (dialog, focus management, ARIA)
- Three bundler integrations: Vite, Webpack, and Rspack / Rsbuild
- Zero-config boot: `defineConfig()` auto-generates routes, sidebars, and the lazy search index into `.swifty-docs/generated/`
- Dual-format library build: ships ESM + CJS with full TypeScript declarations

## Architecture

`@swifty.js/docs` operates in three phases:

**Phase 1 -- Configuration (build startup).** `defineConfig()` scans the docs directory, extracts frontmatter and headings from every `.md` file, auto-generates sidebar trees per path prefix, and writes a generated module to `.swifty-docs/generated/index.js`. This module provides dynamic content loaders, a route map, runtime site configuration, and a lazy search index builder.

**Phase 2 -- Compilation (bundler plugin).** Each `.md` import is intercepted by the bundler plugin (`swiftyDocsPlugin` for Vite, `SwiftyDocsPlugin` for Webpack/Rspack) and compiled through `compileMarkdown()`. The pipeline extracts YAML frontmatter, initializes the Shiki highlighter on first call (async singleton), parses the markdown body with `markdown-it` plus four custom plugins, renders to HTML, builds page metadata, and emits a JS module that exports `pageData` and `contentHtml`.

**Phase 3 -- Runtime (browser).** A SolidJS app mounts `<DocsProvider>` (which validates the generated config/loader at the boundary) around a `<Router>` with a single catch-all route rendering `<DocsLayout>`. The layout stays mounted across navigation and loads each page's content through a Solid `createResource` over the route path. Theme components (`Navbar`, `Sidebar`, `Toc`, `SearchDialog`, `ContentRenderer`, `PrevNext`) render the documentation UI from fine-grained signals; the build-time `contentHtml` is injected into the article element and wired up for SPA links, inline `[[toc]]` mounts, and code-block copy buttons. Search is lazily built on first query.

```
swifty-docs.config.ts          Bundler Plugin              Browser Runtime
       |                            |                          |
  defineConfig()              compileMarkdown()          render(<DocsProvider>)
       |                            |                          |
  scanDocsDir()               extractFrontmatter         <Router> + DocsLayout
  generateSidebar()           createParser()             (single catch-all route)
       |                      getHighlighter()                 |
       |                            |                    createResource(path)
  .swifty-docs/generated/        JS module string          -> loadContent()
  index.js                   ({pageData,                       |
                               contentHtml})             theme components
                                                         render the docs UI
```

## Quick Start

### 1. Install

```bash
pnpm add @swifty.js/docs solid-js @solidjs/router tailwindcss @tailwindcss/typography
```

`solid-js` is a **peer dependency**: the theme is precompiled against the SolidJS runtime, so your app and the theme must share a single `solid-js` instance (install it once at the app level). The theme ships its own stylesheet -- Tailwind CSS v4 with the Typography plugin, shadcn-style semantic tokens, and self-hosted variable fonts -- so your CSS entry only needs to import Tailwind, the theme stylesheet, and scan the theme for utility classes:

```css
@import "tailwindcss";
@import "@swifty.js/docs/client.css";

/* Scan the precompiled theme so its utility classes survive tree-shaking. */
@source "@swifty.js/docs/theme.js";
```

### 2. Configure

Create `swifty-docs.config.ts`:

```ts
import { defineConfig } from "@swifty.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
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
    theme: "github-light",
    darkTheme: "github-dark",
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
import tailwindcss from "@tailwindcss/vite";
import docsConfig from "./swifty-docs.config";
import { resolve } from "node:path";

const PKG_DIR = import.meta.dirname;

export default defineConfig({
  root: resolve(PKG_DIR, "app"),
  plugins: [
    // Returns [md-compiler, vite-plugin-solid] -- no separate Solid plugin needed.
    swiftyDocsPlugin({ config: docsConfig }),
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

Create `app/boot.tsx`:

```tsx
import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";
import { DocsLayout, DocsProvider } from "@swifty.js/docs";

// Auto-generated by defineConfig()
import {
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@swifty-docs/generated";

import "./main.css";

// A single catch-all route: DocsLayout stays mounted across navigation and
// only the content column swaps (it loads each page via a Solid resource).
render(
  () => (
    <DocsProvider
      config={docsConfig}
      loadContent={loadContent}
      getSearchIndex={getSearchIndex}
    >
      <Router>
        <Route path="/*all" component={DocsLayout} />
      </Router>
    </DocsProvider>
  ),
  document.getElementById("app")!,
);
```

`DocsProvider` validates the generated values with Zod at the boundary and exposes them (plus the search-dialog open state) to every theme component via context. `DocsLayout` renders the navbar, sidebar, prose column, TOC, search palette, and mobile drawer.

### 5. TypeScript Setup

Create `shims.d.ts` in your project root:

```ts
/// <reference types="@swifty.js/docs/client" />
/// <reference types="vite/client" />
```

The `/// <reference types="@swifty.js/docs/client" />` directive loads the ambient module declaration for `@swifty-docs/generated` (`docsConfig`, `loadContent`, `getSearchIndex`, `SearchEntry`), so the generated module type-checks without a committed `.d.ts` file.

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
pnpm add @swifty.js/docs
```

::: tip
Set `title` and `description` in frontmatter to control the page heading and search snippet; omit `title` to derive it from the first `# heading` or the filename.
:::
````

## Configuration Reference

The `DocsConfig` interface defines all configuration options:

| Field         | Type                            | Default                 | Description                                     |
| ------------- | ------------------------------- | ----------------------- | ----------------------------------------------- |
| `docs`        | `string`                        | `"docs"`                | Docs source directory, relative to project root |
| `baseUrl`     | `string`                        | `"/docs/"`              | Base URL prefix for all generated routes        |
| `title`       | `string`                        | (required)              | Site title displayed in the navbar              |
| `description` | `string`                        | `""`                    | Site description for meta tags                  |
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

Links starting with `/` or `#` are automatically tagged with `data-swifty-nav="true"` so the SolidJS `ContentRenderer` can intercept them for SPA navigation (anchor links smooth-scroll to the heading instead). External links receive `target="_blank"` and `rel="noopener noreferrer"`.

### Table of Contents

Insert `[[toc]]` anywhere in your markdown to render a table of contents inline. The `[[toc]]` marker is compiled to `<div data-swifty-toc></div>`, into which the `ContentRenderer` mounts an inline `Toc` component at runtime.

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

Containers are rendered as themed `.callout` components (styled by the theme stylesheet, each with an inline SVG glyph in its title):

- `tip` → `.callout-tip` (sage accent)
- `warning` → `.callout-warning` (amber accent)
- `danger` → `.callout-danger` (red accent)
- `details` → a `.callout-details` `<details>` element with a `<summary>` title and a rotating chevron

Container labels can be customized via `markdown.containers` config.

### Code Blocks

Fenced code blocks with a language identifier are syntax-highlighted when Shiki is configured:

````markdown
```typescript
const x: number = 42;
```
````

Every fence is wrapped in a `.codeblock` chrome container (language chip, hover border, copy button). With Shiki configured the inner `<pre>` is syntax-highlighted (dual-theme when `highlight.darkTheme` is set); without Shiki it falls back to a plain escaped `<pre>`.

## Theme System

The theme is a set of SolidJS components that consume the build-time `{ pageData, contentHtml }` modules. You wire it up once with `<DocsProvider>` + `<DocsLayout>` (see [Boot](#4-boot)); there is no view registry or template compilation step.

### Components

| Component         | Purpose                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `DocsProvider`    | Context root: validates the generated config/loader and holds search-dialog state  |
| `DocsLayout`      | Shell: navbar, sidebar rail, prose column, TOC rail, search palette, mobile drawer |
| `Navbar`          | Sticky frosted top bar: logo, nav items, search trigger, theme toggle              |
| `Sidebar`         | Left navigation tree with collapsible groups and active-item tracking              |
| `Toc`             | Right heading outline with IntersectionObserver scroll-spy                         |
| `ContentRenderer` | Injects `contentHtml` and wires SPA links, inline `[[toc]]`, copy buttons          |
| `SearchDialog`    | MiniSearch command palette (local provider)                                        |
| `DocSearchWidget` | Algolia DocSearch UI backed by the local index (docsearch provider)                |
| `PrevNext`        | Previous/next pager derived from sidebar order                                     |

Reusable shadcn-style primitives (`Button`, `Input`, `Kbd`, `Dialog`) live under `theme/ui` and are built on `@kobalte/core` for accessibility.

### Layout Structure

```
DocsLayout (root, mounted once)
+-- Navbar (fixed top, backdrop-blur on scroll)
|   +-- Logo (gradient mark + display wordmark)
|   +-- Nav items (horizontal, hidden below md)
|   +-- Search trigger (palette button or DocSearch container)
|   +-- Theme toggle (light/dark)
+-- Grid (max-w-[1440px], centered)
|   +-- Sidebar rail (236px, left, visible on lg+)
|   +-- Content column (prose, ContentRenderer + PrevNext)
|   +-- TOC rail (224px, right, visible on xl+)
+-- Mobile drawer (slide-in sidebar, below lg)
+-- SearchDialog (Kobalte dialog portal, local provider only)
```

The layout stays mounted across all routes. On navigation the route path changes, the `createResource` re-runs `loadContent(path)`, and only the content column re-renders; the sidebar and TOC update from the same signals.

### Responsive Behavior

- Below `lg` (1024px): the left sidebar collapses into the mobile drawer (hamburger toggle)
- Below `xl` (1280px): the right TOC rail is hidden
- Nav items are hidden below `md` (768px)
- The search trigger shows a full input on `sm+` and an icon button below it; the palette opens on click, `⌘K` / `Ctrl+K`, or `/`

### Design tokens and dark mode

The theme uses shadcn-style semantic tokens (`--background`, `--foreground`, `--primary`, `--border`, ...) defined as `oklch` custom properties on `:root` and `.dark`, mapped into the Tailwind color scale via `@theme inline`. A small inline script in `index.html` applies the persisted (or system-preferred) scheme before first paint, so there is no flash of the wrong theme; the navbar toggle persists the choice to `localStorage`.

Code blocks use Shiki's dual-theme output: each token carries `--shiki-light` / `--shiki-dark` variables with no inline color, and the stylesheet switches them under `.dark` -- so code follows the color scheme with no rebuild.

### Icons

Icons are small inline-SVG Solid components in `src/theme/icons.tsx` (stroke style, `currentColor`), so they inherit color from their parent and need no extra dependency or `?raw` import:

```tsx
import { SearchIcon } from "@swifty.js/docs";

<SearchIcon class="text-muted-foreground size-4" />;
```

## Search System

### Local Search (provider: "local")

The built-in search is powered by [MiniSearch](https://github.com/lucaong/minisearch) (the same engine used by VitePress). It provides a command palette (a `@kobalte/core` dialog) with:

- Prefix matching: typing "conf" matches "configuration"
- Fuzzy matching: tolerates typos (fuzzy factor 0.2)
- Field-weighted scoring: title matches boosted 2x, headings 1.5x, excerpt 1x
- Highlighted results: matched terms rendered as real `<mark>` elements (no `innerHTML`) in both title and excerpt
- Keyboard navigation: arrow keys move the active row, Enter opens, Esc closes
- Lazy index construction: the MiniSearch instance is built on first query from `getSearchIndex()` (which loads every page module once), then reused for subsequent searches
- Open/close driven by a Solid signal in the `DocsProvider` context, so the navbar trigger, the `⌘K` / `Ctrl+K` shortcut, and the `/` key all toggle the same palette without direct component references

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

The plugin returns a two-plugin array: the `swifty-docs` markdown compiler and `vite-plugin-solid` (which compiles the theme's JSX). Its `resolveId` hook runs in the `pre` enforcement phase and appends a `?swifty-docs` suffix to `.md` imports so Vite does not treat them as static assets. Its `load` hook reads the raw markdown, compiles it through `compileMarkdown()`, and returns the JS module string.

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

| Sub-path                   | Description                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@swifty.js/docs`          | Main barrel: SolidJS theme components (`DocsProvider`, `DocsLayout`, ...), primitives, types, runtime |
| `@swifty.js/docs/compiler` | `compileMarkdown()` + `CompileMarkdownOptions` type                                                   |
| `@swifty.js/docs/vite`     | `swiftyDocsPlugin()` Vite plugin + build-time utility re-exports                                      |
| `@swifty.js/docs/webpack`  | `SwiftyDocsPlugin` class + `swiftyDocsLoader()` function                                              |
| `@swifty.js/docs/rspack`   | `SwiftyDocsPlugin` class + `swiftyDocsLoader()` async function                                        |
| `@swifty.js/docs/runtime`  | `slugify()` (browser-safe, no build deps)                                                             |
| `@swifty.js/docs/theme`    | SolidJS theme components + `createLocalSearchClient` + helpers                                        |
| `@swifty.js/docs/client`   | Types-only: ambient module declaration for `@swifty-docs/generated` (for `/// <reference types>`)     |

The `/vite`, `/webpack`, and `/rspack` sub-paths re-export build-time utilities (`scanDocsDir`, `generateSidebar`, `defineConfig`) so Node.js contexts (config files, loaders) don't pull in the browser-only theme code.

The `/client` sub-path is types-only (no runtime code). It ships `client.d.ts` which provides the `declare module "@swifty-docs/generated"` ambient declaration. Consumer projects reference it via `/// <reference types="@swifty.js/docs/client" />` in their `shims.d.ts`.

## API Reference

### `defineConfig(config: DocsConfig, projectRoot?: string): DocsConfig`

Type-safe configuration helper. Returns the config unchanged while triggering route generation. The optional `projectRoot` parameter controls path resolution for the `docs` directory and the generated output. Defaults to `process.cwd()`.

### `DocsProvider(props: DocsProviderProps)`

The context root. Props: `config` (the generated `docsConfig`), `loadContent` (the generated loader), `getSearchIndex` (the generated lazy index builder). Each value is validated with Zod at the boundary; invalid values fall back to safe defaults with a console warning. Holds the search-dialog open state and exposes everything to descendants via `useDocs()`.

### `DocsLayout()`

The documentation shell. Renders the navbar, sidebar, prose column (`ContentRenderer` + `PrevNext`), TOC, search palette, and mobile drawer. Mount it on a single catch-all route; it reads the current path from `@solidjs/router` and loads content via a Solid resource.

### Other theme exports

```ts
Navbar; // top bar
Sidebar; // navigation tree
Toc; // heading outline (also mounted inline for [[toc]])
SearchDialog; // MiniSearch palette (local provider)
DocSearchWidget; // Algolia DocSearch UI (docsearch provider)
ContentRenderer; // injects contentHtml + wires links/copy buttons
PrevNext; // pager
ThemeToggle; // light/dark switch
(Button, Input, Kbd, Dialog); // shadcn-style primitives
createLocalSearchClient(index); // Algolia-compatible search client
```

### `scanDocsDir(docsDir: string, baseUrl: string, options?: { excludeDrafts?: boolean }): DocsRoute[]`

Recursively scans a docs directory and returns route entries. Skips entries starting with `_` or `.`, plus `node_modules`, `__tests__`, `__fixtures__`, `.git`, `.vitepress`, `.swifty-docs`, and `dist`. `index.md` maps to the directory root without trailing `/`.

### `generateSidebar(routes: DocsRoute[], prefix: string): SidebarItem[]`

Auto-generates sidebar items for routes under a given prefix. Groups by subdirectory, sorts by `sidebarPosition` then title, produces a `SidebarItem[]` tree.

### `compileMarkdown(source: string, options: CompileMarkdownOptions): Promise<string>`

Compiles a `.md` source string into a JS module string that exports `pageData` and `contentHtml`. The pipeline: extract frontmatter, create parser, optionally initialize Shiki, parse and render to HTML, build page metadata, emit JS module.

### `slugify(text: string): string`

Converts text to a URL-safe slug: lowercase, strip non-word chars (except spaces and dashes), replace whitespace with dashes, collapse consecutive dashes.

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
- `@fontsource-variable/bricolage-grotesque` -- display typeface (self-hosted)
- `@fontsource-variable/instrument-sans` -- body typeface (self-hosted)
- `@fontsource-variable/spline-sans-mono` -- mono typeface (self-hosted)
- `@kobalte/core` ^0.13.0 -- accessible primitives (dialog, focus management)
- `@solidjs/router` ^0.15.0 -- client-side routing
- `class-variance-authority` ^0.7.0 -- variant-driven component classes
- `clsx` ^2.1.0 -- conditional class composition
- `ejs` ^3.1.10 -- template engine for generated module output
- `js-yaml` ^5.2.0 -- YAML frontmatter parsing
- `markdown-it` ^14.2.0 -- Markdown parser
- `markdown-it-container` ^4.0.0 -- Admonition container syntax
- `minisearch` ^7.2.0 -- Full-text search engine (same as VitePress)
- `shiki` ^4.3.0 -- Code syntax highlighting (dynamic import, lazy singleton)
- `tailwind-merge` ^3.0.0 -- deduplicate conflicting Tailwind classes
- `vite-plugin-pwa` ^1.3.0 -- PWA / service-worker generation
- `vite-plugin-solid` ^2.11.0 -- SolidJS JSX compilation (bundled into the Vite plugin)
- `zod` ^4.4.3 -- Runtime schema validation of the generated config/loader at the provider boundary

**Peer:**

- `@tailwindcss/typography` ^0.5.0 -- `prose` class for markdown content
- `solid-js` ^1.8.0 -- UI runtime (shared single instance between app and theme)
- `tailwindcss` ^4.0.0 -- Utility-first CSS

## License

MIT
