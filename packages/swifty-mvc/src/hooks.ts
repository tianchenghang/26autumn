/**
 * Hooks runtime for the functional view system.
 *
 * Hooks (`useState`, `useEffect`, `useStore`, etc.) work via a module-level
 * `currentCtx` that is set during setup function execution. The setup function
 * runs once on mount (inside `mountCtx`), and hooks register state, effects,
 * and subscriptions on the ctx.
 *
 * Key difference from React hooks: Swifty's setup runs ONCE (not on every
 * render). `useState` returns a `[getter, setter]` pair where the getter
 * always reads from `ctx.updater.data` — avoiding stale closures. The
 * template (compiled from `.html`) reads from `updater.data` independently
 * of the setup function's closures.
 */
import type { ViewCtx, AnyFunc } from "./types";
import { bindStore } from "./store";
import type { StoreApi } from "./store";

// ============================================================
// Current context — set during setup function execution
// ============================================================

let currentCtx: ViewCtx | null = null;

/**
 * Set the current ctx. Called by `mountCtx` before running the setup function.
 * @internal
 */
export function setCurrentCtx(ctx: ViewCtx | null): void {
  currentCtx = ctx;
}

/**
 * Get the current ctx. Throws if called outside a setup function.
 */
function getCtx(): ViewCtx {
  if (!currentCtx) {
    throw new Error("Hooks can only be called inside a view setup function");
  }
  return currentCtx;
}

// ============================================================
// useState — view-local state backed by updater.data
// ============================================================

/**
 * Declare view-local state backed by `ctx.updater.data`.
 *
 * Returns a `[getter, setter]` pair. The getter always reads the latest
 * value from `ctx.updater.data[key]`, avoiding stale closures in event
 * handlers. The setter writes to `ctx.updater.data` and triggers a digest.
 *
 * @param key - The data key in `updater.data`
 * @param initial - Initial value (set once on first call)
 *
 * @example
 * const [getCount, setCount] = useState('count', 0);
 * // In event handler:
 * "incr<click>": (e) => setCount(getCount() + 1)
 */
export function useState<T>(
  key: string,
  initial: T,
): [() => T, (v: T) => void] {
  const ctx = getCtx();

  // Set initial value if not already present
  const existing = ctx.updater.get<unknown>(key);
  if (existing === undefined) {
    ctx.updater.set({ [key]: initial });
  }

  const getter = (): T => ctx.updater.get<T>(key);
  const setter = (v: T): void => {
    ctx.updater.set({ [key]: v }).digest();
  };

  return [getter, setter];
}

// ============================================================
// useEffect — register cleanup functions
// ============================================================

/**
 * Register a side effect with optional cleanup.
 *
 * The effect function runs immediately during setup. If it returns a cleanup
 * function, that cleanup is called on view destroy (or on HMR re-setup).
 *
 * Unlike React's `useEffect`, this runs synchronously during setup (not
 * deferred to a later tick) and does not re-run on dependency changes
 * (since setup only runs once).
 *
 * @example
 * useEffect(() => {
 *   const timer = setInterval(tick, 1000);
 *   return () => clearInterval(timer);
 * });
 */
export function useEffect(
  fn: () => (() => void) | void,
  _deps?: unknown[],
): void {
  const ctx = getCtx();
  const cleanup = fn();
  if (typeof cleanup === "function") {
    ctx.cleanups.push(cleanup);
  }
}

// ============================================================
// useStore — bind a zustand-aligned store to the view
// ============================================================

/**
 * Bind a store to the view's updater. The store's state is synced to
 * `ctx.updater.data` automatically. Auto-unsubscribes on view destroy.
 *
 * @param store - The store created by `create()`
 * @param selector - Optional selector to pick which keys to sync
 * @returns A getter that reads the selected state from updater.data
 *
 * @example
 * const getCount = useStore(useCountStore, (s) => ({ count: s.count }));
 * // In event handler:
 * "incr<click>": (e) => useCountStore.getState().increment()
 */
export function useStore<T extends object>(
  store: StoreApi<T>,
  selector?: (s: T) => Partial<T>,
): () => Partial<T> {
  const ctx = getCtx();
  bindStore(ctx, store, selector);

  // Return a getter that reads from updater.data
  // Without selector, all non-function keys are synced
  // With selector, only the selected keys are synced
  if (selector) {
    return (): Partial<T> => {
      const state = store.getState();
      return selector(state);
    };
  }
  return (): Partial<T> => {
    // Return all non-function state keys from updater
    const data = ctx.updater.get<Record<string, unknown>>();
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      if (key !== "vId" && typeof data[key] !== "function") {
        result[key] = data[key];
      }
    }
    // Dynamic construction from updater data — cast to Partial<T> is
    // unavoidable since we can't verify the shape matches T at runtime.
    return result as Partial<T>;
  };
}

// ============================================================
// useUrlState — defined in url-state.ts (already accepts ViewCtx)
// ============================================================

// ============================================================
// useInterval — setInterval with automatic cleanup
// ============================================================

/**
 * Set up an interval that is automatically cleared on view destroy.
 *
 * @param fn - Function to call on each interval
 * @param delay - Interval delay in milliseconds
 *
 * @example
 * useInterval(() => {
 *   ctx.updater.set({ time: Date.now() }).digest();
 * }, 1000);
 */
export function useInterval(fn: () => void, delay: number): void {
  const ctx = getCtx();
  const timer = setInterval(fn, delay);
  ctx.cleanups.push(() => clearInterval(timer));
}

// ============================================================
// useTimeout — setTimeout with automatic cleanup
// ============================================================

/**
 * Set up a timeout that is automatically cleared on view destroy.
 *
 * @param fn - Function to call after delay
 * @param delay - Timeout delay in milliseconds
 */
export function useTimeout(fn: () => void, delay: number): void {
  const ctx = getCtx();
  const timer = setTimeout(fn, delay);
  ctx.cleanups.push(() => clearTimeout(timer));
}

// ============================================================
// useResource — capture a resource with automatic cleanup
// ============================================================

/**
 * Capture a resource (e.g., a Service instance, observer, etc.) that is
 * automatically destroyed on view destroy or render (if destroyOnRender).
 *
 * @param key - Unique key for the resource
 * @param resource - The resource object (must have a `destroy()` method)
 * @param destroyOnRender - If true, destroyed on next render call
 *
 * @example
 * const service = createService(syncFn);
 * useResource('myService', service.instance(), true);
 */
export function useResource(
  key: string,
  resource: unknown,
  destroyOnRender = false,
): void {
  const ctx = getCtx();
  ctx.capture(key, resource, destroyOnRender);
}

// ============================================================
// useEvent — register an event handler on the ctx emitter
// ============================================================

/**
 * Register an event handler on the view's internal emitter.
 * Automatically unregistered on view destroy.
 *
 * @param event - Event name (e.g., "destroy", "render")
 * @param handler - Event handler function
 *
 * @example
 * useEvent("destroy", () => console.log("View destroyed"));
 */
export function useEvent(event: string, handler: AnyFunc): void {
  const ctx = getCtx();
  const off = ctx.on(event, handler);
  ctx.cleanups.push(off);
}
