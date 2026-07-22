/**
 * Frame tree for view lifecycle management (functional factory).
 *
 * Replaces the former `Frame` class with `createFrame()` + `Frame` singleton.
 * No `class`, no `this`, no `prototype`. Each frame is a plain object (FrameObj)
 * with closure-based methods. The `Frame` singleton provides static-like
 * registry methods (get, getAll, getRoot, createRoot, on, off, fire).
 */
import {
  SPLITTER,
  SWIFTY_VIEW,
  SWIFTY_PROP_PREFIX,
  SWIFTY_EVENT_PREFIX,
  isRefToken,
} from "./common";
import {
  hasOwnProperty,
  parseUri,
  getAttribute,
  funcWithTry,
  noop,
  assign,
  translateData,
  ensureElementId,
  isRecord,
} from "./utils";
import { createEmitter } from "./event-emitter";
import { unmark } from "./mark";
import { mountCtx, unmountCtx, runInvokes } from "./view";
import type { ViewSetup } from "./types";
import { use, config as frameworkConfig } from "./module-loader";
import { getViewClass, registerViewClass } from "./view-registry";
import type { AnyFunc, FrameObj, FrameInvokeEntry } from "./types";

// ============================================================
// Internal state
// ============================================================

/** All frames registry */
const frameRegistry = new Map<string, FrameObj>();

/** Root frame instance */
let rootFrame: FrameObj | undefined;

/** Global alter data */
let globalAlter: { id: string } | undefined;

/** Static event emitter for Frame-level events (add/remove) */
const staticEmitter = createEmitter();

/** Type guard: verify a dynamically loaded module is a ViewSetup function */
function isViewSetup(fn: unknown): fn is ViewSetup {
  return typeof fn === "function";
}

// ============================================================
// createFrame — factory function
// ============================================================

/**
 * Create a frame object. Called internally by mountFrame / createRoot.
 * Not intended for direct user use — use `Frame.createRoot()` or
 * `frame.mountFrame()` instead.
 *
 * @internal
 */
