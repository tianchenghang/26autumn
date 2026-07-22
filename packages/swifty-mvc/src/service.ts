/**
 * Service: API request management with caching, deduplication, and queue.
 *
 * Functional factory style — no class, no this, no prototype.
 *
 * - createService(syncFn, cacheMax?, cacheBuffer?): creates a service type
 * - serviceApi.add(attrs): registers API endpoint metadata
 * - serviceApi.instance().all(attrs, done): fetch all, use cache when available
 * - serviceApi.instance().one(attrs, done): fetch all, callback on each completion
 * - serviceApi.instance().save(attrs, done): fetch all, skip cache (always request)
 * - enqueue/dequeue: task queue for sequential async operations
 * - destroy: cancel pending requests
 * - createPayload(data?): response wrapper with get/set
 */
import { SPLITTER } from "./common";
import { assign, funcWithTry, noop, generateId } from "./utils";
import { createCache } from "./cache";
import type { CacheApi } from "./types";
import { createEmitter } from "./event-emitter";
import type { EmitterApi } from "./types";
import type {
  AnyFunc,
  ServiceMetaEntry,
  PendingCacheEntry,
  PayloadApi,
} from "./types";

export type { PayloadApi } from "./types";
// ============================================================
// Payload: response wrapper (functional factory)
// ============================================================

/** Type guard: check if a value is a PayloadApi */
function isPayload(v: unknown): v is PayloadApi {
  if (v == null || typeof v !== "object") return false;
  return "data" in v && "get" in v;
}

/** Type guard: check if a value is a ServiceMetaEntry */
function isServiceMetaEntry(v: unknown): v is ServiceMetaEntry {
  if (v == null || typeof v !== "object") return false;
  return "name" in v && "url" in v;
}

/**
 * Create a `Payload` — a mutable wrapper around API response data.
 *
 * Payloads are the data carriers passed through the Service pipeline:
 * `before` hooks write to them, `syncFn` populates them, and `after` hooks
 * transform their contents before they reach view callbacks.
 *
 * @param data - Initial data object (defaults to `{}`)
 * @returns A `PayloadApi` with `get` / `set` / `data` / `cacheInfo`
 */
export function createPayload(data: Record<string, unknown> = {}): PayloadApi {
  const payloadData = data;

  function get<T = unknown>(key: string): T {
    // Generic retrieval from heterogeneous payload data — unavoidable cast
    return payloadData[key] as T;
  }

  function set(
    keyOrData: string | Record<string, unknown>,
    value?: unknown,
  ): PayloadApi {
    if (typeof keyOrData === "string") {
      payloadData[keyOrData] = value;
    } else {
      assign(payloadData, keyOrData);
    }
    return api;
  }

  const api: PayloadApi = { data: payloadData, get, set };
  return api;
}

// ============================================================
// Fetch flags
// ============================================================

const FETCH_FLAGS_ALL = 1;
const FETCH_FLAGS_ONE = 2;

// ============================================================
// Service internals (per-type closure state)
// ============================================================

interface ServiceInternals {
  metaList: Record<string, ServiceMetaEntry>;
  payloadCache: CacheApi<PayloadApi>;
  pendingCacheKeys: Record<string, PendingCacheEntry>;
  syncFn: (payload: PayloadApi, callback: () => void) => void;
  staticEmitter: EmitterApi;
}

// ============================================================
// Service instance API
// ============================================================

export interface ServiceInstance {
  id: string;
  busy: number;
  destroyed: number;
  emitter: EmitterApi;
  all(
    attrs:
      | string
      | Record<string, unknown>
      | (string | Record<string, unknown>)[],
    done: AnyFunc,
  ): ServiceInstance;
  one(
    attrs:
      | string
      | Record<string, unknown>
      | (string | Record<string, unknown>)[],
    done: AnyFunc,
  ): ServiceInstance;
  save(
    attrs:
      | string
      | Record<string, unknown>
      | (string | Record<string, unknown>)[],
    done: AnyFunc,
  ): ServiceInstance;
  enqueue(callback: AnyFunc): ServiceInstance;
  dequeue(...args: unknown[]): void;
  destroy(): void;
  on(event: string, handler: AnyFunc): ServiceInstance;
  off(event: string, handler?: AnyFunc): ServiceInstance;
  fire(event: string, data?: Record<string, unknown>): ServiceInstance;
}

