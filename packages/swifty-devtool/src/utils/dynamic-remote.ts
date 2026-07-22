/**
 * Dynamic remote loader for Module Federation.
 *
 * Dual-strategy loading:
 *   1. Primary: @module-federation/runtime loadRemote() — supports both
 *      Webpack (var) and Vite (ESM) remote entries.
 *   2. Fallback: Webpack-style <script> injection + window[name] — for
 *      environments where the MF runtime is unavailable.
 */

import { loadRemote, init, registerRemotes } from "@module-federation/runtime";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RemoteContainer {
  init: (shareScope: unknown) => Promise<void>;
  get: (module: string) => unknown;
}

declare const __webpack_init_sharing__: (shareScope: string) => Promise<void>;
declare const __webpack_share_scopes__: Record<string, unknown>;

// ---------------------------------------------------------------------------
// Container name extraction
// ---------------------------------------------------------------------------

/** Track loaded containers to avoid duplicate injection */
const loadedContainers = new Map<string, RemoteContainer>();

/** Track MF runtime-initialized containers (loadRemote strategy) */
const loadedViaRuntime = new Map<string, Record<string, unknown>>();

/** Track whether MF runtime has been initialized */
let runtimeInitialized = false;

/**
 * Extract the container name from a remoteEntry.js URL.
 * Convention: the container name is the last path segment before "remoteEntry.js".
 * e.g., http://localhost:3300/cdn/swifty-demo/remoteEntry.js → "swifty_demo"
 */
function extractContainerName(url: string): string {
  const parts = new URL(url).pathname.replace(/\/$/, "").split("/");
  const dir = parts[parts.length - 2] ?? parts[parts.length - 1] ?? "remote";
  return dir.replace(/-/g, "_");
}

/**
 * Derive the federation remote name from the container URL.
 * Used for loadRemote() calls: "swifty_demo/counter-view"
 */
function extractRemoteName(url: string): string {
  const parts = new URL(url).pathname.replace(/\/$/, "").split("/");
  const dir = parts[parts.length - 2] ?? "remote";
  return dir.replace(/-/g, "_");
}

// ---------------------------------------------------------------------------
// Strategy helpers
// ---------------------------------------------------------------------------

const isObject = (val: unknown): val is object =>
  typeof val === "object" && val !== null;

const isPromise = (val: unknown): val is Promise<unknown> =>
  isObject(val) && "then" in val && typeof val.then === "function";

async function resolveFactory(val: unknown): Promise<unknown> {
  if (typeof val === "function") {
    return resolveFactory(await val());
  }
  if (isPromise(val)) {
    return resolveFactory(await val);
  }
  return val;
}

function unwrapDefault(mod: unknown): unknown {
  if (!isObject(mod)) return mod;
  const rec = mod as Record<string, unknown>;
  if (!("default" in rec)) return mod;
  const nonDefault = Object.keys(rec).filter(
    (k) => k !== "default" && k !== "__esModule",
  );
  if (nonDefault.length === 0 && rec["default"] != null) {
    return unwrapDefault(rec["default"]);
  }
  return mod;
}

async function resolveModule<T>(
  container: RemoteContainer,
  moduleName: string,
  containerName: string,
): Promise<T> {
  const result = container.get(moduleName);

  if (result == null) {
    throw new Error(
      `Module "${moduleName}" not found in container "${containerName}". ` +
        `Check the remote's exposes config.`,
    );
  }

  const module = await resolveFactory(result);
  return unwrapDefault(module) as T;
}

// ---------------------------------------------------------------------------
// Strategy 1: @module-federation/runtime loadRemote()
// ---------------------------------------------------------------------------

function ensureRuntimeInitialized() {
  if (runtimeInitialized) return;
  init({
    name: "host",
    remotes: [],
  });
  runtimeInitialized = true;
}

/**
 * Load a remote module using @module-federation/runtime.
 * Supports both Webpack (var) and Vite (ESM) remote entries.
 */
async function loadViaRuntime<T>(
  containerUrl: string,
  moduleName: string,
): Promise<T> {
  ensureRuntimeInitialized();

  const remoteName = extractRemoteName(containerUrl);
  const fullModuleId = `${remoteName}/${moduleName.replace(/^\.\//, "")}`;

  // Register the remote module configuration first
  registerRemotes([
    {
      name: remoteName,
      entry: containerUrl,
    },
  ]);

  // Then load the module using just the module ID
  const mod = await loadRemote(fullModuleId);

  if (mod == null) {
    throw new Error(
      `loadRemote returned null/undefined for "${fullModuleId}" from ${containerUrl}`,
    );
  }

  // loadRemote may return the module directly or a namespace
  const resolved = unwrapDefault(mod);

  // Cache the result
  loadedViaRuntime.set(containerUrl, resolved as Record<string, unknown>);

  return resolved as T;
}

// ---------------------------------------------------------------------------
// Strategy 2: Dynamic import() for ESM remote entries (Vite)
// ---------------------------------------------------------------------------

/** Track ESM-loaded containers */
const loadedViaEsm = new Map<string, RemoteContainer>();

