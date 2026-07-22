# Micro-Frontends

swifty-mvc provides first-class support for micro-frontend architectures through Module Federation integration, async module loading via `Framework.use()`, and a custom require mechanism that enables host-remote patterns across independently deployed applications.

## What is a Micro-Frontend? {#what-is-a-micro-frontend}

A micro-frontend is an architectural pattern where a monolithic web application is decomposed into smaller, independently deployable pieces. Each piece—owned by a different team—builds, tests, and deploys on its own schedule while composing into a unified user experience at runtime.

swifty-mvc supports this pattern through three mechanisms:

Module Federation Integration allows multiple swifty-mvc applications to share views, components, and utilities at runtime without duplicating code in each bundle. The host application dynamically loads remote modules from independently deployed services.

Async Module Loading via `Framework.use()` provides a unified API for loading views whether they live in the local bundle or in a remote application. The same code path handles both cases, making the boundary between local and remote transparent to view implementations.

Project Naming via `projectName` enables the framework to distinguish between views that belong to the current application and views that belong to remote applications, routing module loads to the correct source.

## Module Federation Integration {#module-federation-integration}

Module Federation is a runtime module sharing mechanism originally introduced in Webpack 5 and now supported by Rspack, Vite (via plugins), and other bundlers. It allows one application (the host) to consume modules exposed by another application (the remote) at runtime.

### Host Application Configuration {#host-configuration}

The host application configures `Framework.boot()` with a custom `require` function that bridges `Framework.use()` to the Module Federation runtime. The require function receives an array of module names and returns a Promise that resolves to the loaded modules.

```typescript
// host-app/main.ts
import { Framework } from "swifty-mvc";

// Webpack Module Federation runtime
declare const __webpack_init_sharing__: (shareScope: string) => Promise<void>;
declare const __webpack_get_script_filename__: (chunkId: string) => string;

// Remote container loaded dynamically
const loadRemoteModule = async (
  remoteName: string,
  modulePath: string,
): Promise<unknown> => {
  await __webpack_init_sharing__("default");
  const container = window[remoteName];
  await container.init(__webpack_share_scopes__.default);
  const factory = await container.get(modulePath);
  return factory();
};

Framework.boot({
  rootId: "app",
  projectName: "host-app",
  defaultView: "host-app/views/home",

  require: async (names: string[], params?: Record<string, unknown>) => {
    return Promise.all(
      names.map((name) => {
        // Parse "remote-app/views/dashboard" into remote and module
        const [remoteName, ...rest] = name.split("/");
        if (remoteName === "host-app") {
          // Local module: use dynamic import
          return import(`./${rest.join("/")}`);
        } else {
          // Remote module: use Module Federation
          return loadRemoteModule(remoteName, `./${rest.join("/")}`);
        }
      }),
    );
  },

  routes: {
    "/": "host-app/views/home",
    "/dashboard": "dashboard-app/views/dashboard",
    "/settings": "host-app/views/settings",
  },
});
```

The `require` function is the integration point. When `Framework.use()` is called internally to load a view, it delegates to this function. The function inspects the module name, determines whether it belongs to the local project or a remote project, and loads it accordingly.

### Remote Application Configuration {#remote-configuration}

The remote application exposes views and other modules through its bundler's Module Federation plugin. It also calls `Framework.boot()` to initialize its own framework instance, which is necessary when the remote application runs standalone during development.

```typescript
// dashboard-app/main.ts
import { Framework } from "swifty-mvc";

Framework.boot({
  rootId: "dashboard-app",
  projectName: "dashboard-app",
  defaultView: "dashboard-app/views/dashboard",
});

// The bundler configuration exposes modules:
// webpack.config.js or rspack.config.js:
//
// new ModuleFederationPlugin({
//   name: "dashboard-app",
//   filename: "remoteEntry.js",
//   exposes: {
//     "./views/dashboard": "./src/views/dashboard.ts",
//     "./views/analytics": "./src/views/analytics.ts",
//   },
//   shared: ["swifty-mvc"],
// });
```

