# CLI Reference

swifty-docs does not provide its own command line interface. Instead, it integrates with the Vite build tool through the `swiftyDocsPlugin`. All build and development workflows use the standard Vite CLI commands, configured to work with your swifty-docs setup.

This page documents the Vite commands you will use with swifty-docs, common flags, environment variables, and troubleshooting tips.

## Prerequisites {#prerequisites}

Before using the CLI commands, ensure you have completed the following:

- Installed Vite as a dev dependency: `npm add -D vite`
- Created a `vite.config.ts` file with the `swiftyDocsPlugin` configured
- Created a `swifty-docs.config.ts` file with your site configuration
- Set up the boot file and HTML entry point as described in [Getting Started](../guide/getting-started)

Your `package.json` should include scripts that wrap the Vite commands:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

## Development Server {#development-server}

Start the development server with hot module replacement:

```sh
$ npm run dev
```

Or invoke Vite directly:

```sh
$ npx vite
```

The development server compiles Markdown files on demand, serves your documentation site, and watches for changes. When you edit a `.md` file, the browser updates automatically without a full page reload.

### Common Flags {#dev-flags}

- `--port <number>`: Specify the server port. Default is `5173`.

```sh
$ npx vite --port 3000
```

- `--host`: Expose the server on all network interfaces (useful for testing on mobile devices or in containers).

```sh
$ npx vite --host
```

- `--open`: Automatically open the browser when the server starts.

```sh
$ npx vite --open
```

- `--mode <mode>`: Set the environment mode. Default is `development`.

```sh
$ npx vite --mode staging
```

### What Happens During Development {#dev-behavior}

When you run the development server, the following occurs:

1. `defineConfig` in `swifty-docs.config.ts` scans the `docs` directory and generates sidebar data
2. Runtime modules are written to `.swifty-docs/generated/` (routes, config, content loader)
3. The `swiftyDocsPlugin` registers handlers for `.md` files and `.html` templates
4. Vite starts the dev server and serves your site at the configured `baseUrl`

Markdown files are compiled on the fly. Shiki syntax highlighting is applied to code blocks. Custom containers (tip, warning, danger, details) are transformed into styled callouts.

## Production Build {#production-build}

Build the documentation site for production:

```sh
$ npm run build
```

Or invoke Vite directly:

```sh
$ npx vite build
```

The build command compiles all Markdown files, bundles JavaScript and CSS, and outputs static assets to the `dist-docs/` directory (or whatever `build.outDir` you configured in `vite.config.ts`).

### Common Flags {#build-flags}

- `--outDir <dir>`: Override the output directory. Default is `dist-docs/`.

```sh
$ npx vite build --outDir build
```

- `--mode <mode>`: Set the environment mode. Default is `production`.

```sh
$ npx vite build --mode staging
```

- `--emptyOutDir`: Force empty the output directory before building. This is the default behavior when `outDir` is inside the project root.

```sh
$ npx vite build --emptyOutDir
```

- `--minify <minifier>`: Enable or disable minification. Accepts `esbuild` (default), `terser`, or `false`.

```sh
$ npx vite build --minify false
```

- `--sourcemap`: Generate source maps for production build.

```sh
$ npx vite build --sourcemap
```

### Build Output {#build-output}

After a successful build, the output directory contains:

- `index.html`: The entry point
- `assets/`: JavaScript bundles, CSS files, and other static assets
- Compiled Markdown content embedded in the JavaScript bundle

The build is optimized for production: code is minified, assets are hashed for caching, and unused code is tree-shaken.

### Deploying the Build {#deploying}

The contents of the output directory can be deployed to any static hosting service:

- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront
- Nginx or Apache

Upload the entire output directory to your hosting provider. No server-side runtime is required.

## Preview Production Build {#preview-production-build}

Preview the production build locally before deploying:

```sh
$ npm run preview
```

Or invoke Vite directly:

```sh
$ npx vite preview
```

The preview command serves the contents of the output directory on a local server. This is useful for verifying that the production build works correctly before deploying.

### Common Flags {#preview-flags}

- `--port <number>`: Specify the preview server port. Default is `4173`.

```sh
$ npx vite preview --port 4000
```

- `--host`: Expose the preview server on all network interfaces.

```sh
$ npx vite preview --host
```

- `--open`: Automatically open the browser when the preview server starts.

```sh
$ npx vite preview --open
```

## Environment Variables {#environment-variables}

Vite supports environment variables through `.env` files. Create a `.env` file in your project root:

```
VITE_BASE_URL=/docs/
VITE_SITE_TITLE=My Documentation
```

Access these variables in your code:

```ts
const baseUrl = import.meta.env.VITE_BASE_URL;
const title = import.meta.env.VITE_SITE_TITLE;
```

Only variables prefixed with `VITE_` are exposed to your client-side code.

### Environment Modes {#environment-modes}

Vite supports multiple environment modes. By default:

- `vite` runs in `development` mode and loads `.env.development`
- `vite build` runs in `production` mode and loads `.env.production`

