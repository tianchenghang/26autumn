# Search

swifty-docs ships with two built-in search providers that require no external services. The local provider uses MiniSearch, the same full-text search engine as VitePress, with prefix matching, fuzzy matching, field-weighted scoring, and result highlighting. The DocSearch provider renders Algolia's styled modal UI but queries the local index, requiring no Algolia account or credentials. Both providers build the search index at compile time and load it lazily in the browser on first query.

## Configuration

Search is configured in `swifty-docs.config.ts` through the `search` property:

```ts
import { defineConfig } from "swifty-docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Library",
  search: {
    provider: "local",
  },
});
```

The `SearchOptions` interface accepts a single `provider` field:

```ts
interface SearchOptions {
  provider?: "local" | "docsearch" | "none";
}
```

Three providers are available:

- `local` (default): a MiniSearch-powered modal with prefix matching, fuzzy matching, field-weighted scoring, and result highlighting.
- `docsearch`: Algolia DocSearch UI widget backed by the local search index. No Algolia account is required.
- `none`: disable search entirely.

The search button appears in the navbar at all viewport sizes. Clicking it opens a modal dialog that loads the search index on demand. The index does not affect initial page load performance because it is fetched only when the user opens the search dialog for the first time.

## Local Search (MiniSearch)

The local search provider uses MiniSearch, a lightweight full-text search library written in TypeScript. MiniSearch supports prefix matching, fuzzy matching, and field-weighted scoring out of the box. It is the same engine used by VitePress for its local search feature.

### How it works

When the user opens the search dialog and types a query, the SearchView lazily loads the search index from the generated module, constructs a MiniSearch instance, and indexes all documentation pages. Each page is indexed across three fields: `title`, `headings`, and `excerpt`. The search options are configured as follows:

```ts
const mini = new MiniSearch({
  fields: ["title", "headings", "excerpt"],
  storeFields: ["title", "link", "headings", "excerpt"],
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
    boost: { title: 2, headings: 1.5 },
  },
});
```

- `prefix: true` enables prefix matching, so typing "config" matches "configuration", "configurable", and "configs".
- `fuzzy: 0.2` enables fuzzy matching with a tolerance of 0.2, allowing minor typos and variations.
- `boost` assigns higher weights to title and heading matches, so results with query terms in the title rank above those with matches only in the excerpt.

### Query logic

MiniSearch uses OR logic by default: a document is included in results if any term matches any field. Results are scored using TF-IDF (Term Frequency-Inverse Document Frequency) with field boost weights:

- Title matches receive 2x boost
- Heading matches receive 1.5x boost
- Excerpt matches receive 1x boost (baseline)

Results are sorted by relevance score descending. The `prefix: true` and `fuzzy: 0.2` options enable prefix matching and typo tolerance respectively.

### Result highlighting

The SearchView wraps each query term occurrence in `<mark>` tags for visual highlighting. Both the title and excerpt are highlighted independently. The highlighting function escapes special regex characters to avoid injection issues:

```ts
function highlightMatch(text: string, query: string): string {
  if (!text) return "";
  if (!query) return text;
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  let result = text;
  for (const term of terms) {
    const regex = new RegExp(`(${escapeRegExp(term)})`, "gi");
    result = result.replace(regex, "<mark>$1</mark>");
  }
  return result;
}
```

The highlighted strings are rendered using the raw output operator `{{!}}` in the search template, so the `<mark>` tags are interpreted as HTML.

## searchDocs()

The `searchDocs()` function is a runtime helper exported from `swifty-docs/runtime`. It performs client-side full-text search over a pre-built `SearchEntry[]` index using case-insensitive substring matching. Unlike the MiniSearch-based local provider, `searchDocs()` does not require any external dependency and works with any array of `SearchEntry` objects.

### Signature

```ts
function searchDocs(
  index: SearchEntry[],
  query: string,
  limit = 20,
): SearchEntry[];
```

### Parameters

- `index`: an array of `SearchEntry` objects, each containing `title`, `link`, `headings`, and `excerpt`.
- `query`: the search query string. Whitespace-separated terms are matched using AND logic.
- `limit`: maximum number of results to return. Defaults to 20.

### Behavior

The function splits the query into terms, then checks each entry to see if all terms match at least one field (title, any heading, or excerpt). Matches are scored using the same weighting as the local search provider:

```ts
for (const term of terms) {
  if (titleLower.includes(term)) score += 10;
  for (const h of headingsLower) {
    if (h.includes(term)) score += 5;
  }
  if (excerptLower.includes(term)) score += 1;
}
```

Results are sorted by score descending, then by title alphabetically. The function returns up to `limit` results.

### Usage

`searchDocs()` is useful when you need to perform search outside the built-in SearchView, for example in a custom search interface or a command palette:

```ts
import { searchDocs } from "swifty-docs/runtime";
import { getSearchIndex } from "@swifty-docs/generated";

const searchIndex = await getSearchIndex();
const results = searchDocs(searchIndex, "configuration options", 10);
```

The function is also used internally by the DocSearch provider's local search client adapter.

## Search Index Building

