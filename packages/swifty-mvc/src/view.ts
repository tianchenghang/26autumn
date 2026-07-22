/**
 * View system — functional API for defining and managing views.
 *
 * A view is defined by a setup function that receives a `ViewCtx` and
 * returns `{ template, events, assign? }`. The ctx provides all framework
 * APIs (updater, events, capture/release, observe, etc.) via closures — no
 * `this` binding, no `class`, no `prototype`, no `mixin`.
 *
 * ## Lifecycle
 *
 * 1. **Setup** — `mountCtx(frame, setup, params)` creates a `ViewCtx`, sets it
 *    as the current hooks context, runs `setup(ctx, params)`, then wires the
 *    returned `template` / `events` / `assign` onto the ctx.
 * 2. **Render** — `ctx.render()` increments `signature`, fires `render`,
 *    destroys transient resources, and calls `updater.digest()`.
 * 3. **Destroy** — `unmountCtx(ctx)` runs `useEffect` cleanups, unregisters
 *    events, destroys all resources, fires `destroy`, and sets `signature = 0`.
 *
 * ## Async safety
 *
 * `ctx.wrapAsync(fn)` captures `signature` at wrap time; the wrapped function
 * only executes if `signature` still matches — stale callbacks after a view
 * re-render or destroy are silently dropped.
 */
import { VIEW_EVENT_METHOD_REGEXP } from "./common";
import { hasOwnProperty, funcWithTry, noop } from "./utils";
import { createEmitter } from "./event-emitter";
import { EventDelegator } from "./event-delegator";
import { createUpdater } from "./updater";
import { setCurrentCtx } from "./hooks";
import type {
  AnyFunc,
  ViewCtx,
  ViewSetup,
  FrameObj,
  ViewLocationObserved,
  ViewResourceEntry,
  ViewTemplate,
  VDomTemplate,
} from "./types";

// ============================================================
// Global event targets — maps 'window'/'document' to the DOM objects
// ============================================================

/** Maps global selector names (`window`, `document`) to their DOM objects. */
const VIEW_GLOBALS: Record<string, EventTarget> = {};
if (typeof window !== "undefined") {
  VIEW_GLOBALS["window"] = window;
}
if (typeof document !== "undefined") {
  VIEW_GLOBALS["document"] = document;
}

// ============================================================
// defineView — the public API for defining views
// ============================================================

/**
 * Define a view via a setup function (hooks style).
 *
 * The setup function runs once on mount, receives a `ViewCtx`, and returns
 * `{ template, events, assign? }`. Hooks (`useState`, `useEffect`, etc.)
 * can be called inside setup to manage state and side effects.
 *
 * @example
 * const HomeView = defineView((ctx, params) => {
 *   const [getCount, setCount] = useState('count', 0);
 *   return {
 *     template,
 *     events: { "incr<click>": (e) => setCount(getCount() + 1) },
 *   };
 * });
 */
export function defineView(setup: ViewSetup): ViewSetup {
  return setup;
}

// ============================================================
// createCtx — creates a ViewCtx with all framework APIs
// ============================================================

/**
 * Create a ViewCtx for a frame. Called by the Frame system when mounting a view.
 *
 * The ctx provides all framework APIs via closures — no `this` binding.
 */
