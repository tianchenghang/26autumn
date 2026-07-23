/**
 * Type-safe configuration helper with automatic route generation.
 *
 * Scans the docs directory, generates sidebar, and writes a runtime module
 * to `.swifty-docs/generated/` so that `boot.ts` can import routes and site
 * data via the `@swifty-docs/generated` alias.
 *
 * The generated file is a plain `.js` runtime module. Type declarations for
 * `@swifty-docs/generated` are provided by `src/shims.d.ts` (ambient module
 * declaration), so IDE type-checking works without a generated `.d.ts` file.
 *
 * Usage:
 * ```ts
 * import { defineConfig } from "@swifty.js/docs";
 *
 * export default defineConfig({
 *   docs: "docs",
 *   baseUrl: "/docs/",
 *   title: "My Library",
 * });
 * ```
 *
 * The optional second argument `projectRoot` controls path resolution
 * for the `docs` directory and the generated output. Defaults to
 * `process.cwd()`, which is the project root in most Vite/Webpack/Rspack
 * setups.
 */
import type { DocsConfig, SidebarConfig } from "./types";
import { scanDocsDir } from "./scanner";
import { generateSidebar } from "./sidebar-generator";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ejs from "ejs";

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const fileContentTemplate = readFileSync(
  resolve(_dirname, "file-content.ejs"),
  "utf-8",
);

export function defineConfig(
  config: DocsConfig,
  projectRoot: string = process.cwd(),
): DocsConfig {
  generateRoutesFile(config, projectRoot);
  return config;
}

/**
 * Generate a runtime module into `{projectRoot}/.swifty-docs/generated/`.
 *
 * Outputs `index.js` — runtime code (loaders, loadContent, routes, docsConfig,
 * getSearchIndex) rendered from `file-content.ejs`.
 *
 * Written to `.swifty-docs/` (a dot directory at project root, similar to
 * `.vitepress/` or `.docusaurus/`) so it can be gitignored. Consumers import
 * it via a Vite resolve alias `@swifty-docs/generated`.
 */
function generateRoutesFile(config: DocsConfig, projectRoot: string): void {
  const docsDir = isAbsolute(config.docs)
    ? config.docs
    : resolve(projectRoot, config.docs);

  const routes = scanDocsDir(docsDir, config.baseUrl);

  // Build sidebar
  const sidebar: Record<string, SidebarConfig> = {};
  if (config.sidebar) {
    for (const [prefix, sidebarConfig] of Object.entries(config.sidebar)) {
      if (sidebarConfig === "auto") {
        sidebar[prefix] = generateSidebar(routes, prefix);
      } else {
        sidebar[prefix] = sidebarConfig;
      }
    }
  }

  const generatedDir = resolve(projectRoot, ".swifty-docs/generated");

  // Generate dynamic-import loaders: route path -> () => import(filePath).
  // Each .md is compiled by the bundler plugin (swiftyDocsPlugin) into a module
  // exporting { pageData, contentHtml }. The layout view calls loadContent()
  // on navigation to fetch the matching page.
  // Use relative paths so the generated file is portable across machines.
  // Absolute paths leak the developer's local directory and break on CI or
  // when the repo is cloned elsewhere.
  const loaderEntries = routes
    .map((r) => {
      const rel = relative(generatedDir, r.filePath).replace(/\\/g, "/");
      const specifier = rel.startsWith(".") ? rel : "./" + rel;
      return `${JSON.stringify(r.path)}: () => import(${JSON.stringify(specifier)}),`;
    })
    .join("\n");

  // Canonical paths of real content routes (excluding virtual index routes).
  // Used by getSearchIndex() to avoid duplicate search entries.
  const searchablePaths = routes
    .filter((r) => !r.isDirectoryIndex)
    .map((r) => r.path);

  // Compose runtime docsConfig. searchIndex is NOT included here — it is
  // lazily built at runtime by getSearchIndex() (loading all .md modules on
  // first search) to keep this generated file small.
  const runtimeConfig: Omit<DocsConfig, "docs"> = {
    title: config.title,
    description: config.description || "",
    baseUrl: config.baseUrl,
    nav: config.nav || [],
    sidebar,
  };

  // Render the runtime JS module from the EJS template.
  const fileContent = ejs.render(fileContentTemplate, {
    generatedAt: new Date().toISOString(),
    loaderEntries,
    searchablePathsJson: JSON.stringify(searchablePaths),
    docsConfigJson: JSON.stringify(runtimeConfig, null, 2),
  });

  // Write generated module to .swifty-docs/generated/
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(resolve(generatedDir, "index.js"), fileContent, "utf-8");
}
