---
title: Introduction
description: What is Swifty Docs, a static site generator built on Swifty MVC.
---

# What is Swifty Docs? {#what-is-swifty-docs}

Swifty Docs (`@swifty.js/docs`) is a static site generator for building documentation websites. It is built on top of [Swifty MVC](/docs/en/swifty-mvc/getting-started/introduction) and provides a complete solution for converting Markdown files into a fast, searchable documentation site.

## Features {#features}

- Markdown-first authoring with frontmatter, syntax highlighting, and custom containers
- Built on Swifty MVC — fast client-side navigation with no full page reloads
- Auto-generated sidebar from directory structure
- Full-text search (local or DocSearch integration)
- Responsive three-column layout with sticky navigation
- Table of contents with scroll-spy highlighting
- Syntax highlighting via Shiki with 40+ languages
- Custom containers (tip, warning, danger, details)
- Heading anchors with permalink support
- Vite, Webpack, and Rspack bundler plugins

## Architecture {#architecture}

Swifty Docs operates in three phases:

1. Configuration: `defineConfig()` scans the docs directory, extracts frontmatter and headings, auto-generates sidebar trees, and writes a runtime module to `.swifty-docs/generated/index.js`

2. Compilation: Each `.md` file is intercepted by the bundler plugin and compiled through `compileMarkdown()`. The pipeline extracts YAML frontmatter, initializes Shiki, parses with `markdown-it` plus custom plugins, renders to HTML, and emits a JavaScript module exporting `{ pageData, contentHtml }`

3. Runtime: The Swifty MVC Framework boots with generated routes. The layout view stays mounted across navigation and loads page content asynchronously via dynamic imports. Four theme Views render the UI: layout, sidebar, TOC, and search.

## Comparison with other tools {#comparison}

| Feature             | Swifty Docs           | VitePress             | Docusaurus       |
| ------------------- | --------------------- | --------------------- | ---------------- |
| Framework           | Swifty MVC            | Vue 3                 | React            |
| Bundle size         | Minimal               | Small                 | Medium           |
| Search              | Local + DocSearch     | Local + Algolia       | Local + Algolia  |
| Markdown            | markdown-it + plugins | markdown-it + plugins | remark + rehype  |
| Syntax highlighting | Shiki                 | Shiki                 | Prism            |
| Sidebar             | Auto-generated        | Manual or auto        | Manual or auto   |
| Theme system        | 4 pluggable Views     | Vue components        | React components |
| Bundler             | Vite/Webpack/Rspack   | Vite                  | Webpack          |

## Next steps {#next-steps}

- To start using Swifty Docs, see [Getting Started](/docs/en/swifty-docs/getting-started/getting-started)
- To understand the architecture, read [How it Works](/docs/en/swifty-docs/guide/how-it-works)
- For configuration options, see [Configuration Reference](/docs/en/swifty-docs/reference/site-config)
- For the complete API, see [API Reference](/docs/en/swifty-docs/api/overview)