You can override the mode with the `--mode` flag:

```sh
$ npx vite build --mode staging
```

This loads `.env.staging` instead of `.env.production`.

## Configuring Vite {#configuring-vite}

Your `vite.config.ts` file controls how Vite builds your documentation site. A typical configuration looks like this:

```ts
import { defineConfig } from "vite";
import { swiftyDocsPlugin } from "swifty-docs/vite";
import tailwindcss from "@tailwindcss/vite";
import swiftyDocsConfig from "./swifty-docs.config";

export default defineConfig({
  root: "app",
  publicDir: "public",
  plugins: [
    ...swiftyDocsPlugin({
      config: swiftyDocsConfig,
      vdom: false,
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@swifty-docs/generated": "./.swifty-docs/generated",
    },
  },
  build: {
    outDir: "../dist-docs",
    emptyOutDir: true,
  },
});
```

### Key Configuration Options {#vite-config-options}

- `root`: The project root directory. Set this to `"app"` if your HTML entry point is in the `app/` directory.
- `publicDir`: Directory for static assets that are served at the root path. Default is `"public"`.
- `plugins`: Array of Vite plugins. The `swiftyDocsPlugin` returns an array of two plugins (one for Markdown, one for templates), so spread it with `...`.
- `resolve.alias`: Path aliases. The `@swifty-docs/generated` alias points to the auto-generated runtime modules.
- `build.outDir`: Output directory for the production build. Use `"../dist-docs"` if your `root` is `"app"`.

## Troubleshooting {#troubleshooting}

### Port Already in Use {#port-in-use}

If the default port is occupied, specify a different port:

```sh
$ npx vite --port 3000
```

Or let Vite automatically find the next available port:

```sh
$ npx vite --strictPort false
```

### Module Not Found Errors {#module-not-found}

If you see errors like `Cannot find module '@swifty-docs/generated'`, ensure that:

1. You have run `vite` or `vite build` at least once (this triggers `defineConfig` to generate the runtime modules)
2. The `.swifty-docs/generated/` directory exists and contains `index.js`
3. Your `vite.config.ts` includes the `@swifty-docs/generated` alias

### Markdown Compilation Errors {#markdown-errors}

If Markdown files fail to compile, check that:

1. The `docs` directory path in `swifty-docs.config.ts` is correct
2. Markdown files have valid syntax
3. Custom containers use the correct format (`::: tip`, `::: warning`, etc.)
4. Frontmatter is properly formatted with `---` delimiters

### Shiki Highlighting Issues {#shiki-issues}

If code highlighting does not work:

1. Ensure the language identifier is supported by Shiki (e.g., `ts`, `js`, `html`, `css`)
2. Check that the `highlight.theme` option in `swifty-docs.config.ts` is a valid Shiki theme name
3. If using a custom theme, verify that it is properly configured

### Build Fails with Out of Memory {#out-of-memory}

For large documentation sites, the build may run out of memory. Increase the Node.js memory limit:

```sh
$ NODE_OPTIONS="--max-old-space-size=4096" npx vite build
```

Or add this to your `package.json` scripts:

```json
{
  "scripts": {
    "build": "NODE_OPTIONS='--max-old-space-size=4096' vite build"
  }
}
```

### Hot Module Replacement Not Working {#hmr-issues}

If changes to Markdown files do not trigger updates:

1. Ensure the file is inside the `docs` directory specified in `swifty-docs.config.ts`
2. Check that the file has a `.md` extension
3. Restart the development server
4. Clear the Vite cache: `npx vite --force`

## Advanced Usage {#advanced-usage}

### Custom Build Scripts {#custom-build-scripts}

For complex deployment workflows, you can create custom build scripts that invoke Vite programmatically:

```ts
import { build } from "vite";
import swiftyDocsConfig from "./swifty-docs.config.js";

await build({
  root: "app",
  plugins: [
    // ... your plugins
  ],
  build: {
    outDir: "../dist-docs",
  },
});
```

### Multiple Environments {#multiple-environments}

To build for different environments (staging, production, etc.), create separate `.env` files and use the `--mode` flag:

```sh
$ npx vite build --mode staging
$ npx vite build --mode production
```

Each mode loads its corresponding `.env` file (`.env.staging`, `.env.production`).

### Analyzing Bundle Size {#bundle-analysis}

To analyze the production bundle size, use the `rollup-plugin-visualizer`:

```sh
$ npm add -D rollup-plugin-visualizer
```

Add it to your `vite.config.ts`:

```ts
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    // ... other plugins
    visualizer({ open: true }),
  ],
});
```

Then run the build. The visualizer opens a browser window showing the bundle composition.

## Related Resources {#related-resources}

- [Vite CLI Documentation](https://vitejs.dev/guide/cli.html)
- [Getting Started](../guide/getting-started)
- [Configuration Reference](../guide/configuration)
- [Build and Deploy](../guide/build-and-deploy)
