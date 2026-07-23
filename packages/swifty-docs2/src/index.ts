/**
 * @swifty.js/docs2 barrel exports.
 *
 * Main entry point — browser-safe exports only (jQuery theme + types).
 *
 * Build-time utilities (defineConfig, scanDocsDir, generateSidebar, etc.)
 * are available from sub-path exports:
 *   - "@swifty.js/docs2/vite"     (Vite plugin + build-time helpers)
 *   - "@swifty.js/docs2/compiler" (compileMarkdown)
 */

// ============================================================
// @swifty.js/docs2 types (browser-safe)
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

export { slugify } from "./runtime";

// ============================================================
// jQuery theme
// ============================================================

export {
  initDocsState,
  getState,
  setState,
  onStateChange,
  toggleSearch,
  setSearchOpen,
  type DocsState,
} from "./theme/state";
export { initRouter, navigate, getPath, onRouteChange } from "./theme/router";
export { initLayout } from "./theme/layout";
export { initNavbar } from "./theme/navbar";
export { initSidebar } from "./theme/sidebar";
export { initToc } from "./theme/toc";
export { initSearchDialog } from "./theme/search-dialog";
export { initContentRenderer } from "./theme/content-renderer";
export { initPrevNext } from "./theme/prev-next";
export { initThemeToggle } from "./theme/theme-toggle";
export { initLogo, logoTemplate } from "./theme/logo";
export { icons } from "./theme/icons";
export { cn } from "./theme/lib/utils";
export { createSearchEngine, highlightSegments } from "./theme/lib/search";
export { createScrollSpy, type ScrollSpy } from "./theme/lib/scroll-spy";
export {
  computePrevNext,
  normalizePath,
  type LoadedContent,
  type PageHeading,
} from "./theme/lib/content";
export { createLocalSearchClient } from "./theme/docs-search-local";
