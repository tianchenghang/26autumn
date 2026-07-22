---
title: Theme Customization
description: Customizing the Swifty Docs theme — layout, sidebar, TOC, and search views.
---

# Theme Customization {#theme-customization}

Swifty Docs ships with a default theme built on Tailwind CSS and DaisyUI. The theme consists of four pluggable Views: layout, sidebar, TOC, and search. You can customize any or all of these views.

## Default theme {#default-theme}

The default theme provides a responsive three-column layout:

- Sticky navbar with site title and navigation links
- Left sidebar with auto-generated navigation (hidden on mobile)
- Main content area with prose styling
- Right TOC with scroll-spy highlighting (hidden on smaller screens)
- Search modal triggered by clicking the search icon

### Registering the default theme {#registering-default-theme}

```ts
import { registerThemeViews } from "@swifty.js/docs/theme";

registerThemeViews();
```

This registers all four theme views with their default templates.

## Customizing individual views {#customizing-views}

Each theme view is a factory function that accepts a template. You can provide a custom template to override the default:

### Custom layout {#custom-layout}

```ts
import { createDocsLayoutView } from "@swifty.js/docs/theme";
import customLayoutTemplate from "./custom-layout.html";

registerViewClass(
  "theme/docs-layout",
  createDocsLayoutView(customLayoutTemplate),
);
```

The layout template receives these variables:

```typescript
{
  icons: {
    search: string;
  }; // SVG icons
  siteTitle: string; // site title from config
  navItems: NavItem[]; // navigation links
  searchProvider: SearchProvider; // configured search provider
  contentHtml: string; // compiled Markdown HTML
  prevPage: { link: string; text: string } | null; // previous page link
  nextPage: { link: string; text: string } | null; // next page link
}
```

Note: `currentPageTitle` is published to the MVC State (not passed as a template variable), and `docsConfig` is consumed from State rather than passed directly to the template.

### Custom sidebar {#custom-sidebar}

```ts
import { createSidebarView } from "@swifty.js/docs/theme";
import customSidebarTemplate from "./custom-sidebar.html";

registerViewClass("theme/sidebar", createSidebarView(customSidebarTemplate));
```

The sidebar template receives:

```typescript
{
  sidebarGroups: {
    text: string;       // group title
    items: SidebarItem[]; // items in this group
  }[]
}
```

### Custom TOC {#custom-toc}

```ts
import { createTocView } from "@swifty.js/docs/theme";
import customTocTemplate from "./custom-toc.html";

registerViewClass("theme/toc", createTocView(customTocTemplate));
```

The TOC template receives:

```typescript
{
  headings: {
    id: string; // heading anchor id
    text: string; // heading text
    level: number; // heading level (2 or 3)
    liClass: string; // CSS class for the <li> wrapper
    itemClass: string; // CSS class for the link; active state is tracked per-heading via this field
  }
  [];
}
```

There is no single `activeHeadingId` field — active state is tracked per-heading via the `itemClass` field.

### Custom search {#custom-search}

```ts
import { createSearchView } from "@swifty.js/docs/theme";
import customSearchTemplate from "./custom-search.html";

registerViewClass("theme/search", createSearchView(customSearchTemplate));
```

The search template receives:

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

## Partial customization {#partial-customization}

You can override only the views you want to customize and use defaults for the rest:

```ts
import { registerThemeViews } from "@swifty.js/docs/theme";
import customLayoutTemplate from "./custom-layout.html";

// Register default theme, then override layout
registerThemeViews();
registerViewClass(
  "theme/docs-layout",
  createDocsLayoutView(customLayoutTemplate),
);
```

## Complete theme replacement {#complete-replacement}

To replace the entire theme, skip `registerThemeViews()` and register your own views:

```ts
import {
  createDocsLayoutView,
  createSidebarView,
  createTocView,
  createSearchView,
} from "@swifty.js/docs/theme";
import myLayout from "./my-layout.html";
import mySidebar from "./my-sidebar.html";
import myToc from "./my-toc.html";
import mySearch from "./my-search.html";

registerViewClass("theme/docs-layout", createDocsLayoutView(myLayout));
registerViewClass("theme/sidebar", createSidebarView(mySidebar));
registerViewClass("theme/toc", createTocView(myToc));
registerViewClass("theme/search", createSearchView(mySearch));
```

## Template syntax {#template-syntax}

Theme templates use the Swifty MVC template syntax:

```html
<div class="layout">
  <header>
    <h1>{{=siteTitle}}</h1>
  </header>
  <main>{{!contentHtml}}</main>
</div>
```

See the [Swifty MVC Template Syntax](/docs/en/swifty-mvc/guide/essentials/template-syntax) reference for the complete syntax.

## Styling {#styling}

The default theme uses Tailwind CSS and DaisyUI. You can customize styles by:

### Tailwind configuration {#tailwind-config}

Create a `tailwind.config.js`:

```js
export default {
  content: ["./docs/**/*.md", "./node_modules/@swifty.js/docs/dist/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: "#3b82f6",
      },
    },
  },
  plugins: [require("@tailwindcss/typography"), require("daisyui")],
};
```

### Custom CSS {#custom-css}

Import custom CSS in your entry point:

```ts
import "./custom.css";
```

```css
/* custom.css */
.prose h1 {
  font-size: 3rem;
  color: #1e40af;
}
```

## VDOM mode {#vdom-mode}

By default, theme templates compile to string-mode functions. You can enable VDOM mode:

```ts
registerThemeViews({ vdom: true });
```

VDOM mode provides more efficient updates for frequently changing views (e.g., search results).

## Next steps {#next-steps}

- [Search](/docs/en/swifty-docs/guide/search) — configuring full-text search
- [Configuration Reference](/docs/en/swifty-docs/reference/site-config) — all configuration options
- [API Reference](/docs/en/swifty-docs/api/overview) — theme factory functions
