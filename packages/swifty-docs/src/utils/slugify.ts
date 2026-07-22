/**
 * Shared slugify utility.
 *
 * Converts arbitrary text into a URL-safe slug string.
 * Used by the scanner, compiler, anchor plugin, and runtime.
 */

/**
 * Create a slug from heading text for anchor links.
 *
 * Uses Unicode property escapes (\p{L} for letters, \p{N} for numbers)
 * so that CJK, Cyrillic, Arabic, and other non-ASCII scripts are preserved.
 *
 * Rules:
 * - Lowercase the text
 * - Replace non-letter/number/space/dash characters with a dash (preserves
 *   word boundaries — "Hello!World" → "hello-world", not "helloworld")
 * - Replace whitespace sequences with a single dash
 * - Collapse consecutive dashes
 * - Trim leading/trailing dashes
 * - Prefix a leading digit with underscore so the slug is a valid CSS
 *   selector (querySelector("#123") is invalid; "#_123" is valid)
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1");
}
