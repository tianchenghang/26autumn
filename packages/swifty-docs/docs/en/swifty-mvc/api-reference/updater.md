---
title: Updater API
description: Complete API reference for the per-view data binding and digest engine.
---

# Updater API {#updater-api}

Each view has its own `UpdaterApi` instance that manages view-local data and triggers re-renders.

## createUpdater {#create-updater}

```ts
createUpdater(viewId: string): UpdaterApi
```

Factory function that creates an Updater for a view. Called internally by `createCtx`.

**Parameters:**

- `viewId` — the view's unique identifier

**Returns:**

- `UpdaterApi` instance

## UpdaterApi {#updater-api-type}

### updater.get {#get}

```ts
updater.get<T>(key?: string): T
```

Read a single key or the entire data object.

```ts
const count = updater.get("count");
const allData = updater.get();
```

### updater.set {#set}

```ts
updater.set(data: Record<string, unknown>, excludes?: ReadonlySet<string>): UpdaterApi
```

Shallow-merge data into the updater. Returns the Updater for chaining.

**Parameters:**

- `data` — object to merge
- `excludes` — set of keys to skip during change detection

**Example:**

```ts
updater.set({ count: 42, name: "Alice" });
updater.set({ loading: false }, new Set(["loading"])); // exclude 'loading' from change tracking
```

### updater.digest {#digest}

```ts
updater.digest(
  data?: Record<string, unknown>,
  excludes?: ReadonlySet<string>,
  callback?: () => void
): void
```

Optionally set data, then trigger a re-render if any tracked keys changed.

**Parameters:**

- `data` — optional data to set before digesting
- `excludes` — set of keys to exclude from change detection
- `callback` — optional callback after render

**Example:**

```ts
updater.digest({ count: 43 });
// Sets count, checks for changes, re-renders if changed

updater.set({ name: "Bob" });
updater.digest();
// Digests previously set data
```

**Re-entrant digest:**
If `digest` is called during an ongoing digest, the new call is queued and executed after the current one completes.

### updater.forceDigest {#force-digest}

```ts
updater.forceDigest(): void
```

Mark all current keys as changed and force a re-render. Used internally by HMR.

### updater.snapshot {#snapshot}

```ts
updater.snapshot(): UpdaterApi
```

Record the current `version` counter. Returns the Updater for chaining.

### updater.altered {#altered}

```ts
updater.altered(): boolean | undefined
```

Check if the version has changed since the last snapshot.

**Returns:**

- `true` — version changed since snapshot
- `false` — version unchanged
- `undefined` — snapshot never called

### updater.refData {#ref-data}

```ts
updater.refData: Record<string, unknown>
```

Reference lookup table for `{{@expr}}` template expressions. Stores non-serializable values (objects, functions, arrays).

**Example:**

```ts
updater.refData[updater.SPLITTER + "1"] = { complex: "object" };
// Template: {{@"1"}} resolves to { complex: 'object' }
```

### updater.translate {#translate}

```ts
updater.translate(data: Record<string, unknown>): unknown
```

Resolve a SPLITTER-prefixed ref token to its original JavaScript value.

### updater.parse {#parse}

```ts
updater.parse(expr: string): unknown
```

Safe dotted-path resolver on `refData`. Supports numeric literals and `a.b.c` paths.

**Example:**

```ts
updater.refData.user = { name: "Alice", age: 30 };
updater.parse("user.name"); // -> 'Alice'
updater.parse("42"); // -> 42
```

### updater.getChangedKeys {#get-changed-keys}

```ts
updater.getChangedKeys(): ReadonlySet<string>
```

Returns the set of keys that changed since the last render.

### updater.SPLITTER {#splitter}

```ts
updater.SPLITTER: string
```

The SPLITTER constant (`\x1e`, U+001E Record Separator). Used for refData keys.

### updater.data {#data}

```ts
updater.data: Record<string, unknown>
```

The raw data object. Initial value: `{ vId: viewId }`.

### updater.version {#version}

```ts
updater.version: number
```

Monotonically increasing counter that increments on every `set` that changes data.

## Types {#types}

### UpdaterApi {#updater-api-interface}

```ts
interface UpdaterApi {
  get<T>(key?: string): T;
  set(
    data: Record<string, unknown>,
    excludes?: ReadonlySet<string>,
  ): UpdaterApi;
  digest(
    data?: Record<string, unknown>,
    excludes?: ReadonlySet<string>,
    callback?: () => void,
  ): void;
  forceDigest(): void;
  snapshot(): UpdaterApi;
  altered(): boolean | undefined;
  refData: Record<string, unknown>;
  translate(data: Record<string, unknown>): unknown;
  parse(expr: string): unknown;
  getChangedKeys(): ReadonlySet<string>;
  SPLITTER: string;
  data: Record<string, unknown>;
  version: number;
}
```

## Next steps {#next-steps}

- [Views guide](/docs/en/swifty-mvc/guide/essentials/views) — using the updater in views
- [Hooks guide](/docs/en/swifty-mvc/guide/essentials/hooks) — useState wraps the updater
- [Template Syntax](/docs/en/swifty-mvc/guide/essentials/template-syntax) — reference data with {{@expr}}
