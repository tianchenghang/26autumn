# What is swifty-docs

swifty-docs is a static site generator built on the swifty-mvc MVC framework, designed to transform Markdown files into fast, searchable documentation sites with minimal configuration.

## Use Cases

swifty-docs powers documentation sites for libraries and frameworks, technical blogs that require code highlighting and structured navigation, and internal knowledge bases where teams need searchable, version-controlled documentation. It serves the same role for swifty-mvc that VitePress serves for Vue or Docusaurus serves for React, providing an opinionated documentation experience on top of a general-purpose framework.

## Developer Experience

swifty-docs prioritizes a familiar developer workflow built around Markdown authoring and declarative configuration.

### Markdown-First Authoring

Write documentation in standard Markdown with YAML frontmatter for metadata. The compilation pipeline extracts titles, descriptions, sidebar positioning, and draft status from frontmatter, then processes the body through markdown-it with four custom plugins: anchors for heading permalinks, TOC extraction for page outlines, containers for admonitions (tip, warning, danger, details), and code blocks for syntax highlighting.

### swifty-mvc MVC Architecture

The runtime uses swifty-mvc's view system, state management, and router. Views are defined with `defineView()`, registered with `registerViewClass()`, and composed into a documentation layout. State flows through a central store, and the router supports history mode. This is the same MVC pattern used by the underlying framework, not a documentation-specific abstraction.

### Template Syntax

Theme views use swifty-mvc's template syntax with `{{=variable}}` for text interpolation, `{{!raw}}` for unescaped HTML, and `{{if condition}}` for conditional rendering. Templates are compiled at build time by the bundler plugin. The theme ships four view factories (layout, sidebar, TOC, search) that consumers register in a single call via `registerThemeViews()`.

### Built-in Search

Two search providers ship out of the box. The local provider uses MiniSearch, the same engine as VitePress, with prefix matching, fuzzy matching, field-weighted scoring, and result highlighting. The DocSearch provider renders Algolia's styled modal UI but queries the local index, requiring no external account or credentials. Search is lazily initialized on first query to avoid loading the index until needed.

### Auto-Generated Sidebar

Sidebar trees are generated from the filesystem structure. Routes are grouped by subdirectory, sorted by `sidebar_position` frontmatter (with alphabetical fallback), and labeled by `sidebar_label` frontmatter or derived from filenames. Manual sidebar configuration is available via explicit `SidebarItem[]` arrays per path prefix.

### TypeScript Integration

Full TypeScript support is provided through exported type definitions for all configuration options, page data structures, and theme APIs. A `swifty-docs/client` types-only export provides ambient module declarations for the generated route map and content loader, referenced via `/// <reference types="swifty-docs/client" />` in consumer projects. Note that this types-only export also pulls in Vite client type references via `/// <reference types="vite/client" />`, so it is intended for Vite-based projects.

## Performance

swifty-docs optimizes for fast page loads through compile-time processing and lazy runtime initialization.

### Compile-Time Markdown Compilation

Each `.md` file is compiled to a JavaScript module at build time by the bundler plugin (Vite, Webpack, or Rspack). The compiled module exports `pageData` (metadata) and `contentHtml` (rendered HTML). No Markdown parsing occurs in the browser.

### Lazy Shiki Initialization

When syntax highlighting is configured, the Shiki highlighter initializes as a lazy singleton on the first `.md` compilation. The WASM runtime and TextMate grammars load once and cache for all subsequent files. Languages not in the configured list fall back to the `text` grammar, avoiding unnecessary grammar loads.

### Client-Side Search Index

The search index is built at compile time from page titles, headings, and excerpts, then loaded lazily in the browser on first search query. The index uses `SearchEntry[]` shape with `{title, link, headings[], excerpt}` per page. MiniSearch constructs the in-memory index from this data, avoiding the overhead of server-side search infrastructure.

### Progressive Web App

swifty-docs integrates `vite-plugin-pwa` for offline support and installability. Service worker registration and asset caching are configured at the bundler level, not within swifty-docs itself, keeping the documentation generator focused on content compilation.

## Three-Phase Architecture

swifty-docs operates in three distinct phases that separate build-time concerns from runtime execution.

### Phase 1: Configuration

`defineConfig()` scans the docs directory, extracts frontmatter and headings from every `.md` file, auto-generates sidebar trees per path prefix, and writes a generated module to `.swifty-docs/generated/index.js`. This module provides:

