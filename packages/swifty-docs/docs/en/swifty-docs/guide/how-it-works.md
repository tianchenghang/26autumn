---
title: How It Works
description: Understanding the Swifty Docs architecture and compilation pipeline.
---

# How It Works {#how-it-works}

Swifty Docs transforms Markdown files into a fast, searchable documentation site through a three-phase pipeline: configuration, compilation, and runtime.

## Phase 1: Configuration {#phase-1-configuration}

When you call `defineConfig()`, Swifty Docs performs several build-time tasks:

### Directory scanning {#directory-scanning}

The `scanDocsDir()` function recursively walks the docs directory:

```ts
scanDocsDir(docsDir: string, baseUrl: string, options?: { excludeDrafts?: boolean }): DocsRoute[]
```

```ts
scanDocsDir("/absolute/path/to/docs", "/", { excludeDrafts: true });
// Returns:
// [
//   { path: '/', viewId: 'index', filePath: 'docs/index.md' },
//   { path: '/guide/introduction', viewId: 'guide-introduction', filePath: 'docs/guide/introduction.md' },
//   { path: '/guide/getting-started', viewId: 'guide-getting-started', filePath: 'docs/guide/getting-started.md' }
// ]
```

Each `.md` file becomes a route. The path is derived from the file's location relative to the docs root:

- `docs/index.md` → `/`
- `docs/guide/introduction.md` → `/guide/introduction`

### Virtual index routes {#virtual-index-routes}

When a directory does not contain an `index.md`, `scanDocsDir` automatically generates a virtual index route for that directory. The virtual route points to the first page in the directory (ordered by `sidebar_position` or filename) and carries the `isDirectoryIndex: true` flag.

For example, if `docs/markdown/` contains `containers.md` and `highlighting.md` but no `index.md`, a virtual route is created at `/markdown` that serves the content of the first page. These virtual routes are excluded from the sidebar and the search index to avoid duplicate entries.

### Frontmatter extraction {#frontmatter-extraction}

Each Markdown file is scanned for YAML frontmatter:

```markdown
---
title: Introduction
sidebar_position: 1
---
```

The frontmatter is parsed with `js-yaml` and stored in the route metadata. Frontmatter fields like `title`, `sidebar_position`, and `sidebar_label` control navigation and display.

### Sidebar generation {#sidebar-generation}

If `sidebar` is set to `'auto'` for a prefix, Swifty Docs generates a sidebar tree from the directory structure:

```ts
generateSidebar(routes, "/guide/", "/");
// Returns:
// [
//   { text: 'Introduction', link: '/guide/introduction' },
//   { text: 'Getting Started', link: '/guide/getting-started' }
// ]
```

Files are sorted by `sidebar_position` (if present) or alphabetically by filename. Directories become collapsible groups.

### Route map generation {#route-map}

`generateRouteMap()` creates a path-to-viewId mapping:

```ts
generateRouteMap(routes);
// Returns:
// {
//   '/': 'index',
//   '/guide/introduction': 'guide-introduction',
//   '/guide/getting-started': 'guide-getting-started'
// }
```

All routes map to the same view (`theme/docs-layout`), which loads content dynamically based on the current path.

### Generated module {#generated-module}

`defineConfig()` writes `.swifty-docs/generated/index.js`, an EJS-rendered module that exports:

- `loadContent(path)` — dynamic content loader that normalizes paths and lazy-loads Markdown modules
- `routes` — path-to-viewId mapping (computed at runtime from loader keys)
- `docsConfig` — the configuration object (includes sidebar data under `docsConfig.sidebar`)
- `getSearchIndex()` — lazy search index builder that loads all modules on first call

```ts
// .swifty-docs/generated/index.js (simplified)

const loaders = {
  "/": () => import("../docs/index.md"),
  "/guide/introduction": () => import("../docs/guide/introduction.md"),
  // ...
};

export async function loadContent(path) {
  // Normalize trailing slashes and /index suffixes
  let normalized = (path || "/").replace(/\/+$/, "") || "/";
  const loader = loaders[normalized];
  if (!loader) return null;
  const mod = await loader();
  return { pageData: mod.pageData, contentHtml: mod.contentHtml };
}

export const routes = Object.fromEntries(
  Object.keys(loaders).map((k) => [k, "theme/docs-layout"]),
);

export const docsConfig = { title: "My Docs", nav: [...], sidebar: { "/guide/": [...] } };

// Searchable paths exclude virtual index routes to avoid duplicates
const _searchablePaths = new Set(["/", "/guide/introduction"]);

export async function getSearchIndex() {
  // Lazily loads all modules and extracts pageData on first call
  // ...
}
```

### Generated directory structure {#generated-directory}

The `.swifty-docs/generated/` directory is created at project root when `defineConfig()` runs. It contains:

- `index.js` — the main runtime module (described above) that the bundler resolves as `@swifty-docs/generated`

This directory is git-ignored by convention and regenerated on every build. Do not edit files inside it manually.

## Phase 2: Compilation {#phase-2-compilation}

When the bundler (Vite, Webpack, or Rspack) encounters an `import` of a `.md` file, the Swifty Docs plugin intercepts it and runs the compilation pipeline.

### Compilation pipeline {#compilation-pipeline}

