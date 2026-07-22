---
title: swifty-docs
description: A static site generator built on swifty-mvc, designed to transform Markdown into fast, searchable documentation sites with minimal configuration.
---

# swifty-docs

A static site generator built on the swifty-mvc MVC framework that transforms Markdown files into fast, searchable documentation sites with minimal configuration.

## Why swifty-docs

Documentation tooling often forces a choice between framework flexibility and developer experience. VitePress is tightly coupled to Vue and Vite. Docusaurus is locked to React and Webpack. swifty-docs takes a different approach: it runs on swifty-mvc's framework-agnostic MVC architecture and supports three bundlers — Vite, Webpack, and Rspack — so you can integrate it into existing projects without rewriting your build pipeline.

The result is a documentation generator that compiles Markdown at build time, ships zero runtime parsing overhead to the browser, and provides the same quality of local search, syntax highlighting, and navigation that you would expect from a first-party documentation tool.

## Key Features

### Three-Bundler Support

Use Vite, Webpack, or Rspack as your build tool. swifty-docs provides a dedicated plugin for each bundler, imported from `swifty-docs/vite`, `swifty-docs/webpack`, or `swifty-docs/rspack`. Switching bundlers requires changing a single import — no configuration rewrites.

### Compile-Time Markdown Processing

Every `.md` file is compiled to a JavaScript module at build time. The compiled module exports `pageData` (metadata extracted from frontmatter) and `contentHtml` (rendered HTML). No Markdown parsing occurs in the browser, keeping runtime payloads small and page loads fast.

### Shiki Syntax Highlighting

Code blocks are highlighted by Shiki using TextMate grammars and a lazy WASM singleton. The highlighter initializes on first compilation and caches for all subsequent files. Languages outside the configured list fall back to the `text` grammar, avoiding unnecessary grammar downloads.

### Built-in Full-Text Search

Two search providers ship out of the box. The local provider uses MiniSearch — the same engine as VitePress — with prefix matching, fuzzy matching, field-weighted scoring, and result highlighting. The DocSearch provider renders Algolia's styled modal UI but queries the local index, requiring no external account or credentials.

### Auto-Generated Sidebar

Sidebar trees are generated from the filesystem structure. Routes are grouped by subdirectory, sorted by `sidebar_position` frontmatter with alphabetical fallback, and labeled by `sidebar_label` frontmatter or derived from filenames. Manual configuration is available via explicit `SidebarItem[]` arrays per path prefix.

### swifty-mvc MVC Runtime

The runtime uses swifty-mvc's view system, state management, and router. Views are defined with `defineView()`, composed into a documentation layout, and driven by a central store. Route changes trigger content loading without unmounting the layout, providing instant page transitions.

### Responsive Three-Column Layout

The default theme renders a sticky navbar, a left sidebar for navigation, a center content area with prose styling, and a right-side table of contents with IntersectionObserver-based heading tracking. The sidebar appears at the `lg` breakpoint (1024px), the TOC at the `xl` breakpoint (1280px), and the layout collapses gracefully on smaller screens.

### TypeScript-First Configuration

All configuration, page data, and theme APIs are fully typed. A `swifty-docs/client` types-only export provides ambient module declarations for the generated route map and content loader, referenced via `/// <reference types="swifty-docs/client" />` in consumer projects.

## Quick Start

Install swifty-docs and its peer dependencies:

```sh
pnpm add -D swifty-docs swifty-mvc tailwindcss daisyui @tailwindcss/typography
```

Create a configuration file `swifty-docs.config.ts`:

```ts
import { defineConfig } from "swifty-docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/",
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

Set up the boot file `app/boot.ts`:

```ts
import {
  Framework,
  State,
  registerThemeViews,
  type FrameworkConfig,
} from "swifty-docs";

