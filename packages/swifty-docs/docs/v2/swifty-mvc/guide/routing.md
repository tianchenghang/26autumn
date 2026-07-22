# Routing

Swifty ships with a built-in router that supports both HTML5 history mode and hash mode, declarative route mapping, asynchronous navigation guards, and a two-phase change protocol that lets any part of the application pause, reject, or commit a pending navigation. The router is a singleton exposed through `Framework.Router` and is available as soon as `Framework.boot()` completes.

## Overview

Routing in Swifty is designed around three ideas:

- The URL is the single source of truth for which view is mounted.
- Navigation is a two-phase transaction, not an imperative function call.
- Views observe the router rather than being pushed updates.

Every navigation attempt passes through a `change` event (where listeners can reject or suspend the transition), then through a chain of `beforeEach` guards, and finally through a `changed` event that triggers view remounting. This design makes it possible to show confirmation dialogs, validate authentication, or fetch route-level data before the URL actually changes.

## Two Routing Modes {#modes}

The router operates in one of two modes, selected via the `routeMode` field in the configuration passed to `Framework.boot()`.

### History Mode (default) {#history-mode}

History mode uses `history.pushState` and `history.replaceState` to produce clean URLs such as `/users/42?tab=posts`. The browser back button fires a `popstate` event, which the router listens to for change detection. Because `pushState` does not emit any event, programmatic navigation manually triggers change detection through `Router.notify()`.

```js
import { Framework } from "swifty-mvc";

Framework.boot({
  rootId: "app",
  routeMode: "history",
  routes: {
    "/": "app/views/home",
    "/users": "app/views/users",
    "/user-detail": "app/views/user-detail",
  },
});
```

Note that swifty-mvc routes are exact path mappings: `Record<string, string | RouteViewConfig>`. The router does not support parameterized route patterns like `:id` in the routes config. URL parameters are passed via query strings (e.g., `/user-detail?id=42`) rather than path segments.

History mode requires the web server to serve the same HTML shell for every route path. A typical static-server configuration rewrites all requests to `index.html`.

### Hash Mode {#hash-mode}

Hash mode stores the route after a `#!` prefix in the URL fragment, producing addresses like `https://example.com/#!/users/42?tab=posts`. The fragment never reaches the server, so hash mode works without any server-side rewrite configuration.

```js
Framework.boot({
  rootId: "app",
  routeMode: "hash",
  hashbang: "#!",
  routes: {
    "/": "app/views/home",
    "/users": "app/views/users",
  },
});
```

In hash mode the router listens to both `hashchange` and `popstate`. The `hashbang` option defaults to `#!` and is rarely changed, but it can be overridden to match legacy URL schemes.

### Choosing a Mode {#choosing-mode}

History mode is preferred for new applications because it produces URLs that are indistinguishable from server-rendered pages and integrates naturally with analytics, deep linking, and server-side rendering. Hash mode is useful when the application is hosted on a static file server that cannot be configured to rewrite paths, or when the application is embedded as a widget inside another page.

## Configuration {#configuration}

All routing options are passed to `Framework.boot()` as part of the `FrameworkConfig` object.

### routeMode {#config-route-mode}

```js
Framework.boot({
  routeMode: "history", // or "hash"
});
```

Selects the routing mode. Defaults to `"history"`.

### defaultPath {#config-default-path}

```js
Framework.boot({
  defaultPath: "/home",
});
```

The path the router falls back to when the URL does not contain one. In history mode, if a visitor lands on `/` and no route is registered for `/`, the router redirects to `defaultPath`. The default value is `"/"`.

### defaultView {#config-default-view}

```js
Framework.boot({
  defaultView: "app/views/home",
});
```

The view to render when no route matches and `unmatchedView` is not set. Acts as a last-resort view path.

### unmatchedView {#config-unmatched-view}

```js
Framework.boot({
  unmatchedView: "app/views/not-found",
});
```

The view rendered when the current path does not match any entry in `routes`. This is the canonical 404 page. It is preferred over `defaultView` for unmatched routes because it expresses intent clearly and keeps the default view as a true fallback.

### routes {#config-routes}

