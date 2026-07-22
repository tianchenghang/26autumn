/**
 * HMR injection code generator — shared across Vite, Webpack, and Rspack.
 *
 * ## Why this file exists
 *
 * React's `@vitejs/plugin-react` and Vue's `@vitejs/plugin-vue` auto-inject
 * HMR boilerplate at compile time so users never write `import.meta.hot`
 * themselves. Swifty's `swiftyMvcPlugin` / `swiftyMvcLoader` previously did NOT
 * inject any HMR code, forcing users to manually write HMR accept/dispose
 * boilerplate in every view file — a poor DX.
 *
 * This module generates the HMR snippet strings that the three bundler
 * integrations (vite.ts, webpack.ts, rspack.ts) append to compiled output.
 * Extracting the logic here keeps the three plugin files DRY and makes the
 * cross-bundler differences (Vite's `import.meta.hot` vs Webpack/Rspack's
 * `import.meta.webpackHot`) explicit and testable.
 *
 * ## Two injection targets
 *
 * 1. **Template module** (compiled from `.html`): self-accepts. When the
 *    `.html` changes, the accept callback calls `hotSwapByTemplate(old, new)`
 *    to update the template on all mounted views — preserving state.
 *
 * 2. **View setup module** (`.ts` file that imports `.html`): self-accepts.
 *    When the `.ts` changes, the accept callback calls
 *    `hotSwapByView(old, new)` to swap the setup function on all mounted
 *    instances — preserving state.
 *
 * ## Cross-bundler HMR API differences
 *
 * | Bundler        | HMR context              | accept(cb) semantics                              |
 * |----------------|--------------------------|---------------------------------------------------|
 * | Vite           | `import.meta.hot`        | cb IS the update-success callback (gets newModule)|
 * | Webpack (ESM)  | `import.meta.webpackHot` | cb is an ERROR handler (never runs on success)     |
 * | Rspack         | `import.meta.webpackHot` | cb is an ERROR handler (never runs on success)     |
 *
 * This asymmetry is the root cause of the historic webpack/rspack HMR bugs
 * in this file: swap logic placed inside `accept(cb)` never executed on
 * successful updates.
 *
 * Additional critical difference: the naive approach of putting swap logic
 * inside `accept(cb)` failed on both Webpack and Rspack:
 *   - Webpack: `import.meta.webpackHot.data` not populated correctly with
 *     Module Federation → UI never updated.
 *   - Rspack: ESM modules never self-accepted → update propagated to a full
 *     page reload → state lost.
 *
 * The fix: Vite uses `accept(cb)` with swap inside cb; webpack/rspack use
 * the self-accept pattern: `import.meta.webpackHot.accept()` (no args) +
 * `dispose()` + a top-level `import.meta.webpackHot.data` check that runs
 * on HMR re-execution.
 * See getTemplateHmrSnippet / getViewHmrSnippet for the detailed rationale.
 */

// ============================================================
// Types
// ============================================================

/** Supported bundler identifiers. */
export type Bundler = "vite" | "webpack" | "rspack";

// ============================================================
// Template HMR injection
// ============================================================

/**
 * IMPORTANT
 *
 * __swifty_template__: The named export identifier that `compileTemplate` uses for the template
 * function. The HMR snippet references this by name.
 *
 *
 */

/**
 * Generate the HMR snippet for a compiled template module.
 *
 * The snippet assumes the module has a named function `__swifty_template__` (set
 * by `compileTemplate`) and a default export pointing to it. It:
 * 1. On `dispose`: saves the current `__swifty_template__` reference into
 *    `hot.data` so the accept callback can retrieve the OLD function.
 * 2. On `accept`: determines the NEW template function, then calls
 *    `hotSwapByTemplate(old, new)` to update all mounted views.
 *
 * Access to the framework's HMR swap functions is via `globalThis.__swifty_hmr__`
 * (registered by ./hmr.ts at module-load time), NOT via import/require of
 * "@swifty.js/mvc". Under Module Federation (`@swifty.js/mvc` shared singleton),
 * ANY import/require of @swifty.js/mvc registers the calling module as a shared
 * consumer, which causes webpack to mark the main chunk (shared-scope
 * initializer) as needing a hot-update. Since main's code didn't actually
 * change, no main.<hash>.hot-update.js is emitted → ChunkLoadError.
 * globalThis sidesteps all module resolution / chunk-graph side effects.
 *
 * In production builds, the entire `if` block is dead code (the HMR API is
 * undefined) and gets tree-shaken.
 */
