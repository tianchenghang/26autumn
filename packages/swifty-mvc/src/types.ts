/**
 * Swifty framework type definitions.
 *
 * This module is the **single source of truth** for all shared types across
 * the framework. Defining them here (rather than inline in each module)
 * enforces a consistent interface contract and prevents circular type imports.
 *
 * ## Framework architecture
 *
 * Swifty is a lightweight MVC frontend framework for single-page applications
 * and micro-frontend scenarios:
 *
 * - **View** — functional view system via `defineView()` + `ViewCtx` + Hooks
 * - **Router** — history/hash two-phase route confirmation with async guards
 * - **State** — simple cross-view observable singleton (for lightweight data)
 * - **Store** — zustand-aligned state management with `createStore` /
 *   `getState` / `setState` / `subscribe` / `computed` (for complex reactive state)
 * - **Service** — API request management with LFU caching, deduplication,
 *   serial queuing, and lifecycle events
 * - **Frame** — view lifecycle management (mount/unmount, parent-child tree,
 *   cross-view method invocation)
 * - **Updater** — per-view data binding with change detection and DOM diff
 *   (real-DOM diff in string mode, VDOM diff with LIS reconciliation in vdom mode)
 *
 * ## Design principles
 *
 * - Functional API — no `class`, no `this`, no `prototype`, no `mixin`
 * - Zero runtime dependencies (Babel is build-time only)
 * - Real DOM diff via `innerHTML` + keyed comparison (not virtual DOM by default)
 * - Module Federation support for micro-frontends
 */

// ============================================================
// Function types
// ============================================================

/** Generic function type for event handlers and callbacks.
 *  Uses any[] to accept callbacks with specific parameter types
 *  (TypeScript function parameters are contravariant).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunc = (...args: any[]) => unknown;

// ============================================================
// Cache types
// ============================================================

export interface CacheEntry<T> {
  /** Original key without prefix */
  originalKey: string;
  /** Cached value */
  value: T | undefined;
  /** Access frequency count */
  frequency: number;
  /** Last access timestamp */
  lastTimestamp: number;
}

export interface CacheOptions<T> {
  /** Maximum cache size before eviction triggers (default: 20) */
  maxSize?: number;
  /** Buffer size for eviction (default: 5) */
  bufferSize?: number;
  /** Callback when entry is removed */
  onRemove?: (key: string) => void;
  /** Comparator for sorting entries */
  sortComparator?: (a: CacheEntry<T>, b: CacheEntry<T>) => number;
}

// ============================================================
// Event types
// ============================================================

export interface EventListenerEntry {
  /** Handler function */
  handler: AnyFunc;
  /** Whether currently executing (1 = executing, '' = done) */
  executing: number | string;
}

// ============================================================
// URI / Location types
// ============================================================

/**
 * Parsed URL result containing path and parameters.
 * Returned by `Router.parse()`, includes the path string and parsed key-value parameter pairs.
 */
export interface ParsedUri {
  /** Path portion (before ? or #), excluding query parameters */
  path: string;
  /** Key-value params parsed from the URL */
  params: Record<string, string>;
}

/**
 * Current URL parsing result interface.
 * Returned by `Router.parse()`, includes both query (after ?) and hash (after #) sections.
 */
export interface Location {
  /** Full href, original href string */
  href: string;
  /** Query string (before #), raw query string (after ?, before #) */
  srcQuery: string;
  /** Hash string (after #), raw hash string (after #) */
  srcHash: string;
  /** Parsed query object, path and params parsed from srcQuery */
  query: ParsedUri;
  /** Parsed hash object, path and params parsed from srcHash */
  hash: ParsedUri;
  /**
   * Merged params from query and hash,
   * hash values take precedence when keys conflict.
   */
  params: Record<string, string>;
  /**
   * Resolved view path for the current URL.
   * May be undefined before framework boot.
   */
  view?: string;
  /**
   * Resolved path computed from hash path and query path based on routing rules.
   * May be undefined before framework boot.
   */
  path?: string;
  /**
   * Get param by key with optional default value.
   * Returns default value or empty string if key does not exist.
   * @param key Parameter key name
   * @param defaultValue Default value when key is missing, defaults to empty string
   */
  get: (key: string, defaultValue?: string) => string;
}

/**
 * URL parameter change representing a parameter value transition from old to new.
 * Used in `Router.diff()` return value to describe parameter changes.
 */
