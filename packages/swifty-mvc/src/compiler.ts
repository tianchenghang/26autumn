/**
 * Compiler barrel export — re-exports the public compile-time API.
 *
 * - `compileTemplate(source, options?)` — Compile a `.html` template string
 *   into an ES module exporting a render function `(data, viewId, refData) => string | VDomNode`.
 * - `extractGlobalVars(source)` — AST-based extraction of template data variables
 *   (used for zero-config variable auto-detection).
 *
 * These functions run at **build time** (Node.js) via the Vite / Webpack /
 * Rspack plugins — they are NOT part of the browser runtime bundle.
 */
export { compileTemplate } from "./compiler/compile-template";
export { extractGlobalVars } from "./compiler/extract-global-vars";
