/**
 * Preact theme for @swifty.js/docs.
 *
 * The theme is a set of Preact components that render the build-time
 * markdown output ({ pageData, contentHtml } modules). Wire it up in your
 * app entry:
 *
 * ```tsx
 * import { DocsProvider, DocsLayout } from "@swifty.js/docs";
 * import { docsConfig, loadContent, getSearchIndex } from "@swifty-docs/generated";
 * import { render } from "preact";
 * import { Router, Route } from "wouter-preact";
 *
 * render(
 *   <DocsProvider
 *     config={docsConfig}
 *     loadContent={loadContent}
 *     getSearchIndex={getSearchIndex}
 *   >
 *     <Router>
 *       <Route path="/*" component={DocsLayout} />
 *     </Router>
 *   </DocsProvider>,
 *   document.getElementById("app")!,
 * );
 * ```
 */
export { DocsProvider, useDocs, type DocsProviderProps } from "./context";
export { DocsLayout } from "./DocsLayout";
export { Navbar } from "./Navbar";
export { Sidebar } from "./Sidebar";
export { Toc } from "./Toc";
export { SearchDialog } from "./SearchDialog";
export { DocSearchWidget } from "./DocSearchWidget";
export { ContentRenderer } from "./ContentRenderer";
export { PrevNext } from "./PrevNext";
export { ThemeToggle } from "./ThemeToggle";
export { Logo } from "./Logo";

// shadcn-style primitives
export { Button, buttonVariants } from "./ui/button";
export { Input } from "./ui/input";
export { Kbd } from "./ui/kbd";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

// Utilities and runtime helpers
export { cn } from "./lib/utils";
export { createSearchEngine, highlightSegments } from "./lib/search";
export { useScrollSpy } from "./lib/scroll-spy";
export { createLocalSearchClient } from "./docs-search-local";
export {
  computePrevNext,
  normalizePath,
  type LoadedContent,
  type PageHeading,
} from "./lib/content";
