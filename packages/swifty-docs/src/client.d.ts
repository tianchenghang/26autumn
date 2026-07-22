/// <reference types="vite/client" />
// HTML template module declarations
// Swifty's Vite/Webpack/Rspack plugin compiles .html files into template
// functions at build time. The default export is a function, not a string.
//
// The return type is `any` because the same template function returns:
// - `string` when vdom is disabled (HTML string rendering path)
// - `VDomNode` when vdom is enabled (VDOM rendering path)
//
// Using `any` here avoids the union-type incompatibility with ViewSetup's
// `template?: ViewTemplate | VDomTemplate` — the two function signatures
// have incompatible return types (`string` vs `VDomNode`), so a union
// return type would not be assignable to either.

declare module "*.html" {
  import type { ViewTemplate, VDomTemplate } from "@swifty.js/mvc";

  const template: ViewTemplate | VDomTemplate;
  export default template;
}

/**
 * Type declarations for dual-mode virtual template modules.
 *
 * These modules are resolved at build time by the themeDualMode Vite plugin
 * (see vite.config.ts). Each virtual module reads the corresponding .html
 * file from src/theme/, compiles it in BOTH string and VDOM modes via
 * compileTemplate(), and exports two pre-compiled template functions:
 *
 *   __str  — string-mode: (data, viewId, refData, encHtml, strSafe, encUri, refFn, encQuote) => string
 *   __vdom — VDOM-mode:   (data, viewId, refData) => VDomNode
 *
 * registerThemeViews() selects the correct function based on the
 * consumer's FrameworkConfig.vdom setting at runtime.
 *
 * Virtual modules (virtual:swifty-docs/*) are used instead of direct .html
 * imports to avoid conflicts with swiftyMvcPlugin7 which intercepts all .html
 * imports via its own resolveId hook.
 */

declare module "virtual:swifty-docs/docs-layout" {
  import type { VDomTemplate, ViewTemplate } from "@swifty.js/mvc";
  const __str: ViewTemplate;
  const __vdom: VDomTemplate;
  export { __str, __vdom };
}

declare module "virtual:swifty-docs/sidebar" {
  import type { VDomTemplate, ViewTemplate } from "@swifty.js/mvc";
  const __str: ViewTemplate;
  const __vdom: VDomTemplate;
  export { __str, __vdom };
}

declare module "virtual:swifty-docs/toc" {
  import type { VDomTemplate, ViewTemplate } from "@swifty.js/mvc";
  const __str: ViewTemplate;
  const __vdom: VDomTemplate;
  export { __str, __vdom };
}

declare module "virtual:swifty-docs/search" {
  import type { VDomTemplate, ViewTemplate } from "@swifty.js/mvc";
  const __str: ViewTemplate;
  const __vdom: VDomTemplate;
  export { __str, __vdom };
}

// Algolia DocSearch CSS (side-effect import from node_modules)
declare module "@docsearch/css";

declare module "@swifty-docs/generated" {
  import type { DocsConfig, PageData } from "@swifty.js/docs";

  export function loadContent(
    path: string,
  ): Promise<{ pageData: PageData; contentHtml: string } | null>;

  export const routes: Record<string, string>;

  export const docsConfig: DocsConfig;

  export interface SearchEntry {
    title: string;
    link: string;
    headings: string[];
    excerpt: string;
  }

  export function getSearchIndex(): Promise<SearchEntry[]>;
}
