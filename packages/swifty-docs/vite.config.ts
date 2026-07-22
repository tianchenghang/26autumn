/**
 * Vite configuration for @swifty.js/docs.
 *
 * Dual-mode config:
 *   --mode lib   → Library build (6 entries, ESM+CJS+dts)
 *   --mode docs  → Documentation site (generates routes.ts, Vite dev/build)
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
import { compileTemplate, extractGlobalVars } from "@swifty.js/mvc/compiler";
import tailwindcss from "@tailwindcss/vite";
// !!! For your project, it should be:
// import { swiftyDocsPlugin } from "@swifty.js/docs/vite";
import { swiftyDocsPlugin } from "./src/vite";
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { VitePWA } from "vite-plugin-pwa";
/** Documentation site configuration used in docs mode. */
import swiftyDocsConfig from "./swifty-docs.config";

// === Shared constants ===

const PKG_DIR = import.meta.dirname;

/** All deps + peerDeps are externalized in lib mode (users install them). */
const EXTERNAL_PKGS = [
  "js-yaml",
  "lucide-static",
  "markdown-it",
  "markdown-it-container",
  "shiki",
  "@swifty.js/mvc",
  "@tailwindcss/typography",
  "daisyui",
  "tailwindcss",
  "node:fs",
  "node:path",
  "node:process",
  "node:url",
];

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
    return libConfig({ isDev });
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

// === themeDualMode: dual-mode template compilation plugin ===

/**
 * Regex matching ES named imports: `import { x as y, ... } from "source";`
 *
 * Used by mergeImports() to split compiled template import lines into
 * (specifiers, sourceModule) pairs so overlapping imports from string-mode
 * and VDOM-mode compilation can be deduplicated per-module.
 *
 * Handles: optional semicolon, both quote styles, aliased specifiers (x as y).
 */
const IMPORT_RE = /^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?\s*$/;

/**
 * Split compiled template output into import lines and function body.
 *
 * compileTemplate() returns ES module source in two possible formats:
 *
 *   Old: `export default function(data, viewId, refData) { ... }`
 *   New: `function __swiftyTemplate(data, viewId, refData) { ... }`
 *        `export default __swiftyTemplate;`
 *
 * The new format exists so the auto-injected HMR snippet can reference the
 * template function by name. This function separates imports from body and
 * normalizes both formats into an anonymous function expression suitable
 * for `const __str = function(...) {...}`.
 *
 * Regexes are used instead of `startsWith` so the matching is robust against
 * whitespace variations and does not hardcode the function name (`__swiftyTemplate`).
 */

/**
 * Matches `export default <identifier>;` — a bare reference to a named
 * function declaration on a preceding line. Does NOT match
 * `export default function(...)` because `function` is followed by `(`
 * (not end-of-line), and the `(?!function\b)` lookahead guards against a
 * multiline `export default function` declaration.
 */
const BARE_EXPORT_RE =
  /^export\s+default\s+(?!function\b)[a-zA-Z_$][\w$]*\s*;?\s*$/;

/**
 * Matches `function <name>(` — a named function declaration. Used to convert
 * to an anonymous `function(` expression so it can be assigned to a const.
 */
const NAMED_FUNC_RE = /^function\s+[a-zA-Z_$][\w$]*\s*\(/;

function splitModule(source: string): {
  imports: string[];
  body: string;
} {
  const lines = source.split("\n");
  const imports: string[] = [];
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("import ")) {
      imports.push(line);
    } else if (BARE_EXPORT_RE.test(line)) {
      // New format: `export default __swiftyTemplate;` is a bare reference to
      // the named function declaration above. Drop it entirely — the
      // function itself is already captured in the body.
      continue;
    } else {
      let processed = line.replace(/^export\s+default\s+/, "");
      // Convert `function __swiftyTemplate(` → `function(` so the named
      // function declaration becomes an anonymous function expression.
      // Without this, `const __str = function __swiftyTemplate(...)` creates
      // a named function expression whose name is inaccessible outside the
      // function body, causing `ReferenceError: __swiftyTemplate is not defined`.
      processed = processed.replace(NAMED_FUNC_RE, "function(");
      bodyLines.push(processed);
    }
  }
  return { imports, body: bodyLines.join("\n") };
}

/**
 * Merge import statements that share the same source module.
 *
 * String-mode and VDOM-mode compile output import overlapping but not
 * identical specifier sets from the same modules. E.g.:
 *   string: import { encHtml, strSafe, encUri, encQuote, refFn } from "@swifty.js/mvc/runtime";
 *   vdom:   import { strSafe, encUri, encQuote, refFn } from "@swifty.js/mvc/runtime";
 *
 * This deduplicates per-module and emits one merged import per source.
 */
function mergeImports(allImports: string[]): string[] {
  // Map<sourceModule, Map<localName, importedName>>
  const perModule = new Map<string, Map<string, string>>();

  for (const imp of allImports) {
    const match = imp.match(IMPORT_RE);
    if (!match) continue;

    const specifiers = match[1];
    const source = match[2];

    if (!perModule.has(source)) perModule.set(source, new Map());
    const specMap = perModule.get(source)!;

    for (const spec of specifiers.split(",")) {
      const trimmed = spec.trim();
      if (!trimmed) continue;
      // "x as y" → importedName=x, localName=y; "x" → both=x
      const parts = trimmed.split(/\s+as\s+/);
      const importedName = parts[0].trim();
      const localName = parts.length > 1 ? parts[1].trim() : importedName;
      specMap.set(localName, importedName);
    }
  }

  const result: string[] = [];
  for (const [source, specMap] of perModule) {
    const specs = [...specMap.entries()]
      .map(([local, imported]) =>
        local === imported ? local : `${imported} as ${local}`,
      )
      .join(", ");
    result.push(`import { ${specs} } from "${source}";`);
  }
  return result;
}

