import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { federation } from "@module-federation/vite";
import tailwindcss from "@tailwindcss/vite";

// const __filename = fileURLToPath(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: "swifty_devtool",
      remotes: {
        // "swifty_demo": "swifty_demo@http://localhost:3000/remoteEntry.js",
        swifty_demo: {
          // Import alias of the remote module: import xxx from "swifty-demo/counter-view"
          type: "module", // ESM
          name: "swifty_demo", // Module federation name of the remote module
          entry: "http://localhost:3000/remoteEntry.js", // Entry point of the remote module
          entryGlobalName: "swifty_demo", // window.swifty_demo
          shareScope: "default",
        },
      },
      filename: "remoteEntry.js",
      exposes: {
        "./cdn-manager": "./src/exposed/cdn-manager.ts",
      },
      shared: {
        "@swifty.js/mvc": { singleton: true, requiredVersion: "*" },
        // NOTE: react / react-dom are intentionally NOT shared via MF.
        // In Vite dev mode, @module-federation/vite does not reliably
        // share react across host and remote — even with singleton:true,
        // two separate module instances can be loaded, causing React's
        // internal dispatcher (ReactSharedInternals.H) to be set on one
        // copy while useState reads from the other → "Invalid hook call".
        //
        // Since swifty-demo is a Swifty MVC app (not a React app), the remote
        // bundles its own React and the render tree is fully self-contained.
        // The host never touches React, so there is no sharing needed.
      },
      // Disable the DTS plugin's "dynamic remote type hints" feature in dev.
      // This feature scans the browser at runtime and discovers remotes that
      // aren't in the `remotes` config above. In our circular-remote setup
      // (swifty-demo ↔ swifty-devtool), it misidentifies the DTS dev worker's own
      // address (e.g. http://30.248.208.53:<random-port>) as a remote entry,
      // then repeatedly tries to download @mf-types.zip from it — failing
      // every time and flooding the console with "Failed to download types
      // archive" errors. The configured remotes above already provide types
      // via their `entry` URLs, so dynamic discovery adds no value here.
      dev: { disableDynamicRemoteTypeHints: true },
    }),
  ],
  root: "./",
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    sourcemap: true,
    outDir: "./dist",
    rollupOptions: {
      input: resolve(__dirname, "./index.html"),
      output: {
        // Named chunks for view modules — each dynamic import creates
        // a separate file with a readable name instead of random hash.
        manualChunks(id) {
          if (id.includes("/src/views/home")) return "view-home";
          if (id.includes("/src/views/about")) return "view-about";
          if (id.includes("/src/views/counter")) return "view-counter";
          if (id.includes("/src/views/404")) return "view-404";
          if (id.includes("/src/components/counter-store"))
            return "comp-counter-store";
          if (id.includes("/src/components/counter-updater"))
            return "comp-counter-updater";
        },
      },
    },
  },
});