export function createCtx(frame: FrameObj): ViewCtx {
  const id = frame.id;
  const updater = createUpdater(id);
  const emitter = createEmitter();
  const signature = { value: 0 };
  const rendered = { value: false };
  const resources: Record<string, ViewResourceEntry> = {};
  const locationObserved: ViewLocationObserved = {
    flag: 0,
    keys: [],
    observePath: false,
  };
  const mutable = {
    observedStateKeys: undefined as string[] | undefined,
    endUpdatePending: undefined as number | undefined,
    template: undefined as ViewTemplate | VDomTemplate | undefined,
    events: undefined as Record<string, AnyFunc> | undefined,
    assignFn: undefined as
      | ((options?: unknown) => boolean | undefined)
      | undefined,
  };

  const cleanups: Array<() => void> = [];

  // ── Event emitter passthrough ──
  function on(event: string, handler: AnyFunc): () => void {
    emitter.on(event, handler);
    return () => emitter.off(event, handler);
  }

  function off(event: string, handler?: AnyFunc): void {
    emitter.off(event, handler);
  }

  function fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): void {
    emitter.fire(event, data, remove, lastToFirst);
  }

  // ── Resource management ──

  /**
   * Register a destroyable resource tied to the view lifecycle.
   *
   * If `resource` is provided, stores it under `key` (replacing any existing
   * entry — the old resource's `destroy()` is called first). If `resource` is
   * omitted, returns the previously stored entity for `key`.
   *
   * @param key - Unique resource key
   * @param resource - Object with a `destroy()` method (omit to read)
   * @param destroyOnRender - If true, destroyed on the next `render()` call
   * @returns The stored entity (when reading) or the resource (when writing)
   */
  function capture(
    key: string,
    resource?: unknown,
    destroyOnRender = false,
  ): unknown {
    if (resource !== undefined) {
      destroyResource(resources, key, true, resource);
      resources[key] = { entity: resource, destroyOnRender };
    } else {
      const entry = resources[key];
      return entry ? entry.entity : undefined;
    }
    return resource;
  }

  /**
   * Remove a resource entry and optionally call its `destroy()`.
   *
   * @param key - Resource key to remove
   * @param destroy - If true (default), call `destroy()` on the entity
   * @returns The removed entity
   */
  function release(key: string, destroy = true): unknown {
    return destroyResource(resources, key, destroy);
  }

  // ── Render lifecycle ──

  /**
   * Render the view: increment signature, fire `render`, destroy transient
   * resources, then call `updater.digest()` (or `ctx.renderMethod` if set).
   *
   * No-op if the view is destroyed (`signature === 0`).
   */
  function render(): void {
    if (signature.value > 0) {
      signature.value++;
      fire("render");
      destroyAllResources(ctx, false);
      if (typeof ctx.renderMethod === "function") {
        funcWithTry(ctx.renderMethod, [], ctx, noop);
      } else {
        updater.digest();
      }
    }
  }

  // ── Update zones ──

  /**
   * Begin a zone update: unmount the zone's child frames before re-rendering.
   *
   * Called before `assign()` produces new data, so stale child views are
   * torn down before the new template output is diffed.
   */
  function beginUpdate(zoneId?: string): void {
    if (signature.value > 0 && mutable.endUpdatePending !== undefined) {
      frame.unmountZone(zoneId);
    }
  }

  /**
   * End a zone update: re-mount child frames via `frame.mountZone`, then
   * flush deferred `invoke` calls.
   *
   * Marks the view as rendered (`rendered.value = true`) on the first call.
   */
  function endUpdate(zoneId?: string, inner?: boolean): void {
    if (signature.value > 0) {
      const updateId = zoneId ?? id;
      let flag: number | boolean | undefined;

      if (inner) {
        flag = inner;
      } else {
        flag = mutable.endUpdatePending;
        mutable.endUpdatePending = 1;
        rendered.value = true;
      }

      frame.mountZone(updateId);

      if (!flag) {
        setTimeout(
          wrapAsync(() => {
            runInvokes(frame);
          }),
          0,
        );
      }
    }
  }

  // ── Async safety ──

  /**
   * Wrap an async callback with a signature guard.
   *
   * Captures `signature` at wrap time. The returned function only executes
   * `fn` if the view is still alive (`signature > 0`) AND the signature
   * hasn't changed (no re-render or destroy occurred). Otherwise returns
   * `undefined` — stale callbacks are silently dropped.
   */
  function wrapAsync<Fn extends AnyFunc>(
    fn: Fn,
    context?: unknown,
  ): (...args: Parameters<Fn>) => ReturnType<Fn> | undefined {
    const currentSignature = signature.value;
    return (...args: Parameters<Fn>) => {
      if (currentSignature > 0 && currentSignature === signature.value) {
        return fn.apply(context ?? ctx, args) as ReturnType<Fn>;
      }
      return undefined;
    };
  }

  // ── Location observation ──

  /**
   * Declare which URL params/path this view observes.
   *
   * When any observed key changes (via `Router.to()` or back/forward), the
   * framework calls `ctx.render()` to re-render the view.
   *
   * Accepts a string (`"page,size"`), an array (`["page", "size"]`), or an
   * options object (`{ params: [...], observePath: true }`).
   */
  function observeLocation(
    params: string | string[] | Record<string, unknown>,
    observePath = false,
  ): void {
    locationObserved.flag = 1;

    if (typeof params === "object" && !Array.isArray(params)) {
      const opts = params;
      if (opts["path"]) {
        observePath = true;
      }
      const paramKeys = opts["params"];
      if (typeof paramKeys === "string" || Array.isArray(paramKeys)) {
        params = paramKeys;
      }
    }

    locationObserved.observePath = observePath;

    if (params) {
      if (typeof params === "string") {
        locationObserved.keys = params.split(",");
      } else if (Array.isArray(params)) {
        locationObserved.keys = params;
      }
    }
  }

  // ── State observation ──

  /**
   * Declare which `State` keys this view observes.
   *
   * When any observed key changes (via `State.digest()`), the framework calls
   * `ctx.render()` to re-render the view.
   */
  function observeState(keys: string | string[]): void {
    if (typeof keys === "string") {
      mutable.observedStateKeys = keys.split(",");
    } else {
      mutable.observedStateKeys = keys;
    }
  }

  // ── Getters/setters as functions (no getter/setter syntax) ──
  function getTemplate(): ViewTemplate | VDomTemplate | undefined {
    return mutable.template;
  }
  function setTemplate(v: ViewTemplate | VDomTemplate | undefined): void {
    mutable.template = v;
  }
  function getObservedStateKeys(): string[] | undefined {
    return mutable.observedStateKeys;
  }
  function setObservedStateKeys(v: string[] | undefined): void {
    mutable.observedStateKeys = v;
  }
  function getEndUpdatePending(): number | undefined {
    return mutable.endUpdatePending;
  }
  function setEndUpdatePending(v: number | undefined): void {
    mutable.endUpdatePending = v;
  }
  function getEvents(): Record<string, AnyFunc> | undefined {
    return mutable.events;
  }
  function setEvents(v: Record<string, AnyFunc> | undefined): void {
    mutable.events = v;
  }
  function getAssign():
    | ((options?: unknown) => boolean | undefined)
    | undefined {
    return mutable.assignFn;
  }
  function setAssign(
    v: ((options?: unknown) => boolean | undefined) | undefined,
  ): void {
    mutable.assignFn = v;
  }

  const ctx: ViewCtx = {
    id,
    owner: frame,
    updater,
    signature,
    rendered,
    getTemplate,
    setTemplate,
    locationObserved,
    getObservedStateKeys,
    setObservedStateKeys,
    resources,
    emitter,
    getEndUpdatePending,
    setEndUpdatePending,
    getEvents,
    setEvents,
    cleanups,
    getAssign,
    setAssign,
    render,
    beginUpdate,
    endUpdate,
    wrapAsync,
    observeLocation,
    observeState,
    capture,
    release,
    fire,
    on,
    off,
  };

  return ctx;
}

