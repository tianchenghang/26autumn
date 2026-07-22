# Site Config Reference

This page documents every option available in the `DocsConfig` interface, which is passed to `defineConfig()` in `swifty-docs.config.ts`. Each entry includes its type, default value, a description of its behavior, and a usage example.

## DocsConfig {#docsconfig}

The top-level configuration object for swifty-docs.

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

## docs {#docs}

- Type: `string`
- Default: `"docs"`

Path to the directory that contains your Markdown source files. The path is resolved relative to `projectRoot` (which defaults to `process.cwd()`). Absolute paths are also supported.

The directory must exist before the build starts. `defineConfig` scans it recursively for `.md` files and turns each one into a route.

```ts
defineConfig({
  docs: "docs",
});
```

Using an absolute path:

```ts
defineConfig({
  docs: "/Users/me/projects/my-lib/content",
});
```

## baseUrl {#baseurl}

- Type: `string`
- Default: `"/docs/"`

Prefix prepended to every generated route path. This controls where the documentation site is mounted inside your application. Always include both a leading and a trailing slash.

```ts
defineConfig({
  baseUrl: "/docs/",
});
```

Mounting the site at the root:

```ts
defineConfig({
  baseUrl: "/",
});
```

Mounting under a custom path:

```ts
defineConfig({
  baseUrl: "/kb/",
});
```

## title {#title}

- Type: `string`
- Required

Site title displayed in the navbar. Also used as the fallback suffix for the `<title>` tag on each page.

```ts
defineConfig({
  title: "My Library",
});
```

## description {#description}

- Type: `string`
- Optional

Site-wide description rendered into the `<meta name="description">` tag. Individual pages can override this through the `description` field in frontmatter.

```ts
defineConfig({
  description: "Official documentation for the My Library framework.",
});
```

## nav {#nav}

- Type: `NavItem[]`
- Optional

Top navigation bar items. Each item has a `text` label, a `link`, and an optional `items` array for nested dropdown menus. External links (those starting with `http://` or `https://`) open in a new tab automatically.

```ts
interface NavItem {
  text: string;
  link: string;
  items?: NavItem[];
}
```

Basic navigation with a dropdown:

```ts
defineConfig({
  nav: [
    { text: "Guide", link: "/docs/guide/getting-started" },
    { text: "API", link: "/docs/api/overview" },
    {
      text: "Resources",
      link: "#",
      items: [
        { text: "GitHub", link: "https://github.com/my-org/my-library" },
        { text: "Changelog", link: "/docs/changelog" },
      ],
    },
  ],
});
```

## sidebar {#sidebar}

- Type: `Record<string, SidebarConfig>`
- Optional

Maps a route path prefix to a sidebar configuration. The key is a path prefix that matches `baseUrl`-prefixed routes. The value is either the string `"auto"` or an array of `SidebarItem` objects.

```ts
type SidebarConfig = "auto" | SidebarItem[];
```

```ts
interface SidebarItem {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: SidebarItem[];
  // Runtime-only fields (set by sidebar view, not user-configurable):
  isActive?: boolean;
  itemClass?: string;
}
```

The `text`, `link`, `collapsed`, and `items` fields are user-configurable. The `isActive` and `itemClass` fields are set at runtime by the sidebar view to mark the current route and apply CSS classes -- they are not part of the user-facing configuration but are present on the interface for theme authors who read sidebar data at runtime.

### Automatic Sidebar {#sidebar-auto}

When the value is `"auto"`, swifty-docs walks the docs directory under that prefix and builds the sidebar tree from the filesystem structure. Directories become collapsible groups. Files become leaf links. Ordering is controlled by `sidebar_position` in each file's frontmatter.

```ts
defineConfig({
  sidebar: {
    "/docs/guide/": "auto",
    "/docs/api/": "auto",
  },
});
```

### Manual Sidebar {#sidebar-manual}

Pass an explicit array to control the exact structure, labels, and nesting. The `link` field is optional on group headers. The `collapsed` field defaults to `false` (the group starts expanded).

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

### Mixed Sidebar {#sidebar-mixed}

Different prefixes can use different strategies in the same configuration:

```ts
defineConfig({
  sidebar: {
    "/docs/guide/": "auto",
    "/docs/api/": [
      { text: "Overview", link: "/docs/api/overview" },
      { text: "Core", link: "/docs/api/core" },
    ],
  },
});
```

## markdown {#markdown}

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

### anchor {#markdown-anchor}

- Type: `{ permalink?: boolean }`
- Default: `{ permalink: true }`

Enable or disable permalink anchors on headings. When enabled, hovering over a heading reveals a clickable `#` anchor link. Headings from `h1` through `h3` receive permalinks; `h4` and below receive an `id` attribute but no visible link.

```ts
defineConfig({
  markdown: {
    anchor: { permalink: true },
  },
});
```

Disabling permalinks:

```ts
defineConfig({
  markdown: {
    anchor: { permalink: false },
  },
});
```

### toc {#markdown-toc}

- Type: `{ level?: number[] }`
- Default: `{ level: [2, 3] }`

