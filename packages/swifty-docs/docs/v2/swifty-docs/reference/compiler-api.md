# Compiler API Reference

This page documents the programmatic API surface of swifty-docs. All exports described here are build-time utilities intended for use in bundler plugins, scripts, and advanced integrations.

## compileMarkdown

`compileMarkdown(source, options)` is the core compiler entry point. It transforms a Markdown source string into a JavaScript module string that exports `pageData` and `contentHtml`.

Import it from the compiler sub-path:

```ts
import { compileMarkdown } from "swifty-docs/compiler";
```

### Signature

```ts
async function compileMarkdown(
  source: string,
  options: CompileMarkdownOptions,
): Promise<string>;
```

The function is async because the first call initializes the Shiki highlighter, which loads WASM and TextMate grammars. The highlighter is cached as a singleton, so subsequent calls resolve instantly.

### CompileMarkdownOptions

```ts
interface CompileMarkdownOptions {
  config: DocsConfig;
  filePath: string;
  debug?: boolean;
  projectRoot?: string;
}
```

| Field       | Type       | Description                                                                                                                    |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| config      | DocsConfig | The full docs configuration object.                                                                                            |
| filePath    | string     | Absolute path to the `.md` file being compiled. Used to derive `relativePath` and for the source comment in the output module. |
| debug       | boolean    | Enable debug line markers and verbose logging. Default: `false`.                                                               |
| projectRoot | string     | Project root used to resolve relative `config.docs` and compute `relativePath`. Default: `process.cwd()`.                      |

### Output Module

The returned string is a valid JavaScript module. It exports:

```ts
export const pageData = {
  title: string,
  description: string,
  excerpt: string,
  sidebarPosition?: number,
  sidebarLabel?: string,
  sidebarGroup?: string,
  draft?: boolean,
  headings: HeadingInfo[],
  relativePath: string,
};

export const contentHtml = "<div>...</div>";
```

The `description` field is always present -- it is set unconditionally from either the frontmatter `description` field or the path-derived title. `contentHtml` is emitted as a JSON string literal so that HTML is safely embedded without template-literal interpolation issues.

### Pipeline Steps

`compileMarkdown` executes the following steps in order:

1. Extract YAML frontmatter via `js-yaml`.
2. Initialize the Shiki highlighter if `config.highlight` is set.
3. Parse the Markdown body into a token stream using `markdown-it` with the configured plugins.
4. Render tokens to an HTML string, with syntax-highlighted code blocks.
5. Extract page metadata (title, description, excerpt, sidebar position/label/group, draft flag, headings).
6. Wrap the HTML and metadata in a JavaScript module string.

## Markdown Pipeline Components

The compiler is composed of several internal modules located under `packages/swifty-docs/src/markdown/`. Each module is responsible for a single stage of the pipeline.

Note: The following modules (frontmatter, parser, renderer, highlighter) are internal implementation details and are not exported via any public sub-path in the package.json exports map. They are documented here for reference, but consumer projects should use the `compileMarkdown` entry point instead of importing these modules directly.

### frontmatter

Extracts the YAML frontmatter block from the top of a Markdown file.

```ts
// Internal module -- not available via public import
// Source: src/markdown/frontmatter.ts
function extractFrontmatter(source: string): FrontmatterResult;
```

```ts
interface FrontmatterResult {
  data: Record<string, unknown>;
  content: string;
}
```

Returns the parsed YAML object in `data` and the remaining Markdown body with the frontmatter stripped in `content`.

### parser

Creates a configured `markdown-it` instance with the swifty-docs plugin set.

```ts
// Internal module -- not available via public import
// Source: src/markdown/parser.ts
function createParser(options?: MarkdownOptions): MarkdownIt;
```

The parser is configured with heading anchors, custom containers (tip, warning, danger, details), and table-of-contents extraction based on the provided `MarkdownOptions`.

### renderer

Converts a `markdown-it` token stream into an HTML string formatted for the swifty-mvc template engine.

```ts
// Internal module -- not available via public import
// Source: src/markdown/renderer.ts
function renderToSwiftyTemplate(tokens: Token[], md: MarkdownIt): string;
```

### highlighter

Manages the Shiki highlighter singleton used for code block syntax highlighting.

