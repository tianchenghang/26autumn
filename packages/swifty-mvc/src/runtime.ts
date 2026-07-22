/**
 * Template runtime helpers.
 *
 * Compiled templates import these helpers from `@swifty.js/mvc/runtime` instead
 * of inlining the implementations. That keeps each compiled `.html` module
 * small — no more ~400 bytes of duplicated helper code per template.
 *
 * The compiler imports `encHtml` / `strSafe` / `refFn` from this module and
 * aliases them as `__swifty_enc_html__` / `__swifty_str_safe__` / `__swifty_ref_fn__`
 * inside the compiled template function — see `compiler/compile-template.ts`.
 *
 * Canonical implementations live in `./common` so that dom.ts, runtime.ts,
 * and updater.ts all share a single copy.
 */

import {
  strSafe as commonStrSafe,
  encodeHTML,
  encodeURIExtra,
  encodeQuote,
  refFn,
} from "./common";

/** Null-safe `String(value)` — `null`/`undefined` become `""`. */
export const strSafe = commonStrSafe;

/** HTML-escape a value for safe embedding in markup. */
export const encHtml = encodeHTML;

/** Percent-encode a value, with extra characters escaped for stricter URIs. */
export const encUri = encodeURIExtra;

/** Backslash-escape quotes and backslashes for attribute string contents. */
export const encQuote = encodeQuote;

/**
 * Look up (or assign) a stable refData token for an object value.
 *
 * Templates use `{{@expr}}` to pass live JS values (objects/functions) through
 * the DOM by writing the token into an attribute, then resolving it back to
 * the original value when the event fires.
 */
export { refFn };