import {
  routes,
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@swifty-docs/generated";

import "./main.css";

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

registerThemeViews({ vdom: config.vdom });
State.set({ docsConfig, loadContent, getSearchIndex });
Framework.boot(config);
```

Start the dev server:

```sh
pnpm exec vite
```

Your documentation site is now running at `http://localhost:3200`. Write Markdown files in the `docs/` directory and they will appear instantly with hot module replacement.

## Architecture

swifty-docs operates in three distinct phases:

```
Configuration Phase (defineConfig)
  Scans docs/ directory
  Extracts frontmatter + headings
  Generates sidebar data
  Writes .swifty-docs/generated/index.js
         |
         v
Compilation Phase (bundler plugin)
  Intercepts .md imports
  Extracts YAML frontmatter
  Compiles Markdown via markdown-it
  Highlights code via Shiki (lazy)
  Emits JS module: { pageData, contentHtml }
         |
         v
Runtime Phase (swifty-mvc Framework)
  Boots with generated routes
  Layout view stays mounted
  loadContent() fetches page modules
  Four theme views render the UI
  Search initializes lazily on first query
```

The configuration phase runs once when the config file is evaluated. The compilation phase runs during `vite build` or on-demand during `vite dev`. The runtime phase runs in the browser.

## Documentation

### Guide

- [What is swifty-docs](./guide/what-is-swifty-docs) — framework overview, use cases, and comparison with VitePress and Docusaurus
- [Getting Started](./guide/getting-started) — installation, project setup, configuration, and first dev server
- [Configuration](./guide/configuration) — complete `defineConfig` reference with every option explained
- [Routing](./guide/routing) — file scanning, route generation, virtual index routes, and sorting
- [Sidebar](./guide/sidebar) — auto-generated and manually configured sidebar trees
- [Markdown Features](./guide/markdown) — frontmatter, custom containers, TOC directives, and link handling
- [Theme System](./guide/theme) — default theme layout, view registration, and responsive behavior
- [Search](./guide/search) — local MiniSearch provider, DocSearch UI, and index construction
- [Asset Handling](./guide/asset-handling) — static assets, public directory, and base URL rewriting
- [Bundler Integration](./guide/bundler-integration) — Vite, Webpack, and Rspack plugin details

### Reference

- [Site Config](./reference/site-config) — `DocsConfig` interface and all configuration fields
- [Frontmatter Config](./reference/frontmatter-config) — YAML frontmatter fields and defaults
- [Theme Config](./reference/theme-config) — theme registration options and view customization
- [Runtime API](./reference/runtime-api) — exported functions, types, and State integration
- [Compiler API](./reference/compiler-api) — `compileMarkdown`, Shiki integration, and plugin internals
- [CLI](./reference/cli) — command-line interface for scaffolding and build tasks
- [Utilities](./reference/utilities) -- internal utility functions for slug generation, title derivation, heading extraction, and route sorting

## Comparison

| Aspect        | swifty-docs                                 | VitePress                       | Docusaurus                           |
| ------------- | ------------------------------------------- | ------------------------------- | ------------------------------------ |
| Framework     | swifty-mvc (MVC)                            | Vue 3                           | React                                |
| Bundler       | Vite, Webpack, Rspack                       | Vite only                       | Webpack only                         |
| Search        | MiniSearch or DocSearch UI with local index | MiniSearch or Algolia DocSearch | Algolia DocSearch (requires account) |
| Highlighting  | Shiki (lazy WASM)                           | Shiki                           | Prism.js                             |
| Templates     | swifty-mvc templates                        | Vue SFC                         | MDX + React                          |
| Configuration | TypeScript `defineConfig()`                 | TypeScript `defineConfig()`     | JavaScript config file               |
| Output        | `.swifty-docs/generated/`                   | `.vitepress/cache/`             | `.docusaurus/`                       |

The primary advantage of swifty-docs is bundler flexibility. Projects already using swifty-mvc get a documentation generator that shares the same runtime, view system, and state management — no framework mismatch. Projects that need Webpack or Rspack support get a VitePress-quality experience without being locked into Vite.
