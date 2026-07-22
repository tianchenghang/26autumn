---
title: API Overview
description: Overview of the Swifty Docs API — main entry, subpath exports, and utilities.
---

# API Overview {#api-overview}

Swifty Docs provides multiple entry points for different use cases. This page gives an overview of all available APIs.

## Main entry {#main-entry}

The main entry (`@swifty.js/docs`) re-exports the Swifty MVC runtime and Swifty Docs types:

```ts
import {
  Framework,
  defineView,
  State,
  Router,
  registerViewClass,
  createStore,
  computed,
  bindStore,
  createService,
  useUrlState,
} from "@swifty.js/docs";
```

These are the same APIs as [Swifty MVC](/docs/en/swifty-mvc/api-reference/framework).

### Types {#main-types}

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
  SidebarData,
  TocData,
  SearchEntry,
  FrontmatterResult,
  CompileMarkdownOptions,
} from "@swifty.js/docs";
```

### PageData {#page-data-type}

The `PageData` type represents the metadata extracted from a compiled Markdown file:

```ts
interface PageData {
  title: string;
  description?: string;
  excerpt: string;
  sidebarPosition?: number;
  sidebarLabel?: string;
  sidebarGroup?: string;
  draft?: boolean;
  headings: HeadingInfo[];
  relativePath: string;
  lastUpdated?: number;
}
```

| Field             | Type            | Description                                                                |
| ----------------- | --------------- | -------------------------------------------------------------------------- |
| `title`           | `string`        | Page title (from frontmatter, first h1, or derived from filename)          |
| `description`     | `string?`       | Meta description for SEO (from frontmatter or derived from path)           |
| `excerpt`         | `string`        | Plain-text excerpt of the page body (used for search indexing)             |
| `sidebarPosition` | `number?`       | Sort position in sidebar (from frontmatter `sidebar_position`)             |
| `sidebarLabel`    | `string?`       | Override sidebar label (from frontmatter `sidebar_label`)                  |
| `sidebarGroup`    | `string?`       | Sidebar group name for clustering pages (from frontmatter `sidebar_group`) |
| `draft`           | `boolean?`      | If true, excluded from production builds                                   |
| `headings`        | `HeadingInfo[]` | Extracted h2/h3 headings for the table of contents                         |
| `relativePath`    | `string`        | Path relative to the docs directory (e.g., `guide/config.md`)              |
| `lastUpdated`     | `number?`       | Last modified timestamp in milliseconds since epoch                        |

### HeadingInfo {#heading-info-type}

The `HeadingInfo` type describes a single heading extracted for the table of contents:

```ts
interface HeadingInfo {
  slug: string;
  text: string;
  level: number;
}
```

## Subpath exports {#subpath-exports}

### @swifty.js/docs/vite {#vite-entry}

Vite plugin and build utilities:

```ts
import {
  swiftyDocsPlugin,
  defineConfig,
  scanDocsDir,
  generateRouteMap,
  generateBootModule,
  generateSidebar,
  buildSearchIndex,
} from "@swifty.js/docs/vite";
```

### @swifty.js/docs/webpack {#webpack-entry}

Webpack loader and plugin:

```ts
import { SwiftyDocsPlugin, swiftyDocsLoader } from "@swifty.js/docs/webpack";
```

### @swifty.js/docs/rspack {#rspack-entry}

Rspack loader and plugin:

```ts
import { SwiftyDocsPlugin, swiftyDocsLoader } from "@swifty.js/docs/rspack";
```

### @swifty.js/docs/compiler {#compiler-entry}

Markdown compiler:

```ts
import { compileMarkdown } from "@swifty.js/docs/compiler";
```

### @swifty.js/docs/runtime {#runtime-entry}

Runtime utilities (browser-safe):

```ts
import { searchDocs, slugify } from "@swifty.js/docs/runtime";
```

### @swifty.js/docs/theme {#theme-entry}

Theme view factories and utilities:

```ts
import {
  registerThemeViews,
  createDocsLayoutView,
  createSidebarView,
  createTocView,
  createSearchView,
  createLocalSearchClient,
  icons,
} from "@swifty.js/docs/theme";
```

### @swifty.js/docs/client {#client-entry}

Ambient type declarations (no runtime code):

```ts
// In tsconfig.json:
{
  "compilerOptions": {
    "types": ["@swifty.js/docs/client"]
  }
}
```

Provides type declarations for:

- `@swifty-docs/generated` module
- `*.html` template imports

## Utility functions {#utility-functions}

### defineConfig {#define-config}

```ts
defineConfig(config: DocsConfig, projectRoot?: string): DocsConfig
```

Identity function that triggers route generation. See [Site Configuration](/docs/en/swifty-docs/reference/site-config).

### scanDocsDir {#scan-docs-dir}

```ts
scanDocsDir(docsDir: string, baseUrl: string, options?: { excludeDrafts?: boolean }): DocsRoute[]
```

Recursively scan the docs directory (given as an absolute path) and return route metadata. When `options.excludeDrafts` is `true`, pages with `draft: true` in frontmatter are skipped.

### generateRouteMap {#generate-route-map}

```ts
generateRouteMap(routes: DocsRoute[]): Record<string, string>
```

Generate a path-to-viewId mapping from routes.

### generateBootModule {#generate-boot-module}

```ts
generateBootModule(routes: DocsRoute[], projectRoot?: string): string
```

Generate JavaScript module source that imports all Markdown files and registers views.

### generateSidebar {#generate-sidebar}

```ts
generateSidebar(routes: DocsRoute[], prefix: string, baseUrl: string): SidebarItem[]
```

Generate a sidebar tree for a given prefix.

### buildSearchIndex {#build-search-index}

```ts
buildSearchIndex(routes: DocsRoute[]): SearchEntry[]
```

Build a search index from routes.

### searchDocs {#search-docs}

```ts
searchDocs(index: SearchEntry[], query: string, limit?: number): SearchEntry[]
```

Search the index with AND-logic substring matching.

### slugify {#slugify}

```ts
slugify(text: string): string
```

Convert text to a URL-safe slug (Unicode-aware).

### compileMarkdown {#compile-markdown}

```ts
compileMarkdown(source: string, options: CompileMarkdownOptions): Promise<string>
```

Compile Markdown source to a JavaScript module.

## Theme factories {#theme-factories}

### registerThemeViews {#register-theme-views}

```ts
registerThemeViews(options?: { vdom?: boolean }): void
```

Register all four theme views (layout, sidebar, toc, search) with the built-in templates.

When called after `Framework.boot()`, the `vdom` option is auto-detected from `Framework.getConfig('vdom')`. When called before boot, pass `{ vdom: true }` explicitly if your project uses VDOM rendering. If neither is available, it falls back to string-mode templates (`vdom: false`).

```ts
// Before Framework.boot() — pass config explicitly:
registerThemeViews({ vdom: true });
Framework.boot(config);

