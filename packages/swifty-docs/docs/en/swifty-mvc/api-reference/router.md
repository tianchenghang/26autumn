---
title: Router API
description: Complete API reference for the Router singleton.
---

# Router API {#router-api}

The `Router` singleton manages client-side navigation, URL parsing, and route change detection. It supports both history mode (clean URLs) and hash mode (fragment-based URLs).

## Methods {#methods}

### Router.to {#to}

```ts
Router.to(pathOrParams: string | Record<string, string>, params?: Record<string, string>, replace?: boolean, silent?: boolean): void
```

Navigate to a new URL.

**Parameters:**

- `pathOrParams` — URL path (string) or query parameters (object)
- `params` — additional query parameters (when first arg is a path)
- `replace` — use `replaceState` instead of `pushState` (default: `false`)
- `silent` — do not trigger change detection (default: `false`)

**Examples:**

```ts
Router.to("/about");
Router.to("/users", { id: "42" });
Router.to("/settings", null, true); // replace
Router.to({ page: "2" }); // update query only
Router.to("/admin", null, false, true); // silent navigation
```

### Router.parse {#parse}

```ts
Router.parse(href?: string): Location
```

Parse a URL into a structured Location object. If `href` is omitted, parses the current URL.

**Returns:**

```ts
interface ParsedUri {
  path: string;
  params: Record<string, string>;
}

interface Location {
  href: string;
  srcQuery: string;
  srcHash: string;
  query: ParsedUri;
  hash: ParsedUri;
  params: Record<string, string>;
  view?: string;
  path?: string;
  get: (key: string, defaultValue?: string) => string;
}
```

**Example:**

```ts
const loc = Router.parse();
console.log(loc.path); // '/users/42'
console.log(loc.query.params); // { tab: 'settings' }
console.log(loc.hash.params); // { section: 'profile' }
console.log(loc.params); // merged query + hash
console.log(loc.get("tab")); // 'settings'
console.log(loc.get("missing", "default")); // 'default'
```

The parse result is cached by `href`. The cache is cleared on every change detection cycle.

### Router.diff {#diff}

```ts
Router.diff(): LocationDiff | undefined
```

Compare the current location against the previous one. Returns `undefined` if unchanged.

**Returns:**

```ts
interface ParamDiff {
  from: string;
  to: string;
}

interface LocationDiff {
  params: Record<string, ParamDiff>;
  path?: ParamDiff;
  view?: ParamDiff;
  force: boolean;
  changed: boolean;
}
```

If the locations differ and the change was not silent, `Router.diff()` fires the `CHANGED` event.

### Router.join {#join}

```ts
Router.join(...paths: string[]): string
```

Normalize path segments, resolving `..` and `.`:

```ts
Router.join("/users", "42", "settings");
// -> '/users/42/settings'

Router.join("/users/42", "..", "99");
// -> '/users/99'
```

### Router.beforeEach {#before-each}

```ts
Router.beforeEach(guard: (to: Location, from: Location) => boolean | void | Promise<boolean | void>): () => void
```

Register a global navigation guard. Guards run sequentially before navigation commits.

**Parameters:**

- `guard` — async function that receives target and current locations

**Returns:**

- Unsubscribe function

**Behavior:**

- Return `false` or throw to abort navigation
- Return nothing or `true` to allow navigation

**Example:**

```ts
const off = Router.beforeEach(async (to, from) => {
  if (to.path === "/admin" && !isAdmin()) {
    return false; // abort
  }
});

// Later:
off(); // unsubscribe
```

### Router.on / Router.off / Router.fire {#events}

```ts
Router.on(event: string, handler: Function): void
Router.off(event: string, handler?: Function): void
Router.fire(event: string, data?: unknown): void
```

Event emitter methods for Router events.

## Events {#events}

### CHANGE {#change-event}

Fired when a URL change is detected. Preventable — listeners can call `reject()`, `resolve()`, or `prevent()` on the event object.

```ts
Router.on("change", (event) => {
  if (hasUnsavedChanges()) {
    event.prevent();
    event.resolve();
    // Show confirmation dialog
  }
});
```

### CHANGED {#changed-event}

Fired after navigation is committed. Carries the `LocationDiff`.

```ts
Router.on("changed", (diff) => {
  console.log("Changed:", diff.changed);
  if (diff.path) {
    console.log("Path:", diff.path.from, "->", diff.path.to);
  }
});
```

### PAGE_UNLOAD {#page-unload-event}

Fired on `beforeunload`.

```ts
Router.on("page_unload", () => {
  // Cleanup before page unload
});
```

## Types {#types}

### Location {#location-type}

```ts
interface ParsedUri {
  path: string;
  params: Record<string, string>;
}

interface Location {
  href: string;
  srcQuery: string;
  srcHash: string;
  query: ParsedUri;
  hash: ParsedUri;
  params: Record<string, string>;
  view?: string;
  path?: string;
  get: (key: string, defaultValue?: string) => string;
}
```

### LocationDiff {#location-diff-type}

```ts
interface ParamDiff {
  from: string;
  to: string;
}

interface LocationDiff {
  params: Record<string, ParamDiff>;
  path?: ParamDiff;
  view?: ParamDiff;
  force: boolean;
  changed: boolean;
}
```

### RouterEvents {#router-events-type}

```ts
const ROUTER_EVENTS: {
  CHANGE: "change";
  CHANGED: "changed";
  PAGE_UNLOAD: "page_unload";
};
```

## Internal methods {#internal-methods}

These methods are used internally by the framework and should not be called directly:

### Router.\_bind {#bind}

```ts
Router._bind(): void
```

Bind `popstate`/`hashchange` and `beforeunload` listeners. Called by `Framework.boot`.

### Router.\_setConfig {#set-config}

```ts
Router._setConfig(config: Partial<FrameworkConfig>): void
```

Set Router configuration. Called by `Framework.boot`.

### Router.notify {#notify}

```ts
Router.notify?: () => void
```

Trigger change detection. Set by `_bind` and called after `pushState` (which does not fire a browser event).

## Constants {#constants}

### getRouteMode {#get-route-mode}

```ts
getRouteMode(): 'history' | 'hash'
```

Returns the current routing mode.

### markRouterBooted {#mark-router-booted}

```ts
markRouterBooted(): void
```

Marks the Router as booted. Called by `Framework.boot`.

## Next steps {#next-steps}

- [Routing guide](/docs/en/swifty-mvc/guide/essentials/routing) — navigation and guards
- [Framework API](/docs/en/swifty-mvc/api-reference/framework) — boot and configuration
- [State API](/docs/en/swifty-mvc/api-reference/state) — cross-view observable data
