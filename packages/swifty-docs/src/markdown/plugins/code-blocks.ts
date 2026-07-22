/**
 * Custom markdown-it plugin: code block enhancements.
 *
 * Overrides the default fence renderer to:
 * - Delegate to Shiki for syntax highlighting when configured
 * - Fall back to escaped plain text with Tailwind/DaisyUI styling
 */
import type MarkdownIt from "markdown-it";

export function codeBlockPlugin(md: MarkdownIt): void {
  md.renderer.rules.fence = (tokens, idx, mdOptions) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0] || "";
    const code = token.content;

    // If markdown-it's highlight option is set (e.g. via Shiki),
    // delegate to it. Shiki produces fully styled <pre><code> output
    // with inline CSS -- no additional wrapper needed.
    if (mdOptions.highlight) {
      const highlighted = mdOptions.highlight(code, lang, "");
      if (highlighted) {
        return `${highlighted}\n`;
      }
    }

    // Fallback: plain escaped code with Tailwind/DaisyUI styling
    return `
    <pre class="bg-neutral text-neutral-content rounded-box p-4 overflow-x-auto">
      <code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code>
    </pre>\n`;
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
