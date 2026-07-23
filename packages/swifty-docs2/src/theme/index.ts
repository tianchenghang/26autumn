/**
 * jQuery theme for @swifty.js/docs2.
 *
 * Wire it up in your app entry:
 *
 * ```ts
 * import { initDocsState, initRouter, initLayout } from "@swifty.js/docs2/theme";
 * import { docsConfig, loadContent, getSearchIndex } from "@swifty-docs/generated";
 *
 * initDocsState({ config: docsConfig, loadContent, getSearchIndex });
 * initRouter();
 * initLayout("#app");
 * ```
 */
export {
  initDocsState,
  getState,
  setState,
  onStateChange,
  toggleSearch,
  setSearchOpen,
  type DocsState,
} from "./state";
export { initRouter, navigate, getPath, onRouteChange } from "./router";
export { initLayout } from "./layout";
export { initNavbar } from "./navbar";
export { initSidebar } from "./sidebar";
export { initToc } from "./toc";
export { initSearchDialog } from "./search-dialog";
export { initContentRenderer } from "./content-renderer";
export { initPrevNext } from "./prev-next";
export { initThemeToggle } from "./theme-toggle";
export { initLogo, logoTemplate } from "./logo";
export { icons } from "./icons";

// Utilities and runtime helpers
export { cn } from "./lib/utils";
export { createSearchEngine, highlightSegments } from "./lib/search";
export { createScrollSpy, type ScrollSpy } from "./lib/scroll-spy";
export {
  computePrevNext,
  normalizePath,
  type LoadedContent,
  type PageHeading,
} from "./lib/content";
