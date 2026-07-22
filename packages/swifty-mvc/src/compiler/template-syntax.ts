/**
 * @swifty.js/mvc Template Compiler
 *
 *   convertArtSyntax()    ({{}} → <% %>)
 *   processViewEvents()      (@event prefix + param encoding)
 *   compileToFunction()  (<% %> → JS template function)
 *   extractGlobalVars()   (AST-based global var analysis via @babel/parser)
 *
 * - All template operators: = (escape), ! (raw), @ (ref lookup), : (binding)
 * - @event attribute processing with \x1f (viewId) prefix + \x1e (splitter) separator
 * - __swifty_str_safe__ (null-safe toString), __swifty_enc_html__ (HTML entity encode), __swifty_ref_fn__ (ref lookup)
 * - Debug mode with line tracking (__swifty_dbg_expr__/__swifty_dbg_art__) and try-catch error wrapper
 * - View ID injection (\x1f → '+__swifty_view_id__+')
 * - Post-processing cleanup of empty concatenations
 * - 0 configuration: auto-extract variables via AST analysis
 *
 * Template syntax:
 *   {{=variable}}              → escaped output
 *   {{:variable}}              → two-way binding (same as = for rendering)
 *   {{!variable}}              → raw output (no HTML escaping)
 *   {{@variable}}              → reference lookup for component data passing
 *   {{forOf list as item}}      → loop
 *   {{forOf list as item idx}}  → loop with index
 *   {{forIn obj as val key}}   → object iteration
 *   {{for(let i=0;i<n;i++)}}  → generic for loop
 *   {{if condition}}           → conditional
 *   {{else if condition}}      → else-if
 *   {{else}}                   → else
 *   {{/if}} / {{/forOf}} / {{/forIn}} / {{/for}} → close blocks
 *   {{set a = b}}              → variable declaration
 */

/**
 * SPLITTER character (U+001E). Kept local rather than importing from common.ts
 * because compiler.ts runs at build-time (Node.js) while common.ts is a
 * runtime module — avoids pulling runtime dependencies into the build path.
 */
const SPLITTER = String.fromCharCode(0x1e);

/** View ID placeholder character (U+001F). */
const VIEW_ID_PLACEHOLDER = String.fromCharCode(0x1f);

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert JS object literal parameters to URL query parameter format.
 *
 * {key: 'value', key2: 123} → key=value&key2=123
 * key=value (already URL format) → key=value
 */
function jsObjectToUrlParams(paramsStr: string): string {
  const trimmed = paramsStr.trim();
  // Already URL format: key=value&key2=value2
  if (!/^[{[]/.test(trimmed) && /=/.test(trimmed)) {
    return trimmed;
  }
  // JS object literal: {key: 'value', key2: 123}
  const objMatch = trimmed.match(/^\{(.*)\}$/s);
  if (objMatch) {
    const inner = objMatch[1];
    const pairs: string[] = [];
    const pairRegExp = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|([^,}]+))/g;
    let m: RegExpExecArray | null;
    while ((m = pairRegExp.exec(inner)) !== null) {
      const key = m[1];
      const value = m[2] ?? m[3] ?? m[4]?.trim() ?? "";
      pairs.push(`${key}=${value}`);
    }
    return pairs.join("&");
  }
  return trimmed;
}

// ─── Phase 1: Pre-processing ─────────────────────────────────────────────

/** Protected comment store — used internally by protectComments */

/**
 * Preserve HTML comments to prevent template syntax inside comments from being converted.
 */
export function protectComments(source: string): {
  protectedSource: string;
  comments: string[];
} {
  const comments: string[] = [];
  const protectedSource = source.replace(/<!--[\s\S]*?-->/g, (match) => {
    comments.push(match);
    return `__swifty_comment_${comments.length - 1}__`;
  });
  return { protectedSource, comments };
}

/**
 * Restore previously protected HTML comments.
 */
export function restoreComments(source: string, comments: string[]): string {
  return source.replace(/__swifty_comment_(\d+)__/g, (_, index: string) => {
    return comments[parseInt(index, 10)];
  });
}