When the remote application runs standalone, it behaves like a normal swifty-mvc application. When it is loaded as a remote by a host application, the host's `require` function fetches the exposed modules through the Module Federation container.

## Framework.use() for Async Module Loading {#framework-use}

`Framework.use()` is the primary API for loading modules asynchronously. It accepts a single module name or an array of names, along with an optional callback that receives the loaded modules.

### Basic Usage {#basic-usage}

```typescript
import { Framework } from "swifty-mvc";

// Load a single module with callback
Framework.use("dashboard-app/views/dashboard", (dashboardModule) => {
  console.log("Dashboard loaded:", dashboardModule);
});

// Load multiple modules
Framework.use(
  ["host-app/views/home", "host-app/views/settings"],
  (homeModule, settingsModule) => {
    console.log("Both modules loaded");
  },
);
```

### How It Works {#how-it-works}

When `Framework.use()` is called, it checks whether `FrameworkConfig.require` is configured. If it is, the function delegates to the custom require function, passing the array of module names. The require function is responsible for resolving the modules—whether from the local bundle, a remote Module Federation container, or any other source—and returning a Promise.

If `require` is not configured, `Framework.use()` falls back to dynamic `import()`. This fallback is useful for simple applications that do not need Module Federation but still want async loading with code splitting.

```typescript
// Without custom require: falls back to dynamic import
Framework.boot({
  rootId: "app",
  defaultView: "views/home",
});

// Framework.use("views/home") internally calls:
// import("./views/home")
```

The fallback normalizes the module path, handles both CommonJS and ESM exports, and extracts the default export when present. This ensures compatibility across different bundler configurations.

### Error Handling {#error-handling}

When a module fails to load, `Framework.use()` invokes the `error` handler configured in `Framework.boot()`. The handler receives an Error object describing the failure.

```typescript
Framework.boot({
  rootId: "app",
  error: (error: Error) => {
    console.error("Module load failed:", error.message);
    showErrorToast("Failed to load module");
  },
});
```

If no error handler is configured, the default behavior is to throw the error, which will reject the Promise returned by `Framework.use()`.

## FrameworkConfig.require for Custom Loading Strategies {#custom-require}

The `require` field in `FrameworkConfig` is the extension point for custom module loading strategies. It is a function that receives an array of module names and returns a Promise resolving to an array of loaded modules.

### Signature {#require-signature}

```typescript
interface FrameworkConfig {
  require?: (
    names: string[],
    params?: Record<string, unknown>,
  ) => Promise<unknown[]> | undefined;
}
```

The function may return `undefined` if it cannot handle the request, in which case `Framework.use()` falls back to dynamic import. This allows hybrid strategies where some modules are loaded through custom logic and others use the default mechanism.

### Custom Strategy Examples {#custom-strategy-examples}

#### CDN-Based Loading {#cdn-loading}

Load modules from a CDN based on environment or feature flags:

```typescript
Framework.boot({
  rootId: "app",
  projectName: "host-app",

  require: async (names: string[]) => {
    return Promise.all(
      names.map((name) => {
        const [project, ...rest] = name.split("/");

        if (project === "host-app") {
          return import(`./${rest.join("/")}`);
        }

        // Load from CDN for remote projects
        const cdnBase = getCdnBaseUrl(); // e.g., "https://cdn.example.com"
        const modulePath = `${cdnBase}/${project}/latest/${rest.join("/")}.js`;

        return import(/* @vite-ignore */ modulePath);
      }),
    );
  },
});
```

#### Conditional Loading Based on Feature Flags {#feature-flags}

Route module loads to different implementations based on feature flags:

```typescript
Framework.boot({
  rootId: "app",

  require: async (names: string[]) => {
    return Promise.all(
      names.map((name) => {
        if (name.includes("checkout") && featureFlags.newCheckout) {
          return import("./views/checkout-v2");
        }
        return import(`./${name}`);
      }),
    );
  },
});
```

