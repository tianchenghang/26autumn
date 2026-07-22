import { parse as babelParse } from "@babel/parser";
import type * as t from "@babel/types";
import {
  convertArtSyntax,
  processViewEvents,
  processViewBindings,
  protectComments,
  restoreComments,
} from "./template-syntax";

/**
 * Extract global variable names from a template source using AST analysis.
 *
 * 1. Convert template commands (<% %> blocks) into a form parseable by an AST parser
 * 2. Walk the AST to find all Identifier nodes
 * 3. Track variable declarations (VariableDeclarator, FunctionDeclaration) as local vars
 * 4. Track function parameters as local vars
 * 5. Remaining identifiers that are not local and not in the exclusion list are "global" —
 *    they must be passed in as part of the data context ($$)
 *
 * This replaces the old regex-based `extractVariables()` with proper scope analysis,
 * eliminating false positives from local template variables and function parameters.
 *
 * @param source - The raw HTML template content (with {{ }} syntax)
 * @returns Array of global variable names found in the template
 */
export async function extractGlobalVars(source: string): Promise<string[]> {
  // Step 1: Convert {{ }} art syntax to <% %> so we can analyze it
  // (reuse the same pipeline as compilation, but without debug markers)
  const { protectedSource, comments: _comments } = protectComments(source);
  const viewEventProcessed = processViewEvents(protectedSource);
  const viewBindingsProcessed = processViewBindings(viewEventProcessed);
  const converted = convertArtSyntax(viewBindingsProcessed, false);
  const template = restoreComments(converted, _comments);

  // Step 2: Convert <% %> template commands into a JS-parsable form
  //   - Replace HTML text between <% %> with unique placeholders
  //   - Keep the JS code from <% %> blocks
  //   - Wrap in backtick template literal for parsing
  const templateCmdRegExp = /<%([@=!:])?([\s\S]*?)%>|$/g;
  const fnParts: string[] = [];
  const htmlStore: Record<string, string> = {};
  let htmlIndex = 0;
  let lastIndex = 0;
  const htmlKey = String.fromCharCode(0x05);

  template.replace(
    templateCmdRegExp,
    (match, operate: string | undefined, content: string, offset: number) => {
      const start = operate ? 3 : 2;
      const htmlText = template.substring(lastIndex, offset + start);
      const key = htmlKey + htmlIndex++ + htmlKey;
      htmlStore[key] = htmlText;
      lastIndex = offset + match.length - 2;

      if (operate && content.trim()) {
        // Wrap content in brackets so it's parseable as an array expression
        fnParts.push(';"' + key + '";', "[" + content + "]");
      } else {
        fnParts.push(';"' + key + '";', content || "");
      }
      return match;
    },
  );

  let fn = fnParts.join("");

  // Wrap in a function body so it's valid JS
  fn = `(function(){${fn}})`;

  // Step 3: Parse with @babel/parser
  let ast: t.File;
  try {
    ast = babelParse(fn, {
      sourceType: "script",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    });
  } catch {
    // If parsing fails, fall back to regexp extraction
    return fallbackExtractVariables(source);
  }

  // Step 4: Walk the AST to find identifiers and track scopes
  const globalExists: Record<string, number> = {};
  for (const name of BUILTIN_GLOBALS) globalExists[name] = 1;
  const globalVars: Record<string, number> = Object.create(null);

  // Track function ranges for scope analysis
  const fnRange: t.Node[] = [];

  // First pass: collect variable declarations and function scopes
  walkAst(ast, {
    VariableDeclarator(node: t.VariableDeclarator) {
      if (node.id.type === "Identifier") {
        const name = node.id.name;
        // Mark as declared (value 3 = with init, 2 = without init)
        globalExists[name] = node.init ? 3 : 2;
      }
    },
    FunctionDeclaration(node: t.FunctionDeclaration) {
      if (node.id) {
        globalExists[node.id.name] = 3;
      }
      fnRange.push(node);
    },
    FunctionExpression(node: t.FunctionExpression) {
      fnRange.push(node);
    },
    ArrowFunctionExpression(node: t.ArrowFunctionExpression) {
      fnRange.push(node);
    },
    CallExpression(node: t.CallExpression) {
      if (node.callee.type === "Identifier") {
        globalExists[node.callee.name] = 1; // treat as built-in/const
      }
    },
  });

  // Collect function params
  const functionParams: Record<string, number> = Object.create(null);
  for (const fnNode of fnRange) {
    const params =
      "params" in fnNode
        ? (
            fnNode as
              | t.FunctionDeclaration
              | t.FunctionExpression
              | t.ArrowFunctionExpression
          ).params
        : [];
    for (const p of params) {
      if (p.type === "Identifier") {
        functionParams[p.name] = 1;
      } else if (
        p.type === "AssignmentPattern" &&
        p.left.type === "Identifier"
      ) {
        functionParams[p.left.name] = 1;
      } else if (p.type === "RestElement" && p.argument.type === "Identifier") {
        functionParams[p.argument.name] = 1;
      }
    }
  }

  // Second pass: collect all identifiers, determine which are global
  walkAst(ast, {
    Identifier(node: t.Identifier) {
      const name = node.name;
      // Skip if already known (declared, built-in, etc.)
      if (globalExists[name]) return;
      // Skip function parameters
      if (functionParams[name]) return;
      // This is a global variable that needs to be passed in
      globalVars[name] = 1;
    },
    AssignmentExpression(node: t.AssignmentExpression) {
      if (node.left.type === "Identifier") {
        const name = node.left.name;
        if (!globalExists[name] || globalExists[name] === 1) {
          // Undeclared variable being assigned — mark as existing to avoid duplicate reports
          globalExists[name] = (globalExists[name] || 0) + 1;
        }
      }
    },
  });

  return Object.keys(globalVars);
}

