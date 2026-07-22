/**
 * Router with two-phase change confirmation.
 *
 * Supports two routing modes, configured via `FrameworkConfig.routeMode`:
 * - `"history"` (default): uses `history.pushState` / `popstate` for clean URLs
 * - `"hash"`: uses URL hash fragment with `#!` prefix
 *
 * ## Two-phase change event
 *
 * Navigation follows a two-phase commit protocol:
 * 1. **`change` phase** — fires before the URL updates. Listeners can call
 *    `e.prevent()` (suspend), `e.reject()` (rollback URL), or `e.resolve()`
 *    (commit). If none is called, `resolve` is the default.
 * 2. **`changed` phase** — fires after the URL is updated. The framework
 *    re-mounts views here.
 *
 * ## Async route guards
 *
 * `Router.beforeEach(async (to, from) => boolean)` registers guards that
 * run in registration order. Any guard returning `false`, throwing, or
 * rejecting aborts the navigation and reverts the URL.
 *
 * ## Caching
 *
 * `parse()` and `getChanged()` are cached by href — repeated parses of the
 * same URL return the cached `Location` without re-parsing.
 */
import {
  SPLITTER,
  URL_TRIM_HASH_REGEXP,
  URL_TRIM_QUERY_REGEXP,
  RouterEvents,
} from "./common";
import { hasOwnProperty, assign, parseUri, toUri, asRecord } from "./utils";
import { createCache } from "./cache";
import { createEmitter } from "./event-emitter";
import type {
  AnyFunc,
  Location,
  LocationDiff,
  ParamDiff,
  FrameworkConfig,
  RouteViewConfig,
  RouterApi,
} from "./types";

// ============================================================
// Internal state
// ============================================================

/** Event emitter for router events */
const emitter = createEmitter();

/** Href → Location cache */
const hrefCache = createCache<Location>();

/** (oldHref + newHref) → { changed, diff } cache */
const changedCache = createCache<{ changed: boolean; diff: LocationDiff }>();

/** Last parsed location */
let lastLocation: Location = createEmptyLocation();

/** Last changed diff */
let lastChanged: LocationDiff | undefined;

/** Whether to silently update URL without firing events */
let silent = 0;

/** Whether framework has booted */
let booted = false;

/** Lazy-initialized route config references */
let cachedRoutes: Record<string, string | RouteViewConfig> | undefined;
let cachedUnmatchedView: string | undefined;
let cachedDefaultView: string | undefined;
let cachedDefaultPath: string | undefined;
let cachedRewrite:
  | ((
      path: string,
      params: Record<string, string>,
      routes: Record<string, string>,
    ) => string)
  | undefined;

/** Default document title */
let defaultTitle: string | undefined;

/** Framework config reference (set by Framework.boot) */
let frameworkConfig: FrameworkConfig | undefined;

/** Current routing mode: "history" uses pushState, "hash" uses location.hash */
let routeMode: "history" | "hash" = "history";

/** Async navigation guards registered via Router.beforeEach. */
type BeforeEachGuard = (
  to: Location,
  from: Location,
) => boolean | Promise<boolean>;
const beforeEachGuards: BeforeEachGuard[] = [];

// ============================================================
// Internal helpers
// ============================================================

/**
 * Create an empty `Location` object for the initial state (before boot).
 *
 * The `get` accessor returns the default value or empty string.
 */
function createEmptyLocation(): Location {
  return {
    href: "",
    srcQuery: "",
    srcHash: "",
    query: { path: "", params: {} },
    hash: { path: "", params: {} },
    params: {},
    get: (_key: string, defaultValue?: string) => defaultValue ?? "",
  };
}

/**
 * `Location.get` implementation — read a param by key.
 *
 * @param key - Parameter name
 * @param defaultValue - Returned when the key is missing (defaults to `""`)
 */
function getParam(this: Location, key: string, defaultValue?: string): string {
  return (
    this["params"][key] || (defaultValue !== undefined ? defaultValue : "")
  );
}

/**
 * Resolve `loc.view` and `loc.path` from the routes config.
 *
 * Called during `parse()` after the framework has booted. Looks up the
 * raw path (from hash or query depending on mode), applies the optional
 * `rewrite` function, and maps it to a view via `routes` / `unmatchedView` /
 * `defaultView`.
 */