// ============================================================
// Event registration
// ============================================================

/**
 * Parse event method names like "handler<click>" or "$selector<click>"
 * and register them with the EventDelegator.
 *
 * Called after setup returns, with the `events` map from the setup result.
 */
export function registerEvents(ctx: ViewCtx): void {
  const events = ctx.getEvents();
  if (!events) return;

  for (const key of Object.keys(events)) {
    if (!hasOwnProperty(events, key)) continue;
    const handler = events[key];
    if (typeof handler !== "function") continue;

    const matches = key.match(VIEW_EVENT_METHOD_REGEXP);
    if (!matches) continue;

    const isSelector = matches[1];
    const selectorOrCallback = matches[2];
    const eventTypes = matches[3];
    const modifiers = matches[4];

    const mod: Record<string, boolean> = {};
    if (modifiers) {
      for (const item of modifiers.split(",")) {
        mod[item] = true;
      }
    }

    for (const eventType of eventTypes.split(",")) {
      const globalNode: EventTarget | undefined =
        VIEW_GLOBALS[selectorOrCallback];

      if (isSelector && globalNode) {
        // Global event (window/document)
        registerGlobalEvent(ctx, globalNode, eventType, handler, mod);
      } else if (isSelector) {
        // Selector event
        EventDelegator.bind(eventType, true);
      } else {
        // Root event
        EventDelegator.bind(eventType, false);
      }
    }
  }
}

