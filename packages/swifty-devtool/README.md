# @swifty.js/devtool

Devtool for the @swifty.js/mvc framework. Built on React 19 + Webpack 5 + Tailwind 4 + TypeScript 6, totaling 2535 lines of application code across four independent feature tabs:

- Inspector: connects to any Swifty application via iframe + postMessage for real-time visualization of the Frame tree and View information
- MF Demo: statically loads CounterView from swifty-demo via Webpack Module Federation
- CDN: interacts with swifty-cdn to manage projects/versions, scan workspace dist directories, and publish in one click
- MF CDN: dynamically loads MF modules at runtime from any CDN remoteEntry.js

The service runs on port 5173. Designed to work alongside swifty-demo (3000) and swifty-cdn (3300).

---

## Table of Contents

- 1 Quick Start
- 2 Tab Details
- 3 Inspector Integration Guide
- 4 Module Federation Internals
- 5 CDN Management Workflow
- 6 Protocol Reference
- 7 Configuration and Ports
- 8 Troubleshooting
- 9 Project Structure
- 10 Known Limitations

---

## 1 Quick Start

### 1.1 Prerequisites

- Node 18+
- pnpm 8+
- MongoDB 4+ (only required when using the CDN tab; CDN and MF CDN depend on swifty-cdn)

### 1.2 Installation

```bash
# From the monorepo root
pnpm install
```

### 1.3 Starting the Dev Server

```bash
# From the swifty-devtool directory
cd swifty-devtool

# Development: webpack-dev-server, auto-opens browser
pnpm dev
# -> http://localhost:5173/

# Production build
pnpm build
# -> ./dist/

# Preview the production build
pnpm preview
```

### 1.4 End-to-End Startup Sequence

To exercise all 4 tabs, start 3 services in order:

```bash
# Terminal 1: CDN service (required by CDN tab and MF CDN tab)
cd swifty-cdn
pnpm dev
# -> http://localhost:3300/

# Terminal 2: swifty-demo (required by MF Demo tab; MF CDN tab also needs swifty-demo's dist)
cd swifty-demo
pnpm dev:webpack
# -> http://localhost:3000/

# Terminal 3: swifty-devtool
cd swifty-devtool
pnpm dev
# -> http://localhost:5173/
```

If you only need the Inspector tab, start swifty-devtool and the target Swifty application.

---

## 2 Tab Details

### 2.1 Inspector

Real-time inspection of any Swifty application's Frame tree.

```
+- Header (URL input + connection status + frame count) -+
+- Tab bar [Inspector] MF Demo  CDN  MF CDN  -----------+
+--------------+----------------------------------------+
| Frame Tree   | Details                                |
| - root       | Frame                                  |
|   +- Home    |   ID:        f1                        |
|   +- Counter |   Parent:    root                      |
|   | +- Items |   View Path: components/home           |
|   +- About   |   Children:  3 (3 ready)               |
|              | View                                   |
|              |   Rendered:  Yes                       |
|              |   Signature: 4                         |
|              |   ...                                  |
|              | Children (clickable navigation)        |
+--------------+----------------------------------------+
       hidden <iframe src=targetUrl>
```

Usage:

1 Enter the target Swifty application URL in the Header (e.g., `http://localhost:3000`) and click Connect
2 swifty-devtool loads the URL in a hidden iframe
3 After iframe.onload, a PING is sent automatically at 500ms; retries every 1 second until the target responds with PONG
4 Upon PONG, the frame tree is requested immediately, then polled every 2 seconds
5 The Frame tree in the left panel uses virtual scrolling (@tanstack/react-virtual) with the first 3 levels expanded by default
6 Clicking a node displays all serialized mvc fields in the right panel (rendered/signature/events/resources/updaterData, etc.)

URL sharing: the current target URL is synced to `location.hash`, e.g., `http://localhost:5173#http://localhost:3000` can be shared directly.

Prerequisite: the target Swifty application must have called `Framework.boot()`, which internally invokes `installFrameDevtoolBridge()` to register the postMessage listener.

### 2.2 MF Demo

Demonstrates Webpack Module Federation in static loading mode.

