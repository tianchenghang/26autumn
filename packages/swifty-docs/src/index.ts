/**
 * @swifty.js/docs barrel exports.
 *
 * Main entry point — browser-safe exports only.
 * Includes re-exports from @swifty.js/mvc so consumers only need
 * to install @swifty.js/docs — no separate @swifty.js/mvc dependency required.
 *
 * Build-time utilities (defineConfig, scanDocsDir, generateSidebar, etc.)
 * are available from sub-path exports:
 *   - "@swifty.js/docs/vite"     (Vite plugin + build-time helpers)
 *   - "@swifty.js/docs/webpack"  (Webpack loader + build-time helpers)
 *   - "@swifty.js/docs/rspack"   (Rspack loader + build-time helpers)
 *   - "@swifty.js/docs/compiler" (compileMarkdown)
 */

import type { FrameworkConfig as SwiftyMvcFrameworkConfig } from "@swifty.js/mvc";

// ============================================================
// Re-exports from @swifty.js/mvc (so consumers don't need it directly)
// ============================================================

export {
  Framework,
  defineView,
  State,
  Router,
  registerViewClass,
} from "@swifty.js/mvc";

export type FrameworkConfig = Omit<SwiftyMvcFrameworkConfig, "routeMode"> & {
  routeMode: "history";
};

export type { ViewCtx, ViewSetup } from "@swifty.js/mvc";

// ============================================================
// @swifty.js/docs types (browser-safe)
// ============================================================

export type {
  DocsConfig,
  NavItem,
  SidebarConfig,
  SidebarItem,
  MarkdownOptions,
  HighlightOptions,
  SearchOptions,
  PageData,
  HeadingInfo,
  DocsRoute,
  SearchEntry,
  FrontmatterResult,
  CompileMarkdownOptions,
} from "./types";

// ============================================================
// Runtime utilities (browser-safe)
// ============================================================

// Browser-safe runtime utility (also available at @swifty.js/docs/runtime)
export { slugify } from "./runtime";

// Theme view factories
export {
  createDocsLayoutView,
  createSidebarView,
  createTocView,
  createSearchView,
  createLocalSearchClient,
  registerThemeViews,
} from "./theme";

// Theme icons (lucide-static raw SVG strings)
export { icons } from "./theme/icons";