// ============================================================
// Service type API (replaces Service class static methods)
// ============================================================

export interface ServiceApi {
  add(attrs: ServiceMetaEntry | ServiceMetaEntry[]): void;
  meta(attrs: string | Record<string, unknown>): ServiceMetaEntry;
  create(attrs: Record<string, unknown>): PayloadApi;
  get(
    attrs: Record<string, unknown>,
    createNew?: boolean,
  ): { entity: PayloadApi; needsUpdate: boolean };
  cached(attrs: Record<string, unknown>): PayloadApi | undefined;
  clear(names: string | string[]): void;
  on(event: string, handler: AnyFunc): void;
  off(event: string, handler?: AnyFunc): void;
  fire(event: string, data?: Record<string, unknown>): void;
  instance(): ServiceInstance;
}

// ============================================================
// createService — factory function
// ============================================================

/**
 * Create a Service type with a custom request function.
 *
 * The `syncFn` is the transport-agnostic request executor — typically a
 * `fetch` wrapper, but any function matching the signature works. Each call
 * creates independent closure state (`metaList`, `payloadCache`,
 * `pendingCacheKeys`), ensuring full isolation between different Service
 * types.
 *
 * @param syncFn - Request executor: `(payload, callback) => void`
 * @param cacheMax - Maximum cache entries before LFU eviction (default: 20)
 * @param cacheBuffer - Eviction batch size (default: 5)
 * @returns A `ServiceApi` with `add`, `instance`, `cached`, `clear`, etc.
 */
