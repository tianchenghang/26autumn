/**
 * Webpack loader and plugin for @swifty.js/docs.
 *
 * The loader transforms .md files into JS modules that export swifty-mvc Views.
 * The plugin auto-registers the loader rule for .md files.
 *
 * Usage:
 * ```ts
 * import { SwiftyDocsPlugin } from "@swifty.js/docs/webpack";
 *
 * export default {
 *   plugins: [new SwiftyDocsPlugin({ config: docsConfig })],
 * };
 * ```
 */
import type { DocsConfig } from "./types";
import { compileMarkdown } from "./compile-markdown";

// Re-export build-time utilities for use in webpack.config
// (avoids importing from the main entry, which pulls in the browser-only
// SolidJS theme and is not valid in Node loader contexts)
export { scanDocsDir } from "./scanner";
export { generateSidebar } from "./sidebar-generator";
export type { DocsConfig, SidebarConfig } from "./types";

export interface SwiftyDocsWebpackOptions {
  /** Full docs config. */
  config: DocsConfig;
  /** Enable debug mode. */
  debug?: boolean;
  /** Test regex. Default: /\.md$/ */
  test?: RegExp;
  /** Exclude regex. Default: /node_modules/ */
  exclude?: RegExp;
}

interface WebpackLoaderContext {
  callback: (err: Error | null, result?: string) => void;
  getOptions: () => SwiftyDocsWebpackOptions;
  resourcePath: string;
}

/**
 * Webpack loader function.
 * Uses this.callback() for async delivery (standard webpack 5 pattern).
 * compileMarkdown is async (Shiki init), so we chain .then/.catch.
 */
export function swiftyDocsLoader(
  this: WebpackLoaderContext,
  source: string,
): void {
  const callback = this.callback;
  const options = this.getOptions();

  compileMarkdown(source, {
    config: options.config,
    filePath: this.resourcePath,
    debug: options.debug,
  })
    .then((result) => callback(null, result))
    .catch((err: unknown) =>
      callback(err instanceof Error ? err : new Error(String(err))),
    );
}

/**
 * Webpack plugin that auto-registers the .md loader rule.
 */
export class SwiftyDocsPlugin {
  private options: SwiftyDocsWebpackOptions;

  constructor(options: SwiftyDocsWebpackOptions) {
    this.options = options;
  }

  apply(compiler: {
    options: { module: { rules: Array<Record<string, unknown>> } };
  }): void {
    const test = this.options.test || /\.md$/;
    const exclude = this.options.exclude || /node_modules/;

    // __filename is injected by the CJS_SHIMS banner (see vite.config.ts)
    // for chunks that reference __filename/__dirname. Webpack resolves the
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