#### Lazy Loading with Prefetching {#lazy-prefetch}

Implement prefetching for anticipated navigation:

```typescript
const prefetchedModules = new Map<string, Promise<unknown>>();

const prefetch = (moduleName: string) => {
  if (!prefetchedModules.has(moduleName)) {
    prefetchedModules.set(
      moduleName,
      Framework.use(moduleName).catch(() => undefined),
    );
  }
};

Framework.boot({
  rootId: "app",

  require: async (names: string[]) => {
    return Promise.all(
      names.map((name) => {
        if (prefetchedModules.has(name)) {
          return prefetchedModules.get(name);
        }
        return import(`./${name}`);
      }),
    );
  },
});

// Prefetch likely navigation targets
Router.on("changed", (diff) => {
  if (diff.view?.to === "/dashboard") {
    prefetch("analytics-app/views/reports");
  }
});
```

## Project Naming with projectName {#project-name}

The `projectName` configuration field tells the framework which project the current application belongs to. This is essential in micro-frontend scenarios where the host and remote applications have different project names.

### Purpose {#project-name-purpose}

When a view path like `dashboard-app/views/dashboard` is encountered, the framework needs to know whether this view belongs to the current application or a remote application. The `projectName` field provides this information.

If `projectName` is set to `host-app`, then:

- `host-app/views/home` is a local view loaded from the current bundle
- `dashboard-app/views/dashboard` is a remote view loaded through the custom require function

### Configuration {#project-name-configuration}

```typescript
// Host application
Framework.boot({
  rootId: "app",
  projectName: "host-app",
  routes: {
    "/": "host-app/views/home",
    "/dashboard": "dashboard-app/views/dashboard",
  },
});

// Remote application (when running standalone)
Framework.boot({
  rootId: "dashboard-app",
  projectName: "dashboard-app",
  routes: {
    "/": "dashboard-app/views/dashboard",
  },
});
```

### View Path Resolution {#view-path-resolution}

When `Framework.use()` is called with a view path, the custom require function can inspect the project name prefix to determine the loading strategy:

```typescript
require: async (names: string[]) => {
  const currentProject = Framework.getConfig("projectName");

  return Promise.all(
    names.map((name) => {
      const [project] = name.split("/");

      if (project === currentProject) {
        // Local module
        return import(`./${name.slice(project.length + 1)}`);
      } else {
        // Remote module
        return loadRemoteModule(project, name);
      }
    }),
  );
};
```

## Host-Remote Patterns {#host-remote-patterns}

Micro-frontend architectures typically follow one of several host-remote patterns, each with different trade-offs for deployment independence, runtime integration, and team autonomy.

### Single Host, Multiple Remotes {#single-host}

A single host application composes multiple remote applications. This is the most common pattern for enterprise dashboards and portals.

```typescript
// host-app/main.ts
Framework.boot({
  rootId: "app",
  projectName: "host-app",

  require: async (names: string[]) => {
    return Promise.all(
      names.map((name) => {
        const [project, ...rest] = name.split("/");

        switch (project) {
          case "host-app":
            return import(`./${rest.join("/")}`);
          case "dashboard-app":
            return loadRemoteModule("dashboardApp", `./${rest.join("/")}`);
          case "analytics-app":
            return loadRemoteModule("analyticsApp", `./${rest.join("/")}`);
          case "settings-app":
            return loadRemoteModule("settingsApp", `./${rest.join("/")}`);
          default:
            throw new Error(`Unknown project: ${project}`);
        }
      }),
    );
  },

  routes: {
    "/": "host-app/views/home",
    "/dashboard": "dashboard-app/views/dashboard",
    "/analytics": "analytics-app/views/reports",
    "/settings": "settings-app/views/settings",
  },
});
```

### Shared Shell Pattern {#shared-shell}

Multiple applications share a common shell (navigation, layout, authentication) but each owns its own feature domain. The shell is the host; the feature applications are remotes.

