// @ts-check

import { readFileSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import { defineConfig } from "rollup";

const deps = Object.keys(
  (await import("./package.json", { with: { type: "json" } })).default
    .dependencies ?? {},
);
const peerDeps = Object.keys(
  (await import("./package.json", { with: { type: "json" } })).default
    .peerDependencies ?? {},
);

// Entries where @babel/parser and @babel/types are bundled (not external),
// matching tsup's `noExternal: ["@babel/parser", "@babel/types"]`.
// `umd` controls whether UMD/AMD browser bundles are generated — build-tool
// plugin entries (vite/webpack/rspack) depend on Node.js built-ins and must
// not be wrapped in a browser-targeted UMD/AMD format.
const /** @type{({ name: string, external: boolean }[])} */ entries = [
    { name: "index", external: true },
    { name: "compiler", external: false },
    { name: "webpack", external: false },
    { name: "rspack", external: false },
    { name: "vite", external: false },
    { name: "runtime", external: true },
    { name: "devtool", external: true },
  ];

/** Externalize deps/peerDeps except @babel packages when the entry bundles them. */

/**
 *
 * @param {boolean} external
 * @returns {(id: string) => boolean}
 */
const makeExternal = (external) => (/** @type {string} */ id) => {
  if (id.startsWith("node:") || id.startsWith(".")) return false;
  if (
    !external &&
    (id === "@babel/parser" ||
      id === "@babel/types" ||
      id.startsWith("@babel/parser/") ||
      id.startsWith("@babel/types/"))
  ) {
    return false;
  }
  const pkg = id.startsWith("@")
    ? id.split("/").slice(0, 2).join("/")
    : id.split("/")[0];
  return deps.includes(pkg) || peerDeps.includes(pkg);
};

/**
 * Rollup plugin: inject __filename/__dirname shims for ESM output.
 * These are native CJS globals but absent in ESM, so we derive them
 * from import.meta.url — mirroring tsup's `shims: true`.
 * @returns {import("rollup").Plugin}
 */
function cjsShims() {
  const shims = readFileSync(new URL("./shims.js", import.meta.url), "utf-8");
  return {
    name: "cjs-shims",
    /**
     * @param {string} code
     * @param {import("rollup").RenderedChunk} chunk
     * @param {import("rollup").NormalizedOutputOptions} outputOptions
     * @returns {string | null}
     */
    renderChunk(code, chunk, outputOptions) {
      if (outputOptions.format !== "es") return null;
      return shims + code;
    },
  };
}

/**
 * Rollup plugin: clean dist/ and copy client.d.ts before the build starts.
 * Replaces the `prebuild` npm lifecycle script so `rollup -c` is self-contained.
 * Runs only once across the entire config array to avoid deleting prior outputs.
 * @returns {import("rollup").Plugin}
 */
let prebuildDone = false;
function prebuildPlugin() {
  return {
    name: "prebuild",
    buildStart() {
      if (prebuildDone) return;
      prebuildDone = true;
      rmSync("dist", { recursive: true, force: true });
      mkdirSync("dist", { recursive: true });
      copyFileSync("src/client.d.ts", "dist/client.d.ts");
    },
  };
}

// Base formats — generated for all entries.
const outputConfigs = [
  { file: "dist/[name].js", format: "es" },
  { file: "dist/[name].cjs", format: "cjs", exports: "named" },
];

// Entries that use __filename (vite/webpack/rspack plugin loaders) need the shim.
const cjsShimsEntries = new Set(["vite", "webpack", "rspack"]);

// --- JS bundles (ESM + CJS + optional UMD/AMD) ---
const /** @type {import("rollup").OutputOptions[]} */ jsConfigs = entries.map(
    ({ name, external }) => {
      const outputs = outputConfigs;
      return {
        input: `src/${name}.ts`,
        output: outputs.map((o) => ({
          ...o,
          file: o.file.replace("[name]", name),
        })),
        external: makeExternal(external),
        plugins: [
          prebuildPlugin(),
          resolve(),
          commonjs(),
          typescript({ tsconfig: "./tsconfig.build.json" }),
          ...(cjsShimsEntries.has(name) ? [cjsShims()] : []),
        ],
      };
    },
  );

// --- Type declarations (.d.ts for ESM consumers) ---
const /** @type {import("rollup").RollupOptions[]} */ dtsConfigs = entries.map(
    ({ name }) => ({
      input: `src/${name}.ts`,
      output: {
        file: `dist/${name}.d.ts`,
        format: "es",
      },
      plugins: [dts({ tsconfig: "./tsconfig.build.json" })],
    }),
  );

// --- Type declarations (.d.cts for CJS consumers) ---
const /** @type {import("rollup").RollupOptions[]} */ dtsCjsConfigs =
    entries.map(({ name }) => ({
      input: `src/${name}.ts`,
      output: {
        file: `dist/${name}.d.cts`,
        format: "es",
      },
      plugins: [dts({ tsconfig: "./tsconfig.build.json" })],
    }));

export default defineConfig([...jsConfigs, ...dtsConfigs, ...dtsCjsConfigs]);
