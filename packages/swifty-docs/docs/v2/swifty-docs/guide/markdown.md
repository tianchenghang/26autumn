---
title: Markdown Features
description: Extended Markdown syntax supported by swifty-docs, including frontmatter, custom containers, table of contents, and code highlighting.
sidebar_position: 4
---

# Markdown Features

swifty-docs compiles every `.md` file into a JavaScript module that exports page data and rendered HTML. Under the hood it uses `markdown-it` as the parser and layers a set of custom plugins on top — heading anchors, the `[[toc]]` directive, admonition containers, Shiki syntax highlighting, and link interception for SPA navigation.

This page documents every extension with its Markdown input and the HTML output it produces.

[[toc]]

## Frontmatter {#frontmatter}

Every page may start with a YAML frontmatter block delimited by `---`. The block is parsed by `extractFrontmatter()` before the Markdown body reaches `markdown-it`.

Input:

```yaml
---
title: My Page Title
description: A short summary for SEO and sidebar display
sidebar_position: 3
sidebar_label: Custom Label
sidebar_group: Guide
draft: false
---
```

The recognized fields are:

| Field              | Type      | Description                                                                                        |
| ------------------ | --------- | -------------------------------------------------------------------------------------------------- |
| `title`            | `string`  | Page title. Falls back to the first `<h1>` in the body, then to a slug derived from the file path. |
| `description`      | `string`  | Used in `<meta name="description">` and search results. Falls back to the directory name.          |
| `sidebar_position` | `number`  | Controls the ordering inside the sidebar group. Lower numbers appear first.                        |
| `sidebar_label`    | `string`  | Overrides the sidebar link text. Defaults to `title`.                                              |
| `sidebar_group`    | `string`  | Assigns the page to a named sidebar group.                                                         |
| `draft`            | `boolean` | When `true`, the page is excluded from production builds.                                          |

All other fields are preserved on `pageData` and can be read by a custom theme.

Output — the frontmatter block is stripped from the body and exposed as a JSON object on the compiled module:

```json
{
  "title": "My Page Title",
  "description": "A short summary for SEO and sidebar display",
  "sidebar_position": 3,
  "sidebar_label": "Custom Label",
  "sidebar_group": "Guide",
  "draft": false
}
```

## Heading Anchors {#heading-anchors}

Every heading automatically receives an `id` attribute derived from its text content. For `h1` through `h3` headings, a `#` permalink is appended so readers can copy a deep link.

Input:

```md
## Heading Anchors

### A Subsection With Code

#### Level Four Has No Permalink
```

Output:

```html
<h2 id="heading-anchors" class="scroll-mt-20">
  Heading Anchors
  <a
    class="link link-hover text-base-content/30 no-underline"
    href="#heading-anchors"
    >#</a
  >
</h2>

<h3 id="a-subsection-with-code" class="scroll-mt-20">
  A Subsection With Code
  <a
    class="link link-hover text-base-content/30 no-underline"
    href="#a-subsection-with-code"
    >#</a
  >
</h3>

<h4 id="level-four-has-no-permalink" class="scroll-mt-20">
  Level Four Has No Permalink
</h4>
```

Duplicate slugs within the same document are disambiguated with a numeric suffix:

```md
## Notes

## Notes
```

```html
<h2 id="notes" class="scroll-mt-20">Notes <a href="#notes">#</a></h2>
<h2 id="notes-1" class="scroll-mt-20">Notes <a href="#notes-1">#</a></h2>
```

The `scroll-mt-20` class reserves space for the sticky top navigation bar so that anchor jumps do not hide the heading behind it.

The permalink behavior can be turned off in `swifty-docs.config.ts`:

```ts
export default defineConfig({
  markdown: {
    anchor: {
      permalink: false,
    },
  },
});
```

## Syntax Highlighting {#syntax-highlighting}

Code fences are highlighted at build time by Shiki, which uses TextMate grammars to produce VSCode-quality output. The result is a self-contained `<pre>` element with inline styles — no external CSS is needed at runtime.

Input:

````md
```ts
function greet(name: string): string {
  return `Hello, ${name}!`;
}
```
````

Output (abbreviated — Shiki produces fully styled markup):

```html
<pre class="shiki github-dark" style="background-color: #24292e" tabindex="0">
  <code class="language-ts">
    <span class="line">
      <span style="color: #b392f0">function</span>
      <span style="color: #79b8ff"> greet</span>
      <span style="color: #e1e4e8">(</span>
      <span style="color: #e1e4e8">name</span>
      <span style="color: #f97583">:</span>
      <span style="color: #79b8ff"> string</span>
      <span style="color: #e1e4e8">)</span>
      <span style="color: #f97583">:</span>
      <span style="color: #79b8ff"> string</span>
      <span style="color: #e1e4e8"> {</span>
    </span>
    ...
  </code>
</pre>
```

### Configuring the Highlighter {#configuring-the-highlighter}

The theme and language set are controlled by the `highlight` option in `swifty-docs.config.ts`:

