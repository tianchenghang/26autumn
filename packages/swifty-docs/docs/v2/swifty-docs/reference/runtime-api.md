# Runtime API Reference

Client-side utilities and theme registration functions for swifty-docs. These APIs are browser-safe and can be imported from the main `swifty-docs` package or from the `swifty-docs/runtime` sub-path.

## Search

### searchDocs

Perform client-side full-text search over a pre-built search index.

```typescript
function searchDocs(
  index: SearchEntry[],
  query: string,
  limit?: number,
): SearchEntry[];
```

Parameters:

- `index` - Array of search entries built by `buildSearchIndex` at build time
- `query` - Search string to match against titles, headings, and excerpts
- `limit` - Maximum number of results to return (default: 20)

Returns array of matching `SearchEntry` objects, sorted by relevance score (descending).

Behavior:

- All query terms must match (AND logic)
- Matches are case-insensitive
- Each term is checked against individual fields (title, each heading, excerpt) independently to avoid false matches across field boundaries
- Scoring weights: title match (10 points), heading match (5 points), excerpt match (1 point)
- Results are sorted by score, then alphabetically by title when scores are equal

Example:

```typescript
import { searchDocs } from "swifty-docs/runtime";
import searchIndex from "../data/search-index.json";

const results = searchDocs(searchIndex, "router navigation", 10);
// Returns up to 10 entries containing both "router" and "navigation"
```

### createLocalSearchClient

Create an Algolia DocSearch-compatible client that queries a local search index instead of Algolia's hosted API. No Algolia account or API key is required.

```typescript
function createLocalSearchClient(index: SearchEntry[]): {
  search: (requests: SearchRequest[]) => Promise<SearchResponse>;
};
```

Parameters:

- `index` - Search index array (same format as `searchDocs`)

Returns an object with a `search` method that implements the Algolia search client interface. The response wraps hits in `{ results: [{ hits, nbHits, page, nbPages, hitsPerPage, processingTimeMS, query, params }] }`.

Each hit includes `hierarchy` fields (lvl0 = page title, lvl1 = first heading) and `_highlightResult` / `_snippetResult` for DocSearch UI rendering.

Usage:

Used internally by the DocSearch integration when `search.provider` is set to `"docsearch"`. You can also use it to build custom search interfaces.

```typescript
import { createLocalSearchClient } from "swifty-docs/theme";

const client = createLocalSearchClient(searchIndex);
const response = await client.search([
  {
    indexName: "docs",
    params: { query: "configuration", hitsPerPage: 5 },
  },
]);
// response.results[0].hits contains matching entries
```

The scoring logic mirrors `searchDocs()`: title match = 10 points per term, heading match = 5 points per term, excerpt match = 1 point per term. All terms must match (AND logic).

## Utilities

### slugify

Convert heading text into a URL-safe slug string for anchor links.

```typescript
function slugify(text: string): string;
```

Parameters:

- `text` - Heading text to convert

Returns a URL-safe slug string.

Conversion rules:

- Lowercase the text
- Preserve CJK, Cyrillic, Arabic, and other non-ASCII scripts using Unicode property escapes (`\p{L}` for letters, `\p{N}` for numbers)
- Replace non-letter/number/space/dash characters with a dash (preserves word boundaries: `"Hello!World"` becomes `"hello-world"`, not `"helloworld"`)
- Replace whitespace sequences with a single dash
- Collapse consecutive dashes
- Trim leading and trailing dashes
- Prefix a leading digit with underscore so the slug is a valid CSS selector (`querySelector("#123")` is invalid; `"#_123"` is valid)

Example:

```typescript
import { slugify } from "swifty-docs/runtime";

slugify("Hello World"); // "hello-world"
slugify("路由导航"); // "路由导航"
slugify("What's New?!"); // "what-s-new"
slugify("v2.0 Changes"); // "v2-0-changes"
slugify("123 Release"); // "_123-release"
slugify("already-slugged"); // "already-slugged"
slugify("a -- b"); // "a-b"
```

### icons

Registry of icon SVG strings imported from lucide-static.

```typescript
const icons: {
  search: string;
};
```

Each icon is a complete `<svg>...</svg>` markup string imported via Vite's `?raw` suffix. Icons inherit `currentColor` from their parent container, so color is controlled via CSS text-color utilities (for example, Tailwind's `text-primary` class on the wrapper `<span>`).

Usage in theme templates (via the raw output operator `{{!}}`):

```typescript
import { icons } from "swifty-docs";

// In a view setup function, set icons once (static data, not per-render)
ctx.updater.set({ icons });

// In a template:
// {{!icons.search}}
```

## Theme Registration

### registerThemeViews

Register all built-in theme views (layout, sidebar, TOC, search) with the swifty-mvc view registry.

```typescript
function registerThemeViews(options?: RegisterThemeViewsOptions): void;

interface RegisterThemeViewsOptions {
  vdom?: boolean;
}
```

Parameters:

- `options.vdom` - Whether to register VDOM-mode templates. When omitted, auto-detects from `FrameworkConfig.vdom` after boot (via `Framework.getConfig("vdom")`), or defaults to `false`.

Call this once in your `boot.ts` file. The recommended pattern is to call it before `Framework.boot()` and pass the `vdom` flag explicitly:

```typescript
import { Framework, registerThemeViews } from "swifty-docs";

const config = {
  rootId: "app",
  vdom: false,
  // ... other config
};

// Before boot: pass config explicitly
registerThemeViews({ vdom: config.vdom });
Framework.boot(config);
```

Alternatively, call after boot and let it auto-detect the config:

