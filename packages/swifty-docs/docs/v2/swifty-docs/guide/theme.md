# Theme System

swifty-docs ships with a default theme built on swifty-mvc's view architecture. The theme consists of four composable views that work together to render a documentation site with navigation, content display, table of contents, and full-text search. All styling uses Tailwind CSS and DaisyUI, with responsive behavior baked into the layout.

This page explains how the theme is structured, how to register it, and how each view works internally.

## Overview {#overview}

The default theme is composed of four views, each registered under the `theme/` namespace:

- `theme/docs-layout` — the root layout that wraps every documentation page. It renders the navbar, sidebar container, main content area, and table of contents container. It also coordinates content loading and search initialization.

- `theme/sidebar` — the left-hand navigation tree. It reads sidebar configuration from State and highlights the active item based on the current route.

- `theme/toc` — the right-hand heading outline. It extracts h2 and h3 headings from the current page and uses an IntersectionObserver to highlight the heading currently in view.

- `theme/search` — the full-text search modal. It uses MiniSearch for prefix matching, fuzzy matching, and field-weighted scoring. The index is built lazily on the first search interaction.

These views are registered together by calling `registerThemeViews()` once during application boot.

## Registering the Theme {#registering-the-theme}

Call `registerThemeViews()` in your boot file before or after `Framework.boot()`. The function accepts an optional `vdom` flag to select the correct pre-compiled template for your rendering mode.

```ts
import { Framework } from "swifty-mvc";
import { registerThemeViews } from "swifty-docs/theme";

// Option 1: register before boot, pass vdom explicitly
registerThemeViews({ vdom: false });
Framework.boot(config);

// Option 2: register after boot, vdom is auto-detected
Framework.boot(config);
registerThemeViews();
```

When called after `Framework.boot()`, the function reads `FrameworkConfig.vdom` automatically and selects the appropriate template variant. When called before boot, pass the `vdom` option explicitly to avoid falling back to the default (string mode).

Internally, `registerThemeViews()` calls `registerViewClass()` for each of the four views:

```ts
registerViewClass("theme/docs-layout", createDocsLayoutView(template));
registerViewClass("theme/sidebar", createSidebarView(template));
registerViewClass("theme/toc", createTocView(template));
registerViewClass("theme/search", createSearchView(template));
```

Each factory function accepts a pre-compiled template (either string-mode or VDOM-mode) and returns a `ViewSetup` object that swifty-mvc's view registry can instantiate.

## Docs Layout View {#docs-layout-view}

The layout view is the root container for every documentation page. It remains mounted across route changes within the documentation section, re-rendering its content area when the path changes rather than unmounting and remounting.

### Content Loading {#content-loading}

The layout view reads a `loadContent` function from State. This function is injected by the swifty-docs runtime and returns a promise that resolves to the page's metadata and rendered HTML.

```ts
ctx.renderMethod = async () => {
  const loadContent = parseLoadContent(State.get("loadContent"));
  const path = Router.parse().path || "/";

  const sig = ctx.signature.value;
  const content = await loadContent(path);

  // Guard against stale renders when the user navigates
  // before the previous load completes
  if (ctx.signature.value !== sig) return;

  State.set({
    currentPageHeadings: content.pageData.headings,
    currentPageTitle: content.pageData.title,
  }).digest();

  ctx.updater.set({
    contentHtml: content.contentHtml,
  });
  ctx.updater.digest();
};
```

The signature guard prevents race conditions: if the user clicks a second link before the first page's content resolves, the stale render is discarded.

### Index Path Redirects {#index-path-redirects}

The layout normalizes paths that end in `/index`, `/index.md`, or `/index.html` to their clean directory form. This redirect uses `Router.to()` with the `replace` flag so no extra history entry is created.

```ts
const indexMatch = rawPath.match(/^(.*?)(\/index(?:\.md|\.html)?)\/?$/);
if (indexMatch) {
  const cleanPath = indexMatch[1] || "/";
  Router.to(cleanPath, {}, true);
  return;
}
```

### Prev and Next Navigation {#prev-and-next-navigation}

The layout computes previous and next page links by flattening the sidebar tree into an ordered list and finding the current path's position. The result is passed to the template as `prevPage` and `nextPage` objects.

