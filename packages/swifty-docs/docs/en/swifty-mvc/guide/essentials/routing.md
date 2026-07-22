---
title: Routing
description: Client-side routing with history and hash modes, two-phase change confirmation, and navigation guards.
---

# Routing {#routing}

Swifty MVC includes a built-in router that supports both history mode (clean URLs via `pushState`) and hash mode (fragment-based URLs). The Router uses a two-phase change confirmation protocol that enables navigation guards — letting you intercept, delay, or cancel navigation before the URL is committed.

## Configuration {#configuration}

Routing is configured during `Framework.boot`:

```ts
Framework.boot({
  routeMode: "history", // or 'hash'
  routes: {
    "/": "home",
    "/about": "about",
    "/users/:id": "user-detail",
  },
  defaultView: "home",
  defaultPath: "/",
  unmatchedView: "not-found",
  hashbang: "#!", // hash mode only
});
```

| Option          | Type                     | Default     | Description                         |
| --------------- | ------------------------ | ----------- | ----------------------------------- |
| `routeMode`     | `"history" \| "hash"`    | `"history"` | URL routing strategy                |
| `routes`        | `Record<string, string>` | `{}`        | Path-to-view mapping                |
| `defaultView`   | `string`                 | —           | View to mount when no route matches |
| `defaultPath`   | `string`                 | `"/"`       | Default path when URL is empty      |
| `unmatchedView` | `string`                 | —           | View for unmatched routes (404)     |
| `hashbang`      | `string`                 | `"#!"`      | Hash prefix for hash mode           |
| `rewrite`       | `Function`               | —           | Transform path before route lookup  |

## History mode {#history-mode}

History mode uses the browser's History API for clean URLs:

```
https://example.com/about
https://example.com/users/42
```

Navigation is performed via `history.pushState` and `history.replaceState`. The Router listens for `popstate` events to handle browser back/forward navigation.

```ts
Router.to("/about"); // pushState to /about
Router.to("/about", null, true); // replaceState to /about
```

## Hash mode {#hash-mode}

Hash mode encodes the path in the URL fragment:

```
https://example.com/#!/about
https://example.com/#!/users/42
```

The Router listens for both `hashchange` and `popstate` events. The hash prefix is configurable:

```ts
Framework.boot({
  routeMode: "hash",
  hashbang: "#!/", // default is '#!'
});
```

## Navigation {#navigation}

### Router.to {#router-to}

The primary navigation method:

```ts
Router.to(path); // navigate to path
Router.to(path, params); // navigate with query parameters
Router.to(path, params, true); // replace instead of push
Router.to(path, params, false, true); // silent — do not trigger change detection
Router.to(params); // update query parameters only
```

When `path` is a string, it is treated as a URL path. When it is a plain object, it updates only the query parameters while preserving the current path.

### Declarative navigation {#declarative-navigation}

Use the `data-swifty-nav` attribute on anchor elements to enable client-side navigation without JavaScript:

```html
<a href="/about" data-swifty-nav>About</a>
<a href="/users/42" data-swifty-nav>User 42</a>
```

The Router intercepts clicks on these links and performs client-side navigation.

## URL parsing {#url-parsing}

`Router.parse(href?)` parses a URL into a structured `Location` object:

```ts
const loc = Router.parse(); // parse current URL
// loc.href     -> full URL
// loc.srcQuery -> raw query string
// loc.srcHash  -> raw hash string
// loc.path     -> '/users/42' (optional)
// loc.query    -> ParsedUri { path: '...', params: { tab: 'settings' } }
// loc.hash     -> ParsedUri { path: '...', params: { section: 'profile' } }
// loc.params   -> merged query + hash parameters
// loc.view     -> matched view name (optional)
// loc.get('tab') -> 'settings'
// loc.get('tab', 'general') -> 'general' (default if missing)
```

The parse result is cached by href. The cache is cleared on every change detection cycle to ensure freshness.

### Location diffing {#location-diffing}

`Router.diff()` compares the current location against the previous one and returns a `LocationDiff`:

```ts
const diff = Router.diff();
// diff.changed  -> boolean, whether anything changed
// diff.force    -> boolean
// diff.params   -> Record<string, ParamDiff> (each ParamDiff has { from, to })
// diff.path     -> ParamDiff { from, to } | undefined
// diff.view     -> ParamDiff { from, to } | undefined
```

If the locations differ and the change was not silent, `Router.diff()` fires the `RouterEvents.CHANGED` (`'changed'`) event, which triggers the framework's dispatcher to re-render affected views.

## Two-phase change confirmation {#two-phase-change-confirmation}

The Router does not immediately commit URL changes. Instead, it uses a protocol that allows listeners and guards to intercept, delay, or cancel navigation:

### Phase 1: Change detection {#phase-1}

When the URL changes (via `pushState`, `popstate`, or `hashchange`), the Router:

