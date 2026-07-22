/**
 * View setup registry: viewPath -> ViewSetup function.
 *
 * In the functional system, the registry stores `ViewSetup` functions (not
 * View classes). `defineView(setupFn)` returns the setup function, which is
 * registered here and later called by `mountCtx` to create a `ViewCtx`.
 */
import { parseUri } from "./utils";
import type { ViewSetup } from "./types";

/** Registry of view setup functions keyed by path. */
const viewSetupRegistry: Record<string, ViewSetup> = {};

/**
 * Look up a previously registered View setup function by path.
 * Returns `undefined` if no setup is registered for `path`.
 */
export function getViewClass(path: string): ViewSetup | undefined {
  return viewSetupRegistry[path];
}

/**
 * Register a View setup function for a given view path.
 * Called after module loading completes (or up front during boot).
 */
export function registerViewClass(viewPath: string, setup: ViewSetup): void {
  const parsed = parseUri(viewPath);
  const path = parsed.path;
  if (path) {
    viewSetupRegistry[path] = setup;
  }
}

/**
 * Invalidate a View setup from the registry.
 * Used by HMR to force re-loading of a view module.
 */
export function invalidateViewClass(viewPath: string): void {
  const parsed = parseUri(viewPath);
  const path = parsed.path;
  if (path) {
    Reflect.deleteProperty(viewSetupRegistry, path);
  }
}

/**
 * Get the full view setup registry (for HMR / debugging).
 */
export function getViewClassRegistry(): Record<string, ViewSetup> {
  return viewSetupRegistry;
}
