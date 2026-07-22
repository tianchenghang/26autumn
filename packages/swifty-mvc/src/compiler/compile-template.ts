import {
  convertArtSyntax,
  processViewEvents,
  processViewBindings,
  protectComments,
  restoreComments,
} from "./template-syntax";
import type { CompileOptions } from "@/types";
import { compileToVDomFunction } from "./compile-to-vdom-function";
import { extractGlobalVars } from "./extract-global-vars";

// ─── Phase 3: Compile to template function ───────────────────────────────

/**
 * Compile internal `<% %>` syntax to a JS template function source string.
 *
 * Walks the source with a regex matcher, converting each `<%operate content%>`
 * block into the corresponding JS expression:
 * - `<%=expr%>` / `<%:expr%>` → `__swifty_enc_html__(expr)` (HTML-escaped output)
 * - `<%!expr%>` → `__swifty_str_safe__(expr)` (raw output)
 * - `<%@expr%>` → `__swifty_ref_fn__(__swifty_ref_alt__, expr)` (reference token)
 * - `<%code%>` → raw JS statement (if/for/else blocks)
 *
 * Plain text between blocks is escaped and appended to `__swifty_out__`.
 *
 * In debug mode, wraps each expression in a `__swifty_dbg_expr__` assignment so
 * runtime errors report the original template expression and line number.
 *
 * @param source - The `<% %>`-syntax source (from `convertArtSyntax`)
 * @param debug - Enable debug mode (line tracking + try-catch wrapper)
 * @param file - Optional file path for debug error messages
 * @returns An arrow function source string
 */