export function createService(
  syncFn: (payload: PayloadApi, callback: () => void) => void,
  cacheMax = 20,
  cacheBuffer = 5,
): ServiceApi {
  const metaList: Record<string, ServiceMetaEntry> = {};
  const payloadCache = createCache<PayloadApi>({
    maxSize: cacheMax,
    bufferSize: cacheBuffer,
  });
  const pendingCacheKeys: Record<string, PendingCacheEntry> = {};
  const staticEmitter = createEmitter();

  const internals: ServiceInternals = {
    metaList,
    payloadCache,
    pendingCacheKeys,
    syncFn,
    staticEmitter,
  };

  function add(attrs: ServiceMetaEntry | ServiceMetaEntry[]): void {
    if (!Array.isArray(attrs)) {
      attrs = [attrs];
    }
    for (const entry of attrs) {
      if (entry) {
        const name = entry.name;
        const cache = entry.cache;
        entry.cache = cache ? cache | 0 : 0;
        metaList[name] = entry;
      }
    }
  }

  function meta(attrs: string | Record<string, unknown>): ServiceMetaEntry {
    const name =
      typeof attrs === "string" ? attrs : String(attrs["name"] ?? "");
    const known = metaList[name];
    if (known) return known;
    // When attrs is a valid ServiceMetaEntry, return it as-is
    if (isServiceMetaEntry(attrs)) {
      return attrs;
    }
    // Fallback: construct a minimal meta entry from the string
    return { name, url: "" };
  }

  function create(attrs: Record<string, unknown>): PayloadApi {
    const m = meta(attrs);
    const cache = toCacheValue(attrs["cache"]) || m.cache || 0;
    const entity = createPayload();
    entity.set(m);
    entity.cacheInfo = {
      name: m.name,
      key: cache ? defaultCacheKey(m, attrs) : "",
      time: 0,
    };
    if (attrs !== null) {
      entity.set(attrs);
    }
    const before = m.before;
    if (typeof before === "function") {
      funcWithTry(before, [entity], entity, noop);
    }
    staticEmitter.fire("begin", { payload: entity });
    return entity;
  }

  function get(
    attrs: Record<string, unknown>,
    createNew?: boolean,
  ): { entity: PayloadApi; needsUpdate: boolean } {
    let entity: PayloadApi | undefined;
    let needsUpdate = false;
    if (!createNew) {
      entity = cached(attrs);
    }
    if (!entity) {
      entity = create(attrs);
      needsUpdate = true;
    }
    return { entity, needsUpdate };
  }

  function cached(attrs: Record<string, unknown>): PayloadApi | undefined {
    const m = meta(attrs);
    const cache = toCacheValue(attrs["cache"]) || m.cache || 0;
    let cacheKey = "";
    if (cache) {
      cacheKey = defaultCacheKey(m, attrs);
    }
    if (cacheKey) {
      const info = pendingCacheKeys[cacheKey];
      if (info) {
        const entity = info.entity;
        return isPayload(entity) ? entity : undefined;
      }
      const cachedPayload = payloadCache.get(cacheKey);
      if (cachedPayload && cachedPayload.cacheInfo) {
        if (Date.now() - cachedPayload.cacheInfo.time > cache) {
          payloadCache.del(cacheKey);
          return undefined;
        }
        return cachedPayload;
      }
    }
    return undefined;
  }

  function clear(names: string | string[]): void {
    const nameSet = new Set(
      (typeof names === "string" ? names : names.join(",")).split(","),
    );
    const keysToDelete: string[] = [];
    payloadCache.forEach((payload) => {
      const info = payload?.cacheInfo;
      if (info && info.key && nameSet.has(info.name)) {
        keysToDelete.push(info.key);
      }
    });
    for (const key of keysToDelete) {
      payloadCache.del(key);
    }
  }

  function on(event: string, handler: AnyFunc): void {
    staticEmitter.on(event, handler);
  }

  function off(event: string, handler?: AnyFunc): void {
    staticEmitter.off(event, handler);
  }

  function fire(event: string, data?: Record<string, unknown>): void {
    staticEmitter.fire(event, data);
  }

  function instance(): ServiceInstance {
    const id = generateId("service");
    const instEmitter = createEmitter();
    const taskQueue: AnyFunc[] = [];
    let prevArgs: unknown[] = [];

    // `busy` and `destroyed` live on the inst object itself (not as closure
    // variables) so that consumers can read `service.destroyed` / `service.busy`
    // and get the live value. The closure methods below mutate `inst.busy` /
    // `inst.destroyed` directly.

    function all(
      attrs:
        | string
        | Record<string, unknown>
        | (string | Record<string, unknown>)[],
      done: AnyFunc,
    ): ServiceInstance {
      serviceSend(inst, attrs, done, FETCH_FLAGS_ALL, false, internals);
      return inst;
    }

    function one(
      attrs:
        | string
        | Record<string, unknown>
        | (string | Record<string, unknown>)[],
      done: AnyFunc,
    ): ServiceInstance {
      serviceSend(inst, attrs, done, FETCH_FLAGS_ONE, false, internals);
      return inst;
    }

    function save(
      attrs:
        | string
        | Record<string, unknown>
        | (string | Record<string, unknown>)[],
      done: AnyFunc,
    ): ServiceInstance {
      serviceSend(inst, attrs, done, FETCH_FLAGS_ALL, true, internals);
      return inst;
    }

    function enqueue(callback: AnyFunc): ServiceInstance {
      if (!inst.destroyed) {
        taskQueue.push(callback);
        dequeue(...prevArgs);
      }
      return inst;
    }

    function dequeue(...args: unknown[]): void {
      if (!inst.busy && !inst.destroyed) {
        inst.busy = 1;
        setTimeout(() => {
          inst.busy = 0;
          if (!inst.destroyed) {
            const task = taskQueue.shift();
            if (task) {
              prevArgs = args;
              funcWithTry(task, args, inst, noop);
            }
          }
        }, 0);
      }
    }

    function destroy(): void {
      inst.destroyed = 1;
      taskQueue.length = 0;
    }

    function onInst(event: string, handler: AnyFunc): ServiceInstance {
      instEmitter.on(event, handler);
      return inst;
    }

    function offInst(event: string, handler?: AnyFunc): ServiceInstance {
      instEmitter.off(event, handler);
      return inst;
    }

    function fireInst(
      event: string,
      data?: Record<string, unknown>,
    ): ServiceInstance {
      instEmitter.fire(event, data);
      return inst;
    }

    const inst: ServiceInstance = {
      id,
      busy: 0,
      destroyed: 0,
      emitter: instEmitter,
      all,
      one,
      save,
      enqueue,
      dequeue,
      destroy,
      on: onInst,
      off: offInst,
      fire: fireInst,
    };

    return inst;
  }

  return { add, meta, create, get, cached, clear, on, off, fire, instance };
}