export interface ParamDiff {
  /** Value before the change */
  from: string;
  /** Value after the change */
  to: string;
}

/**
 * URL route change object interface describing changes between two routing states.
 * Returned by `Router.diff()`, includes changes in path, view, and other parameters.
 */
export interface LocationDiff {
  /**
   * Changed params (key -> {from, to}),
   * diff for all changed parameters
   */
  params: Record<string, ParamDiff>;
  /** Path diff when path has changed */
  path?: ParamDiff;
  /** View diff when rendered view has changed */
  view?: ParamDiff;
  /**
   * Whether this is a first forced change during app initialization.
   */
  force: boolean;
  /** Whether any content has changed */
  changed: boolean;
}

/**
 * Route pre-change event interface (change phase).
 * Provides two-phase confirmation: triggers change (can be rejected), then changed.
 * Can prevent, reject, or accept route changes through this event object.
 */
export interface RouteChangeEvent extends ChangeEvent {
  /**
   * Reject the URL change, revert to previous URL.
   */
  reject: () => void;
  /**
   * Accept the URL change, continue navigation.
   */
  resolve: () => void;
  /**
   * Prevent the URL change, pause subsequent route processing.
   */
  prevent: () => void;
}

/**
 * Route post-change event interface (changed phase).
 * Carries route diff information. Triggered after route change is confirmed and URL is updated.
 */
export type RouteChangedEvent = LocationDiff & ChangeEvent;

// ============================================================
// DOM types
// ============================================================

export interface DomRef {
  /** ID update list: [element, newId][] */
  idUpdates: [Element, string][];
  /** DOM operation list: [opCode, parent, newChild?, oldChild?][] */
  domOps: DomOp[];
  /** Whether anything changed */
  hasChanged: number;
}

/**
 * Encoded DOM mutation. The op code matches `Node.appendChild` family at the
 * DOM level — parents are always Elements (you can't appendChild onto text)
 * but the moving / replaced child can be any ChildNode (Element / Text /
 * Comment), so the child slots are typed as ChildNode.
 */
export type DomOp =
  | [1, Element, ChildNode] // appendChild(parent, newChild)
  | [2, Element, ChildNode] // removeChild(parent, oldChild)
  | [4, Element, ChildNode, ChildNode] // replaceChild(parent, newChild, oldChild)
  | [8, Element, ChildNode, ChildNode]; // insertBefore(parent, newChild, refChild)

// ============================== VDOM ==============================

// ============================================================
// VDOM types
// ============================================================

/**
 * Virtual DOM node. Produced by `vdomCreate`, consumed by the VDOM diff engine.
 *
 * Property semantics:
 * - Text nodes: tag = 0 (V_TEXT_NODE), html = text content
 * - Element nodes: tag = string, attrs = serialized opening tag, children = child VDomNodes
 * - Raw HTML nodes: tag = SPLITTER (\x1e), html = raw HTML string
 * - Self-closing: selfClose = true (children param was 1)
 */
export interface VDomNode {
  /** Tag name for elements, 0 (V_TEXT_NODE) for text, SPLITTER for raw HTML */
  tag: string | number;
  /** Inner HTML (serialized children for elements, text content for text nodes) */
  html: string;
  /** Serialized opening tag with attributes, e.g. '<div class="row"' */
  attrs?: string;
  /** Attribute key-value map */
  attrsMap?: Record<string, unknown>;
  /** Attribute names that are set as DOM properties (not attributes) */
  attrsSpecials?: Record<string, string>;
  /** Original specials argument before defaulting (for change detection) */
  hasSpecials?: Record<string, string> | undefined;
  /** Child VDomNode array (undefined for text/raw/self-closing) */
  children?: VDomNode[] | undefined;
  /** Diff key: from id, #, or v-swifty path */
  compareKey?: string | undefined;
  /** Keyed children count map (compareKey -> count) */
  reused?: Record<string, number> | undefined;
  /** Total count of keyed children */
  reusedTotal?: number;
  /** Sub-view references: [viewPath, owner, uri, params] tuples */
  views?: [string, string, string, Record<string, string>][] | undefined;
  /** Whether self-closing (children param was literal 1) */
  selfClose?: boolean;
  /** Sub-view path if this node hosts a v-swifty view, otherwise falsy */
  isSwiftyView?: string | undefined;
}