```ts
function computePrevNext(sidebar, currentPath) {
  const flat = [];
  if (sidebar) {
    for (const items of Object.values(sidebar)) {
      if (Array.isArray(items)) collectLinks(items, flat);
    }
  }
  const idx = flat.findIndex((item) => item.link === currentPath);
  if (idx < 0) return { prevPage: null, nextPage: null };
  return {
    prevPage: idx > 0 ? flat[idx - 1] : null,
    nextPage: idx < flat.length - 1 ? flat[idx + 1] : null,
  };
}
```

### Search Initialization {#search-initialization}

When the configuration specifies `search.provider: "docsearch"`, the layout initializes the Algolia DocSearch widget after the first render completes. The widget is mounted into a `#docsearch-container` element in the navbar. For the `local` provider, the search modal is rendered as a sub-view and no external initialization is needed.

```ts
if (!docSearchInitialized && cfg.search?.provider === "docsearch") {
  docSearchInitialized = true;
  setTimeout(() => {
    void initDocSearch();
  }, 0);
}
```

The `initDocSearch()` function dynamically imports `@docsearch/js` and `@docsearch/css`, then mounts the widget with a local search client that queries the pre-built index instead of Algolia's hosted API.

## Sidebar View {#sidebar-view}

The sidebar view renders the navigation tree on the left side of the layout. It observes route changes and re-renders to highlight the active item whenever the path changes.

### Active Item Detection {#active-item-detection}

The sidebar reads the sidebar configuration from State and recursively marks the item whose `link` matches the current path. The active item receives a distinct CSS class that includes `bg-primary/10` and `text-primary`.

```ts
function markActive(items, currentPath) {
  return items.map((item) => {
    const isActive = item.link === currentPath;
    const result = {
      text: item.text,
      link: item.link,
      isActive,
      itemClass: isActive
        ? "menu-active bg-primary/10 text-primary font-medium rounded-field text-xs"
        : "rounded-field text-xs",
    };
    if (Array.isArray(item.items) && item.items.length > 0) {
      result.collapsed = item.collapsed;
      result.items = markActive(item.items, currentPath);
    }
    return result;
  });
}
```

Trailing slashes are normalized before comparison so that `/docs/guide/` and `/docs/guide` match the same item.

### Sidebar Groups {#sidebar-groups}

The sidebar configuration is a map from route prefix to an array of items. Each prefix becomes a group header in the rendered sidebar. The prefix string is formatted by stripping leading and trailing slashes, replacing hyphens with spaces, and capitalizing each word.

```ts
function formatPrefix(prefix) {
  return prefix
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
```

For example, the prefix `/docs/guide/` becomes "Docs Guide".

### Navigation Events {#navigation-events}

Clicks on sidebar items are handled by the `navigateTo<click>` event handler. Because the click target may be a child element (such as an icon or text node), the handler walks up the DOM tree to find the element carrying the `data-href` attribute.

```ts
events: {
  "navigateTo<click>": (e) => {
    const href = findDataHref(e.target);
    if (href) {
      Router.to(href);
    }
  },
}
```

The `findDataHref` utility traverses parent elements until it finds one with `data-href`, then returns that value.

## TOC View {#toc-view}

The table of contents view renders h2 and h3 headings from the current page in the right-hand sidebar. It uses an IntersectionObserver to track which heading is currently visible and highlights it in the outline.

### Heading Extraction {#heading-extraction}

The layout view publishes the current page's headings to State under the key `currentPageHeadings`. The TOC view observes this key and re-renders when new headings arrive.

```ts
ctx.observeState("currentPageHeadings");

const readHeadings = () => {
  const r = TocHeadingsSchema.safeParse(State.get("currentPageHeadings"));
  return r.success ? r.data : [];
};
```

Each heading object has `level`, `text`, and `slug` properties. The `slug` is used as the DOM element ID and as the anchor link target.

### IntersectionObserver Scroll Spy {#intersectionobserver-scroll-spy}

The scroll spy uses an IntersectionObserver to track which heading elements are visible in the viewport. When an intersection fires, the view scans all observed headings and selects the last one whose top edge is at or above a 100-pixel offset from the navbar.

```ts
observer = new IntersectionObserver(
  () => {
    let current = "";
    for (const h of headings) {
      const el = document.getElementById(h.slug);
      if (!el) continue;
      if (el.getBoundingClientRect().top <= 100) {
        current = h.slug;
      }
    }
    if (current === activeSlug) return;
    activeSlug = current;
    ctx.updater.set({ headings: buildHeadings() });
    ctx.updater.digest();
  },
  { rootMargin: "0px 0px -70% 0px", threshold: 0 },
);
```