```
+- MF Demo -------------------------------------------+
| [Load Remote View]   * mounted                      |
+-----------------------------------------------------+
| swifty-demo:3000  ->  MF  ->  swifty-devtool:5173        |
| Shared: @swifty.js/mvc (singleton)                    |
+-----------------------------------------------------+
|  +- CounterView (loaded from swifty-demo) ----------+ |
|  | Count: 5                                       | |
|  | [+] [-] [reset]                                | |
|  +------------------------------------------------+ |
+-----------------------------------------------------+
```

Usage:

1 Ensure swifty-demo is running on port 3000
2 Click Load Remote View
3 The webpack runtime automatically loads the container from `http://localhost:3000/remoteEntry.js`
4 Calls `swifty_demo.get("./counter-view")` to obtain the module
5 Executes `mountCounter(containerRef.current)` to render the View
6 Click Unmount to destroy the View; cleanup is handled by the unmount function returned by mountCounter

Key webpack configuration:

```js
new ModuleFederationPlugin({
  name: "swifty_devtool",
  remotes: {
    swifty_demo: "swifty_demo@http://localhost:3000/remoteEntry.js",
  },
  shared: {
    "@swifty.js/mvc": { singleton: true, requiredVersion: "*" },
    react: { singleton: true, eager: true },
    "react-dom": { singleton: true, eager: true },
  },
});
```

### 2.3 CDN

Manages projects and versions on swifty-cdn.

```
+- CDN ----------------------------------------------------+
+------------------+---------------------------------------+
| Projects         | Discover & Publish [Scan Workspace]   |
|  v swifty-demo  3v |  +- admin (dist-vite) v1.0.0 ------+ |
|    default: 1.0  |  | /ws/packages/admin/dist-vite    | |
|   1.0.0 w:100 *  |  |                       [Publish] | |
|   2.0.0 w:50  *  |  +----------------------------------+ |
|   3.0.0 w:0   o  |  +- shop (dist) v0.5.0 ------------+ |
|  > admin     1v  |  | /ws/apps/shop/dist              | |
|                  |  |                       [Publish] | |
|                  |  +----------------------------------+ |
+------------------+---------------------------------------+
```

Usage:

1 Existing projects are loaded automatically on page open (calls `GET /api/projects`)
2 Click Scan Workspace to call `GET /api/discover`, which scans the swifty-cdn workspace
3 For each discovered dist:

- Already registered: displays a "registered" badge; clicking Publish idempotently updates the distPath
- Not registered: clicking Publish calls `POST /api/publish` to create the project + version in one step
  4 In the projects list:
- Expand versions: shows weight, distPath, and active status
- Toggle active: calls `PUT /api/projects/:name/versions/:version`
- Delete version: calls `DELETE /api/projects/:name/versions/:version`
- Delete project: calls `DELETE /api/projects/:name`

All 12 API methods are encapsulated in `src/hooks/use-cdn-api.ts`.

### 2.4 MF CDN

Demonstrates dynamic Module Federation: loads remoteEntry.js from any URL at runtime.

```
+- MF CDN ---------------------------------------------------+
| CDN remoteEntry.js URL                                     |
| [http://localhost:3300/cdn/swifty-demo/remoteEntry.js]       |
| [Load from CDN]   * mounted                                |
+------------------------------------------------------------+
| swifty-cdn:3300  -> dynamic script ->  swifty-devtool:5173      |
| Dynamic MF: runtime remote loading                         |
+------------------------------------------------------------+
|  +- CounterView (loaded from CDN) ---------------------+   |
|  | ...                                                 |   |
|  +-----------------------------------------------------+   |
+------------------------------------------------------------+
```

Differences from MF Demo:

| Dimension       | MF Demo (static)                | MF CDN (dynamic)                            |
| --------------- | ------------------------------- | ------------------------------------------- |
| URL config      | Hardcoded in webpack.config     | User-provided at runtime                    |
| Loading method  | Transparent via webpack runtime | Manual 5-step process (dynamic-remote.ts)   |
| Use case        | Known remotes                   | Multiple remotes / canary switching         |
| Container cache | Managed by webpack internals    | `loadedContainers` Map (cleared on unmount) |

Usage:

1 Enter the CDN remoteEntry.js URL (defaults to swifty-demo)
2 Click Load from CDN
3 Dynamic loading process:
1 Parse the container name (kebab-case to snake_case, e.g., `swifty-demo` -> `swifty_demo`)
2 Inject `<script src=URL>` -> window.**swifty_DemoMF
3 Await `**webpack_init_sharing**("default")`(initialize the shared scope)
4 Await`swifty_demo.init(**webpack_share_scopes\_\_.default)`(let the remote join the shared scope)
5`swifty_demo.get("./counter-view")`-> resolveFactory -> unwrapDefault -> obtain the module
4 Call`mountCounter(containerRef.current)` to render