/**
 * VDOM diff operation tracker. Parallel to DomRef but for the VDOM pipeline.
 */
export interface VDomRef {
  /** View ID (for placeholder replacement) */
  viewId: string;
  /** Deferred DOM property assignments: [element, propName, value][] */
  nodeProps: [Element, string, unknown][];
  /** Pending async operation count */
  asyncCount: number;
  /** Whether the DOM actually changed */
  changed: number;
}

/**
 * VDOM template function signature.
 * The compiled template imports vdomCreate via ES module import and
 * takes only (data, viewId, refData). Extra arguments are ignored.
 */
export type VDomTemplate = (
  data: unknown,
  viewId: string,
  refData: unknown,
) => VDomNode;

// ============================== VDOM ==============================

// ============================================================
// Frame internal types
// ============================================================

export interface FrameInvokeEntry {
  /** Method name */
  name: string;
  /** Method arguments */
  args: unknown[];
  /** Internal key */
  key: string;
  /** Whether removed (args match) */
  removed?: boolean;
}

// Event handler types are inline in the events map returned by ViewSetup

// ============================================================
// View instance types
// ============================================================

/**
 * Compiled template function signature.
 * Called with `(data, viewId, refData)` by the Updater at render time.
 * Runtime helpers (encodeHTML/strSafe/refFn) are imported by the compiled
 * module from `@swifty.js/mvc/runtime`, not passed as arguments.
 */
export type ViewTemplate = (
  data: unknown,
  viewId: string,
  refData: unknown,
) => string;

export interface ViewLocationObserved {
  /** Whether observing location */
  flag: number;
  /** Keys to observe */
  keys: string[];
  /** Whether observing path */
  observePath: boolean;
}

export interface ViewResourceEntry {
  /** The resource entity */
  entity: unknown;
  /** Whether to destroy when render() is called */
  destroyOnRender: boolean;
}

/**
 * Router interface providing URL parsing, navigation, diff, and event listening capabilities.
 * Supports two-phase route confirmation mechanism: change (can reject) → changed.
 * Hash-based implementation using #! as default hash prefix.
 */
export interface RouterApi {
  /** Bind event listener */
  on(event: string, handler: (e?: ChangeEvent) => void): this;
  /** Unbind event listener */
  off(event: string, handler?: AnyFunc): this;
  /** Fire event */
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): this;
  /**
   * Parse href into Location object.
   * Parses query and hash sections of href, returns structured routing information.
   * Defaults to parsing current page `location.href`.
   * @param href URL to parse, uses `location.href` if not specified
   */
  parse(href?: string): Location;
  /**
   * Compute diff between current and previous location.
   * Returns undefined if no routing changes have occurred yet.
   */
  diff(): LocationDiff | undefined;
  /**
   * Navigate to new URL.
   * Supports two calling modes:
   * - `Router.to("/list", { page: 2 })` specify path and params
   * - `Router.to({ page: 2 })` update params only, keep current path
   * @param pathOrParams Path string or params object
   * @param params Query params object (only used when first arg is path string)
   * @param replace Whether to replace current history entry instead of adding new one
   * @param silent Whether to silently update without triggering change event
   */
  to(
    pathOrParams: string | Record<string, unknown>,
    params?: Record<string, unknown>,
    replace?: boolean,
    silent?: boolean,
  ): void;
  /** Join path segments */
  join(...paths: string[]): string;
  /**
   * Register an async-friendly navigation guard.
   *
   * Each guard is invoked with the parsed `(to, from)` Locations. Guards
   * may return a Promise; the router awaits all guards in registration
   * order. If any guard:
   *
   * - returns / resolves to `false`,
   * - throws or rejects,
   *
   * the navigation is aborted and the URL is reverted. Returning `true`,
   * `undefined`, or any non-false value permits the navigation.
   *
   * Returns an unsubscribe function so the guard can be torn down (e.g.
   * inside a view's `destroy` handler).
   */
  beforeEach(
    guard: (to: Location, from: Location) => boolean | Promise<boolean>,
  ): () => void;
  /** Internal: bind hashchange (called by Framework.boot) */
  _bind(): void;
  /** Internal: set framework config */
  _setConfig(cfg: FrameworkConfig): void;
  /** Internal: notify hash change (for programmatic trigger) */
  notify?(e?: Event): void;
  /**
   * Triggered when URL is about to change (change phase), can reject or prevent navigation via event object.
   */
  onChange?: (e?: RouteChangeEvent) => void;
  /**
   * Triggered after URL has changed (changed phase), carries route diff information.
   */
  onChanged?: (e?: RouteChangedEvent) => void;
}

