# Framework API Reference {#framework-api-reference}

This page documents the complete API surface of the `Framework` object, the main entry point for booting and configuring a swifty-mvc application. The Framework object provides lifecycle management, configuration access, utility methods, and factory functions for creating framework primitives.

## FrameworkConfig {#frameworkconfig}

The configuration object passed to `Framework.boot()`. All properties are optional unless marked as required.

```ts
interface FrameworkConfig {
  rootId: string;
  routeMode?: "history" | "hash";
  defaultView?: string;
  defaultPath?: string;
  routes?: Record<string, string | { view: string; title?: string }>;
  rewrite?: (
    path: string,
    params: Record<string, string>,
    routes: Record<string, string>,
  ) => string;
  unmatchedView?: string;
  hashbang?: string;
  error?: (error: Error) => void;
  extensions?: string[];
  initModule?: string;
  require?: (
    names: string[],
    params?: Record<string, unknown>,
  ) => Promise<unknown[]> | undefined;
  skipViewRendered?: boolean;
  projectName?: string;
  vdom?: boolean;
  devtool?: boolean;
}
```

### Details {#frameworkconfig-details}

The FrameworkConfig interface defines all configurable options for a swifty-mvc application. The framework merges this configuration during `boot()` and makes it accessible via `Framework.getConfig()`.

**rootId** (required) specifies the DOM element ID where the root view mounts. This property is required in the type definition. The element must exist in the HTML before booting.

**defaultView** is the view path loaded when the URL is empty or matches no route. Typically points to a home or landing page view.

**defaultPath** is the URL path used when the hash is empty in hash-based routing mode. Defaults to `"/"`.

**routes** maps URL paths to view paths. Values can be either a string (view path) or an object with `view` and optional `title` properties. The framework uses this map to resolve which view to render for a given URL.

**rewrite** is a function that transforms URL paths before route matching. Useful for implementing URL aliases, redirects, or path normalization. Receives the original path, the parsed parameters, and the routes map, then returns the rewritten path.

**unmatchedView** specifies the view path rendered when no route matches the current URL. Typically points to a 404 or not-found view.

**hashbang** is the prefix used in hash-based routing mode. Defaults to `"#!"`. Only relevant when using hash routing instead of history routing.

**error** is a global error handler invoked when the framework catches exceptions during view rendering, route transitions, or other internal operations. Receives the Error object. Use this to implement logging, error reporting, or user-facing error messages.

**extensions** is an array of view paths loaded and initialized before the application boots. Useful for registering global services, plugins, or middleware.

**initModule** is a module path loaded and executed after extensions but before the root view mounts. The module's default export should be a function that receives the Framework object.

**require** is a custom module loader function for dynamically importing view modules. Receives an array of module names and optional parameters, and returns a Promise resolving to an array of module exports, or `undefined` to signal that the default dynamic import fallback should be used. Integrate with bundlers like Webpack Module Federation or implement custom loading strategies.

**skipViewRendered** disables the automatic re-render check that prevents duplicate renders when state changes rapidly. Set to `true` for manual render control.

**projectName** identifies the current project in micro-frontend scenarios. Used by Module Federation to distinguish local views from remote views.

**vdom** enables virtual DOM mode instead of string-based DOM diffing. Defaults to `false`. Virtual DOM mode provides better performance for complex UIs with frequent updates but increases bundle size.

**devtool** enables the Frame Devtool Bridge for browser extension integration. Defaults to `true`. Set to `false` to suppress the bridge in environments where the extension is not available or causes issues.

### Example {#frameworkconfig-example}

```ts
import { Framework } from "swifty-mvc";

Framework.boot({
  rootId: "app",
  defaultView: "app/views/home",
  routes: {
    "/home": "app/views/home",
    "/list": "app/views/list",
    "/detail": { view: "app/views/detail", title: "Detail Page" },
  },
  rewrite: (path) => {
    // Redirect /old-path to /new-path
    if (path === "/old-path") return "/new-path";
    return path;
  },
  unmatchedView: "app/views/404",
  error: (error) => {
    console.error("Framework error:", error);
    // Send to error tracking service
  },
  extensions: ["app/extensions/analytics"],
  initModule: "app/init",
  projectName: "my-app",
  vdom: false,
  devtool: true,
});
```

### See Also {#frameworkconfig-see-also}