Prerequisite: the swifty-demo dist must have been published to CDN via the CDN tab or by calling swifty-cdn's publish API directly.

---

## 3 Inspector Integration Guide

To make your Swifty application inspectable, two conditions must be met.

### 3.1 Call Framework.boot()

The mvc `Framework.boot()` method automatically invokes `installFrameDevtoolBridge()`. If you already follow the standard startup flow (i.e., `Framework.boot({ rootView, ... })`), this step is already satisfied.

If you do not use Framework.boot(), install the bridge manually:

```ts
import { installFrameDevtoolBridge } from "@swifty.js/mvc";

installFrameDevtoolBridge();
```

The bridge is idempotent; calling it multiple times is safe.

### 3.2 Allow iframe Embedding

swifty-devtool loads the target URL in an iframe. If your application responds with `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors 'none'`, the iframe load will fail.

Development environments typically do not send these headers (webpack-dev-server and Vite do not by default). For production environments that need Inspector access:

```
Content-Security-Policy: frame-ancestors http://localhost:5173
```

Or more permissive:

```
Content-Security-Policy: frame-ancestors 'self' http://localhost:5173
```

### 3.3 Same-Origin vs Cross-Origin

The Inspector iframe sandbox includes `allow-scripts allow-same-origin`, allowing scripts within the iframe to execute and access same-origin parents. postMessage communication is not restricted by origin.

If the target app and swifty-devtool are on different origins (typical case, e.g., swifty-devtool on 5173, app on 3000), the mvc application inside the iframe can still communicate with swifty-devtool via postMessage. Cookie isolation and localStorage isolation work as expected.

### 3.4 Verifying the Connection

With the target app already running:

1 Open `http://localhost:5173#http://localhost:3000` (substitute your actual URL)
2 The Header should display Connecting, then change to Connected within 1 second
3 The frame count shows the number of nodes in the tree
4 The left panel Frame Tree displays the root node

If the status remains Connecting after 10 seconds, it automatically transitions to Error. Common causes:

- Target app did not call `Framework.boot()` or `installFrameDevtoolBridge()`
- Target URL is incorrect (404 or load failure)
- Target responded with X-Frame-Options
- Target app threw an error during boot, preventing bridge registration

### 3.5 View Field Reference

The DetailPanel displays mvc's `SerializedViewInfo`, defined in `swifty/src/devtool.ts:23-50`:

| Field                          | Description                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `id`                           | View ID, identical to the Frame ID                                                |
| `rendered`                     | Whether the View has rendered at least once                                       |
| `signature`                    | View signature (> 0 indicates active)                                             |
| `observedStateKeys`            | List of State keys being observed                                                 |
| `locationObserved.flag`        | Route observation flag                                                            |
| `locationObserved.keys`        | Route parameter keys being observed                                               |
| `locationObserved.observePath` | Whether the full path is being observed                                           |
| `hasTemplate`                  | Whether the View has a template function                                          |
| `eventMethodKeys`              | Delegated event method names (keys from `$evtObjMap`)                             |
| `resourceKeys`                 | Resource manager key list                                                         |
| `hasAssign`                    | Whether the View has an assign method                                             |
| `updaterData`                  | Shallow copy of Updater refData (primitives preserved, objects become `[object]`) |

---

## 4 Module Federation Internals

### 4.1 Static vs Dynamic

| Dimension         | Static MF (MfDemo)              | Dynamic MF (SfCdnDemo)               |
| ----------------- | ------------------------------- | ------------------------------------ |
| Webpack config    | `remotes: { name: "name@URL" }` | None                                 |
| Load trigger      | `import("name/path")`           | `loadRemoteFromCdn(url, path)`       |
| URL resolution    | Compile time                    | Runtime                              |
| Loading steps     | Transparent via webpack runtime | Manual 5-step process                |
| Share negotiation | Automatic                       | Manual init_sharing + container.init |
| Changing URL      | Modify webpack.config + rebuild | Change the input directly            |

### 4.2 Shared Module Negotiation