// ============================================================
// Functional API interfaces (replace class-based interfaces above)
// ============================================================

/**
 * Functional emitter API.
 *
 * Returned by `createEmitter()`. No `this` binding — handlers are called
 * with `null` context. Methods return the API object for chaining.
 */
export interface EmitterApi<T = unknown> {
  on(name: string, fn: (e?: ChangeEvent) => void): EmitterApi<T>;
  off(name: string, fn?: AnyFunc): EmitterApi<T>;
  fire(
    name: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): EmitterApi<T>;
}

/**
 * Functional cache API.
 *
 * Returned by `createCache()`.
 */
export interface CacheApi<T = unknown> {
  set(key: string, resource: T): void;
  get(key: string): T | undefined;
  del(key: string): void;
  has(key: string): boolean;
  clear(): void;
  forEach(callback: (value: T | undefined) => void): void;
  getSize(): number;
}

/**
 * Functional updater API.
 *
 * Returned by `createUpdater()`. `refData` is a property.
 * `set()` returns the API object for chaining.
 */
export interface UpdaterApi {
  get: <T = unknown>(key?: string) => T;
  set: (
    data: Record<string, unknown>,
    excludes?: ReadonlySet<string>,
  ) => UpdaterApi;
  digest: (
    data?: Record<string, unknown>,
    excludes?: ReadonlySet<string>,
    callback?: () => void,
  ) => void;
  forceDigest: () => void;
  snapshot: () => UpdaterApi;
  altered: () => boolean | undefined;
  refData: Record<string, unknown>;
  translate: (data: unknown) => unknown;
  parse: (expr: string) => unknown;
  getChangedKeys: () => ReadonlySet<string>;
}

/**
 * Mutable reference cell — used for `signature` and `rendered` on `ViewCtx`.
 * Wraps mutable state in a `Ref<T>` to avoid getter/setter syntax.
 */
export interface Ref<T> {
  value: T;
}

/**
 * Functional view context.
 *
 * Passed as the first argument to every view setup function. Provides
 * framework APIs without `this` binding.
 */
export interface ViewCtx {
  /** View ID (same as owner frame ID) */
  id: string;
  /** Owner frame reference */
  owner: FrameObj;
  /** Updater API for data binding */
  updater: UpdaterApi;
  /** Signature: >0 means active, incremented on render, 0 = destroyed */
  signature: Ref<number>;
  /** Whether rendered at least once */
  rendered: Ref<boolean>;
  /** View template function (accessed via getTemplate/setTemplate) */
  getTemplate(): ViewTemplate | VDomTemplate | undefined;
  setTemplate(v: ViewTemplate | VDomTemplate | undefined): void;
  /** Location observation config */
  locationObserved: ViewLocationObserved;
  /** Observed state keys (accessed via getObservedStateKeys/setObservedStateKeys) */
  getObservedStateKeys(): string[] | undefined;
  setObservedStateKeys(v: string[] | undefined): void;
  /** Resource map */
  resources: Record<string, ViewResourceEntry>;
  /** Internal emitter for lifecycle events ("destroy", "render", etc.) */
  emitter: EmitterApi;
  /** EndUpdate pending flag (accessed via getEndUpdatePending/setEndUpdatePending) */
  getEndUpdatePending(): number | undefined;
  setEndUpdatePending(v: number | undefined): void;
  /** Wrapped render method */
  renderMethod?: AnyFunc;
  /** Event handlers returned by setup (accessed via getEvents/setEvents) */
  getEvents(): Record<string, AnyFunc> | undefined;
  setEvents(v: Record<string, AnyFunc> | undefined): void;
  /** Cleanup functions registered by useEffect */
  cleanups: Array<() => void>;
  /** assign function returned by setup (accessed via getAssign/setAssign) */
  getAssign(): ((options?: unknown) => boolean | undefined) | undefined;
  setAssign(v: ((options?: unknown) => boolean | undefined) | undefined): void;

