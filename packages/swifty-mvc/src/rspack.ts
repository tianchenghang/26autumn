/**
 * @swifty.js/mvc Rspack Integration for Template Compilation
 *
 * Provides two integration modes:
 *
 * 1. **Loader** (swiftyMvcLoader) — Direct file transformation
 *    - Transforms .html files into JS function modules
 *    - Requires manual rspack.config.ts setup
 *
 * 2. **Plugin** (SwiftyMvcPlugin) — Auto-registers the loader
 *    - Automatically configures the loader rule for .html files
 *    - Zero-config: just add the plugin to your rspack config
 *    - Recommended approach for most use cases
 *
 * Features:
 * - All template operators: = (escape), ! (raw), @ (ref lookup), : (binding)
 * - @event attribute processing with \x1f prefix + \x1e separator
 * - __swifty_enc_html__ (HTML entity encode), __swifty_str_safe__ (null-safe toString), __swifty_ref_fn__ (reference lookup)
 * - Debug mode with line tracking
 * - View ID injection
 * - Auto variable extraction via AST analysis (Babel)
 * - Virtual DOM support (optional)
 *
 * Usage with Plugin (recommended):
 * ```js
 * import { SwiftyMvcPlugin } from '@swifty.js/mvc/rspack';
 *
 * export default {
 *   plugins: [
 *     new SwiftyMvcPlugin({
 *       debug: process.env.NODE_ENV !== 'production',
 *       vdom: false,
 *     }),
 *   ],
 * };
 * ```
 *
 * Usage with Loader (manual):
 * ```js
 * export default {
 *   module: {
 *     rules: [{
 *       test: /\.html$/,
 *       loader: '@swifty.js/mvc/rspack',
 *       options: { debug: false, vdom: false },
 *     }],
 *   },
 * };
 * ```
 */
import type { Compiler, RspackPluginInstance } from "@rspack/core";
import { compileTemplate, extractGlobalVars } from "./compiler";
import { injectTemplateHmrSnippet, injectViewHmrSnippet } from "./hmr-inject";
import type {
  SwiftyMvcWebpackLoaderOptions,
  SwiftyMvcWebpackPluginOptions,
} from "./webpack";
export type {
  SwiftyMvcWebpackLoaderOptions,
  SwiftyMvcWebpackPluginOptions,
} from "./webpack";

/** Rspack loader context */
interface LoaderContext {
  /** Whether in development mode */
  dev?: boolean;
  /** Loader options */
  getOptions: () => SwiftyMvcWebpackLoaderOptions;
}

/**
 * Rspack loader entry point.
 * Compiles .html template files into JS function modules.
 *
 * Unlike the webpack version, rspack async loaders must return the result
 * directly rather than calling `this.callback()`. Calling callback() inside
 * an async function causes "callback already called" errors because the
 * resolved promise also signals completion.
 */
export async function swiftyMvcLoader(
  this: LoaderContext,
  source: string,
): Promise<string> {
  try {
    const options = this.getOptions();
    const { debug = false, vdom = false, hmr } = options;

    // View HMR mode: inject view-class HMR into .ts files that import .html.
    // This is the rspack equivalent of Vite's `transform` hook — ensures .ts
    // view file changes self-accept and hot-swap in place, preserving state.
    if (hmr === "view") {
      return injectViewHmrSnippet(source, "rspack");
    }

    const globalVars = await extractGlobalVars(source);
    const compiled = await compileTemplate(source, {
      debug,
      globalVars,
      vdom,
    });
    // Auto-inject HMR: the compiled template module self-accepts, so
    // .html changes hot-swap the template on all mounted views without
    // a full page reload — no user-side code required (like React/Vue).

    return injectTemplateHmrSnippet(compiled, "rspack");
  } catch (err) {
    console.error(err);
    return "";
  }
}

/**
 * Rspack plugin that auto-registers the swifty-mvc loader.
 *
 * This is the recommended integration approach. The plugin:
 * 1. Automatically adds a loader rule for .html files
 * 2. Passes through all configuration options
 * 3. Handles edge cases (e.g., excluding node_modules)
 *
 * Usage:
 * ```js
 * import { SwiftyMvcPlugin } from '@swifty.js/mvc/rspack';
 *
 * export default {
 *   plugins: [
 *     new SwiftyMvcPlugin({
 *       debug: true,
 *       vdom: false,
 *     }),
 *   ],
 * };
 * ```
 */
export class SwiftyMvcPlugin implements RspackPluginInstance {
  private options: SwiftyMvcWebpackPluginOptions;

  constructor(options: SwiftyMvcWebpackPluginOptions = {}) {
    this.options = {
      debug: false,
      vdom: false,
      test: /\.html$/,
      exclude: /node_modules/,
      ...options,
    };
  }

  /**
   * Rspack plugin entry point.
   * Called by rspack when the plugin is applied.
   */
  apply(compiler: Compiler): void {
    const { debug, vdom, test, exclude } = this.options;

    // Push the loader rule into rspack's module.rules
    compiler.options.module = compiler.options.module || {};
    compiler.options.module.rules = compiler.options.module.rules || [];

    // Rule 1: .html template compilation + HMR injection.
    // `type: "javascript/auto"` ensures rspack treats the loader output as a
    // JavaScript module (not an asset), which is required for
    // `import.meta.webpackHot` to be available at runtime. Without this,
    // rsbuild/rspack may match a built-in asset rule for .html files, causing
    // the compiled template to lose HMR self-accept capability.
    compiler.options.module.rules.push({
      test,
      exclude,
      type: "javascript/auto",
      use: [
        {
          // Resolve the loader path (this file).
          // __filename is provided by tsup's ESM shim (shims: true) in ESM output,
          // and is a native CJS global in CJS output.
          loader: __filename,
          options: { debug, vdom },
        },
      ],
    });

    // Rule 2: .ts/.js view file HMR injection.
    // This is the rspack equivalent of Vite's `transform` hook. When a .ts
    // view file (one that imports a .html template) changes, the injected
    // HMR code makes the module self-accept and hot-swap the view setup
    // function in place — preserving view-local state.
    //
    // `enforce: "pre"` ensures this loader runs BEFORE rsbuild's built-in
    // SWC/ts-loader, receiving the raw TypeScript source. The injected code
    // is TypeScript-compatible (uses `import.meta.webpackHot` which TS
    // recognizes as a valid `import.meta` access).
    compiler.options.module.rules.push({
      test: /\.[jt]s$/,
      exclude: /node_modules/,
      enforce: "pre",
      use: [
        {
          loader: __filename,
          options: { hmr: "view" },
        },
      ],
    });
  }
}

export { swiftyMvcLoader as default };
