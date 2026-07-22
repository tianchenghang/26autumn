/**
 * Swifty framework shared constants and encoding helpers.
 *
 * This module is the single source of truth for:
 * - The `SPLITTER` namespace separator (U+001E) used across refData, event
 *   attributes, and internal data structures
 * - Router event name constants
 * - Regex patterns for URL parsing and tag-name extraction
 * - Encoding helpers (`strSafe`, `encodeHTML`, `encodeURIExtra`, `encodeQuote`,
 *   `refFn`) shared by `dom.ts`, `runtime.ts`, and `updater.ts`
 *
 * Keeping the canonical implementations here ensures all three consumers
 * share a single copy rather than duplicating ~400 bytes per module.
 */

/** Global counter for generating unique IDs */
let globalCounter = 0;

/**
 * Internal splitter character (U+001E Record Separator).
 *
 * Invisible control character used as a namespace separator throughout the
 * framework: refData keys, event attribute encoding, cache key composition,
 * and view-path delimiters. Chosen because it never appears in user data and
 * is safe in HTML attributes.
 *
 * Uses `String.fromCharCode` rather than a literal `"\x1e"` to survive
 * bundlers/minifiers that strip control-char literals.
 */
export const SPLITTER = String.fromCharCode(0x1e);

/**
 * Router event name constants.
 *
 * - `CHANGE` — pre-change phase (preventable/rejectable)
 * - `CHANGED` — post-change phase (final notification, framework re-mounts views)
 * - `PAGE_UNLOAD` — `beforeunload` lifecycle
 */
export const RouterEvents = {
  CHANGE: "change",
  CHANGED: "changed",
  PAGE_UNLOAD: "page_unload",
};

/** Attribute name: v-swifty */
export const SWIFTY_VIEW = "v-swifty";

/** Attribute prefix for component props: p-swifty-{name} */
export const SWIFTY_PROP_PREFIX = "p-swifty-";

/** Attribute prefix for child→parent event bindings: e-swifty-{name} */
export const SWIFTY_EVENT_PREFIX = "e-swifty-";

/** View event method regex: e.g. "app\x1eclickHandler(click)" or "clickHandler()"
 * Group 1: optional frame ID (before SPLITTER)
 * Group 2: handler name
 * Group 3: params string
 */
export const EVENT_METHOD_REGEXP = new RegExp(
  `(?:([\\w-]+)${SPLITTER})?([^(]+)\\(([\\s\\S]*?)?\\)`,
);

/** View event method name regex: e.g. "name<click,mousedown>" or "$selector<click>" */
export const VIEW_EVENT_METHOD_REGEXP = /^(\$?)([\w]*)<(.*?)>(?:<([\w ,]*)>)?$/;

/** URL query/hash trim regexp */
export const URL_TRIM_HASH_REGEXP = /(?:^.*\/\/[^/]+|#.*$)/gi;

/** URL trim query regexp (before hash) */
export const URL_TRIM_QUERY_REGEXP = /^[^#]*#?!?/;

/** URL param key-value regexp */
export const URL_PARAM_REGEXP = /([^=&?/#]+)=?([^&#?]*)/g;

/** URL params test regexp */
export const IS_URL_PARAMS = /(?!^)=|&/;

/** URL query/hash trim regexp for path extraction */
export const URL_QUERY_HASH_REGEXP = /[#?].*$/;

/** SVG namespace */
export const SVG_NS = "http://www.w3.org/2000/svg";

/** MathML namespace */
export const MATH_NS = "http://www.w3.org/1998/Math/MathML";

/** Tag name regexp for I_GetNode */
export const TAG_NAME_REGEXP = /<([a-z][^/\0>\x20\t\r\n\f]+)/i;

/** Async task break time (ms) */
export const CALL_BREAK_TIME = 48;

// ============================== VDOM ==============================

/** VDOM text node tag value (number 0, falsy, distinct from string tags) */
export const V_TEXT_NODE = 0;

/** Namespace map for SVG/MathML element creation in VDOM mode */
export const VDOM_NS_MAP: Record<string, string> = {
  svg: SVG_NS,
  math: MATH_NS,
};

// ============================== VDOM ==============================

/** Increment global counter and return new value */
export function nextCounter(): number {
  return ++globalCounter;
}

// ============================================================
// Encoding helpers (shared by dom.ts, runtime.ts, updater.ts)
// ============================================================

const HTML_ENT_MAP: Record<string, string> = {
  "&": "amp",
  "<": "lt",
  ">": "gt",
  '"': "#34",
  "'": "#39",
  "`": "#96",
};

const HTML_ENT_REGEXP = /[&<>"'`]/g;

/**
 * Null-safe `String(v)` — `null` / `undefined` become `""`.
 *
 * Used by the `{{!raw}}` template operator and as the base for `encodeHTML` /
 * `encodeURIExtra` / `encodeQuote`.
 */
export function strSafe(v: unknown): string {
  return String(v == null ? "" : v);
}

/**
 * HTML-escape a value for safe embedding in markup.
 *
 * Encodes `& < > " ' \`` to HTML entities (`&amp;`, `&lt;`, etc.).
 * Applied to all `{{=escaped}}` and `{{:binding}}` template outputs.
 */
export function encodeHTML(v: unknown): string {
  return String(v == null ? "" : v).replace(
    HTML_ENT_REGEXP,
    (m: string) => "&" + HTML_ENT_MAP[m] + ";",
  );
}

const URI_ENT_MAP: Record<string, string> = {
  "!": "%21",
  "'": "%27",
  "(": "%28",
  ")": "%29",
  "*": "%2A",
};

const URI_ENT_REGEXP = /[!')(*]/g;

/**
 * URI-encode a value with extra character escaping.
 *
 * Extends `encodeURIComponent` with encoding of `! ' ( ) *` for stricter URI
 * compliance. Applied to values in `@event` URL parameters.
 */
export function encodeURIExtra(v: unknown): string {
  return encodeURIComponent(strSafe(v)).replace(
    URI_ENT_REGEXP,
    (m: string) => URI_ENT_MAP[m],
  );
}

const QUOTE_ENT_REGEXP = /['"\\]/g;

/**
 * Backslash-escape quotes and backslashes for attribute string contents.
 *
 * Used for safe embedding in single- or double-quoted HTML attribute values
 * (e.g. `data-json='...'`).
 */
export function encodeQuote(v: unknown): string {
  return strSafe(v).replace(QUOTE_ENT_REGEXP, "\\$&");
}

/**
 * Template reference function for creating stable keys for objects.
 * Stores objects in refData with SPLITTER-prefixed keys.
 */
export function refFn(
  ref: Record<string, unknown>,
  value: unknown,
  key: string,
): string {
  const counter = ref[SPLITTER] as number;
  for (let i = counter; --i; ) {
    key = SPLITTER + i;
    if (ref[key] === value) return key;
  }
  key = SPLITTER + (ref[SPLITTER] as number)++;
  ref[key] = value;
  return key;
}

/**
 * Check if a string is a refData reference token: SPLITTER followed by
 * one or more ASCII decimal digits. Used by utils.ts translateData and
 * updater.ts translate.
 */
export function isRefToken(s: string): boolean {
  if (s.length < 2 || s[0] !== SPLITTER) return false;
  for (let i = 1; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < "0".charCodeAt(0) || c > "9".charCodeAt(0)) return false;
  }
  return true;
}
