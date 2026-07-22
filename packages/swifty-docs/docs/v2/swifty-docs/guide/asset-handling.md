# Asset Handling

swifty-docs processes assets through several distinct pipelines: static files in the public directory, CSS and styling built on Tailwind and daisyUI, HTML templates and SVG icons that form the theme, generated runtime modules produced at configuration time, and the final build output. This page explains where each asset lives, how the build pipeline transforms it, and how consumer projects integrate with the system.

## Public Directory

Static files that bypass the bundler live in the `public/` directory. Vite, Webpack, and Rspack all serve these files at the root of the dev server and copy them verbatim into the build output.

```
public/
  favicon.svg
  favicon.ico
  apple-touch-icon-180x180.png
  pwa-64x64.png
  pwa-192x192.png
  pwa-512x512.png
  maskable-icon-512x512.png
```

The HTML entry (`app/index.html`) references these assets with root-relative paths:

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="48x48" />
<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```

The PWA icon files (`pwa-64x64.png` through `maskable-icon-512x512.png`) are referenced by the `vite-plugin-pwa` manifest configuration rather than by direct HTML tags. The workbox configuration uses `globPatterns: ["**/*.{js,css,html,svg,png,woff2}"]` to cache all static asset types in the service worker.

In consumer projects, the public directory is configured via the bundler's standard option (`publicDir` in Vite, `CopyWebpackPlugin` in Webpack, or the equivalent in Rspack).

## CSS and Styling

The stylesheet pipeline layers Tailwind CSS, the `@tailwindcss/typography` plugin, and daisyUI v5 on top of a base `client.css` that ships with the library.

### client.css

`client.css` is the stylesheet that the swifty-docs library distributes to consumers. It lives at `src/client.css` in the source tree and is copied to `dist/client.css` during the library build by the `copyAssetsPlugin`. The file provides:

- Tailwind import via `@import "tailwindcss"`
- The `@tailwindcss/typography` plugin for prose styling
- `@source` directives that tell Tailwind where to scan for class names in the theme templates
- daisyUI v5 plugin configuration with light and dark themes
- Focus style overrides for daisyUI input and textarea components
- Compact prose overrides that reduce default heading sizes, spacing, and margins for documentation content
- Search result highlighting for MiniSearch `mark` wrappers

Consumers import `client.css` from the installed package in their main CSS entry point.

### main.css

`app/main.css` is the documentation site's own stylesheet. It imports `tailwindcss` and `../src/client.css`, then adds site-specific customizations:

```css
@import "tailwindcss";
@import "../src/client.css";

@source "../src/theme/*.html";
@source "../src/theme/*.ts";

@plugin "daisyui" {
  themes:
    light --default,
    dark --prefersdark;
}

@plugin "@tailwindcss/typography";
```

Consumer projects replace the relative import with the package path and point `@source` at the installed theme:

```css
@import "tailwindcss";
@import "swifty-docs/client.css";

@source "../node_modules/swifty-docs/dist/theme.js";

@plugin "daisyui" {
  themes:
    light --default,
    dark --prefersdark;
}