```ts
export default defineConfig({
  highlight: {
    theme: "github-dark",
    languages: ["ts", "tsx", "js", "jsx", "json", "bash", "css", "html"],
  },
});
```

When `highlight` is omitted, the code block plugin falls back to a plain escaped render with Tailwind and daisyUI styling:

```html
<pre class="bg-neutral text-neutral-content rounded-box overflow-x-auto p-4">
  <code class="language-ts">...</code>
</pre>
```

### Fallback for Unknown Languages {#fallback-for-unknown-languages}

If a fenced block specifies a language that Shiki has not loaded, the renderer silently falls back to plain text instead of throwing. The `class="language-xxx"` attribute is preserved so custom CSS can still target it.

## Custom Containers {#custom-containers}

Admonition blocks use the `::: type` syntax popularized by VitePress. swifty-docs supports four container types, each mapped to a daisyUI alert color.

### tip {#container-tip}

Input:

```md
::: tip
Use the `defineConfig` helper for full type safety.
:::
```

Output:

```html
<div role="alert" class="alert alert-info">
  <div>
    <p class="font-semibold">TIP</p>
    <p>Use the <code>defineConfig</code> helper for full type safety.</p>
  </div>
</div>
```

### warning {#container-warning}

Input:

```md
::: warning
Calling `resetHighlighter()` invalidates all cached Shiki instances.
:::
```

Output:

```html
<div role="alert" class="alert alert-warning">
  <div>
    <p class="font-semibold">WARNING</p>
    <p>
      Calling <code>resetHighlighter()</code> invalidates all cached Shiki
      instances.
    </p>
  </div>
</div>
```

### danger {#container-danger}

Input:

```md
::: danger
Never commit the generated `dist-docs/` folder to version control.
:::
```

Output:

```html
<div role="alert" class="alert alert-error">
  <div>
    <p class="font-semibold">DANGER</p>
    <p>
      Never commit the generated <code>dist-docs/</code> folder to version
      control.
    </p>
  </div>
</div>
```

### details {#container-details}

The `details` container renders as a collapsible `<details>` element instead of a static alert.

Input:

```md
::: details Why not gray-matter?
`gray-matter` is no longer maintained and pulls in several transitive
dependencies. A 20-line regex replacement is easier to audit.
:::
```

Output:

```html
<details role="alert" class="alert">
  <summary class="font-semibold">Why not gray-matter?</summary>
  <p>
    <code>gray-matter</code> is no longer maintained and pulls in several
    transitive dependencies. A 20-line regex replacement is easier to audit.
  </p>
</details>
```

### Custom Titles {#custom-titles}

Any text after the container type becomes the block title, replacing the default label.

Input:

```md
::: tip Pro Tip
Combine `sidebar_position` with `sidebar_group` for precise ordering.
:::
```

Output:

```html
<div role="alert" class="alert alert-info">
  <div>
    <p class="font-semibold">Pro Tip</p>
    <p>
      Combine <code>sidebar_position</code> with <code>sidebar_group</code> for
      precise ordering.
    </p>
  </div>
</div>
```

### Customizing Labels {#customizing-labels}

The default labels (`TIP`, `WARNING`, `DANGER`, `DETAILS`) can be overridden globally in the config:

```ts
export default defineConfig({
  markdown: {
    containers: {
      tip: { label: "Hint" },
      warning: { label: "Be Careful" },
      danger: { label: "Stop" },
      details: { label: "More" },
    },
  },
});
```

## Table of Contents {#table-of-contents}

The `[[toc]]` directive is replaced at build time with a `<div v-swifty="theme/toc">` mount point. The default theme's `TocView` reads the page's heading list and renders an in-page navigation sidebar.

Input:

```md
[[toc]]
```

Output:

```html
<div v-swifty="theme/toc"></div>
```

The `TocView` only includes headings whose level is in the configured `toc.level` array. The default is `[2, 3]`, meaning `<h2>` and `<h3>` appear in the TOC but `<h1>` and `<h4>` do not.

```ts
export default defineConfig({
  markdown: {
    toc: {
      level: [2, 3, 4],
    },
  },
});
```

The directive is case-insensitive: `[[TOC]]`, `[[Toc]]`, and `[[toc]]` all work.

## Links {#links}

Links are intercepted at render time and split into two categories.

### Internal Links {#internal-links}

Any link whose `href` starts with `/` or `#` is considered internal. It receives a `data-swifty-nav="true"` attribute that the DocsView's event delegation handler picks up at runtime for SPA-style navigation — no full page reload.

Input:

```md
See the [Configuration Guide](/guide/configuration) for details.

Jump to the [Frontmatter](#frontmatter) section.
```

Output:

```html
<p>
  See the
  <a href="/guide/configuration" data-swifty-nav="true">Configuration Guide</a>
  for details.
</p>
<p>
  Jump to the
  <a href="#frontmatter" data-swifty-nav="true">Frontmatter</a>
  section.
</p>
```

### External Links {#external-links}

Links to other domains automatically open in a new tab with the appropriate `rel` attributes for security.

Input:

```md
Visit the [swifty-mvc repository](https://github.com/example/swifty-mvc).
```