Controls which heading levels are extracted for the table of contents displayed in the right-hand sidebar. The `[[toc]]` directive in Markdown content also respects this setting.

```ts
defineConfig({
  markdown: {
    toc: { level: [2, 3, 4] },
  },
});
```

Setting `level` to an empty array suppresses the table of contents entirely, which is useful for landing pages or API reference indexes:

```ts
defineConfig({
  markdown: {
    toc: { level: [] },
  },
});
```

### containers {#markdown-containers}

- Type: `Record<string, { label: string }>`
- Default: `{ tip: { label: "TIP" }, warning: { label: "WARNING" }, danger: { label: "DANGER" }, details: { label: "DETAILS" } }`

Overrides the default labels for custom containers. The four recognized container types are `tip`, `warning`, `danger`, and `details`. Each maps to an object with a `label` string that appears as the container header.

```ts
defineConfig({
  markdown: {
    containers: {
      tip: { label: "Hint" },
      warning: { label: "Be Careful" },
      danger: { label: "Stop" },
      details: { label: "More Info" },
    },
  },
});
```

Individual container types can also be overridden without affecting the others:

```ts
defineConfig({
  markdown: {
    containers: {
      tip: { label: "Pro Tip" },
    },
  },
});
```

## highlight {#highlight}

- Type: `HighlightOptions`
- Optional

Configures code syntax highlighting, powered by Shiki. When omitted, code blocks fall back to plain escaped rendering with Tailwind and daisyUI styling.

```ts
interface HighlightOptions {
  theme?: string;
  languages?: string[];
}
```

### theme {#highlight-theme}

- Type: `string`
- Default: `"github-dark"`

The Shiki theme name used for syntax highlighting. Any theme bundled with Shiki is supported.

```ts
defineConfig({
  highlight: {
    theme: "github-light",
  },
});
```

Other common theme values include `"one-dark-pro"`, `"dracula"`, `"monokai"`, and `"nord"`.

### languages {#highlight-languages}

- Type: `string[]`
- Default: common web languages (TypeScript, JavaScript, JSON, HTML, CSS, Bash)

An explicit list of languages to preload for syntax highlighting. When omitted, common web languages are loaded automatically. Add languages here if you use less common grammars such as Rust, Go, Python, or SQL.

```ts
defineConfig({
  highlight: {
    languages: ["typescript", "tsx", "rust", "go", "python", "bash"],
  },
});
```

If a fenced code block specifies a language that Shiki has not loaded, the renderer silently falls back to plain text instead of throwing an error.

## search {#search}

- Type: `SearchOptions`
- Optional

Controls the built-in search experience. The search index is built at compile time and loaded lazily in the browser on the first search interaction, so it does not affect initial page load performance.

```ts
interface SearchOptions {
  provider?: "local" | "docsearch" | "none";
}
```

### provider {#search-provider}

- Type: `"local" | "docsearch" | "none"`
- Default: `"local"`

Three providers are available:

`local` -- A MiniSearch-powered modal with prefix matching, fuzzy matching, field-weighted scoring, and result highlighting. This is the same search engine used by VitePress.

`docsearch` -- Algolia DocSearch UI widget backed by the local search index. Renders the styled DocSearch modal but queries the locally built index. No Algolia account or API keys are required.

`none` -- Disables search entirely. The search button is hidden from the navbar and the SearchView is not registered.

```ts
defineConfig({
  search: {
    provider: "local",
  },
});
```

Using DocSearch:

```ts
defineConfig({
  search: {
    provider: "docsearch",
  },
});
```

Disabling search:

```ts
defineConfig({
  search: {
    provider: "none",
  },
});
```

## Complete Example {#complete-example}

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
          { text: "Vite Plugin", link: "/docs/api/plugins/vite" },
          { text: "Rspack Plugin", link: "/docs/api/plugins/rspack" },
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

## defineConfig() {#defineconfig}

`defineConfig` is the type-safe helper that wraps your configuration object. It accepts a `DocsConfig` and an optional `projectRoot` (defaults to `process.cwd()`). When called, it scans the docs directory, generates sidebar data, and writes a runtime module to `.swifty-docs/generated/` so the boot file can import routes and site data through the `@swifty-docs/generated` alias.

```ts
function defineConfig(config: DocsConfig, projectRoot?: string): DocsConfig;
```

Returns the same `DocsConfig` object that was passed in. The primary purpose of calling this function is the side effect of writing the generated runtime module to `{projectRoot}/.swifty-docs/generated/index.js`.

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

## Related Pages {#related-pages}

- [Configuration Guide](../guide/configuration) -- a walkthrough of how to build a complete configuration from scratch.
- [CLI Reference](./cli) -- Vite commands used with swifty-docs.
- [Markdown Features](../guide/markdown) -- extended Markdown syntax supported by swifty-docs.
- [Sidebar](../guide/sidebar) -- detailed explanation of automatic and manual sidebar generation.
- [Search](../guide/search) -- how the local search engine and DocSearch integration work.
