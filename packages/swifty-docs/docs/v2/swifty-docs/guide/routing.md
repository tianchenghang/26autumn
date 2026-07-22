# Routing

swifty-docs uses a filesystem-based routing system that maps Markdown files to URL paths automatically. Every `.md` file in your docs directory becomes a route, and the directory structure determines the URL hierarchy. No manual route registration is required.

## File-Based Routing

The scanner walks the docs directory recursively and converts each `.md` file into a route entry. The mapping follows a small set of rules:

- `index.md` in any directory maps to that directory's path without a trailing slash.
- Other `.md` files map to their filename stem (the name without the `.md` extension).
- All paths are prefixed with the `baseUrl` from your configuration.
- No route ever has a trailing slash.

Given the following directory structure with `baseUrl: "/docs/"`:

```
docs/
├── index.md
├── getting-started.md
├── guide/
│   ├── index.md
│   └── configuration.md
└── api/
    └── router.md
```

The generated routes are:

```
docs/index.md              →  /docs
docs/getting-started.md    →  /docs/getting-started
docs/guide/index.md        →  /docs/guide
docs/guide/configuration.md → /docs/guide/configuration
docs/api/router.md         →  /docs/api/router
```

The generated HTML can be hosted on any static file server. The router operates in history mode by default, producing clean URLs without `.html` extensions.

## Route Resolution Rules

The scanner applies the following rules when deciding which files and directories to include.

### Included files

Only files with the `.md` extension are processed. All other file types (`.ts`, `.css`, `.html`, images) are ignored by the scanner regardless of their location in the docs directory.

### Skipped entries

Files and directories whose names start with `_` (underscore) or `.` (dot) are skipped entirely. This convention lets you colocate drafts, partials, and configuration files alongside your content without them appearing as routes.

The following directory names are always skipped regardless of prefix:

- `node_modules`
- `__tests__`
- `__fixtures__`
- `.git`
- `.vitepress`
- `.swifty-docs`
- `dist`

### Draft exclusion

Files with `draft: true` in their frontmatter are excluded from the route map when the `excludeDrafts` option is passed to the scanner. This is useful for keeping work-in-progress pages out of production builds while still being able to preview them during development.

```yaml
---
draft: true
---
# Work in Progress

This page is not yet published.
```

## Scanner

The scanner is implemented as `scanDocsDir()` in the `swifty-docs/vite` sub-path export. It accepts three arguments:

```ts
function scanDocsDir(
  docsDir: string,
  baseUrl: string,
  options?: { excludeDrafts?: boolean },
): DocsRoute[];
```

- `docsDir`: absolute path to the docs source directory.
- `baseUrl`: the URL prefix for all generated routes (matching `DocsConfig.baseUrl`).
- `options.excludeDrafts`: when `true`, files with `draft: true` in frontmatter are omitted.

For each `.md` file discovered, the scanner reads the file, extracts YAML frontmatter, parses headings from the Markdown body, and produces a `DocsRoute` object:

```ts
interface DocsRoute {
  path: string;
  viewId: string;
  filePath: string;
  pageData: PageData;
  isDirectoryIndex?: boolean;
}
```

The `viewId` is a unique identifier derived from the route segment, used by `registerViewClass()` to associate the compiled template with a route. The generation rules are:

- Root index (`/docs`) produces `"index"`.
- Subdirectory index (`/docs/guide`) produces `"guide-index"`.
- Regular file (`/docs/guide/configuration`) produces `"guide-configuration"`.

Slashes become hyphens, and non-alphanumeric characters (other than hyphens) are stripped.

### Page data extraction

For each route, the scanner populates a `PageData` object:

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

Title resolution follows a three-step fallback:

1. The `title` field from frontmatter.
2. The first `h1` heading extracted from the Markdown body.
3. A title derived from the filename (for example, `getting-started.md` becomes `"Getting Started"`).

Description defaults to the derived title when frontmatter does not provide one. Headings are extracted at h2 and h3 levels, skipping any headings that appear inside fenced code blocks.

## Virtual Index Routes

When a directory contains `.md` files but no `index.md`, the scanner generates a virtual index route that points to the first page in that directory. This ensures that navigating to a directory path always serves content, even without an explicit index file.

For example, if the `api/` directory contains only `router.md` and `state.md`:

```
docs/
├── index.md
└── api/
    ├── router.md
    └── state.md
```

The scanner produces these routes:

```
/docs              →  index.md (real index)
/docs/api          →  api/router.md (virtual index, points to first page)
/docs/api/router   →  api/router.md
/docs/api/state    →  api/state.md
```

The virtual index route carries `isDirectoryIndex: true` on its `DocsRoute` entry. This flag is used by the sidebar generator to exclude virtual indexes from the sidebar tree, preventing duplicate entries.

### First-page selection

The target page for a virtual index is determined by sorting the directory's children using the same rules as the sidebar:

1. If every file in the directory has a `sidebar_position` in its frontmatter, the file with the lowest position value is selected. Ties are broken alphabetically by filename.
2. If any file is missing `sidebar_position`, all position values are ignored and the first file in alphabetical order is selected.

This "all or nothing" rule prevents surprising behavior when only some files declare explicit positions.

### Overriding with an explicit index

To replace the virtual index with a real page, add an `index.md` to the directory. The scanner detects the real index and skips virtual index generation for that directory.

