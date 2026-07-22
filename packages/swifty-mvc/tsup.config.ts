import { copyFileSync } from "node:fs";
import { defineConfig } from "tsup";

// tsup runs array configs in parallel via Promise.all — a single config's
// onSuccess fires before other configs' DTS generation finishes.
// Defer the copy to process exit so all builds are fully complete.
(() => {
  process.on("exit", () => {
    copyFileSync("src/client.d.ts", "dist/client.d.ts");
    copyFileSync("src/client.d.ts", "dist/client.d.cts");
  });
})();

export default defineConfig([
  {
    entry: ["src/index.ts"],
    clean: true,
    dts: {
      resolve: true,
    },
    format: ["esm", "cjs"],
    minify: false,
    noExternal: [],
    sourcemap: false,
    tsconfig: "./tsconfig.build.json",
  },
  {
    entry: ["src/compiler.ts"],
    dts: true,
    format: ["esm", "cjs"],
    minify: false,
    noExternal: ["@babel/parser", "@babel/types"],
    sourcemap: false,
    tsconfig: "./tsconfig.build.json",
  },
  {
    // Rspack / Webpack / Vite plugin entries — each needs __filename shim to
    // resolve to its own file (not a shared chunk) for the SwiftyMvcPlugin to
    // locate the loader at runtime. splitting: false ensures each ESM entry
    // is a single self-contained file with no shared chunk extraction.
    entry: ["src/rspack.ts", "src/webpack.ts", "src/vite.ts"],
    dts: true,
    format: ["esm", "cjs"],
    minify: false,
    noExternal: ["@babel/parser", "@babel/types"],
    shims: true,
    splitting: false,
    sourcemap: false,
    tsconfig: "./tsconfig.build.json",
  },
  {
    // Template runtime — imported by compiled `.html` modules. Kept tiny so
    // pulling in `@swifty.js/mvc/runtime` doesn't drag the whole framework in.
    entry: ["src/runtime.ts", "src/devtool.ts"],
    dts: true,
    format: ["esm", "cjs"],
    minify: false,
    noExternal: [],
    sourcemap: false,
    tsconfig: "./tsconfig.build.json",
  },
]);
