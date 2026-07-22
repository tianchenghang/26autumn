/**
 * Module loader: async view loading via FrameworkConfig.require or dynamic import.
 *
 * Extracted from framework.ts to avoid circular dependency with frame.ts.
 * Both framework.ts and frame.ts import from this module.
 */
import type { FrameworkConfig } from "./types";

// ============================================================
// Framework configuration (shared mutable state)
// ============================================================

/** Framework configuration */
export const config: FrameworkConfig = {
  rootId: "root",
  routeMode: "history",
  hashbang: "#!",
  error: (error: Error) => {
    throw error;
  },
};

// ============================================================
// Module loading
// ============================================================

/**
 * Load modules via the configured require function or dynamic import fallback.
 *
 * Two calling conventions:
 * 1. `use(name | name[], callback)`
 * 2. `use(name | name[])` — returns Promise<unknown[]> (no callback)
 *
 * When `FrameworkConfig.require` is configured, delegates to it (e.g., Webpack Module Federation).
 * When not configured, falls back to `dynamic import()` for ESM-based loading.
 */
export function use(
  names: string | string[],
  callback?: (...modules: unknown[]) => void,
): Promise<unknown[]> {
  const nameList = typeof names === "string" ? [names] : names;

  const loadPromise = (() => {
    if (config.require) {
      // Use the configured require function (e.g., Webpack MF integration)
      const result = config.require(nameList);
      if (result && typeof result.then === "function") {
        return result as Promise<unknown[]>;
      }
      // require returned undefined or non-Promise: resolve with empty
      return Promise.resolve([]);
    }

    // Fallback: dynamic import() for ESM-based loading
    return Promise.all(
      nameList.map((name) => {
        // Normalize path for dynamic import
        const importPath =
          name.startsWith(".") || name.startsWith("/") ? name : `./${name}`;
        return import(/* @vite-ignore */ /* webpackIgnore: true */ importPath)
          .then((mod: Record<string, unknown>) => {
            // Extract default export for ESM compatibility.
            // Vite dev mode does NOT set __esModule, so check default directly.
            // FIXME: Is there any better implementation?
            return mod &&
              (mod["__esModule"] || // For Webpack
                typeof mod["default"] === "function") // For Vite
              ? mod["default"]
              : mod;
          })
          .catch((err: unknown) => {
            const errorHandler = config.error;
            if (errorHandler) {
              errorHandler(err instanceof Error ? err : new Error(String(err)));
            }
            return undefined;
          });
      }),
    );
  })();

  // If callback provided, call it when loaded
  if (callback) {
    loadPromise.then((modules: unknown[]) => {
      callback(...modules);
    });
  }

  return loadPromise;
}