## Route Map Generation

After the scanner produces the `DocsRoute[]` array, the route map is generated in two forms: a plain object mapping paths to view IDs, and a boot module string that registers compiled views.

### Path-to-viewId map

`generateRouteMap()` converts the route array into a `Record<string, string>`:

```ts
import { generateRouteMap } from "swifty-docs/vite";

const map = generateRouteMap(routes);
// {
//   "/docs": "index",
//   "/docs/guide": "guide-index",
//   "/docs/guide/configuration": "guide-configuration"
// }
```

This map is consumed by the swifty-mvc `Framework.boot({ routes })` call to wire URL paths to view classes.

### Boot module

`generateBootModule()` emits a JavaScript module source string that imports every compiled docs view and registers it with `registerViewClass()`:

```ts
import { generateBootModule } from "swifty-docs/vite";

const source = generateBootModule(routes, projectRoot);
```

The output looks like:

```js
import { registerViewClass } from "swifty-mvc";
import view0 from "./docs/index.md";
import view1 from "./docs/guide/index.md";
import view2 from "./docs/guide/configuration.md";

registerViewClass("index", view0);
registerViewClass("guide-index", view1);
registerViewClass("guide-configuration", view2);
```

Import specifiers use relative paths so the generated module is portable across machines and does not leak absolute filesystem paths.

## Generated Module Structure

`defineConfig()` writes a runtime module to `.swifty-docs/generated/index.js` at project root. This file is auto-generated and should not be edited manually. It is imported by the boot file through a bundler alias (typically `@swifty-docs/generated`).

The generated module exports four values:

### routes

A record that maps every docs path to the single layout view ID. In swifty-docs, all routes point to the same layout view (`theme/docs-layout`), which stays mounted across navigation and swaps page content dynamically:

```js
export const routes = Object.fromEntries(
  Object.keys(loaders).map((k) => [k, "theme/docs-layout"]),
);
```

### loadContent(path)

An async function that dynamically imports the compiled Markdown module for a given route path. It normalizes the input by stripping trailing slashes and `/index`, `/index.md`, `/index.html` suffixes, so that `/docs/guide/index.md` resolves to the same module as `/docs/guide`:

```js
export async function loadContent(path) {
  let normalized = (path || "/").replace(/\/+$/, "") || "/";
  normalized = normalized.replace(
    /^(.*?)(?:\/index(?:\.md|\.html)?)\/?$/,
    (_m, p1) => p1 || "/",
  );
  const loader = loaders[normalized];
  if (!loader) return null;
  const mod = await loader();
  return { pageData: mod.pageData, contentHtml: mod.contentHtml };
}
```

The layout view calls `loadContent()` on every navigation to fetch the matching page. Each loader is a dynamic `import()` expression, so the bundler code-splits each page into its own chunk.

### docsConfig

A JSON-serialized copy of the runtime configuration (title, description, baseUrl, nav, sidebar). The `docs` property (source directory path) is omitted since it has no meaning at runtime.

### getSearchIndex()

A lazily-initialized function that builds the search index on first call. It loads all `.md` modules through the same dynamic importers used by `loadContent()`, extracts `pageData` from each, and returns an array of `SearchEntry` objects. Subsequent calls return the cached result. Virtual index routes are excluded from the search index to avoid duplicate entries.

## Navigation

Client-side navigation in swifty-docs is powered by the swifty-mvc `Router`. Because all docs routes map to the same layout view, the layout stays mounted across page transitions. Only the page content is swapped.

### Route observation

The layout view calls `ctx.observeLocation([], true)` in its setup function. This tells swifty-mvc to re-run the render method whenever the URL path changes. The render method reads the current path from `Router.parse().path`, calls `loadContent()` to fetch the new page module, and updates the template with the returned HTML.

### Index redirects

The layout normalizes incoming paths before loading content. URLs ending in `/index`, `/index.md`, or `/index.html` are redirected to the clean directory path using `Router.to()` with the `replace` flag set to `true`. This prevents duplicate history entries and ensures canonical URLs:

```
/docs/guide/index.md  →  /docs/guide
/docs/index           →  /docs
```

Trailing slashes are also stripped to match the route keys, which never carry a trailing slash.

### Link handling

Navigation events are handled through swifty-mvc's event delegation system. For Markdown-rendered internal links, the parser sets `data-swifty-nav="true"` on anchor elements, which the DocsView's event delegation handler picks up at runtime for SPA-style navigation. Sidebar and search templates use `data-href` attributes instead, which trigger `Router.to(href)` through their respective click handlers. Both mechanisms update the URL and cause `observeLocation` to fire. The layout view re-renders with the new content without a full page reload.

### Previous and next page links

The layout computes previous and next page links by flattening the sidebar tree into an ordered list and finding the current path's position within it. Pages at the boundaries of the list receive `null` for the missing neighbor. This ensures that prev/next navigation follows the same order as the sidebar, regardless of whether the sidebar is auto-generated or manually configured.

### Stale render protection

Because `loadContent()` is asynchronous, rapid navigation can cause an older page load to resolve after a newer one. The render method captures a signature value before the `await` and checks it afterward. If the signature has changed (meaning a newer render was triggered), the stale result is discarded and the newer render takes over.