```
markdown source
  -> extractFrontmatter()     // YAML frontmatter extraction
  -> createParser()           // markdown-it with plugins
  -> getHighlighter()         // Shiki singleton (conditional: only when highlight config is set)
  -> md.parse()               // tokenize Markdown
  -> renderToSwiftyTemplate()   // render to HTML
  -> buildPageData()          // extract headings, excerpt
  -> generateModule()         // emit JS module
```

Note: `getHighlighter()` only runs when `config.highlight` is defined. If no highlight configuration is provided, code blocks are rendered as plain text without syntax highlighting.

### Frontmatter extraction {#frontmatter-extraction-2}

`extractFrontmatter()` uses a regex to extract YAML frontmatter:

```markdown
---
title: Introduction
---

# Content starts here
```

The YAML is parsed with `js-yaml`. The remaining Markdown (without frontmatter) is passed to the parser.

### Markdown parsing {#markdown-parsing}

`createParser()` initializes `markdown-it` with four custom plugins:

1. `anchorPlugin` — adds `id` attributes to headings and injects permalink `#` links
2. `tocPlugin` — processes `[[toc]]` directives
3. `containerPlugin` — handles `::: tip`, `::: warning`, `::: danger`, `::: details`
4. `codeBlockPlugin` — overrides fence rendering to use Shiki

The parser is configured with `html: true` (allow raw HTML) and `linkify: true` (auto-link URLs).

In addition to the four plugins, `createParser()` overrides two render rules:

- `link_open` — internal links (starting with `/` or `#`) receive a `data-swifty-nav="true"` attribute for SPA navigation via the swifty Router. External links receive `target="_blank"` and `rel="noopener noreferrer"` to open in a new tab securely.
- `heading_open` — all headings receive the `scroll-mt-20` CSS class, which adds a scroll offset so anchored headings are not hidden behind the fixed navbar.

### Syntax highlighting {#syntax-highlighting}

`getHighlighter()` creates a lazy Shiki singleton (only when `config.highlight` is set):

```ts
getHighlighter('github-dark', ['javascript', 'typescript', 'python', ...])
```

Shiki is initialized on first use and cached by theme+languages key. The highlighter supports 44 languages by default. Unknown languages fall back to plain text.

### HTML rendering {#html-rendering}

`renderToSwiftyTemplate()` uses the default `markdown-it` renderer with plugin overrides. The output is static HTML:

```html
<h1 id="introduction">
  Introduction
  <a class="header-anchor" href="#introduction">#</a>
</h1>
<p>Content starts here</p>
```

### Page metadata {#page-metadata}

`buildPageData()` extracts:

- `title` — from frontmatter or first `<h1>`
- `headings` — all `<h2>` and `<h3>` with IDs (for TOC)
- `excerpt` — first paragraph (for search)

### Module emission {#module-emission}

The final step emits a JavaScript module:

```js
export const pageData = {
  title: "Introduction",
  headings: [{ slug: "what-is-this", text: "What is this?", level: 2 }],
  excerpt: "Welcome to the guide section.",
};

export const contentHtml = '<h1 id="introduction">...</h1><p>...</p>';
```

This module is imported by the generated `loadContent()` function.

## Phase 3: Runtime {#phase-3-runtime}

At runtime, Swifty MVC boots the application with the generated routes and theme views.

### Boot sequence {#boot-sequence}

```ts
import { Framework, registerViewClass } from "@swifty.js/docs";
import { registerThemeViews } from "@swifty.js/docs/theme";
import { routes, loadContent } from "@swifty-docs/generated";

registerThemeViews();

registerViewClass("theme/docs-layout", createDocsLayoutView());

Framework.boot({
  rootId: "app",
  routeMode: "history",
  routes: Object.fromEntries(
    Object.keys(routes).map((path) => [path, "theme/docs-layout"]),
  ),
});
```

### Layout view {#layout-view}

The layout view (`createDocsLayoutView`) is the root component. It:

1. Observes the URL path via `observeLocation('path')`
2. On path change, calls `loadContent(path)` to fetch the Markdown module
3. Extracts `pageData` and `contentHtml`
4. Publishes `currentPageHeadings` and `currentPageTitle` to State
5. Renders the content in a three-column layout (sidebar, content, TOC)

### Sidebar view {#sidebar-view}

The sidebar view (`createSidebarView`) reads `docsConfig.sidebar` from State and renders the navigation tree. It marks the active item based on the current path.

### TOC view {#toc-view}

The TOC view (`createTocView`) observes `currentPageHeadings` from State and renders a table of contents. It uses IntersectionObserver to highlight the current section as the user scrolls.

### Search view {#search-view}

The search view (`createSearchView`) provides full-text search. On first query, it lazily builds a MiniSearch index from all Markdown files. Results are highlighted and linked to the source pages.

## Data flow {#data-flow}

```
User clicks sidebar link
  -> Router.to('/guide/introduction')
  -> Router.CHANGED event fires
  -> Layout view observes 'path', re-renders
  -> loadContent('/guide/introduction') fetches the compiled .md module
  -> State.set({ currentPageHeadings: [...], currentPageTitle: '...' })
  -> State.digest() fires CHANGED event
  -> TOC view observes 'currentPageHeadings', re-renders with new headings
  -> Content is displayed, TOC is updated
```

## Next steps {#next-steps}

- [Configuration Reference](/docs/en/swifty-docs/reference/site-config) — all configuration options
- [Markdown Extensions](/docs/en/swifty-docs/guide/markdown) — containers, syntax highlighting, and more
- [Theme Customization](/docs/en/swifty-docs/guide/theme) — customizing the layout
