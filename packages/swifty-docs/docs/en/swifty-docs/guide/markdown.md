---
title: Markdown Extensions
description: Custom containers, syntax highlighting, heading anchors, and other Markdown extensions.
---

# Markdown Extensions {#markdown-extensions}

Swifty Docs extends standard Markdown with custom containers, syntax highlighting, heading anchors, and more. This page documents all available extensions.

## Custom containers {#custom-containers}

Swifty Docs supports four container types, each styled with DaisyUI alert classes:

### Tip {#tip}

```markdown
::: tip
This is a helpful tip.
:::
```

Renders as a green alert box with a "TIP" label.

### Warning {#warning}

```markdown
::: warning
This is a warning message.
:::
```

Renders as a yellow alert box with a "WARNING" label.

### Danger {#danger}

```markdown
::: danger
This is a danger message.
:::
```

Renders as a red alert box with a "DANGER" label.

### Details {#details}

```markdown
::: details Click to expand
Hidden content goes here.
:::
```

Renders as a collapsible `<details>` element.

### Custom labels {#custom-labels}

You can customize the container label:

```markdown
::: tip Custom Label
This container has a custom label.
:::
```

## Syntax highlighting {#syntax-highlighting}

Swifty Docs uses [Shiki](https://shiki.style/) for syntax highlighting. Code blocks are highlighted with the configured theme (default: `github-dark`).

### Supported languages {#supported-languages}

44 languages are supported by default:

- JavaScript (`javascript`, `js`), TypeScript (`typescript`, `ts` — via `cts`/`mts`), JSX, TSX
- Go, GraphQL
- HTML, CSS, SCSS, LESS
- Bash (`bash`, `zsh`)
- SQL, YAML (`yaml`, `yml`), JSON (`json`, `json5`, `jsonc`, `jsonl`), TOML
- Markdown (`markdown`, `md`, `mdc`, `mdx`), Mermaid
- XML, CSV, HTTP
- Dockerfile (`docker`, `dockerfile`), Makefile (`make`, `makefile`)
- NGINX, Prisma, Protocol Buffers (`proto`, `protobuf`)
- Vue, WASM, dotenv
- CJS, MJS

### Code blocks {#code-blocks}

Use triple backticks with a language identifier:

````markdown
```javascript
const greeting = "Hello, World!";
console.log(greeting);
```
````

Renders as:

```javascript
const greeting = "Hello, World!";
console.log(greeting);
```

### Unknown languages {#unknown-languages}

If a language is not recognized, it falls back to plain text:

````markdown
```unknown-language
This will not be highlighted.
```
````

### Configuring languages {#configuring-languages}

You can configure which languages are loaded in `swifty-docs.config.ts`:

```ts
export default defineConfig({
  highlight: {
    theme: "github-dark",
    languages: ["javascript", "typescript", "python", "go", "rust"],
  },
});
```

Loading fewer languages reduces build time and bundle size.

## Heading anchors {#heading-anchors}

All headings automatically receive `id` attributes and permalink links:

```markdown
## Introduction
```

Renders as:

```html
<h2 id="introduction" class="scroll-mt-20">
  Introduction
  <a
    class="link link-hover text-base-content/30 no-underline"
    href="#introduction"
    >#</a
  >
</h2>
```

The permalink (`#`) appears on hover and links to the heading.

### Anchor configuration {#anchor-configuration}

You can configure anchor behavior in `swifty-docs.config.ts`:

```ts
export default defineConfig({
  markdown: {
    anchor: {
      permalink: true, // show permalink symbol (default: true)
    },
  },
});
```

### Disabling anchors {#disabling-anchors}

To disable anchors entirely:

```ts
export default defineConfig({
  markdown: {
    anchor: {
      permalink: false,
    },
  },
});
```

## Table of contents {#table-of-contents}

The `[[toc]]` directive generates a table of contents:

```markdown
[[toc]]

## Section 1

## Section 2

### Subsection 2.1

## Section 3
```

Renders as a list of links to all `<h2>` and `<h3>` headings on the page.

### TOC configuration {#toc-configuration}

Configure which heading levels are included:

```ts
export default defineConfig({
  markdown: {
    toc: {
      level: [2, 3], // include h2 and h3 (default: [2, 3])
    },
  },
});
```

## Link handling {#link-handling}

### Internal links {#internal-links}

Links to other documentation pages are automatically intercepted for client-side navigation:

```markdown
[Getting Started](/guide/getting-started)
```

The link is rendered with a `data-swifty-nav="true"` attribute, enabling fast navigation without full page reloads. At runtime, the layout and sidebar views use event delegation: a single `navigateTo` click handler on the document root catches clicks on elements carrying `data-swifty-nav` (or `data-href` for search results) and calls `Router.to(href)` to perform client-side routing instead of a full page load.

### External links {#external-links}

Links to external sites open in a new tab:

```markdown
[GitHub](https://github.com)
```

Renders as:

```html
<a href="https://github.com" target="_blank" rel="noopener noreferrer"
  >GitHub</a
>
```

## Raw HTML {#raw-html}

Swifty Docs allows raw HTML in Markdown files:

```markdown
<div class="custom-container">
  <p>This is raw HTML.</p>
</div>
```

The HTML is preserved in the compiled output.

## Frontmatter {#frontmatter}

YAML frontmatter is supported for page metadata:

```markdown
---
title: My Page
description: Page description for SEO
sidebar_position: 1
sidebar_label: Custom Label
sidebar_group: Guides
---

# Content starts here
```

### Frontmatter fields {#frontmatter-fields}

| Field              | Type      | Description                                 |
| ------------------ | --------- | ------------------------------------------- |
| `title`            | `string`  | Page title (used in browser tab and search) |
| `description`      | `string`  | Meta description for SEO                    |
| `sidebar_position` | `number`  | Sort order in auto-generated sidebar        |
| `sidebar_label`    | `string`  | Custom label in sidebar (overrides title)   |
| `sidebar_group`    | `string`  | Group name for clustering pages in sidebar  |
| `draft`            | `boolean` | Exclude from production builds if `true`    |

### Title resolution {#title-resolution}

The page title is resolved in this order:

1. `title` field in frontmatter
2. First `<h1>` heading in the content
3. Filename (derived from path)

## Images {#images}

Images are supported via standard Markdown syntax:

```markdown
![Alt text](./image.png)
```

For assets in the `public/` directory, use absolute paths:

```markdown
![Logo](/logo.svg)
```

## Next steps {#next-steps}

- [Configuration Reference](/docs/en/swifty-docs/reference/site-config) — all configuration options
- [Theme Customization](/docs/en/swifty-docs/guide/theme) — customizing the layout
- [Search](/docs/en/swifty-docs/guide/search) — full-text search configuration