The search index is built at compile time by the `buildSearchIndex()` function in `search-index.ts`. This function processes all scanned routes and produces a JSON-serializable array of `SearchEntry` objects.

### SearchEntry interface

Each entry in the search index represents a single documentation page:

```ts
interface SearchEntry {
  title: string;
  link: string;
  headings: string[];
  excerpt: string;
}
```

- `title`: the page title extracted from frontmatter or the first h1 heading.
- `link`: the full route path including the `baseUrl` prefix.
- `headings`: an array of all heading texts on the page (h2, h3, etc.).
- `excerpt`: the first ~200 characters of plain text content, or the frontmatter description if available.

### buildSearchIndex()

The function filters out draft pages and virtual directory index routes, then maps each remaining route to a `SearchEntry`:

```ts
export function buildSearchIndex(routes: DocsRoute[]): SearchEntry[] {
  return routes
    .filter((r) => !r.pageData.draft && !r.isDirectoryIndex)
    .map((route) => ({
      title: route.pageData.title,
      link: route.path,
      headings: route.pageData.headings.map((h) => h.text),
      excerpt: route.pageData.excerpt || route.pageData.description || "",
    }));
}
```

Draft pages (those with `draft: true` in frontmatter) are excluded from the search index so they do not appear in search results in production builds. Virtual directory index routes are also excluded to avoid duplicate entries when a directory contains an `index.md` file.

### emitSearchIndexModule()

The search index is built lazily at runtime rather than serialized to a static module. The generated `getSearchIndex()` function dynamically imports all `.md` modules on first call, extracts `pageData` from each, and builds the `SearchEntry[]` array in memory. Subsequent calls return the cached result. This lazy-loading architecture avoids bundling the entire search index upfront and allows code-splitting of individual page modules.

### Lazy loading

The search index is not loaded during initial page load. Instead, the `SearchView` calls `State.get("getSearchIndex")` to retrieve the function that dynamically imports all page modules and builds the index on demand. This function is injected into the state by the generated boot file:

```ts
const getSearchIndex = async () => {
  // Dynamically imports all .md modules and builds SearchEntry[] on first call
  const entries = [];
  for (const [path, loader] of Object.entries(loaders)) {
    const mod = await loader();
    entries.push({
      title: mod.pageData.title,
      link: path,
      headings: mod.pageData.headings.map((h) => h.text),
      excerpt: mod.pageData.excerpt,
    });
  }
  return entries;
};
State.set({ getSearchIndex });
```

The index is fetched only when the user opens the search dialog and types the first query. Subsequent queries reuse the cached MiniSearch instance.

## DocSearch Integration

The DocSearch provider renders Algolia's styled search modal but queries the local search index instead of Algolia's hosted API. This provides a polished, accessible search UI without requiring an Algolia account or API keys.

### createLocalSearchClient()

The `createLocalSearchClient()` function in `docs-search-local.ts` creates an Algolia-compatible search client that wraps the local `SearchEntry[]` index. DocSearch calls the client's `search()` method with an array of query requests, and the client returns results in the format expected by the DocSearch widget.

```ts
export function createLocalSearchClient(index: SearchEntry[]) {
  return {
    async search(
      requests: Array<{
        indexName: string;
        params: { query: string; hitsPerPage?: number };
      }>,
    ) {
      const results = requests.map((request) => {
        const { query, hitsPerPage = 20 } = request.params;

        if (!query?.trim()) {
          return emptyResult();
        }

        const entries = searchLocalIndex(index, query, hitsPerPage);
        const hits = entries.map((e, i) => toDocSearchHit(e, i));

        return {
          hits,
          nbHits: hits.length,
          page: 0,
          nbPages: Math.ceil(hits.length / hitsPerPage),
          hitsPerPage,
          processingTimeMS: 0,
          query,
          params: "",
        };
      });

      return { results };
    },
  };
}
```

The `searchLocalIndex()` helper mirrors the scoring logic of `searchDocs()`: all terms must match at least one field (AND logic), and results are scored with title matches worth 10 points, heading matches worth 5 points, and excerpt matches worth 1 point.

### DocSearch hit format

Each `SearchEntry` is converted to a DocSearch hit object with the following structure:

```ts
function toDocSearchHit(entry: SearchEntry, index: number) {
  const firstHeading = entry.headings[0] || "";

  return {
    objectID: String(index),
    url: entry.link,
    content: entry.excerpt || null,
    hierarchy: {
      lvl0: entry.title,
      lvl1: firstHeading || null,
      lvl2: null,
      lvl3: null,
      lvl4: null,
      lvl5: null,
      lvl6: null,
    },
    _highlightResult: {
      hierarchy: {
        lvl0: highlightValue(entry.title),
        lvl1: firstHeading ? highlightValue(firstHeading) : undefined,
      },
    },
    _snippetResult: {
      content: entry.excerpt
        ? { value: entry.excerpt, matchLevel: "full" as const }
        : undefined,
      hierarchy: {
        lvl0: { value: entry.title, matchLevel: "full" as const },
        lvl1: firstHeading
          ? { value: firstHeading, matchLevel: "full" as const }
          : undefined,
      },
    },
  };
}
```