function compileToFunction(
  source: string,
  debug: boolean,
  file?: string,
): string {
  const matcher = /<%([@=!:])?([\s\S]*?)%>|$/g;
  let index = 0;
  let funcSource = `__swifty_out__+='`;

  // Escape regexp for string literals
  const escapeSlashRegExp = /\\|'/g;
  const escapeBreakReturnRegExp = /\r|\n/g;

  source.replace(matcher, (match, operate, content, offset) => {
    // Escape plain text between template expressions
    funcSource += source
      .substring(index, offset)
      .replace(escapeSlashRegExp, "\\$&")
      .replace(escapeBreakReturnRegExp, "\\n");
    index = offset + match.length;

    if (debug) {
      // Debug mode: extract expression and art info for error reporting
      let expr = source.substring(
        index - match.length + 2 + (operate ? 1 : 0),
        index - 2,
      );
      // Use String.fromCharCode to safely construct regexp with \x11 control character
      const x11 = String.fromCharCode(0x11);
      const artRegExp = new RegExp(`^'(\\d+)${x11}([^${x11}]+)${x11}'$`);
      const artM = expr.match(artRegExp);
      let art = "";

      if (artM) {
        expr = expr.replace(artRegExp, "");
        art = artM[2];
      } else {
        expr = expr
          .replace(escapeSlashRegExp, "\\$&")
          .replace(escapeBreakReturnRegExp, "\\n");
      }

      if (operate === "@") {
        funcSource += `'+(__swifty_dbg_expr__='<%${operate + expr}%>',__swifty_ref_fn__(__swifty_ref_alt__,${content}))+'`;
      } else if (operate === "=" || operate === ":") {
        // : (binding) is treated the same as = (escaped output) for rendering
        funcSource += `'+(__swifty_dbg_expr__='<%${operate + expr}%>',__swifty_enc_html__(${content}))+'`;
      } else if (operate === "!") {
        funcSource += `'+(__swifty_dbg_expr__='<%${operate + expr}%>',__swifty_str_safe__(${content}))+'`;
      } else if (content) {
        if (artM) {
          funcSource += `';__swifty_dbg_art__='${art}';`;
          content = "";
        } else {
          funcSource += `';`;
        }
        // Clean up trailing +''; → ;
        if (funcSource.endsWith(`+'';`)) {
          funcSource = funcSource.substring(0, funcSource.length - 4) + ";";
        }
        if (expr) {
          funcSource += `__swifty_dbg_expr__='<%${expr}%>';`;
        }
        funcSource += content + `;__swifty_out__+='`;
      }
    } else {
      // Production mode: compact output
      if (operate === "@") {
        funcSource += `'+__swifty_ref_fn__(__swifty_ref_alt__,${content})+'`;
      } else if (operate === "=" || operate === ":") {
        // : (binding) is treated the same as = (escaped output) for rendering
        funcSource += `'+__swifty_enc_html__(${content})+'`;
      } else if (operate === "!") {
        funcSource += `'+__swifty_str_safe__(${content})+'`;
      } else if (content) {
        funcSource += `';`;
        // Clean up trailing +''; → ;
        if (funcSource.endsWith(`+'';`)) {
          funcSource = funcSource.substring(0, funcSource.length - 4) + ";";
        }
        funcSource += `${content};__swifty_out__+='`;
      }
    }
    return match;
  });

  funcSource += `';`;

  // ─── Post-processing cleanup ──────────────────────────────────────

  // Remove empty concatenations: __swifty_out__=''; → (removed)
  funcSource = funcSource.replace(/__swifty_out__\+='';/g, "");
  // Fix empty string concatenation: __swifty_out__=''+ → __swifty_out__+=
  funcSource = funcSource.replace(/__swifty_out__\+=''\+/g, "__swifty_out__+=");

  // ─── Debug error wrapper ──────────────────────────────────────────

  if (debug) {
    const filePart = file ? `\\r\\n\\tat file:${file}` : "";
    funcSource = `let __swifty_dbg_expr__,__swifty_dbg_art__;try{${funcSource}}catch(e){let msg='render error:'+(e.message||e);if(__swifty_dbg_art__)msg+='\\r\\n\\tsrc art:{{'+__swifty_dbg_art__+'}}';msg+='\\r\\n\\t'+(__swifty_dbg_art__?'translate to:':'expr:');msg+=__swifty_dbg_expr__+'${filePart}';throw msg;}`;
  }

  // ─── View ID injection: \x1f → '+__swifty_view_id__+' ────────────────

  // Use String.fromCharCode to safely handle \x1f control character
  const viewIdRegExp = new RegExp(String.fromCharCode(0x1f), "g");
  funcSource = funcSource.replace(viewIdRegExp, `'+__swifty_view_id__+'`);

  // ─── Build complete function source ───────────────────────────────
  //
  // Runtime helpers (`__swifty_enc_html__`, `__swifty_str_safe__`,
  // `__swifty_ref_fn__`) come in as parameters supplied from
  // `@swifty.js/mvc/runtime` — see `compileTemplate()`.
  // The only remaining setup is the `__swifty_ref_alt__` fallback for
  // templates invoked without refData.
  const refFallback =
    "if(!__swifty_ref_alt__)__swifty_ref_alt__=__swifty_data__;";
  const fullSource = `${refFallback}let __swifty_out__='';{{__swifty_vars__}};${funcSource}return __swifty_out__`;

  // Wrap in arrow function signature — 6 params (data, viewId, refAlt, encHtml, strSafe, refFn)
  return `(__swifty_data__,__swifty_view_id__,__swifty_ref_alt__,__swifty_enc_html__,__swifty_str_safe__,__swifty_ref_fn__)=>{${fullSource}}`;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Compile an HTML template string into a JS module string.
 * This is the main entry point for both Vite and Webpack loaders.
 *
 * The output is an ES module that exports a function with the signature:
 *   (data, viewId, refData) => string
 *
 * Internally it calls the compiled template function with the standard
 * signature: (__swifty_data__,__swifty_view_id__,__swifty_ref_alt__,__swifty_enc_html__,__swifty_str_safe__,__swifty_ref_fn__)
 *
 * @param source - The raw HTML template content
 * @param options - Compilation options
 * @returns ES module source code exporting the compiled template function
 */
export async function compileTemplate(
  source: string,
  options: CompileOptions = {},
): Promise<string> {
  const { debug = false, file, vdom = false } = options;

  const globalVars = options.globalVars ?? (await extractGlobalVars(source));

  // Phase 1: Protect comments
  const { protectedSource, comments } = protectComments(source);

  // Phase 2: Convert {{ }} art-template syntax to <% %> internal syntax
  // (Before @event processing, so {{=variable}} inside @event params
  // is already converted to <%=variable%>
  const converted = convertArtSyntax(protectedSource, debug);

  // Phase 3: Process @event attributes after art conversion
  const viewEventProcessed = processViewEvents(converted);

  // Phase 3b: Process *prop and @event bindings on v-swifty elements
  const viewBindingsProcessed = processViewBindings(viewEventProcessed);

  // Restore comments
  const finalSource = restoreComments(viewBindingsProcessed, comments);

  // Build the variable declarations string from globalVars
  const varDeclarations = globalVars
    .map((key) => `let ${key}=__swifty_data__.${key};`)
    .join("");

  if (vdom) {
    // ── VDOM mode ──
    const funcBody = compileToVDomFunction(finalSource, debug, file);
    const funcWithVars = funcBody.replace(
      "{{__swifty_vars__}}",
      () => varDeclarations,
    );

    // VDOM module wrapper:
    // - Imports vdomCreate from @swifty.js/mvc (not just runtime helpers)
    // - Does NOT import encHtml (not needed — VDOM text uses createTextNode)
    // - Inner function: 5 params (data, viewId, refAlt, strSafe, refFn)
    //
    // The default export is a named function (__swifty_template__) so that the
    // auto-injected HMR snippet (see hmr-inject.ts) can reference it by name.
    return `import { vdomCreate as __swifty_vdom_create__ } from "@swifty.js/mvc";
import { strSafe as __swifty_str_safe__, refFn as __swifty_ref_fn__ } from "@swifty.js/mvc/runtime";
function __swifty_template__(data, viewId, refData) {
  let __swifty_data__ = data || {},
      __swifty_view_id__ = viewId || '';
  return (${funcWithVars})(__swifty_data__, __swifty_view_id__, refData,
    __swifty_str_safe__, __swifty_ref_fn__
  );
}
export default __swifty_template__;`;
  }

  // ── String mode ──
  const funcBody = compileToFunction(finalSource, debug, file);
  const funcWithVars = funcBody.replace(
    "{{__swifty_vars__}}",
    () => varDeclarations,
  );

  // Runtime helpers (`encHtml`, `strSafe`, `refFn`) are imported from
  // `@swifty.js/mvc/runtime` rather than inlined into every compiled template —
  // saves bytes per `.html` module in the bundle.
  //
  // The default export is a named function (__swifty_template__) so that the
  // auto-injected HMR snippet (see hmr-inject.ts) can reference it by name.
  return `import { encHtml as __swifty_enc_html__, strSafe as __swifty_str_safe__, refFn as __swifty_ref_fn__ } from "@swifty.js/mvc/runtime";
function __swifty_template__(data, viewId, refData) {
  let __swifty_data__ = data || {},
      __swifty_view_id__ = viewId || '';
  return (${funcWithVars})(__swifty_data__, __swifty_view_id__, refData,
    __swifty_enc_html__, __swifty_str_safe__, __swifty_ref_fn__
  );
}
export default __swifty_template__;`;
}