```typescript
// shell-app/views/layout.ts
import { defineView, Framework } from "swifty-mvc";
import template from "./layout.html";

export default defineView((ctx) => {
  const { Frame } = Framework;

  return {
    template,

    assign: (options: { viewPath: string }) => {
      const frame = Frame.get("content-zone");
      if (frame) {
        frame.mountView(options.viewPath);
      }
      return true;
    },
  };
});
```

```html
<!-- shell-app/views/layout.html -->
<div class="shell">
  <nav class="sidebar">
    <a href="/dashboard" data-swifty-nav="true">Dashboard</a>
    <a href="/analytics" data-swifty-nav="true">Analytics</a>
    <a href="/settings" data-swifty-nav="true">Settings</a>
  </nav>
  <main id="content-zone" v-swifty=""></main>
</div>
```

### Nested Remotes {#nested-remotes}

A remote application can itself be a host to other remotes, creating a hierarchy of independently deployed applications.

```typescript
// dashboard-app/main.ts (remote that is also a host)
Framework.boot({
  rootId: "dashboard-app",
  projectName: "dashboard-app",

  require: async (names: string[]) => {
    return Promise.all(
      names.map((name) => {
        const [project, ...rest] = name.split("/");

        if (project === "dashboard-app") {
          return import(`./${rest.join("/")}`);
        } else if (project === "charts-app") {
          return loadRemoteModule("chartsApp", `./${rest.join("/")}`);
        }

        return import(`./${name}`);
      }),
    );
  },

  routes: {
    "/": "dashboard-app/views/dashboard",
  },
});
```

```typescript
// dashboard-app/views/dashboard.ts
import { defineView, Framework } from "swifty-mvc";
import template from "./dashboard.html";

export default defineView((ctx) => {
  const { Frame } = Framework;

  ctx.on("render", () => {
    const chartFrame = Frame.get("chart-container");
    if (chartFrame) {
      chartFrame.mountView("charts-app/views/line-chart");
    }
  });

  return { template };
});
```

## Cross-Application Communication {#cross-app-communication}

Micro-frontends need to communicate with each other while maintaining loose coupling. swifty-mvc provides several mechanisms for cross-application communication.

### Global State (State Singleton) {#global-state}

The `State` singleton is shared across all applications running in the same browser context. It is the simplest mechanism for sharing lightweight data like user information, feature flags, or session state.

```typescript
// host-app sets global state
import { State } from "swifty-mvc";

State.set({
  user: currentUser,
  theme: "dark",
  locale: "en-US",
});
State.digest();

// remote-app reads global state
import { State, defineView } from "swifty-mvc";

export default defineView((ctx) => {
  const user = State.get("user");
  const theme = State.get("theme");

  return {
    template,
    // template can access user and theme
  };
});
```

Remote applications can observe state changes using `ctx.observeState()`:

```typescript
export default defineView((ctx) => {
  ctx.observeState("user,theme");

  return {
    template,
    // view re-renders when user or theme changes
  };
});
```

### Custom Events via Framework.dispatchEvent {#custom-events}

`Framework.dispatchEvent()` fires custom DOM events that can be observed by any application in the same document. This is useful for decoupled, event-driven communication.

```typescript
// dashboard-app emits an event
import { Framework } from "swifty-mvc";

Framework.dispatchEvent(document.body, "dashboard:export-requested", {
  detail: { reportId: "abc123" },
});

// analytics-app listens for the event
document.body.addEventListener("dashboard:export-requested", (event) => {
  const { reportId } = event.detail;
  exportReport(reportId);
});
```

### URL-Based Communication {#url-communication}

The router is shared across all applications. Navigation in one application triggers route changes that other applications can observe.

```typescript
// host-app navigates
import { Framework } from "swifty-mvc";

Framework.Router.to("/analytics", { reportId: "abc123" });

// analytics-app observes route changes
import { defineView } from "swifty-mvc";

export default defineView((ctx) => {
  ctx.observeLocation({
    observePath: true,
    params: "reportId",
  });

  return {
    template,
    // view re-renders when path or reportId changes
  };
});
```

