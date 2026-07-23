/**
 * Browser-safe runtime utilities for @swifty.js/docs.
 *
 * Re-exports slugify for consumers building custom theme views. Kept free
 * of build-time dependencies (node:fs, markdown-it, etc.) so it can be
 * imported in browser bundles without pulling in Node-only code.
 */
export { slugify } from "./utils/slugify";