/**
 * Unregister all events for a ctx. Called on destroy.
 */
export function unregisterEvents(ctx: ViewCtx): void {
  const events = ctx.getEvents();
  if (!events) return;

  for (const key of Object.keys(events)) {
    if (!hasOwnProperty(events, key)) continue;
    const matches = key.match(VIEW_EVENT_METHOD_REGEXP);
    if (!matches) continue;

    const isSelector = matches[1];
    const selectorOrCallback = matches[2];
    const eventTypes = matches[3];

    for (const eventType of eventTypes.split(",")) {
      const globalNode: EventTarget | undefined =
        VIEW_GLOBALS[selectorOrCallback];

      if (isSelector && globalNode) {
        // Global event (window/document): cleanup is handled by the
        // ctx.on("destroy") callback registered in registerGlobalEvent,
        // so no explicit unregistration is needed here.
      } else if (isSelector) {
        EventDelegator.unbind(eventType, true);
      } else {
        EventDelegator.unbind(eventType, false);
      }
    }
  }
}

/** Register a global (window/document) event listener */
function registerGlobalEvent(
  ctx: ViewCtx,
  element: EventTarget,
  eventName: string,
  handler: AnyFunc,
  modifiers: Record<string, boolean>,
): void {
  const listener: EventListenerObject = {
    handleEvent(domEvent: Event): void {
      // Attach the delegated target for consumer access via event delegation
      Reflect.set(domEvent, "eventTarget", element);
      if (modifiers) {
        // Check keyboard modifiers via runtime property inspection (type-safe)
        const ctrlKey = Reflect.get(domEvent, "ctrlKey");
        const shiftKey = Reflect.get(domEvent, "shiftKey");
        const altKey = Reflect.get(domEvent, "altKey");
        const metaKey = Reflect.get(domEvent, "metaKey");
        if (
          (modifiers["ctrl"] && !ctrlKey) ||
          (modifiers["shift"] && !shiftKey) ||
          (modifiers["alt"] && !altKey) ||
          (modifiers["meta"] && !metaKey)
        ) {
          return;
        }
      }
      funcWithTry(handler, [domEvent], ctx, noop);
    },
  };

  element.addEventListener(eventName, listener);

  // Store for cleanup on destroy
  ctx.on("destroy", () => {
    element.removeEventListener(eventName, listener);
  });
}

// ============================================================
// Resource management
// ============================================================

/**
 * Destroy all resources managed by a ctx.
 * If lastly=true, destroy ALL resources; otherwise only destroyOnRender ones.
 */
export function destroyAllResources(ctx: ViewCtx, lastly: boolean): void {
  const cache = ctx.resources;
  for (const p in cache) {
    if (hasOwnProperty(cache, p)) {
      const entry = cache[p];
      if (lastly || entry.destroyOnRender) {
        destroyResource(cache, p, true);
      }
    }
  }
}

/**
 * Destroy a single resource entry.
 */