1. Captures the new URL
2. Creates a `changeEvent` with three control methods:
   - `resolve()` — commit the navigation
   - `reject()` — revert the URL to the previous value
   - `prevent()` — suspend navigation (the URL changes but no view update occurs)
3. Fires the `RouterEvents.CHANGE` (`'change'`) event (which is preventable)

### Phase 2: Guard evaluation {#phase-2}

If no `RouterEvents.CHANGE` listener handled the event, the Router evaluates `beforeEachGuards`:

```ts
const unsubscribe = Router.beforeEach(async (to, from) => {
  // Return false or throw to abort navigation
  if (!isAuthenticated() && to.path !== "/login") {
    Router.to("/login");
    return false;
  }
});
```

Guards are chained sequentially. If any guard returns `false` or throws, the navigation is rejected and the URL is reverted. If all guards pass (or there are no guards), the navigation is resolved.

### Resolution {#resolution}

When `resolve()` is called:

1. The browser URL is updated (`pushState` or `hash` assignment)
2. `Router.diff()` compares the new and previous locations
3. If changed, the `RouterEvents.CHANGED` (`'changed'`) event fires
4. The framework's dispatcher walks the Frame tree and re-renders views that observed the changed keys

## Navigation guards {#navigation-guards}

### beforeEach {#before-each}

Register a global navigation guard that runs before every route change:

```ts
const off = Router.beforeEach(async (to, from) => {
  // to: the target Location
  // from: the current Location

  // Return false to abort
  if (to.path === "/admin" && !isAdmin()) {
    return false;
  }

  // Throw to abort
  if (to.path === "/restricted") {
    throw new Error("Access denied");
  }

  // Return nothing (or true) to allow
});

// Unsubscribe later
off();
```

### leaveTip (unsaved changes) {#leave-tip}

Views can register unsaved-changes guards that prevent navigation when the user has unsaved work:

```ts
export default defineView((ctx) => {
  const [getDirty] = useState("dirty", false);

  ctx.leaveTip("You have unsaved changes. Leave anyway?", () => getDirty());

  return { template };
});
```

When the condition function returns `true`:

- Router `RouterEvents.CHANGE` (`'change'`) event: calls `prevent()` and `resolve()` — the URL changes but no view update occurs. The user sees a confirmation dialog.
- `beforeunload` event: the browser shows its native "leave page?" dialog.

The guard is automatically cleaned up when the view is destroyed.

## Route rewriting {#route-rewriting}

The `rewrite` option transforms the path before route lookup:

```ts
Framework.boot({
  routes: {
    "/dashboard": "dashboard",
    "/settings": "settings",
  },
  rewrite(path, params, routes) {
    // Strip locale prefix
    const match = path.match(/^\/([a-z]{2})(\/.*)?$/);
    if (match && match[2]) {
      return match[2];
    }
    return path;
  },
});
```

## Router events {#router-events}

The Router fires three events during navigation:

| Event                      | String value    | Description                                                                                                    |
| -------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| `RouterEvents.CHANGE`      | `'change'`      | Fired when a URL change is detected. Preventable — listeners can call `reject()`, `resolve()`, or `prevent()`. |
| `RouterEvents.CHANGED`     | `'changed'`     | Fired after navigation is committed. Carries the `LocationDiff`.                                               |
| `RouterEvents.PAGE_UNLOAD` | `'page_unload'` | Fired on `beforeunload`.                                                                                       |

```ts
Router.on(RouterEvents.CHANGED, (diff) => {
  console.log("Navigated to:", diff.path?.to);
  console.log("Has changes:", diff.changed);
});
```

## Observing route changes in views {#observing-routes}

Views declare which URL parameters they react to using `observeLocation`:

```ts
export default defineView((ctx) => {
  ctx.observeLocation("id,tab");

  // The view re-renders automatically when
  // the 'id' or 'tab' URL parameters change

  return {
    template: '<div>User {{=Router.parse().get("id")}}</div>',
  };
});
```

For path-based observation:

```ts
ctx.observeLocation("path");
// Re-renders when the URL path changes
```

## Path utilities {#path-utilities}

### Router.join {#router-join}

Normalize path segments:

```ts
Router.join("/users", "42", "settings");
// -> '/users/42/settings'

Router.join("/users/42", "..", "99");
// -> '/users/99'
```

## Advanced: Route view config {#route-view-config}

Route values can be objects instead of strings, providing additional metadata:

```ts
Framework.boot({
  routes: {
    "/dashboard": {
      view: "dashboard",
      title: "Dashboard",
    },
  },
});
```

When a route matches, the extra properties are merged into the `Location` object, making them accessible via `Router.parse()`.

## Next steps {#next-steps}

- [State Management](/docs/en/swifty-mvc/guide/essentials/state) — cross-view data with State and Store
- [Hooks](/docs/en/swifty-mvc/guide/essentials/hooks) — useState, useEffect, useStore
- [Micro-Frontends](/docs/en/swifty-mvc/guide/advanced/micro-frontends) — routing across micro-frontend boundaries
