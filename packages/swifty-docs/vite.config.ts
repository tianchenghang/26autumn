/**
 * Vite configuration for @swifty.js/docs.
 *
 * Dual-mode config:
 *   --mode lib   → Library build (7 entries, ESM+CJS+dts)
 *   --mode docs  → Documentation site (SolidJS app, Vite dev/build)
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
import solid from "vite-plugin-solid";
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
 * SolidJS stays external too — consumers must share a single solid-js
 * runtime instance with the precompiled theme.
 */
const EXTERNAL_IDS = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  "solid-js",
  "solid-js/web",
  "solid-js/store",
];

function isExternal(id: string): boolean {
  if (id.startsWith("node:")) return true;
  return EXTERNAL_IDS.some((e) => id === e || id.startsWith(e + "/"));
}

/**
 * __filename / __dirname ESM shims.
 * webpack.ts and rspack.ts use __filename to self-reference as loaders.
 * Injected via Rollup output.banner for ESM chunks only.
 */
const CJS_SHIMS = [
  'import { fileURLToPath as __cjs_fileURLToPath } from "url";',
  'import { dirname as __cjs_dirname } from "path";',
  "const __filename = __cjs_fileURLToPath(import.meta.url);",
  "const __dirname = __cjs_dirname(__filename);",
].join("\n");

// === Mode router ===

export default defineConfig(({ mode, command }) => {
  const isDev = command === "serve";
  if (mode === "lib") {
    return libConfig();
  }
  if (mode === "docs") {
    return docsConfig({ isDev });
  }
  // Best-effort
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
          webpack: resolve(PKG_DIR, "src/webpack.ts"),
          rspack: resolve(PKG_DIR, "src/rspack.ts"),
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
      // Compile the SolidJS theme JSX to solid-js runtime calls.
      solid() as PluginOption,
      {
        name: "cjs-shims",
        renderChunk(code, _chunk, outputOptions) {
          if (outputOptions.format !== "es") return null;
          // Only inject __filename/__dirname shims when the chunk actually
          // references them (webpack.ts and rspack.ts use __filename as a
          // loader self-reference). Browser-targeted chunks (theme, runtime,
          // index) must not import Node.js built-in modules (url, path).
          if (!/\b__(?:filename|dirname)\b/.test(code)) return null;
          return CJS_SHIMS + "\n" + code;
        },
      },
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
      // swiftyDocsPlugin returns [docsPlugin, solid()] — .md compilation
      // plus SolidJS JSX compilation for the theme and the app shell.
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