export function createFrame(id: string, parentId?: string): FrameObj {
  const emitter = createEmitter();
  const invokeList: FrameInvokeEntry[] = [];
  const childrenMap: Record<string, string> = {};
  const readyMap = new Set<string>();
  let viewPath: string | undefined;
  function getViewPath(): string | undefined {
    return viewPath;
  }

  const frame: FrameObj = {
    id,
    getViewPath,
    parentId,
    view: undefined,
    invokeList,
    signature: 1,
    destroyed: 0,
    hasAltered: 0,
    originalTemplate: undefined,
    holdFireCreated: 0,
    childrenCreated: 0,
    childrenAlter: 0,
    childrenMap,
    childrenCount: 0,
    readyCount: 0,
    readyMap,
    emitter,

    mountView(
      viewPathArg: string,
      viewInitParams?: Record<string, unknown>,
    ): void {
      const node = document.getElementById(frame.id);
      const pId = frame.parentId;

      // Store original template before alter
      if (!frame.hasAltered && node) {
        frame.hasAltered = 1;
        frame.originalTemplate = node.innerHTML;
      }

      // Unmount current view
      frame.unmountView();
      frame.destroyed = 0;

      // Parse view path and params
      const parsed = parseUri(viewPathArg || "");
      const viewClassName = parsed.path;
      if (!node || !viewClassName) return;

      viewPath = viewPathArg;

      // Translate query params from parent view's refData
      const params = parsed.params;
      translateQuery(pId ?? frame.id, viewPathArg, params);

      // Merge init params
      const initParams: Record<string, unknown> = { ...params };
      if (viewInitParams) {
        assign(initParams, viewInitParams);
      }

      const sign = frame.signature;

      // Use the require function from Framework config to load the View setup
      const registered = getViewClass(viewClassName);
      if (registered) {
        // Synchronous path: View setup already loaded
        doMountView(registered, initParams, node, sign);
        return;
      }

      // Asynchronous path: load View setup from remote module
      use(viewClassName, (loadedModule: unknown) => {
        // Guard: Frame may have been unmounted or re-mounted during async load
        if (sign !== frame.signature) return;

        if (isViewSetup(loadedModule)) {
          registerViewClass(viewClassName, loadedModule);
          doMountView(loadedModule, initParams, node, sign);
        } else {
          const error = new Error(`Cannot load view: ${viewClassName}`);
          const errorHandler = frameworkConfig.error;
          if (errorHandler) {
            errorHandler(error);
          }
        }
      });
    },

    unmountView(): void {
      const currentView = frame.view;

      // Clear invoke list
      frame.invokeList.length = 0;

      if (!currentView) return;

      // Set global alter if not set
      if (!globalAlter) {
        globalAlter = { id: frame.id };
      }

      // Mark as destroying
      frame.destroyed = 1;

      // Unmount zone (child frames)
      frame.unmountZone();

      // Notify alter
      notifyAlter(frame, globalAlter);

      // Unmount the view (run cleanups, unregister events, destroy resources)
      unmountCtx(currentView);

      // Clear view reference
      frame.view = undefined;

      // Restore original template
      const node = document.getElementById(frame.id);
      if (node && frame.originalTemplate) {
        node.innerHTML = frame.originalTemplate;
      }

      // Reset global alter
      globalAlter = undefined;

      // Increment signature to cancel async operations
      unmark(currentView);
    },

    mountFrame(
      frameId: string,
      viewPathArg: string,
      viewInitParams?: Record<string, unknown>,
    ): FrameObj {
      // Notify alter
      notifyAlter(frame, { id: frameId });

      let childFrame = frameRegistry.get(frameId);

      if (!childFrame) {
        // Add to children map
        if (!frame.childrenMap[frameId]) {
          frame.childrenCount++;
        }
        frame.childrenMap[frameId] = frameId;

        // Always create a new frame object. The frameCache pool is skipped
        // because reInitFrame cannot reassign the readonly `id` field —
        // reusing a cached frame would leave it with a stale id, causing
        // registry lookups and unmountFrame to fail.
        childFrame = createFrame(frameId, frame.id);
      }

      // Mount view
      childFrame.mountView(viewPathArg, viewInitParams);

      return childFrame;
    },

    unmountFrame(id?: string): void {
      const targetId = id ? frame.childrenMap[id] : frame.id;
      const targetFrame = frameRegistry.get(targetId);
      if (!targetFrame) return;

      const wasCreated = targetFrame.readyCount > 0;
      const pId = targetFrame.parentId;

      // Unmount view
      targetFrame.unmountView();

      // Remove from registry (fires the static "remove" event)
      removeFrame(targetId, wasCreated);

      // Remove from parent's children
      const parent = frameRegistry.get(pId ?? "");
      if (parent && parent.childrenMap[targetId]) {
        Reflect.deleteProperty(parent.childrenMap, targetId);
        parent.childrenCount--;
        notifyCreated(parent);
      }
    },

    mountZone(zoneId?: string): void {
      const targetZone = zoneId ?? frame.id;

      // Hold fire created event
      frame.holdFireCreated = 1;

      // Find all v-swifty elements in zone
      const rootEl = document.getElementById(targetZone);
      if (!rootEl) return;

      // v-swifty is a valid HTML attribute name — no CSS escaping needed
      const selector = `[${SWIFTY_VIEW}]`;
      const viewElements = rootEl.querySelectorAll(selector);
      const mountList: Array<{
        frameId: string;
        viewPathArg: string;
        props: Record<string, unknown>;
        events: Record<string, string>;
      }> = [];

      // Helper: read p-swifty-* from a v-swifty element, resolving ref tokens
      const readProps = (el: Element): Record<string, unknown> => {
        const props: Record<string, unknown> = {};
        const parentRefData = frame.view?.updater.refData;
        for (const attr of el.attributes) {
          if (attr.name.startsWith(SWIFTY_PROP_PREFIX)) {
            const propName = attr.name.slice(SWIFTY_PROP_PREFIX.length);
            const val = attr.value;
            if (parentRefData && isRefToken(val)) {
              props[propName] = hasOwnProperty(parentRefData, val)
                ? parentRefData[val]
                : val;
            } else {
              props[propName] = val;
            }
          }
        }
        return props;
      };

      viewElements.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        const elId = el.id || ensureElementId(el, "frame_");

        // Already-bound v-swifty element: update props on the existing child view
        if (htmlElIsBound(el)) {
          const childFrame = Frame.get(elId);
          const childView = childFrame?.view;
          if (childView && childView.signature.value > 0) {
            const props = readProps(el);
            if (Object.keys(props).length > 0) {
              childView.updater.set(props).digest();
            }
          }
          return;
        }

        // New v-swifty element: mount with props and events
        Reflect.set(el, "frameBound", 1);
        const viewPathArg = getAttribute(el, SWIFTY_VIEW);
        if (!viewPathArg) return;

        const props = readProps(el);

        // Read e-swifty-* attributes → child-to-parent event bindings
        // HTML lowercases attribute names; emitter matches case-insensitively
        const events: Record<string, string> = {};
        for (const attr of el.attributes) {
          if (attr.name.startsWith(SWIFTY_EVENT_PREFIX)) {
            const eventName = attr.name.slice(SWIFTY_EVENT_PREFIX.length);
            events[eventName] = attr.value;
          }
        }

        mountList.push({ frameId: elId, viewPathArg, props, events });
      });

      // Mount each frame with props
      for (const { frameId, viewPathArg, props, events } of mountList) {
        const childFrame = frame.mountFrame(frameId, viewPathArg, props);

        // Wire child-to-parent event bindings:
        // e-swifty-increment="increment" → childFrame.on("increment", parentHandler)
        // The parent handler is found by matching the name prefix in the parent's events map
        const parentEvents = frame.view?.getEvents();
        if (parentEvents) {
          for (const eventName in events) {
            const handlerName = events[eventName];
            // Find parent handler: key starts with `${handlerName}<`
            const prefix = handlerName + "<";
            let handler: AnyFunc | undefined;
            for (const key in parentEvents) {
              if (key.startsWith(prefix)) {
                handler = parentEvents[key];
                break;
              }
            }
            if (handler && childFrame) {
              childFrame.on(eventName, (data?: Record<string, unknown>) => {
                funcWithTry(handler!, data ? [data] : [], frame.view, noop);
              });
            }
          }
        }
      }

      // Release hold
      frame.holdFireCreated = 0;

      // Notify created
      notifyCreated(frame);
    },

    unmountZone(zoneId?: string): void {
      for (const childId in frame.childrenMap) {
        if (hasOwnProperty(frame.childrenMap, childId)) {
          if (!zoneId || childId !== zoneId) {
            frame.unmountFrame(childId);
          }
        }
      }
      notifyCreated(frame);
    },

    parent(level = 1): FrameObj | undefined {
      let result: FrameObj | undefined = undefined;
      let currentPid: string | undefined = frame.parentId;
      let n = level >>> 0 || 1;
      while (currentPid && n--) {
        result = frameRegistry.get(currentPid);
        currentPid = result?.parentId;
      }
      return result;
    },

    invoke(name: string, args?: unknown[]): unknown {
      let result: unknown;
      const currentView = frame.view;

      if (currentView && currentView.rendered.value) {
        // View is rendered, invoke directly
        const fn = Reflect.get(currentView, name);
        if (typeof fn === "function") {
          result = funcWithTry(fn, args ?? [], currentView, noop);
        }
      } else {
        // View not rendered, add to invoke list
        const key = SPLITTER + name;
        let existingEntry: FrameInvokeEntry | undefined;

        for (const entry of frame.invokeList) {
          if (entry.key === key) {
            existingEntry = entry;
            break;
          }
        }

        if (existingEntry) {
          existingEntry.removed = args === existingEntry.args;
        }

        const newEntry: FrameInvokeEntry = {
          name,
          args: args ?? [],
          key,
        };
        frame.invokeList.push(newEntry);
      }

      return result;
    },

    children(): string[] {
      const result: string[] = [];
      for (const id in frame.childrenMap) {
        if (hasOwnProperty(frame.childrenMap, id)) {
          result.push(id);
        }
      }
      return result;
    },

    on(event: string, handler: AnyFunc): FrameObj {
      emitter.on(event, handler);
      return frame;
    },

    off(event: string, handler?: AnyFunc): FrameObj {
      emitter.off(event, handler);
      return frame;
    },

    fire(event: string, data?: Record<string, unknown>): FrameObj {
      emitter.fire(event, data);
      return frame;
    },
  };

  // Register frame
  frameRegistry.set(id, frame);

  // Attach frame to DOM element
  const element = document.getElementById(id);
  if (element) {
    Reflect.set(element, "frame", frame);
    Reflect.set(element, "frameBound", 1);
  }

  // Fire add event
  staticEmitter.fire("add", { frame });

  return frame;
}

