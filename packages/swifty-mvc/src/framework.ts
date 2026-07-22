/**
 * Framework: main entry point for booting the application.
 *
 * Features:
 * - boot() with config
 * - Router + State change notification to views
 * - Module loading (require/use)
 * - Utility methods: toUri, parseUri, assign, keys, nodeInside, ensureNodeId,
 *   generateId, mark/unmark, dispatchEvent, task, delay
 * - waitZoneViewsRendered
 * - Factory access: createEmitter, createCache, defineView
 * - Module access: Router, State, Frame
 */
import { CALL_BREAK_TIME, RouterEvents } from "./common";
import {
  assign,
  hasOwnProperty,
  funcWithTry,
  noop,
  parseUri,
  toUri,
  generateId,
  nodeInside,
  keys,
} from "./utils";
import { mark, unmark } from "./mark";
import { createCache } from "./cache";
import { createEmitter } from "./event-emitter";
import { Router, markRouterBooted } from "./router";
import { State } from "./state";
import { Frame } from "./frame";
import type { FrameObj } from "./types";
import { EventDelegator } from "./event-delegator";
import { defineView } from "./view";
import { hotSwapByTemplate, hotSwapByView } from "./hmr";
import { installFrameDevtoolBridge } from "./devtool";
import type {
  AnyFunc,
  FrameworkConfig,
  ViewCtx,
  ChangeEvent,
  FrameworkApi,
} from "./types";

// ============================================================
// Internal state
// ============================================================

// config and use are imported from module-loader.ts to avoid circular dependency with frame.ts
import { config, use } from "./module-loader";

/** Whether framework has booted */
let booted = false;

// ============================================================
// Task: modern chunked function execution
//
// Scheduling priority (best available):
// 1. scheduler.postTask('background') — Chrome 94+
// 2. requestIdleCallback — Chrome 47+, Firefox
// 3. setTimeout(0) — universal fallback
//
// Time-slicing strategy:
// - When requestIdleCallback is available, uses deadline.timeRemaining()
//   for adaptive chunk sizing (browser decides time budget per frame)
// - Falls back to fixed 48ms slices (CALL_BREAK_TIME) otherwise
// - Tasks are queued in a flat array [fn, ctx, args, ...] and
//   consumed in batches to minimize scheduling overhead
// ============================================================

/** Type guard: narrow unknown to AnyFunc */
function isAnyFunc(v: unknown): v is AnyFunc {
  return typeof v === "function";
}

/** Flat task queue: [fn, context, args, fn, context, args, ...] */
const taskList: unknown[] = [];
/** Current read position in taskList */
let taskIndex = 0;
/** Whether a chunk execution is already scheduled */
let taskScheduled = false;

/**
 * Execute a chunk of queued tasks, yielding when time budget runs out.
 * When called from requestIdleCallback, uses deadline for adaptive slicing.
 * When called from setTimeout/scheduler.postTask, uses fixed 48ms budget.
 */
function executeTaskChunk(deadline?: IdleDeadline): void {
  const hasDeadline = !!deadline;
  const startTime = Date.now();

  while (true) {
    const fn = taskList[taskIndex];
    if (!isAnyFunc(fn)) {
      // All tasks consumed (or invalid entry) — reset queue
      taskList.length = 0;
      taskIndex = 0;
      taskScheduled = false;
      return;
    }

    // Check time budget before executing next task
    if (hasDeadline && deadline) {
      // Adaptive: use browser-provided deadline
      if (deadline.timeRemaining() <= 0) {
        scheduleTaskChunk();
        return;
      }
    } else if (
      Date.now() - startTime > CALL_BREAK_TIME &&
      taskList.length > taskIndex + 3
    ) {
      // Fixed: 48ms budget, and there are more tasks remaining
      scheduleTaskChunk();
      return;
    }

    // Execute one task
    const context = taskList[taskIndex + 1];
    const rawArgs = taskList[taskIndex + 2];
    const args = Array.isArray(rawArgs) ? rawArgs : [];
    funcWithTry(fn, args, context, noop);
    taskIndex += 3;
  }
}

/**
 * Schedule the next chunk using the best available browser API.
 * Priority: scheduler.postTask > requestIdleCallback > setTimeout
 */