// ============================================================
// Internal helpers
// ============================================================

/** WeakMap cache for `JSON.stringify(meta)` — meta objects are stable references. */
const metaJsonCache = new WeakMap<ServiceMetaEntry, string>();

/**
 * Get the JSON string of a `ServiceMetaEntry`, cached per-meta-object.
 *
 * Caching avoids repeated `JSON.stringify` calls for the same meta on every
 * cache-key computation.
 */
function getMetaJson(meta: ServiceMetaEntry): string {
  let cached = metaJsonCache.get(meta);
  if (cached === undefined) {
    cached = JSON.stringify(meta);
    metaJsonCache.set(meta, cached);
  }
  return cached;
}

/**
 * Build the default cache key for a request: `JSON(attrs) + SPLITTER + JSON(meta)`.
 *
 * Combining both the endpoint metadata and the request attributes ensures
 * that different params or different endpoints produce different keys.
 */
function defaultCacheKey(
  meta: ServiceMetaEntry,
  attrs: Record<string, unknown>,
): string {
  return JSON.stringify(attrs) + SPLITTER + getMetaJson(meta);
}

/**
 * Coerce a cache config value to a numeric TTL (milliseconds).
 *
 * `true` is not supported here — callers should convert `true` to a default
 * TTL before calling. Returns `0` for non-numeric values (meaning no cache).
 */
function toCacheValue(v: unknown): number {
  if (typeof v === "number") return v | 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n | 0 : 0;
  }
  return 0;
}

/**
 * Core request dispatcher: fetch attributes, handle caching and deduplication.
 *
 * For each attribute entry in `attrs`:
 * 1. Resolve the payload via `getPayload` (cache hit → reuse, miss → create)
 * 2. If an identical request is in-flight (`pendingCacheKeys`), chain the
 *    callback — the single in-flight request will fan out to all waiters
 * 3. Otherwise, invoke `syncFn` to execute the request
 * 4. On completion: populate cache, fire `done`/`fail`/`end` events, and
 *    invoke the user callback (`all` or `one` mode)
 *
 * The `flag` parameter selects the callback style:
 * - `FETCH_FLAGS_ALL` — callback fires once with `(errors, p1, p2, ...)`
 * - `FETCH_FLAGS_ONE` — callback fires per-attribute with `(error, payload, isLast, index)`
 *
 * `save=true` skips the cache entirely (forces a fresh request).
 */
