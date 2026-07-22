/**
 * Updater: per-view data binding with change detection and DOM diff
 * (functional factory).
 *
 * Replaces the former `Updater` class with a `createUpdater()` factory.
 * No `class`, no `this`, no `prototype`.
 *
 * Each View has an Updater instance that tracks data changes,
 * digests them, and triggers DOM re-rendering when needed.
 */
import { setData, hasOwnProperty, getById, EMPTY_STRING_SET } from "./utils";
import { SPLITTER, isRefToken } from "./common";
import {
  domGetNode,
  domSetChildNodes,
  applyDomOps,
  applyIdUpdates,
  createDomRef,
} from "./dom";
import { vdomSetChildNodes, createVDomRef } from "./vdom";
import type { UpdaterApi, VDomNode } from "./types";
import { Frame } from "./frame";

/** Callback queued via `digest()` to run after the digest cycle completes. */
type DigestCallback = () => void;

/**
 * Create an Updater for per-view data binding.
 *
 * Manages view-local data with change detection and DOM diff triggering.
 *
 * @param viewId - The view (frame) ID this updater belongs to
 * @returns An updater API object with `get`, `set`, `digest`, `forceDigest`, etc.
 */
export function createUpdater(viewId: string): UpdaterApi {
  /** Current data object */
  let data: Record<string, unknown> = { vId: viewId };

  /** Ref data for template rendering */
  const refData: Record<string, unknown> = {};
  refData[SPLITTER] = 1;

  /** Changed keys in current digest cycle */
  let changedKeys = new Set<string>();

  /** Whether data has changed since last digest */
  let hasChangedFlag = 0;

  /**
   * Digesting queue: supports re-digest during digest.
   * Holds pending callbacks; `null` is used as a sentinel marking the start
   * of an active digest cycle, so `runDigest` can detect re-entrant calls.
   */
  const digestingQueue: (DigestCallback | null)[] = [];

  /** Monotonically increasing version, bumped each time data actually changes. */
  let version = 0;

  /** Snapshot of `version` taken by `snapshot()`, used by `altered()`. */
  let snapshotVersion: number | undefined;

  /** Last rendered VDOM tree (only used when vdom is enabled) */
  let vdom: VDomNode | undefined;

  // Initial digest always triggers
  hasChangedFlag = 1;

  /**
   * Read a data value by key, or the entire data object if key is omitted.
   *
   * @param key - Data key (omit for the entire data object)
   * @returns The stored value (cast to `T` — caller is responsible for type safety)
   */
  function get<T = unknown>(key?: string): T {
    let result: unknown = data;
    if (key) {
      result = data[key];
    }
    // Cast is unavoidable here: the updater stores heterogeneous data and the
    // caller requests a specific type. This is the single source of truth for
    // updater.get<T> — the runtime value is untyped at storage time.
    return result as T;
  }

  /**
   * Shallow-merge `newData` into the data object, tracking changed keys.
   *
   * Only non-primitive, non-function values are compared for change —
   * primitives are always considered "changed" if the reference differs.
   * Bumps the internal `version` counter if any key changed.
   *
   * @param newData - Data to merge
   * @param excludes - Keys to skip change tracking for
   * @returns The updater API for chaining
   */
  function set(
    newData: Record<string, unknown>,
    excludes?: ReadonlySet<string>,
  ): UpdaterApi {
    const changed = setData(
      newData,
      data,
      changedKeys,
      excludes || EMPTY_STRING_SET,
    );
    if (changed) {
      version++;
      hasChangedFlag = 1;
    }
    return api;
  }

  /**
   * Trigger a digest: optionally merge data, then render if anything changed.
   *
   * Supports re-entry — calling `digest()` during an active digest queues the
   * callback and processes it after the current digest completes. `null` in
   * `digestingQueue` is a sentinel marking the boundary of an active cycle.
   *
   * @param newData - Optional data to merge before digesting
   * @param excludes - Keys to skip change tracking for
   * @param callback - Runs after the digest completes (even if no render)
   */
  function digest(
    newData?: Record<string, unknown>,
    excludes?: ReadonlySet<string>,
    callback?: () => void,
  ): void {
    if (newData) {
      set(newData, excludes);
    }

    if (callback) {
      digestingQueue.push(callback);
    }

    // If already digesting, queue for later
    if (digestingQueue.length > 0 && digestingQueue[0] === null) {
      return;
    }

    runDigest(digestingQueue);
  }

  /**
   * Core digest execution.
   */
  function runDigest(digesting: (DigestCallback | null)[]): void {
    // Mark digesting state
    const startIndex = digesting.length;
    digesting.push(null); // Sentinel for re-digest detection

    const keys = changedKeys;
    const changed = hasChangedFlag;
    // NOTE: Do NOT reset hasChangedFlag / changedKeys yet. If the render
    // conditions are not met (e.g. frame.view not yet wired during mountCtx),
    // we must preserve the dirty flag so the next digest() can actually
    // render. Resetting here would silently swallow the change.

    const frame = Frame.get(viewId);
    const view = frame?.view;
    const node = getById(viewId);

    if (changed && view && node && view.signature.value > 0 && frame) {
      // Conditions met — NOW reset the dirty flags so we don't re-render
      // the same data on the next digest().
      hasChangedFlag = 0;
      changedKeys = new Set();

      const template = view.getTemplate();
      if (typeof template === "function") {
        // Compiled templates import their own runtime helpers from
        // `@swifty.js/mvc/runtime`, so we only pass the 3 core args.
        // Return type is `string | VDomNode`; narrow via typeof.
        const result = template(data, viewId, refData);

        if (typeof result === "string") {
          // ── String rendering path ──
          const newDom = domGetNode(result, node);
          const ref = createDomRef();
          domSetChildNodes(node, newDom, ref, frame, keys);
          applyIdUpdates(ref.idUpdates);
          applyDomOps(ref.domOps);
          // Always endUpdate after a successful digest — child v-swifty elements
          // may need prop updates even when the parent DOM didn't visibly change
          // (e.g., refFn returns the same token for a mutated array reference)
          view.endUpdate(viewId);
        } else {
          // ── VDOM rendering path ──
          const newVDom = result;
          const ref = createVDomRef(viewId);
          const ready = (): void => {
            vdom = newVDom;
            if (ref.changed || !view.rendered.value) {
              view.endUpdate(viewId);
            }
            for (const [el, prop, val] of ref.nodeProps) {
              Reflect.set(el, prop, val);
            }
          };
          vdomSetChildNodes(node, vdom, newVDom, ref, frame, keys, view, ready);
        }
      }
    } else {
      // Conditions not met — preserve hasChangedFlag so the next digest()
      // can actually render (e.g. when frame.view is wired after setup).
      // Clear changedKeys so getChangedKeys() reflects the consumed state.
      changedKeys = new Set();
    }

    // Process re-digest queue
    if (digesting.length > startIndex + 1) {
      runDigest(digesting);
    } else {
      // Digest complete, execute pending callbacks
      const callbacks = digesting.slice();
      digesting.length = 0;
      for (const cb of callbacks) {
        if (cb) cb();
      }
    }
  }

  /**
   * Record the current `version` for later comparison via `altered()`.
   *
   * Call at the top of `assign()`, then `return ctx.updater.altered()` at the
   * bottom — the framework uses the result to decide whether to re-render.
   */
  function snapshot(): UpdaterApi {
    snapshotVersion = version;
    return api;
  }

  /**
   * Check whether `version` changed since the last `snapshot()`.
   *
   * @returns `true` if changed, `false` if not, `undefined` if `snapshot()` was never called
   */
  function altered(): boolean | undefined {
    if (snapshotVersion === undefined) return undefined;
    return version !== snapshotVersion;
  }

  /**
   * Resolve a SPLITTER-prefixed reference token to its original JS value.
   *
   * Used to restore object references that were tokenized by `refFn` during
   * template compilation (the `{{@expr}}` operator).
   */
  function translate(dataVal: unknown): unknown {
    if (typeof dataVal !== "string" || !isRefToken(dataVal)) return dataVal;
    return hasOwnProperty(refData, dataVal) ? refData[dataVal] : dataVal;
  }

  /**
   * Safe path parser — resolves dotted paths (`a.b.c`) or numeric literals
   * from `refData` without `eval`.
   *
   * Returns `undefined` for invalid paths. Only identifier-based dotted
   * paths are supported — no computed access, no function calls.
   */
  function parse(expr: string): unknown {
    const trimmed = expr.trim();
    if (!trimmed) return undefined;

    // Pure numeric literal — return as number.
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    // Dotted property path: identifier(.identifier)*
    if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(trimmed)) {
      return undefined;
    }

    let cur: unknown = refData;
    for (const segment of trimmed.split(".")) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = Reflect.get(cur, segment);
    }
    return cur;
  }

  /**
   * Get the set of keys changed since the last successful render.
   *
   * Returns a `ReadonlySet<string>` — callers should not mutate it.
   */
  function getChangedKeys(): ReadonlySet<string> {
    return changedKeys;
  }

  /**
   * Force a full re-render regardless of whether data changed.
   *
   * Marks every current data key as changed, then calls `digest()`. Used by
   * HMR to apply a new template against preserved data — since the data is
   * the same but the template changed, `digest()` alone wouldn't re-render.
   */
  function forceDigest(): void {
    hasChangedFlag = 1;
    changedKeys = new Set(Object.keys(data));
    digest();
  }

  const api: UpdaterApi = {
    get,
    set,
    digest,
    forceDigest,
    snapshot,
    altered,
    refData,
    translate,
    parse,
    getChangedKeys,
  };
  return api;
}