@plugin "@tailwindcss/typography";
```

### Typography Plugin

The `@tailwindcss/typography` plugin provides the `prose` class that wraps rendered Markdown content. The layout template applies `prose prose-sm max-w-none` to the article element:

```html
<article class="prose prose-sm max-w-none">{{!contentHtml}}</article>
```

`client.css` overrides several default prose rules to produce a more compact documentation layout. Heading levels h1 through h6 use reduced sizes (`text-xl`, `text-lg`, `text-base`, `text-sm`) and tighter margins. Paragraphs, lists, blockquotes, and tables have compressed vertical spacing. Links use `text-primary` with no underline until hover. Code blocks receive a border with rounded corners and reduced font size.

### daisyUI Theme

daisyUI v5 provides the component classes used throughout the theme templates: `navbar`, `menu`, `btn`, `modal`, `input`, `kbd`, and others. The theme configuration activates two built-in themes:

- `light` as the default theme
- `dark` activated by `prefers-color-scheme: dark`

Consumer projects can override the daisyUI CSS custom properties to change the color palette without modifying templates:

```css
:root {
  --color-primary: #86b89a;
  --color-primary-content: #1a2e22;
  --color-base-100: #fafcfa;
  --color-base-200: #edf3ee;
  --color-base-300: #dce5dd;
  --color-base-content: #2a332c;
}
```

### Font Stack

The main CSS entry defines `--font-sans` and `--font-mono` through Tailwind's `@theme` directive. The default stack prioritizes programming fonts (Iosevka, Maple Mono, Menlo, Cascadia Code) with CJK fallbacks (Sarasa Gothic SC, PingFang SC, Microsoft YaHei). The `@font-face` declarations for custom web fonts such as Geist Mono can be added in consumer projects.

## Theme Assets

The default theme consists of HTML templates, an icon registry, and TypeScript view definitions that compile the templates and register them with swifty-mvc.

### HTML Templates

Five files live in `src/theme/`:

- `docs-layout.html` -- the top-level layout with navbar, sidebar, main content area, table of contents, and search modal
- `sidebar.html` -- the left sidebar navigation tree
- `toc.html` -- the right-side table of contents with heading links
- `search.html` -- the search modal with input field and results list
- `docs-search-local.ts` -- the DocSearch local search client adapter that wraps the local search index in an Algolia-compatible client interface

Templates use the swifty-mvc template syntax: `{{=variable}}` for text interpolation, `{{!raw}}` for unescaped HTML, `{{if condition}}` for conditional blocks, and `{{each collection as item}}` for iteration. Event handlers are declared with `@click="handlerName()"` attributes.

During the library build, the `themeDualMode` Vite plugin compiles each template in two modes: string rendering and VDOM rendering. The compiled output is stored in virtual modules (`virtual:swifty-docs/docs-layout`, `virtual:swifty-docs/sidebar`, `virtual:swifty-docs/toc`, `virtual:swifty-docs/search`), each exporting `{ __str, __vdom }`. At runtime, `registerThemeViews()` selects the correct version based on the consumer's `FrameworkConfig.vdom` setting.

### SVG Icons

Icons are imported as raw SVG strings from the `lucide-static` package using Vite's `?raw` suffix:

```ts
import search from "lucide-static/icons/search.svg?raw";

export const icons = { search };
```

The `icons` object is passed to the template via `updater.set({ icons })` in the layout view's setup function. Templates render icons with the raw output operator:

```html
<span class="h-3.5 w-3.5 [&>svg]:h-full [&>svg]:w-full">
  {{!icons.search}}