Output:

```html
<p>
  Visit the
  <a
    href="https://github.com/example/swifty-mvc"
    target="_blank"
    rel="noopener noreferrer"
  >
    swifty-mvc repository </a
  >.
</p>
```

## Code Blocks {#code-blocks}

Beyond syntax highlighting, fenced code blocks receive additional treatment.

### Language Tag {#language-tag}

The first word after the opening triple backticks is treated as the language identifier. It is passed to Shiki and also preserved in the fallback `class="language-xxx"` attribute.

Input:

````md
```bash
npm install swifty-mvc swifty-docs
```
````

Output (fallback form, without Shiki):

```html
<pre class="bg-neutral text-neutral-content rounded-box overflow-x-auto p-4">
  <code class="language-bash">npm install swifty-mvc swifty-docs
</code></pre>
```

### No Language Tag {#no-language-tag}

When no language is specified, the block renders as plain text without highlighting.

Input:

````md
```
plain text content
```
````

Output:

```html
<pre class="bg-neutral text-neutral-content rounded-box overflow-x-auto p-4">
  <code class="language-">plain text content
</code></pre>
```

### Inline Code {#inline-code}

Standard backtick inline code is rendered as `<code>` without any plugin intervention. daisyUI's base styles provide a subtle background.

Input:

```md
Call `defineConfig()` to enable type checking.
```

Output:

```html
<p>Call <code>defineConfig()</code> to enable type checking.</p>
```

## swifty-mvc Template Syntax {#swifty-mvc-template-syntax}

HTML passthrough is enabled, which means raw HTML inside Markdown files is preserved verbatim. This is the escape hatch for anything the standard Markdown syntax cannot express.

### Embedding swifty-mvc Views {#embedding-views}

The `v-swifty` attribute mounts a swifty-mvc View at the given position. This works inside Markdown just as it does in a regular template.

Input:

```md
<div v-swifty="my-custom-chart" data-type="bar"></div>
```

Output:

```html
<div v-swifty="my-custom-chart" data-type="bar"></div>
```

The View's `mount()` lifecycle hook fires when the Markdown page is hydrated.

### Using Template Variables {#using-template-variables}

The compiled Markdown module exports `pageData` alongside `contentHtml`. A custom theme can bind these to the View's updater:

```ts
// Inside a custom DocsView
updater.set({
  title: pageData.title,
  description: pageData.description,
  headings: pageData.headings,
});
```

In the theme template, these are accessed through the standard swifty-mvc `{{= }}` interpolation:

```html
<h1>{{= title }}</h1>
<p class="text-base-content/60">{{= description }}</p>
```

### Conditional Rendering {#conditional-rendering}

Standard swifty-mvc conditionals work inside embedded HTML blocks:

```md
{{if showBanner}}

<div v-swifty="docs-banner"></div>
{{/if}}
```

This is particularly useful for draft pages or environment-specific content.

### Iterating Over Data {#iterating-over-data}

The `{{each}}` block can render lists from `pageData` fields:

```html
<ul>
  {{each headings as h}}
  <li><a href="#{{= h.slug }}">{{= h.text }}</a></li>
  {{/each}}
</ul>
```

## HTML Elements Reference {#html-elements-reference}

For completeness, here is how the standard Markdown elements are rendered by the default theme.

| Markdown                | HTML Element    | daisyUI Class                            |
| ----------------------- | --------------- | ---------------------------------------- | --------- | ------- |
| `# Heading`             | `<h1>` – `<h6>` | `scroll-mt-20` (applied to all headings) |
| `> blockquote`          | `<blockquote>`  | inherited from base typography           |
| `` `code` ``            | `<code>`        | inherited from base typography           |
| `---` (horizontal rule) | `<hr>`          | `border-base-content/10`                 |
| `![alt](src)`           | `<img>`         | `rounded-box`                            |
| `- list`                | `<ul>`, `<li>`  | `list-disc`                              |
| `1. list`               | `<ol>`, `<li>`  | `list-decimal`                           |
| `                       | table           | `                                        | `<table>` | `table` |

## Plugin Order {#plugin-order}

The parser registers plugins in a fixed sequence. The order matters because later plugins may depend on token attributes set by earlier ones.

1. `anchorPlugin` — assigns `id` attributes and injects permalink anchors.
2. `tocPlugin` — registers the inline `[[toc]]` rule.
3. `containerPlugin` — registers the `::: type` block rule.
4. `codeBlockPlugin` — overrides the fence renderer for Shiki or fallback output.

Link interception and heading class injection are registered as renderer rule overrides after the plugin chain.

## Disabling Extensions {#disabling-extensions}

Each extension can be turned off individually through the `markdown` config block:

```ts
export default defineConfig({
  markdown: {
    anchor: { permalink: false },
    toc: { level: [] }, // empty array disables [[toc]] rendering
    containers: undefined, // omitting the key keeps defaults
  },
  highlight: undefined, // falls back to plain escaped code blocks
});
```

Setting `toc.level` to an empty array is the recommended way to suppress the table of contents on landing pages or API reference indexes.