/**
 * Process @event attributes.
 *
 * 1. Add \x1f (VIEW_ID_PLACEHOLDER, becomes __swifty_view_id__ at render time) prefix + \x1e separator
 * 2. Convert JS object literal params to URL query params
 *
 * @click="handlerName({key: 'value'})" → @click="\x1f\x1ehandlerName(key=value)"
 * @click="handlerName()"               → @click="\x1f\x1ehandlerName()"
 * @click="goHome"                      → unchanged (no parens = not an event handler)
 */
export function processViewEvents(source: string): string {
  return source.replace(
    /@(\w+)="([^"]+)"/g,
    (fullAttr: string, eventName: string, attrValue: string) => {
      // Parse handlerName(params) format
      const eventMatch = attrValue.match(/^(\w+)\((.*)\)$/s);
      if (!eventMatch) return fullAttr; // No parens, e.g., plain string value

      const handlerName = eventMatch[1];
      const paramsStr = eventMatch[2].trim();

      if (!paramsStr) {
        // No parameters: handlerName() → \x1f\x1ehandlerName()
        return `@${eventName}="${VIEW_ID_PLACEHOLDER}${SPLITTER}${handlerName}()"`;
      }

      // Convert JS object literal to URL query params
      const urlParams = jsObjectToUrlParams(paramsStr);
      return `@${eventName}="${VIEW_ID_PLACEHOLDER}${SPLITTER}${handlerName}(${urlParams})"`;
    },
  );
}

/**
 * Process *prop and @event bindings on v-swifty elements.
 *
 * *count="{{=count}}"        → p-swifty-count="{{=count}}"
 * *history="{{@history}}"    → p-swifty-history="{{@history}}"
 * @increment="increment"    → e-swifty-increment="increment"
 *
 * Must run AFTER processViewEvents (which only processes @event with parens).
 */
export function processViewBindings(source: string): string {
  // Transform *prop="value" → p-swifty-prop="value"
  let result = source.replace(
    /\s\*(\w+)="([^"]*)"/g,
    (_, name: string, value: string) => {
      return ` p-swifty-${name}="${value}"`;
    },
  );

  // Transform @event="handlerName" (no parens, plain identifier)
  // → e-swifty-event="handlerName"
  result = result.replace(
    /\s@(\w+)="(\w+)"/g,
    (_, eventName: string, handlerName: string) => {
      return ` e-swifty-${eventName}="${handlerName}"`;
    },
  );

  return result;
}

// ─── Phase 2: Art-template syntax → Internal <% %> syntax ────────────────

/**
 * Add line-number markers for debug mode.
 *
 * Inserts `SPLITTER + lineNo` before each `{{` tag so that runtime errors
 * can be traced back to the original template line.
 */
