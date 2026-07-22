// ─── VDOM compilation (htmlparser2-based) ──────────────────────────────────

import { parseDocument } from "htmlparser2";

/** Stored template expression extracted from a `<% %>` block. */
interface VDomExprEntry {
  /** Operator: "=", "!", "@", ":", or "" (code block) */
  op: string;
  /** JS expression or statement content */
  content: string;
}

/** HTML void elements — self-closing, no children allowed. */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Escape a string for embedding in a JS single-quoted string literal. */
function vdomEscapeStr(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\x1e/g, "\\x1e");
}

/**
 * Resolve an attribute value that contains code-block (statement)
 * placeholders into an IIFE that builds and returns the final string.
 *
 * Code blocks are JS statements (if/else/for) that cannot participate in
 * a concatenation expression. We emit them inside an IIFE that accumulates
 * text into `_s` and returns it.
 */
function vdomResolveAttrValueIIFE(
  rawValue: string,
  exprStore: VDomExprEntry[],
): string {
  const stmts: string[] = [];
  let remaining = rawValue;

  while (remaining.length > 0) {
    const phIdx = remaining.indexOf("\x00");
    const viIdx = remaining.indexOf("\x1f");

    let nextSpecial = -1;
    let specialType: "ph" | "vi" | null = null;

    if (phIdx >= 0 && (viIdx < 0 || phIdx <= viIdx)) {
      nextSpecial = phIdx;
      specialType = "ph";
    } else if (viIdx >= 0) {
      nextSpecial = viIdx;
      specialType = "vi";
    }

    if (nextSpecial === -1) {
      if (remaining) stmts.push(`_s+='${vdomEscapeStr(remaining)}'`);
      break;
    }

    if (nextSpecial > 0) {
      stmts.push(`_s+='${vdomEscapeStr(remaining.substring(0, nextSpecial))}'`);
    }

    if (specialType === "vi") {
      stmts.push(`_s+=__swifty_view_id__`);
      remaining = remaining.substring(nextSpecial + 1);
    } else {
      const closeIdx = remaining.indexOf("\x00", nextSpecial + 1);
      if (closeIdx === -1) {
        stmts.push(`_s+='${vdomEscapeStr(remaining.substring(nextSpecial))}'`);
        break;
      }

      const idx = parseInt(remaining.substring(nextSpecial + 1, closeIdx), 10);
      const expr = exprStore[idx];

      if (expr.op === "=" || expr.op === ":") {
        stmts.push(`_s+=__swifty_str_safe__(${expr.content})`);
      } else if (expr.op === "!") {
        stmts.push(`_s+=__swifty_str_safe__(${expr.content})`);
      } else if (expr.op === "@") {
        stmts.push(`_s+=__swifty_ref_fn__(__swifty_ref_alt__,${expr.content})`);
      } else {
        stmts.push(expr.content);
      }

      remaining = remaining.substring(closeIdx + 1);
    }
  }

  const body = stmts.join(";");
  return `(()=>{let _s='';${body};return _s;})()`;
}

/**
 * Resolve an attribute value that may contain `\x00N\x00` placeholders
 * (template expressions) or `\x1f` (viewId) into a JS expression string.
 *
 * When only expression placeholders are present, returns a concatenation
 * expression. When code-block placeholders are present, routes to the
 * IIFE-based resolver.
 */
