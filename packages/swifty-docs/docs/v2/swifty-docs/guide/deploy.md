# Deploy

swifty-docs compiles every Markdown source file into a JavaScript module at build time, so the production output is a fully static site that can be served from any HTTP server, CDN edge node, or file-based host. This page walks through the production build, explains how to configure the base URL for non-root deployments, and provides deployment recipes for common hosting platforms and CI pipelines.

## Build for Production {#build-for-production}

Run the build script defined in your `package.json`. The command delegates to the bundler you configured during setup (Vite, Webpack, or Rspack) and writes the output to `dist-docs/` by default.

::: code-group

```sh [npm]
$ npm run docs:build
```

```sh [pnpm]
$ pnpm run docs:build
```

```sh [yarn]
$ yarn docs:build
```

```sh [bun]
$ bun run docs:build
```

:::

During the build, each `.md` file passes through the compilation pipeline: YAML frontmatter is extracted, the Markdown body is parsed by markdown-it with four plugins (anchors, TOC extraction, containers, code blocks), Shiki renders syntax-highlighted code, and the result is emitted as a JavaScript module exporting `pageData` and `contentHtml`. Tailwind CSS scans theme templates for class names and produces a purged stylesheet. No Markdown parsing occurs in the browser.

### Build output structure {#build-output-structure}

The production build writes the following structure to `dist-docs/`:

```
dist-docs/
  index.html
  assets/
    index-<hash>.js
    index-<hash>.css
  favicon.svg
  favicon.ico
  apple-touch-icon-180x180.png
  pwa-64x64.png
  pwa-192x192.png
  pwa-512x512.png
  maskable-icon-512x512.png
  sw.js
  workbox-<hash>.js
  manifest.webmanifest
```

HTML, JavaScript, CSS, and static assets from the `public/` directory are copied verbatim. The service worker (`sw.js`) and web app manifest (`manifest.webmanifest`) are generated when PWA support is enabled.

### Preview the build locally {#preview-the-build-locally}

Verify the production output before deploying:

::: code-group

```sh [npm]
$ npm run docs:preview
```

```sh [pnpm]
$ pnpm run docs:preview
```

```sh [yarn]
$ yarn docs:preview
```

```sh [bun]
$ bun run docs:preview
```

:::

The preview command starts a local static file server at `http://localhost:4173` by default. This is the quickest way to confirm that routes, assets, and service worker registration behave as expected before pushing to a live environment.

## Base URL Configuration {#base-url-configuration}

Two separate base path settings control where the site is mounted and how its internal links are generated.

### swifty-docs baseUrl {#swifty-docs-baseurl}

`baseUrl` in `swifty-docs.config.ts` prefixes every generated route path. It determines where the documentation section lives inside your application's route tree.

```ts
// swifty-docs.config.ts
export default defineConfig({
  baseUrl: "/docs/", // routes: /docs/guide/getting-started, ...
});
```

Always include both the leading and trailing slashes.

### Bundler base {#bundler-base}

The bundler's own `base` option rewrites every asset reference in the compiled output so the site can be served from a non-root path. This is distinct from `baseUrl`: the bundler base affects static asset URLs, while `baseUrl` affects application routes.

::: code-group

```ts [vite.config.ts]
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "/swifty/" : "/",
  build: {
    outDir: "dist-docs",
    emptyOutDir: true,
  },
});
```

```js [webpack.config.js]
export default {
  output: {
    publicPath: process.env.NODE_ENV === "production" ? "/swifty/" : "/",
  },
};
```

```js [rspack.config.js]
export default {
  output: {
    publicPath: process.env.NODE_ENV === "production" ? "/swifty/" : "/",
  },
};
```

:::

When `base` and `baseUrl` point to the same prefix, the site is self-contained at that path. When they differ, the documentation lives at `baseUrl` while static assets load from `base`.

::: tip
Set `base` to `"./"` (a relative path) when the deployment target is unknown at build time, such as when the same build artifact is deployed to multiple environments. Relative paths resolve correctly regardless of where the site is mounted.
:::

## Static Hosting {#static-hosting}