```
host (swifty-devtool) boot:
  1 webpack runtime initializes the default share scope
  2 eagerly injects react / react-dom into the share scope
  3 lazily injects @swifty.js/mvc into the share scope (on first import)

host load remote (swifty-demo):
  1 fetch remoteEntry.js -> registers window.__swifty_DemoMF = { init, get }
  2 await __webpack_init_sharing__("default")  // idempotent
  3 await swifty_demo.init(__webpack_share_scopes__.default)
     -> remote inspects the share scope:
       - react / react-dom: uses the host's instance (singleton prevents duplication)
       - @swifty.js/mvc: reuses the host's injected version or falls back to its own
  4 swifty_demo.get("./counter-view")
     -> returns a factory
     -> executes factory -> obtains the module
     -> unwrapDefault unwraps nested ESM default exports
```

If the host and remote load different react instances, React Hooks will throw "Invalid hook call" due to internal dispatcher inconsistency. `singleton: true` and `eager: true` are specifically designed to prevent this.

### 4.3 The 5-Step Process in dynamic-remote.ts

```ts
import { loadRemoteFromCdn, clearRemoteCache } from "./utils/dynamic-remote";

const module = await loadRemoteFromCdn<{
  mountCounter: (el: HTMLElement) => () => void;
}>("http://localhost:3300/cdn/swifty-demo/remoteEntry.js", "./counter-view");

const unmount = module.mountCounter(containerEl);

// Later: unmount + clear cache (so the next load issues a fresh request)
unmount();
clearRemoteCache("http://localhost:3300/cdn/swifty-demo/remoteEntry.js");
```

Internal 5 steps:

```
1 extractContainerName(url)
   -> second-to-last path segment -> kebab-case to snake_case
   -> "http://...swifty-demo/remoteEntry.js" -> "swifty_demo"

2 inject <script src=URL>
   -> script.onload -> window.__swifty_DemoMF = { init, get }
   -> script.onerror -> reject

3 validate that window[name] is a valid MF container
   -> must have init and get functions

4 await __webpack_init_sharing__("default")  // idempotent

5 await container.init(__webpack_share_scopes__.default)

6 container.get(moduleName)
   -> resolveFactory (recursively handles fn / Promise / Promise<fn>)
   -> unwrapDefault (recursively unwraps { default: ... })
   -> cached in the loadedContainers Map
```

### 4.4 Container Naming Convention

Convention: the second-to-last segment of the CDN URL (after removing trailing slashes) equals the kebab-case form of the container name.

Examples:

| URL                                          | Second-to-last segment | Container name |
| -------------------------------------------- | ---------------------- | -------------- |
| `http://host/cdn/swifty-demo/remoteEntry.js` | `swifty-demo`          | `swifty_demo`  |
| `http://host/cdn/admin/remoteEntry.js`       | `admin`                | `admin`        |
| `http://host/cdn/admin@1.0.0/remoteEntry.js` | `admin@1.0.0`          | `admin@1_0_0`  |

Note the third row: if swifty-cdn uses a `@version` suffix, the container name will include `@1_0_0`. This requires the swifty-demo webpack config `name` to match exactly what the URL derives. Currently swifty-demo uses `name: "swifty_demo"`, which matches the `/cdn/swifty-demo/remoteEntry.js` path. If `@version` URLs are used, the webpack config must be updated accordingly.

---

## 5 CDN Management Workflow

### 5.1 Typical Flow

```
1 Start swifty-cdn @ 3300 (with MongoDB)
2 Build any sub-project in the workspace (producing dist/ or dist-vite/ or dist-webpack/)
3 Open swifty-devtool, switch to the CDN tab
4 Click Scan Workspace
5 View the discovered dist list, click Publish
6 Switch to the MF CDN tab
7 The default URL points to swifty-demo's remoteEntry.js
8 Click Load from CDN; the View loads successfully
```

### 5.2 API Call Mapping

Each UI action in the CDN tab corresponds to a swifty-cdn REST API call:

| Action               | API                                                                               |
| -------------------- | --------------------------------------------------------------------------------- |
| Page open            | `GET /api/projects`                                                               |
| Scan Workspace       | `GET /api/discover`                                                               |
| Publish button       | `POST /api/publish`                                                               |
| Toggle active        | `PUT /api/projects/:name/versions/:version` `{ isActive: true/false }`            |
| Delete version       | `DELETE /api/projects/:name/versions/:version`                                    |
| Delete project       | `DELETE /api/projects/:name`                                                      |
| Refresh project list | `GET /api/projects` (refresh icon button, and automatically after publish/delete) |