function addLineMarkers(source: string): string {
  const lines = source.split(/\r\n?|\n/);
  const result: string[] = [];
  let lineNo = 0;
  const openTag = "{{";

  for (const line of lines) {
    // Split by {{ and rejoin with \x1e + lineNo prefix
    const parts = line.split(openTag);
    if (parts.length > 1) {
      const reconstructed = parts
        .map((part, i) => {
          if (i === 0) return part;
          return openTag + SPLITTER + ++lineNo + part;
        })
        .join("");
      result.push(reconstructed);
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}

/**
 * Extract the debug line-marker from a `{{ }}` block.
 *
 * Returns `{ line, art }` if the block has a `SPLITTER + digits` prefix
 * (added by `addLineMarkers`), otherwise `null`.
 */
function extractArtInfo(art: string): { line: number; art: string } | null {
  const m = art.match(new RegExp(`^${SPLITTER}(\\d+)([\\s\\S]+)`));
  if (m) {
    let code = m[2].trimStart();
    // Normalize "if(" → "if (" and "for(" → "for ("
    if (code.startsWith("if(")) {
      code = code.substring(0, 2) + " " + code.substring(2);
    } else if (code.startsWith("for(")) {
      code = code.substring(0, 3) + " " + code.substring(3);
    }
    return { line: parseInt(m[1], 10), art: code };
  }
  return null;
}

/**
 * Convert {{=}}/{{:}}/{{!}}/{{@}} and control flow syntax to internal <% %> syntax.
 *
 * In debug mode, adds \x11-delimited line tracking markers:
 *   <%'lineNo\x11code\x11'%> before forOf art expression
 */
export function convertArtSyntax(source: string, debug: boolean): string {
  // Step 1: Add line markers for debug mode
  const markedSource = debug ? addLineMarkers(source) : source;

  // Step 2: Split by {{ and process forOf art block
  const openTag = "{{";
  const parts = markedSource.split(openTag);
  const result: string[] = [parts[0]]; // First part is always plain text

  // Block stack for validation
  const blockStack: { ctrl: string; line: number }[] = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    // Find the closing }}
    const closeIdx = findCloseBrace(part);
    if (closeIdx === -1) {
      // No closing }} found, treat as plain text
      result.push(openTag + part);
      continue;
    }

    const code = part.substring(0, closeIdx);
    const rest = part.substring(closeIdx + 2);

    // Extract debug info if present
    let lineNo = -1;
    let cleanCode = code;
    if (debug) {
      const info = extractArtInfo(code);
      if (info) {
        lineNo = info.line;
        cleanCode = info.art;
      }
    } else {
      cleanCode = code.trim();
    }

    // Convert the art expression to <% %> syntax
    const converted = convertArtExpression(
      cleanCode,
      debug,
      lineNo,
      blockStack,
    );
    result.push(converted);
    result.push(rest);
  }

  // Check for unclosed blocks at end
  if (blockStack.length > 0) {
    const unclosed = blockStack
      .map((b) => `"${b.ctrl}" at line ${b.line}`)
      .join(", ");
    throw new Error(`Unclosed block(s): ${unclosed}`);
  }

  return result.join("");
}

/**
 * Find the closing }} in a string, handling nested braces.
 */
function findCloseBrace(str: string): number {
  let leftCount = 0;
  let rightCount = 0;
  let maybeCount = 0;
  let maybeAt = -1;

  for (let i = 0; i < str.length; i++) {
    const c = str.charAt(i);
    if (c !== "}") {
      if (maybeCount >= 2 && maybeAt === -1) {
        maybeAt = i;
      }
      maybeCount = 0;
      rightCount = 0;
    }
    if (c === "{") {
      leftCount++;
    } else if (c === "}") {
      maybeCount++;
      if (!leftCount) {
        rightCount++;
        if (rightCount === 2) {
          return i - 1;
        }
      } else {
        leftCount--;
      }
    }
  }

  if (!leftCount && maybeCount >= 2 && maybeAt === -1) {
    maybeAt = str.length - 2;
  }

  if (maybeAt > -1) {
    return maybeAt - 2;
  }

  return -1;
}

/**
 * Strip matched outer parentheses from an expression.
 *
 * Examples:
 *   "(a > b)"     → "a > b"
 *   "((a > b))"   → "(a > b)"
 *   "a > b"       → "a > b"
 *   "(a) && (b)"  → "(a) && (b)" (inner parens prevent outer stripping)
 */
function trimOuterParens(expr: string): string {
  expr = expr.trim();
  while (expr.startsWith("(") && expr.endsWith(")")) {
    let depth = 0;
    let matched = true;
    for (let i = 0; i < expr.length - 1; i++) {
      const c = expr.charAt(i);
      if (c === "(") depth++;
      else if (c === ")") depth--;
      // If depth hits 0 before the last char, outer parens don't fully wrap
      if (depth === 0 && i < expr.length - 1) {
        matched = false;
        break;
      }
    }
    if (!matched) break;
    // Strip one layer of outer parens
    expr = expr.substring(1, expr.length - 1).trim();
  }
  return expr;
}
/**
 * Convert a single art expression (inside `{{ }}`) to `<% %>` internal syntax.
 *
 * Dispatches on the keyword: `if`, `else`, `forOf`, `forIn`, `for`, `set`,
 * and close tags (`/if`, `/forOf`, etc.). Validates the `as` keyword in
 * `forOf` / `forIn` (a common typo) and maintains a block stack to detect
 * unclosed blocks.
 */
function convertArtExpression(
  code: string,
  debug: boolean,
  lineNo: number,
  blockStack: { ctrl: string; line: number }[] = [],
): string {
  code = code.trim();

  // Debug line marker: <%'lineNo\x11code\x11'%>
  const debugPrefix =
    debug && lineNo > -1
      ? `<%'${lineNo}\x11${code.replace(/\\|'/g, "\\$&").replace(/\r\n?|\n/g, "\\n")}\x11'%>`
      : "";

  // Detect if/for shorthand: "if(condition)" or "for(init;test;update)"
  const ifForMatch = code.match(/^\s*(if|for)\s*\(/);
  if (ifForMatch) {
    const keyword = ifForMatch[1];
    const expr = code.substring(ifForMatch[0].length);
    if (keyword === "if") {
      blockStack.push({ ctrl: "if", line: lineNo });
      // then trimParentheses on the condition expression
      const rawExpr = expr.replace(/\)\s*$/, "");
      const cleanExpr = trimOuterParens(rawExpr);
      return `${debugPrefix}<%if(${cleanExpr}){%>`;
    }
    // {{for(init;test;update)}} → for(init;test;update){
    // expr has trailing ")" from the original "for(...)", need to strip it
    blockStack.push({ ctrl: "for", line: lineNo });
    const forExpr = expr.replace(/\)\s*$/, "");
    return `${debugPrefix}<%for(${forExpr}){%>`;
  }

  // Split by whitespace to get keyword + args. `String.prototype.split` on
  // a non-empty string always yields at least one element, and `code` is
  // trimmed/non-empty above (the `if (!code)` short-circuits earlier in
  // the calling pipeline), so `tokens.shift()` is always a string.
  const tokens = code.split(/\s+/);
  const keyword = tokens.shift() ?? "";

  switch (keyword) {
    case "if": {
      blockStack.push({ ctrl: "if", line: lineNo });
      const rawExpr = tokens.join(" ").trim();
      // Strip matched outer parentheses, e.g., "((a > b))" → "(a > b)"
      const expr = trimOuterParens(rawExpr);
      return `${debugPrefix}<%if(${expr}){%>`;
    }

    case "else": {
      // else/else if doesn't push to stack — it stays within the if block
      if (tokens[0] === "if") {
        tokens.shift(); // consume "if"
        const rawExpr = tokens.join(" ").trim();
        const expr = trimOuterParens(rawExpr);
        return `${debugPrefix}<%}else if(${expr}){%>`;
      }
      return `${debugPrefix}<%}else{%>`;
    }

    case "forOf": {
      blockStack.push({ ctrl: "forOf", line: lineNo });
      const object = tokens[0];
      // Validate "as" keyword
      // {{forOf list as item}} is valid; {{forOf list item}} is NOT
      if (tokens.length > 1 && tokens[1] !== "as") {
        throw new Error(
          `Bad forOf syntax: {{${code}}}. ` +
            `Expected "as" keyword, got "${tokens[1]}". ` +
            `Usage: {{forOf list as item [index]}}`,
        );
      }
      const restTokens = tokens.slice(2);
      const asValue = restTokens.join(" ");

      // Parse as expression: "value index" or "{value} key"
      const asExpr = parseAsExpr(asValue);
      const index = asExpr.key || "_i";
      const refObj = /[.[\]]/.test(object)
        ? `_art_obj_${object.replace(/[^\w]/g, "_")}`
        : object;
      const refExpr = /[.[\]]/.test(object) ? `,${refObj}=${object}` : "";

      // Length cache variable
      // Using _l which is scoped to the for block, won't conflict with user vars
      const refObjCount = "_l";

      const valueDecl = asExpr.vars
        ? `let ${asExpr.vars}=${refObj}[${index}]`
        : "";

      // Support first/last helpers
      let firstAndLast = "";
      let lastCount = "";
      if (asExpr.first) {
        firstAndLast += `let ${asExpr.first}=${index}===0;`;
      }
      if (asExpr.last) {
        lastCount = `,_lc=${refObjCount}-1`;
        firstAndLast += `let ${asExpr.last}=${index}===_lc;`;
      }

      return `${debugPrefix}<%for(let ${index}=0${refExpr},${refObjCount}=${refObj}.length${lastCount};${index}<${refObjCount};${index}++){${firstAndLast}${valueDecl}%>`;
    }

    case "forIn": {
      blockStack.push({ ctrl: "forIn", line: lineNo });
      const object = tokens[0];
      // Validate "as" keyword
      if (tokens.length > 1 && tokens[1] !== "as") {
        throw new Error(
          `Bad forIn syntax: {{${code}}}. ` +
            `Expected "as" keyword, got "${tokens[1]}". ` +
            `Usage: {{forIn obj as val [key]}}`,
        );
      }
      const restTokens2 = tokens.slice(2);
      const asValue2 = restTokens2.join(" ");
      const asExpr2 = parseAsExpr(asValue2);
      const key1 = asExpr2.key || "_k";
      const refObj2 = /[.[\]]/.test(object)
        ? `_art_obj_${object.replace(/[^\w]/g, "_")}`
        : object;
      const refExpr2 = /[.[\]]/.test(object) ? `let ${refObj2}=${object};` : "";
      const valueDecl2 = asExpr2.vars
        ? `let ${asExpr2.vars}=${refObj2}[${key1}]`
        : "";

      return `${debugPrefix}<%${refExpr2}for(let ${key1} in ${refObj2}){${valueDecl2}%>`;
    }

    case "for": {
      blockStack.push({ ctrl: "for", line: lineNo });
      const expr = tokens.join(" ").trim();
      return `${debugPrefix}<%for(${expr}){%>`;
    }

    case "set":
      return `${debugPrefix}<%let ${tokens.join(" ")};%>`;

    case "/if":
    case "/forOf":
    case "/forIn":
    case "/for": {
      // Validate block matching
      const expectedCtrl = keyword.substring(1); // "/if" → "if"
      const last = blockStack.pop();
      if (!last) {
        throw new Error(`Unexpected {{${code}}}: no matching open block`);
      }
      if (last.ctrl !== expectedCtrl) {
        throw new Error(
          `Unexpected {{${code}}}: expected {{/${last.ctrl}}} to close block opened at line ${last.line}`,
        );
      }
      return `${debugPrefix}<%}%>`;
    }

    default:
      // Unknown keyword or inline expression — pass through
      return `${debugPrefix}<%${code}%>`;
  }
}

