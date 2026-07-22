/**
 * Heading and excerpt extraction from markdown content.
 *
 * Uses markdown-it (already a project dependency) to parse content into a
 * token stream, then walks the tokens to collect plain text — no fragile
 * regex stripping of inline syntax. Code blocks are naturally excluded
 * because fence/code_block tokens are never heading_open or inline tokens,
 * so heading-like or emphasis-like text inside code blocks is ignored.
 *
 * The same inlineText() helper is used here and (equivalently) in the
 * anchor plugin, so anchor slugs and TOC slugs stay consistent.
 */
import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it/index.js";
import type { HeadingInfo } from "../types";
import { slugify } from "./slugify";

// Shared parser instance — parsing is on the hot path in the scanner.
const md = new MarkdownIt({ html: true, linkify: true });

/**
 * Collect plain text from an inline token's children.
 *
 * Walks the inline token's children and concatenates `text` and
 * `code_inline` content. Bold/italic/link markers are naturally stripped
 * because markdown-it emits them as separate open/close tokens wrapping
 * the text, not as part of the text content.
 */
function inlineText(token: Token | undefined): string {
  if (!token || !token.children) return "";
  return token.children
    .filter((t) => t.type === "text" || t.type === "code_inline")
    .map((t) => t.content)
    .join("");
}

/**
 * Extract the first h1 heading text from markdown content.
 *
 * Returns undefined when the document has no h1. Headings inside fenced
 * code blocks are not matched because code blocks produce code_block
 * tokens, not heading_open tokens.
 */
export function extractFirstHeading(content: string): string | undefined {
  const tokens = md.parse(content, {});
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "heading_open" && t.tag === "h1") {
      const text = inlineText(tokens[i + 1]);
      return text || undefined;
    }
  }
  return undefined;
}

/**
 * Extract h2/h3 headings from markdown content for TOC generation.
 */
export function extractHeadings(content: string): HeadingInfo[] {
  const tokens = md.parse(content, {});
  const headings: HeadingInfo[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "heading_open") continue;
    if (t.tag !== "h2" && t.tag !== "h3") continue;
    const text = inlineText(tokens[i + 1]);
    if (!text) continue;
    headings.push({
      level: t.tag === "h2" ? 2 : 3,
      text,
      slug: slugify(text),
    });
  }
  return headings;
}

/**
 * Extract a plain-text excerpt from markdown content for search indexing.
 *
 * Collects text from all inline tokens that are NOT part of a heading
 * (the inline token immediately following a heading_open is skipped).
 * Code blocks are naturally excluded — fence/code_block tokens have no
 * inline children. Whitespace is collapsed and the result is truncated.
 */
export function extractExcerpt(content: string, maxLen = 200): string {
  const tokens = md.parse(content, {});
  const parts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "inline") continue;
    // Skip the inline token that carries a heading's text — excerpts should
    // reflect body content, not section titles.
    const prev = tokens[i - 1];
    if (prev && prev.type === "heading_open") continue;
    const text = inlineText(t);
    if (text) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, maxLen);
}