The `dist-docs/` directory is a standard static site. Upload its contents to any file host or web server. The server must satisfy one requirement: all routes that do not match a physical file must fall back to `index.html`, because swifty-docs uses client-side routing in history mode.

### nginx {#nginx}

```nginx
server {
    listen 80;
    server_name docs.example.com;
    root /var/www/docs;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

The `try_files` directive sends unmatched routes to `index.html`, where the swifty-mvc router resolves them. The `/assets/` block applies long-lived cache headers to hashed static assets, which are safe to cache indefinitely because their filenames change on every build.

### Apache {#apache}

Create a `.htaccess` file in the deployment root:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

### Caddy {#caddy}

```
docs.example.com {
    root * /var/www/docs
    file_server
    try_files {path} /index.html
}
```

### GitHub Pages {#github-pages}

Push the `dist-docs/` directory to the `gh-pages` branch of your repository, or configure GitHub Pages to deploy from a GitHub Actions workflow (see the CI/CD section below). Set the bundler `base` to match the repository URL:

```ts
// vite.config.ts
export default defineConfig({
  base: "/<repository-name>/",
});
```

### Netlify {#netlify}

Create a `netlify.toml` at the repository root:

```toml
[build]
  command = "pnpm run docs:build"
  publish = "dist-docs"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

The `redirects` block ensures client-side routes resolve correctly when a user navigates directly to a deep link.

### Vercel {#vercel}

Vercel auto-detects Vite projects. Override the settings if the auto-detection does not match your layout:

```json
{
  "buildCommand": "pnpm run docs:build",
  "outputDirectory": "dist-docs",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Cloudflare Pages {#cloudflare-pages}

Point the build command to `pnpm run docs:build` and the output directory to `dist-docs`. Cloudflare Pages does not require a fallback rule because it serves `index.html` for unmatched routes by default.

## CDN Deployment {#cdn-deployment}

Serving the build output through a CDN reduces latency for global audiences. The hashed filenames under `assets/` are safe to cache indefinitely; only `index.html` and `sw.js` require short cache lifetimes.

### Recommended cache policy {#recommended-cache-policy}

| File pattern                  | Cache-Control                         |
| ----------------------------- | ------------------------------------- |
| `assets/**`                   | `public, max-age=31536000, immutable` |
| `index.html`                  | `public, max-age=0, must-revalidate`  |
| `sw.js`                       | `public, max-age=0, must-revalidate`  |
| `manifest.webmanifest`        | `public, max-age=3600`                |
| `favicon.*`, `*.png`, `*.svg` | `public, max-age=86400`               |

### Alibaba Cloud OSS + CDN {#alibaba-cloud-oss-cdn}

Upload `dist-docs/` to an OSS bucket and bind a CDN domain:

```sh
$ ossutil cp -r dist-docs/ oss://docs-bucket/ --update
```

Configure OSS to return `index.html` for 404 errors under the static website hosting settings, so the CDN edge node falls back to the application shell for unknown routes.

### AWS S3 + CloudFront {#aws-s3-cloudfront}

Sync the build output to an S3 bucket and create a CloudFront distribution with a custom error response that maps 404 to `/index.html` with HTTP 200:

```sh
$ aws s3 sync dist-docs/ s3://docs-bucket --delete
$ aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

### Uploading to npm or a private registry {#uploading-to-npm}

If you distribute the built documentation as a versioned package for internal consumption, publish the `dist-docs/` directory as a separate npm package or tarball. Consumer CI pipelines then download and extract it into their deployment target without rebuilding from source.

## CI/CD {#ci-cd}

swifty-docs builds deterministically with no interactive prompts, making it suitable for automated pipelines. The generated runtime module at `.swifty-docs/generated/` is written by `defineConfig()` at build time and does not need to be checked into version control.

### GitHub Actions {#github-actions}

```yaml
name: Deploy Docs

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run docs:build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist-docs

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### GitLab CI {#gitlab-ci}

```yaml
pages:
  image: node:20
  script:
    - corepack enable
    - pnpm install --frozen-lockfile
    - pnpm run docs:build
    - mv dist-docs public
  artifacts:
    paths:
      - public
  only:
    - main
```

GitLab Pages expects the output in a `public/` directory. The `mv` command renames the build output to match that convention.

### Jenkins pipeline {#jenkins-pipeline}

```groovy
pipeline {
    agent any
    stages {
        stage('Install') {
            steps { sh 'pnpm install --frozen-lockfile' }
        }
        stage('Build') {
            steps { sh 'pnpm run docs:build' }
        }
        stage('Deploy') {
            steps {
                sh 'ossutil cp -r dist-docs/ oss://docs-bucket/ --update'
            }
        }
    }
}
```

### Environment variables {#environment-variables}

The build respects `NODE_ENV`. Set it to `production` in CI so that the bundler enables minification and the configuration can branch on the environment to select the correct `base` path.

```yaml
- run: pnpm run docs:build
  env:
    NODE_ENV: production
```

## Progressive Web App {#progressive-web-app}

swifty-docs integrates `vite-plugin-pwa` to generate a service worker, a web app manifest, and the PWA icon set. The integration is configured at the bundler level, not within swifty-docs itself.

Note: Consumer projects must install `vite-plugin-pwa` separately as it is not included in swifty-docs dependencies.

```sh
$ npm add -D vite-plugin-pwa
```

### Service worker {#service-worker}

The Vite PWA plugin generates a Workbox-powered service worker that precaches HTML, JavaScript, CSS, and static assets matching `globPatterns: ["**/*.{js,css,html,svg,png,woff2}"]`. Once installed, the service worker serves cached assets offline and updates them in the background on subsequent visits.

