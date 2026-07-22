/**
 * Theme view barrel exports.
 *
 * Exports factory functions that create swifty-mvc View classes
 * for each theme component. Users call these factories with
 * their View class and compiled template to produce registered views.
 *
 * Templates are pre-compiled in BOTH string and VDOM modes during the
 * lib build. registerThemeViews selects the correct version based on
 * the consumer's FrameworkConfig.vdom setting.
 */
import { Framework } from "@swifty.js/mvc";
import { registerViewClass } from "@swifty.js/mvc";

// Dual-mode template imports — each virtual module exports __str (string-mode)
// and __vdom (VDOM-mode) compiled functions. The lib build's themeDualMode
// Vite plugin resolves virtual:swifty-docs/* IDs and compiles each .html in
// both modes. Virtual modules are used instead of direct .html imports to
// avoid conflicts with swiftyMvcPlugin7 which intercepts all .html via resolveId.
import {
  __str as docLayoutStr,
  __vdom as docLayoutVdom,
} from "virtual:swifty-docs/docs-layout";
import {
  __str as sidebarStr,
  __vdom as sidebarVdom,
} from "virtual:swifty-docs/sidebar";
import { __str as tocStr, __vdom as tocVdom } from "virtual:swifty-docs/toc";
import {
  __str as searchStr,
  __vdom as searchVdom,
} from "virtual:swifty-docs/search";

import { createDocsLayoutView } from "./docs-layout";
import { createSidebarView } from "./sidebar";
import { createTocView } from "./toc";
import { createSearchView } from "./search";

/**
 * Options for registerThemeViews.
 *
 * When called BEFORE Framework.boot(), pass { vdom } to indicate
 * which rendering mode the templates should be compiled for. When called
 * AFTER boot, the FrameworkConfig is auto-detected.
 */
interface RegisterThemeViewsOptions {
  /** Whether to register VDOM-mode templates (default: auto-detect from config, fallback false) */
  vdom?: boolean;
}

/**
 * Register all built-in theme views (layout, sidebar, toc, search) with
 * the swifty-mvc view registry. Consumers call this once in boot.ts:
 *
 * ```ts
 * // Before Framework.boot() — pass config explicitly:
 * const config: FrameworkConfig = { ..., vdom: true };
 * registerThemeViews(View, config);
 * Framework.boot(config);
 *
 * // Or after Framework.boot() — auto-detected from config:
 * Framework.boot(config);
 * registerThemeViews(View);
 * ```
 *
 * Templates are pre-compiled in both string and VDOM modes during the
 * lib build, so this function simply selects the correct version.
 */
export function registerThemeViews(options?: RegisterThemeViewsOptions): void {
  // Determine rendering mode: explicit option > Framework config > default
  const vdom =
    options?.vdom ??
    (Framework.isBooted()
      ? Framework.getConfig<boolean | undefined>("vdom")
      : undefined) ??
    false;

  const docLayout = vdom ? docLayoutVdom : docLayoutStr;
  const sidebar = vdom ? sidebarVdom : sidebarStr;
  const toc = vdom ? tocVdom : tocStr;
  const search = vdom ? searchVdom : searchStr;

  registerViewClass("theme/docs-layout", createDocsLayoutView(docLayout));
  registerViewClass("theme/sidebar", createSidebarView(sidebar));
  registerViewClass("theme/toc", createTocView(toc));
  registerViewClass("theme/search", createSearchView(search));
}

// Re-export factories and helpers for advanced users who want custom
// registration or to override individual theme views.
export { createDocsLayoutView } from "./docs-layout";
export { createSidebarView } from "./sidebar";
export { createTocView } from "./toc";
export { createSearchView } from "./search";
export { createLocalSearchClient } from "./docs-search-local";
export { icons } from "./icons";