/**
 * Vite plugin: compiles theme .html templates in BOTH string and VDOM modes
 * so the bundled theme.js can serve either at runtime depending on the
 * consumer's FrameworkConfig.vdom setting.
 *
 * Uses virtual modules (virtual:swifty-docs/<name>) to avoid conflicts with
 * swiftyMvcPlugin7 which intercepts all .html imports via resolveId. Virtual
 * module IDs never end in .html, so neither swiftyMvcPlugin7 nor Vite's
 * built-in HTML asset handler can intercept them — no suffix tricks needed.
 *
 * Each virtual module exports { __str, __vdom } — two pre-compiled template
 * functions. Imports from the two compilation modes are merged and
 * deduplicated so shared helpers (@swifty.js/mvc/runtime) appear only once.
 */
function themeDualMode(options?: { debug?: boolean }): PluginOption {
  const { debug = false } = options ?? {};
  const THEME_DIR = resolve(PKG_DIR, "src", "theme");
  const DEBUG_DIR = resolve(PKG_DIR, ".swifty-docs", "tmp");
  const DEBUG_FILE = resolve(DEBUG_DIR, "theme-dual-mode.jsonl");
  const VIRTUAL_PREFIX = "virtual:swifty-docs/";
  // \0 prefix is the Rollup convention for marking resolved IDs as
  // "owned by this plugin" — prevents other plugins from loading them.
  const RESOLVED_PREFIX = "\0virtual:swifty-docs/";
  const TEMPLATE_NAMES = ["docs-layout", "sidebar", "toc", "search"];

  /** Append one JSONL entry (gated on debug flag). */
  function debugLog(entry: Record<string, unknown>): void {
    if (!debug) return;
    mkdirSync(DEBUG_DIR, { recursive: true });
    appendFileSync(DEBUG_FILE, JSON.stringify(entry) + "\n");
  }

  return {
    name: "theme-dual-mode",
    enforce: "pre",

    buildStart() {
      // Clear previous debug output at the start of each build.
      if (!debug) return;
      mkdirSync(DEBUG_DIR, { recursive: true });
      writeFileSync(DEBUG_FILE, "");
    },

    resolveId(source: string) {
      if (source.startsWith(VIRTUAL_PREFIX)) {
        return "\0" + source;
      }
      return undefined;
    },

    async load(id: string) {
      if (!id.startsWith(RESOLVED_PREFIX)) return null;

      const name = id.slice(RESOLVED_PREFIX.length);
      if (!TEMPLATE_NAMES.includes(name)) return null;

      const filePath = resolve(THEME_DIR, name + ".html");
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(filePath, "utf-8");
      const globalVars = await extractGlobalVars(raw);

      const [strResult, vdomResult] = await Promise.all([
        compileTemplate(raw, { globalVars, vdom: false }),
        compileTemplate(raw, { globalVars, vdom: true }),
      ]);

      debugLog({ step: "compile", name, strResult, vdomResult });

      const strMod = splitModule(strResult);
      const vdomMod = splitModule(vdomResult);

      debugLog({ step: "split", name, strMod, vdomMod });

      // Merge and deduplicate import lines across both modes.
      const uniqueImports = mergeImports([
        ...strMod.imports,
        ...vdomMod.imports,
      ]);
      const content = [
        ...uniqueImports,
        "",
        `const __str = ${strMod.body}\n`,
        `const __vdom = ${vdomMod.body}\n`,
        "export { __str, __vdom };",
      ].join("\n");

      debugLog({ step: "output", name, content });

      return content;
    },
  };
}

function libConfig(options?: { isDev?: boolean }): UserConfig {
  const { isDev = true } = options ?? {};
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
        external: (id: string) =>
          EXTERNAL_PKGS.some((e) => id === e || id.startsWith(e + "/")),
      },
      outDir: "dist",
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
    },
    plugins: [
      // Compile .html template imports in theme/ into JS functions in BOTH
      // string and VDOM modes so consumers can use either rendering mode.
      themeDualMode({ debug: isDev }) as PluginOption,
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
      // Virtual module plugin — no ordering constraint needed since virtual
      // module IDs (virtual:swifty-docs/*) are never intercepted by
      // swiftyMvcPlugin7 or Vite's built-in HTML handler.
      themeDualMode({ debug: isDev }) as PluginOption,
      ...swiftyDocsPlugin({
        config: swiftyDocsConfig,
        vdom: false,
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
          theme_color: "#ecfdf5",
          background_color: "#ecfdf5",
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
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "gstatic-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }) as PluginOption,
    ],
    resolve: {
      alias: {
        "@swifty-docs/generated": resolve(PKG_DIR, ".swifty-docs/generated"),
        "@swifty.js/docs": resolve(PKG_DIR, "src"),
        "@swifty.js/mvc": resolve(PKG_DIR, "../swifty-mvc/dist"),
      },
    },
    build: {
      outDir: resolve(PKG_DIR, "dist-docs"),
      emptyOutDir: true,
    },
    server: {
      port: 3200,
      open: true,
    },
  };
}
