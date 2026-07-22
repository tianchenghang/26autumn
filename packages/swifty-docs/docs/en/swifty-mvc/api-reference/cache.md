---
title: Cache API
description: Complete API reference for createCache and LFU caching.
---

# Cache API {#cache-api}

The `createCache` function creates an LFU (Least Frequently Used) bounded cache with frequency-based eviction.

## createCache {#create-cache}

```ts
createCache<T>(options?: CacheOptions<T>): CacheApi<T>
```

Create an LFU bounded cache.

**Parameters:**

- `options` — cache configuration

**Returns:**

- `CacheApi<T>` — the cache instance

**Example:**

```ts
const cache = createCache({
  maxSize: 100,
  bufferSize: 20,
  onRemove: (key) => {
    console.log("Evicted:", key);
  },
});
```

## CacheOptions {#cache-options}

```ts
interface CacheOptions<T> {
  maxSize?: number;
  bufferSize?: number;
  onRemove?: (key: string) => void;
  sortComparator?: (a: CacheEntry<T>, b: CacheEntry<T>) => number;
}
```

| Field            | Type       | Default | Description                                                     |
| ---------------- | ---------- | ------- | --------------------------------------------------------------- |
| `maxSize`        | `number`   | `20`    | Maximum number of entries before eviction is triggered          |
| `bufferSize`     | `number`   | `5`     | Number of entries evicted per eviction pass                     |
| `onRemove`       | `Function` | —       | Callback when an entry is evicted or deleted (receives the key) |
| `sortComparator` | `Function` | —       | Custom sort for eviction order                                  |

## CacheApi {#cache-api-type}

### cache.get {#get}

```ts
cache.get(key: string): T | undefined
```

Retrieve a value by key. Increments the access frequency counter.

```ts
const value = cache.get("user-42");
```

### cache.set {#set}

```ts
cache.set(key: string, value: T): void
```

Store a value. If the cache exceeds capacity (`maxSize + bufferSize`), triggers eviction of the `bufferSize` worst entries.

```ts
cache.set("user-42", { name: "Alice", age: 30 });
```

### cache.del {#del}

```ts
cache.del(key: string): void
```

Remove a specific entry. Calls `onRemove` if configured.

```ts
cache.del("user-42");
```

### cache.has {#has}

```ts
cache.has(key: string): boolean
```

Check if a key exists in the cache.

```ts
if (cache.has("user-42")) {
  const user = cache.get("user-42");
}
```

### cache.clear {#clear}

```ts
cache.clear(): void
```

Remove all entries. Calls `onRemove` for each entry if configured.

```ts
cache.clear();
```

### cache.forEach {#for-each}

```ts
cache.forEach(callback: (value: T | undefined) => void): void
```

Iterate over all cached values. The callback receives only the value (not the key).

```ts
cache.forEach((value) => {
  console.log(value);
});
```

### cache.getSize {#get-size}

```ts
cache.getSize(): number
```

Returns the current number of entries.

```ts
console.log("Cache size:", cache.getSize());
```

## LFU eviction {#lfu-eviction}

The cache uses Least Frequently Used eviction:

1. Each `get` call increments the entry's frequency counter
2. When the cache reaches capacity (`maxSize + bufferSize`), the `bufferSize` entries with the lowest frequency are evicted
3. This brings the size back down to `maxSize`, avoiding thrashing by not evicting on every single insert

**Example:**

```ts
const cache = createCache({ maxSize: 3, bufferSize: 1 });

cache.set("a", 1);
cache.set("b", 2);
cache.set("c", 3);

cache.get("a"); // frequency: 2
cache.get("b"); // frequency: 2
cache.get("c"); // frequency: 2

cache.set("d", 4);
// Cache size: 4, reaches capacity (maxSize + bufferSize = 4)
// Evict bufferSize=1 worst entries
// 'a', 'b', 'c' all have frequency 2, 'd' has frequency 1
// 'd' is evicted (lowest frequency)
// Cache now has 3 entries: {a, b, c}
```

## Types {#types}

### CacheApi {#cache-api-interface}

```ts
interface CacheApi<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  del(key: string): void;
  has(key: string): boolean;
  clear(): void;
  forEach(callback: (value: T | undefined) => void): void;
  getSize(): number;
}
```

### CacheOptions {#cache-options-type}

```ts
interface CacheOptions<T> {
  maxSize?: number;
  bufferSize?: number;
  onRemove?: (key: string) => void;
  sortComparator?: (a: CacheEntry<T>, b: CacheEntry<T>) => number;
}
```

## Next steps {#next-steps}

- [Service guide](/docs/en/swifty-mvc/guide/essentials/service) — caching API responses
- [Performance guide](/docs/en/swifty-mvc/guide/advanced/performance) — cache sizing strategies
- [Framework API](/docs/en/swifty-mvc/api-reference/framework) — Framework.createCache
