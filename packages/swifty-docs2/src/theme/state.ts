import $ from "jquery";
import {
  DocsConfigSchema,
  FALLBACK_CONFIG,
  GetSearchIndexSchema,
  LoadContentSchema,
  type GetSearchIndexFn,
  type LoadContentFn,
  type RuntimeDocsConfig,
} from "./lib/content";

export interface DocsState {
  config: RuntimeDocsConfig;
  loadContent: LoadContentFn | null;
  getSearchIndex: GetSearchIndexFn | null;
  searchProvider: "local" | "docsearch" | "none";
  searchOpen: boolean;
  currentPath: string;
  sidebarOpen: boolean;
}

let state: DocsState = {
  config: FALLBACK_CONFIG,
  loadContent: null,
  getSearchIndex: null,
  searchProvider: "local",
  searchOpen: false,
  currentPath: "/",
  sidebarOpen: false,
};

const bus = $({});

export function initDocsState(opts: {
  config: unknown;
  loadContent: unknown;
  getSearchIndex: unknown;
}): void {
  const configParse = DocsConfigSchema.safeParse(opts.config);
  if (!configParse.success) {
    console.warn(
      "[@swifty.js/docs2] docsConfig failed validation — using fallback.",
      configParse.error.issues,
    );
  }
  const config = configParse.success ? configParse.data : FALLBACK_CONFIG;

  const loadContentParse = LoadContentSchema.safeParse(opts.loadContent);
  if (!loadContentParse.success) {
    console.warn(
      "[@swifty.js/docs2] loadContent not injected — pages cannot be loaded.",
    );
  }
  const searchIndexParse = GetSearchIndexSchema.safeParse(opts.getSearchIndex);

  state = {
    ...state,
    config,
    loadContent: loadContentParse.success ? loadContentParse.data : null,
    getSearchIndex: searchIndexParse.success ? searchIndexParse.data : null,
    searchProvider: config.search?.provider ?? "local",
  };
}

export function getState(): DocsState {
  return state;
}

export function setState(partial: Partial<DocsState>): void {
  state = { ...state, ...partial };
  bus.trigger("state:change", [state]);
}

export function onStateChange(handler: (state: DocsState) => void): () => void {
  const fn = () => handler(state);
  bus.on("state:change", fn);
  return () => bus.off("state:change", fn);
}

export function toggleSearch(): void {
  setState({ searchOpen: !state.searchOpen });
}

export function setSearchOpen(open: boolean): void {
  setState({ searchOpen: open });
}
