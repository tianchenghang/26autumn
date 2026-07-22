/**
 * @swifty.js/mvc Store
 *
 * Zustand-aligned state management for Swifty MVC.
 *
 * Core API:
 * - create(name, creator): define a store with (set, get) => initialState
 * - store.getState(): read current state snapshot
 * - store.setState(partial | updater): shallow-merge state and notify listeners
 * - store.subscribe(listener): listen for state changes
 * - store.destroy(): tear down the store
 * - computed(deps, fn): derived state that auto-recomputes when deps change
 * - bindStore(view, store, selector?): Swifty View lifecycle binding
 */

import type { AnyFunc } from "./types";

// ---- Types ----------------------------------------------------------------

type Listener<T> = (state: T, prevState: T) => void;

export interface StoreApi<T = object> {
  getState(): T;
  setState(partial: Partial<T> | ((prev: T) => Partial<T>)): void;
  subscribe(listener: Listener<T>): () => void;
  destroy(): void;
}

type StateCreator<T> = (
  set: (partial: Partial<T> | ((prev: T) => Partial<T>)) => void,
  get: () => T,
) => T;

// ---- Computed marker -------------------------------------------------------

const COMPUTED_BRAND = Symbol("swifty-store-computed");

interface ComputedMarker<T = unknown> {
  [COMPUTED_BRAND]: true;
  deps: readonly string[];
  fn: () => T;
}

function isComputedMarker(val: unknown): val is ComputedMarker {
  return (
    val !== null &&
    typeof val === "object" &&
    Reflect.get(val, COMPUTED_BRAND) === true
  );
}

/**
 * Declare a derived (computed) store property.
 *
 * Usage inside a `create` creator:
 * ```ts
 * const store = create("counter", (set, get) => ({
 *   count: 0,
 *   doubled: computed(["count"], () => get().count * 2),
 * }));
 * ```
 *
 * `deps` lists the state keys the computed reads. Whenever any dep changes
 * via `setState`, the computed re-evaluates before listeners are notified.
 * Writes to a computed key via `setState` are silently ignored.
 */
export function computed<T>(deps: readonly string[], fn: () => T): T {
  // The marker object is branded with a symbol; callers treat the return
  // value as type T but the store reads the marker via isComputedMarker.
  // This cast is unavoidable: the function returns a sentinel that mimics T
  // for the caller but is intercepted by createStore.
  return { [COMPUTED_BRAND]: true, deps, fn } as T;
}

// ---- Store registry --------------------------------------------------------

const storeRegistry = new Map<string, StoreApi>();

// ---- create ----------------------------------------------------------------

/**
 * Create a zustand-aligned store.
 *
 * The `creator` function receives `(set, get)` and executes **once** during
 * store creation. Swifty iterates the return value:
 * - **Functions** become actions (attached to state, unaffected by `setState`)
 * - **`computed(deps, fn)`** markers occupy derived slots — `fn()` runs once
 *   for the initial value and recomputes whenever any dep key changes via
 *   `setState`
 * - **All other fields** become initial state
 *
 * State is a plain object — no Proxy. All writes go through `setState` or
 * actions. Writing to a computed key via `setState` is silently ignored.
 *
 * @param name - Unique store name for the global registry
 * @param creator - Factory function `(set, get) => initialState`
 * @returns A `StoreApi` with `getState` / `setState` / `subscribe` / `destroy`
 */