function scheduleTaskChunk(): void {
  const scheduler = globalThis.scheduler;
  if (scheduler && typeof scheduler.postTask === "function") {
    scheduler.postTask(() => executeTaskChunk(), { priority: "background" });
  } else if (typeof globalThis.requestIdleCallback === "function") {
    globalThis.requestIdleCallback(executeTaskChunk);
  } else {
    setTimeout(executeTaskChunk, 0);
  }
}

/**
 * Queue a function for deferred, chunked execution.
 *
 * @param fn - Function to execute (wrapped in try-catch automatically)
 * @param args - Arguments array to pass to the function
 * @param context - `this` context for the function call
 */
function task(fn: AnyFunc, args?: unknown[], context?: unknown): void {
  taskList.push(fn, context, args || []);
  if (!taskScheduled) {
    taskScheduled = true;
    scheduleTaskChunk();
  }
}

// ============================================================
// Dispatcher: notify views of changes
// ============================================================

/** Update tag */
let dispatcherUpdateTag = 0;

/** Narrow an unknown value to a then-able. */
function isThenable(value: unknown): value is PromiseLike<void> {
  return (
    !!value &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof Reflect.get(value, "then") === "function"
  );
}

// ============================================================
// Location / State observation change detection
// ============================================================

/**
 * Check if a view's observed location keys have changed.
 */
function viewIsObserveChanged(view: ViewCtx): boolean {
  const loc = view.locationObserved;
  let result = false;

  if (loc.flag) {
    if (loc.observePath) {
      const lastChanged = Router.diff();
      result = !!lastChanged?.path;
    }
    if (!result && loc.keys.length) {
      const lastChanged = Router.diff();
      const changedParams = lastChanged?.params;
      if (changedParams) {
        for (const key of loc.keys) {
          result = hasOwnProperty(changedParams, key);
          if (result) break;
        }
      }
    }
  }
  return result;
}

/**
 * Check if a view's observed state keys have changed.
 */
function stateIsObserveChanged(
  view: ViewCtx,
  stateKeys: ReadonlySet<string>,
): boolean {
  const observedKeys = view.getObservedStateKeys();
  if (!observedKeys) return false;
  for (const key of observedKeys) {
    if (stateKeys.has(key)) return true;
  }
  return false;
}

/**
 * Walk the Frame tree iteratively, rendering any view whose observed keys
 * have changed. Uses an explicit LIFO stack so deeply nested Frame trees
 * cannot blow the JS call stack (V8 does no tail-call optimization here).
 *
 * Async branch: if `render()` returns a thenable, the subtree under that
 * frame is processed after the promise resolves; sibling subtrees keep
 * draining the stack synchronously meanwhile.
 */
function dispatcherUpdate(
  frame: FrameObj,
  stateKeys?: ReadonlySet<string>,
): void {
  const stack: FrameObj[] = [frame];

  const drain = (s: FrameObj[]): void => {
    while (s.length > 0) {
      const current = s.pop();
      if (!current) continue;
      const view = current.view;

      if (
        !view ||
        current.dispatcherUpdateTag === dispatcherUpdateTag ||
        view.signature.value <= 1
      ) {
        continue;
      }
      current.dispatcherUpdateTag = dispatcherUpdateTag;

      const isChanged = stateKeys
        ? stateIsObserveChanged(view, stateKeys)
        : viewIsObserveChanged(view);

      let renderPromise: PromiseLike<void> | undefined;
      if (isChanged) {
        const renderResult = funcWithTry(
          view.renderMethod ?? view.render,
          [],
          view,
          noop,
        );
        if (isThenable(renderResult)) {
          renderPromise = renderResult;
        }
      }

      const children = current.children();
      if (renderPromise) {
        // Defer this subtree until render settles; keep draining siblings now.
        renderPromise.then(() => {
          const subStack: FrameObj[] = [];
          for (let i = children.length - 1; i >= 0; i--) {
            const child = Frame.get(children[i]);
            if (child) subStack.push(child);
          }
          drain(subStack);
        });
      } else {
        // Push children in reverse so pop() visits them in original order.
        for (let i = children.length - 1; i >= 0; i--) {
          const child = Frame.get(children[i]);
          if (child) s.push(child);
        }
      }
    }
  };

  drain(stack);
}

/**
 * Notify views when router or state changes.
 */