/** Parsed "as" expression from forOf/forIn */
interface AsExpr {
  vars: string;
  key: string;
  last: string;
  first: string;
  bad: boolean;
}

/**
 * Parse the "as" expression in forOf/forIn loops.
 *
 * Examples:
 *   "value index"     → { vars: "value", key: "index" }
 *   "value"           → { vars: "value", key: "" }
 *   "{a,b} index"     → { vars: "{a,b}", key: "index" }
 *   "value index last" → { vars: "value", key: "index", last: "last" }
 */
function parseAsExpr(expr: string): AsExpr {
  expr = expr.trim();
  if (!expr) {
    return { vars: "", key: "", last: "", first: "", bad: false };
  }

  // Destructuring: starts with { or [
  if (expr.startsWith("{") || expr.startsWith("[")) {
    const stack: string[] = [];
    let vars = "";
    let key = "";
    let last = "";
    let first = "";
    let pos = 0;
    let bad = false;

    for (const c of expr) {
      if (pos === 0) vars += c;
      else if (pos === 1) key += c;
      else if (pos === 2) last += c;
      else if (pos === 3) first += c;

      if (c === "{" || c === "[") stack.push(c);
      else if (c === "}") {
        if (stack[stack.length - 1] === "{") stack.pop();
        else {
          bad = true;
          break;
        }
      } else if (c === "]") {
        if (stack[stack.length - 1] === "[") stack.pop();
        else {
          bad = true;
          break;
        }
      } else if (c === " " && !stack.length) {
        pos++;
      }
    }
    return {
      vars: vars.trim(),
      key: key.trim(),
      last: last.trim(),
      first: first.trim(),
      bad: bad || stack.length > 0,
    };
  }

  // Simple: "value index last first"
  const parts = expr.split(/\s+/);
  return {
    vars: parts[0] || "",
    key: parts[1] || "",
    last: parts[2] || "",
    first: parts[3] || "",
    bad: false,
  };
}
