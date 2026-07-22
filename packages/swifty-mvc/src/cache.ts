/**
 * LFU-style bounded cache with frequency-based eviction (functional factory).
 *
 * Entries are tracked in a flat array (`entries`) plus a `lookup` Map for
 * O(1) get/set. On `get`, the entry's frequency and last-access timestamp
 * are bumped. When capacity (`maxSize + bufferSize`) is exceeded, the
 * `bufferSize` worst entries are evicted in a single pass.
 *
 * Eviction uses single-pass partial selection (O(n·k)) instead of sorting the
 * entire array (O(n log n)). For the typical `bufferSize = 5`, this is
 * effectively a linear scan with at most 5 in-bucket comparisons per iteration.
 */
import { SPLITTER, nextCounter } from "./common";
import type { CacheEntry, CacheApi, CacheOptions } from "./types";

/** Sort comparator: higher frequency first, more recent access first */
function sortCacheEntries<T>(a: CacheEntry<T>, b: CacheEntry<T>): number {
  return b.frequency - a.frequency || b.lastTimestamp - a.lastTimestamp;
}

/**
 * Create an LFU-style bounded cache.
 *
 * @param options - Cache configuration
 * @returns A cache API object with `get`, `set`, `del`, `has`, `clear`, `forEach`, `size`.
 *
 * @example
 * const cache = createCache({ maxSize: 20, bufferSize: 5 });
 * cache.set('user', { name: 'Alice' });
 * const user = cache.get('user');
 * cache.has('user'); // true
 * cache.del('user');
 */
export function createCache<T = unknown>(
  options: CacheOptions<T> = {},
): CacheApi<T> {
  /** Cache entries array */
  let entries: CacheEntry<T>[] = [];

  /** Fast lookup: prefixed key -> entry */
  const lookup = new Map<string, CacheEntry<T>>();

  const maxSize = options.maxSize ?? 20;
  const bufferSize = options.bufferSize ?? 5;
  const capacity = maxSize + bufferSize;
  const onRemove = options.onRemove;
  const comparator = options.sortComparator ?? sortCacheEntries;

  /** Prefix a key with SPLITTER for namespace isolation */
  function prefixKey(key: string): string {
    return SPLITTER + key;
  }

  /** Read a value by key, bumping its frequency and timestamp on hit. */
  function get(key: string): T | undefined {
    const prefixedKey = prefixKey(key);
    const entry = lookup.get(prefixedKey);
    if (!entry) return undefined;
    entry.frequency++;
    entry.lastTimestamp = nextCounter();
    return entry.value;
  }

  /** Iterate over all cached values in insertion order. */
  function forEach(callback: (value: T | undefined) => void): void {
    for (const entry of entries) {
      callback(entry.value);
    }
  }

  /**
   * Store a value under `key`. If the key exists, updates the value and bumps
   * frequency. If the cache is at capacity, evicts the worst entries first.
   */
  function set(key: string, value: T): void {
    const prefixedKey = prefixKey(key);
    const existing = lookup.get(prefixedKey);

    if (existing) {
      existing.value = value;
      existing.frequency++;
      existing.lastTimestamp = nextCounter();
      return;
    }

    if (entries.length >= capacity) {
      evictEntries();
    }

    const entry: CacheEntry<T> = {
      originalKey: key,
      value,
      frequency: 1,
      lastTimestamp: nextCounter(),
    };
    entries.push(entry);
    lookup.set(prefixedKey, entry);
  }

  /**
   * Remove a key from the cache immediately. Fires `onRemove` if configured.
   */
  function del(key: string): void {
    const prefixedKey = prefixKey(key);
    const entry = lookup.get(prefixedKey);
    if (!entry) return;

    lookup.delete(prefixedKey);
    const idx = entries.indexOf(entry);
    if (idx !== -1) entries.splice(idx, 1);

    if (onRemove) {
      onRemove(key);
    }
  }

  /** Check whether a key exists in the cache (without bumping frequency). */
  function has(key: string): boolean {
    return lookup.has(prefixKey(key));
  }

  /**
   * Remove all entries, firing `onRemove` for each if configured.
   */
  function clear(): void {
    if (onRemove) {
      for (const entry of entries) {
        onRemove(entry.originalKey);
      }
    }
    entries = [];
    lookup.clear();
  }

  /**
   * Evict the `bufferSize` worst entries from the cache.
   *
   * Uses single-pass partial selection (O(n·k)) instead of sorting the entire
   * `entries` array (O(n log n)). For the typical `bufferSize = 5` this is
   * effectively a linear scan with at most 5 in-bucket comparisons per
   * iteration — and it avoids mutating the rest of `entries`.
   */
  function evictEntries(): void {
    if (bufferSize <= 0 || entries.length === 0) return;

    if (entries.length <= bufferSize) {
      // Fast path: evict everything.
      for (const e of entries) {
        lookup.delete(prefixKey(e.originalKey));
        if (onRemove) onRemove(e.originalKey);
      }
      entries = [];
      return;
    }

    // Maintain `worst` sorted so that worst[0] is the worst-of-worst and
    // worst[bufferSize-1] is the best-of-worst (the eviction "boundary").
    const worst: CacheEntry<T>[] = [];

    for (const entry of entries) {
      if (worst.length < bufferSize) {
        let i = worst.length;
        while (i > 0 && comparator(entry, worst[i - 1]) > 0) i--;
        worst.splice(i, 0, entry);
      } else if (comparator(entry, worst[bufferSize - 1]) > 0) {
        worst.pop(); // drop the best-of-worst
        let i = worst.length;
        while (i > 0 && comparator(entry, worst[i - 1]) > 0) i--;
        worst.splice(i, 0, entry);
      }
    }

    const evictSet = new Set(worst);
    for (const e of worst) {
      lookup.delete(prefixKey(e.originalKey));
      if (onRemove) onRemove(e.originalKey);
    }
    entries = entries.filter((e) => !evictSet.has(e));
  }

  /** Get the current number of cached entries. */
  function getSize(): number {
    return entries.length;
  }

  const api: CacheApi<T> = {
    get,
    set,
    del,
    has,
    clear,
    forEach,
    getSize,
  };
  return api;
}
