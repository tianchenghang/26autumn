/**
 * Custom markdown-it renderer that produces the theme's content HTML.
 *
 * The rendered HTML is embedded into the compiled page module as
 * `contentHtml` and injected into the article element by the SolidJS
 * ContentRenderer at runtime. Internal links use `data-swifty-nav`
 * attributes (intercepted for SPA navigation), and code blocks are
 * pre-rendered at build time.
 */
import type MarkdownIt from "markdown-it";
import type { Token } from "markdown-it/index.js";

/**
 * Render markdown-it tokens to an HTML string.
 *
 * The output is static HTML — all content comes from the .md file at
 * build time. Dynamic data (page title, TOC headings, sidebar state)
 * flows through Solid signals in the theme instead.
 */
export function renderToSwiftyTemplate(
  tokens: Token[],
  md: MarkdownIt,
): string {
  // Use the default renderer (which has our plugin overrides applied).
  // The plugins handle link interception, heading anchors, containers,
  // and code blocks through their render rule overrides.
  return md.renderer.render(tokens, md.options, {});
}