function vdomResolveAttrValue(
  rawValue: string,
  exprStore: VDomExprEntry[],
): string {
  const hasPlaceholders = rawValue.includes("\x00");
  const hasViewId = rawValue.includes("\x1f");

  if (!hasPlaceholders && !hasViewId) {
    return `'${vdomEscapeStr(rawValue)}'`;
  }

  // Detect code-block placeholders → route to IIFE
  if (hasPlaceholders) {
    const codeBlockRegExp = /\x00(\d+)\x00/g;
    let m: RegExpExecArray | null;
    while ((m = codeBlockRegExp.exec(rawValue)) !== null) {
      const idx = parseInt(m[1], 10);
      if (exprStore[idx] && exprStore[idx].op === "") {
        return vdomResolveAttrValueIIFE(rawValue, exprStore);
      }
    }
  }

  const segments: string[] = [];
  let remaining = rawValue;

  while (remaining.length > 0) {
    const phIdx = remaining.indexOf("\x00");
    const viIdx = remaining.indexOf("\x1f");

    let nextSpecial = -1;
    let specialType: "ph" | "vi" | null = null;

    if (phIdx >= 0 && (viIdx < 0 || phIdx <= viIdx)) {
      nextSpecial = phIdx;
      specialType = "ph";
    } else if (viIdx >= 0) {
      nextSpecial = viIdx;
      specialType = "vi";
    }

    if (nextSpecial === -1) {
      if (remaining) segments.push(`'${vdomEscapeStr(remaining)}'`);
      break;
    }

    if (nextSpecial > 0) {
      segments.push(`'${vdomEscapeStr(remaining.substring(0, nextSpecial))}'`);
    }

    if (specialType === "vi") {
      segments.push("__swifty_view_id__");
      remaining = remaining.substring(nextSpecial + 1);
    } else {
      const closeIdx = remaining.indexOf("\x00", nextSpecial + 1);
      if (closeIdx === -1) {
        segments.push(`'${vdomEscapeStr(remaining.substring(nextSpecial))}'`);
        break;
      }

      const idx = parseInt(remaining.substring(nextSpecial + 1, closeIdx));
      const expr = exprStore[idx];

      if (expr.op === "=" || expr.op === ":") {
        segments.push(`__swifty_str_safe__(${expr.content})`);
      } else if (expr.op === "!") {
        segments.push(`__swifty_str_safe__(${expr.content})`);
      } else if (expr.op === "@") {
        segments.push(`__swifty_ref_fn__(__swifty_ref_alt__,${expr.content})`);
      } else {
        segments.push(`__swifty_str_safe__(${expr.content})`);
      }

      remaining = remaining.substring(closeIdx + 1);
    }
  }

  if (segments.length === 0) return "''";
  if (segments.length === 1) return segments[0];
  return segments.join("+");
}

/** Build a JS props object literal from htmlparser2's parsed `attribs` map. */
function vdomBuildPropsFromAttribs(
  attribs: Record<string, string> | undefined,
  exprStore: VDomExprEntry[],
): string {
  if (!attribs) return "null";

  const keys = Object.keys(attribs);
  if (keys.length === 0) return "null";

  const entries: string[] = [];
  for (const name of keys) {
    const value = attribs[name];
    const valueExpr = vdomResolveAttrValue(value, exprStore);
    entries.push(`'${vdomEscapeStr(name)}':${valueExpr}`);
  }

  return `{${entries.join(",")}}`;
}

/**
 * Compile the internal `<% %>` syntax to a VDOM template function string.
 *
 * Uses htmlparser2 for robust HTML parsing:
 * 1. Extract `<% %>` blocks into a store, replace with `\x00N\x00` placeholders
 * 2. Parse the protected source with `parseDocument`
 * 3. Walk the DOM tree recursively, emitting `__swifty_vdom_create__()` calls
 *
 * Output is an arrow function:
 *   `(__swifty_data__,__swifty_view_id__,__swifty_ref_alt__,__swifty_str_safe__,__swifty_ref_fn__)=>{...}`
 */