### 5.3 Error Handling

swifty-cdn uses an envelope response format:

```json
{ "success": true, "data": <T> }
{ "success": false, "error": "...", "message": "..." }
```

`apiRequest` throws `new Error(body.message)` when `success: false`. Components catch `err.message` and display it in the error banner. A loadingCount counter ensures correct loading state during concurrent requests.

### 5.4 Customizing the CDN Base URL

`useCdnApi(baseUrl)` accepts a custom baseUrl:

```tsx
import { useCdnApi } from "./hooks/use-cdn-api";

const api = useCdnApi("http://other-host:3300");
```

Currently CdnManager does not use this parameter (always defaults to `http://localhost:3300`). To switch, modify `src/components/cdn-manager.tsx` line 33:

```tsx
const api = useCdnApi(import.meta.env.VITE_CDN_BASE ?? undefined);
```

---

## 6 Protocol Reference

### 6.1 postMessage Protocol (swifty-devtool <-> Swifty app)

5 message types:

| Constant           | String                        | Direction      | Payload                                               |
| ------------------ | ----------------------------- | -------------- | ----------------------------------------------------- |
| `MSG_PING`         | `SWIFTY_DEVTOOL_PING`         | devtool -> app | (none)                                                |
| `MSG_PONG`         | `SWIFTY_DEVTOOL_PONG`         | app -> devtool | (none)                                                |
| `MSG_REQUEST_TREE` | `SWIFTY_DEVTOOL_REQUEST_TREE` | devtool -> app | (none)                                                |
| `MSG_TREE`         | `SWIFTY_DEVTOOL_TREE`         | app -> devtool | `SerializedFrameTree`                                 |
| `MSG_TREE_DELTA`   | `SWIFTY_DEVTOOL_TREE_DELTA`   | app -> devtool | `SerializedFrameTree` (full tree; name is historical) |

Defined in `swifty/src/devtool.ts:88-94` (mvc-side `FrameDevtoolBridge`) and `swifty-devtool/src/types.ts:22-26`.

### 6.2 ConnectionStatus State Machine

```
disconnected --setTargetUrl--> connecting --PONG--> connected
                                   |
                                   +--10s timeout--> error
```

### 6.3 Three Timers

| Timer          | Period | Start condition      | Clear condition                             |
| -------------- | ------ | -------------------- | ------------------------------------------- |
| `pingTimerRef` | 1s     | targetUrl changes    | PONG received / unmount / targetUrl changes |
| `timeoutRef`   | 10s    | targetUrl changes    | PONG received / unmount / targetUrl changes |
| `pollTimerRef` | 2s     | status === connected | status leaves connected / unmount           |

### 6.4 REST API Envelope

Success:

```json
{ "success": true, "data": <T> }
```

Failure:

```json
{ "success": false, "error": "ValidationError", "message": "..." }
```

`apiRequest` (`src/hooks/use-cdn-api.ts:60`) throws `Error` when `success: false`.

---

## 7 Configuration and Ports

### 7.1 Port Conventions

| Service        | Port | Purpose                               |
| -------------- | ---- | ------------------------------------- |
| swifty-devtool | 5173 | Host (this service)                   |
| swifty-demo    | 3000 | MF remote (MF Demo tab)               |
| swifty-cdn     | 3300 | REST API + CDN (CDN tab + MF CDN tab) |

Changing ports:

- swifty-devtool: `devServer.port` in `webpack.config.mjs`
- swifty-demo: update the port in its `webpack.config.mjs` + update `ModuleFederationPlugin.remotes` in swifty-devtool
- swifty-cdn: environment variable `CDN_PORT`; also update `DEFAULT_BASE` in `src/hooks/use-cdn-api.ts:17`

### 7.2 Module Federation Configuration

```js
new ModuleFederationPlugin({
  name: "swifty_devtool",
  remotes: {
    swifty_demo: "swifty_demo@http://localhost:3000/remoteEntry.js",
  },
  shared: {
    "@swifty.js/mvc": { singleton: true, requiredVersion: "*" },
    react: { singleton: true, eager: true },
    "react-dom": { singleton: true, eager: true },
  },
});
```