### Module Exports {#module-exports}

Remote applications can export utilities, services, or stores that host applications consume directly through Module Federation.

```typescript
// analytics-app exposes a service
// analytics-app/services/report-service.ts
import { createService } from "swifty-mvc";

export const ReportService = createService(syncFn, 100, 10);

ReportService.add({
  name: "getReport",
  url: "/api/reports/:id",
  method: "GET",
});

// Module Federation exposes this module
// webpack.config.js:
// exposes: {
//   "./services/report-service": "./src/services/report-service.ts",
// }
```

```typescript
// host-app consumes the service
import { Framework } from "swifty-mvc";

const reportServiceModule = await Framework.use(
  "analytics-app/services/report-service",
);
const { ReportService } = reportServiceModule;

const report = await ReportService.all({
  getReport: { id: "abc123" },
});
```

## Devtool Bridge {#devtool-bridge}

swifty-mvc includes a Devtool Bridge that enables browser extensions and developer tools to inspect the frame tree across all applications in a micro-frontend architecture. The bridge uses the `postMessage` API to communicate between the application and the devtool panel.

### Protocol Overview {#devtool-protocol}

The bridge implements a simple request-response protocol with automatic delta updates:

- `SWIFTY_DEVTOOL_PING` - Devtool pings the application to check if it is a swifty-mvc app
- `SWIFTY_DEVTOOL_PONG` - Application responds to confirm it is running
- `SWIFTY_DEVTOOL_REQUEST_TREE` - Devtool requests the current frame tree
- `SWIFTY_DEVTOOL_TREE` - Application responds with the serialized frame tree
- `SWIFTY_DEVTOOL_TREE_DELTA` - Application pushes updates when the frame tree changes

### Enabling the Bridge {#enable-bridge}

The bridge is enabled by default. It can be disabled by setting `devtool: false` in the framework configuration:

```typescript
Framework.boot({
  rootId: "app",
  devtool: false, // Disable the devtool bridge
});
```

In production builds, you may want to disable the bridge to reduce the attack surface and eliminate the overhead of tree serialization:

```typescript
Framework.boot({
  rootId: "app",
  devtool: process.env.NODE_ENV === "development",
});
```

### Cross-Application Inspection {#cross-app-inspection}

When multiple swifty-mvc applications run in the same page (host + remotes), each application installs its own bridge. The devtool panel can inspect the frame tree of any application by sending messages to the appropriate window or iframe.

```typescript
// Devtool panel code (runs in an iframe or browser extension)
const inspectApplication = (targetWindow: Window) => {
  // Ping to check if it's a swifty-mvc app
  targetWindow.postMessage({ type: "SWIFTY_DEVTOOL_PING" }, "*");

  // Listen for pong
  window.addEventListener("message", (event) => {
    if (event.data.type === "SWIFTY_DEVTOOL_PONG") {
      // Request the frame tree
      targetWindow.postMessage({ type: "SWIFTY_DEVTOOL_REQUEST_TREE" }, "*");
    }

    if (event.data.type === "SWIFTY_DEVTOOL_TREE") {
      const tree = event.data.data;
      renderFrameTree(tree);
    }
  });
};
```

### Serialized Frame Tree {#serialized-tree}

The serialized frame tree includes detailed information about each frame and its mounted view:

```typescript
interface SerializedFrameTree {
  root: SerializedFrameNode | null;
  totalFrames: number;
  timestamp: number;
  rootId: string;
}

interface SerializedFrameNode {
  id: string;
  parentId: string | null;
  viewPath: string | null;
  childrenCount: number;
  readyCount: number;
  childrenCreated: number;
  childrenAlter: number;
  destroyed: number;
  view: SerializedViewInfo | null;
  children: SerializedFrameNode[];
}

interface SerializedViewInfo {
  id: string;
  rendered: boolean;
  signature: number;
  observedStateKeys: string[] | null;
  locationObserved: {
    flag: number;
    keys: string[];
    observePath: boolean;
  };
  hasTemplate: boolean;
  eventMethodKeys: string[];
  resourceKeys: string[];
  hasAssign: boolean;
  updaterData: Record<string, unknown> | null;
}
```