function serviceSend(
  service: ServiceInstance,
  attrs:
    | string
    | Record<string, unknown>
    | (string | Record<string, unknown>)[],
  done: AnyFunc,
  flag: number,
  save: boolean,
  internals: ServiceInternals,
): void {
  if (service.destroyed) return;
  if (service.busy) {
    const queued: AnyFunc = () =>
      serviceSend(service, attrs, done, flag, save, internals);
    service.enqueue(queued);
    return;
  }

  service.busy = 1;

  let attrList: (string | Record<string, unknown>)[];
  if (typeof attrs === "string") {
    attrList = [{ name: attrs }];
  } else if (Array.isArray(attrs)) {
    attrList = attrs;
  } else {
    attrList = [attrs];
  }

  const { syncFn, pendingCacheKeys, staticEmitter, payloadCache } = internals;
  let requestCount = 0;
  const total = attrList.length;
  const doneArr: unknown[] = new Array(total + 1);
  const errorArgs: unknown[] = [];

  const remoteComplete = (idx: number, error?: unknown): void => {
    const payload = doneArr[idx + 1];
    let newPayload = false;

    if (error) {
      errorArgs[idx] = error;
      staticEmitter.fire("fail", { payload, error });
    } else {
      newPayload = true;
      staticEmitter.fire("done", { payload });
    }

    if (!service.destroyed) {
      const finish = requestCount === total;
      if (finish) {
        service.busy = 0;
        if (flag === FETCH_FLAGS_ALL) {
          doneArr[0] = errorArgs;
          funcWithTry(done, doneArr, service, noop);
        }
      }
      if (flag === FETCH_FLAGS_ONE) {
        funcWithTry(done, [error ?? null, payload, finish, idx], service, noop);
      }
    }

    if (newPayload) {
      staticEmitter.fire("end", { payload, error });
    }
  };

  for (const attr of attrList) {
    if (!attr) continue;

    const attrObj: Record<string, unknown> =
      typeof attr === "string" ? { name: attr } : attr;
    const payloadInfo = internals
      ? getPayload(internals, attrObj, save)
      : { entity: createPayload(), needsUpdate: true };
    const payloadEntity = payloadInfo.entity;
    const cacheKey = payloadEntity.cacheInfo?.key ?? "";
    doneArr[requestCount + 1] = payloadEntity;
    const complete = remoteComplete.bind(null, requestCount++);

    if (cacheKey && pendingCacheKeys[cacheKey]) {
      pendingCacheKeys[cacheKey].push(complete);
    } else if (payloadInfo.needsUpdate) {
      if (cacheKey) {
        const cacheList: PendingCacheEntry = [complete];
        cacheList.entity = payloadEntity;
        pendingCacheKeys[cacheKey] = cacheList;

        const cacheComplete = (): void => {
          const list = pendingCacheKeys[cacheKey];
          const entity = list.entity;
          if (isPayload(entity) && entity.cacheInfo) {
            entity.cacheInfo.time = Date.now();
            payloadCache.set(cacheKey, entity);
          }
          Reflect.deleteProperty(pendingCacheKeys, cacheKey);
          for (const cb of list) {
            if (typeof cb === "function") cb();
          }
        };

        syncFn(payloadEntity, cacheComplete);
      } else {
        syncFn(payloadEntity, complete);
      }
    } else {
      complete();
    }
  }
}

/**
 * Get-or-create a `Payload` for the given request attributes.
 *
 * Cache resolution order:
 * 1. In-flight (`pendingCacheKeys`) — reuse the pending payload entity
 * 2. Cache hit (`payloadCache`) — reuse if within TTL, otherwise evict
 * 3. Miss — create a new payload, run `before` hook, fire `begin` event
 *
 * @returns `{ entity, needsUpdate }` where `needsUpdate=true` means the
 *   payload is fresh and `syncFn` must be called to populate it
 */
function getPayload(
  internals: ServiceInternals,
  attrs: Record<string, unknown>,
  createNew?: boolean,
): { entity: PayloadApi; needsUpdate: boolean } {
  const metaList = internals.metaList;
  const name = String(attrs["name"] ?? "");
  const known = metaList[name];
  const m: ServiceMetaEntry =
    known ?? (isServiceMetaEntry(attrs) ? attrs : { name, url: "" });
  const cache = toCacheValue(attrs["cache"]) || m.cache || 0;
  let cacheKey = "";
  if (cache) {
    cacheKey = defaultCacheKey(m, attrs);
  }

  let entity: PayloadApi | undefined;
  let needsUpdate = false;

  if (!createNew && cacheKey) {
    const info = internals.pendingCacheKeys[cacheKey];
    if (info) {
      const e = info.entity;
      if (isPayload(e)) entity = e;
    }
    if (!entity) {
      const cachedPayload = internals.payloadCache.get(cacheKey);
      if (cachedPayload && cachedPayload.cacheInfo) {
        if (Date.now() - cachedPayload.cacheInfo.time > cache) {
          internals.payloadCache.del(cacheKey);
        } else {
          entity = cachedPayload;
        }
      }
    }
  }

  if (!entity) {
    entity = createPayload();
    entity.set(m);
    entity.cacheInfo = {
      name: m.name,
      key: cacheKey,
      time: 0,
    };
    if (attrs) entity.set(attrs);
    const before = m.before;
    if (typeof before === "function") {
      funcWithTry(before, [entity], entity, noop);
    }
    internals.staticEmitter.fire("begin", { payload: entity });
    needsUpdate = true;
  }

  return { entity, needsUpdate };
}