```js
Framework.boot({
  routes: {
    "/": "app/views/home",
    "/users": "app/views/users",
    "/user-detail": {
      view: "app/views/user-detail",
      title: "User Detail",
    },
    "/settings": {
      view: "app/views/settings",
      requiresAuth: true,
    },
  },
});
```

`routes` is a plain object mapping exact URL paths to view paths. Each value can be either a string (the view path) or a `RouteViewConfig` object. When a config object is used, the `view` field is required and every other field is merged into the `Location` object produced by `Router.parse()`. This is a convenient place to attach per-route metadata such as page titles, authentication flags, or analytics tags.

### rewrite {#config-rewrite}

```js
Framework.boot({
  rewrite(path, params, routes) {
    // Normalize trailing slashes
    if (path !== "/" && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    // Versioned API-style paths: /v2/users -> /users
    if (path.startsWith("/v2/")) {
      path = path.replace(/^\/v2/, "");
    }
    return path;
  },
  routes: {
    "/users": "app/views/users",
  },
});
```

`rewrite` is a function invoked during route resolution. It receives the raw path extracted from the URL, the merged params object, and the `routes` table. It must return the path that will actually be looked up in `routes`. This is the right place to normalize legacy paths, strip prefixes, or implement feature-flag-based redirects.

## Navigation {#navigation}

### Programmatic Navigation with Router.to {#router-to}

`Router.to` is the primary API for navigating from code. It accepts a path, a params object, or both.

```js
import { Framework } from "swifty-mvc";
const { Router } = Framework;

// Navigate to a new path with params
Router.to("/users", { page: 2, sort: "name" });

// Update params while keeping the current path
Router.to({ page: 3 });

// Pass a full URL string with embedded query
Router.to("/users?page=2&sort=name");

// Replace the current history entry instead of pushing a new one
Router.to("/login", {}, true);

// Silently update the URL without firing change events
Router.to("/draft", {}, false, true);
```

The signature is `Router.to(pathOrParams, params?, replace?, silent?)`. When the first argument is a string, it is treated as a path and the second argument is merged into the query params. When the first argument is an object, the current path is preserved and the object is merged into the existing params. The `replace` argument swaps `pushState` for `replaceState`. The `silent` argument updates the address bar without firing any router event, which is useful for cosmetic URL corrections.

### Declarative Navigation with data-swifty-nav {#declarative-nav}

Any anchor or button can be turned into a navigation trigger by adding the `data-swifty-nav` attribute. The router intercepts clicks on elements carrying this attribute and translates them into `Router.to` calls.

```html
<a href="/users?page=2" data-swifty-nav="true">Page 2</a>

<button data-swifty-nav="true" data-path="/settings" data-param-tab="profile">
  Profile Settings
</button>
```

Declarative navigation participates in the same two-phase protocol as programmatic navigation, so `change` listeners and `beforeEach` guards still run.

### Path Utilities {#path-utilities}

`Router.join` normalizes path segments, collapsing `./`, `../`, and duplicate slashes.

```js
Router.join("/a", "b", "./c", "../d");
// => "/a/b/d"

Router.join("/users", id, "posts");
// => "/users/42/posts"
```

`Framework.toUri` serializes a path and a params object into a URL string, which is handy for building `href` values in templates.

```js
const href = Framework.toUri("/users", { page: 2, sort: "name" });
// => "/users?page=2&sort=name"
```

## Two-Phase Change Protocol {#two-phase-protocol}

Every navigation goes through two distinct phases. This design separates the question "should this navigation happen?" from the question "the navigation has happened, react to it."

### Phase 1: The change Event {#change-event}

The `change` event fires before the URL is committed. Listeners receive an event object with three control methods:

```js
Router.on("change", (e) => {
  const loc = Router.parse();
  if (loc.path === "/checkout" && !isAuthenticated()) {
    e.reject(); // Revert the URL, abort navigation
    Router.to("/login");
    return;
  }
  if (hasUnsavedChanges()) {
    e.prevent(); // Pause the navigation
    showConfirmDialog({
      onConfirm: () => e.resolve(), // Commit
      onCancel: () => e.reject(), // Revert
    });
  }
  // If neither reject(), prevent(), nor resolve() is called,
  // the router calls resolve() automatically.
});
```