The `rootMargin` shrinks the observation area to the top 30% of the viewport, so headings are marked active only when they reach the upper portion of the screen.

Observer setup is deferred to a macrotask via `setTimeout(() => {...}, 0)` because the TOC view's assign and render methods run before the template DOM is mounted. Without the defer, `document.getElementById` returns null.

### Smooth Scroll to Heading {#smooth-scroll-to-heading}

Clicking a TOC entry scrolls the target heading into view with smooth behavior. The click handler walks up from the target to find the element with the `data-slug` attribute, then calls `scrollIntoView`.

```ts
events: {
  "scrollToHeading<click>": (e) => {
    let el = e.target instanceof HTMLElement ? e.target : null;
    while (el && !el.dataset["slug"]) el = el.parentElement;
    const slug = el ? (el.dataset["slug"] ?? null) : null;
    if (slug) {
      const target = document.getElementById(slug);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  },
}
```

### Heading Level Indentation {#heading-level-indentation}

H3 headings are indented relative to h2 headings by adding a `pl-2` class to the list item. The active heading receives a distinct background and text color.

```ts
const buildHeadings = () =>
  readHeadings().map((h) => ({
    level: h.level,
    slug: h.slug,
    text: h.text,
    liClass: h.level === 3 ? "pl-2" : "",
    itemClass: h.slug === activeSlug ? ACTIVE_CLASS : NORMAL_CLASS,
  }));
```

## Search View {#search-view}

The search view provides a full-text search modal powered by MiniSearch, the same engine used by VitePress. It supports prefix matching, fuzzy matching, and field-weighted scoring.

### Lazy Index Construction {#lazy-index-construction}

The search index is built on the first query, not at application startup. The `ensureMiniSearch()` function loads the search index from State (a function that returns all page entries), validates the data shape, and constructs the MiniSearch instance.

```ts
async function ensureMiniSearch() {
  if (mini) return mini;
  const fnParse = GetSearchIndexSchema.safeParse(State.get("getSearchIndex"));
  if (!fnParse.success) return null;

  const rawIndex = await fnParse.data();
  const indexParse = z.array(SearchEntrySchema).safeParse(rawIndex);
  if (!indexParse.success) return null;

  const index = indexParse.data;
  const docs = index.map((entry, i) => ({ ...entry, id: i }));
  mini = new MiniSearch({
    fields: ["title", "headings", "excerpt"],
    storeFields: ["title", "link", "headings", "excerpt"],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { title: 2, headings: 1.5 },
    },
  });
  mini.addAll(docs);
  return mini;
}
```

The `boost` option gives title matches twice the weight of heading matches, and heading matches 1.5 times the weight of excerpt matches. The `fuzzy: 0.2` setting allows up to 20% of the query term's characters to differ from the indexed term, enabling typo tolerance.

### Modal Open and Close {#modal-open-and-close}

The search modal's visibility is driven by `State.searchOpen`. The layout's navbar button sets this value to `true`, and clicking the modal backdrop sets it back to `false`.

```ts
ctx.observeState("searchOpen");

const assign = () => {
  ctx.updater.snapshot();
  const isOpen = !!State.get("searchOpen");
  ctx.updater.set({
    isOpen,
    modalClass: isOpen ? "modal modal-open" : "modal",
  });
  return ctx.updater.altered();
};
```

When the modal opens, the search input is focused via `requestAnimationFrame` to ensure the DOM has settled after the render.

```ts
ctx.renderMethod = () => {
  assign();
  ctx.updater.digest();
  if (ctx.updater.get("isOpen")) {
    requestAnimationFrame(() => {
      const el = document.getElementById("docs-search-input");
      if (el instanceof HTMLInputElement) el.focus();
    });
  }
};
```

### Result Highlighting {#result-highlighting}

Search results are highlighted by wrapping each query term in `<mark>` tags. The `highlightMatch` function escapes special regex characters, then replaces each term occurrence.

