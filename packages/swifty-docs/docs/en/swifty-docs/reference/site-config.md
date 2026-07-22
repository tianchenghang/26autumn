---
title: Site Configuration
description: Complete reference for all Swifty Docs configuration options.
---

# Site Configuration {#site-configuration}

Swifty Docs is configured via the `defineConfig()` function in `swifty-docs.config.ts`. This page documents all available options.

## defineConfig {#define-config}

```ts
import { defineConfig } from "@swifty.js/docs";

export default defineConfig({
  docs: "docs",
  baseUrl: "/",
  title: "My Documentation",
});
```

The `defineConfig` function is an identity function that triggers route generation and writes the runtime module to `.swifty-docs/generated/index.js`.

## DocsConfig {#docs-config}

```ts
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

## Required fields {#required-fields}

### docs {#docs}

```ts
docs: string;
```

The source directory for Markdown files, relative to the project root.

```ts
docs: "docs";
docs: "content/documentation";
```

### baseUrl {#base-url}

```ts
baseUrl: string;
```

The URL prefix for all routes. Use `'/'` for root deployment or a subpath for nested deployment. Defaults to `"/docs/"`.

```ts
baseUrl: "/"; // https://example.com/
baseUrl: "/docs/"; // https://example.com/docs/
```

### title {#title}

```ts
title: string;
```

The site title, displayed in the navbar and browser tab.

```ts
title: "My Documentation";
```

## Optional fields {#optional-fields}

### description {#description}

```ts
description?: string
```

Meta description for SEO. Defaults to empty string.

```ts
description: "Documentation for my awesome project";
```

### nav {#nav}

```ts
nav?: NavItem[]
```

Top navigation bar items. Each item can be a simple link or a dropdown menu.

```ts
interface NavItem {
  text: string;
  link: string;
  items?: NavItem[];
}
```

**Examples:**

```ts
nav: [
  { text: "Guide", link: "/guide/introduction" },
  { text: "API", link: "/api/overview" },
  {
    text: "Resources",
    items: [
      { text: "GitHub", link: "https://github.com/my/project" },
      { text: "Examples", link: "https://examples.com" },
    ],
  },
];
```

### sidebar {#sidebar}

```ts
sidebar?: Record<string, SidebarConfig>
```

Sidebar configuration per URL prefix. Keys are path prefixes, values are either `'auto'` or an explicit array of sidebar items.

```ts
type SidebarConfig = "auto" | SidebarItem[];

interface SidebarItem {
  text: string;
  link?: string;
  items?: SidebarItem[];
  collapsed?: boolean;
}
```

**Auto-generated sidebar:**

```ts
sidebar: {
  '/guide/': 'auto',
  '/api/': 'auto'
}
```

**Explicit sidebar:**

```ts
sidebar: {
  '/guide/': [
    { text: 'Introduction', link: '/guide/introduction' },
    { text: 'Getting Started', link: '/guide/getting-started' },
    {
      text: 'Advanced',
      collapsed: false,
      items: [
        { text: 'Configuration', link: '/guide/configuration' },
        { text: 'Deployment', link: '/guide/deployment' }
      ]
    }
  ]
}
```

### markdown {#markdown}

```ts
markdown?: MarkdownOptions
```

Markdown parser configuration.

```ts
interface MarkdownOptions {
  anchor?: {
    permalink?: boolean; // show permalink symbol (default: true)
  };
  toc?: {
    level?: number[]; // TOC heading levels (default: [2, 3])
  };
  containers?: Record<string, { label: string }>;
}
```

**Example:**

```ts
markdown: {
  anchor: {
    permalink: true,
  },
  toc: {
    level: [2, 3]
  },
  containers: {
    tip: { label: 'Note' },
    warning: { label: 'Caution' }
  }
}
```

### highlight {#highlight}

```ts
highlight?: HighlightOptions
```

Syntax highlighting configuration.

```ts
interface HighlightOptions {
  theme?: string; // Shiki theme (default: 'github-dark')
  languages?: string[]; // languages to load (default: 44 languages)
}
```

**Example:**

```ts
highlight: {
  theme: 'github-light',
  languages: ['javascript', 'typescript', 'python', 'go']
}
```

Loading fewer languages reduces build time and bundle size.

### search {#search}

```ts
search?: SearchOptions
```

Search provider configuration.

```ts
interface SearchOptions {
  provider?: "local" | "docsearch" | "none";
}
```

**Local search (default):**

```ts
search: {
  provider: "local";
}
```

**DocSearch:**

```ts
search: {
  provider: 'docsearch',
}
```

**Disabled:**

```ts
search: {
  provider: "none";
}
```

## Complete example {#complete-example}

```ts
import { defineConfig } from "@swifty.js/docs";

export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Project",
  description: "Documentation for My Project",

  nav: [
    { text: "Guide", link: "/guide/introduction" },
    { text: "API", link: "/api/overview" },
    { text: "GitHub", link: "https://github.com/my/project" },
  ],

  sidebar: {
    "/guide/": "auto",
    "/api/": "auto",
  },

  markdown: {
    anchor: {
      permalink: true,
    },
    toc: {
      level: [2, 3],
    },
  },

  highlight: {
    theme: "github-dark",
    languages: ["javascript", "typescript", "python", "go", "rust"],
  },

  search: {
    provider: "local",
  },
});
```

## Next steps {#next-steps}

- [Frontmatter Config](/docs/en/swifty-docs/reference/frontmatter-config) — page-level metadata
- [Markdown Extensions](/docs/en/swifty-docs/guide/markdown) — syntax highlighting and containers
- [Theme Customization](/docs/en/swifty-docs/guide/theme) — customizing the layout
