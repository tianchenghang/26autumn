# Router API Reference

The Router module is the central routing engine of swifty-mvc. It manages URL parsing, programmatic navigation, navigation guards, and a two-phase change protocol. The module is exposed as a singleton through `Framework.Router` and is accompanied by a handful of standalone helper functions.

All exports listed on this page can be imported from `swifty-mvc`.

```typescript
import {
  Framework,
  Router,
  markRouterBooted,
  getRouteMode,
  useUrlState,
} from "swifty-mvc";
```

The `Router` object itself is also available as `Framework.Router` after `Framework.boot()` completes.

## Router.to

Navigate to a new URL programmatically. The call participates in the two-phase change protocol unless the `silent` flag is set.

```typescript
function to(
  pathOrParams: string | Record<string, unknown>,
  params?: Record<string, unknown>,
  replace?: boolean,
  silent?: boolean,
): void;
```

### Parameters

- `pathOrParams` - A path string (for example `"/users"`) or a params object. When a string is provided, the path portion of the URL is updated and the optional `params` argument is merged into the query. When an object is provided, the current path is preserved and the object is merged into the existing params.
- `params` - Query parameters to merge when the first argument is a path string. Ignored when `pathOrParams` is an object.
- `replace` - When `true`, the current history entry is replaced via `history.replaceState` instead of pushing a new entry. Defaults to `false`.
- `silent` - When `true`, the URL is updated without firing any router event. Useful for cosmetic URL corrections. Defaults to `false`.

### Examples

```typescript
const { Router } = Framework;

// Navigate to a new path with params
Router.to("/users", { page: 2, sort: "name" });

// Update params only, keep the current path
Router.to({ page: 3 });

// Pass a full path string with embedded query
Router.to("/users?page=2&sort=name");

// Replace the current history entry
Router.to("/login", {}, true);

// Silently update the URL without firing events
Router.to("/draft", {}, false, true);
```

### Behavior

- When `pathOrParams` is a string, it is parsed via the internal URI parser. The extracted path replaces the current path; the extracted query params are merged with the explicit `params` argument, with `params` taking precedence.
- When `pathOrParams` is an object, the current path is preserved and the object is merged into the existing params from the current location.
- In hash mode on browsers that lack `window.history`, existing query-only params are carried forward automatically to avoid losing state.
- In history mode, `pushState` does not fire a browser event. The router manually triggers change detection via `Router.notify()` after the URL update.
- In hash mode, setting `location.hash` fires `hashchange` automatically; no manual trigger is needed.

## Router.parse