DocSearch groups results by `hierarchy.lvl0` (the page title) and displays `hierarchy.lvl1` (the first heading) as the result subtitle. The `_highlightResult` and `_snippetResult` fields provide the highlighted text that DocSearch renders in the result list.

### Configuration

To use the DocSearch provider, set `search.provider` to `"docsearch"` in your configuration:

```ts
export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Library",
  search: {
    provider: "docsearch",
  },
});
```

The DocSearch modal is rendered by the theme's search view, which automatically detects the provider and initializes the appropriate search client. No additional configuration or API keys are required.

## UI

The search UI is rendered by the `SearchView`, one of the four theme views registered by `registerThemeViews()`. The view is toggled open and closed by the `searchOpen` state property, which the navbar's search button sets to `true` when clicked.

### Modal structure

The search dialog is rendered as a modal overlay with the following structure:

```html
<div class="{{=modalClass}}" id="docs-search-modal" @click="onModalClick()">
  <div class="modal-box max-w-xl p-0" @click.stop="noop()">
    <!-- Search input -->
    <div class="border-base-300 border-b px-4 py-3">
      <label class="input input-sm w-full">
        <span
          class="h-3.5 w-3.5 text-current opacity-50 [&>svg]:h-full [&>svg]:w-full"
        >
          {{!icons.search}}
        </span>
        <input
          type="text"
          class="grow text-sm"
          placeholder="Search documentation..."
          @input="onSearchInput()"
          id="docs-search-input"
        />
        <kbd class="kbd kbd-xs">esc</kbd>
      </label>
    </div>

    <!-- Results -->
    <div class="max-h-80 overflow-y-auto">
      {{if results.length > 0}}
      <ul class="menu menu-sm p-1.5">
        {{each results as result}}
        <li>
          <a
            class="rounded-field flex-col items-start gap-0.5 p-2"
            data-href="{{=result.link}}"
            @click="goToResult()"
          >
            <p class="text-xs font-medium">{{!result.highlightedTitle}}</p>
            {{if result.excerpt}}
            <p class="text-base-content/60 line-clamp-2 text-xs">
              {{!result.highlightedExcerpt}}
            </p>
            {{/if}}
          </a>
        </li>
        {{/each}}
      </ul>
      {{else}} {{if hasSearched}}
      <div class="flex flex-col items-center justify-center py-8 text-center">
        <p class="text-base-content/40 text-xs">No results found</p>
      </div>
      {{else}}
      <div class="flex flex-col items-center justify-center py-8 text-center">
        <p class="text-base-content/30 text-xs">Type to search...</p>
      </div>
      {{/if}} {{/if}}
    </div>
  </div>
</div>
```

The modal uses daisyUI utility classes for styling. The `modalClass` property toggles between `"modal"` (hidden) and `"modal modal-open"` (visible). Clicking the modal backdrop closes the dialog; clicking inside the modal box does not.

### Event handlers

The SearchView defines three event handlers:

- `onModalClick`: closes the dialog when the click lands on the modal backdrop (the element with `id="docs-search-modal"`), not on content inside the modal box.
- `onSearchInput`: reads the input value, queries the MiniSearch instance, and updates the `results` array. If the query is empty, results are cleared.
- `goToResult`: navigates to the selected result's URL using `Router.to()`, then closes the search dialog.

### Keyboard navigation

The search input is automatically focused when the modal opens, using `requestAnimationFrame` to ensure the DOM has updated:

```ts
ctx.renderMethod = () => {
  assign();
  ctx.updater.digest();
  if (ctx.updater.get("isOpen")) {
    requestAnimationFrame(() => {
      const el = document.getElementById("docs-search-input");
      if (el instanceof HTMLInputElement) {
        el.focus();
      }
    });
  }
};
```

Pressing the Escape key closes the modal. This behavior is handled by daisyUI's modal component, which listens for the `esc` key and removes the `modal-open` class.

### State management

The SearchView observes the `searchOpen` state property and re-renders when it changes. The layout's navbar button toggles this property:

```ts
// In the layout view
events: {
  "toggleSearch<click>": () => {
    const isOpen = State.get("searchOpen");
    State.set({ searchOpen: !isOpen }).digest();
  },
}
```

The SearchView's `assign` function reads `searchOpen` and updates the `modalClass` property accordingly. The `updater.altered()` check prevents unnecessary re-renders when the state has not changed.

## Disabling search

To disable search entirely, set the provider to `"none"`:

```ts
export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Library",
  search: {
    provider: "none",
  },
});
```

When search is disabled, all theme views including the SearchView are still registered (as `registerThemeViews()` always registers all four views), but the search button visibility is controlled by the layout template based on the search provider configuration. The layout checks `search.provider` and hides the search button when it is set to `"none"`.

## Next steps

- [Configuration](./configuration) -- complete reference for all configuration options.
- [Writing Content](./writing-content) -- frontmatter, custom containers, and code blocks.
- [Theme Customization](./theme-customization) -- overriding the default theme views.
