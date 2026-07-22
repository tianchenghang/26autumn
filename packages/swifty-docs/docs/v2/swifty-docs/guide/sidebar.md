# Sidebar

The sidebar is the primary navigation tree in a swifty-docs site. It displays the hierarchical structure of your documentation, allowing readers to move between pages and sections. swifty-docs supports both automatic generation from the filesystem and manual configuration for precise control.

## Automatic Sidebar Generation

When you set a sidebar prefix to `"auto"` in your configuration, swifty-docs scans the docs directory under that prefix and builds the sidebar tree from the filesystem structure. This is the fastest way to get a working navigation without manually listing every page.

```ts
defineConfig({
  sidebar: {
    "/docs/guide/": "auto",
    "/docs/api/": "auto",
  },
});
```

The generator walks every `.md` file under the prefix, groups routes by subdirectory, and produces a tree of `SidebarItem` objects. Each file becomes a leaf link. Each subdirectory becomes a collapsible group. The `index.md` file at any level becomes a top-level item rather than nesting inside a group.

## Sidebar Structure

The generated sidebar follows a predictable structure based on your directory layout.

### Root-Level Items

Files that live directly under the prefix directory appear as top-level links. For example, with prefix `/docs/guide/`, the file `docs/guide/getting-started.md` becomes a root item:

```
- Getting Started
```

### Subdirectory Groups

Files inside subdirectories are grouped under a collapsible header. The group label is derived from the directory name by replacing hyphens and underscores with spaces and capitalizing each word.

Given this structure:

```
docs/guide/
  getting-started.md
  api/
    router.md
    state.md
```

The sidebar produces:

```
- Getting Started
- Api
  - Router
  - State
```

The group header `Api` is clickable only if there is an `index.md` inside that subdirectory. Otherwise it serves as a visual label for the group.

### Collapsed State

All generated groups start expanded (`collapsed: false`). To create groups that start collapsed, use manual sidebar configuration instead.

### Virtual Index Routes

When a directory has no `index.md` file, swifty-docs generates a virtual index route that points to the first page in that directory (determined by sorting rules). These virtual routes are excluded from the sidebar to avoid duplicating the target page. Only real `.md` files appear in the sidebar tree.

## Sorting Logic

The order of items within a sidebar group is determined by a single rule: the all-or-nothing rule for `sidebar_position`.

### The All-or-Nothing Rule

Within each directory group, the sorting behavior depends on whether every file in that group has a `sidebar_position` frontmatter value:

1. If all files in the group have `sidebar_position`: sort by position ascending (0-based), with filename as tiebreaker for equal positions.
2. If any file in the group is missing `sidebar_position`: ignore all position values and sort by filename in dictionary order only.

This rule applies per directory group, not globally. One group can use position-based sorting while a sibling group falls back to filename sorting.

### Position-Based Sorting

When every file declares a position, the values are treated as 0-based indices:

```yaml
---
sidebar_position: 0
---
```

A file with `sidebar_position: 0` appears first, `sidebar_position: 1` appears second, and so on. When two files share the same position, they are ordered by filename alphabetically.

### Filename Fallback

When at least one file lacks a position, all files in that group sort by the filename stem (the name without the `.md` extension). For example:

```
config.md     -> "config"
intro.md      -> "intro"
plugins.md    -> "plugins"
```

Sorted order: config, intro, plugins. This ordering is stable and predictable regardless of filesystem case sensitivity, because it uses `localeCompare` for comparison.

### Why All-or-Nothing

The all-or-nothing rule prevents a common pitfall: mixing positioned and un-positioned files leads to surprising orderings where un-positioned files cluster at the beginning or end. By falling back to pure filename sorting when any position is missing, the behavior remains deterministic and easy to reason about. Either commit to positioning every file in a group, or let filenames dictate the order.

## Manual Configuration