- `e.reject()` reverts the address bar to the previous URL and aborts the navigation entirely.
- `e.prevent()` suspends the navigation without reverting the URL. The router waits for another listener (or an async callback) to call `e.resolve()` or `e.reject()` later.
- `e.resolve()` commits the navigation immediately.

If no listener touches the event object, the router resolves by default.

### beforeEach Guards {#before-each-guards}

`beforeEach` registers asynchronous guards that run after the `change` event has been resolved (or immediately if no `change` listener intervened). Guards execute in registration order, sequentially. Each guard receives the target and origin `Location` objects and may return a boolean or a `Promise<boolean>`.

```js
const unsubscribe = Router.beforeEach(async (to, from) => {
  // Redirect unauthenticated users away from protected routes
  if (to.path?.startsWith("/admin") && !isAuthenticated()) {
    Router.to("/login");
    return false; // abort the original navigation
  }
  return true;
});

// Remove the guard when no longer needed
unsubscribe();
```

A guard that returns `false`, throws, or rejects aborts the navigation and the URL is reverted. Any other return value (including `undefined`) allows the navigation to proceed. Because guards run sequentially, an early guard can perform an async authentication check and a later guard can rely on the result.

```js
Router.beforeEach(async (to) => {
  await ensureUserSession();
  return true;
});

Router.beforeEach(async (to) => {
  // Guaranteed to have a valid session here
  return hasPermission(to.path);
});
```

### Phase 2: The changed Event {#changed-event}

Once the URL has been committed, the router fires the `changed` event. The payload is a `LocationDiff` object describing exactly what changed: which params differ, whether the path changed, and whether the view changed. The framework itself listens to this event to unmount the previous view and mount the new one.

```js
Router.on("changed", (diff) => {
  if (diff.path) {
    console.log("Path changed from", diff.path.from, "to", diff.path.to);
  }
  if (diff.view) {
    trackPageView(diff.view.to);
  }
  for (const [key, change] of Object.entries(diff.params)) {
    console.log(`Param ${key}: ${change.from} -> ${change.to}`);
  }
});
```

The `changed` event is the right place to fire analytics, scroll to top, or update document title. It is not preventable; the URL has already been committed.

### Protocol Summary {#protocol-summary}

The full sequence for a single navigation is:

1. The user clicks a link, the browser fires `popstate`/`hashchange`, or code calls `Router.to`.
2. The router parses the new URL and compares it to the current location.
3. If the location is identical, the navigation is skipped.
4. Otherwise, a `change` event is fired. Listeners may call `reject()`, `prevent()`, or `resolve()`.
5. If `prevent()` was called, the router waits. If `reject()` was called, the URL is reverted and the navigation ends.
6. If the `change` event resolved (explicitly or by default), `beforeEach` guards run in order.
7. If any guard returns `false` or rejects, the URL is reverted and the navigation ends.
8. The URL is committed via `pushState` (or `replaceState`).
9. The `changed` event fires with the diff.
10. The framework unmounts the old view and mounts the new one.

## Location Object {#location-object}

`Router.parse()` returns a `Location` object that provides a fully structured view of the current URL.

```js
const loc = Router.parse();
```

### href {#location-href}

The full URL string that was parsed. Defaults to `window.location.href` when no argument is passed.

```js
loc.href;
// => "https://example.com/users?page=2#profile"
```

### srcQuery and srcHash {#location-src}

`srcQuery` is the portion of the URL before the hash (the pathname plus the query string in history mode, or everything before `#` in hash mode). `srcHash` is the portion after the hash, with the `#!` or `#` prefix stripped.

```js
loc.srcQuery;
// => "/users?page=2"

loc.srcHash;
// => "profile"
```

### query and hash {#location-query-hash}

Both are `ParsedUri` objects with a `path` field and a `params` field. `query` represents the parsed state of `srcQuery`; `hash` represents the parsed state of `srcHash`.

```js
loc.query.path;
// => "/users"

loc.query.params;
// => { page: "2" }

loc.hash.path;
// => "profile"

loc.hash.params;
// => {}
```

### params {#location-params}

`params` is a flat merge of `query.params` and `hash.params`. When the same key appears in both sections, the hash value wins.

```js
loc.params;
// => { page: "2" }
```

### view and path {#location-view-path}