// ============================================================
// doMountView — internal: mount after setup is loaded
// ============================================================

function doMountView(
  setup: ViewSetup,
  params: Record<string, unknown>,
  node: HTMLElement,
  sign: number,
): void {
  // This function is called in the context of a specific frame.
  // But since we're functional, we need the frame reference.
  // The frame is found via the node's id.
  const frameId = node.id;
  const frame = frameRegistry.get(frameId);
  if (!frame) return;
  if (sign !== frame.signature) return; // Frame may have been unmounted

  // Create ctx and run setup
  const ctx = mountCtx(frame, setup, params);
  frame.view = ctx;

  // Fire created event for child frames
  runInvokes(frame);
}

// ============================================================
// Frame singleton — static-like methods
// ============================================================

export interface FrameApi {
  get(id: string): FrameObj | undefined;
  getAll(): Map<string, FrameObj>;
  getRoot(): FrameObj | undefined;
  createRoot(rootId?: string): FrameObj;
  on(event: string, handler: AnyFunc): FrameApi;
  off(event: string, handler?: AnyFunc): FrameApi;
  fire(event: string, data?: Record<string, unknown>): void;
}

export const Frame: FrameApi = {
  /** Get frame by ID */
  get(id: string): FrameObj | undefined {
    return frameRegistry.get(id);
  },

  /** Get all frames */
  getAll(): Map<string, FrameObj> {
    return frameRegistry;
  },

  /**
   * Returns the existing root frame, or undefined if none has been created.
   */
  getRoot(): FrameObj | undefined {
    return rootFrame;
  },

  /**
   * Create (or return) the singleton root frame.
   * Idempotent: subsequent calls always return the original root.
   */
  createRoot(rootId?: string): FrameObj {
    if (!rootFrame) {
      const id = rootId ?? "root";

      let rootElement = document.getElementById(id);
      if (!rootElement) {
        rootElement = document.body;
        rootElement.id = id;
      }

      rootFrame = createFrame(id);
    }
    return rootFrame;
  },

  /** Bind event listener (static) */
  on(event: string, handler: AnyFunc): typeof Frame {
    staticEmitter.on(event, handler);
    return Frame;
  },

  /** Unbind event listener (static) */
  off(event: string, handler?: AnyFunc): typeof Frame {
    staticEmitter.off(event, handler);
    return Frame;
  },

  /** Fire event (static) */
  fire(event: string, data?: Record<string, unknown>): void {
    staticEmitter.fire(event, data);
  },
};