function destroyResource(
  cache: Record<string, ViewResourceEntry>,
  key: string,
  callDestroy: boolean,
  oldEntity?: unknown,
): unknown {
  const entry = cache[key];
  if (!entry || entry.entity === oldEntity) return undefined;

  const entity = entry.entity;
  if (entity && typeof entity === "object") {
    const destroyFn = Reflect.get(entity, "destroy");
    if (typeof destroyFn === "function" && callDestroy) {
      funcWithTry(destroyFn, [], entity, noop);
    }
  }

  Reflect.deleteProperty(cache, key);
  return entity;
}

// ============================================================
// Invoke queue
// ============================================================

/**
 * Process deferred invoke calls on a frame.
 */
export function runInvokes(frame: FrameObj): void {
  const list = frame.invokeList;
  if (!list) return;

  while (list.length) {
    const entry = list.shift();
    if (entry && !entry.removed) {
      frame.invoke(entry.name, entry.args);
    }
  }
}

// ============================================================
// Mount / unmount a ctx (called by Frame)
// ============================================================

/**
 * Mount a view: create ctx, run setup, register events, render.
 *
 * Called by `frame.mountView` (via `doMountView`) after the setup function
 * is loaded. Steps:
 * 1. Create a `ViewCtx` via `createCtx(frame)`
 * 2. Set it as the current hooks context (`setCurrentCtx`) so `useState` /
 *    `useEffect` / `useStore` can access it during setup
 * 3. Run `setup(ctx, params)` — returns `{ template, events, assign? }`
 * 4. Wire template/events/assign onto the ctx
 * 5. Activate: `signature.value = 1`, `frame.view = ctx`
 * 6. Register events via `registerEvents(ctx)`
 * 7. Render via `ctx.render()` (or `ctx.endUpdate()` if no template)
 */
export function mountCtx(
  frame: FrameObj,
  setup: ViewSetup,
  params?: unknown,
): ViewCtx {
  const ctx = createCtx(frame);

  // Set currentCtx so hooks (useState, useEffect, etc.) can access the ctx
  // during setup execution. Must be reset to null after setup completes.
  setCurrentCtx(ctx);
  let descriptor: ReturnType<ViewSetup>;
  try {
    // Run setup — returns { template, events, assign? }
    descriptor = setup(ctx, params);
  } finally {
    setCurrentCtx(null);
  }

  ctx.setTemplate(descriptor.template);
  ctx.setEvents(descriptor.events);
  if (descriptor.assign) {
    ctx.setAssign(descriptor.assign);
  }

  // Activate
  ctx.signature.value = 1;

  // Wire ctx to frame BEFORE render so that updater.digest() → runDigest()
  // can find `frame.view` and read the template. Without this, runDigest's
  // `const view = frame?.view` is undefined and the render is a no-op —
  // the root cause of the blank-page bug in swifty-demo.
  frame.view = ctx;

  // Register events
  registerEvents(ctx);

  // Render
  if (ctx.getTemplate()) {
    ctx.render();
  } else {
    ctx.endUpdate();
  }

  return ctx;
}

/**
 * Unmount a view: run `useEffect` cleanups, unregister events, destroy
 * resources, fire `destroy`, and set `signature = 0`.
 *
 * Called by `frame.unmountView`.
 */
export function unmountCtx(ctx: ViewCtx): void {
  // Run useEffect cleanups
  for (let i = ctx.cleanups.length - 1; i >= 0; i--) {
    const cleanup = ctx.cleanups[i];
    funcWithTry(cleanup, [], null, noop);
  }
  ctx.cleanups.length = 0;

  // Unregister events
  unregisterEvents(ctx);

  // Destroy all resources
  destroyAllResources(ctx, true);

  // Fire destroy event
  if (ctx.signature.value > 0) {
    ctx.fire("destroy", undefined, true, true);
  }

  // Mark as destroyed
  ctx.signature.value = 0;
}

// ============================================================
// HMR support
// ============================================================
// HMR hot-swap is handled by the hmr module (hotSwapByView / hotSwapByTemplate).
// These are called via globalThis.__swifty_hmr__ by auto-injected HMR snippets.