function dispatcherNotifyChange(e: ChangeEvent): void {
  // The dispatcher only runs after boot, so the root frame is guaranteed
  // to exist. If a caller somehow fires a change event before boot, we
  // silently no-op rather than auto-creating a root.
  const rootFrame = Frame.getRoot();
  if (!rootFrame) return;

  // RouteChangedEvent extends ChangeEvent with LocationDiff fields
  // (path, view, params, etc.). Use "view" in e to narrow.
  if ("view" in e && e.view !== undefined) {
    const view = e.view;
    // View changed, mount new view
    const viewPath =
      typeof view === "object" && view !== null
        ? String(Reflect.get(view, "to") || "")
        : String(view);
    rootFrame.mountView(viewPath);
  } else {
    // Parameter/state change, notify views
    dispatcherUpdateTag++;
    dispatcherUpdate(rootFrame, e.keys);
  }
}

// ============================================================
// DispatchEvent: fire a custom DOM event on an element
// ============================================================

/**
 * Fire a custom DOM event on a target element.
 */
function dispatchEvent(
  target: EventTarget,
  eventType: string,
  eventInit?: CustomEventInit,
): void {
  const event = new CustomEvent(eventType, {
    bubbles: true,
    cancelable: true,
    ...eventInit,
  });
  target.dispatchEvent(event);
}

// use is imported from module-loader.ts (see top of file)

// ============================================================
// waitZoneViewsRendered
// ============================================================

/** Wait result: OK = rendered, TIMEOUT_OR_NOT_FOUND = not rendered */
export const WAIT_OK = 1;
export const WAIT_TIMEOUT_OR_NOT_FOUND = 0;

/**
 * Wait for all views in a zone to be rendered.
 */
function waitZoneViewsRendered(
  viewId: string,
  timeout?: number,
): Promise<number> {
  if (timeout == null) {
    timeout = 30 * 1000;
  }
  const checkFrame = Frame.get(viewId);
  const endTime = Date.now() + timeout;
  return new Promise((resolve) => {
    const check = (): void => {
      const currentTime = Date.now();
      if (currentTime > endTime || !checkFrame) {
        resolve(WAIT_TIMEOUT_OR_NOT_FOUND);
      } else if (checkFrame.childrenCount === checkFrame.readyCount) {
        resolve(WAIT_OK);
      } else {
        setTimeout(check, 9);
      }
    };
    setTimeout(check, 9);
  });
}

// ============================================================
// Framework object
// ============================================================

/**
 * Public `Framework.getConfig` overload set (see `FrameworkApi.getConfig`).
 * Declared as a free function with explicit overloads so it can satisfy the
 * interface's two-overload shape from inside an object literal.
 */
function getConfigImpl(): FrameworkConfig;
function getConfigImpl<T = unknown>(key: string): T | undefined;
function getConfigImpl<T = unknown>(
  key?: string,
): FrameworkConfig | T | undefined {
  if (key === undefined) return config;
  // Generic retrieval from config — cast is unavoidable
  return Reflect.get(config, key) as T | undefined;
}

/**
 * Main framework object.
 * Provides boot, config, and all global utility methods.
 */