// ============================================================
// Internal helper functions
// ============================================================

/**
 * Check whether a DOM element already has a Frame attached.
 *
 * Prevents `mountZone` from re-initializing an element that's already
 * bound to a child Frame.
 */
function htmlElIsBound(element: HTMLElement): boolean {
  return !!Reflect.get(element, "frameBound");
}

/**
 * Remove a frame from the registry, fire the static `remove` event, and
 * clear the DOM element's frame reference.
 */
function removeFrame(id: string, wasCreated: boolean): void {
  const frameInstance = frameRegistry.get(id);
  if (!frameInstance) return;

  frameRegistry.delete(id);

  // Fire remove event
  staticEmitter.fire("remove", { frame: frameInstance, fcc: wasCreated });

  // Clear DOM reference
  const element = document.getElementById(id);
  if (element) {
    Reflect.set(element, "frameBound", 0);
    Reflect.deleteProperty(element, "frame");
  }
}

/**
 * Propagate a `created` event up the Frame tree.
 *
 * A frame fires `created` when all its child frames have finished mounting
 * (`childrenCount === readyCount`). The event bubbles to the parent, which
 * increments its own `readyCount` and may itself fire `created`.
 */
function notifyCreated(frameInstance: FrameObj): void {
  if (
    !frameInstance.childrenCreated &&
    !frameInstance.holdFireCreated &&
    frameInstance.childrenCount === frameInstance.readyCount
  ) {
    frameInstance.childrenCreated = 1;
    frameInstance.childrenAlter = 0;
    frameInstance.emitter.fire("created");

    const pId = frameInstance.parentId;
    if (pId) {
      const parent = frameRegistry.get(pId);
      if (parent && !parent.readyMap.has(frameInstance.id)) {
        parent.readyMap.add(frameInstance.id);
        parent.readyCount++;
        notifyCreated(parent);
      }
    }
  }
}