- `loadContent(path)` for dynamic content loading
- `routes` mapping paths to view IDs
- `docsConfig` with runtime site configuration
- `getSearchIndex()` for lazy search index construction

### Phase 2: Compilation

The bundler plugin intercepts `.md` imports and compiles them through `compileMarkdown()`. The pipeline extracts YAML frontmatter, initializes the Shiki highlighter on first call, parses the Markdown body with markdown-it and its four plugins, renders to HTML, builds page metadata, and emits a JavaScript module string exporting `pageData` and `contentHtml`.

### Phase 3: Runtime

The swifty-mvc Framework boots with the generated routes. The layout view stays mounted across navigation and asynchronously loads page content via `loadContent()`. Four theme views (layout, sidebar, TOC, search) render the documentation UI. Search initializes lazily on first query. Route changes trigger `observeLocation`, which calls `render()` to load new content without unmounting the layout.

## Layout Structure

The default theme renders a three-column responsive layout with a sticky navbar.

````
+------------------------------------------------------------------+
|  Navbar (sticky top, backdrop-blur)                              |
|  +-------------+------------------------+----------------------+ |
|  | Site Title  | Nav Items (horizontal) | Search Button        | |
|  +-------------+------------------------+----------------------+ |
+------------------------------------------------------------------+
|  Sidebar    |  Main Content            |  Table of Contents    |
|  (w-56)     |  (flex-1, prose)         |  (w-48)               |
|             |                          |                        |
|  - Guide    |  # Getting Started       |  On this page         |
|    - Intro  |                          |  - Installation       |
|    - Setup  |  Welcome to the docs.    |  - Configuration      |
|  - API      |                          |  - Usage              |
|    - Core   |  ## Installation         |                        |
|    - Theme  |                          |                        |
|             |  ```bash                 |                        |
|             |  pnpm add swifty-docs     |                        |
|             |  ```                     |                        |
|             |                          |                        |
|             |  ::: tip                 |                        |
|             |  Always call register... |                        |
|             |  :::                     |                        |
+------------------------------------------------------------------+
|  Prev / Next Navigation                                          |
+------------------------------------------------------------------+
````

The sidebar is visible at the `lg` breakpoint (1024px) and above. The TOC is visible at the `xl` breakpoint (1280px) and above. Below these thresholds, the layout collapses to a single-column content view. Nav items hide on small screens and appear from the `md` breakpoint. The search button remains visible at all sizes.

## Comparison with VitePress and Docusaurus

swifty-docs, VitePress, and Docusaurus share the goal of turning Markdown into documentation sites, but differ in their underlying frameworks and architectural choices.

| Aspect              | swifty-docs                                         | VitePress                               | Docusaurus                           |
| ------------------- | --------------------------------------------------- | --------------------------------------- | ------------------------------------ |
| Framework           | swifty-mvc (MVC)                                    | Vue 3                                   | React                                |
| Bundler             | Vite, Webpack, Rspack                               | Vite only                               | Webpack only                         |
| Search              | MiniSearch (local) or DocSearch UI with local index | MiniSearch (local) or Algolia DocSearch | Algolia DocSearch (requires account) |
| Syntax Highlighting | Shiki (lazy WASM singleton)                         | Shiki                                   | Prism.js                             |
| Template Syntax     | swifty-mvc templates                                | Vue SFC                                 | MDX + React components               |
| Configuration       | TypeScript `defineConfig()`                         | TypeScript `defineConfig()`             | JavaScript `docusaurus.config.js`    |
| Generated Output    | `.swifty-docs/generated/`                           | `.vitepress/cache/`                     | `.docusaurus/`                       |
| Routing             | History mode only                                   | History mode only                       | History mode only                    |
| Layout              | Three-column with sticky navbar                     | Three-column with sticky navbar         | Three-column with sticky navbar      |

The primary distinction is the underlying framework. VitePress is tightly coupled to Vue and Vite, Docusaurus to React and Webpack. swifty-docs uses swifty-mvc's MVC pattern and supports three bundlers (Vite, Webpack, Rspack), making it suitable for projects already using swifty-mvc or requiring bundler flexibility. The search system offers VitePress-quality local search without external dependencies, plus an optional DocSearch UI that queries the local index rather than requiring Algolia credentials.