For complete control over the sidebar structure, pass an explicit array of `SidebarItem` objects instead of `"auto"`.

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
      {
        text: "Plugins",
        collapsed: true,
        items: [
          { text: "Vite Plugin", link: "/docs/guide/plugins/vite" },
          { text: "Rspack Plugin", link: "/docs/guide/plugins/rspack" },
        ],
      },
    ],
  },
});
```

### SidebarItem Interface

Each item in the manual array has the following shape:

```ts
interface SidebarItem {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: SidebarItem[];
}
```

The `text` field is required and provides the display label. The `link` field is optional; omit it on group headers that should not be clickable. The `collapsed` field defaults to `false` and controls whether a group starts expanded or collapsed. The `items` field holds child items for nested groups, allowing arbitrary depth.

### Mixing Automatic and Manual

You can use different strategies for different prefixes in the same configuration:

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

This is useful when your guide section grows organically and benefits from auto-generation, while your API reference requires a curated order.

## Frontmatter Controls

Each `.md` file can include YAML frontmatter fields that influence how it appears in the sidebar.

### sidebar_position

Controls the sort order within a directory group. Must be a non-negative integer. Subject to the all-or-nothing rule described above.

```yaml
---
sidebar_position: 2
---
```

Position values are 0-based. A value of `0` places the item first in its group.

### sidebar_label

Overrides the display text in the sidebar. By default, the sidebar uses the page title extracted from the first `h1` heading or the frontmatter `title` field. When `sidebar_label` is set, it takes precedence over both.

```yaml
---
sidebar_label: "Quick Start"
---
```

This is useful when the page title is long or contains formatting that should not appear in navigation:

```yaml
---
title: "Getting Started with the Framework"
sidebar_label: "Getting Started"
---
```

### sidebar_group

Assigns the page to a named group, overriding the subdirectory-based grouping. This allows files in the same directory to appear under different group headers in the sidebar.

```yaml
---
sidebar_group: "Advanced Topics"
---
```

### draft

When set to `true`, the page is excluded from production builds. Draft pages do not appear in the sidebar or the search index when building for deployment. They remain accessible during local development.

```yaml
---
draft: true
---
```

### title

The page title, used as a fallback when `sidebar_label` is not set. Extracted from the first `h1` heading if not explicitly provided in frontmatter.

```yaml
---
title: "Configuration Reference"
---
```

## Sidebar Rendering at Runtime

At runtime, the sidebar view reads the generated or manually configured sidebar data from the global state. It marks the item whose `link` matches the current route path as active, applying a distinct visual style. Groups with `collapsed: true` start folded and expand on click.

The sidebar is visible at the `lg` breakpoint (1024px) and above. Below that threshold, the sidebar is hidden and navigation is available through the top navbar links.

## Complete Example

A full configuration demonstrating automatic and manual sidebars with frontmatter-controlled sorting:

```ts
// swifty-docs.config.ts
import { defineConfig } from "swifty-docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Library",

  sidebar: {
    "/docs/guide/": "auto",
    "/docs/api/": [
      { text: "Overview", link: "/docs/api/overview" },
      {
        text: "Core",
        collapsed: false,
        items: [
          { text: "defineConfig", link: "/docs/api/core/define-config" },
          { text: "createApp", link: "/docs/api/core/create-app" },
        ],
      },
    ],
  },
});
```

With the following frontmatter in `docs/guide/getting-started.md`:

```yaml
---
sidebar_position: 0
sidebar_label: "Getting Started"
---
```

And in `docs/guide/configuration.md`:

```yaml
---
sidebar_position: 1
sidebar_label: "Configuration"
---
```

And in `docs/guide/advanced/plugins.md`:

```yaml
---
sidebar_position: 0
sidebar_label: "Vite Plugin"
---
```

The guide sidebar renders:

```
- Getting Started
- Configuration
- Advanced
  - Vite Plugin
```

## Next Steps

- [Configuration](./configuration) -- all available configuration options.
- [Writing Content](./writing-content) -- frontmatter, custom containers, and code blocks.
- [Routing](./routing) -- how routes are generated from the filesystem.