function getTemplateHmrSnippet(bundler: Bundler): string {
  if (bundler === "vite") {
    return `
// Auto-injected by swiftyMvcPlugin
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.oldTemplate = __swifty_template__;
  });
  import.meta.hot.accept((newMod) => {
    const newTemplate = newMod?.default;
    const oldTemplate = import.meta.hot.data?.oldTemplate;
    if (oldTemplate && newTemplate && oldTemplate !== newTemplate) {
      const hmr = globalThis.__swifty_hmr__;
      if (hmr && hmr.hotSwapByTemplate)
        hmr.hotSwapByTemplate(oldTemplate, newTemplate);
    }
  });
}
`;
  }

  // Webpack / Rspack: import.meta.webpackHot
  //
  // KEY DIFFERENCE from Vite: webpack/rspack's `accept(cb)` with a single
  // function argument registers cb as an ERROR handler (invoked only when
  // the update FAILS to apply), NOT an update-success callback. Putting
  // swap logic inside accept(cb) would never run on successful updates.
  //
  // FIX: Use `import.meta.webpackHot` — the canonical ESM HMR API for
  // both webpack 5.40+ and Rspack. It's guaranteed to be available in
  // any module that uses `import`/`export` syntax, and properly supports
  // the self-accept pattern:
  // 1. `import.meta.webpackHot.accept()` (NO args) marks self-accepted.
  //    On update, the runtime disposes the old module, evicts it from
  //    cache, and RE-EXECUTES the module's top-level code in place.
  // 2. `import.meta.webpackHot.dispose(cb)` saves the OLD template
  //    reference into `import.meta.webpackHot.data` before discard.
  // 3. When the new module re-executes, the runtime has ALREADY populated
  //    `import.meta.webpackHot.data` with the dispose-saved data. The
  //    top-level check distinguishes HMR re-execution from first load.
  //
  // HMR swap functions are accessed via globalThis.__swifty_hmr__ (registered
  // by ./hmr.ts) rather than import/require("@swifty.js/mvc"): under Module
  // Federation (shared singleton), ANY reference to @swifty.js/mvc inside the
  // module registers it as a shared consumer, which causes webpack to mark
  // the main chunk as needing a hot-update — but since main didn't actually
  // change, no .hot-update.js is emitted → ChunkLoadError. globalThis
  // sidesteps all module-resolution / chunk-graph side effects.
  return `
// Auto-injected by swiftyMvcPlugin
if (import.meta.webpackHot) {
  const oldTemplate = import.meta.webpackHot.data?.oldTemplate;
  if (oldTemplate) {
    const newTemplate = __swifty_template__;
    if (oldTemplate !== newTemplate) {
      const hmr = globalThis.__swifty_hmr__;
      if (hmr && hmr.hotSwapByTemplate)
        hmr.hotSwapByTemplate(oldTemplate, newTemplate);
    }
  }
  import.meta.webpackHot.dispose((data) => {
    data.oldTemplate = __swifty_template__;
  });
  import.meta.webpackHot.accept((err) => {
    if (err) {
      console.error(err);
      globalThis.location?.reload();
    }
  });
}
`;
}

/**
 * Append HMR code to a compiled template module source.
 *
 * Called by the Vite `load` hook and the Webpack/Rspack loader after
 * `compileTemplate` returns. The `bundler` parameter selects the correct
 * HMR API (`import.meta.hot` for Vite, `import.meta.webpackHot` for Webpack/Rspack).
 *
 * @param source - The compiled template module source from `compileTemplate`
 * @param bundler - Which bundler's HMR API to use
 * @returns The source with HMR accept/dispose code appended
 */
export function injectTemplateHmrSnippet(
  source: string,
  bundler: Bundler,
): string {
  return source + "\n" + getTemplateHmrSnippet(bundler);
}

// ============================================================
// View setup HMR injection (for .ts files)
// ============================================================

/**
 * Generate the HMR snippet for a view `.ts` module.
 *
 * This snippet references `__swifty_view__`, which must be a named const
 * holding the View setup function. The `injectViewHmrSnippet` function
 * (below) rewrites `export default defineView(...)` into
 * `const __swifty_view__ = defineView(...); export default __swifty_view__;`
 * so that the HMR callback can capture the old setup reference.
 */
