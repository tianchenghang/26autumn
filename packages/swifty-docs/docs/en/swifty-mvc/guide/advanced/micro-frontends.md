---
title: Micro-Frontends
description: Building composed applications with the Frame tree and Module Federation.
---

# Micro-Frontends {#micro-frontends}

Swifty MVC's Frame tree architecture provides native support for micro-frontend composition. Each Frame subtree can be owned by a different team, loaded from a separate build artifact, and managed with its own lifecycle — all within a single application shell.

## Architecture {#architecture}

A micro-frontend architecture with Swifty MVC consists of:

- A shell application that owns the root Frame and top-level layout
- One or more remote applications that expose views via Module Federation
- The `FrameworkConfig.require` hook that loads remote modules at runtime

```
Shell Application (root Frame)
  |-- Header (local view)
  |-- Sidebar (local view)
  |-- Main Content Zone
       |-- Remote App A (loaded via Module Federation)
       |    |-- Widget 1
       |    +-- Widget 2
       +-- Remote App B (loaded via Module Federation)
```

## Shell configuration {#shell-config}

The shell application configures the `require` hook to load remote modules:

```ts
import { Framework } from "@swifty.js/mvc";

Framework.boot({
  rootId: "app",
  routeMode: "history",

  // Custom module loader for Module Federation
  require(names) {
    return Promise.all(
      names.map((name) => {
        // Dynamic import from Module Federation remote
        return import(/* @vite-ignore */ name);
      }),
    );
  },

  // Extension views loaded at startup
  extensions: ["remote-app-a/shell", "remote-app-b/shell"],

  routes: {
    "/": "home",
    "/app-a/*": "remote-app-a/shell",
    "/app-b/*": "remote-app-b/shell",
  },
});
```

## Remote application {#remote-app}

A remote application exports views that can be loaded by the shell:

```ts
// remote-app-a/src/views/shell.ts
import { defineView } from "@swifty.js/mvc";
import template from "./shell.html";

export default defineView((ctx, params) => {
  ctx.observeLocation("path");

  return {
    template,
    events: {
      "nav<click>"(event) {
        Router.to(event.eventTarget.dataset.path);
      },
    },
  };
});
```

The remote application is built as a Module Federation remote, exposing its views:

```js
// remote-app-a/webpack.config.js
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "remote_app_a",
      filename: "remoteEntry.js",
      exposes: {
        "./shell": "./src/views/shell",
      },
      shared: ["@swifty.js/mvc"],
    }),
  ],
};
```

## Zone composition {#zone-composition}

The shell's layout template declares zones where remote views are mounted:

```html
<div class="app-shell">
  <header v-swifty="header"></header>
  <div class="body">
    <aside v-swifty="sidebar"></aside>
    <main v-swifty="remote-content"></main>
  </div>
</div>
```

The shell view mounts remote views into zones based on the current route:

```ts
export default defineView((ctx) => {
  ctx.observeLocation("path");

  useEffect(() => {
    const path = Router.parse().path;
    if (path.startsWith("/app-a")) {
      ctx.owner.mountFrame("remote-content", "remote-app-a/shell");
    } else if (path.startsWith("/app-b")) {
      ctx.owner.mountFrame("remote-content", "remote-app-b/shell");
    }
  });

  return { template: layoutTemplate };
});
```

## Cross-boundary communication {#cross-boundary-comm}

### State sharing {#state-sharing}

Remote applications share the same `State` singleton. The shell can set global state that remotes observe:

```ts
// Shell:
State.set({ currentUser: user, theme: "dark" });
State.digest();

// Remote app:
ctx.observeState("currentUser,theme");
```

### Event bus {#event-bus}

For decoupled cross-boundary communication, use a shared event emitter:

```ts
// shared-bus.ts (in a shared package)
import { createEmitter } from "@swifty.js/mvc";
export const globalBus = createEmitter();

// Shell:
globalBus.fire("navigate", { path: "/app-a/settings" });

// Remote:
globalBus.on("navigate", ({ path }) => {
  Router.to(path);
});
```

## Lifecycle management {#lifecycle}

The Frame tree ensures proper lifecycle across boundaries:

- When the shell unmounts a remote zone, all child frames in that zone are recursively unmounted
- Remote views receive proper `destroy` events and clean up their resources
- Module Federation shared dependencies are loaded only once
- HMR works within each micro-frontend independently

## Isolation patterns {#isolation}

### CSS isolation {#css-isolation}

Each micro-frontend can use scoped CSS or CSS Modules to prevent style leakage:

```ts
// Remote app uses CSS Modules
import styles from "./widget.module.css";

return {
  template: `<div class="${styles.container}">...</div>`,
};
```

### State isolation {#state-isolation}

Remote applications can use their own Store instances to avoid state conflicts:

```ts
// Remote app A:
const remoteAStore = createStore("remote-a-data", (set, get) => ({
  // Remote-specific state
}));

// Remote app B:
const remoteBStore = createStore("remote-b-data", (set, get) => ({
  // Completely separate state
}));
```

## Module Federation with Vite {#vite-mf}

For Vite-based projects, use `@originjs/vite-plugin-federation`:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import federation from "@originjs/vite-plugin-federation";
import { swiftyMvcPlugin } from "@swifty.js/mvc/vite";

export default defineConfig({
  plugins: [
    swiftyMvcPlugin(),
    federation({
      name: "remote_app",
      filename: "remoteEntry.js",
      exposes: {
        "./shell": "./src/views/shell",
      },
      shared: ["@swifty.js/mvc"],
    }),
  ],
});
```

## Next steps {#next-steps}

- [Frame Tree](/docs/en/swifty-mvc/guide/essentials/frame) — frame lifecycle and zones
- [Performance](/docs/en/swifty-mvc/guide/advanced/performance) — optimizing micro-frontend load times
- [Framework API](/docs/en/swifty-mvc/api-reference/framework) — FrameworkConfig.require reference