```typescript
Framework.boot(config);
// After boot: auto-detected from config
registerThemeViews();
```

Templates are pre-compiled in both string and VDOM modes during the lib build. This function selects the correct version and registers the following views:

- `theme/docs-layout` - Main layout (via `createDocsLayoutView`)
- `theme/sidebar` - Sidebar navigation (via `createSidebarView`)
- `theme/toc` - Table of contents (via `createTocView`)
- `theme/search` - Search modal (via `createSearchView`)

## View Factories

Advanced users can use individual view factories to override specific theme views or implement custom registration logic. Each factory accepts a compiled template and returns a `ViewSetup` compatible with `registerViewClass`.

### createDocsLayoutView

Create the main documentation layout view that handles page navigation and content loading.

```typescript
function createDocsLayoutView(template: ViewTemplate | VDomTemplate): ViewSetup;
```

Parameters:

- `template` - Compiled template in string-mode or VDOM-mode

Responsibilities:

- Observes route changes via `ctx.observeLocation([], true)`
- Loads markdown content for the current path via `State.get("loadContent")`
- Publishes page headings to State (`currentPageHeadings`, `currentPageTitle`) for the TOC sub-view
- Computes prev/next page navigation from the flattened sidebar order
- Redirects `/index`, `/index.md`, `/index.html` to clean directory paths
- Normalizes trailing slashes to match route keys
- Initializes DocSearch widget when `search.provider` is `"docsearch"`
- Sets icons once in setup (static data, not per-render)

The layout view stays mounted across navigation because all `/docs/*` routes map to this same viewId. swifty-mvc does not unmount and remount the layout; it only re-runs `render()`. A signature guard short-circuits stale loads when the user navigates again before the previous import resolves.

### createSidebarView

Create the sidebar navigation tree view.

```typescript
function createSidebarView(template: ViewTemplate | VDomTemplate): ViewSetup;
```

Parameters:

- `template` - Compiled template

Responsibilities:

- Reads sidebar configuration from `State.get("docsConfig")` via Zod validation
- Flattens sidebar groups into a `sidebarGroups` array for the template
- Marks the active item based on the current route with `isActive` flag and computed `itemClass`
- Handles navigation clicks by walking up the DOM to find the element carrying `data-href`
- Normalizes trailing slashes for consistent active-item matching

### createTocView

Create the table of contents view that displays page headings.

```typescript
function createTocView(template: ViewTemplate | VDomTemplate): ViewSetup;
```

Parameters:

- `template` - Compiled template

Responsibilities:

- Observes `currentPageHeadings` in State (published by the layout view after content load)
- Renders h2/h3 headings with scroll-spy highlighting using IntersectionObserver
- Uses `rootMargin: "0px 0px -70% 0px"` and `threshold: 0` for scroll detection
- Applies `ACTIVE_CLASS` to the heading currently in view, `NORMAL_CLASS` to others
- Indents h3 headings with `pl-2` class
- DOM lookup is deferred to a macrotask because setup/assign run before the template DOM is mounted
- Handles scroll-to-heading clicks by walking up the DOM to find the element carrying `data-slug`

### createSearchView

Create the client-side search modal view.

```typescript
function createSearchView(template: ViewTemplate | VDomTemplate): ViewSetup;
```

Parameters:

- `template` - Compiled template

Responsibilities:

- Observes `searchOpen` in State for modal visibility control
- Lazily initializes MiniSearch on first query (loaded from `State.get("getSearchIndex")`)
- Provides prefix matching (`prefix: true`), fuzzy matching (`fuzzy: 0.2`), and field-weighted scoring (`boost: { title: 2, headings: 1.5 }`)
- Highlights matching terms in results using `<mark>` tags
- Focuses the search input via `requestAnimationFrame` after the modal opens
- Handles modal backdrop clicks to close the search dialog
- Navigates to selected results via `Router.to()` and closes the modal

Example (overriding the default search view):

```typescript
import { createSearchView, registerViewClass } from "swifty-docs";
import customSearchTemplate from "./custom-search.html?raw";

registerViewClass("theme/search", createSearchView(customSearchTemplate));
```

## Re-exports from swifty-mvc

The main `swifty-docs` package re-exports commonly used APIs from `swifty-mvc` so consumers don't need to install it separately.

### Core APIs

```typescript
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
} from "swifty-docs";
```

These are identical to the exports from `swifty-mvc`. Refer to the swifty-mvc API documentation for detailed usage.

### Types

```typescript
import type { FrameworkConfig, ViewCtx, ViewSetup } from "swifty-docs";
```

`FrameworkConfig` is typed as `Omit<SwiftyMvcFrameworkConfig, "routeMode"> & { routeMode: "history" }`, enforcing history-mode routing for documentation sites.

## Type Definitions

### SearchEntry

```typescript
interface SearchEntry {
  title: string;
  link: string;
  headings: string[];
  excerpt: string;
}
```

### HeadingInfo

```typescript
interface HeadingInfo {
  level: number;
  text: string;
  slug: string;
}
```

### DocsConfig

```typescript
interface DocsConfig {
  docs: string;
  baseUrl: string;
  title: string;
  description?: string;
  nav?: NavItem[];
  sidebar?: Record<string, SidebarConfig>;
  markdown?: MarkdownOptions;
  highlight?: HighlightOptions;
  search?: SearchOptions;
}
```

See the Configuration API reference for complete type definitions.

## See Also

- Configuration API - Build-time configuration options
- Theme Customization - Customizing theme views
- swifty-mvc Core API - Framework, State, Router, and other core APIs
