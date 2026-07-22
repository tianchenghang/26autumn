/**
 * Custom markdown-it renderer that produces swifty-mvc compatible output.
 *
 * The rendered HTML is designed to be embedded directly into a swifty-mvc
 * template function. Internal links use `data-swifty-nav` attributes (handled
 * at runtime by the DocsView's event delegation), and code blocks are
 * pre-rendered at build time.
 */
import type MarkdownIt from "markdown-it";
import type { Token } from "markdown-it/index.js";

/**
 * Render markdown-it tokens to an HTML string.
 *
 * The output is static HTML that gets wrapped into a swifty-mvc View template
 * by the compiler. No template variables are needed for the markdown body
 * itself because all content comes from the .md file at build time.
 *
 * Dynamic data (page title, TOC headings, sidebar state) is injected
 * separately through the View's updater.set().
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