export function compileToVDomFunction(
  source: string,
  debug: boolean,
  file?: string,
): string {
  const lines: string[] = [];
  let varCounter = 0;
  let propsCounter = 0;

  // ── Step 1: Extract <% %> blocks ──
  const exprStore: VDomExprEntry[] = [];
  const protectedSource = source.replace(
    /<%([@=!:])?([\s\S]*?)%>/g,
    (_, op: string | undefined, content: string | undefined) => {
      const idx = exprStore.length;
      exprStore.push({ op: op || "", content: (content || "").trim() });
      return `\x00${idx}\x00`;
    },
  );

  // ── Step 2: Parse with htmlparser2 ──
  const doc = parseDocument(protectedSource, {
    recognizeSelfClosing: true,
    lowerCaseTags: false,
    lowerCaseAttributeNames: false,
    decodeEntities: false,
  });

  // ── Step 3: Allocate variables ──
  const rootVar = `__swifty_vdom${varCounter++}__`;
  lines.push(`let ${rootVar}=[]`);

  function allocVar(): string {
    return `__swifty_vdom${varCounter++}__`;
  }

  // ── Step 4: Walk the DOM tree ──
  interface HPNode {
    type: string;
    data?: string;
    name?: string;
    attribs?: Record<string, string>;
    children?: HPNode[];
  }

  function emitNode(node: HPNode, parentVar: string): void {
    const type: string = node.type;
    if (type === "text") {
      emitText((node.data || "") as string, parentVar);
    } else if (type === "tag" || type === "script" || type === "style") {
      emitElement(node, parentVar);
    }
  }

  function emitText(text: string, parentVar: string): void {
    const parts = text.split(/\x00(\d+)\x00/);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        const trimmed = parts[i];
        if (trimmed.trim()) {
          lines.push(
            `${parentVar}.push(__swifty_vdom_create__(0,'${vdomEscapeStr(trimmed)}'))`,
          );
        }
      } else {
        const idx = parseInt(parts[i]);
        const expr = exprStore[idx];
        emitExpr(expr, parentVar);
      }
    }
  }

  function emitExpr(expr: VDomExprEntry, parentVar: string): void {
    if (expr.op === "=" || expr.op === ":") {
      lines.push(
        `${parentVar}.push(__swifty_vdom_create__(0,__swifty_str_safe__(${expr.content})))`,
      );
    } else if (expr.op === "!") {
      lines.push(
        `${parentVar}.push(__swifty_vdom_create__(0,__swifty_str_safe__(${expr.content}),1))`,
      );
    } else if (expr.op === "@") {
      lines.push(
        `${parentVar}.push(__swifty_vdom_create__(0,__swifty_ref_fn__(__swifty_ref_alt__,${expr.content})))`,
      );
    } else if (expr.content) {
      lines.push(expr.content);
    }
  }

  function emitElement(node: HPNode, parentVar: string): void {
    const tagName: string = node.name || "";
    const children: HPNode[] = node.children || [];
    const childVar = allocVar();
    const propsKey = `_p${propsCounter++}`;
    const props = vdomBuildPropsFromAttribs(node.attribs, exprStore);

    lines.push(`let ${propsKey}=${props}`);
    lines.push(`${childVar}=[]`);

    for (const child of children) {
      emitNode(child, childVar);
    }

    const isVoid = VOID_ELEMENTS.has(tagName) && children.length === 0;
    const childrenArg = isVoid ? "1" : childVar;
    lines.push(
      `${parentVar}.push(__swifty_vdom_create__('${tagName}',${propsKey},${childrenArg}))`,
    );
  }

  for (const child of doc.children) {
    emitNode(child, rootVar);
  }

  // ── Step 5: Emit return ──
  lines.push(`return __swifty_vdom_create__(__swifty_view_id__,0,${rootVar})`);

  // ── Step 6: Build function body ──
  const varDeclStmts: string[] = [];
  for (let i = 1; i < varCounter; i++) varDeclStmts.push(`__swifty_vdom${i}__`);
  const varDecl = varDeclStmts.length ? `let ${varDeclStmts.join(",")};` : "";
  const body = varDecl + lines.join(";");

  let funcBody = body;
  if (debug) {
    const filePart = file ? `\\r\\n\\tat file:${file}` : "";
    funcBody = `let __swifty_dbg_expr__,__swifty_dbg_art__;try{${body}}catch(e){let msg='render error:'+(e.message||e);msg+='${filePart}';throw msg;}`;
  }

  // View ID injection: \x1f → '+__swifty_view_id__+'
  const viewIdRegExp = new RegExp(String.fromCharCode(0x1f), "g");
  funcBody = funcBody.replace(viewIdRegExp, `'+__swifty_view_id__+'`);

  const refFallback =
    "if(!__swifty_ref_alt__)__swifty_ref_alt__=__swifty_data__;";
  const fullSource = `${refFallback}{{__swifty_vars__}};${funcBody}`;

  return `(__swifty_data__,__swifty_view_id__,__swifty_ref_alt__,__swifty_str_safe__,__swifty_ref_fn__)=>{${fullSource}}`;
}