function getViewHmrSnippet(bundler: Bundler): string {
  if (bundler === "vite") {
    return `
// Auto-injected by swiftyMvcPlugin
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.oldView = __swifty_view__;
  });
  import.meta.hot.accept((newMod) => {
    const newView = newMod?.default;
    const oldView = import.meta.hot.data?.oldView;
    if (oldView && newView && oldView !== newView) {
      const hmr = globalThis.__swifty_hmr__;
      if (hmr && hmr.hotSwapByView) hmr.hotSwapByView(oldView, newView);
    }
  });
}
`;
  }

  // Webpack / Rspack — same self-accept pattern as the template snippet
  // above: `accept()` (no args) + `dispose()` + top-level data check.
  // Uses `import.meta.webpackHot` (the canonical ESM HMR API) —
  // see getTemplateHmrSnippet for the full rationale.
  return `
// Auto-injected by swiftyMvcPlugin
if (import.meta.webpackHot) {
  const oldView = import.meta.webpackHot.data?.oldView;
  if (oldView) {

    const newView = __swifty_view__;
    if (oldView !== newView) {
      const hmr = globalThis.__swifty_hmr__;
      if (hmr && hmr.hotSwapByView) hmr.hotSwapByView(oldView, newView);
    }
  }
  import.meta.webpackHot.dispose((data) => {
    data.oldView = __swifty_view__;
  });
  import.meta.webpackHot.accept((err) => {
    if (err) {
      console.error(err);
      globalThis.location?.reload();
    }
  });
}
`;
}

/** Regex to detect a `.html` import statement in a `.ts` source. */
const HTML_IMPORT_RE =
  /import\s+(?:template\s+from\s+|.*from\s+)?["'][^"']+\.html["']/;

/**
 * Quick check: does this `.ts` source import a `.html` template?
 *
 * Used by the plugin's `transform` hook to decide whether to inject view
 * class HMR. Files that don't import `.html` are left untouched.
 */
export function importsHtmlTemplate(source: string): boolean {
  return HTML_IMPORT_RE.test(source);
}

/**
 * Transform a `.ts` view file source to add view setup HMR.
 *
 * Steps:
 * 1. Check if the source imports a `.html` template. If not, return as-is.
 * 2. Find the `export default` declaration (via @babel/parser AST).
 * 3. Rewrite it to a named const + export, so the HMR snippet can reference
 *    the View setup by name (`__swifty_view__`).
 * 4. Append the HMR snippet.
 *
 * If the source has no `export default`, or if parsing fails, the source is
 * returned unchanged (graceful degradation — the file just won't have HMR).
 *
 * @param source - The `.ts` source code
 * @param bundler - Which bundler's HMR API to use
 * @returns The transformed source with HMR code, or the original if ineligible
 */
export function injectViewHmrSnippet(source: string, bundler: Bundler): string {
  if (!importsHtmlTemplate(source)) return source;

  // Find `export default <expression>;` and rewrite to named const + export.
  // We use a regex for the common patterns; if it doesn't match, skip HMR
  // (the file might use a non-standard export pattern).
  //
  // Supported patterns:
  //   export default defineView(...);
  //   export default defineView({...});
  //   export default <anything>;
  //
  // We capture the expression after `export default` up to the line ending
  // with `);` or `};` or just `;`. This handles the vast majority of cases.
  // For multi-line expressions, we rely on the fact that `export default`
  // is almost always a single statement ending with `);` (from defineView() or
  // defineView()).
  const exportDefaultRe = /export\s+default\s+/;
  const match = exportDefaultRe.exec(source);
  if (!match) return source;

  // Find the end of the `export default <expr>` statement.
  // We look for the matching closing paren/brace by counting depth.
  const startIdx = match.index + match[0].length;
  const endIdx = findExpressionEnd(source, startIdx);
  if (endIdx === -1) return source;

  const expression = source.substring(startIdx, endIdx);
  const before = source.substring(0, match.index);
  const after = source.substring(endIdx);
  const transformed =
    before +
    `const __swifty_view__ = ${expression};` +
    `\nexport default __swifty_view__;` +
    after +
    "\n" +
    getViewHmrSnippet(bundler);

  return transformed;
}

/**
 * Find the end position (exclusive) of the expression in an
 * `export default <expression>` statement.
 *
 * Counts paren/brace/bracket depth starting from `startIdx` until depth
 * returns to zero AND a semicolon or newline-terminated statement boundary
 * is reached.
 *
 * Returns -1 if no valid boundary is found.
 */
function findExpressionEnd(source: string, startIdx: number): number {
  let depth = 0;
  let inString: string | null = null;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = startIdx; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    // Handle string/template/comment states
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        i++; // skip escaped char
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (inTemplate) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === "`") inTemplate = false;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "`") {
      inTemplate = true;
      continue;
    }

    // Track depth
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
      continue;
    }
    if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        // Found the closing of the top-level expression.
        // Include the closing char and return the next position.
        return i + 1;
      }
      continue;
    }

    // If depth is 0 and we hit a semicolon, that's the end
    if (depth === 0 && ch === ";") {
      return i;
    }
  }

  return -1;
}