```ts
function highlightMatch(text, query) {
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

The highlighted HTML is rendered using the raw output operator `{{!}}` in the template, which bypasses HTML escaping.

### Search Input Handling {#search-input-handling}

The `onSearchInput<input>` event handler reads the query from the input element, runs the search, and updates the results. Empty queries clear the results and reset the `hasSearched` flag so the template shows the initial "Type to search..." message.

```ts
"onSearchInput<input>": async (e) => {
  const input = e.target instanceof HTMLInputElement ? e.target : null;
  const query = input?.value ?? "";

  if (!query.trim()) {
    ctx.updater
      .set({ results: [], hasSearched: false, query: "" })
      .digest();
    return;
  }

  const m = await ensureMiniSearch();
  const raw = m ? m.search(query) : [];
  const results = raw.map((r) => ({
    title: r.title || "",
    link: r.link || "",
    excerpt: r.excerpt || "",
    highlightedTitle: highlightMatch(r.title || "", query),
    highlightedExcerpt: highlightMatch(r.excerpt || "", query),
  }));

  ctx.updater.set({ results, hasSearched: true, query }).digest();
},
```

### Result Navigation {#result-navigation}

Clicking a search result navigates to the page and closes the modal. The click handler walks up the DOM to find the element with `data-href`, then calls `Router.to()` and sets `searchOpen` to `false`.

```ts
"goToResult<click>": (e) => {
  let el = e.target instanceof HTMLElement ? e.target : null;
  while (el && !el.dataset["href"]) el = el.parentElement;
  const href = el ? (el.dataset["href"] ?? null) : null;
  if (href) {
    Router.to(href);
    State.set({ searchOpen: false }).digest();
  }
},
```

## Local Search Client {#local-search-client}

When the configuration uses `search.provider: "docsearch"`, the Algolia DocSearch widget is mounted but backed by a local search client instead of Algolia's hosted API. The `createLocalSearchClient()` function produces an Algolia-compatible client that queries the local index.

```ts
export function createLocalSearchClient(index) {
  return {
    async search(requests) {
      const results = requests.map((request) => {
        const { query, hitsPerPage = 20 } = request.params;
        if (!query?.trim()) return emptyResult();

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

The local scoring uses AND logic: all query terms must match at least one field. Title matches score 10 points per term, heading matches score 5, and excerpt matches score 1. Results are sorted by score descending.

The client is injected into DocSearch via `transformSearchClient`, which wraps the original client in a Proxy that intercepts `search` calls and routes them to the local implementation.

```ts
docsearch({
  container,
  appId: "local",
  apiKey: "local",
  indexName: "local",
  transformSearchClient: (client) => {
    return new Proxy(client, {
      get(target, prop, receiver) {
        if (prop === "search") return localClient.search;
        return Reflect.get(target, prop, receiver);
      },
    });
  },
});
```

## Template Syntax {#template-syntax}

The theme templates use swifty-mvc's template language, which provides interpolation, conditionals, loops, and event binding. Templates are pre-compiled during the library build in both string and VDOM modes.

### Interpolation {#interpolation}

The `{{=expr}}` operator inserts an escaped value. The `{{!expr}}` operator inserts raw HTML without escaping, used for content that is already sanitized.

```html
<!-- Escaped: safe for user-provided text -->
<a>{{=item.text}}</a>

<!-- Raw: used for pre-rendered HTML and SVG icons -->
<article class="prose">{{!contentHtml}}</article>
<span>{{!icons.search}}</span>
```

### Conditionals {#conditionals}

The `{{if}}`, `{{else if}}`, `{{else}}`, and `{{/if}}` blocks control conditional rendering.

```html
{{if searchProvider === "local"}}
<button @click="openSearch()">Search</button>
{{else if searchProvider === "docsearch"}}
<div id="docsearch-container"></div>
{{/if}}
```

### Loops {#loops}

The `{{each array as item index}}` block iterates over an array. The index variable is optional.

```html
{{each navItems as item idx}}
<li>
  <a data-href="{{=item.link}}" @click="navigateTo()"> {{=item.text}} </a>
</li>
{{/each}}
```

### Event Binding {#event-binding}

The `@event="handler()"` syntax binds DOM events to view methods. The handler name must match a key in the view's `events` object, suffixed with the event type in angle brackets.

```html
<button @click="openSearch()">Open</button> <input @input="onSearchInput()" />
```

In the view definition, these map to:

```ts
events: {
  "openSearch<click>": (e) => { ... },
  "onSearchInput<input>": (e) => { ... },
}
```

### Sub-view Mounting {#sub-view-mounting}

Sub-views are mounted using the `v-swifty` attribute, which references a registered view by its namespace.

```html
<div v-swifty="theme/sidebar"></div>
<div v-swifty="theme/toc"></div>
<div v-swifty="theme/search"></div>
```

The swifty-mvc framework resolves these references and instantiates the corresponding view classes.

## Styling with Tailwind and DaisyUI {#styling-with-tailwind-and-daisyui}

All theme styles are written in Tailwind CSS utility classes, with DaisyUI providing the component layer. No custom CSS files are shipped with the theme; every visual property is expressed through utility classes in the templates.

### DaisyUI Components {#daisyui-components}

The theme uses several DaisyUI component classes:

- `navbar` — the top navigation bar with `navbar-start`, `navbar-center`, and `navbar-end` sections.
- `menu` — vertical and horizontal navigation menus with `menu-sm` and `menu-xs` size variants.
- `btn` — buttons with variants like `btn-ghost`, `btn-circle`, `btn-outline`, and size modifiers like `btn-sm` and `btn-xs`.
- `modal` — the search dialog overlay, toggled by adding the `modal-open` class.
- `input` — the search text field with `input-sm` sizing.
- `kbd` — keyboard shortcut indicators, used for the Escape key hint in the search modal.

### Color Tokens {#color-tokens}

DaisyUI's semantic color tokens are used throughout the theme:

- `bg-base-100` and `bg-base-200` — page and section backgrounds.
- `text-base-content` — primary text color, with opacity modifiers like `text-base-content/60` for secondary text.
- `text-primary` — accent color for active items and links.
- `border-base-200` and `border-base-300` — border colors for dividers and outlines.

These tokens automatically adapt when a DaisyUI theme is changed, so the theme's appearance can be customized by switching the active DaisyUI theme in the Tailwind configuration.

### Prose Typography {#prose-typography}

The main content area uses Tailwind's Typography plugin via the `prose` and `prose-sm` classes. This provides consistent styling for Markdown-rendered HTML, including headings, paragraphs, lists, code blocks, and tables.

```html
<article class="prose prose-sm max-w-none">{{!contentHtml}}</article>
```

The `max-w-none` modifier removes the default max-width constraint so the content fills the available column width.

## Responsive Behavior {#responsive-behavior}

The layout uses Tailwind's responsive prefixes to adapt to different screen sizes. The breakpoints follow Tailwind's defaults: `lg` at 1024px and `xl` at 1280px.

### Sidebar Visibility {#sidebar-visibility}

The sidebar is hidden on screens smaller than `lg` (1024px) and visible on larger screens. It uses `hidden lg:block` to achieve this.

```html
<aside
  class="sticky top-11 hidden h-[calc(100vh-2.75rem)] w-56 shrink-0 overflow-y-auto border-r py-3 lg:block"
>
  <div v-swifty="theme/sidebar"></div>
</aside>
```

### Table of Contents Visibility {#table-of-contents-visibility}

The table of contents is hidden on screens smaller than `xl` (1280px) and visible on larger screens. It uses `hidden xl:block`.

```html
<aside
  class="sticky top-11 hidden h-[calc(100vh-2.75rem)] w-48 shrink-0 overflow-y-auto py-3 xl:block"
>
  <div v-swifty="theme/toc"></div>
</aside>
```

On screens between 1024px and 1280px, only the sidebar is visible. On screens below 1024px, neither the sidebar nor the table of contents is shown, and the content fills the full width.

### Navbar Layout {#navbar-layout}

The navbar's center section (top navigation links) is hidden on screens smaller than `lg`. On mobile, only the site title and search button are visible.

```html
<div class="navbar-center hidden lg:flex">
  <ul class="menu menu-sm menu-horizontal gap-0.5 px-1">
    {{each navItems as item idx}}
    <li>...</li>
    {{/each}}
  </ul>
</div>
```

### Sticky Positioning {#sticky-positioning}

Both the sidebar and the table of contents use `sticky` positioning with `top-11` (2.75rem) to stay visible as the user scrolls. The height is calculated as `100vh - 2.75rem` to account for the navbar height. The navbar itself uses `sticky top-0` with a backdrop blur effect.

```html
<div
  class="navbar bg-base-100/80 border-base-200 sticky top-0 z-50 border-b py-0 backdrop-blur"
></div>
```

## Next Steps {#next-steps}

- [Search](./search) -- how the local search engine and DocSearch integration work.
- [Configuration](./configuration) -- full reference for `defineConfig` options that control theme behavior.
- [Markdown Features](./markdown) -- extended Markdown syntax supported by swifty-docs.
