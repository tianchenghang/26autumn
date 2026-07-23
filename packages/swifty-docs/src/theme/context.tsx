import {
  createContext,
  createSignal,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";
import {
  DocsConfigSchema,
  FALLBACK_CONFIG,
  GetSearchIndexSchema,
  LoadContentSchema,
  type GetSearchIndexFn,
  type LoadContentFn,
  type RuntimeDocsConfig,
} from "./lib/content";

interface DocsContextValue {
  config: RuntimeDocsConfig;
  loadContent: LoadContentFn | null;
  getSearchIndex: GetSearchIndexFn | null;
  searchProvider: "local" | "docsearch" | "none";
  searchOpen: Accessor<boolean>;
  setSearchOpen: (open: boolean) => void;
  toggleSearch: () => void;
}

const DocsContext = createContext<DocsContextValue>();

export interface DocsProviderProps {
  /** Site config object from the generated module (Zod-validated). */
  config: unknown;
  /** Content loader from the generated module. */
  loadContent: unknown;
  /** Search index loader from the generated module. */
  getSearchIndex: unknown;
}

/**
 * Root provider for the docs theme. Validates the generated-module values
 * once at the boundary and exposes them (plus search dialog state) to all
 * theme components.
 */
export function DocsProvider(props: ParentProps<DocsProviderProps>) {
  const configParse = DocsConfigSchema.safeParse(props.config);
  if (!configParse.success) {
    console.warn(
      "[@swifty.js/docs] docsConfig failed validation — using fallback.",
      configParse.error.issues,
    );
  }
  const config = configParse.success ? configParse.data : FALLBACK_CONFIG;

  const loadContentParse = LoadContentSchema.safeParse(props.loadContent);
  if (!loadContentParse.success) {
    console.warn(
      "[@swifty.js/docs] loadContent not injected — pages cannot be loaded.",
    );
  }
  const searchIndexParse = GetSearchIndexSchema.safeParse(props.getSearchIndex);

  const [searchOpen, setSearchOpen] = createSignal(false);

  const value: DocsContextValue = {
    config,
    loadContent: loadContentParse.success ? loadContentParse.data : null,
    getSearchIndex: searchIndexParse.success ? searchIndexParse.data : null,
    searchProvider: config.search?.provider ?? "local",
    searchOpen,
    setSearchOpen,
    toggleSearch: () => setSearchOpen(!searchOpen()),
  };

  return (
    <DocsContext.Provider value={value}>{props.children}</DocsContext.Provider>
  );
}

export function useDocs(): DocsContextValue {
  const ctx = useContext(DocsContext);
  if (!ctx) {
    throw new Error("useDocs must be used inside a <DocsProvider>");
  }
  return ctx;
}
