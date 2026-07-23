/**
 * Custom markdown-it plugin: code block enhancements.
 *
 * Overrides the default fence renderer to:
 * - Delegate to Shiki for syntax highlighting when configured
 * - Wrap the output in a .codeblock chrome container (language chip,
 *   hover border, copy-button mount point — see client.css)
 * - Fall back to escaped plain text when no highlighter is configured
 */
import type MarkdownIt from "markdown-it";

export function codeBlockPlugin(md: MarkdownIt): void {
  md.renderer.rules.fence = (tokens, idx, mdOptions) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0] || "";
    const code = token.content;

    let inner: string;
    if (mdOptions.highlight) {
      // Shiki produces a fully styled <pre class="shiki"> with either
      // inline colors (single theme) or --shiki-light/--shiki-dark
      // variables (dual theme, switched by client.css).
      const highlighted = mdOptions.highlight(code, lang, "");
      inner =
        highlighted ||
        fallbackBlock(code, lang);
    } else {
      inner = fallbackBlock(code, lang);
    }

    return `<div class="codeblock" data-lang="${escapeHtml(lang || "text")}">${inner}</div>\n`;
  };
}

function fallbackBlock(code: string, lang: string): string {
  return `<pre class="codeblock-plain"><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