/**
 * Propagate an `alter` event up the Frame tree.
 *
 * Fires when a child frame's content changes (e.g. before unmounting),
 * transitioning the parent from `created` to `alter` state. Decrements
 * the parent's `readyCount` and may bubble further up.
 */
function notifyAlter(frameInstance: FrameObj, data: { id: string }): void {
  if (!frameInstance.childrenAlter && frameInstance.childrenCreated) {
    frameInstance.childrenCreated = 0;
    frameInstance.childrenAlter = 1;
    frameInstance.emitter.fire("alter", data);

    const pId = frameInstance.parentId;
    if (pId) {
      const parent = frameRegistry.get(pId);
      if (parent && parent.readyMap.has(frameInstance.id)) {
        parent.readyCount--;
        parent.readyMap.delete(frameInstance.id);
        notifyAlter(parent, data);
      }
    }
  }
}

// ============================================================
// TranslateQuery: translate SPLITTER-prefixed params from parent
// ============================================================

/**
 * Translate SPLITTER-prefixed reference tokens in child-view params back to
 * their original JS values from the parent view's `refData`.
 *
 * When a template uses `{{@value}}` inside a `v-swifty` attribute, the compiler
 * emits a SPLITTER-prefixed token instead of the raw value. This function
 * resolves those tokens so the child view receives the actual objects.
 */
function translateQuery(
  pId: string,
  src: string,
  params: Record<string, string>,
): void {
  const parentFrame = frameRegistry.get(pId);
  const parentView = parentFrame?.view;
  if (!parentView) return;

  const parentRefData = parentView.updater.refData;
  if (!parentRefData) return;

  // If viewPath contains SPLITTER, translate params
  if (src.indexOf(SPLITTER) > 0) {
    translateData(parentRefData, params);
    const splitterValue = Reflect.get(params, SPLITTER);
    if (isRecord(splitterValue)) {
      // Merge translated params from the SPLITTER key into the params object
      for (const k in splitterValue) {
        if (hasOwnProperty(splitterValue, k)) {
          const v = splitterValue[k];
          if (typeof v === "string") {
            params[k] = v;
          }
        }
      }
      Reflect.deleteProperty(params, SPLITTER);
    }
  }
}

// ============================================================
// View setup registration (re-exported)
// ============================================================

export {
  registerViewClass,
  invalidateViewClass,
  getViewClassRegistry,
} from "./view-registry";
