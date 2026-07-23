/**
 * Vite plugin for @swifty.js/docs.
 *
 * Returns the plugin pair a docs site needs:
 * 1. swifty-docs — compiles .md files into { pageData, contentHtml } modules
 * 2. solid — compiles the SolidJS theme (and your own .tsx components)
 *
 * Usage:
 * ```ts
 * import { swiftyDocsPlugin } from "@swifty.js/docs/vite";
 *
 * export default defineConfig({
 *   plugins: [swiftyDocsPlugin({ config: docsConfig })],
 * });
 * ```
 */
import fs from "node:fs";
import { isAbsolute, resolve, dirname } from "node:path";
import type { DocsConfig } from "./types";
import { compileMarkdown } from "./compile-markdown";
import type { Plugin } from "vite";
import solid from "vite-plugin-solid";

// Re-export build-time utilities for use in vite.config
export { defineConfig } from "./define-config";
export { scanDocsDir } from "./scanner";
export { generateSidebar } from "./sidebar-generator";
export type { DocsConfig, SidebarConfig } from "./types";

export interface SwiftyDocsVitePluginOptions {
  /** Full docs config. */
  config: DocsConfig;
  /** Log resolveId/load activity. */
  debug?: boolean;
}

// Suffix used to mark compiled .md files in the module graph
const MD_SUFFIX = "?swifty-docs";

/**
 * Create the Vite plugin array for a docs site:
 * 1. swifty-docs: compiles .md files to JS modules
 * 2. solid (vite-plugin-solid): compiles the SolidJS theme JSX
 */
export function swiftyDocsPlugin(
  options: SwiftyDocsVitePluginOptions,
): Plugin[] {
  const { config, debug = false } = options;

  const docsPlugin: Plugin = {
    name: "swifty-docs",
    enforce: "pre",

    resolveId(source: string, importer?: string) {
      // Strip query params (Vite 8 may add ?import, ?url, etc.)
      const cleanSource = source.split("?")[0];
      if (!cleanSource.endsWith(".md")) return null;
      // Don't intercept markdown from node_modules — third-party packages
      // may import their own README/changelog and those should not be
      // compiled through the swifty-docs pipeline.
      if (cleanSource.includes("node_modules")) return null;
      // Resolve to an absolute path so Vite can locate the file regardless
      // of the importer location. Returning a relative id here caused Vite
      // to normalize it against an unexpected root, producing
      // "/docs/index.md" (ENOENT).
      const abs = isAbsolute(cleanSource)
        ? cleanSource
        : importer
          ? resolve(dirname(importer), cleanSource)
          : resolve(process.cwd(), cleanSource);
      // Strip Vite's /@fs prefix so we return a real filesystem path.
      // Vite will re-add /@fs if the file is outside root. Without this,
      // returning "/@fs/.../docs/index.md?swifty-docs" confused downstream
      // id normalization.
      const real = abs.startsWith("/@fs") ? abs.slice("/@fs".length) : abs;
      if (debug) {
        console.log(
          `[@swifty.js/docs] resolveId: ${source} -> ${real}${MD_SUFFIX} (importer=${importer ?? "none"})`,
        );
      }
      return real + MD_SUFFIX;
    },

    async load(id: string) {
      // Vite may add extra query params (e.g. ?import&swifty-docs),
      // so check if swifty-docs is in the query, not just endsWith.
      const qIdx = id.indexOf("?");
      const query = qIdx >= 0 ? id.slice(qIdx + 1) : "";
      if (!query.split("&").includes("swifty-docs")) return null;

      // Extract file path: strip query params
      let filePath = qIdx >= 0 ? id.slice(0, qIdx) : id;

      // Strip Vite's @fs prefix (used for files outside the root)
      if (filePath.startsWith("/@fs")) {
        filePath = filePath.slice("/@fs".length); // "/@fs/path" → "/path"
      }

      if (debug) {
        console.log(`[@swifty.js/docs] load: id=${id} filePath=${filePath}`);
      }

      const source = fs.readFileSync(filePath, "utf-8");

      return await compileMarkdown(source, {
        config,
        filePath,
        debug,
      });
    },
  };

  return [docsPlugin, solid() as Plugin];
}