export const Framework: FrameworkApi = {
  // ============================================================
  // Lifecycle
  // ============================================================

  /** Read framework configuration. See `FrameworkApi.getConfig`. */
  getConfig: getConfigImpl,

  /**
   * Merge a patch into framework configuration. See `FrameworkApi.setConfig`.
   */
  setConfig<T extends object = Partial<FrameworkConfig>>(
    patch: Partial<FrameworkConfig> & T,
  ): FrameworkConfig & T {
    if (patch && typeof patch === "object") {
      assign(config, patch);
    }
    // Generic merge — cast is unavoidable since T is caller-specified
    return config as FrameworkConfig & T;
  },

  /**
   * Boot the framework.
   */
  boot(cfg?: FrameworkConfig): void {
    // Register HMR swap functions on globalThis so that auto-injected HMR
    // snippets (in compiled .html/.ts modules) can call them WITHOUT
    // importing @swifty.js/mvc (which would create MF shared-consumer side
    // effects and trigger ChunkLoadError). Done in boot() rather than at
    // hmr.ts module load to guarantee execution — webpack tree-shaking can
    // drop hmr.ts's top-level side-effect when its exports are unused by the
    // app (e.g. boot.ts only imports Framework + registerViewClass).
    if (typeof globalThis !== "undefined" && !globalThis.__swifty_hmr__) {
      globalThis["__swifty_hmr__"] = { hotSwapByTemplate, hotSwapByView };
    }
    // Merge configuration
    if (cfg && typeof cfg === "object") {
      assign(config, cfg);
    }

    // Set config in Router
    Router._setConfig(config);

    // Set frame getter in EventDelegator
    EventDelegator.setFrameGetter((id: string) => Frame.get(id));

    // Bind router events
    Router.on(RouterEvents.CHANGED, (data?: ChangeEvent) => {
      if (data) dispatcherNotifyChange(data);
    });

    // Bind state events
    State.on(RouterEvents.CHANGED, (data?: ChangeEvent) => {
      if (data) dispatcherNotifyChange(data);
    });

    // Mark as booted
    booted = true;
    markRouterBooted();

    // Install the Frame Devtool Bridge for devtools support.
    // This adds a lightweight postMessage listener so that the
    // swifty-devtool panel can inspect the frame tree.
    // Skipped if devtool is explicitly set to false.
    if (config.devtool) {
      installFrameDevtoolBridge();
    }

    // Create root frame BEFORE Router._bind(), so that when Router.diff()
    // fires CHANGED → dispatcherNotifyChange → Frame.getRoot(), the rootFrame
    // already exists with the correct rootId (e.g. "app").
    // Without this, Frame.createRoot() would default to "root" and the view
    // would render into document.body instead of the intended container.
    const rootFrame = Frame.createRoot(config.rootId);

    // Bind hashchange event
    Router._bind();

    // Mount root view: only if the router didn't already initiate a mount.
    //
    // CRITICAL: check `viewPath` (set synchronously at the top of mountView)
    // instead of `view` (the viewInstance, which is only assigned inside
    // doMountView — AFTER the async view setup load completes).
    //
    // When views are loaded asynchronously (via config.require / dynamic
    // import), Router._bind() → diff() → CHANGED → mountView(routeView)
    // starts an async load. At this point viewPath is already set to the
    // route view, but viewInstance is still undefined. Checking viewInstance
    // here would incorrectly fall back to defaultView, launching a SECOND
    // async mountView(defaultView) in parallel. The signature guard in
    // mountView then makes whichever import resolves first win — and since
    // defaultView is usually a single module while the route view may pull
    // in sub-components, defaultView tends to win, leaving the URL pointing
    // at the route view while defaultView is actually rendered. Subsequent
    // Router.to(routeView) is then a no-op because lastLocation.path already
    // equals routeView, so the user is stuck on the wrong view.
    //
    // viewPath is set synchronously in mountView (before the sync/async
    // branch), so it reliably indicates "a mount has been initiated for
    // this frame" — which is exactly the condition we want to guard on.
    const defaultView = config.defaultView || "";
    if (defaultView && !rootFrame.getViewPath()) {
      rootFrame.mountView(defaultView);
    }
  },

  /** Whether framework has booted */
  isBooted(): boolean {
    return booted;
  },

  // ============================================================
  // Utility proxies
  // ============================================================

  /** Mark async callback validity tracker */
  mark,

  /** Unmark (invalidate) async callbacks */
  unmark,

  /** Fire a custom DOM event on a target */
  dispatchEvent,

  /** Execute function in try-catch, ignoring errors */
  task,

  /** Promise-based setTimeout */
  delay(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, time));
  },

  /** Load modules via configured require */
  use,

  /** Wait for zone views to be rendered */
  waitZoneViewsRendered,

  /**
   * Convert path + params to URL string.
   */
  toUri,

  /**
   * Parse URI string into path and params.
   */
  parseUri,

  WAIT_OK,
  WAIT_TIMEOUT_OR_NOT_FOUND,

  /**
   * Mix properties from source to target.
   */
  assign,

  /**
   * Get object keys.
   */
  keys,

  /**
   * Check if node A is inside node B.
   */
  nodeInside,

  /**
   * Generate globally unique ID.
   */
  generateId,

  /**
   * Cache factory (functional).
   */
  createCache,

  /**
   * Ensure element has an ID.
   */
  ensureNodeId(element: HTMLElement): string {
    if (!element.id) {
      element.id = generateId("l_");
    }
    return element.id;
  },

  /**
   * Base class with EventEmitter.
   */
  createEmitter,

  // ============================================================
  // Module access
  // ============================================================

  /** Router module */
  Router,

  /** State module */
  State,

  /** View factory (functional) */
  defineView,

  /** Frame class */
  Frame,
};