- `name`: global variable name this host registers on window
- `remotes`: static remote list; keys serve as import path prefixes
- `shared`: shared modules; react must be eager+singleton

### 7.3 devServer CORS

```js
devServer: {
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  },
}
```

Fully open CORS allows swifty-cdn and other tools to load swifty-devtool's resources. This is appropriate for a dev tool; do not deploy this configuration to production as-is.

### 7.4 TypeScript Configuration

`tsconfig.json` enables:

- `target: es2023` + `lib: [ES2023, DOM]`
- `moduleResolution: bundler`
- `jsx: react-jsx`
- `erasableSyntaxOnly: true` (TS 6 feature; disables non-erasable syntax like enums and namespaces)
- `noUnusedLocals` `noUnusedParameters` `noFallthroughCasesInSwitch`
- `strict: true` is not explicitly specified, but TS 6.0.3 enables strictNullChecks by default

Recommendation: explicitly enable `strict: true` and `noUncheckedIndexedAccess: true` to lock in behavior.

---

## 8 Troubleshooting

### 8.1 Inspector Stuck on Connecting

After 10 seconds, the status automatically transitions to Error. Possible causes:

1 Target URL is incorrect or returns 404
2 Target app did not call `Framework.boot()` or `installFrameDevtoolBridge()`
3 Target responded with `X-Frame-Options: DENY`, blocking iframe embedding
4 Target app threw an error during boot, preventing bridge registration (check browser console)

To verify whether the bridge is installed, run this in the target app's console:

```js
window.postMessage({ type: "SWIFTY_DEVTOOL_PING" }, "*");
window.addEventListener("message", (e) => console.log("got", e.data));
```

You should see `got { type: "SWIFTY_DEVTOOL_PONG" }`. If not, the bridge is not installed.

### 8.2 Inspector Connected but Frame Count is 0

The mvc `Frame.getRoot()` may be returning null (the app has not finished booting or has no root Frame). Wait 1-2 poll cycles, or manually click the refresh button.

### 8.3 MF Demo Load Remote View Fails

The error message provides direct guidance:

```
Failed to load remote module
Loading script failed: http://localhost:3000/remoteEntry.js
Make sure swifty-demo is running on port 3000:
  cd ./swifty-demo && pnpm dev:webpack
```

Follow the instructions to start swifty-demo.

If swifty-demo is already running but loading still fails, common causes include:

- swifty-demo's webpack config `name` is not `swifty_demo` (does not match swifty-devtool's remotes key)
- swifty-demo does not expose `./counter-view`
- Port conflict: another service is occupying port 3000

### 8.4 MF CDN Load from CDN Fails

Error type 1: `Failed to load remote entry: <url>`

The CDN URL is unreachable. Verify that swifty-cdn is running, the URL path is correct, and CORS is enabled.

Error type 2: `Container "swifty_demo" not found on window after loading <url>`

The remoteEntry.js loaded but did not register a global variable. Likely the swifty-demo webpack `name` does not match the container name derived from the URL.

Error type 3: `mountCounter not found in remote module. Module keys: [...]`

The remoteEntry.js exposes a module without the mountCounter export. Check swifty-demo's `exposes` path.

Error type 4: `Module "./counter-view" not found in container "swifty_demo"`

The swifty-demo expose path name does not match the URL. Check the `exposes` configuration in swifty-demo's webpack config.

### 8.5 CDN Tab Shows "Failed to fetch"

swifty-cdn is not running or is not on port 3300.

```bash
curl http://localhost:3300/api/health
```

Expected response: `{"success":true,"data":{"status":"ok",...}}`.

### 8.6 CDN Tab Publish Button Fails

The error message is displayed in the red error banner above the Discover section. Common errors:

- `Invalid distPath`: the dist path is not within swifty-cdn's configured `CDN_WORKSPACE_ROOT`
- `Validation error`: the project name or version contains illegal characters (only `[a-zA-Z0-9._-]` allowed; project names must start with an alphanumeric character)

### 8.7 Switching Tabs Causes Inspector to Reconnect

Known behavior: the iframe is only rendered when `activeTab === "inspector"`. Switching away and back triggers iframe remount, which restarts the PING/PONG sequence. If the target app is slow to start, wait a few seconds.

### 8.8 MF CDN Reloads Stale Code After Unmount