`view` is the resolved view path that the framework will mount for this URL. `path` is the canonical route path after `rewrite` has been applied and the `routes` table has been consulted. Both fields are populated only after `Framework.boot()` has completed.

```js
loc.view;
// => "app/views/users"

loc.path;
// => "/users"
```

### get {#location-get}

`get(key, defaultValue?)` reads a single param by name with an optional fallback.

```js
loc.get("page");
// => "2"

loc.get("missing", "fallback");
// => "fallback"

loc.get("missing");
// => ""
```

## Router Events {#events}

The router emits three events, all accessible via `Router.on` and `Router.off`.

### change {#event-change}

Fires before a navigation is committed. Listeners can reject, prevent, or resolve the pending transition. See the two-phase protocol section above.

```js
Router.on("change", (e) => {
  if (formIsDirty) {
    e.prevent();
    openLeaveConfirm(e);
  }
});
```

### changed {#event-changed}

Fires after a navigation has been committed. The payload is the `LocationDiff` object. This is the canonical place to react to route transitions.

```js
Router.on("changed", (diff) => {
  if (diff.changed) {
    resetScrollPosition();
    sendAnalytics(diff);
  }
});
```

### page_unload {#event-page-unload}

Fires in response to the browser `beforeunload` event. Listeners can set a `msg` field on the event object to prompt the user before leaving.

```js
Router.on("page_unload", (e) => {
  if (hasUnsavedWork()) {
    e.msg = "You have unsaved changes. Leave anyway?";
  }
});
```

## Caching {#caching}

The router maintains two internal caches to keep route resolution cheap.

### hrefCache {#href-cache}

`hrefCache` stores `Location` objects keyed by `href`. Whenever `Router.parse()` is called with the same URL string twice, the second call returns the cached object without reparsing. The cache is cleared automatically every time a navigation begins, so stale entries never survive across route changes.

```js
// First call: parses the URL and builds the Location
const a = Router.parse("https://example.com/users?page=2");

// Second call: returns the same object reference
const b = Router.parse("https://example.com/users?page=2");

a === b;
// => true
```

### changedCache {#changed-cache}

`changedCache` stores the diff result for every `(oldHref, newHref)` pair. `Router.diff()` consults this cache so that repeated calls with the same two locations return the same diff object without re-comparing every param.

```js
// Internally, the router stores:
//   changedCache["oldHref\x1enewHref"] = { changed: true, diff: {...} }
```

Both caches are implementation details and do not require manual management. They are mentioned here so that consumers who inspect performance profiles understand why repeated `parse()` and `diff()` calls are essentially free.

## Route Rewrites {#route-rewrites}

The `rewrite` config option gives the application full control over path normalization. It runs after the raw path is extracted from the URL and before the `routes` table is consulted.

### Normalizing Legacy Paths {#normalize-legacy}

```js
Framework.boot({
  rewrite(path) {
    // /user/42 -> /users/42
    if (path.startsWith("/user/")) {
      return "/users" + path.slice(5);
    }
    return path;
  },
  routes: {
    "/user-detail": "app/views/user-detail",
  },
});
```

Note that swifty-mvc routes use query parameters rather than path parameters. To pass an ID to a detail view, navigate to `/user-detail?id=42` and read it via `Router.parse().get("id")` inside the view's setup function.

### Feature-Flag-Based Routing {#feature-flags}

```js
Framework.boot({
  rewrite(path, params, routes) {
    if (path === "/dashboard" && featureFlags.newDashboard) {
      return "/dashboard-v2";
    }
    return path;
  },
  routes: {
    "/dashboard": "app/views/dashboard-v1",
    "/dashboard-v2": "app/views/dashboard-v2",
  },
});
```

### Param-Aware Rewrites {#param-aware-rewrites}

The `params` argument lets the rewrite function route based on query or hash values.

```js
Framework.boot({
  rewrite(path, params) {
    if (path === "/search" && params.category === "images") {
      return "/search/images";
    }
    return path;
  },
  routes: {
    "/search": "app/views/search",
    "/search/images": "app/views/search-images",
  },
});
```

## Unmatched Routes {#unmatched-routes}

When the current path does not appear in the `routes` table and no `rewrite` rule produces a matching path, the router falls back to `unmatchedView`, then to `defaultView`, then to an empty view.

### Dedicated 404 View {#dedicated-404}

