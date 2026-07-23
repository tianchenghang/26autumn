/// <reference types="vite/client" />

// Algolia DocSearch CSS (side-effect import from node_modules)
declare module "@docsearch/css";

declare module "@swifty-docs/generated" {
  import type { DocsConfig, PageData } from "@swifty.js/docs";

  export function loadContent(
    path: string,
  ): Promise<{ pageData: PageData; contentHtml: string } | null>;

  export const docsConfig: DocsConfig;

  export interface SearchEntry {
    title: string;
    link: string;
    headings: string[];
    excerpt: string;
  }

  export function getSearchIndex(): Promise<SearchEntry[]>;
}
