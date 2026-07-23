/**
 * Vite plugin for @swifty.js/docs2.
 *
 * Returns the plugin a docs site needs:
 * - swifty-docs — compiles .md files into { pageData, contentHtml } modules
 *
 * Usage:
 * ```ts
 * import { swiftyDocsPlugin } from "@swifty.js/docs2/vite";
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
 * - swifty-docs: compiles .md files to JS modules
 */
export function swiftyDocsPlugin(
  options: SwiftyDocsVitePluginOptions,
): Plugin[] {
  const { config, debug = false } = options;

  const docsPlugin: Plugin = {
    name: "swifty-docs",
    enforce: "pre",

    resolveId(source: string, importer?: string) {
      const cleanSource = source.split("?")[0];
      if (!cleanSource.endsWith(".md")) return null;
      if (cleanSource.includes("node_modules")) return null;
      const abs = isAbsolute(cleanSource)
        ? cleanSource
        : importer
          ? resolve(dirname(importer), cleanSource)
          : resolve(process.cwd(), cleanSource);
      const real = abs.startsWith("/@fs") ? abs.slice("/@fs".length) : abs;
      if (debug) {
        console.log(
          `[@swifty.js/docs2] resolveId: ${source} -> ${real}${MD_SUFFIX} (importer=${importer ?? "none"})`,
        );
      }
      return real + MD_SUFFIX;
    },

    async load(id: string) {
      const qIdx = id.indexOf("?");
      const query = qIdx >= 0 ? id.slice(qIdx + 1) : "";
      if (!query.split("&").includes("swifty-docs")) return null;

      let filePath = qIdx >= 0 ? id.slice(0, qIdx) : id;

      if (filePath.startsWith("/@fs")) {
        filePath = filePath.slice("/@fs".length);
      }

      if (debug) {
        console.log(`[@swifty.js/docs2] load: id=${id} filePath=${filePath}`);
      }

      const source = fs.readFileSync(filePath, "utf-8");

      return await compileMarkdown(source, {
        config,
        filePath,
        debug,
      });
    },
  };

  return [docsPlugin];
}
