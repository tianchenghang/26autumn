---
title: Getting Started
description: Build your first documentation site with Swifty Docs in five minutes.
---

# Getting Started {#getting-started}

This guide walks you through setting up a Swifty Docs project from scratch. By the end, you will have a working documentation site with navigation, search, and syntax highlighting.

## Prerequisites {#prerequisites}

- Node.js 18 or later
- A package manager (npm, pnpm, yarn, or bun)
- Familiarity with Markdown

## Installation {#installation}

Create a new project and install Swifty Docs:

::: code-group

```sh [npm]
$ npm init -y
$ npm install @swifty.js/docs
$ npm install -D vite
```

```sh [pnpm]
$ pnpm init
$ pnpm add @swifty.js/docs
$ pnpm add -D vite
```

```sh [yarn]
$ yarn init -y
$ yarn add @swifty.js/docs
$ yarn add -D vite
```

:::

## Project structure {#project-structure}

Create the following directory structure:

```
my-docs/
├── docs/
│   ├── index.md
│   └── guide/
│       ├── introduction.md
│       └── getting-started.md
├── swifty-docs.config.ts
├── vite.config.ts
└── package.json
```

## Configuration {#configuration}

Create `swifty-docs.config.ts`:

```ts [swifty-docs.config.ts]
import { defineConfig } from "@swifty.js/docs";

export default defineConfig({
  docs: "docs",
  baseUrl: "/",
  title: "My Documentation",
  description: "Documentation for my project",
  nav: [
    { text: "Guide", link: "/guide/introduction" },
    { text: "GitHub", link: "https://github.com/my/project" },
  ],
  sidebar: {
    "/guide/": "auto",
  },
});
```

Create `vite.config.ts`:

```ts [vite.config.ts]
import { defineConfig } from "vite";
import { swiftyDocsPlugin } from "@swifty.js/docs/vite";
import docsConfig from "./swifty-docs.config";

export default defineConfig({
  plugins: [swiftyDocsPlugin({ config: docsConfig })],
});
```

## Writing content {#writing-content}

Create `docs/index.md`:

```markdown [docs/index.md]
---
title: Home
---

# Welcome to My Documentation

This is the home page of your documentation site.

## Features

- Fast client-side navigation
- Full-text search
- Syntax highlighting
- Auto-generated sidebar
```

Create `docs/guide/introduction.md`:

````markdown [docs/guide/introduction.md]
---
title: Introduction
---

# Introduction

Welcome to the guide section.

## What is this?

This is a documentation site built with Swifty Docs.

```typescript
const greeting = "Hello, World!";
console.log(greeting);
```
````

````

## Development server {#dev-server}

Start the development server:

```sh
npx vite
````

Open `http://localhost:5173` in your browser. You should see:

- The home page with your content
- A sidebar on the left with auto-generated navigation
- A search icon in the top-right corner
- Syntax highlighting in code blocks

## Building for production {#building}

Build the static site:

```sh
npx vite build
```

The output is written to `dist/`.

## Deployment {#deployment}

Deploy the `dist/` directory to any static hosting platform.

### Subpath deployment {#subpath-deployment}

If your site is served under a subpath (for example, `https://example.com/docs/`), set `baseUrl` accordingly in `swifty-docs.config.ts`:

```ts
export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Documentation",
});
```

All generated routes, asset paths, and navigation links will be prefixed with `/docs/`. For a root deployment (`https://example.com/`), use `baseUrl: "/"`.

### Hosting platforms {#hosting-platforms}

Common deployment targets:

- Netlify — drag and drop the `dist/` folder or connect your Git repository for automatic deploys.
- Vercel — import the project; Vercel auto-detects Vite and builds it.
- GitHub Pages — push the `dist/` folder to the `gh-pages` branch, or use a GitHub Actions workflow to build and deploy on every push.
- Any static host — upload the `dist/` directory to S3, Cloudflare Pages, Nginx, or similar.

## Next steps {#next-steps}

- [Configuration Reference](/docs/en/swifty-docs/reference/site-config) — all configuration options
- [Markdown Extensions](/docs/en/swifty-docs/guide/markdown) — containers, syntax highlighting, and more
- [Theme Customization](/docs/en/swifty-docs/guide/theme) — customizing the layout and components
- [Search](/docs/en/swifty-docs/guide/search) — local search and DocSearch integration