Register the PWA plugin in your `vite.config.ts`:

```ts
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    ...swiftyDocsPlugin({ config: docsConfig, vdom: false }),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "My Library Docs",
        short_name: "Docs",
        theme_color: "#ecfdf5",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
});
```

### PWA icons {#pwa-icons}

Place the following icon files in the `public/` directory. The same files are referenced by the manifest and by the HTML `<head>`:

| File                           | Purpose                             |
| ------------------------------ | ----------------------------------- |
| `pwa-64x64.png`                | Small tile                          |
| `pwa-192x192.png`              | Android home screen                 |
| `pwa-512x512.png`              | Splash screen and large tile        |
| `maskable-icon-512x512.png`    | Adaptive icon for Android launchers |
| `apple-touch-icon-180x180.png` | iOS home screen                     |

Use a tool like [vite-plugin-pwa assets generator](https://github.com/vite-pwa/assets-generator) to produce all variants from a single source image.

### Install prompt {#install-prompt}

When `registerType` is `"autoUpdate"`, the service worker activates automatically on first load. Browsers that support PWA installation surface a native install prompt after the manifest is detected. Users can also install the site manually from the browser menu.

### Offline behavior {#offline-behavior}

Because all Markdown is compiled at build time and the search index is embedded in the JavaScript bundle, the site is fully functional offline once the service worker has precached the assets. The MiniSearch index constructs in memory from the cached module without any network requests.

## Troubleshooting {#troubleshooting}

### Routes return 404 on direct navigation {#routes-return-404}

The server is not falling back to `index.html`. Configure `try_files` (nginx), `.htaccess` rewrites (Apache), or the platform-specific redirect rule described in the static hosting section.

### Assets fail to load at a non-root path {#assets-fail-to-load}

The bundler `base` option does not match the deployment path. Rebuild with the correct `base` value. If you need the same build to work at multiple paths, set `base` to `"./"`.

### Service worker serves stale content {#service-worker-stale-content}

The previous service worker is holding onto cached assets. Bump the `version` field in the Workbox configuration or run `workbox-window`'s `skipWaiting()` to force the new worker to take over immediately. Setting `registerType: "autoUpdate"` handles this automatically.

### PWA install prompt does not appear {#pwa-install-prompt}

Confirm that the manifest is served at `/manifest.webmanifest`, that it references valid icon files, and that the site is served over HTTPS. Browsers suppress the prompt on plain HTTP except for `localhost`.

## Next steps {#next-steps}

- [Configuration](./configuration) -- full reference for `swifty-docs.config.ts` options.
- [Asset Handling](./asset-handling) -- how the build pipeline processes CSS, templates, and static files.
- [Bundler Integration](./bundler-integration) -- Vite, Webpack, and Rspack plugin details.