</span>
```

SVG icons inherit `currentColor` from their parent container, so color is controlled via Tailwind text-color utilities on the wrapper element. To add new icons, import the corresponding SVG from `lucide-static` and add it to the `icons` export.

### Theme Registration

The `registerThemeViews()` function in `src/theme/index.ts` registers all four theme views with the swifty-mvc view registry in a single call. It accepts an optional `vdom` flag to select the template compilation mode:

```ts
registerThemeViews({ vdom: config.vdom });
```

Each view factory (`createDocsLayoutView`, `createSidebarView`, `createTocView`, `createSearchView`) is also exported individually for consumers who want to override specific theme components.

## Generated Files

`defineConfig()` runs during the bundler configuration phase and produces a runtime module that the application imports at boot time.

### .swifty-docs/generated/

The generated directory is created at `{projectRoot}/.swifty-docs/generated/`. It contains a single file, `index.js`, rendered from the `file-content.ejs` template. The generated module exports:

- `loadContent(path)` -- dynamically imports the compiled `.md` module for a given route path and returns `{ pageData, contentHtml }`
- `routes` -- a mapping from route paths to the layout view ID (`"theme/docs-layout"`)
- `docsConfig` -- the serialized runtime configuration (title, description, baseUrl, nav, sidebar)
- `getSearchIndex()` -- lazily loads all `.md` modules on first call and builds a `SearchEntry[]` array with title, link, headings, and excerpt per page

The generated file uses relative paths for dynamic import specifiers so it is portable across machines and CI environments.

### Route Scanning

The scanner (`src/scanner.ts`) walks the docs directory recursively and produces `DocsRoute` entries for every `.md` file. Files and directories starting with `_` or `.` are skipped, as are `node_modules`, `__tests__`, `__fixtures__`, `.git`, `.vitepress`, `.swifty-docs`, and `dist`. Routing rules:

- `index.md` maps to the directory path without a trailing slash
- Other `.md` files map to their filename stem
- Directories without `index.md` receive a virtual index route that points to the first page by `sidebar_position` or filename order
- Files with `draft: true` in frontmatter are excluded when `excludeDrafts` is set

### Sidebar Generation

When a sidebar prefix is configured as `"auto"`, the sidebar generator groups routes by subdirectory, sorts them by `sidebar_position` frontmatter (with alphabetical fallback), and labels them by `sidebar_label` frontmatter or derived filenames. Manual sidebar configuration uses explicit `SidebarItem[]` arrays per path prefix.

### TypeScript Declarations

`client.d.ts` provides ambient module declarations for the generated route map and content loader. Consumer projects reference it via a triple-slash directive in their boot file:

```ts
/// <reference types="swifty-docs/client" />
```

This enables type checking for `@swifty-docs/generated` imports without requiring a generated `.d.ts` file alongside the `.js` output.

## Build Output

swifty-docs produces two distinct build outputs depending on the mode.

### Library Build (dist/)

The library build, triggered by `--mode lib`, produces the publishable npm package. The build uses Vite's library mode with Rollup and outputs:

- ESM and CJS bundles for each entry point: `index`, `compiler`, `vite`, `webpack`, `rspack`, `runtime`, and `theme`
- ESM files use `.js` extension, CJS files use `.cjs`
- TypeScript declaration files via `vite-plugin-dts`
- Static assets copied from `src/` to `dist/`: `file-content.ejs`, `client.d.ts`, `client.css`
- External packages are not bundled: `js-yaml`, `lucide-static`, `markdown-it`, `markdown-it-container`, `shiki`, `swifty-mvc`, `@tailwindcss/typography`, `daisyui`, `tailwindcss`, and Node.js built-ins

The `themeDualMode` plugin compiles theme HTML templates into both string and VDOM modes during this build. A `cjs-shims` plugin injects `__filename` and `__dirname` ESM shims into chunks that reference them (webpack.ts and rspack.ts use `__filename` as a loader self-reference).

### Documentation Site Build (dist-docs/)

The documentation site build, triggered by `--mode docs` with `vite build`, produces a static site in `dist-docs/`. The Vite configuration sets:

- `root` to the `app/` directory
- `publicDir` to the `public/` directory
- `base` to `/swifty/` in production (or `/` in dev)
- `build.outDir` to `dist-docs/`

The build processes all Markdown files through `compileMarkdown()`, which extracts frontmatter, initializes the Shiki highlighter as a lazy singleton, parses the Markdown body with markdown-it and four plugins (anchors, TOC extraction, containers, code blocks), renders to HTML, and emits a JavaScript module exporting `pageData` and `contentHtml`. The Tailwind CSS pipeline scans theme templates for class names and produces a purged stylesheet. The `vite-plugin-pwa` integration generates a service worker and web app manifest.

### Markdown Compilation Pipeline

Each `.md` file passes through a five-stage pipeline at build time:

1. YAML frontmatter extraction via `js-yaml`
2. Shiki highlighter initialization (lazy, cached as singleton)
3. Markdown parsing to token stream via `markdown-it` with four plugins
4. Token rendering to HTML with syntax-highlighted code blocks
5. JavaScript module generation exporting `pageData` and `contentHtml`

No Markdown parsing occurs in the browser. The compiled module is a plain JavaScript file that the bundler treats as a standard ES module.

## Integration in Consumer Projects

A consumer project integrates the asset pipelines by:

1. Importing `swifty-docs/client.css` in the main stylesheet and configuring Tailwind `@source` to scan the installed theme module
2. Calling `registerThemeViews()` in the boot file before `Framework.boot()`
3. Importing routes, docsConfig, loadContent, and getSearchIndex from `@swifty-docs/generated`
4. Placing static assets (favicons, PWA icons) in the project's public directory
5. Configuring the bundler plugin (`swiftyDocsPlugin` for Vite, `SwiftyDocsPlugin` for Webpack/Rspack) with the `DocsConfig` object

The Vite resolve alias `@swifty-docs/generated` points to `{projectRoot}/.swifty-docs/generated/` so the generated module is importable by a clean specifier regardless of the project's directory structure.