Parse a URL string into a [Location](#location) object.

```typescript
function parse(href?: string): Location;
```

### Parameters

- `href` - The URL to parse. Defaults to `window.location.href`.

### Returns

A [Location](#location) object describing the parsed URL.

### Behavior

- Results are cached by `href`. Calling `parse()` with the same URL string twice returns the same object reference.
- The `view` and `path` fields on the returned `Location` are populated only after `Framework.boot()` has completed. Before boot, those fields are undefined.
- The cache is cleared automatically at the start of every navigation, so stale entries never survive across route changes.

```typescript
const loc = Router.parse();
loc.path; // "/users"
loc.view; // "app/views/users"
loc.params; // { page: "2" }
loc.get("page", "1"); // "2"
```

## Router.diff

Compute the diff between the current location and the previously recorded location.

```typescript
function diff(): LocationDiff | undefined;
```

### Returns

A [LocationDiff](#locationdiff) object describing what changed, or `undefined` if no navigation has occurred yet.

### Behavior

- Internally calls `Router.parse()` to get the current location, then compares it against the last known location.
- If the location changed and the router is not in silent mode, the `changed` event fires with the diff payload and `document.title` is reset to the default title when the path has changed.
- Results are cached by the pair `(oldHref, newHref)`, so repeated comparisons of the same two URLs are essentially free.

## Router.join

Normalize and join multiple path segments into a single path string.

```typescript
function join(...paths: string[]): string;
```

### Parameters

- `paths` - Path segments to join.

### Returns

A normalized path with `./`, `../`, and duplicate slashes resolved.

### Examples

```typescript
Router.join("/a", "b", "./c", "../d");
// => "/a/b/d"

Router.join("/users", "42", "posts");
// => "/users/42/posts"

Router.join("a//b/c");
// => "a/b/c"
```

## Router.beforeEach

Register an asynchronous navigation guard. Guards run after the `change` event has been resolved and before the URL is committed.

```typescript
function beforeEach(
  guard: (to: Location, from: Location) => boolean | Promise<boolean>,
): () => void;
```

### Parameters

- `guard` - A function invoked with the target and origin `Location` objects. It may return a boolean or a `Promise<boolean>`.

### Returns

An unsubscribe function that removes the guard when called.

### Guard Execution

- Guards execute in registration order, sequentially. Each guard receives the same `(to, from)` pair.
- A guard that returns `false`, throws, or rejects aborts the navigation. The URL is reverted to the previous value.
- A guard that returns `true`, `undefined`, or any other non-false value allows the navigation to proceed.
- Because guards run sequentially, an early guard can perform an async authentication check and a later guard can rely on the result.

### Examples

```typescript
const unsubscribe = Router.beforeEach(async (to, from) => {
  if (to.path?.startsWith("/admin") && !isAuthenticated()) {
    Router.to("/login");
    return false;
  }
  return true;
});

// Remove the guard when no longer needed
unsubscribe();
```

### Cleanup in Views

Always call the unsubscribe function when a view is destroyed to avoid leaking guards across remounts.

```typescript
export default defineView(function AdminView(ctx) {
  const off = Router.beforeEach(async (to) => {
    if (to.path?.startsWith("/admin") && !isAdmin()) return false;
    return true;
  });
  ctx.on("destroy", off);
  return { template: adminTemplate };
});
```

## Router.on

Bind a listener to a router event.

```typescript
function on(event: string, handler: (e?: any) => void): typeof Router;
```

### Parameters

- `event` - The event name. See [Router Events](#router-events) for the full list.
- `handler` - The callback to invoke when the event fires.

### Returns

The `Router` object, for chaining.

```typescript
Router.on("changed", (diff) => {
  if (diff.view) {
    analytics.track("page_view", { view: diff.view.to });
  }
});
```

## Router.off

Remove a listener from a router event.

```typescript
function off(event: string, handler?: Function): typeof Router;
```

### Parameters

- `event` - The event name.
- `handler` - The specific handler to remove. When omitted, all listeners for the event are removed.

### Returns

The `Router` object, for chaining.

```typescript
Router.off("changed", myHandler);

// Remove all listeners for the event
Router.off("change");
```

## Router.fire

Manually fire a router event.

```typescript
function fire(
  event: string,
  data?: Record<string, unknown>,
  remove?: boolean,
): typeof Router;
```

### Parameters

- `event` - The event name to fire.
- `data` - The payload object passed to listeners. Listeners may mutate this object to communicate back (for example, `page_unload` listeners set `data.msg`).
- `remove` - When `true`, all listeners for this event are removed after firing. Defaults to `false`.

### Returns

The `Router` object, for chaining.

### Notes

This method is used internally by the router to emit `change`, `changed`, and `page_unload` events. Application code rarely needs to call it directly, but it is available for custom integrations.

## Router Events

The router emits three events, all accessible via `Router.on` and `Router.off`.

### change

Fires before a navigation is committed. This is the first phase of the two-phase protocol.

```typescript
Router.on("change", (e) => {
  // e.reject()   - revert the URL, abort navigation
  // e.prevent()  - suspend navigation, wait for explicit resolve/reject
  // e.resolve()  - commit the navigation immediately
});
```

The event object carries three control methods:

- `e.reject()` - Reverts the address bar to the previous URL and aborts the navigation entirely.
- `e.prevent()` - Suspends the navigation without reverting the URL. The router waits for another listener or an async callback to call `e.resolve()` or `e.reject()`.
- `e.resolve()` - Commits the navigation immediately.

If no listener touches the event object, the router calls `resolve()` by default.

### changed

Fires after a navigation has been committed. The payload is a [LocationDiff](#locationdiff) object describing what changed.

```typescript
Router.on("changed", (diff) => {
  if (diff.changed) {
    resetScrollPosition();
    sendAnalytics(diff);
  }
  if (diff.view) {
    console.log("View changed:", diff.view.from, "->", diff.view.to);
  }
});
```

This event is not preventable. The URL has already been committed. Use it for analytics, scroll management, and document title updates.

### page_unload

Fires in response to the browser `beforeunload` event. Listeners can set a `msg` field on the event object to prompt the user before leaving.

```typescript
Router.on("page_unload", (e) => {
  if (hasUnsavedWork()) {
    e.msg = "You have unsaved changes. Leave anyway?";
  }
});
```

When `e.msg` is set to a non-empty string, the browser displays a confirmation dialog. The exact message shown depends on the browser; most modern browsers ignore the custom text and display a generic prompt.

## Location

The `Location` interface describes the result of parsing a URL with `Router.parse()`. It provides structured access to every component of the URL.

```typescript
interface Location {
  href: string;
  srcQuery: string;
  srcHash: string;
  query: ParsedUri;
  hash: ParsedUri;
  params: Record<string, string>;
  view?: string;
  path?: string;
  get(key: string, defaultValue?: string): string;
}
```

### href

The full URL string that was parsed. When `Router.parse()` is called without arguments, this is `window.location.href`.

```typescript
loc.href;
// => "https://example.com/users?page=2#profile"
```

### srcQuery

The portion of the URL before the hash. In history mode this is the pathname plus the query string. In hash mode this is everything before `#`.

```typescript
loc.srcQuery;
// => "/users?page=2"
```

### srcHash

The portion of the URL after the hash, with the `#!` or `#` prefix stripped.

```typescript
loc.srcHash;
// => "profile"
```

### query

A `ParsedUri` object representing the parsed state of `srcQuery`. Contains a `path` field and a `params` field.

```typescript
loc.query.path;
// => "/users"

loc.query.params;
// => { page: "2" }
```

### hash

A `ParsedUri` object representing the parsed state of `srcHash`.

```typescript
loc.hash.path;
// => "profile"

loc.hash.params;
// => {}
```

### params

A flat merge of `query.params` and `hash.params`. When the same key appears in both sections, the hash value takes precedence.

```typescript
loc.params;
// => { page: "2" }
```

### view

The resolved view path that the framework will mount for this URL. Populated only after `Framework.boot()` has completed.

```typescript
loc.view;
// => "app/views/users"
```

### path

The canonical route path after `rewrite` has been applied and the `routes` table has been consulted. Populated only after `Framework.boot()` has completed.

```typescript
loc.path;
// => "/users"
```

### get

Read a single parameter by name with an optional default value.

```typescript
loc.get("page");
// => "2"

loc.get("missing", "fallback");
// => "fallback"

loc.get("missing");
// => ""
```

## LocationDiff

The object returned by `Router.diff()` and passed as the payload of the `changed` event. Describes the transition between two routing states.

```typescript
interface LocationDiff {
  params: Record<string, ParamDiff>;
  path?: ParamDiff;
  view?: ParamDiff;
  force: boolean;
  changed: boolean;
}
```

### params

A record of every parameter that changed between the two locations. Each entry maps a parameter name to a `ParamDiff` describing the transition.

### path

Present when the route path has changed. Contains a `ParamDiff` with the previous and next path values.

### view

Present when the resolved view has changed. Contains a `ParamDiff` with the previous and next view paths.

### force

`true` on the first navigation during application initialization, when there is no previous location to compare against.

### changed

`true` when any part of the location has changed (params, path, or view).

## ParamDiff

A single parameter transition.

```typescript
interface ParamDiff {
  from: string;
  to: string;
}
```

### from

The value before the change. Empty string when the parameter did not exist previously.

### to

The value after the change. Empty string when the parameter has been removed.

## Caching

The router maintains two internal caches to keep route resolution and diff computation cheap.

### href Cache

The href cache stores `Location` objects keyed by the `href` string. Whenever `Router.parse()` is called with the same URL string twice, the second call returns the cached object without reparsing.

```typescript
const a = Router.parse("https://example.com/users?page=2");
const b = Router.parse("https://example.com/users?page=2");
a === b; // => true
```

The cache is cleared automatically at the start of every navigation. It is never exposed to application code and does not require manual management.

### changed Cache

The changed cache stores diff results keyed by the pair `(oldHref, newHref)` joined with an internal separator character. `Router.diff()` consults this cache so that repeated comparisons of the same two locations return the same diff object without recomputing every parameter.

Both caches are implementation details. They exist so that repeated `parse()` and `diff()` calls remain essentially free, which matters when multiple views and guards all call `Router.parse()` during the same navigation cycle.

## markRouterBooted

Mark the router as booted. Called internally by `Framework.boot()` after the framework configuration has been applied.

```typescript
function markRouterBooted(): void;
```

### Behavior

After this function is called, `Router.parse()` starts populating the `view` and `path` fields on the returned `Location` objects by consulting the `routes` table, `rewrite` function, `defaultView`, `unmatchedView`, and `defaultPath` from the framework configuration. Before boot, those fields remain undefined.

Application code rarely calls this function directly. It is exported for use by custom boot sequences and testing harnesses.

## getRouteMode

Return the current routing mode.

```typescript
function getRouteMode(): "history" | "hash";
```

### Returns

The string `"history"` or `"hash"`, reflecting the `routeMode` field passed to `Framework.boot()`. Defaults to `"history"` when no configuration has been applied.

### Example

```typescript
import { getRouteMode } from "swifty-mvc";

const mode = getRouteMode();
if (mode === "hash") {
  // Adjust behavior for hash-based routing
}
```

The value is set by `Router._setConfig()` during `Framework.boot()`.

## useUrlState

A view-level hook that synchronizes a slice of URL query parameters with view state.

```typescript
function useUrlState<S extends Record<string, string>>(
  view: ViewCtx,
  initialState?: S,
): [Readonly<S>, (patch: Partial<S> | ((prev: S) => Partial<S>)) => void];
```

### Parameters

- `view` - The view context object, typically `ctx` inside a `defineView` setup function. Used to register location observation and to tie lifecycle cleanup.
- `initialState` - Default values for each URL param key. Keys not present in the URL use these defaults. Keys present in the URL override them.

### Returns

A tuple `[state, setState]`:

- `state` - A read-only object with current values read from the URL, merged with the provided defaults.
- `setState` - A function to update URL params. Accepts a partial object or an updater function. Only the specified keys are changed; other URL params in the address bar are preserved.

### Behavior

- Internally calls `view.observeLocation(keys)` so the view re-renders whenever any of the tracked param keys change in the URL (via back/forward navigation or `Router.to`).
- `setState` delegates to `Router.to(resolved)`, so updates participate in the normal two-phase change protocol.
- Works with both history and hash routing modes.

### Example

```typescript
import { defineView, useUrlState } from "swifty-mvc";

export default defineView(function UserList(ctx) {
  const [state, setState] = useUrlState(ctx, { page: "1", size: "20" });

  ctx.updater.set({ page: state.page, size: state.size }).digest();

  return {
    template,
    events: {
      "nextPage<click>"() {
        setState((prev) => ({ page: String(Number(prev.page) + 1) }));
      },
      "prevPage<click>"() {
        setState((prev) => ({
          page: String(Math.max(1, Number(prev.page) - 1)),
        }));
      },
    },
  };
});
```

### Notes

- All values in the state object are strings, matching the URL parameter model. Numeric conversions must be done explicitly by the consumer.
- The hook reads from the URL on every render, so the state always reflects the current address bar. There is no hidden internal state to keep in sync.