Known limitation: `clearRemoteCache(url)` only clears the internal Map, not `window[containerName]`. If the swifty-cdn remoteEntry.js content has been updated but the container name remains the same, reloading will skip script injection and reuse the stale container.

Workaround: refresh the entire swifty-devtool page.

### 8.9 Tailwind Styles Not Applied

Verify that `index.css` contains `@import "tailwindcss";` and that the webpack CSS processing chain includes `postcss-loader` with the `@tailwindcss/postcss` plugin.

---

## 9 Project Structure

```
swifty-devtool/
+-- index.html                          // bootstrap HTML
+-- webpack.config.mjs                  // webpack + MF + dev-server config
+-- tsconfig.json                       // TS configuration
+-- package.json                        // dependencies and scripts
+-- public/
|   +-- favicon.svg
|   +-- icons.svg                       // optional icon assets (copied by copy-webpack-plugin)
+-- src/
    +-- main.tsx                        // React root mount
    +-- remote-entry.tsx                // MF async boundary (import("./main"))
    +-- app.tsx                         // 4-tab switching + iframe lifecycle + selection
    +-- types.ts                        // re-exports mvc types + 5 message constants
    +-- mf-types.d.ts                   // swifty-demo/counter-view module declaration
    +-- vite-env.d.ts                   // *.css/svg/png asset declarations (legacy naming)
    +-- index.css                       // @import "tailwindcss"
    +-- hooks/
    |   +-- use-frame-tree.ts           // postMessage protocol + 3 timers
    |   +-- use-cdn-api.ts              // 12 REST API wrappers + loadingCount
    +-- components/
    |   +-- header.tsx                  // URL input + status badge
    |   +-- virtual-frame-tree.tsx      // @tanstack/react-virtual virtualized tree
    |   +-- frame-tree-node.tsx         // recursive tree version (dead code, replaced by virtual)
    |   +-- detail-panel.tsx            // selected Frame details, clickable child nodes
    |   +-- empty-state.tsx             // tri-state empty display
    |   +-- error-boundary.tsx          // class-based error boundary + Retry
    |   +-- mf-demo.tsx                 // static MF demo
    |   +-- cdn-manager.tsx             // CDN project/version management (dual-panel)
    |   +-- sf-cdn-demo.tsx             // dynamic MF demo
    +-- utils/
        +-- dynamic-remote.ts           // 5-step dynamic MF loading
        +-- frame-status.ts             // 6-state Frame status determination
```

Tech stack:

- Framework: React 19.2.7
- Swifty: @swifty.js/mvc (workspace internal dependency)
- Build: Webpack 5.107 + ts-loader + ModuleFederationPlugin
- Styling: Tailwind 4.3 + PostCSS 4 + style-loader
- Virtual list: @tanstack/react-virtual 3.14
- Icons: lucide-react 1.17
- TypeScript: 6.0.3 (with erasableSyntaxOnly)

---

## 10 Known Limitations

For detailed analysis, see `code-review.md` section 7. Ordered by priority:

| ID    | Limitation                                                                   | Impact                                  |
| ----- | ---------------------------------------------------------------------------- | --------------------------------------- |
| K2    | `DiscoveredDist.type` is missing the `dist-vite` variant                     | Type contract inaccuracy                |
| K1    | useFrameTree ping timer not cleared after timeout                            | Resource waste + console noise          |
| K8    | `clearRemoteCache` does not clear `window[containerName]`                    | Reload after unmount shows stale code   |
| K3    | `frame-tree-node.tsx` is dead code                                           | Maintenance noise                       |
| K4    | `detail-panel.tsx` child node className missing space, cursor-pointer broken | Visual only, no functional impact       |
| K7    | iframe sandbox contains `allow-scripts allow-same-origin` (high-risk combo)  | Acceptable for a dev tool               |
| K11   | useCdnApi error state can be overwritten during concurrent requests          | Minimal real-world impact               |
| K17   | Inspector tab not wrapped in ErrorBoundary                                   | mvc serialization is stable; low impact |
| Other | K5-K6 K9-K10 K12-K16 K18 documented in code-review.md                        | Minor impact                            |

Do not deploy swifty-devtool to a public network: the iframe sandbox configuration, fully open CORS, and dynamic script injection without SRI/CSP are not suitable for production. This tool is intended for use during development and integration testing only.

---

## License

See `LICENSE` in the repository root.