  // Lifecycle / framework API methods
  render(): void;
  beginUpdate(id?: string): void;
  endUpdate(id?: string, inner?: boolean): void;
  wrapAsync<Fn extends AnyFunc>(
    fn: Fn,
    context?: unknown,
  ): (...args: Parameters<Fn>) => ReturnType<Fn> | undefined;
  observeLocation(
    params: string | string[] | Record<string, unknown>,
    observePath?: boolean,
  ): void;
  observeState(keys: string | string[]): void;
  capture(key: string, resource?: unknown, destroyOnRender?: boolean): unknown;
  release(key: string, destroy?: boolean): unknown;
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): void;
  on(event: string, handler: AnyFunc): () => void;
  off(event: string, handler?: AnyFunc): void;
}

/**
 * Functional frame object.
 *
 * Created by `createFrame()`. Uses `ViewCtx` for its view reference.
 */
export interface FrameObj {
  id: string;
  /** View path (accessed via getViewPath) */
  getViewPath(): string | undefined;
  readonly parentId: string | undefined;
  view: ViewCtx | undefined;
  invokeList: FrameInvokeEntry[];
  signature: number;
  destroyed: number;
  hasAltered: number;
  originalTemplate?: string;
  holdFireCreated: number;
  childrenCreated: number;
  childrenAlter: number;
  childrenMap: Record<string, string>;
  childrenCount: number;
  readyCount: number;
  readyMap: Set<string>;
  emitter: EmitterApi;
  /** Dispatcher visit tag (set during dispatcherUpdate walk) */
  dispatcherUpdateTag?: number;

  mountView(viewPath: string, viewInitParams?: Record<string, unknown>): void;
  unmountView(): void;
  mountFrame(
    frameId: string,
    viewPath: string,
    viewInitParams?: Record<string, unknown>,
  ): FrameObj;
  unmountFrame(id?: string): void;
  mountZone(zoneId?: string): void;
  unmountZone(zoneId?: string): void;
  parent(level?: number): FrameObj | undefined;
  invoke(name: string, args?: unknown[]): unknown;
  children(): string[];
  on(event: string, handler: AnyFunc): FrameObj;
  off(event: string, handler?: AnyFunc): FrameObj;
  fire(event: string, data?: Record<string, unknown>): FrameObj;
}

/**
 * View setup function — the functional API for defining views.
 *
 * Called once on mount with a `ViewCtx` and optional init params.
 * Returns a descriptor with `template`, `events`, and optional `assign`.
 */
export type ViewSetup<T = unknown> = (
  ctx: ViewCtx,
  params?: T,
) => {
  template?: ViewTemplate | VDomTemplate;
  events?: Record<string, AnyFunc>;
  assign?: (options?: unknown) => boolean | undefined;
};

// defineView returns a ViewSetup function directly — no wrapper class needed

// ============================================================
// Service types
// ============================================================

/**
 * Data payload interface wrapping API request response data, providing read/write methods.
 * Payload instances are created internally by Service, developers access via all/one/save callbacks.
 */
export interface PayloadApi {
  /**
   * Get data from Payload by key.
   * @param key Data key name
   */
  get<T = unknown>(key: string): T;
  /**
   * Set data to Payload, supports three calling modes:
   * - Key-value pair: `payload.set("name", "value")`
   * - Data object: `payload.set({ name: "value" })`
   * - Endpoint metadata object (for internal framework use)
   * Returns this for chaining.
   * @param keyOrData Key/value string, data object, or endpoint metadata object
   * @param value Value when first parameter is a key
   */
  set(
    keyOrData: string | Record<string, unknown> | ServiceMetaEntry,
    value?: unknown,
  ): PayloadApi;
  data: Record<string, unknown>;
  cacheInfo?: ServiceCacheInfo;
}

/**
 * Change event object.
 */
export interface ChangeEvent {
  /**
   * Event type.
   */
  readonly type: string;
  /**
   * Set of changed data keys. Use `keys.has(name)` to check membership.
   */
  readonly keys?: ReadonlySet<string>;
}

/**
 * Global state interface providing cross-view data sharing and data change notification capabilities.
 * State is a singleton object managing app-level state data via get/set/digest.
 * Supports `clean()` method for automatic cleanup on view destruction.
 *
 * Use State for SIMPLE cross-view data (lightweight shared values: counters,
 * toggles, page title, session info, etc.). For COMPLEX reactive state —
 * handlers, derived data, or fine-grained subscriptions — use `createStore` instead.
 */
