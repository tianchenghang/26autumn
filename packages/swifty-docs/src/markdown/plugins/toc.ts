/**
 * Custom markdown-it plugin: [[toc]] directive.
 *
 * Replaces `[[toc]]` in markdown content with a `<div v-swifty="theme/toc">`
 * placeholder that gets mounted as a TocView at runtime.
 */
import type MarkdownIt from "markdown-it";

export function tocPlugin(md: MarkdownIt): void {
  // Register inline rule to match [[toc]]
  md.inline.ruler.before("emphasis", "toc", (state, silent) => {
    const src = state.src.slice(state.pos);
    const match = src.match(/^\[\[toc\]\]/i);
    if (!match) return false;

    // During the silent probe phase, report a match so downstream inline
    // rules (e.g. emphasis) do not consume the leading "[" of [[toc]].
    if (silent) return true;

    const token = state.push("toc_placeholder", "", 0);
    token.markup = match[0];
    state.pos += match[0].length;
    return true;
  });

  // Render the [[toc]] placeholder as a v-swifty mount point
  md.renderer.rules["toc_placeholder"] = () => {
    return '<div v-swifty="theme/toc"></div>';
  };
}
