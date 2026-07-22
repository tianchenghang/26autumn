/**
 * markdown-it parser setup with the custom plugin chain.
 *
 * Creates a configured MarkdownIt instance with:
 * - HTML passthrough enabled
 * - Link auto-detection enabled
 * - Anchor plugin (heading IDs + permalink)
 * - TOC plugin ([[toc]] directive)
 * - Container plugin (::: tip, ::: warning, etc.)
 * - Code block plugin (language tags, line numbers)
 */
import MarkdownIt from "markdown-it";
import type { MarkdownOptions } from "../types";
import { anchorPlugin } from "./plugins/anchors";
import { tocPlugin } from "./plugins/toc";
import { containerPlugin } from "./plugins/containers";
import { codeBlockPlugin } from "./plugins/code-blocks";

export function createParser(options?: MarkdownOptions): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
  });

  // Plugin chain (order matters: anchors before TOC, containers after)
  md.use(anchorPlugin, { permalink: options?.anchor?.permalink ?? true });
  md.use(tocPlugin);
  md.use(containerPlugin, options?.containers);
  md.use(codeBlockPlugin);

  // Override link rendering: internal links get @click for SPA navigation,
  // external links open in a new tab.
  const defaultLinkOpen =
    md.renderer.rules["link_open"] ||
    function (tokens, idx, opts, _env, self) {
      return self.renderToken(tokens, idx, opts);
    };

  md.renderer.rules["link_open"] = (tokens, idx, opts, env, self) => {
    const href = tokens[idx].attrGet("href") || "";

    if (href.startsWith("/") || href.startsWith("#")) {
      // Internal link: intercept with swifty Router
      tokens[idx].attrSet("data-swifty-nav", "true");
    } else {
      // External link: open in new tab
      tokens[idx].attrSet("target", "_blank");
      tokens[idx].attrSet("rel", "noopener noreferrer");
    }

    return defaultLinkOpen(tokens, idx, opts, env, self);
  };

  // Override heading_open to add scroll offset class
  const defaultHeadingOpen =
    md.renderer.rules["heading_open"] ||
    function (tokens, idx, opts, _env, self) {
      return self.renderToken(tokens, idx, opts);
    };

  md.renderer.rules["heading_open"] = (tokens, idx, opts, env, self) => {
    tokens[idx].attrJoin("class", "scroll-mt-20");
    return defaultHeadingOpen(tokens, idx, opts, env, self);
  };

  return md;
}