export interface StateApi {
  /** Bind event listener */
  on(event: string, handler: (e?: ChangeEvent) => void): this;
  /** Unbind event listener */
  off(event: string, handler?: AnyFunc): this;
  /** Fire event */
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): this;
  /**
   * Get data from global state, returns complete state object if key is omitted.
   * @param key Data key name, omitted returns complete state object
   */
  get<T = unknown>(key?: string): T;
  /**
   * Set global state data.
   * After set, must explicitly call `digest()` to dispatch changed event and notify views to update.
   * @param data Data object, e.g., `{ a: 1, b: 2 }`
   * @param excludes Set of keys to exclude from change tracking
   */
  set(data: Record<string, unknown>, excludes?: ReadonlySet<string>): this;
  /**
   * Create a cleanup function for state keys on view destroy.
   * Call inside setup: `State.clean("keys")(ctx)`
   * @param keys Comma-separated key string
   * @returns Function that registers destroy cleanup on a ctx
   */
  clean(
    keys: string,
  ): (ctx: { on: (event: string, handler: () => void) => void }) => void;
  /**
   * Detect data changes and dispatch changed event.
   * After set, must explicitly call `digest()` to dispatch changed event and notify views to update.
   * @param data Optional data object, if provided calls `set()` first to set data
   * @param excludes Set of keys to exclude from change tracking
   */
  digest(data?: Record<string, unknown>, excludes?: ReadonlySet<string>): void;
  /**
   * Get the set of keys changed in the most recent digest.
   */
  diff: () => ReadonlySet<string>;
  onChanged?: (e?: ChangeEvent) => void;
}

/** Pending cache entry for deduplication (internal to Service) */
export interface PendingCacheEntry extends Array<unknown> {
  /** Reference to the pending Payload entity */
  entity?: unknown;
}

/**
 * Endpoint metadata configuration for registering an API endpoint with Service.
 * Each meta describes endpoint's URL, cache strategy, before/after interceptors, etc.
 */
export interface ServiceMetaEntry {
  /**
   * Endpoint name,
   * Unique name for endpoint metadata, must be unique within same Service.
   */
  name: string;
  /** Request URL, required. */
  url: string;
  /**
   * Cache TTL in ms, 0 = no cache.
   * Cache validity time in milliseconds.
   * 0 means no caching.
   * Greater than 0 means cache TTL, reuse cached data within this time range.
   */
  cache?: number;
  /**
   * Before-fetch hook.
   * Hook function called before request is sent, can process request data.
   * @param payload Data carrier for current request
   */
  before?: (payload: PayloadApi) => void;
  /**
   * After-fetch hook.
   * Hook function called after request succeeds, before data is passed to view.
   * Can process response data in this method.
   * @param payload Data carrier for current request
   */
  after?: (payload: PayloadApi) => void;
  /** Clean keys on destroy,
   * Comma-separated endpoint name string for clearing other endpoints' cache.
   * For example, if an endpoint creates new data,
   * after successful call, should clear all data-fetching endpoints' cache,
   * otherwise new data cannot be retrieved.
   */
  cleanKeys?: string;
  /** Additional properties */
  [k: string]: unknown;
}

/** Cache info attached to Payload entity */
export interface ServiceCacheInfo {
  /** Endpoint name */
  name: string;
  /** Cache key */
  key: string;
  /** Timestamp when cached */
  time: number;
}

export interface FrameworkApi {
  /**
   * Read framework configuration.
   * - Without arguments: returns the complete config object.
   * - With a key: returns just `config[key]` (untyped — use a generic to
   *   constrain the return type if you know the key's shape).
   *
   * `getConfig` is a pure read — call `setConfig(patch)` to mutate.
   */
  getConfig(): FrameworkConfig;
  getConfig<T = unknown>(key: string): T | undefined;