function attachViewAndPath(loc: Location): void {
  if (!frameworkConfig) return;

  if (!cachedRoutes) {
    cachedRoutes = frameworkConfig.routes || {};
    cachedUnmatchedView = frameworkConfig.unmatchedView;
    cachedDefaultView = frameworkConfig.defaultView;
    cachedDefaultPath = frameworkConfig.defaultPath || "/";
    cachedRewrite = frameworkConfig.rewrite;
  }

  if (!loc.view) {
    const rawPath =
      routeMode === "history"
        ? loc.query["path"] || loc.hash["path"]
        : loc.hash["path"];
    let path = rawPath || cachedDefaultPath || "/";
    // When root path "/" has no matching route, fall back to defaultPath
    // (e.g. visiting "/" should show the default view like "/home", not 404)
    if (
      !cachedRoutes[path] &&
      path === "/" &&
      cachedDefaultPath &&
      cachedDefaultPath !== "/"
    ) {
      path = cachedDefaultPath;
    }
    if (cachedRewrite) {
      path = cachedRewrite(
        path,
        loc["params"],
        cachedRoutes as Record<string, string>,
      );
    }
    const viewEntry =
      cachedRoutes[path] || cachedUnmatchedView || cachedDefaultView;
    loc["path"] = path;
    loc.view =
      typeof viewEntry === "string" ? viewEntry : viewEntry?.view || "";
    if (typeof viewEntry === "object" && viewEntry) {
      assign(loc, viewEntry);
    }
  }
}

/**
 * Compute the diff between two `Location` objects.
 *
 * Compares `params`, `path`, and `view` — any value change produces a
 * `ParamDiff` entry. The result is cached by `(oldHref + newHref)` so repeated
 * comparisons don't recompute.
 */
function getChanged(
  oldLoc: Location,
  newLoc: Location,
): { changed: boolean; diff: LocationDiff } {
  const oKey = oldLoc.href;
  const nKey = newLoc.href;
  const tKey = oKey + SPLITTER + nKey;

  const cached = changedCache.get(tKey);
  if (cached) {
    return cached;
  }

  let hasChanged = false;
  const changedParams: Record<string, ParamDiff> = {};

  const setDiff = (
    key: string,
    oldVal: string | undefined,
    newVal: string | undefined,
  ): void => {
    const from = oldVal || "";
    const to = newVal || "";
    if (from !== to) {
      changedParams[key] = { from, to };
      hasChanged = true;
    }
  };

  // Compare all params
  const allParamKeys = new Set([
    ...Object.keys(oldLoc["params"]),
    ...Object.keys(newLoc["params"]),
  ]);
  for (const key of allParamKeys) {
    setDiff(key, oldLoc["params"][key], newLoc["params"][key]);
  }

  // Build result
  const result: LocationDiff = {
    ["params"]: changedParams,
    force: !oKey,
    changed: hasChanged,
  };

  // Compare path and view at top level
  setDiff("path", oldLoc["path"], newLoc["path"]);
  if (changedParams["path"]) {
    result["path"] = changedParams["path"];
    result.changed = true;
  }

  const viewKey = "view";
  setDiff(viewKey, oldLoc.view, newLoc.view);
  if (changedParams[viewKey]) {
    result.view = changedParams[viewKey];
    result.changed = true;
  }

  const finalResult: { changed: boolean; diff: LocationDiff } = {
    changed: hasChanged,
    diff: result,
  };

  changedCache.set(tKey, finalResult);
  return finalResult;
}

/**
 * Update the browser URL using the current routing mode.
 *
 * - **History mode**: `history.pushState` / `replaceState` — no event fires,
 *   so `Router.notify()` must be called manually to trigger change detection.
 * - **Hash mode**: `location.hash` / `location.replace` — `hashchange` fires
 *   automatically.
 *
 * @param path - The path+query string to navigate to
 * @param replace - If true, replace the current history entry instead of pushing
 */
function updateBrowserUrl(path: string, replace?: boolean): void {
  if (routeMode === "history") {
    const url = path || "/";
    // Skip if URL is already the target to avoid duplicate history entries
    // (e.g. when resolve() calls updateBrowserUrl after pushState already set the URL)
    const currentUrl =
      globalThis.location.pathname + globalThis.location.search;
    if (url === currentUrl) {
      return;
    }
    if (replace) {
      globalThis.history.replaceState(null, "", url);
    } else {
      globalThis.history.pushState(null, "", url);
    }
    return;
  }
  const hashbang = frameworkConfig?.hashbang || "#!";
  const fullPath = path === "" ? "" : hashbang + path;
  if (replace) {
    globalThis.location.replace(fullPath);
  } else {
    globalThis.location.hash = fullPath;
  }
}

/**
 * Update the URL with a path and params, then trigger change detection.
 *
 * Serializes `path` + `params` via `toUri`, calls `updateBrowserUrl`, and in
 * history mode manually triggers `Router.notify()` (since `pushState` fires
 * no event). Sets the `silent` flag if `silentFlag` is true.
 */
