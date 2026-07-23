/**
 * @swifty.js/docs barrel exports.
 *
 * Main entry point — browser-safe exports only (SolidJS theme + types).
 *
 * Build-time utilities (defineConfig, scanDocsDir, generateSidebar, etc.)
 * are available from sub-path exports:
 *   - "@swifty.js/docs/vite"     (Vite plugin + build-time helpers)
 *   - "@swifty.js/docs/webpack"  (Webpack loader + build-time helpers)
 *   - "@swifty.js/docs/rspack"   (Rspack loader + build-time helpers)
 *   - "@swifty.js/docs/compiler" (compileMarkdown)
 */

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

// ============================================================
// SolidJS theme
// ============================================================

export { DocsProvider, useDocs, type DocsProviderProps } from "./theme/context";
export { DocsLayout } from "./theme/DocsLayout";
export { Navbar } from "./theme/Navbar";
export { Sidebar } from "./theme/Sidebar";
export { Toc } from "./theme/Toc";
export { SearchDialog } from "./theme/SearchDialog";
export { DocSearchWidget } from "./theme/DocSearchWidget";
export { ContentRenderer } from "./theme/ContentRenderer";
export { PrevNext } from "./theme/PrevNext";
export { ThemeToggle } from "./theme/ThemeToggle";
export { Logo } from "./theme/Logo";
export { Button, buttonVariants } from "./theme/ui/button";
export { Input } from "./theme/ui/input";
export { Kbd } from "./theme/ui/kbd";
export { cn } from "./theme/lib/utils";
export { createSearchEngine, highlightSegments } from "./theme/lib/search";
export { createScrollSpy } from "./theme/lib/scroll-spy";
export {
  computePrevNext,
  normalizePath,
  type LoadedContent,
  type PageHeading,
} from "./theme/lib/content";
export { createLocalSearchClient } from "./theme/docs-search-local";
