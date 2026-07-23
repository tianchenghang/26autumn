/**
 * Vite configuration for @swifty.js/docs2.
 *
 * Dual-mode config:
 *   --mode lib   → Library build (5 entries, ESM+CJS+dts)
 *   --mode docs  → Documentation site (jQuery app, Vite dev/build)
 *
 * Vite 7 uses Rollup internally, so build.lib is Rollup-based.
 */
import {
  defineConfig,
  type LibraryFormats,
  type PluginOption,
  type UserConfig,
  type Rollup,
} from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
// !!! For your project, it should be:
// import { swiftyDocsPlugin } from "@swifty.js/docs/vite";
import { swiftyDocsPlugin } from "./src/vite";
import { existsSync, copyFileSync } from "node:fs";
import { VitePWA } from "vite-plugin-pwa";
/** Documentation site configuration used in docs mode. */
import swiftyDocsConfig from "./swifty-docs.config";
import pkg from "./package.json" with { type: "json" };

// === Shared constants ===

const PKG_DIR = import.meta.dirname;

/**
 * All deps + peerDeps are externalized in lib mode (users install them).
 * jQuery stays external too — consumers must share a single jQuery
 * runtime instance with the precompiled theme.
 */
const EXTERNAL_IDS = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  "jquery",
];

function isExternal(id: string): boolean {
  if (id.startsWith("node:")) return true;
  return EXTERNAL_IDS.some((e) => id === e || id.startsWith(e + "/"));
}

// === Mode router ===

export default defineConfig(({ mode, command }) => {
  const isDev = command === "serve";
  if (mode === "lib") {
    return libConfig();
  }
  if (mode === "docs") {
    return docsConfig({ isDev });
  }
  return docsConfig({ isDev });
});

// === Library build ===

/**
 * Rollup plugin: copies static assets (ejs, client.d.ts, client.css)
 * from src/ to dist/ after each build, and registers them as watch
 * dependencies so changes trigger a rebuild in --watch mode.
 */
function copyAssetsPlugin(): Rollup.Plugin {
  const ASSETS = ["file-content.ejs", "client.d.ts", "client.css"];

  return {
    name: "copy-static-assets",
    buildStart() {
      for (const file of ASSETS) {
        this.addWatchFile(resolve(PKG_DIR, "src", file));
      }
    },
    writeBundle() {
      const srcDir = resolve(PKG_DIR, "src");
      const distDir = resolve(PKG_DIR, "dist");
      for (const file of ASSETS) {
        const src = resolve(srcDir, file);
        const dest = resolve(distDir, file);
        if (existsSync(src)) {
          copyFileSync(src, dest);
        }
      }
    },
  };
}

function libConfig(): UserConfig {
  return {
    build: {
      lib: {
        cssFileName: "swifty-docs",
        entry: {
          index: resolve(PKG_DIR, "src/index.ts"),
          compiler: resolve(PKG_DIR, "src/compiler.ts"),
          vite: resolve(PKG_DIR, "src/vite.ts"),
          runtime: resolve(PKG_DIR, "src/runtime.ts"),
          theme: resolve(PKG_DIR, "src/theme/index.ts"),
        },
        formats: ["es", "cjs"] satisfies LibraryFormats[],
        fileName: (format: string, entryName: string) =>
          format === "es" ? `${entryName}.js` : `${entryName}.cjs`,
      },
      rollupOptions: {
        external: isExternal,
      },
      outDir: "dist",
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
    },
    plugins: [
      dts({
        tsconfigPath: "./tsconfig.build.json",
        outDirs: "dist",
      }),
      copyAssetsPlugin() as PluginOption,
    ],
  };
}

// === Documentation site build ===

function docsConfig(options?: { isDev?: boolean }): UserConfig {
  const { isDev = true } = options ?? {};
  return {
    base: isDev ? "/" : "/swifty/",
    root: resolve(PKG_DIR, "app"),
    publicDir: resolve(PKG_DIR, "public"),
    plugins: [
      ...swiftyDocsPlugin({
        config: swiftyDocsConfig,
        debug: true,
      }),
      tailwindcss() as PluginOption,
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.svg",
          "favicon.ico",
          "apple-touch-icon-180x180.png",
        ],
        manifest: {
          name: "Swifty Docs",
          short_name: "swifty-docs",
          description: "Swifty Docs",
          theme_color: "#f4f8f4",
          background_color: "#f4f8f4",
          display: "standalone",
          scope: isDev ? "/" : "/swifty/",
          start_url: isDev ? "/" : "/swifty/",
          icons: [
            {
              src: "pwa-64x64.png",
              sizes: "64x64",
              type: "image/png",
            },
            {
              src: "pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }) as PluginOption,
    ],
    resolve: {
      alias: {
        "@swifty-docs/generated": resolve(PKG_DIR, ".swifty-docs/generated"),
        "@swifty.js/docs": resolve(PKG_DIR, "src"),
      },
    },
    build: {
      outDir: resolve(PKG_DIR, "dist-docs"),
      emptyOutDir: true,
    },
    server: {
      port: 3200,
      open: false,
    },
  };
}