```js
Framework.boot({
  unmatchedView: "app/views/not-found",
  routes: {
    "/": "app/views/home",
    "/users": "app/views/users",
  },
});
```

The 404 view is a regular Swifty view and can read the attempted path from the location object to offer helpful suggestions.

```js
import { Framework, defineView } from "swifty-mvc";

export default defineView(function NotFoundView(ctx) {
  const loc = Framework.Router.parse();
  const attempted = loc.path;

  return {
    template(data) {
      return `
        <div class="not-found">
          <h1>Page not found</h1>
          <p>The path <code>{{=attempted}}</code> does not match any view.</p>
          <a href="/" data-swifty-nav="true">Return home</a>
        </div>
      `;
    },
  };
});
```

### Catch-All Routes {#catch-all}

An alternative to `unmatchedView` is to register a catch-all entry in `routes` using a wildcard-like path and handle the lookup inside the view. This approach is useful when the application needs to serve content for dynamically created paths (user slugs, CMS pages) that cannot be enumerated in the static route table.

```js
Framework.boot({
  rewrite(path, params, routes) {
    // If no explicit route matches, fall through to the catch-all
    if (!routes[path]) {
      return "/catch-all";
    }
    return path;
  },
  routes: {
    "/": "app/views/home",
    "/catch-all": "app/views/dynamic-page",
  },
});
```

## Best Practices {#best-practices}

### Centralize Route Definitions

Keep the `routes` table in a dedicated module and import it into the boot configuration. This makes route changes reviewable and keeps the boot file small.

```js
// routes.js
export const routes = {
  "/": "app/views/home",
  "/users": "app/views/users",
  "/user-detail": "app/views/user-detail",
};

export const unmatchedView = "app/views/not-found";

// main.js
import { routes, unmatchedView } from "./routes";
Framework.boot({ routes, unmatchedView });
```

### Keep Guards Focused

Each `beforeEach` guard should do exactly one thing. Compose multiple guards instead of writing a monolithic one.

```js
Router.beforeEach(ensureSession);
Router.beforeEach(checkPermissions);
Router.beforeEach(preloadRouteData);
```

### Use prevent() for Confirmation Dialogs

When the user might lose data, always use `e.prevent()` and resolve explicitly later. Never block the event loop with a synchronous `confirm()` call.

```js
Router.on("change", (e) => {
  if (hasUnsavedChanges()) {
    e.prevent();
    dialog.open({
      onConfirm: () => e.resolve(),
      onCancel: () => e.reject(),
    });
  }
});
```

### Prefer History Mode in New Applications

History mode produces URLs that behave like normal web pages. Hash mode should be reserved for cases where server configuration is impossible or where the application is embedded inside another page.

### Avoid Silent Navigation Except for Cosmetic Updates

The `silent` flag on `Router.to` skips the entire change protocol. Use it only for adjustments that do not change the visible state of the application, such as correcting the URL after a redirect.

```js
// Good: correcting a trailing slash
Router.to("/users", {}, true, true);

// Bad: silently navigating to a different view
Router.to("/admin", {}, false, true); // users will not see the admin view
```

### Clean Up Guards on View Destroy

`beforeEach` returns an unsubscribe function. Call it from the view's destroy handler to avoid leaking guards when views are remounted.

```js
export default defineView(function AdminView(ctx) {
  const unsubscribe = Router.beforeEach(async (to) => {
    if (to.path?.startsWith("/admin") && !isAdmin()) {
      return false;
    }
    return true;
  });

  ctx.on("destroy", unsubscribe);

  return { template: adminTemplate };
});
```

### Do Not Mutate the Location Object

`Router.parse()` returns cached objects. Mutating them corrupts subsequent reads from any other consumer. Treat the `Location` as read-only and derive new values by spreading or copying.

```js
// Bad
const loc = Router.parse();
loc.params.page = "3";

// Good
const loc = Router.parse();
Router.to({ ...loc.params, page: "3" });
```

### Listen to changed, Not change, for Analytics

Analytics should record transitions that actually happened. Bind tracking to the `changed` event so aborted navigations are never reported.

```js
Router.on("changed", (diff) => {
  if (diff.view) {
    analytics.track("page_view", { view: diff.view.to });
  }
});
```
