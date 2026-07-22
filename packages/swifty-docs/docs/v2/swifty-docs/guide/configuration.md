# Configuration

swifty-docs uses a `swifty-docs.config.ts` file at the project root to control the entire documentation site. This page explains every available option, how they interact, and how to build a complete configuration from scratch.

## defineConfig()

`defineConfig` is the type-safe helper that wraps your configuration object. It accepts a `DocsConfig` and an optional `projectRoot` (defaults to `process.cwd()`). When called, it scans the docs directory, generates sidebar data, and writes a runtime module to `.swifty-docs/generated/` so the boot file can import routes and site data through the `@swifty-docs/generated` alias.

```ts
import { defineConfig } from "swifty-docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Library",
});
```

The second argument is rarely needed. Pass it only when your docs directory is resolved relative to a directory other than the current working directory. Note that `import.meta.dirname` requires Node.js 20.11 or later. For broader compatibility, use `fileURLToPath(import.meta.url)` from `node:url` instead:

```ts
import { fileURLToPath } from "node:url";

export default defineConfig(
  { docs: "content", baseUrl: "/kb/", title: "Knowledge Base" },
  fileURLToPath(import.meta.url),
);
```

## DocsConfig interface

The full shape of the configuration object is:

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

Every property is documented below with its purpose, type, and default value.

## docs

- Type: `string`
- Default: `"docs"`

Path to the directory that contains your Markdown source files, resolved relative to `projectRoot`. Absolute paths are supported as well.

```ts
defineConfig({
  docs: "docs", // project-root-relative
  // docs: "/abs/path/to/content",  // absolute
});
```

The directory must exist before the build starts. `defineConfig` scans it recursively for `.md` files and turns each one into a route.

## baseUrl

- Type: `string`
- Default: `"/docs/"`

Prefix prepended to every generated route path. This controls where the documentation site is mounted inside your application.

```ts
defineConfig({
  baseUrl: "/docs/", // routes: /docs/guide/getting-started, ...
  // baseUrl: "/",     // routes at the root: /guide/getting-started
  // baseUrl: "/kb/",  // knowledge-base mount
});
```

Always include the leading and trailing slashes.

## title

- Type: `string`

Site title displayed in the navbar and used as the fallback `<title>` suffix.

```ts
defineConfig({
  title: "My Library",
});
```

## description

- Type: `string`
- Optional

Site-wide description rendered into the `<meta name="description">` tag. Individual pages can override this through frontmatter.

```ts
defineConfig({
  description: "Documentation for the My Library framework.",
});
```

## nav

- Type: `NavItem[]`
- Optional

Top navigation bar items. Each item has `text`, `link`, and an optional `items` array for nested dropdowns.

```ts
defineConfig({
  nav: [
    { text: "Guide", link: "/docs/guide/getting-started" },
    { text: "API", link: "/docs/api/overview" },
    {
      text: "Resources",
      link: "#",
      items: [
        { text: "GitHub", link: "https://github.com/..." },
        { text: "Changelog", link: "/docs/changelog" },
      ],
    },
  ],
});
```

The `NavItem` interface:

```ts
interface NavItem {
  text: string;
  link: string;
  items?: NavItem[];
}
```

External links open in a new tab automatically.

## sidebar

- Type: `Record<string, SidebarConfig>`
- Optional

Maps a route path prefix to a sidebar configuration. The key is the prefix (matching `baseUrl`-prefixed paths), and the value is either the string `"auto"` or an array of `SidebarItem` objects.

### Automatic sidebar

When the value is `"auto"`, swifty-docs walks the docs directory under that prefix and builds the sidebar tree from the filesystem structure. Directories become collapsible groups; files become leaf links. Ordering is controlled by `sidebar_position` in each file's frontmatter.

```ts
defineConfig({
  sidebar: {
    "/docs/guide/": "auto",
    "/docs/api/": "auto",
  },
});
```

### Manual sidebar

Pass an explicit array to control the exact structure, labels, and nesting.

```ts
defineConfig({
  sidebar: {
    "/docs/guide/": [
      {
        text: "Getting Started",
        link: "/docs/guide/getting-started",
      },
      {
        text: "Configuration",
        collapsed: false,
        items: [
          { text: "Basic", link: "/docs/guide/config/basic" },
          { text: "Advanced", link: "/docs/guide/config/advanced" },
        ],
      },
    ],
  },
});
```

