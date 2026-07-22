---
title: Frontmatter Configuration
description: Reference for page-level frontmatter fields.
---

# Frontmatter Configuration {#frontmatter-configuration}

Frontmatter is YAML metadata at the top of Markdown files. It controls page-level settings like title, description, and sidebar behavior.

## Syntax {#syntax}

Frontmatter must be the first thing in the file, enclosed in triple dashes:

```markdown
---
title: My Page
description: Page description
sidebar_position: 1
---

# Content starts here
```

## Fields {#fields}

### title {#title}

```yaml
title: string
```

The page title. Used in:

- Browser tab title
- Search results
- Sidebar (if `sidebar_label` is not set)
- TOC

**Example:**

```yaml
title: Getting Started
```

### description {#description}

```yaml
description: string
```

Meta description for SEO. Rendered as `<meta name="description">` in the HTML `<head>`.

**Example:**

```yaml
description: Learn how to set up and configure Swifty Docs
```

### sidebar_position {#sidebar-position}

```yaml
sidebar_position: number
```

Sort order in auto-generated sidebars. Lower numbers appear first.

**Example:**

```yaml
sidebar_position: 1
```

**Sorting behavior:**

- If ALL files in a directory have `sidebar_position`, they are sorted by position then filename.
- If ANY file is missing `sidebar_position`, ALL files are sorted by filename only.

### sidebar_label {#sidebar-label}

```yaml
sidebar_label: string
```

Custom label for the sidebar item. Overrides the `title` field and filename-derived label.

**Example:**

```yaml
sidebar_label: Quick Start Guide
```

### sidebar_group {#sidebar-group}

```yaml
sidebar_group: string
```

Assigns the page to a named group in the auto-generated sidebar. Pages with the same `sidebar_group` value are clustered under a shared collapsible heading.

**Example:**

```yaml
sidebar_group: Guides
```

### draft {#draft}

```yaml
draft: boolean
```

If `true`, the page is excluded from production builds. It will not appear in the sidebar, search index, or generated route map when drafts are excluded (controlled by the `excludeDrafts` scanner option).

**Example:**

```yaml
draft: true
```

## Title resolution chain {#title-resolution}

The page title is resolved in this order:

1. `title` field in frontmatter
2. First `<h1>` heading in the content
3. Filename (derived from path, e.g., `getting-started.md` → "Getting Started")

## Example {#example}

```markdown
---
title: Configuration Reference
description: Complete reference for all Swifty Docs configuration options
sidebar_position: 3
sidebar_label: Config Reference
---

# Configuration Reference

This page documents all configuration options...
```

## Next steps {#next-steps}

- [Site Configuration](/docs/en/swifty-docs/reference/site-config) — global configuration options
- [Markdown Extensions](/docs/en/swifty-docs/guide/markdown) — frontmatter and Markdown features
- [How It Works](/docs/en/swifty-docs/guide/how-it-works) — frontmatter extraction pipeline