```ts
// Internal module -- not available via public import
// Source: src/markdown/highlighter.ts
async function getHighlighter(
  theme?: string,
  languages?: string[],
): Promise<Highlighter>;

function highlightCode(
  highlighter: Highlighter,
  code: string,
  lang: string,
  theme?: string,
): string;
```

The highlighter is initialized lazily on first use and cached globally. The default theme is `github-dark`.

### MarkdownOptions

Options that control the parser and renderer behavior:

```ts
interface MarkdownOptions {
  anchor?: { permalink?: boolean };
  toc?: { level?: number[] };
  containers?: Record<string, { label: string }>;
}
```

| Field            | Type     | Default         | Description                                                             |
| ---------------- | -------- | --------------- | ----------------------------------------------------------------------- |
| anchor.permalink | boolean  | `true`          | Generate anchor links for headings.                                     |
| toc.level        | number[] | `[2, 3]`        | Heading levels extracted for the table of contents.                     |
| containers       | Record   | Built-in labels | Custom labels for `tip`, `warning`, `danger`, and `details` containers. |

### Markdown Plugins

The parser includes the following plugin categories:

- Heading anchors: adds `id` attributes and permalink links to headings using `slugify`.
- Custom containers: recognizes `::: tip`, `::: warning`, `::: danger`, and `::: details` fenced blocks, rendering them with the configured labels.
- Table of contents: extracts heading text and slugs at the configured levels for TOC rendering.
- Code highlighting: when `config.highlight` is set, the `highlight` option on the `markdown-it` instance is replaced with a Shiki-backed function.

## Build-time Utilities

These utilities are exported from the bundler sub-paths (`swifty-docs/vite`, `swifty-docs/webpack`, `swifty-docs/rspack`) for use in build scripts and custom integrations.

### defineConfig

Type-safe configuration helper that accepts the config, scans the docs directory, generates routes and sidebar, and writes a runtime module to `.swifty-docs/generated/`.

```ts
import { defineConfig } from "swifty-docs/vite";
```

```ts
function defineConfig(config: DocsConfig, projectRoot?: string): DocsConfig;
```

`projectRoot` defaults to `process.cwd()`. The generated runtime module is written to `{projectRoot}/.swifty-docs/generated/index.js` and consumed via the `@swifty-docs/generated` alias.

### scanDocsDir

Recursively scans a docs directory to discover `.md` files, extracts frontmatter and headings from each, and produces `DocsRoute` entries.

```ts
import { scanDocsDir } from "swifty-docs/vite";
```

```ts
function scanDocsDir(
  docsDir: string,
  baseUrl: string,
  options?: { excludeDrafts?: boolean },
): DocsRoute[];
```

Routing rules:

- Files and directories starting with `_` or `.` are skipped.
- `index.md` maps to the directory path without a trailing slash.
- Other `.md` files map to their stem (for example, `config.md` becomes `/docs/guide/config`).
- Directories without `index.md` receive a virtual index route that points to the first page by `sidebar_position` or filename order. Virtual index routes are excluded from the sidebar to avoid duplicates.
- Files with `draft: true` in frontmatter are excluded when `excludeDrafts` is set.

Ignored directories: `node_modules`, `__tests__`, `__fixtures__`, `.git`, `.vitepress`, `.swifty-docs`, `dist`.

### generateSidebar

Auto-generates sidebar items for routes under a given path prefix.

```ts
import { generateSidebar } from "swifty-docs/vite";
```

```ts
function generateSidebar(
  routes: DocsRoute[],
  prefix: string,
  baseUrl: string,
): SidebarItem[];
```

Grouping rules:

1. Routes are grouped by their subdirectory under the prefix.
2. Within each group, items sort by `sidebarPosition` (frontmatter) and then alphabetically by title.
3. `index.md` becomes a top-level item and is not nested inside a group.
4. Nested directories become collapsible sub-groups.
5. Virtual index routes (`isDirectoryIndex: true`) are excluded.

The `baseUrl` parameter is accepted for API compatibility but is not used internally; the prefix already carries the full path.

### generateRouteMap

Generates the route map that maps route paths to viewIds.

```ts
import { generateRouteMap } from "swifty-docs/vite";
```

```ts
function generateRouteMap(routes: DocsRoute[]): Record<string, string>;
```