The devtool can use this information to visualize the frame hierarchy, inspect view state, and debug rendering issues across application boundaries.

## Complete Example {#complete-example}

The following example demonstrates a complete micro-frontend setup with a host application and two remote applications.

### Project Structure {#project-structure}

```
micro-frontend-example/
├── host-app/
│   ├── src/
│   │   ├── main.ts
│   │   └── views/
│   │       ├── home.ts
│   │       ├── home.html
│   │       └── layout.ts
│   ├── webpack.config.js
│   └── package.json
├── dashboard-app/
│   ├── src/
│   │   ├── main.ts
│   │   └── views/
│   │       ├── dashboard.ts
│   │       └── dashboard.html
│   ├── webpack.config.js
│   └── package.json
└── analytics-app/
    ├── src/
    │   ├── main.ts
    │   └── views/
    │       ├── reports.ts
    │       └── reports.html
    ├── webpack.config.js
    └── package.json
```

### Host Application {#host-app-example}

```typescript
// host-app/src/main.ts
import { Framework, State } from "swifty-mvc";

// Initialize global state
State.set({
  user: { name: "Alice", role: "admin" },
  theme: "light",
});
State.digest();

// Module Federation runtime
declare const __webpack_init_sharing__: (shareScope: string) => Promise<void>;

const loadRemoteModule = async (
  remoteName: string,
  modulePath: string,
): Promise<unknown> => {
  await __webpack_init_sharing__("default");
  const container = window[remoteName];
  if (!container) {
    throw new Error(`Remote ${remoteName} not loaded`);
  }
  await container.init(__webpack_share_scopes__.default);
  const factory = await container.get(modulePath);
  return factory();
};

Framework.boot({
  rootId: "app",
  projectName: "host-app",
  defaultView: "host-app/views/home",

  require: async (names: string[]) => {
    return Promise.all(
      names.map((name) => {
        const [project, ...rest] = name.split("/");
        const modulePath = `./${rest.join("/")}`;

        if (project === "host-app") {
          return import(modulePath);
        } else if (project === "dashboard-app") {
          return loadRemoteModule("dashboardApp", modulePath);
        } else if (project === "analytics-app") {
          return loadRemoteModule("analyticsApp", modulePath);
        }

        throw new Error(`Unknown project: ${project}`);
      }),
    );
  },

  routes: {
    "/": "host-app/views/home",
    "/dashboard": "dashboard-app/views/dashboard",
    "/analytics": "analytics-app/views/reports",
  },

  error: (error: Error) => {
    console.error("Framework error:", error);
  },
});
```

```typescript
// host-app/src/views/home.ts
import { defineView, State } from "swifty-mvc";
import template from "./home.html";

export default defineView((ctx) => {
  const user = State.get("user");

  return {
    template,
    // template receives user data
  };
});
```

```html
<!-- host-app/src/views/home.html -->
<div class="home">
  <h1>Welcome, {{user.name}}</h1>
  <nav>
    <a href="/dashboard" data-swifty-nav="true">Dashboard</a>
    <a href="/analytics" data-swifty-nav="true">Analytics</a>
  </nav>
</div>
```

### Dashboard Remote Application {#dashboard-app-example}

```typescript
// dashboard-app/src/main.ts
import { Framework } from "swifty-mvc";

Framework.boot({
  rootId: "dashboard-app",
  projectName: "dashboard-app",
  defaultView: "dashboard-app/views/dashboard",
});
```