- [Framework.boot()](#framework-boot) - Boots the framework with configuration
- [Framework.getConfig()](#framework-getconfig) - Reads framework configuration
- [Framework.setConfig()](#framework-setconfig) - Updates framework configuration

## Framework.boot(cfg) {#framework-boot}

Boots the framework with the provided configuration, initializes the router and state modules, creates the root frame, and mounts the default view.

```ts
function boot(cfg: FrameworkConfig): void;
```

### Details {#framework-boot-details}

`boot()` is the main entry point for starting a swifty-mvc application. It performs the following initialization sequence:

1. Merges the provided configuration into the framework's internal config
2. Configures the Router module with routing settings
3. Binds the event delegator to the frame tree
4. Registers change listeners on Router and State to notify views of updates
5. Marks the framework as booted
6. Installs the Frame Devtool Bridge if `devtool` is enabled
7. Creates the root frame using the `rootId` from configuration
8. Binds the router to listen for URL changes (hashchange or popstate)
9. Mounts the default view if no view is already mounted

The function must be called exactly once per application lifecycle. Calling `boot()` multiple times has no effect after the first call.

### Example {#framework-boot-example}

```ts
import { Framework } from "swifty-mvc";

// Boot with full configuration
Framework.boot({
  rootId: "app",
  defaultView: "app/views/home",
  routes: {
    "/home": "app/views/home",
    "/about": "app/views/about",
  },
  error: (err) => console.error(err),
});

// Boot with minimal configuration (uses defaults)
Framework.boot({
  rootId: "app",
  defaultView: "app/views/home",
});
```

### See Also {#framework-boot-see-also}

- [FrameworkConfig](#frameworkconfig) - Configuration options
- [Framework.isBooted()](#framework-isbooted) - Checks if framework has booted
- [Framework.Router](#framework-router) - Router module reference

## Framework.getConfig() {#framework-getconfig}

Reads framework configuration. Returns the complete config object when called without arguments, or a specific config value when called with a key.

```ts
function getConfig(): FrameworkConfig;
function getConfig<T = unknown>(key: string): T | undefined;
```

### Details {#framework-getconfig-details}

`getConfig()` is a pure read operation that does not mutate state. It provides access to the merged configuration that was established during `boot()` and any subsequent updates made via `setConfig()`.

The single-argument overload uses a generic type parameter to allow type-safe access to specific configuration values. When the key does not exist in the configuration, the function returns `undefined`.

This function is commonly used by views, services, and extensions to read framework settings such as `projectName`, `vdom` mode, or custom configuration properties added via `setConfig()`.

### Example {#framework-getconfig-example}

```ts
import { Framework } from "swifty-mvc";

// Get complete configuration
const config = Framework.getConfig();
console.log(config.rootId); // "app"
console.log(config.projectName); // "my-app"

// Get specific configuration value
const rootId = Framework.getConfig<string>("rootId");
console.log(rootId); // "app"

// Get custom configuration added via setConfig
const apiUrl = Framework.getConfig<string>("apiUrl");
console.log(apiUrl); // "https://api.example.com"

// Type-safe access with generic
interface CustomConfig {
  timeout: number;
  retries: number;
}
const custom = Framework.getConfig<CustomConfig>("requestConfig");
console.log(custom?.timeout); // 5000
```

### See Also {#framework-getconfig-see-also}

- [Framework.setConfig()](#framework-setconfig) - Updates framework configuration
- [FrameworkConfig](#frameworkconfig) - Configuration interface definition
- [Framework.boot()](#framework-boot) - Initial configuration during boot

## Framework.setConfig(patch) {#framework-setconfig}

Merges a patch object into the framework configuration and returns the merged configuration.

```ts
function setConfig<T extends object = Partial<FrameworkConfig>>(
  patch: Partial<FrameworkConfig> & T,
): FrameworkConfig & T;
```

### Details {#framework-setconfig-details}

`setConfig()` performs a shallow merge of the provided patch into the existing configuration. Only properties present in the patch object are updated; existing properties not mentioned in the patch remain unchanged.

The function returns the merged configuration object, allowing immediate access to the updated values. The generic type parameter `T` enables type-safe extension of the base `FrameworkConfig` interface with custom properties.

This function is commonly used to add runtime configuration, update settings based on environment detection, or inject dependencies after boot. Changes made via `setConfig()` are immediately visible to subsequent `getConfig()` calls but do not trigger re-renders or notifications to views.

### Example {#framework-setconfig-example}

```ts
import { Framework } from "swifty-mvc";

// Update existing configuration
Framework.setConfig({
  error: (err) => {
    console.error("Updated error handler:", err);
    // Send to monitoring service
  },
});

// Add custom configuration properties
Framework.setConfig({
  apiUrl: "https://api.example.com",
  requestTimeout: 5000,
  enableAnalytics: true,
});

// Type-safe custom configuration
interface AppConfig {
  apiUrl: string;
  requestTimeout: number;
  enableAnalytics: boolean;
}

const updated = Framework.setConfig<AppConfig>({
  apiUrl: "https://api.example.com",
  requestTimeout: 5000,
  enableAnalytics: true,
});

console.log(updated.apiUrl); // "https://api.example.com"
console.log(updated.requestTimeout); // 5000

// Access custom config later
const apiUrl = Framework.getConfig<string>("apiUrl");
```

### See Also {#framework-setconfig-see-also}

- [Framework.getConfig()](#framework-getconfig) - Reads framework configuration
- [FrameworkConfig](#frameworkconfig) - Configuration interface definition
- [Framework.boot()](#framework-boot) - Initial configuration during boot

## Framework.isBooted() {#framework-isbooted}

Returns whether the framework has been booted.

```ts
function isBooted(): boolean;
```

### Details {#framework-isbooted-details}

`isBooted()` returns `true` after `Framework.boot()` has been called and completed its initialization sequence. Before boot, or if boot was never called, it returns `false`.

This function is useful for conditional logic that should only execute after the framework is fully initialized, such as accessing the Router or State modules, or performing operations that depend on the root frame existing.

### Example {#framework-isbooted-example}

```ts
import { Framework } from "swifty-mvc";

console.log(Framework.isBooted()); // false

Framework.boot({
  rootId: "app",
  defaultView: "app/views/home",
});

console.log(Framework.isBooted()); // true

// Conditional initialization
function initializeService() {
  if (!Framework.isBooted()) {
    console.warn("Service initialized before framework boot");
    return;
  }
  // Safe to use Router, State, etc.
  const currentPath = Framework.Router.parse().path;
}
```

### See Also {#framework-isbooted-see-also}

- [Framework.boot()](#framework-boot) - Boots the framework

## Framework.toUri(path, params, keepEmpty) {#framework-touri}

Converts a path and parameters object into a URL string with query parameters.

```ts
function toUri(
  path: string,
  params?: Record<string, unknown>,
  keepEmpty?: Set<string>,
): string;
```

### Details {#framework-touri-details}

`toUri()` constructs a URL string by combining a base path with query parameters. The function encodes parameter values using `encodeURIComponent` to ensure URL safety.

Empty parameter values (empty strings, `null`, `undefined`) are omitted from the query string by default. The optional `keepEmpty` parameter accepts a `Set` of parameter names whose empty values should be preserved in the output.

If the path already contains a query string (detected by the presence of `?`), additional parameters are appended with `&` instead of `?`.

This function is the inverse of `parseUri()` and is commonly used for constructing navigation URLs, API endpoints, or any scenario requiring URL construction from structured data.

### Example {#framework-touri-example}

```ts
import { Framework } from "swifty-mvc";

// Basic usage
const url = Framework.toUri("/list", { page: 2, size: 10 });
console.log(url); // "/list?page=2&size=10"

// Empty values are omitted by default
const url2 = Framework.toUri("/search", { q: "test", filter: "" });
console.log(url2); // "/search?q=test"

// Preserve empty values with keepEmpty
const keepEmpty = new Set(["filter"]);
const url3 = Framework.toUri("/search", { q: "test", filter: "" }, keepEmpty);
console.log(url3); // "/search?q=test&filter="

// Path with existing query string
const url4 = Framework.toUri("/list?sort=name", { page: 2 });
console.log(url4); // "/list?sort=name&page=2"

// Special characters are encoded
const url5 = Framework.toUri("/search", { q: "hello world" });
console.log(url5); // "/search?q=hello%20world"

// No parameters
const url6 = Framework.toUri("/home");
console.log(url6); // "/home"
```

### See Also {#framework-touri-see-also}

- [Framework.parseUri()](#framework-parseuri) - Parses URL into path and parameters
- [Framework.Router.to()](#framework-router) - Navigates to a URL

## Framework.parseUri(url) {#framework-parseuri}

Parses a URL string into a structured object containing the path and query parameters.

```ts
function parseUri(url: string): ParsedUri;

interface ParsedUri {
  path: string;
  params: Record<string, string>;
}
```

### Details {#framework-parseuri-details}

`parseUri()` extracts the path and query parameters from a URL string. The path is the portion before the `?` character, and parameters are parsed from the query string using standard URL decoding.

Parameter values are decoded using `decodeURIComponent`. If decoding fails (malformed URL encoding), the raw value is used as a fallback.

This function is the inverse of `toUri()` and is commonly used for parsing incoming URLs, extracting parameters from navigation events, or processing API responses containing URLs.

The function handles edge cases such as URLs without query strings, empty parameter values, and URLs that appear to be parameter strings themselves (detected via regex pattern matching).

### Example {#framework-parseuri-example}

```ts
import { Framework } from "swifty-mvc";

// Basic usage
const parsed = Framework.parseUri("/list?page=2&size=10");
console.log(parsed.path); // "/list"
console.log(parsed.params); // { page: "2", size: "10" }

// URL with encoded characters
const parsed2 = Framework.parseUri("/search?q=hello%20world");
console.log(parsed2.params.q); // "hello world"

// URL without query string
const parsed3 = Framework.parseUri("/home");
console.log(parsed3.path); // "/home"
console.log(parsed3.params); // {}

// Empty parameter values
const parsed4 = Framework.parseUri("/search?q=&filter=");
console.log(parsed4.params); // { q: "", filter: "" }

// Multiple parameters with same key (last wins)
const parsed5 = Framework.parseUri("/list?page=1&page=2");
console.log(parsed5.params.page); // "2"

// Round-trip with toUri
const original = "/list?page=2&size=10";
const reconstructed = Framework.toUri(
  Framework.parseUri(original).path,
  Framework.parseUri(original).params,
);
console.log(reconstructed); // "/list?page=2&size=10"
```

### See Also {#framework-parseuri-see-also}

- [Framework.toUri()](#framework-touri) - Converts path and parameters to URL
- [Framework.Router.parse()](#framework-router) - Parses current URL with routing context

## Framework.assign(target, ...sources) {#framework-assign}

Merges properties from one or more source objects into a target object, similar to `Object.assign` but with safer property enumeration.

```ts
function assign<T extends object>(
  target: T,
  ...sources: Record<string, unknown>[]
): T;
```

### Details {#framework-assign-details}

`assign()` copies all enumerable own properties from source objects to the target object. Unlike `Object.assign`, this implementation uses `hasOwnProperty` checks to ensure only own properties (not inherited ones) are copied.

Properties are copied in the order sources are provided. If multiple sources define the same property, the value from the last source wins.

The function mutates and returns the target object. This is commonly used for merging configuration objects, combining default options with user-provided options, or copying data between objects.

### Example {#framework-assign-example}

```ts
import { Framework } from "swifty-mvc";

// Basic merge
const target = { a: 1, b: 2 };
const result = Framework.assign(target, { b: 3, c: 4 });
console.log(target); // { a: 1, b: 3, c: 4 }
console.log(result === target); // true

// Multiple sources
const obj = { a: 1 };
Framework.assign(obj, { b: 2 }, { c: 3 }, { d: 4 });
console.log(obj); // { a: 1, b: 2, c: 3, d: 4 }

// Later sources override earlier ones
const config = { timeout: 1000, retries: 3 };
Framework.assign(config, { timeout: 5000 }, { retries: 5 });
console.log(config); // { timeout: 5000, retries: 5 }

// Combining defaults with user options
const defaults = { size: 10, page: 1, sort: "name" };
const userOptions = { page: 2, sort: "date" };
const finalOptions = Framework.assign({}, defaults, userOptions);
console.log(finalOptions); // { size: 10, page: 2, sort: "date" }
```

### See Also {#framework-assign-see-also}

- [Framework.keys()](#framework-keys) - Gets enumerable property keys

## Framework.keys(obj) {#framework-keys}

Returns an array of an object's own enumerable property keys.

```ts
function keys<T extends object>(obj: T): string[];
```

### Details {#framework-keys-details}

`keys()` returns all own enumerable property names from an object, similar to `Object.keys()` but implemented with explicit `hasOwnProperty` checks for consistency across different JavaScript environments.

The function iterates over all properties using a `for...in` loop and filters to include only own properties (not inherited from the prototype chain). This ensures predictable behavior even with objects that have unusual prototype chains.

### Example {#framework-keys-example}

```ts
import { Framework } from "swifty-mvc";

const obj = { a: 1, b: 2, c: 3 };
const keys = Framework.keys(obj);
console.log(keys); // ["a", "b", "c"]

// Works with empty objects
const empty = {};
console.log(Framework.keys(empty)); // []

// Only own properties, not inherited
function MyClass() {
  this.own = 1;
}
MyClass.prototype.inherited = 2;
const instance = new MyClass();
console.log(Framework.keys(instance)); // ["own"]

// Use with iteration
const data = { x: 10, y: 20, z: 30 };
Framework.keys(data).forEach((key) => {
  console.log(`${key}: ${data[key]}`);
});
```

### See Also {#framework-keys-see-also}

- [Framework.assign()](#framework-assign) - Merges object properties

## Framework.nodeInside(node, container) {#framework-nodeinside}

Checks if one DOM node is contained within another node, or if they are the same node.

```ts
function nodeInside(
  node: HTMLElement | string,
  container: HTMLElement | string,
): boolean;
```

### Details {#framework-nodeinside-details}

`nodeInside()` determines whether a DOM node is a descendant of (or identical to) another node. Both parameters accept either an `HTMLElement` reference or a string ID. When a string is provided, the function uses `document.getElementById()` to resolve the element.

The function uses the native `compareDocumentPosition()` API for efficient DOM tree traversal. It returns `true` if the nodes are identical or if `node` is contained anywhere within the subtree rooted at `container`.

Returns `false` if either node cannot be resolved (when using string IDs) or if the nodes are in different document trees.

This function is commonly used for event delegation, determining click targets, or implementing focus management logic.

### Example {#framework-nodeinside-example}

```ts
import { Framework } from "swifty-mvc";

// Using element references
const parent = document.getElementById("container");
const child = document.getElementById("button");
if (Framework.nodeInside(child, parent)) {
  console.log("Button is inside container");
}

// Using string IDs
if (Framework.nodeInside("button", "container")) {
  console.log("Button is inside container");
}

// Same node returns true
const elem = document.getElementById("test");
console.log(Framework.nodeInside(elem, elem)); // true

// Event delegation pattern
document.addEventListener("click", (e) => {
  const modal = document.getElementById("modal");
  if (modal && !Framework.nodeInside(e.target, modal)) {
    // Click was outside the modal
    closeModal();
  }
});
```

### See Also {#framework-nodeinside-see-also}

- [Framework.ensureNodeId()](#framework-ensurenodeid) - Ensures element has an ID

## Framework.ensureNodeId(element) {#framework-ensurenodeid}

Ensures a DOM element has an ID attribute, generating one if missing.

```ts
function ensureNodeId(element: HTMLElement): string;
```

### Details {#framework-ensurenodeid-details}

`ensureNodeId()` checks if an element already has an `id` attribute. If present, it returns the existing ID. If missing, it generates a unique ID using `generateId()` with the prefix `"l_"`, assigns it to the element, and returns the generated ID.

This function is essential for the framework's event delegation system, which uses element IDs to route events to the correct view handlers. It ensures every interactive element can be uniquely identified without requiring developers to manually assign IDs.

The generated IDs follow the pattern `l_0`, `l_1`, `l_2`, etc., where the numeric suffix is a monotonically increasing counter.

### Example {#framework-ensurenodeid-example}

```ts
import { Framework } from "swifty-mvc";

// Element with existing ID
const button1 = document.getElementById("submit-btn");
const id1 = Framework.ensureNodeId(button1);
console.log(id1); // "submit-btn"

// Element without ID
const button2 = document.createElement("button");
document.body.appendChild(button2);
const id2 = Framework.ensureNodeId(button2);
console.log(id2); // "l_0" (or next available number)
console.log(button2.id); // "l_0"

// Calling multiple times returns same ID
const id3 = Framework.ensureNodeId(button2);
console.log(id3); // "l_0" (unchanged)

// Common pattern in view event handlers
export default Framework.defineView((ctx) => {
  return {
    template: `<button>Click me</button>`,
    events: {
      "button<click>": (e) => {
        const buttonId = Framework.ensureNodeId(e.target);
        console.log("Clicked button:", buttonId);
      },
    },
  };
});
```

### See Also {#framework-ensurenodeid-see-also}

- [Framework.generateId()](#framework-generateid) - Generates unique IDs
- [Framework.nodeInside()](#framework-nodeinside) - Checks DOM containment

## Framework.use(names, callback) {#framework-use}

Loads modules asynchronously using the configured module loader or dynamic import fallback.

```ts
function use(
  names: string | string[],
  callback?: (...modules: unknown[]) => void,
): void;
```

### Details {#framework-use-details}

`use()` dynamically loads one or more modules at runtime. It accepts either a single module name (string) or an array of module names. When a callback is provided, it is invoked with the loaded modules as arguments. The function returns `void` — modules are delivered via the callback parameter, not as a Promise resolution.

The loading strategy depends on the `require` function configured in `FrameworkConfig`:

- If `config.require` is defined, it delegates to that function (commonly used for Webpack Module Federation integration)
- If `config.require` is not defined, it falls back to dynamic `import()` for ESM-based loading

When using dynamic import, the function normalizes relative paths (starting with `.` or `/`) and applies bundler-specific ignore comments (`@vite-ignore`, `webpackIgnore`) to prevent static analysis errors.

Module loading errors are caught and passed to the configured error handler. Failed modules resolve to `undefined` in the result array, allowing partial success scenarios.

This function is primarily used internally by the framework to load view modules on demand, but can also be used by application code for code splitting or lazy-loading features.

### Example {#framework-use-example}

```ts
import { Framework } from "swifty-mvc";

// Load single module with callback
Framework.use("app/views/detail", (DetailView) => {
  console.log("Detail view loaded:", DetailView);
});

// Load multiple modules
Framework.use(["app/views/home", "app/views/about"], (HomeView, AboutView) => {
  console.log("Both views loaded");
});

// Callback-based usage for feature modules
Framework.use("app/services/analytics", (AnalyticsService) => {
  AnalyticsService.track("page_view");
});

// Error handling via callback
Framework.use("app/views/missing", (View) => {
  if (!View) {
    console.error("View failed to load");
  }
});

// With Module Federation
Framework.boot({
  require: (names) => {
    return Promise.all(
      names.map((name) => {
        // Webpack Module Federation integration
        return import(/* webpackIgnore: true */ `remote-app/${name}`);
      }),
    );
  },
});

Framework.use("remote-app/views/shared", (SharedView) => {
  // Use remotely loaded view
});
```

### See Also {#framework-use-see-also}

- [FrameworkConfig.require](#frameworkconfig) - Custom module loader configuration
- [Framework.defineView()](#framework-defineview) - Defines a view module

## Framework.generateId(prefix) {#framework-generateid}

Generates a globally unique identifier with an optional prefix.

```ts
function generateId(prefix?: string): string;
```

### Details {#framework-generateid-details}

`generateId()` produces unique string identifiers by combining an optional prefix with a monotonically increasing counter. The default prefix is `"swifty_"` if none is provided.

The counter starts at 0 and increments with each call, ensuring uniqueness within a single page session. IDs are not guaranteed to be unique across page reloads or between different browser tabs.

This function is used internally by the framework for generating element IDs, frame IDs, and other unique identifiers. Application code can use it for any scenario requiring unique keys, such as list item keys, temporary IDs, or debugging markers.

### Example {#framework-generateid-example}

```ts
import { Framework } from "swifty-mvc";

// Default prefix
const id1 = Framework.generateId();
console.log(id1); // "swifty_0"

const id2 = Framework.generateId();
console.log(id2); // "swifty_1"

// Custom prefix
const userId = Framework.generateId("user_");
console.log(userId); // "user_2"

const sessionId = Framework.generateId("session_");
console.log(sessionId); // "session_3"

// Generating unique keys for list items
const items = data.map((item) => ({
  ...item,
  key: Framework.generateId("item_"),
}));

// Temporary IDs for DOM elements
const tempDiv = document.createElement("div");
tempDiv.id = Framework.generateId("temp_");
document.body.appendChild(tempDiv);
```

### See Also {#framework-generateid-see-also}

- [Framework.ensureNodeId()](#framework-ensurenodeid) - Ensures element has an ID

## Framework.mark(host, key) {#framework-mark}

Creates a validity marker for tracking async callback lifecycle. Returns a check function that returns `false` when the host is unmarked.

```ts
function mark(host: object, key: string): () => boolean;
```

### Details {#framework-mark-details}

`mark()` implements a signature-based lifecycle tracking system for async callbacks. It creates a validity checker function associated with a host object (typically a view instance) and a key (typically `"render"` or an operation identifier).

The returned check function returns `true` as long as the mark remains valid. It returns `false` after `unmark()` is called on the host, which typically happens when a view re-renders or is destroyed.

This mechanism prevents stale async callbacks from executing after their host context has changed. For example, if a view initiates an async data fetch and then re-renders before the fetch completes, the callback can check the mark and skip execution to avoid updating a destroyed view.

Marks are stored in a module-level `WeakMap`, not on the host object itself. This ensures marks never pollute user objects, work with frozen objects, and remain invisible in debug snapshots.

Each call to `mark()` with the same host and key increments an internal signature counter, invalidating all previous checkers for that key.

### Example {#framework-mark-example}

```ts
import { Framework } from "swifty-mvc";

export default Framework.defineView((ctx) => {
  // Create a mark for this render cycle
  const isValid = Framework.mark(ctx, "render");

  // Async operation
  setTimeout(() => {
    // Check if view is still valid before updating
    if (isValid()) {
      ctx.updater.digest({ data: "loaded" });
    } else {
      console.log("View was destroyed, skipping update");
    }
  }, 1000);

  return {
    template: `<div>{{=data}}</div>`,
  };
});

// Multiple marks for different operations
export default Framework.defineView((ctx) => {
  const checkFetch1 = Framework.mark(ctx, "fetch1");
  const checkFetch2 = Framework.mark(ctx, "fetch2");

  fetchData1().then((data) => {
    if (checkFetch1()) {
      ctx.updater.digest({ data1: data });
    }
  });

  fetchData2().then((data) => {
    if (checkFetch2()) {
      ctx.updater.digest({ data2: data });
    }
  });

  // Import and define your template
  // return { template: someTemplate };
  return { template: "" }; // placeholder
});
```

### See Also {#framework-mark-see-also}

- [Framework.unmark()](#framework-unmark) - Invalidates marks for a host
- [Framework.delay()](#framework-delay) - Promise-based delay

## Framework.unmark(host) {#framework-unmark}

Invalidates all marks for a host object, causing all existing check functions to return `false`.

```ts
function unmark(host: object): void;
```

### Details {#framework-unmark-details}

`unmark()` clears all validity markers associated with a host object. After calling `unmark()`, every check function previously returned by `mark()` for that host will return `false`, preventing any pending async callbacks from executing.

This function is called automatically by the framework when a view re-renders or is destroyed. Application code rarely needs to call it directly, but it can be used for custom lifecycle management scenarios.

The function sets a `deleted` flag on the host's mark record and clears the signature map. Subsequent calls to `mark()` on the same host will create fresh marks with new signatures.

### Example {#framework-unmark-example}

```ts
import { Framework } from "swifty-mvc";

// Typically called by framework during view lifecycle
// Rarely needed in application code

export default Framework.defineView((ctx) => {
  const isValid = Framework.mark(ctx, "async-op");

  // Start async operation
  const promise = fetch("/api/data");

  // Manually unmark if needed (e.g., custom cleanup)
  ctx.on("destroy", () => {
    Framework.unmark(ctx);
    console.log("All async callbacks invalidated");
  });

  promise.then((data) => {
    if (isValid()) {
      // This won't execute after unmark()
      ctx.updater.digest({ data });
    }
  });

  // Import and define your template
  // return { template: someTemplate };
  return { template: "" }; // placeholder
});
```

### See Also {#framework-unmark-see-also}

- [Framework.mark()](#framework-mark) - Creates validity markers

## Framework.delay(time) {#framework-delay}

Returns a Promise that resolves after a specified delay in milliseconds.

```ts
function delay(time: number): Promise<void>;
```

### Details {#framework-delay-details}

`delay()` is a Promise-based wrapper around `setTimeout`. It returns a Promise that resolves after the specified number of milliseconds, making it easy to introduce delays in async code using `await`.

This function is commonly used for testing, animations, debouncing, or any scenario requiring timed delays in async workflows.

### Example {#framework-delay-example}

```ts
import { Framework } from "swifty-mvc";

// Basic delay
async function delayedAction() {
  console.log("Starting...");
  await Framework.delay(1000);
  console.log("1 second later");
}

// Sequential delays for animations
async function animateSteps() {
  element.classList.add("step-1");
  await Framework.delay(300);
  element.classList.add("step-2");
  await Framework.delay(300);
  element.classList.add("step-3");
}

// Debouncing with delay
let debounceTimer;
async function debouncedSearch(query) {
  if (debounceTimer) clearTimeout(debounceTimer);
  await Framework.delay(300);
  const results = await search(query);
  // ctx.updater.digest({ results }); // ctx must be available in view context
}

// Polling pattern
async function pollStatus() {
  while (true) {
    const status = await checkStatus();
    if (status === "complete") break;
    await Framework.delay(2000);
  }
}

// Timeout with Promise.race
async function fetchWithTimeout(url, timeout = 5000) {
  return Promise.race([
    fetch(url),
    Framework.delay(timeout).then(() => {
      throw new Error("Request timeout");
    }),
  ]);
}
```

### See Also {#framework-delay-see-also}

- [Framework.mark()](#framework-mark) - Async callback validity tracking

## Framework.dispatchEvent(target, eventType, eventInit) {#framework-dispatchevent}

Fires a custom DOM event on a target element.

```ts
function dispatchEvent(
  target: EventTarget,
  eventType: string,
  eventInit?: CustomEventInit,
): void;
```

### Details {#framework-dispatchevent-details}

`dispatchEvent()` creates and dispatches a `CustomEvent` on the specified target. The event is configured to bubble and be cancelable by default, with additional options available through the `eventInit` parameter.

This function is useful for implementing custom event systems, notifying parent components of child state changes, or integrating with third-party libraries that expect DOM events.

The `eventInit` parameter accepts standard `CustomEventInit` options including `detail` (custom data payload), `bubbles`, and `cancelable`.

### Example {#framework-dispatchevent-example}

```ts
import { Framework } from "swifty-mvc";

// Basic custom event
const button = document.getElementById("my-button");
Framework.dispatchEvent(button, "custom-action");

// Event with custom data
Framework.dispatchEvent(button, "item-selected", {
  detail: { itemId: 123, itemName: "Product" },
});

// Listening for custom events
button.addEventListener("custom-action", (e) => {
  console.log("Custom action triggered");
});

button.addEventListener("item-selected", (e) => {
  console.log("Selected:", e.detail.itemId);
});

// Event bubbling
const child = document.getElementById("child");
const parent = document.getElementById("parent");

parent.addEventListener("child-event", (e) => {
  console.log("Parent received child event");
});

Framework.dispatchEvent(child, "child-event"); // Bubbles to parent

// Cancelable events
const form = document.getElementById("form");
form.addEventListener("before-submit", (e) => {
  if (!validate()) {
    e.preventDefault();
    console.log("Submission canceled");
  }
});

Framework.dispatchEvent(form, "before-submit", { cancelable: true });

// Integration with views
export default Framework.defineView((ctx) => {
  function notifyParent(data) {
    const element = document.getElementById(ctx.id);
    Framework.dispatchEvent(element, "view-data-changed", {
      detail: data,
    });
  }

  // Import and define your template
  // const template = ...;
  const template = ""; // placeholder

  return {
    template,
    events: {
      "update<click>": () => {
        notifyParent({ value: 42 });
      },
    },
  };
});
```

### See Also {#framework-dispatchevent-see-also}

- [Framework.createEmitter()](#framework-createemitter) - Creates event emitter instances

## Framework.task(fn, args, context) {#framework-task}

Queues a function for deferred, chunked execution using cooperative scheduling.

```ts
function task(fn: AnyFunc, args?: unknown[], context?: unknown): void;
```

### Details {#framework-task-details}

`task()` implements a cooperative scheduler that executes queued functions in time-sliced batches to maintain UI responsiveness. Tasks are queued in a flat array and processed in chunks using the best available browser scheduling API:

1. `scheduler.postTask()` with background priority (Chrome 94+)
2. `requestIdleCallback` with adaptive time slicing (Chrome 47+, Firefox)
3. `setTimeout(0)` as universal fallback

When `requestIdleCallback` is available, the scheduler uses the browser-provided deadline for adaptive chunk sizing. Otherwise, it uses a fixed 48ms time budget per chunk (defined by `CALL_BREAK_TIME`).

Each task is automatically wrapped in a try-catch block to prevent one failing task from blocking the queue. Tasks are executed in FIFO order.

This function is used internally by the framework for batching DOM updates, scheduling view renders, and deferring non-critical work. Application code can use it to defer expensive operations or break large tasks into smaller chunks.

### Example {#framework-task-example}

```ts
import { Framework } from "swifty-mvc";

// Basic task queuing
Framework.task(() => {
  console.log("Deferred task executed");
});

// Task with arguments
Framework.task(
  (a, b) => {
    console.log("Result:", a + b);
  },
  [10, 20],
);

// Task with context
const context = { multiplier: 2 };
Framework.task(
  function (value) {
    console.log("Result:", value * this.multiplier);
  },
  [5],
  context,
);

// Batch multiple tasks
for (let i = 0; i < 100; i++) {
  Framework.task(
    (index) => {
      console.log("Processing item", index);
    },
    [i],
  );
}
// Tasks are executed in chunks, yielding to browser between chunks

// Deferring expensive operations
function processLargeDataset(data) {
  data.forEach((item, index) => {
    Framework.task(() => {
      // Process each item in a separate task
      expensiveOperation(item);
    });
  });
}

// Integration with views
export default Framework.defineView((ctx) => {
  function loadData() {
    fetch("/api/data").then((response) => {
      // Defer DOM updates to next task batch
      Framework.task(() => {
        ctx.updater.digest({ data: response });
      });
    });
  }

  // Import and define your template
  // const template = ...;
  const template = ""; // placeholder

  return { template };
});
```

### See Also {#framework-task-see-also}

- [Framework.delay()](#framework-delay) - Promise-based delay

## Framework.waitZoneViewsRendered(viewId, timeout) {#framework-waitzoneviewsrendered}

Waits for all views in a zone to be rendered, returning a status code.

```ts
function waitZoneViewsRendered(
  viewId: string,
  timeout?: number,
): Promise<number>;

// Status codes
const WAIT_OK = 1;
const WAIT_TIMEOUT_OR_NOT_FOUND = 0;
```

### Details {#framework-waitzoneviewsrendered-details}

`waitZoneViewsRendered()` returns a Promise that resolves when all child views within a zone (a container view) have completed rendering. It polls the zone's frame at 9ms intervals to check if the ready count matches the children count.

The function accepts an optional timeout parameter (defaulting to 30 seconds). If the timeout expires or the zone frame is not found, the Promise resolves with `WAIT_TIMEOUT_OR_NOT_FOUND` (0). If all views render successfully, it resolves with `WAIT_OK` (1).

This function is essential for scenarios where parent views need to wait for all child views to complete rendering before performing actions such as:

- Initializing third-party libraries that depend on DOM structure
- Triggering animations that span multiple views
- Measuring layout dimensions that include child views
- Coordinating data loading across nested views

The status code constants `WAIT_OK` and `WAIT_TIMEOUT_OR_NOT_FOUND` are exported from the Framework object for comparison.

### Example {#framework-waitzoneviewsrendered-example}

```ts
import { Framework } from "swifty-mvc";

// Wait for zone views with default timeout
async function initializeAfterRender() {
  const status = await Framework.waitZoneViewsRendered("main-zone");
  if (status === Framework.WAIT_OK) {
    console.log("All zone views rendered");
    initializeCharts();
  } else {
    console.log("Timeout or zone not found");
  }
}

// Wait with custom timeout
async function waitForZone() {
  const status = await Framework.waitZoneViewsRendered("sidebar", 5000);
  if (status === Framework.WAIT_OK) {
    console.log("Sidebar views rendered within 5 seconds");
  } else {
    console.log("Timeout waiting for sidebar");
  }
}

// Parent view waiting for child views
export default Framework.defineView((ctx) => {
  async function onMounted() {
    // Wait for all child views in the zone
    const status = await Framework.waitZoneViewsRendered(ctx.id);
    if (status === Framework.WAIT_OK) {
      // Safe to access child view DOM
      const childElements = document.querySelectorAll(
        `[data-parent="${ctx.id}"]`,
      );
      initializeInteractions(childElements);
    }
  }

  ctx.on("render", onMounted);

  return {
    template: `
      <div id="{{=id}}">
        <v-swifty data-parent="{{=id}}" src="app/views/child1"></v-swifty>
        <v-swifty data-parent="{{=id}}" src="app/views/child2"></v-swifty>
      </div>
    `,
  };
});

// Coordinating multiple zones
async function waitForAllZones() {
  const results = await Promise.all([
    Framework.waitZoneViewsRendered("header-zone"),
    Framework.waitZoneViewsRendered("main-zone"),
    Framework.waitZoneViewsRendered("footer-zone"),
  ]);

  const allRendered = results.every((status) => status === Framework.WAIT_OK);
  if (allRendered) {
    console.log("All zones rendered");
  }
}
```

### See Also {#framework-waitzoneviewsrendered-see-also}

- [Framework.Frame](#framework-frame) - Frame tree management

## Framework.createEmitter() {#framework-createemitter}

Creates a multi-cast event emitter instance.

```ts
function createEmitter<T = unknown>(): EmitterApi<T>;

interface EmitterApi<T = unknown> {
  on(name: string, fn: (e?: ChangeEvent) => void): EmitterApi<T>;
  off(name: string, fn?: AnyFunc): EmitterApi<T>;
  fire(
    name: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): EmitterApi<T>;
}
```

### Details {#framework-createemitter-details}

`createEmitter()` is a factory function that creates event emitter instances with support for multiple listeners per event. The returned emitter provides `on()`, `off()`, and `fire()` methods for managing event subscriptions and dispatching events.

Key features:

- Multi-cast: Multiple listeners can subscribe to the same event
- Re-entrant safety: Listeners can safely add or remove other listeners during event firing
- Deferred removal: When `off()` is called during `fire()`, removal is deferred until firing completes
- Lifecycle hooks: Supports `onEventName` convention where setting `emitter.onDestroy = fn` causes `fire("destroy")` to call `fn`
- Chaining: All methods return the emitter API for method chaining

The emitter is used internally by views, frames, Router, and State modules for lifecycle events. Application code can use it to implement custom event systems, pub/sub patterns, or component communication.

### Example {#framework-createemitter-example}

```ts
import { Framework } from "swifty-mvc";

// Basic event emitter
const emitter = Framework.createEmitter();

emitter.on("change", (e) => {
  console.log("Changed:", e.type);
});

emitter.fire("change");

// Multiple listeners
const bus = Framework.createEmitter();

bus.on("message", (e) => {
  console.log("Listener 1:", e.detail);
});

bus.on("message", (e) => {
  console.log("Listener 2:", e.detail);
});

bus.fire("message", { detail: "Hello" });
// Both listeners execute

// Removing listeners
const handler = (e) => console.log("Handler");
bus.on("event", handler);
bus.off("event", handler);

// Remove all listeners for an event
bus.off("event");

// Fire with data
emitter.fire("data-loaded", {
  items: [1, 2, 3],
  count: 3,
});

// Fire once (auto-remove after firing)
emitter.fire("one-time", {}, true);

// Fire in reverse order (last-to-first)
emitter.on("ordered", () => console.log("First"));
emitter.on("ordered", () => console.log("Second"));
emitter.fire("ordered", {}, false, true);
// Output: "Second", "First"

// Lifecycle hook convention
const lifecycle = Framework.createEmitter();
lifecycle.onDestroy = (e) => {
  console.log("Cleanup on destroy");
};
lifecycle.fire("destroy"); // Calls onDestroy

// Method chaining
Framework.createEmitter()
  .on("event1", handler1)
  .on("event2", handler2)
  .fire("event1")
  .fire("event2");

// Custom event system
class DataService {
  constructor() {
    this.emitter = Framework.createEmitter();
  }

  onDataChange(handler) {
    this.emitter.on("change", handler);
    return () => this.emitter.off("change", handler);
  }

  updateData(newData) {
    this.data = newData;
    this.emitter.fire("change", { data: newData });
  }
}
```

### See Also {#framework-createemitter-see-also}

- [Framework.dispatchEvent()](#framework-dispatchevent) - Fires DOM events
- [Framework.createCache()](#framework-createcache) - Creates cache instances

## Framework.createCache(options) {#framework-createcache}

Creates an LFU-style bounded cache with frequency-based eviction.

```ts
function createCache<T = unknown>(options?: CacheOptions<T>): CacheApi<T>;

interface CacheOptions<T> {
  maxSize?: number;
  bufferSize?: number;
  onRemove?: (key: string) => void;
  sortComparator?: (a: CacheEntry<T>, b: CacheEntry<T>) => number;
}

interface CacheApi<T = unknown> {
  set(key: string, resource: T): void;
  get(key: string): T | undefined;
  del(key: string): void;
  has(key: string): boolean;
  clear(): void;
  forEach(callback: (value: T | undefined) => void): void;
  getSize(): number;
}

interface CacheEntry<T> {
  originalKey: string;
  value: T | undefined;
  frequency: number;
  lastTimestamp: number;
}
```

### Details {#framework-createcache-details}

`createCache()` creates a bounded cache that uses Least Frequently Used (LFU) eviction with recency as a tiebreaker. Entries are tracked in a flat array plus a `Map` for O(1) lookups. On `get()`, the entry's frequency counter and last-access timestamp are incremented.

When the cache reaches capacity (`maxSize + bufferSize`), the `bufferSize` worst entries are evicted in a single pass using partial selection sort (O(n\*k) complexity) instead of full sorting (O(n log n)). For the typical `bufferSize = 5`, this is effectively linear with at most 5 comparisons per iteration.

Configuration options:

- **maxSize** (default: 20): Maximum number of entries before eviction triggers
- **bufferSize** (default: 5): Number of entries evicted in each eviction pass
- **onRemove**: Callback invoked when an entry is evicted or deleted
- **sortComparator**: Custom comparator for ranking entries (default: higher frequency first, then more recent access first)

The cache uses a namespace prefix (internal `SPLITTER` character) to isolate keys and prevent collisions.

This cache is used internally by the Service module for API response caching. Application code can use it for any scenario requiring bounded caching with automatic eviction.

### Example {#framework-createcache-example}

```ts
import { Framework } from "swifty-mvc";

// Basic cache with defaults
const cache = Framework.createCache();

cache.set("user:1", { name: "Alice", age: 30 });
cache.set("user:2", { name: "Bob", age: 25 });

const user = cache.get("user:1");
console.log(user); // { name: "Alice", age: 30 }

console.log(cache.has("user:1")); // true
console.log(cache.getSize()); // 2

// Custom size limits
const smallCache = Framework.createCache({
  maxSize: 5,
  bufferSize: 2,
});

for (let i = 0; i < 10; i++) {
  smallCache.set(`key${i}`, `value${i}`);
}
// After 7 entries (5 + 2), eviction triggers and removes 2 worst entries

// Eviction callback
const cacheWithCallback = Framework.createCache({
  maxSize: 3,
  bufferSize: 1,
  onRemove: (key) => {
    console.log(`Evicted: ${key}`);
  },
});

cacheWithCallback.set("a", 1);
cacheWithCallback.set("b", 2);
cacheWithCallback.set("c", 3);
cacheWithCallback.set("d", 4); // Triggers eviction, logs "Evicted: a"

// Frequency-based eviction
const freqCache = Framework.createCache({ maxSize: 2, bufferSize: 1 });

freqCache.set("rare", 1);
freqCache.set("medium", 2);
freqCache.set("frequent", 3);

freqCache.get("frequent"); // frequency: 2
freqCache.get("frequent"); // frequency: 3
freqCache.get("medium"); // frequency: 2

freqCache.set("new", 4); // Evicts "rare" (frequency: 1)

// Deleting entries
cache.del("user:1");
console.log(cache.has("user:1")); // false

// Clearing cache
cache.clear();
console.log(cache.getSize()); // 0

// Iterating over cache
const iterCache = Framework.createCache();
iterCache.set("a", 1);
iterCache.set("b", 2);
iterCache.forEach((value) => {
  console.log(value);
});

// Type-safe cache
interface User {
  id: number;
  name: string;
}

const userCache = Framework.createCache<User>();
userCache.set("user:1", { id: 1, name: "Alice" });
const user = userCache.get("user:1");
console.log(user?.name); // "Alice"
```

### See Also {#framework-createcache-see-also}

- [Framework.createEmitter()](#framework-createemitter) - Creates event emitters

## Framework.defineView(setup) {#framework-defineview}

Defines a view using a functional setup pattern.

```ts
function defineView(
  setup: (ctx: ViewCtx, params?: unknown) => ViewDescriptor,
): ViewSetup;

interface ViewDescriptor {
  template?: ViewTemplate | VDomTemplate;
  events?: Record<string, AnyFunc>;
  assign?: (options?: unknown) => boolean | undefined;
}

type ViewSetup = (ctx: ViewCtx, params?: unknown) => ViewDescriptor;
```

### Details {#framework-defineview-details}

`defineView()` is the primary API for defining views in swifty-mvc. It accepts a setup function that receives a `ViewCtx` (view context) and optional initialization parameters, and returns a view descriptor object.

The setup function runs exactly once when the view is mounted. This is fundamentally different from React components, which re-execute on every render. State and effects are registered on the `ViewCtx` via hooks and persist across re-renders.

The view descriptor has three optional fields:

- **template**: A compiled template function (from `.html` files) used to render the view's HTML
- **events**: A map of declarative event bindings in the format `"selector<event>": handler`
- **assign**: An incremental update function called on every re-render for fine-grained control

The `ViewCtx` provides access to all framework APIs including:

- `updater` for data binding and rendering
- `on()`/`off()`/`fire()` for lifecycle events
- `observeLocation()` and `observeState()` for reactive updates
- `capture()`/`release()` for resource management
- Hooks like `useState`, `useEffect`, `useStore`

This function is primarily for documentation and type narrowing. The framework and devtools recognize any module that exports `defineView(...)` as a view module.

### Example {#framework-defineview-example}

```ts
import { Framework, useState, useEffect } from "swifty-mvc";
import template from "./counter.html";

// Basic view with state
export default Framework.defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "increment<click>": () => setCount(getCount() + 1),
      "decrement<click>": () => setCount(getCount() - 1),
    },
  };
});

// View with lifecycle hooks
export default Framework.defineView((ctx) => {
  useEffect(() => {
    console.log("View mounted");
    const timer = setInterval(() => {
      console.log("Tick");
    }, 1000);

    // Cleanup function
    return () => {
      console.log("View destroyed");
      clearInterval(timer);
    };
  }, []);

  return { template };
});

// View with async data loading
export default Framework.defineView((ctx) => {
  const [getData, setData] = useState("data", null);
  const [getLoading, setLoading] = useState("loading", true);

  useEffect(() => {
    const isValid = Framework.mark(ctx, "fetch");

    fetch("/api/data")
      .then((res) => res.json())
      .then((data) => {
        if (isValid()) {
          setData(data);
          setLoading(false);
        }
      });
  }, []);

  return { template };
});

// View with URL observation
export default Framework.defineView((ctx) => {
  ctx.observeLocation({ params: ["id", "tab"], observePath: true });

  const [getId, setId] = useState("id", "");

  useEffect(() => {
    const location = Framework.Router.parse();
    setId(location.params.id || "");
  }, []);

  return { template };
});

// View with state observation
export default Framework.defineView((ctx) => {
  ctx.observeState(["user", "theme"]);

  return {
    template,
    assign: (options) => {
      const user = Framework.State.get("user");
      const theme = Framework.State.get("theme");
      ctx.updater.digest({ user, theme });
      return true;
    },
  };
});

// View with nested frames
export default Framework.defineView((ctx) => {
  return {
    template: `
      <div>
        <h1>Parent View</h1>
        <v-swifty src="app/views/child"></v-swifty>
      </div>
    `,
  };
});
```

### See Also {#framework-defineview-see-also}

- [Framework.use()](#framework-use) - Loads view modules dynamically
- [Framework.State](#framework-state) - Global state management
- [Framework.Router](#framework-router) - Routing and navigation

## Framework.State {#framework-state}

Reference to the global state management module.

```ts
const State: StateApi;

interface StateApi {
  get<T = unknown>(key?: string): T;
  set(data: Record<string, unknown>, excludes?: ReadonlySet<string>): this;
  digest(data?: Record<string, unknown>, excludes?: ReadonlySet<string>): void;
  diff(): ReadonlySet<string>;
  on(event: string, handler: (e?: ChangeEvent) => void): this;
  off(event: string, handler?: AnyFunc): this;
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): this;
  clean(
    keys: string,
  ): (ctx: { on: (event: string, handler: () => void) => void }) => void;
  onChanged?: (e?: ChangeEvent) => void;
}
```

### Details {#framework-state-details}

`State` provides simple cross-view data sharing through a global singleton state object. It is designed for lightweight shared values such as counters, toggles, page titles, or session information.

For complex reactive state with handlers, derived data, or fine-grained subscriptions, use `createStore` instead.

Key methods:

- **get(key?)**: Retrieves state value by key, or entire state object if no key provided
- **set(data, excludes?)**: Updates state data. Does not trigger re-renders until `digest()` is called
- **digest(data?, excludes?)**: Detects changes and dispatches notifications to observing views. Can optionally set data before digesting
- **diff()**: Returns the set of keys that changed in the most recent digest
- **clean(keys)**: Creates a cleanup function that removes state keys when a view is destroyed
- **on()/off()/fire()**: Event system for state change notifications

Views observe specific state keys via `ctx.observeState(keys)`. When those keys change and `digest()` is called, the framework automatically re-renders the observing views.

### Example {#framework-state-example}

```ts
import { Framework } from "swifty-mvc";

// Setting and getting state
Framework.State.set({ user: { name: "Alice" }, theme: "dark" });
const user = Framework.State.get("user");
console.log(user); // { name: "Alice" }

// Get entire state
const allState = Framework.State.get();
console.log(allState); // { user: {...}, theme: "dark" }

// Update and notify views
Framework.State.set({ count: 1 });
Framework.State.digest(); // Notifies observing views

// Digest with data
Framework.State.digest({ count: 2 }); // Sets and digests in one call

// Exclude keys from change tracking
Framework.State.set({ count: 3, internal: "value" });
Framework.State.digest(undefined, new Set(["internal"]));
// Only "count" triggers re-renders

// Get changed keys from last digest
const changed = Framework.State.diff();
console.log(changed.has("count")); // true

// View observing state
export default Framework.defineView((ctx) => {
  ctx.observeState(["user", "theme"]);

  // Cleanup state on view destroy
  Framework.State.clean("user,theme")(ctx);

  return {
    template,
    assign: () => {
      const user = Framework.State.get("user");
      const theme = Framework.State.get("theme");
      ctx.updater.digest({ user, theme });
      return true;
    },
  };
});

// Listening to state changes
Framework.State.on("changed", (e) => {
  console.log("State changed:", e.keys);
});

// Custom lifecycle hook
Framework.State.onChanged = (e) => {
  console.log("Global state change handler");
};
```

### See Also {#framework-state-see-also}

- [Framework.Router](#framework-router) - Routing module
- [Framework.defineView()](#framework-defineview) - View definition

## Framework.Router {#framework-router}

Reference to the routing and navigation module.

```ts
const Router: RouterApi;

interface RouterApi {
  parse(href?: string): Location;
  diff(): LocationDiff | undefined;
  to(
    pathOrParams: string | Record<string, unknown>,
    params?: Record<string, unknown>,
    replace?: boolean,
    silent?: boolean,
  ): void;
  join(...paths: string[]): string;
  beforeEach(
    guard: (to: Location, from: Location) => boolean | Promise<boolean>,
  ): () => void;
  on(event: string, handler: (e?: ChangeEvent) => void): this;
  off(event: string, handler?: AnyFunc): this;
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): this;
  onChange?: (e?: RouteChangeEvent) => void;
  onChanged?: (e?: RouteChangedEvent) => void;
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

### Details {#framework-router-details}

`Router` provides URL parsing, navigation, and route change detection. It supports both history mode (using `pushState`/`popstate`) and hash mode (using URL hash fragments).

Key methods:

- **parse(href?)**: Parses a URL into a structured `Location` object with query, hash, and merged params
- **diff()**: Returns differences between current and previous location, or `undefined` if no changes
- **to(pathOrParams, params?, replace?, silent?)**: Navigates to a new URL. Accepts either a path string or params object
- **join(...paths)**: Joins multiple path segments into a single path
- **beforeEach(guard)**: Registers a navigation guard that can allow or prevent route transitions

The Router implements a two-phase confirmation system:

1. **change** phase: Fired before URL changes, can be rejected or prevented
2. **changed** phase: Fired after URL has changed, carries diff information

Route transitions can be async. Guards may return Promises, and the router awaits all guards in registration order.

### Example {#framework-router-example}

```ts
import { Framework } from "swifty-mvc";

// Parse current URL
const location = Framework.Router.parse();
console.log(location.path);
console.log(location.params.id);
console.log(location.get("id", "default"));

// Parse specific URL
const loc = Framework.Router.parse("/list?page=2#section");
console.log(loc.query.params.page); // "2"
console.log(loc.hash.path); // "section"

// Navigate to path
Framework.Router.to("/detail", { id: 123 });

// Navigate with params only (keeps current path)
Framework.Router.to({ page: 2 });

// Replace history entry instead of push
Framework.Router.to("/home", {}, true);

// Silent navigation (no change events)
Framework.Router.to("/admin", {}, false, true);

// Join paths
const fullPath = Framework.Router.join("/app", "views", "home");
console.log(fullPath); // "/app/views/home"

// Navigation guards
const unsubscribe = Framework.Router.beforeEach((to, from) => {
  if (to.path === "/admin" && !isAuthenticated()) {
    Framework.Router.to("/login");
    return false; // Prevent navigation
  }
  return true; // Allow navigation
});

// Async guards
Framework.Router.beforeEach(async (to, from) => {
  const allowed = await checkPermissions(to.path);
  return allowed;
});

// Cleanup guard on view destroy
export default Framework.defineView((ctx) => {
  const unsubscribe = Framework.Router.beforeEach((to, from) => {
    if (hasUnsavedChanges()) {
      return confirm("Discard changes?");
    }
    return true;
  });

  ctx.on("destroy", unsubscribe);

  return { template };
});

// Listen to route changes
Framework.Router.on("changed", (e) => {
  console.log("Route changed:", e.path);
  console.log("Params changed:", e.params);
});

// Two-phase confirmation
Framework.Router.onChange = (e) => {
  if (e.path?.to === "/restricted") {
    e.reject(); // Revert to previous URL
  }
};

Framework.Router.onChanged = (e) => {
  console.log("Navigation completed");
  console.log("Changed:", e.changed);
  console.log("Force:", e.force);
};

// View observing location
export default Framework.defineView((ctx) => {
  ctx.observeLocation({ params: ["id", "tab"], observePath: true });

  return { template };
});
```

### See Also {#framework-router-see-also}

- [Framework.State](#framework-state) - State management
- [Framework.toUri()](#framework-touri) - URL construction
- [Framework.parseUri()](#framework-parseuri) - URL parsing

## Framework.Frame {#framework-frame}

Reference to the frame tree management module.

```ts
const Frame: typeof Frame;

// Static methods
interface Frame {
  get(id: string): FrameObj | undefined;
  getAll(): Map<string, FrameObj>;
  getRoot(): FrameObj | undefined;
  createRoot(rootId?: string): FrameObj;
  on(event: string, handler: AnyFunc): void;
  off(event: string, handler?: AnyFunc): void;
  fire(event: string, data?: Record<string, unknown>): void;
}

// Instance methods
interface FrameObj {
  id: string;
  getViewPath(): string | undefined;
  parentId: string | undefined;
  view: ViewCtx | undefined;
  mountView(viewPath: string, viewInitParams?: Record<string, unknown>): void;
  unmountView(): void;
  mountFrame(
    frameId: string,
    viewPath: string,
    viewInitParams?: Record<string, unknown>,
  ): FrameObj;
  unmountFrame(id?: string): void;
  mountZone(zoneId?: string): void;
  unmountZone(zoneId?: string): void;
  parent(level?: number): FrameObj | undefined;
  invoke(name: string, args?: unknown[]): unknown;
  children(): string[];
  on(event: string, handler: AnyFunc): FrameObj;
  off(event: string, handler?: AnyFunc): FrameObj;
  fire(event: string, data?: Record<string, unknown>): FrameObj;
}
```

### Details {#framework-frame-details}

`Frame` provides view lifecycle management through a tree structure. Each frame represents a mounted view and manages its parent-child relationships, view mounting/unmounting, and cross-view method invocation.

The Frame module consists of:

- **Static methods** (accessed via `Framework.Frame`): Registry operations for getting frames, creating the root frame, and global events
- **Instance methods** (accessed via frame objects): View mounting, child frame management, parent traversal, and method invocation

Key concepts:

- **Root frame**: The top-level frame created during `boot()`, containing the default view
- **Child frames**: Nested views mounted via `<v-swifty>` tags or `mountFrame()`
- **Zones**: Containers that automatically mount child views declared in templates
- **Invocation**: Cross-view method calls that queue until the target view is ready

Frame lifecycle events include `"created"`, `"alter"`, `"ready"`, and `"destroy"`. Global frame events (add/remove) are fired on the static emitter.

### Example {#framework-frame-example}

```ts
import { Framework } from "swifty-mvc";

// Get frame by ID
const frame = Framework.Frame.get("my-view");
if (frame) {
  console.log("View path:", frame.getViewPath());
  console.log("Parent ID:", frame.parentId);
}

// Get all frames
const allFrames = Framework.Frame.getAll();
allFrames.forEach((frame, id) => {
  console.log(`Frame ${id}: ${frame.getViewPath()}`);
});

// Get root frame
const root = Framework.Frame.getRoot();
console.log("Root view:", root?.getViewPath());

// Frame instance methods
const myFrame = Framework.Frame.get("my-view");

// Navigate parent chain
const parent = myFrame.parent();
const grandparent = myFrame.parent(2);

// Get children
const childIds = myFrame.children();
console.log("Children:", childIds);

// Mount child frame programmatically
const childFrame = myFrame.mountFrame("child-id", "app/views/child", {
  initData: "value",
});

// Unmount child frame
myFrame.unmountFrame("child-id");

// Unmount all children
myFrame.unmountFrame();

// Mount zone (auto-mounts declared views)
myFrame.mountZone();

// Cross-view method invocation
myFrame.invoke("updateData", [newData]);

// Invoke on specific child
childFrame.invoke("refresh");

// Frame lifecycle events
myFrame.on("created", () => {
  console.log("Frame created");
});

myFrame.on("ready", () => {
  console.log("Frame and all children ready");
});

myFrame.on("destroy", () => {
  console.log("Frame destroyed");
});

// Global frame events
Framework.Frame.on("add", (e) => {
  console.log("Frame added:", e.frame.id);
});

Framework.Frame.on("remove", (e) => {
  console.log("Frame removed:", e.frame.id);
});

// View with nested frames
export default Framework.defineView((ctx) => {
  return {
    template: `
      <div>
        <v-swifty id="header" src="app/views/header"></v-swifty>
        <v-swifty id="main" src="app/views/main"></v-swifty>
        <v-swifty id="footer" src="app/views/footer"></v-swifty>
      </div>
    `,
  };
});

// Programmatic frame management
export default Framework.defineView((ctx) => {
  function addChild() {
    const childId = Framework.generateId("child_");
    ctx.owner.mountFrame(childId, "app/views/dynamic-child");
  }

  function removeChild(id) {
    ctx.owner.unmountFrame(id);
  }

  return {
    template,
    events: {
      "add<click>": addChild,
      "remove<click>": () => removeChild("child_0"),
    },
  };
});
```

### See Also {#framework-frame-see-also}

- [Framework.defineView()](#framework-defineview) - View definition
- [Framework.waitZoneViewsRendered()](#framework-waitzoneviewsrendered) - Wait for zone rendering
- [Framework.Router](#framework-router) - Routing module
