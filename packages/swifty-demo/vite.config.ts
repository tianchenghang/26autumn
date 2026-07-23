import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { federation } from "@module-federation/vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    federation({
      name: "swifty_demo",
      filename: "remoteEntry.js",
      exposes: {
        "./counter-view": "./src/exposed/counter-view.tsx",
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
        preact: {
          singleton: true,
          requiredVersion: "*",
        },
      },
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
    port: 3000,
    open: true,
  },
  build: {
    sourcemap: true,
    outDir: "./dist",
    rollupOptions: {
      input: resolve(__dirname, "./index.html"),
      output: {
        manualChunks(id) {
          if (id.includes("/src/pages/Home")) return "page-home";
          if (id.includes("/src/pages/About")) return "page-about";
          if (id.includes("/src/pages/Counter")) return "page-counter";
          if (id.includes("/src/pages/Cdn")) return "page-cdn";
          if (id.includes("/src/pages/NotFound")) return "page-404";
        },
      },
    },
  },
});