  /**
   * Merge a patch into the framework configuration and return the merged
   * config object.
   */
  setConfig<T extends object = Partial<FrameworkConfig>>(
    patch: Partial<FrameworkConfig> & T,
  ): FrameworkConfig & T;
  /**
   * App initialization entry point, starts framework and renders root view.
   * After invocation: merge config → bind route events → create root Frame → mount default view.
   * @param cfg Config object
   */
  boot(cfg: FrameworkConfig): void;
  /**
   * Convert path and params to URL string.
   * Example: `Framework.toUri('/xxx/', {a:'b',c:'d'})` => `/xxx/?a=b&c=d`
   * @param path Path string
   * @param params Params object
   * @param keepEmpty Set of keys whose empty values should be preserved
   */
  toUri(
    path: string,
    params?: Record<string, unknown>,
    keepEmpty?: Set<string>,
  ): string;
  /**
   * Parse URL string to path and params object.
   * Example: `Framework.parseUri('/xxx/?a=b&c=d')` => `{path:'/xxx/', params:{a:'b',c:'d'}}`
   * @param url URL string
   */
  parseUri(url: string): ParsedUri;
  /**
   * Merge source object properties into target object.
   * @param target Target object
   * @param sources One or more source objects
   */
  assign<T extends object>(target: T, ...sources: Record<string, unknown>[]): T;

  /**
   * Get enumerable property keys of object as array.
   * @param src Source object
   */
  keys<T extends object>(src: T): string[];
  /**
   * Check if one DOM node is contained within another.
   * Returns true if both nodes are the same.
   * @param node Node or node ID
   * @param container Container node or node ID
   */
  nodeInside(
    node: HTMLElement | string,
    container: HTMLElement | string,
  ): boolean;
  /**
   * Ensure DOM element has an ID, auto-generates one if missing.
   * Returns element's ID.
   * @param node DOM element object
   */
  ensureNodeId(node: HTMLElement): string;
  /**
   * Load modules using configured module loader.
   * @param names Module names, supports string or string array
   * @param callback Callback after modules are loaded
   */
  use(
    names: string | string[],
    callback?: (...modules: unknown[]) => void,
  ): void;
  /**
   * Generate globally unique identifier (GUID).
   * @param prefix GUID prefix, defaults to "swifty-"
   */
  generateId(prefix?: string): string;
  /**
   * Create async callback validity marker.
   * Returns a check function; if host object is unmarked (e.g., view re-rendered), check function returns false, preventing expired async callbacks from executing.
   * Typical usage: `const check = Framework.mark(this, 'render'); setTimeout(() => { if (check()) ... })`
   * @param host Host object (usually view instance)
   * @param key Marker key name (usually "render" or specific async operation identifier)
   */
  mark(host: object, key: string): () => boolean;
  /**
   * Delay wait, Promise-based setTimeout wrapper.
   * @param time Delay time in milliseconds
   */
  delay(time: number): Promise<void>;
  /**
   * Whether framework has booted
   */
  isBooted(): boolean;
  /**
   * Invalidate (unmark) async callback markers for a host object.
   * Typically called when a view is re-rendered or destroyed.
   * @param host The host object whose markers should be invalidated
   */
  unmark(host: object): void;
  /**
   * Fire a custom DOM event on a target element.
   * @param target Target element or EventTarget
   * @param eventType Event type string
   * @param eventInit CustomEvent init options
   */
  dispatchEvent(
    target: EventTarget,
    eventType: string,
    eventInit?: CustomEventInit,
  ): void;
  /**
   * Execute a function in try-catch with chunked scheduling.
   * @param fn Function to execute
   * @param args Arguments to pass
   * @param context `this` context
   */
  task(fn: AnyFunc, args?: unknown[], context?: unknown): void;
  /**
   * Wait for all views in a zone to be rendered.
   * Returns WAIT_OK if rendered, WAIT_TIMEOUT_OR_NOT_FOUND if timeout or not found.
   * @param viewId Zone view ID
   * @param timeout Timeout in milliseconds (default: 30000)
   */
  waitZoneViewsRendered(viewId: string, timeout?: number): Promise<number>;
  /** Wait result: views rendered successfully */
  WAIT_OK: number;
  /** Wait result: timeout or view not found */
  WAIT_TIMEOUT_OR_NOT_FOUND: number;
  /**
   * Emitter factory function.
   * Use `createEmitter()` to create emitter instances.
   */
  createEmitter: typeof import("./event-emitter").createEmitter;
  /**
   * View factory function.
   * Use `defineView()` to create view setups.
   */
  defineView: typeof import("./view").defineView;
  /**
   * Cache factory function.
   * Use `createCache()` to create cache instances.
   */
  createCache: typeof import("./cache").createCache;
  /**
   * Global state object.
   */
  State: StateApi;
  /**
   * Router object.
   */
  Router: RouterApi;
  /**
   * Frame singleton.
   * Frame tree for view lifecycle management. Use createFrame() to create frames.
   */
  Frame: typeof import("./frame").Frame;
}