export function createStore<T extends object>(
  name: string,
  creator: StateCreator<T>,
): StoreApi<T> {
  /** Listeners notified on every state change. */
  const listeners = new Set<Listener<T>>();
  /** Computed-property definitions keyed by state key. */
  const computedDefs = new Map<string, ComputedMarker>();
  /** Set of keys that are computed (writes ignored by setState). */
  const computedKeys = new Set<string>();
  /** Set of keys that are actions (writes ignored by setState). */
  const actionKeys = new Set<string>();

  let state: T;
  let destroyed = false;

  /** Read the current state snapshot. */
  const getState = (): T => state;

  /**
   * Shallow-merge `partial` into state and notify listeners.
   *
   * Accepts a partial object or an updater function `(prev) => partial`.
   * Computed keys and action keys are skipped. If no value actually changed
   * (determined via `Object.is`), the update is a no-op — listeners are NOT
   * notified. After merging, any computed property whose deps changed is
   * recomputed before listeners fire.
   */
  const setState = (partial: Partial<T> | ((prev: T) => Partial<T>)): void => {
    if (destroyed) return;
    const prevState = state;
    const resolved =
      typeof partial === "function" ? partial(prevState) : partial;

    const nextState = { ...prevState };
    let changed = false;

    for (const key in resolved) {
      if (
        Object.prototype.hasOwnProperty.call(resolved, key) &&
        !computedKeys.has(key) &&
        !actionKeys.has(key)
      ) {
        const newVal = Reflect.get(resolved, key);
        if (!Object.is(Reflect.get(prevState, key), newVal)) {
          Reflect.set(nextState, key, newVal);
          changed = true;
        }
      }
    }

    if (!changed) return;

    state = nextState as T;

    recomputeIfNeeded(prevState);

    for (const listener of listeners) {
      listener(state, prevState);
    }
  };

  /**
   * Recompute derived (computed) properties whose deps changed in the
   * latest `setState`.
   *
   * Runs after `state` is updated but before listeners are notified, so
   * listeners always see consistent state + derived values.
   */
  const recomputeIfNeeded = (prevState: T): void => {
    if (computedDefs.size === 0) return;

    const changedKeys = new Set<string>();
    for (const key of Object.keys(state)) {
      if (!Object.is(Reflect.get(state, key), Reflect.get(prevState, key))) {
        changedKeys.add(key);
      }
    }

    for (const [key, def] of computedDefs) {
      if (def.deps.some((dep) => changedKeys.has(dep))) {
        const newVal = def.fn();
        if (!Object.is(Reflect.get(state, key), newVal)) {
          Reflect.set(state, key, newVal);
        }
      }
    }
  };

  /**
   * Subscribe to state changes. The listener receives `(state, prevState)`.
   * Returns an unsubscribe function.
   */
  const subscribe = (listener: Listener<T>): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  /**
   * Tear down the store: clear listeners and remove from the global registry.
   * Further `setState` calls are no-ops.
   */
  const destroy = (): void => {
    destroyed = true;
    listeners.clear();
    storeRegistry.delete(name);
  };

  const api: StoreApi<T> = { getState, setState, subscribe, destroy };

  // Run creator to get initial body
  const body = creator(setState, getState);

  // Separate state, actions, and computed
  const initialState: Record<string, unknown> = {};
  const actions: Record<string, AnyFunc> = {};

  for (const key of Object.keys(body)) {
    const val = Reflect.get(body, key);
    if (isComputedMarker(val)) {
      computedDefs.set(key, val);
      computedKeys.add(key);
      initialState[key] = undefined;
    } else if (typeof val === "function") {
      // Use Reflect.set to avoid Function→AnyFunc assignment type error
      Reflect.set(actions, key, val);
      actionKeys.add(key);
    } else {
      initialState[key] = val;
    }
  }

  // Build initial state with actions attached
  state = { ...initialState, ...actions } as T;

  // Compute initial values for computed properties
  for (const [key, def] of computedDefs) {
    Reflect.set(state, key, def.fn());
  }

  // Register
  storeRegistry.set(name, api as StoreApi);

  return api;
}

// ---- bindStore (Swifty View adapter) -----------------------------------------

interface SwiftyView {
  updater: {
    set: (data: Record<string, unknown>) => unknown;
    digest: (data?: Record<string, unknown>) => void;
  };
  on: (event: string, handler: AnyFunc) => unknown;
}

function isSwiftyView(instance: unknown): instance is SwiftyView {
  if (!instance || typeof instance !== "object") return false;
  const updater = Reflect.get(instance, "updater");
  return (
    updater !== null &&
    typeof updater === "object" &&
    typeof Reflect.get(updater, "set") === "function" &&
    typeof Reflect.get(updater, "digest") === "function"
  );
}

/**
 * Bind a store to a Swifty View. Subscribes to state changes and auto-unsubscribes
 * when the view is destroyed.
 *
 * @param view - Swifty View instance (must have updater.set/digest and on("destroy"))
 * @param store - Store created via `create()`
 * @param selector - Optional function to pick a subset of state for the updater.
 *   If omitted, only non-function state keys are forwarded.
 * @returns unsubscribe function
 *
 * @example
 * ```ts
 * // Observe all state
 * bindStore(this, useCountStore);
 *
 * // Observe with selector
 * bindStore(this, useCountStore, (s) => ({ count: s.count }));
 * ```
 */
export function bindStore<T>(
  view: unknown,
  store: StoreApi<T>,
  selector?: (state: T) => Record<string, unknown>,
): () => void {
  if (!isSwiftyView(view)) return () => {};

  const extract = (s: T): Record<string, unknown> => {
    if (selector) return selector(s);
    const result: Record<string, unknown> = {};
    for (const key in s) {
      if (
        Object.prototype.hasOwnProperty.call(s, key) &&
        typeof s[key] !== "function"
      ) {
        result[key] = s[key];
      }
    }
    return result;
  };

  // Initial sync
  view.updater.set(extract(store.getState()));
  view.updater.digest();

  const off = store.subscribe((state) => {
    view.updater.set(extract(state));
    view.updater.digest();
  });

  view.on("destroy", off);

  return off;
}
