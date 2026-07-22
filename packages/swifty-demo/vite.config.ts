import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";
import { swiftyMvcPlugin } from "@swifty.js/mvc/vite";
import { fileURLToPath } from "url";
import { federation } from "@module-federation/vite";

// const __filename = fileURLToPath(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    swiftyMvcPlugin({ vdom: true }),
    federation({
      name: "swifty_demo", // Module federation name
      filename: "remoteEntry.js", // Entry point
      // optional: additional "var" remoteEntry file
      // needed only for legacy hosts with "var" usage (remote.type = 'var')
      varFilename: "varRemoteEntry.js",
      exposes: {
        "./counter-view": "./src/exposed/counter-view.ts",
      },
      remotes: {
        swifty_devtool: {
          type: "module",
          name: "swifty_devtool",
          entry: "http://localhost:5173/remoteEntry.js",
          entryGlobalName: "swifty_devtool",
          shareScope: "default",
        },
      },
      shared: {
        "@swifty.js/mvc": {
          singleton: true,
          requiredVersion: "*",
        },
        // react / react-dom intentionally not shared — see swifty-devtool/vite.config.ts
        // for the full explanation. Short version: swifty-demo is a Swifty MVC app,
        // not a React app. The remote (swifty-devtool) bundles its own React and
        // the render tree is self-contained. Sharing React across MF in Vite
        // dev mode causes duplicate module instances → "Invalid hook call".
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
  css: {
    postcss: "./postcss.config.js",
  },
  server: {
    port: 3000,
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