// ============================================================
// Framework config types
// ============================================================

/**
 * Framework configuration interface, global config passed to app during `Framework.boot()`.
 * All config items can be accessed at runtime via `Framework.getConfig('key')`.
 */
export interface FrameworkConfig {
  /**
   * Root element ID.
   * DOM root node ID where root view resides, framework renders root view within this node.
   * This field is required, defaults to "root".
   */
  rootId: string;
  /**
   * Routing mode.
   * - `"history"` (default): uses `history.pushState` / `popstate`, clean URLs like `/home`
   * - `"hash"`: uses URL hash fragment with `#!` prefix, e.g. `#!/home`
   */
  routeMode?: "history" | "hash";
  /**
   * Default view path.
   * Default root view path to load when URL doesn't match any route.
   */
  defaultView?: string;
  /**
   * Default path when no hash present,
   * Path used when URL hash is empty, defaults to "/".
   */
  defaultPath?: string;
  /**
   * Route mapping: path -> view.
   * Mapping relationship between paths and views.
   * - Simple mapping: `{ "/home": "app/views/home" }`
   * - Config mapping: `{ "/detail": { view: "app/views/detail", title: "Detail" } }`
   * Use rewrite config item for path rewriting logic.
   */
  routes?: Record<string, string | RouteViewConfig>;
  /** Hashbang prefix (only used in hash mode) */
  hashbang?: string;
  /**
   * Error handler.
   * Global error handling function, framework uses try-catch to execute some core logic.
   * When errors are thrown, allows developers to catch them via this config item.
   * Note: Do not re-throw any errors in this method.
   */
  error?: (error: Error) => void;
  /**
   * Extensions to load.
   * Array of extension view paths to load during app startup.
   * These extension views are loaded before app initialization.
   */
  extensions?: string[];
  /** Init module to load */
  initModule?: string;
  /** Rewrite function for routes */
  rewrite?: (
    path: string,
    params: Record<string, string>,
    routes: Record<string, string>,
  ) => string;
  /**
   * Unmatched view (404).
   * View path to use when no matching view is found in routes, e.g., 404 page.
   */
  unmatchedView?: string;
  /**
   * Module require function for asynchronous view loading.
   * Called by `Framework.use()` when a view setup is not found in the registry.
   * Integrate with Webpack Module Federation or other dynamic loading strategies.
   *
   * @param names - Array of module names to load (e.g., `["remote-app/views/home"]`)
   * @param params - Optional parameters passed to the module initializer
   * @returns Promise resolving to an array of loaded modules, or undefined if not available
   */
  require?: (
    names: string[],
    params?: Record<string, unknown>,
  ) => Promise<unknown[]> | undefined;
  /** Skip view rendered check */
  skipViewRendered?: boolean;
  /**
   * Project name of the current application.
   * Used by the micro-frontend bridge to determine if a view path
   * belongs to the current project or a remote project.
   */
  projectName?: string;
  /** Default false. */
  vdom?: boolean;
  /**
   * Enable Frame Devtool Bridge (default: false).
   * When true, installs a postMessage listener so the Swifty DevTool browser
   * extension can inspect the frame tree. Set to false to suppress the bridge
   * (and any extension-related errors) in environments where the extension
   * is not available or causes issues.
   */
  devtool?: boolean;
}

export interface RouteViewConfig {
  /** View path */
  view: string;
  /** Additional properties merged into location */
  [k: string]: unknown;
}

// ============================================================
// Extended HTMLElement types
// ============================================================

/** Element with DOM diff cached compare key */
export interface DomElement extends Element {
  /** Whether compare key is cached */
  compareKeyCached?: number | undefined;
  /** Cached compare key */
  cachedCompareKey?: string | undefined;
  /** Whether auto-generated ID */
  autoId?: number;
}

/** Options for compileTemplate() */
export interface CompileOptions {
  /** Enable debug mode with line tracking (default: false) */
  debug?: boolean;
  /** Global variable names to destructure from $$ (refData) */
  globalVars?: string[];
  /** File path for debug error messages (default: undefined) */
  file?: string;
  /** Generate VDOM output instead of HTML string (default: false) */
  vdom?: boolean;
}