function updateUrl(
  path: string,
  params: Record<string, unknown>,
  loc: Location,
  replace?: boolean,
  silentFlag?: boolean,
  lQuery?: ReadonlySet<string>,
): void {
  path = toUri(path, params, lQuery);
  const currentSrc = routeMode === "history" ? loc.srcQuery : loc.srcHash;
  if (path !== currentSrc) {
    silent = silentFlag ? 1 : 0;
    updateBrowserUrl(path, replace);
    // In history mode, pushState doesn't fire any event (unlike hash mode where
    // setting location.hash triggers hashchange). Manually trigger change detection.
    if (routeMode === "history" && Router.notify) {
      Router.notify();
    }
  }
}

// ============================================================
// Router object
// ============================================================

/**
 * Router with two-phase change confirmation (supports history and hash modes).
 *
 * @example
 * Router.to('/list', { page: 2 });
 * const loc = Router.parse();
 * const diff = Router.diff();
 */
export const Router: RouterApi = {
  /**
   * Parse href into Location object.
   * Defaults to globalThis.location.href.
   */
  parse(href?: string): Location {
    href = href || globalThis.location.href;

    const cached = hrefCache.get(href);
    if (cached) {
      return cached;
    }

    let srcQuery: string;
    let srcHash: string;
    let query: { path: string; params: Record<string, string> };
    let hash: { path: string; params: Record<string, string> };

    if (routeMode === "history") {
      try {
        const urlObj = new URL(href, globalThis.location.origin);
        srcQuery = urlObj.pathname + urlObj.search;
        srcHash = urlObj.hash ? urlObj.hash.replace(/^#!?/, "") : "";
        query = parseUri(srcQuery);
        hash = srcHash ? parseUri(srcHash) : { path: "", params: {} };
      } catch {
        srcQuery = href.replace(URL_TRIM_HASH_REGEXP, "");
        srcHash = href.replace(URL_TRIM_QUERY_REGEXP, "");
        query = parseUri(srcQuery);
        hash = parseUri(srcHash);
      }
    } else {
      srcQuery = href.replace(URL_TRIM_HASH_REGEXP, "");
      srcHash = href.replace(URL_TRIM_QUERY_REGEXP, "");
      query = parseUri(srcQuery);
      hash = parseUri(srcHash);
    }

    const params = assign({}, query["params"], hash["params"]);

    const location: Location = {
      href,
      srcQuery,
      srcHash,
      query: { path: query.path, params: query["params"] },
      hash: { path: hash.path, params: hash["params"] },
      ["params"]: params,
      get: getParam,
    };

    if (booted) {
      attachViewAndPath(location);
      hrefCache.set(href, location);
    }
    return location;
  },

  /**
   * Compute diff between current and previous location.
   * Fires 'changed' event if location changed and not silent.
   */
  diff(): LocationDiff | undefined {
    const location = Router.parse();
    const changed = getChanged(lastLocation, location);

    // Update lastLocation
    lastLocation = location;

    if (!silent && changed.changed) {
      lastChanged = changed.diff;
      if (lastChanged["path"]) {
        document.title = defaultTitle || document.title;
      }
      emitter.fire(RouterEvents.CHANGED, asRecord(lastChanged));
    }

    silent = 0;
    return lastChanged;
  },

  /**
   * Navigate to new URL.
   *
   * @param pathOrParams - Path string or params object
   * @param params - Query parameters (if pathOrParams is string)
   * @param replace - Whether to replace current history entry
   * @param silentFlag - Whether to silently update without firing events
   */
  to(
    pathOrParams: string | Record<string, unknown>,
    params?: Record<string, unknown>,
    replace?: boolean,
    silentFlag?: boolean,
  ): void {
    let tPath = "";
    let tParams: Record<string, unknown>;

    if (!params && typeof pathOrParams === "object") {
      tParams = pathOrParams;
    } else {
      const parsed = parseUri(pathOrParams as string);
      tPath = parsed.path;
      tParams = { ...parsed["params"] };
      if (params) {
        assign(tParams, params);
      }
    }

    const lPath = lastLocation["path"] || "";
    const lParams = lastLocation["params"];
    const lQuery = new Set<string>();
    for (const k in lastLocation.query["params"]) {
      if (hasOwnProperty(lastLocation.query["params"], k)) {
        lQuery.add(k);
      }
    }

    if (tPath) {
      if (routeMode === "hash" && typeof globalThis.history === "undefined") {
        for (const qKey of lQuery) {
          if (!hasOwnProperty(tParams, qKey)) {
            tParams[qKey] = "";
          }
        }
      }
    } else if (lParams) {
      tPath = lPath;
      tParams = assign({}, lParams, tParams);
    }

    updateUrl(tPath, tParams, lastLocation, replace, silentFlag, lQuery);
  },

  /**
   * Register an async-friendly navigation guard. See `RouterApi.beforeEach`.
   */
  beforeEach(guard: BeforeEachGuard): () => void {
    beforeEachGuards.push(guard);
    return () => {
      const idx = beforeEachGuards.indexOf(guard);
      if (idx !== -1) beforeEachGuards.splice(idx, 1);
    };
  },

  /**
   * Join multiple path segments into a single path.
   */
  join(...paths: string[]): string {
    let result = paths.join("/");

    // /a/b/./c/./d ==> /a/b/c/d
    result = result.replace(/\/\.\//g, "/");

    // a/b/c/../../d ==> a/b/../d ==> a/d
    const doubleDotRegExp = /\/[^/]+\/\.\.\//;
    while (doubleDotRegExp.test(result)) {
      result = result.replace(doubleDotRegExp, "/");
    }

    // a//b/c ==> a/b/c
    result = result.replace(/\/{2,}/g, "/");

    return result;
  },

  /** Bind event listener */
  on(event: string, handler: AnyFunc): typeof Router {
    emitter.on(event, handler);
    return Router;
  },

  /** Unbind event listener */
  off(event: string, handler?: AnyFunc): typeof Router {
    emitter.off(event, handler);
    return Router;
  },

  /** Fire event */
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
  ): typeof Router {
    emitter.fire(event, data, remove);
    return Router;
  },

  /**
   * Internal: bind routing events and beforeunload.
   * Called by Framework.boot().
   * In hash mode, listens to hashchange + popstate.
   * In history mode, listens to popstate only.
   */
  _bind(): void {
    defaultTitle = document.title;

    const getLocationKey = (): string => {
      if (routeMode === "history") {
        return globalThis.location.pathname + globalThis.location.search;
      }
      return Router.parse().srcHash;
    };

    let lastKey = getLocationKey();
    let suspend: string | number | undefined;

    const watchChange = (): void => {
      if (suspend) {
        return;
      }

      hrefCache.clear();

      const loc = Router.parse();
      const newKey = routeMode === "history" ? loc.srcQuery : loc.srcHash;

      if (newKey !== lastKey) {
        const changeEvent: {
          p?: number;
          reject: () => void;
          resolve: () => void;
          prevent: () => void;
        } = {
          p: 0,
          reject: () => {
            changeEvent.p = 1;
            suspend = "";
            updateBrowserUrl(lastKey);
          },
          resolve: () => {
            changeEvent.p = 1;
            lastKey = newKey;
            suspend = "";
            updateBrowserUrl(newKey);
            Router.diff();
          },
          prevent: () => {
            suspend = 1;
          },
        };

        Router.fire(RouterEvents.CHANGE, changeEvent);

        if (suspend || changeEvent.p) {
          return;
        }

        if (beforeEachGuards.length === 0) {
          changeEvent.resolve();
          return;
        }

        const from = lastLocation;
        const to = loc;
        const guards = beforeEachGuards.slice();
        let chain: Promise<boolean> = Promise.resolve(true);
        for (const guard of guards) {
          chain = chain.then((prev) => {
            if (prev === false) return false;
            return guard(to, from);
          });
        }
        chain.then(
          (result) => {
            if (changeEvent.p) return;
            if (result === false) {
              changeEvent.reject();
            } else {
              changeEvent.resolve();
            }
          },
          () => {
            if (!changeEvent.p) changeEvent.reject();
          },
        );
      }
    };

    Router.notify = watchChange;

    if (routeMode === "history") {
      globalThis.addEventListener("popstate", watchChange as EventListener);
    } else {
      globalThis.addEventListener("hashchange", watchChange as EventListener);
      globalThis.addEventListener("popstate", watchChange as EventListener);
    }
    globalThis.addEventListener(
      "beforeunload",
      (domEvent: BeforeUnloadEvent) => {
        const data: Record<string, unknown> = {};
        Router.fire(RouterEvents.PAGE_UNLOAD, data);
        const msg = data["msg"];
        if (msg) {
          domEvent.returnValue = msg as string;
        }
      },
    );

    Router.diff();
  },

  /**
   * Internal: set framework config for route resolution.
   */
  _setConfig(cfg: FrameworkConfig): void {
    frameworkConfig = cfg;
    routeMode = cfg.routeMode || "history";
  },
};

/**
 * Mark the Router as booted (called by `Framework.boot`).
 *
 * After boot, `parse()` starts attaching `view`/`path` to `Location` objects
 * via `attachViewAndPath`.
 */
export function markRouterBooted(): void {
  booted = true;
}