```typescript
// dashboard-app/src/views/dashboard.ts
import { defineView, State, Framework } from "swifty-mvc";
import template from "./dashboard.html";

export default defineView((ctx) => {
  ctx.observeState("user");

  const loadAnalyticsChart = async () => {
    const chartModule = await Framework.use("analytics-app/components/chart");
    const { renderChart } = chartModule;
    renderChart("chart-container", { type: "line" });
  };

  return {
    template,
    events: {
      "load-chart<click>": loadAnalyticsChart,
    },
  };
});
```

```html
<!-- dashboard-app/src/views/dashboard.html -->
<div class="dashboard">
  <h2>Dashboard</h2>
  <div id="chart-container"></div>
  <button @click="load-chart">Load Chart</button>
</div>
```

### Analytics Remote Application {#analytics-app-example}

```typescript
// analytics-app/src/main.ts
import { Framework } from "swifty-mvc";

Framework.boot({
  rootId: "analytics-app",
  projectName: "analytics-app",
  defaultView: "analytics-app/views/reports",
});
```

```typescript
// analytics-app/src/views/reports.ts
import { defineView, State } from "swifty-mvc";
import template from "./reports.html";

export default defineView((ctx) => {
  ctx.observeState("user");
  ctx.observeLocation({ params: "reportId" });

  const user = State.get("user");
  const reportId = Framework.Router.parse().get("reportId");

  return {
    template,
    // template receives user and reportId
  };
});
```

### Webpack Configuration {#webpack-config-example}

```javascript
// host-app/webpack.config.js
const { ModuleFederationPlugin } = require("webpack").container;
const { SwiftyMvcPlugin } = require("swifty-mvc/webpack");

module.exports = {
  plugins: [
    new SwiftyMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
    }),

    new ModuleFederationPlugin({
      name: "hostApp",
      remotes: {
        dashboardApp: "dashboardApp@http://localhost:3001/remoteEntry.js",
        analyticsApp: "analyticsApp@http://localhost:3002/remoteEntry.js",
      },
      shared: ["swifty-mvc"],
    }),
  ],
};
```

```javascript
// dashboard-app/webpack.config.js
const { ModuleFederationPlugin } = require("webpack").container;
const { SwiftyMvcPlugin } = require("swifty-mvc/webpack");

module.exports = {
  plugins: [
    new SwiftyMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
    }),

    new ModuleFederationPlugin({
      name: "dashboardApp",
      filename: "remoteEntry.js",
      exposes: {
        "./views/dashboard": "./src/views/dashboard.ts",
        "./components/widget": "./src/components/widget.ts",
      },
      shared: ["swifty-mvc"],
    }),
  ],
};
```

## Best Practices {#best-practices}

### Keep Project Names Consistent

Use the same `projectName` value across development, staging, and production environments. Changing the project name breaks view path resolution and requires updates to all route configurations.

### Version Remote Modules Explicitly

When loading remote modules, consider including version information in the module path or using a version negotiation mechanism in the Module Federation configuration. This prevents breaking changes in remote applications from affecting host applications unexpectedly.

### Isolate State Between Applications

While the `State` singleton is shared, each application should own its own domain-specific state. Use `State` for truly global data (user, theme, locale) and use `Store` for application-specific reactive state.

### Handle Remote Module Failures Gracefully

Remote modules may fail to load due to network issues, deployment mismatches, or runtime errors. Always configure an `error` handler in `Framework.boot()` and provide fallback UI when remote views fail to load.

### Test Remotes Standalone

Each remote application should be testable in isolation by running it as a standalone application. This simplifies development and debugging, and ensures that remote applications do not develop hidden dependencies on the host environment.

### Use TypeScript Path Aliases

Configure TypeScript path aliases to simplify imports across project boundaries during development:

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "host-app/*": ["./src/*"],
      "dashboard-app/*": ["../dashboard-app/src/*"],
      "analytics-app/*": ["../analytics-app/src/*"]
    }
  }
}
```

### Monitor Frame Tree in Development

Enable the devtool bridge in development and use the swifty-mvc devtool panel to inspect the frame tree across all applications. This helps identify rendering issues, state synchronization problems, and frame lifecycle bugs early in the development process.
