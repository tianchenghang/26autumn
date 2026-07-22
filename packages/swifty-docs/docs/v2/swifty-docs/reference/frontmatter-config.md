---
title: Frontmatter Config
description: Reference for every YAML frontmatter field recognized by swifty-docs, including type, default, description, and usage examples.
sidebar_position: 10
sidebar_label: Frontmatter Config
---

# Frontmatter Config {#frontmatter-config}

Every `.md` file processed by swifty-docs may begin with a YAML frontmatter block delimited by `---`. The block is parsed by `extractFrontmatter()` before the Markdown body reaches `markdown-it`, and the recognized fields are surfaced on the compiled module as `pageData`.

This page is the canonical reference for each supported field.

[[toc]]

## Syntax {#syntax}

A frontmatter block must appear as the very first content in the file. The opening and closing `---` delimiters must each sit on their own line. The YAML payload between them is parsed by `js-yaml`, so values follow standard YAML coercion rules: unquoted `true`/`false` become booleans, bare digits become numbers, and everything else is a string.

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

Fields that swifty-docs does not recognize are preserved on `pageData` unchanged, so custom themes can read arbitrary metadata without any extra configuration.

## Fields {#fields}

### title {#title}

- Type: `string`
- Default: the first `<h1>` heading in the body, then a title derived from the file path (for example, `getting-started.md` becomes `"Getting Started"`)

The page title. Used as the `<title>` suffix, the default sidebar label when `sidebar_label` is not set, and the fallback for the `description` field.

```yaml
---
title: Configuration Reference
---
```

### description {#description}

- Type: `string`
- Default: the path-derived title -- for `index.md` files this is the parent directory name; for other files it is the filename with dashes replaced by spaces and words capitalized (e.g., `getting-started.md` becomes `"Getting Started"`)

Populates the `<meta name="description">` tag and is used as the excerpt shown in search results. When omitted, the scanner falls back to the title it derives from the file path, so every page always has a non-empty description.

```yaml
---
description: Extended Markdown syntax supported by swifty-docs.
---
```

### sidebar_position {#sidebar-position}

- Type: `number`
- Default: `undefined`

Controls the ordering of the page inside its sidebar group. Values are 0-based indices: `0` places the item first, `1` second, and so on. When two files share the same position, they are ordered alphabetically by filename.

This field is subject to the all-or-nothing rule. Within a single directory, if any file omits `sidebar_position`, every position value in that directory is ignored and all files sort by filename instead. Either commit to positioning every file in a group, or let filenames dictate the order.

```yaml
---
sidebar_position: 2
---
```

### sidebar_label {#sidebar-label}

- Type: `string`
- Default: the page `title`

Overrides the text displayed in the sidebar link. Takes precedence over both the frontmatter `title` and the first `<h1>` in the body. Useful when the page title is long or contains formatting that should not appear in navigation.

```yaml
---
title: Getting Started with the Framework
sidebar_label: Getting Started
---
```

### sidebar_group {#sidebar-group}

- Type: `string`
- Default: `undefined`

Assigns the page to a named sidebar group, overriding the default subdirectory-based grouping. Files in the same directory can use different `sidebar_group` values to appear under different group headers in the sidebar.

Note: This field is stored on `pageData` but is not consumed by the auto-sidebar generator, which groups by subdirectory. Custom themes can read this field to implement alternative grouping strategies.

```yaml
---
sidebar_group: Advanced Topics
---
```

### draft {#draft}

- Type: `boolean`
- Default: `false`

When `true`, the page is excluded from production builds. Draft pages do not appear in the sidebar or the search index when `excludeDrafts` is passed to the scanner, but they remain accessible during local development for preview purposes.

```yaml
---
draft: true
---
```

## Complete Example {#complete-example}

A page that exercises every supported field:

```yaml
---
title: Frontmatter Config
description: Reference for every YAML frontmatter field recognized by swifty-docs.
sidebar_position: 10
sidebar_label: Frontmatter Config
sidebar_group: Reference
draft: false
---
# Frontmatter Config

Introductory paragraph goes here.
```

The frontmatter block is stripped from the Markdown body before compilation. The resulting `pageData` object on the compiled module looks like this:

```json
{
  "title": "Frontmatter Config",
  "description": "Reference for every YAML frontmatter field recognized by swifty-docs.",
  "sidebarPosition": 10,
  "sidebarLabel": "Frontmatter Config",
  "sidebarGroup": "Reference",
  "draft": false,
  "relativePath": "reference/frontmatter-config.md",
  "headings": [
    { "level": 2, "text": "Syntax", "slug": "syntax" },
    { "level": 2, "text": "Fields", "slug": "fields" },
    { "level": 2, "text": "Complete Example", "slug": "complete-example" }
  ]
}
```

Custom themes receive this object in full and can bind any of its fields to the View's updater through the standard `<%= %>` interpolation syntax.

## Related {#related}

- [Markdown Features](../guide/markdown) — the custom containers, heading anchors, and `[[toc]]` directive that run alongside frontmatter.
- [Sidebar](../guide/sidebar) — how `sidebar_position`, `sidebar_label`, and `sidebar_group` interact with automatic sidebar generation.
- [Routing](../guide/routing) — how `draft: true` excludes a page from the route map in production builds.
- [Configuration](../guide/configuration) — the top-level `swifty-docs.config.ts` options that govern the whole site.
