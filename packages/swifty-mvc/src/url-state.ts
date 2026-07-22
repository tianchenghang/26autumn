/**
 * useUrlState — sync view state with URL query parameters.
 *
 * Similar to useUrlState: reads initial state from URL params,
 * and writes state changes back to the URL via Router.to().
 * Automatically observes the specified param keys so the view
 * re-renders when the URL changes (via back/forward or Router.to).
 *
 * Works with both history and hash routing modes.
 */
import { Router } from "./router";
import type { ViewCtx } from "./types";

/**
 * Sync view state with URL query parameters.
 *
 * @param view - The view instance to bind to (for auto location observation and lifecycle)
 * @param initialState - Default values for each URL param key. Keys not present
 *   in the URL will use these defaults. Keys present in the URL override defaults.
 * @returns A tuple `[state, setState]`:
 *   - `state`: current values read from the URL, merged with defaults
 *   - `setState`: update URL params. Accepts a partial object or an updater function.
 *     Only the specified keys are changed; other URL params are preserved.
 *
 * @example
 * ```ts
 * export default defineView((ctx) => {
 *   const [state, setState] = useUrlState(ctx, { page: "1", size: "20" });
 *   ctx.updater.set({ page: state.page, size: state.size }).digest();
 *   return {
 *     template,
 *     events: {
 *       "nextPage<click>"() {
 *         setState((prev) => ({ page: String(Number(prev.page) + 1) }));
 *       },
 *     },
 *   };
 * });
 * ```
 */
export function useUrlState<S extends Record<string, string>>(
  view: ViewCtx,
  initialState?: S,
): [Readonly<S>, (patch: Partial<S> | ((prev: S) => Partial<S>)) => void] {
  const keys = initialState ? Object.keys(initialState) : [];

  if (keys.length > 0) {
    view.observeLocation(keys);
  }

  const getState = (): S => {
    const loc = Router.parse();
    const result: Record<string, string> = { ...(initialState || {}) };
    for (const key of keys) {
      const val = loc.get(key);
      if (val) result[key] = val;
    }
    // result is dynamically constructed from defaults + URL params;
    // cast to S is unavoidable since we can't verify the shape at runtime.
    return result as S;
  };

  const setState = (patch: Partial<S> | ((prev: S) => Partial<S>)): void => {
    const current = getState();
    const resolved = typeof patch === "function" ? patch(current) : patch;
    // Partial<S> where S extends Record<string, string> is assignable to
    // Record<string, unknown> without a cast.
    Router.to(resolved);
  };

  return [getState(), setState];
}