/**
 * Fallback regex-based variable extraction when AST parsing fails.
 * Kept for robustness — handles malformed templates gracefully.
 */
function fallbackExtractVariables(source: string): string[] {
  const vars = new Set<string>();

  const outputRegExp = /\{\{[:=!@]\s*([a-zA-Z_$][\w$]*)[^}]*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = outputRegExp.exec(source)) !== null) {
    vars.add(m[1]);
  }

  const forOfRegExp = /\{\{forOf\s+([a-zA-Z_$][\w$]*)\s+as/g;
  while ((m = forOfRegExp.exec(source)) !== null) {
    vars.add(m[1]);
  }

  const ifRegExp = /\{\{(?:else\s+)?if\s+([a-zA-Z_$][\w$]*)[^}]*\}\}/g;
  while ((m = ifRegExp.exec(source)) !== null) {
    vars.add(m[1]);
  }

  return Array.from(vars).filter((v) => !BUILTIN_GLOBALS.has(v));
}

// ─── AST walker ────────────────────────────────────────────────────────────

/**
 * Simple AST walker that visits all nodes recursively.
 */
function walkAst(
  ast: t.File,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visitors: Record<string, (node: any) => void>,
): void {
  // Babel node has `.type` as a discriminant; the cleanest narrowing pattern
  // for a generic walker without depending on @babel/types' runtime helpers
  // is to project the node into a typed local once per branch.
  function visit(node: t.Node): void {
    const type = node.type;
    if (visitors[type]) {
      visitors[type](node);
    }
    // Recurse into child nodes. We treat the node as a string-indexable
    for (const key of Object.keys(node)) {
      if (
        key === "type" ||
        key === "start" ||
        key === "end" ||
        key === "loc" ||
        key === "range"
      )
        continue;
      // Skip 'property' of non-computed MemberExpression
      // (e.g., obj.prop — 'prop' is not a standalone variable).
      if (type === "MemberExpression" && key === "property") {
        const me = node as t.MemberExpression;
        if (!me.computed) continue;
      }
      // Skip 'key' of non-computed ObjectProperty
      // (e.g., {key: value} — 'key' is not a standalone variable).
      if (type === "ObjectProperty" && key === "key") {
        const op = node as t.ObjectProperty;
        if (!op.computed) continue;
      }
      // Skip 'key' of non-computed ObjectMethod
      if (type === "ObjectMethod" && key === "key") {
        const om = node as t.ObjectMethod;
        if (!om.computed) continue;
      }
      const child = Reflect.get(node, key);
      if (Array.isArray(child)) {
        for (const item of child) {
          if (isAstNode(item)) visit(item);
        }
      } else if (isAstNode(child)) {
        visit(child);
      }
    }
  }
  visit(ast);
}

/** Type guard: is `v` a Babel-style AST node (has a string `type` field)? */
function isAstNode(v: unknown): v is t.Node {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as { type?: unknown }).type === "string"
  );
}

// ─── Built-in globals exclusion list ───────────────────────────────────────

/**
 * Built-in globals that should not be treated as template data variables.
 *
 * Template runtime helpers use `__swifty_xxx__` naming (aligned with
 * webpack conventions). They are excluded here so the AST walker does
 * not mistake them for user data variables.
 */
const BUILTIN_GLOBALS = new Set([
  // ── Template runtime helpers (injected by the compiler) ──
  "__swifty_data__",
  "__swifty_view_id__",
  "__swifty_ref_alt__",
  "__swifty_enc_html__",
  "__swifty_str_safe__",
  "__swifty_ref_fn__",
  "__swifty_out__",
  "__swifty_vdom_create__",
  "__swifty_dbg_expr__",
  "__swifty_dbg_art__",

  // JS literals
  "undefined",
  "null",
  "true",
  "false",
  "NaN",
  "Infinity",

  // JS built-in globals
  "window",
  "self",
  "globalThis",
  "document",
  "console",
  "JSON",
  "Math",
  "Intl",
  "Promise",
  "Symbol",
  "Number",
  "String",
  "Boolean",
  "Array",
  "Object",
  "Date",
  "RegExp",
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Proxy",
  "Reflect",
  "ArrayBuffer",
  "DataView",
  "Float32Array",
  "Float64Array",
  "Int8Array",
  "Int16Array",
  "Int32Array",
  "Uint8Array",
  "Uint16Array",
  "Uint32Array",
  "Uint8ClampedArray",

  // Functions
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",

  // Babel helpers
  "arguments",
  "this",
  "require",

  // Swifty framework
  "Swifty",
]);