// After Framework.boot() — auto-detected:
Framework.boot(config);
registerThemeViews();
```

### createDocsLayoutView {#create-docs-layout-view}

```ts
createDocsLayoutView(template: ViewTemplate | VDomTemplate): ViewSetup
```

Create the layout view setup function. The `template` argument is required and must be a compiled swifty-mvc template (string-mode or VDOM-mode).

### createSidebarView {#create-sidebar-view}

```ts
createSidebarView(template: ViewTemplate | VDomTemplate): ViewSetup
```

Create the sidebar view setup function. The `template` argument is required.

### createTocView {#create-toc-view}

```ts
createTocView(template: ViewTemplate | VDomTemplate): ViewSetup
```

Create the TOC view setup function. The `template` argument is required.

### createSearchView {#create-search-view}

```ts
createSearchView(template: ViewTemplate | VDomTemplate): ViewSetup
```

Create the search view setup function. The `template` argument is required.

### createLocalSearchClient {#create-local-search-client}

```ts
createLocalSearchClient(index: SearchEntry[]): DocSearchClient
```

Create an Algolia-compatible search client using the local index.

## Next steps {#next-steps}

- [Site Configuration](/docs/en/swifty-docs/reference/site-config) — configuration reference
- [Theme Customization](/docs/en/swifty-docs/guide/theme) — using theme factories
- [Bundler Integration](/docs/en/swifty-docs/guide/bundler-integration) — plugin APIs
