---
title: Search
description: Configuring full-text search with local search and DocSearch integration.
---

# Search {#search}

Swifty Docs provides full-text search out of the box. You can choose between local search (MiniSearch) or external DocSearch (Algolia).

## Local search {#local-search}

Local search is the default provider. It builds a search index from all Markdown files at runtime and provides fast, client-side search.

### How it works {#local-search-how}

1. On first search query, the search view lazily builds a MiniSearch index
2. The index includes page titles, headings, and excerpts
3. Queries use AND-logic with fuzzy matching (0.2 tolerance)
4. Results are ranked by relevance (title > headings > excerpt)
5. Matches are highlighted with `<mark>` tags

### Configuration {#local-search-config}

Local search is enabled by default. To explicitly configure it:

```ts
export default defineConfig({
  search: {
    provider: "local",
  },
});
```

### Search index {#search-index}

The search index is built from all non-draft pages. Each entry contains the page title, headings, link, and excerpt.

Pages marked as `draft: true` in frontmatter are excluded from the index.

### MiniSearch options {#minisearch-options}

The MiniSearch instance used by the search modal is configured with:

```ts
{
  fields: ['title', 'headings', 'excerpt'],
  storeFields: ['title', 'link', 'headings', 'excerpt'],
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
    boost: { title: 2, headings: 1.5 }
  }
}
```

The `storeFields` option ensures that `title`, `link`, `headings`, and `excerpt` are stored in the MiniSearch index and returned with each search result, so the modal can display and link to pages without a separate lookup.

### Scoring systems {#scoring-systems}

Swifty Docs has two distinct scoring systems that serve different purposes:

- The search modal (MiniSearch) uses field boost weights: title=2, headings=1.5. These weights are applied by MiniSearch's TF-IDF ranking algorithm along with prefix matching and fuzzy matching (0.2 tolerance).
- The `searchDocs` utility (see below) uses custom weighted scoring: title=10, headings=5, excerpt=1. These weights apply to simple substring matching and are summed per result.

Do not confuse the two — they are independent implementations optimized for different contexts.

## DocSearch {#docsearch}

DocSearch renders the DocSearch UI widget but uses the local search index under the hood — no Algolia account is required.

### Setup {#docsearch-setup}

Enable the DocSearch provider in your configuration:

```ts
export default defineConfig({
  search: {
    provider: "docsearch",
  },
});
```

Internally, Swifty Docs uses `createLocalSearchClient` with dummy credentials (`appId: 'local'`, `apiKey: 'local'`, `indexName: 'local'`) to drive the DocSearch widget against the same local index used by the default provider. You get the polished DocSearch UI without any external service dependency.

### Local search client {#local-search-client}

For development or testing, you can use a local search client that mimics the DocSearch API:

```ts
import { createLocalSearchClient } from "@swifty.js/docs/theme";

const client = createLocalSearchClient(searchIndex);
```

This provides an Algolia-compatible client that uses the local search index.

## Disabling search {#disabling-search}

To disable search entirely:

```ts
export default defineConfig({
  search: {
    provider: "none",
  },
});
```

## Custom search UI {#custom-search-ui}

You can replace the search view with a custom implementation:

```ts
import { createSearchView } from "@swifty.js/docs/theme";
import customSearchTemplate from "./custom-search.html";

registerViewClass("theme/search", createSearchView(customSearchTemplate));
```

The search view receives these variables:

```typescript
{
  icons: {
    search: string;
  }; // SVG icons
  results: {
    title: string;
    link: string;
    headings: string[];
    excerpt: string;
    highlightedTitle: string;   // title with <mark> highlights
    highlightedExcerpt: string; // excerpt with <mark> highlights
  }[];
  hasSearched: boolean;  // whether a search has been performed
  query: string;         // current search query
  isOpen: boolean;       // whether the modal is open
  modalClass: string;    // CSS class for modal visibility
}
```

### SearchEntry structure {#search-entry}

```typescript
interface SearchEntry {
  title: string;
  link: string;
  headings: string[];
  excerpt: string;
}
```

## searchDocs utility {#search-docs-utility}

`searchDocs` is a standalone utility function for programmatic search. It is separate from the search modal UI described above — the modal uses MiniSearch internally, while `searchDocs` uses custom weighted scoring with AND-logic substring matching.

Use `searchDocs` when you need to build custom search interfaces, command-line tools, or automated workflows that query the documentation index outside of the browser modal.

```ts
import { searchDocs } from "@swifty.js/docs/runtime";

const results = searchDocs(searchIndex, "getting started", 10);
// Returns up to 10 results matching "getting started"
```

The function scores results using weighted matching: title matches score 10 points, heading matches score 5, and excerpt matches score 1. Results are sorted by total score descending.

## Next steps {#next-steps}

- [Theme Customization](/docs/en/swifty-docs/guide/theme) — customizing the search UI
- [Configuration Reference](/docs/en/swifty-docs/reference/site-config) — search configuration options
- [API Reference](/docs/en/swifty-docs/api/overview) — search utilities and types