async function loadViaEsmImport<T>(
  containerUrl: string,
  moduleName: string,
): Promise<T> {
  // Check cache first
  const cached = loadedViaEsm.get(containerUrl);
  if (cached !== undefined) {
    return resolveModule<T>(
      cached,
      moduleName,
      extractContainerName(containerUrl),
    );
  }

  // Dynamic import the ESM remoteEntry.js
  // Vite builds produce: export { init, get }
  const container = (await import(
    /* @vite-ignore */ /* webpackIgnore: true */ containerUrl
  )) as RemoteContainer;

  if (
    typeof container.init !== "function" ||
    typeof container.get !== "function"
  ) {
    throw new Error(
      `ESM remoteEntry at ${containerUrl} does not export valid { init, get }. ` +
        `Found keys: [${Object.keys(container).join(", ")}]`,
    );
  }

  // Initialize shared scope — use MF runtime's share scope if available,
  // otherwise pass an empty scope (Vite remotes handle this gracefully).
  try {
    if (typeof __webpack_init_sharing__ === "function") {
      await __webpack_init_sharing__("default");
      await container.init(__webpack_share_scopes__["default"]);
    } else {
      // Vite host: pass empty shared scope, the remote's init handles it
      await container.init({});
    }
  } catch (initError) {
    console.warn(
      `[dynamic-remote] Container init warning (may be non-fatal):`,
      initError,
    );
  }

  loadedViaEsm.set(containerUrl, container);

  return resolveModule<T>(
    container,
    moduleName,
    extractContainerName(containerUrl),
  );
}

// ---------------------------------------------------------------------------
// Strategy 3: Webpack-style <script> injection + window[name]
// ---------------------------------------------------------------------------

async function loadViaScriptInjection<T>(
  containerUrl: string,
  moduleName: string,
): Promise<T> {
  // Check cache first
  const cached = loadedContainers.get(containerUrl);
  if (cached !== undefined) {
    return resolveModule<T>(
      cached,
      moduleName,
      extractContainerName(containerUrl),
    );
  }

  const containerName = extractContainerName(containerUrl);

  await new Promise<void>((resolve, reject) => {
    const existing = Reflect.get(window, containerName);
    if (
      existing !== undefined &&
      typeof Reflect.get(existing, "get") === "function"
    ) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = containerUrl;
    script.type = "text/javascript";
    script.async = true;

    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error(`Failed to load remote entry: ${containerUrl}`));

    document.head.appendChild(script);
  });

  const container = Reflect.get(window, containerName) as RemoteContainer;
  if (container === undefined) {
    throw new Error(
      `Container "${containerName}" not found on window after loading ${containerUrl}`,
    );
  }

  if (
    typeof container.get !== "function" ||
    typeof container.init !== "function"
  ) {
    throw new Error(
      `"${containerName}" on window is not a valid MF container. ` +
        `Expected { init, get } but found: ${Object.keys(container).join(", ")}`,
    );
  }

  // Initialize shared scope
  await __webpack_init_sharing__("default");
  await container.init(__webpack_share_scopes__["default"]);

  loadedContainers.set(containerUrl, container);

  return resolveModule<T>(container, moduleName, containerName);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a remote Module Federation container from a CDN URL.
 *
 * Strategy:
 *   1. Try @module-federation/runtime loadRemote() — works with both
 *      Webpack and Vite remote entries (ESM + var).
 *   2. Try dynamic import() for ESM remote entries — for Vite-built
 *      remotes that export { init, get }.
 *   3. Fall back to Webpack-style <script> injection — for legacy var-type
 *      remotes that register on window[name].
 *
 * @param containerUrl - Full URL to the remoteEntry.js file
 * @param moduleName   - The exposed module path (e.g., "./counter-view")
 * @returns The remote module's exports
 */
export async function loadRemoteFromCdn<T = unknown>(
  containerUrl: string,
  moduleName: string,
): Promise<T> {
  // Check runtime cache first
  const runtimeCached = loadedViaRuntime.get(containerUrl);
  if (runtimeCached !== undefined) {
    const key = moduleName.replace(/^\.\//, "");
    if (key in runtimeCached) {
      return runtimeCached[key] as T;
    }
  }

  // Strategy 1: @module-federation/runtime
  try {
    return await loadViaRuntime<T>(containerUrl, moduleName);
  } catch (runtimeError) {
    console.warn(
      `[dynamic-remote] Strategy 1 (loadRemote) failed, trying ESM import:`,
      runtimeError,
    );
  }

  // Strategy 2: Dynamic import() for ESM remote entries
  try {
    return await loadViaEsmImport<T>(containerUrl, moduleName);
  } catch (esmError) {
    console.warn(
      `[dynamic-remote] Strategy 2 (ESM import) failed, trying <script> injection:`,
      esmError,
    );
  }

  // Strategy 3: Webpack-style <script> injection
  return loadViaScriptInjection<T>(containerUrl, moduleName);
}

/**
 * Clear the cached remote container.
 * Useful for hot-reloading during development.
 */
export function clearRemoteCache(containerUrl?: string): void {
  if (containerUrl !== undefined) {
    loadedContainers.delete(containerUrl);
    loadedViaRuntime.delete(containerUrl);
    loadedViaEsm.delete(containerUrl);
  } else {
    loadedContainers.clear();
    loadedViaRuntime.clear();
    loadedViaEsm.clear();
  }
}