Returns a plain object where keys are URL paths (e.g., `"/docs/guide/getting-started"`) and values are viewId strings (e.g., `"guide-getting-started"`). This map is consumed by the swifty-mvc `Framework.boot({ routes })` call to wire URL paths to view classes.

### generateBootModule

Generates the boot module that initializes the swifty-mvc application with the docs routes and configuration.

```ts
import { generateBootModule } from "swifty-docs/vite";
```

```ts
function generateBootModule(routes: DocsRoute[], projectRoot?: string): string;
```

Returns a JavaScript module source string that imports every compiled docs view and registers it with `registerViewClass()`. The `projectRoot` parameter defaults to `process.cwd()` and is used to resolve relative import paths in the generated module.

### buildSearchIndex

Builds the static search index from scanned routes for use with the local search provider.

```ts
import { buildSearchIndex } from "swifty-docs/vite";
```

```ts
function buildSearchIndex(routes: DocsRoute[]): SearchEntry[];
```

Filters out draft pages (those with `draft: true` in frontmatter) and virtual index routes, then maps each remaining route to a `SearchEntry` object containing `title`, `link`, `headings`, and `excerpt` fields. The returned array is JSON-serializable and can be embedded in the generated runtime module.

## Bundler Plugins

Each bundler integration re-exports the build-time utilities listed above alongside its plugin or loader factory.

### Vite

```ts
import {
  swiftyDocsPlugin,
  defineConfig,
  scanDocsDir,
  generateSidebar,
  generateRouteMap,
  generateBootModule,
  buildSearchIndex,
} from "swifty-docs/vite";
```

```ts
function swiftyDocsPlugin(options: SwiftyDocsVitePluginOptions): Plugin[];

interface SwiftyDocsVitePluginOptions {
  config: DocsConfig;
  debug?: boolean;
  vdom?: boolean;
}
```

Returns an array of two Vite plugins: the swifty-docs Markdown compiler and the swifty-mvc template compiler.

### Webpack

```ts
import {
  swiftyDocsLoader,
  scanDocsDir,
  generateSidebar,
  generateRouteMap,
  generateBootModule,
  buildSearchIndex,
  SwiftyDocsPlugin,
} from "swifty-docs/webpack";
```

```ts
function swiftyDocsLoader(this: WebpackLoaderContext, source: string): void;

interface SwiftyDocsWebpackOptions {
  config: DocsConfig;
  debug?: boolean;
  test?: RegExp;
  exclude?: RegExp;
}

class SwiftyDocsPlugin {
  constructor(options: SwiftyDocsWebpackOptions);
  apply(compiler: WebpackCompiler): void;
}
```

The `swiftyDocsLoader` is a Webpack loader that compiles Markdown files through the `compileMarkdown` pipeline. The `SwiftyDocsPlugin` class is a Webpack plugin that automatically adds the loader rule to `module.rules` when applied, simplifying configuration.

### Rspack

```ts
import {
  swiftyDocsLoader,
  scanDocsDir,
  generateSidebar,
  generateRouteMap,
  generateBootModule,
  buildSearchIndex,
  SwiftyDocsPlugin,
} from "swifty-docs/rspack";
```

```ts
async function swiftyDocsLoader(
  this: RspackLoaderContext,
  source: string,
): Promise<string>;

interface SwiftyDocsRspackOptions {
  config: DocsConfig;
  debug?: boolean;
  test?: RegExp;
  exclude?: RegExp;
}

class SwiftyDocsPlugin {
  constructor(options: SwiftyDocsRspackOptions);
  apply(compiler: RspackCompiler): void;
}
```

The `swiftyDocsLoader` is a Rspack loader that returns a Promise directly (required for Rspack async loaders). The `SwiftyDocsPlugin` class is a Rspack plugin that automatically adds the loader rule to `module.rules` when applied.

## Heading Anchors

All heading elements rendered by the pipeline include an `id` attribute derived from the heading text via `slugify`. When `anchor.permalink` is enabled (the default), a clickable permalink is appended to each heading. The slug is also included in the `HeadingInfo` entries returned in `pageData.headings`, which the TOC view uses to render anchor links.

```ts
interface HeadingInfo {
  level: number;
  text: string;
  slug: string;
}
```

The `slugify` utility is also exported as a runtime utility from the main entry point:

```ts
import { slugify } from "swifty-docs";
```

```ts
function slugify(text: string): string;
```
