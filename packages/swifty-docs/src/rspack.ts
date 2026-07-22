/**
 * Rspack loader and plugin for @swifty.js/docs.
 *
 * Mirrors the Webpack integration but returns a Promise directly
 * (Rspack async loaders must return the result, not call this.callback()).
 *
 * Usage:
 * ```ts
 * import { SwiftyDocsPlugin } from "@swifty.js/docs/rspack";
 *
 * export default {
 *   plugins: [new SwiftyDocsPlugin({ config: docsConfig })],
 * };
 * ```
 */
import type { DocsConfig } from "./types";
import { compileMarkdown } from "./compile-markdown";

// Re-export build-time utilities for use in rspack.config
// (avoids importing from main entry which pulls in lucide-static SVG ?raw imports)
export { scanDocsDir } from "./scanner";
export { generateSidebar } from "./sidebar-generator";
export type { DocsConfig, SidebarConfig } from "./types";

export interface SwiftyDocsRspackOptions {
  /** Full docs config. */
  config: DocsConfig;
  /** Enable debug mode. */
  debug?: boolean;
  /** Test regex. Default: /\.md$/ */
  test?: RegExp;
  /** Exclude regex. Default: /node_modules/ */
  exclude?: RegExp;
}

interface RspackLoaderContext {
  getOptions: () => SwiftyDocsRspackOptions;
  resourcePath: string;
}

/**
 * Rspack loader function.
 * Returns a Promise directly (Rspack async loaders must return the result).
 */
export async function swiftyDocsLoader(
  this: RspackLoaderContext,
  source: string,
): Promise<string> {
  const options = this.getOptions();
  return await compileMarkdown(source, {
    config: options.config,
    filePath: this.resourcePath,
    debug: options.debug,
  });
}

/**
 * Rspack plugin that auto-registers the .md loader rule.
 */
export class SwiftyDocsPlugin {
  private options: SwiftyDocsRspackOptions;

  constructor(options: SwiftyDocsRspackOptions) {
    this.options = options;
  }

  apply(compiler: {
    options: { module: { rules: Array<Record<string, unknown>> } };
  }): void {
    const test = this.options.test || /\.md$/;
    const exclude = this.options.exclude || /node_modules/;

    // __filename is injected by the CJS_SHIMS banner (see vite.config.ts)
    // for chunks that reference __filename/__dirname. Rspack resolves the
    // loader via this absolute path to the compiled .cjs output.
    compiler.options.module.rules.push({
      test,
      exclude,
      use: [
        {
          loader: __filename,
          options: this.options,
        },
      ],
    });
  }
}