The `SidebarItem` interface:

```ts
interface SidebarItem {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: SidebarItem[];
}
```

`link` is optional on group headers. `collapsed` defaults to `false` (the group starts expanded).

## markdown

- Type: `MarkdownOptions`
- Optional

Controls how Markdown source files are parsed and rendered.

```ts
interface MarkdownOptions {
  anchor?: { permalink?: boolean };
  toc?: { level?: number[] };
  containers?: Record<string, { label: string }>;
}
```

### anchor

Enable or disable permalink anchors on headings. When enabled, hovering over a heading reveals a clickable anchor link.

```ts
markdown: {
  anchor: { permalink: true },
}
```

### toc

Controls which heading levels are extracted for the table of contents displayed in the right-hand sidebar. The default is `[2, 3]` (h2 and h3).

```ts
markdown: {
  toc: { level: [2, 3, 4] },
}
```

### containers

Overrides the default labels for custom containers (`tip`, `warning`, `danger`, `details`).

```ts
markdown: {
  containers: {
    tip: { label: "Hint" },
    warning: { label: "Be aware" },
    danger: { label: "Danger" },
    details: { label: "More info" },
  },
}
```

## highlight

- Type: `HighlightOptions`
- Optional

Configures code syntax highlighting, powered by Shiki.

```ts
interface HighlightOptions {
  theme?: string;
  languages?: string[];
}
```

### theme

The Shiki theme name. Defaults to `"github-dark"`.

```ts
highlight: {
  theme: "github-light",
}
```

### languages

An explicit list of languages to preload. When omitted, common web languages are loaded automatically. Add languages here if you use less common grammars.

```ts
highlight: {
  languages: ["typescript", "tsx", "rust", "go", "python", "bash"],
}
```

## search

- Type: `SearchOptions`
- Optional

Controls the built-in search experience.

```ts
interface SearchOptions {
  provider?: "local" | "docsearch" | "none";
}
```

Three providers are available:

- `local` (default): a MiniSearch-powered modal with prefix matching, fuzzy matching, field-weighted scoring, and result highlighting. The same engine used by VitePress.
- `docsearch`: Algolia DocSearch UI widget backed by the local search index. No Algolia account is required.
- `none`: disable search entirely.

```ts
search: {
  provider: "local",
}
```

The search index is built lazily on the first search interaction, so it does not affect initial page load performance.

## Complete example

A production-ready configuration that exercises every option:

```ts
// swifty-docs.config.ts
import { defineConfig } from "swifty-docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Library",
  description: "Official documentation for the My Library framework.",

  nav: [
    { text: "Guide", link: "/docs/guide/getting-started" },
    { text: "API", link: "/docs/api/overview" },
    {
      text: "More",
      link: "#",
      items: [
        { text: "GitHub", link: "https://github.com/my-org/my-library" },
        { text: "Changelog", link: "/docs/changelog" },
      ],
    },
  ],

  sidebar: {
    "/docs/guide/": "auto",
    "/docs/api/": [
      {
        text: "Overview",
        link: "/docs/api/overview",
      },
      {
        text: "Core",
        collapsed: false,
        items: [
          { text: "defineConfig", link: "/docs/api/core/define-config" },
          { text: "createApp", link: "/docs/api/core/create-app" },
        ],
      },
      {
        text: "Plugins",
        collapsed: true,
        items: [
          { text: "Vite plugin", link: "/docs/api/plugins/vite" },
          { text: "Rspack plugin", link: "/docs/api/plugins/rspack" },
        ],
      },
    ],
  },

  markdown: {
    anchor: { permalink: true },
    toc: { level: [2, 3] },
    containers: {
      tip: { label: "Tip" },
      warning: { label: "Warning" },
    },
  },

  highlight: {
    theme: "github-dark",
    languages: [
      "typescript",
      "tsx",
      "javascript",
      "json",
      "bash",
      "css",
      "html",
    ],
  },

  search: {
    provider: "local",
  },
});
```

## Next steps

- [Getting Started](./getting-started) -- install swifty-docs and create your first page.
- [Markdown Features](./markdown) -- frontmatter, custom containers, and code blocks.
- [Deploy](./deploy) -- build and deploy the generated site.
