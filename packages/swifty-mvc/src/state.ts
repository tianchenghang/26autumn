/**
 * Observable in-memory data object for cross-view data sharing.
 *
 * `State` is the recommended choice for **simple** cross-view data:
 * lightweight shared values (counters, toggles, page title, session info, etc.).
 * For **complex** reactive state — handlers, derived data, multi-instance
 * isolation, or store-internal reactions — prefer `createStore` from `./store`.
 *
 * ## Lifecycle
 *
 * Write: `State.set(data)` + `State.digest()`
 * Read: `State.get(key)` or `State.get()` (entire object)
 * Subscribe: `ctx.observeState("keys")` or `State.on("changed", fn)`
 * Cleanup: `State.clean("keys")(ctx)` — reference-counted, auto-reclaims keys
 *   when the last observer is destroyed
 *
 * `digest()` batches changes — multiple `set()` calls accumulate changed keys,
 * and a single `digest()` fires one `changed` event with all of them.
 */
import { RouterEvents } from "./common";
import { hasOwnProperty, setData, EMPTY_STRING_SET } from "./utils";
import { createEmitter } from "./event-emitter";
import type { AnyFunc, ChangeEvent, StateApi } from "./types";

/** Application state data */
const appData: Record<string, unknown> = {};

/** Key reference counts: how many views observe each key */
const keyRefCounts: Record<string, number> = {};

/** Changed keys in current digest cycle */
let changedKeys = new Set<string>();

/** Stashed changed keys from last digest */
let stashedChangedKeys: ReadonlySet<string> = EMPTY_STRING_SET;

/** Whether data has changed since last digest */
let dataIsChanged = false;

/** Event emitter for state events */
const emitter = createEmitter();

/**
 * Increment the reference count for each observed key.
 *
 * Called by `State.clean(keys)(ctx)` during view setup. When a key is first
 * observed (count goes 0→1), it is ready to be set. The reference count
 * prevents premature cleanup when multiple views observe the same key.
 */
function setupKeysRef(keys: string): string[] {
  const keyList = keys.split(",");
  for (const key of keyList) {
    if (hasOwnProperty(keyRefCounts, key)) {
      keyRefCounts[key]++;
    } else {
      keyRefCounts[key] = 1;
    }
  }
  return keyList;
}

/**
 * Decrement the reference count for each key, deleting data when it reaches 0.
 *
 * Called on view destroy (registered by `State.clean`). When the last observer
 * of a key is destroyed (count goes 1→0), the key's data is deleted from
 * `appData` to prevent memory leaks.
 */
function teardownKeysRef(keyList: string[]): void {
  for (const key of keyList) {
    if (hasOwnProperty(keyRefCounts, key)) {
      const count = --keyRefCounts[key];
      if (count <= 0) {
        Reflect.deleteProperty(keyRefCounts, key);
        Reflect.deleteProperty(appData, key);
      }
    }
  }
}

/**
 * DEBUG: deduplicate direct-mutation warnings.
 *
 * Previously this was delayed by 500ms so multiple writes to the same key
 * would coalesce — but users complained the warning didn't show up at the
 * point of the mutation. We now warn synchronously and dedupe by key, so
 * the first hit shows up immediately at the right place in the stack trace.
 * `clearNotify(key)` resets the dedup flag once the legitimate
 * `State.set` + `State.digest` actually runs.
 */

/**
 * Observable in-memory data object.
 * Provides get/set/digest/diff/clean methods for cross-view data sharing.
 */
export const State: StateApi = {
  /**
   * Get data from state.
   */
  get<T = unknown>(key?: string): T {
    const result = key ? appData[key] : appData;
    return result as T;
  },

  /**
   * Set data to state.
   */
  set(
    data: Record<string, unknown>,
    excludes?: ReadonlySet<string>,
  ): typeof State {
    dataIsChanged =
      setData(data, appData, changedKeys, excludes || EMPTY_STRING_SET) ||
      dataIsChanged;
    return State;
  },

  /**
   * Detect data changes and fire changed event if any.
   */
  digest(data?: Record<string, unknown>, excludes?: ReadonlySet<string>): void {
    if (data) {
      State.set(data, excludes);
    }
    if (dataIsChanged) {
      dataIsChanged = false;
      // Snapshot changed keys and stash for diff()
      const keys = changedKeys;
      stashedChangedKeys = keys;
      changedKeys = new Set();
      emitter.fire(RouterEvents.CHANGED, { keys });
    }
  },

  /**
   * Get the set of keys changed in the most recent digest.
   */
  diff(): ReadonlySet<string> {
    return stashedChangedKeys;
  },

  /**
   * Create a cleanup function for state keys on view destroy.
   * Call inside setup: `State.clean("keys")(ctx)` or `useEvent("destroy", State.clean("keys"))`
   */
  clean(
    keys: string,
  ): (ctx: { on: (event: string, handler: () => void) => void }) => void {
    return (ctx) => {
      const keyList = setupKeysRef(keys);
      ctx.on("destroy", () => {
        teardownKeysRef(keyList);
      });
    };
  },

  /**
   * Bind event listener.
   */
  on(event: string, handler: (e?: ChangeEvent) => void): typeof State {
    emitter.on(event, handler);
    return State;
  },

  /**
   * Unbind event listener.
   */
  off(event: string, handler?: AnyFunc): typeof State {
    emitter.off(event, handler);
    return State;
  },

  /**
   * Fire event.
   */
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
  ): typeof State {
    emitter.fire(event, data, remove);
    return State;
  },
};
