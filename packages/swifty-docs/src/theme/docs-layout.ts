import { State, Router, defineView } from "@swifty.js/mvc";
import type { VDomTemplate, ViewSetup, ViewTemplate } from "@swifty.js/mvc";
import { z } from "zod";
import { icons as defaultIcons } from "./icons";
import { createLocalSearchClient } from "./docs-search-local";
import { findDataHref } from "../utils/dom";

interface NavLink {
  link: string;
  text: string;
}

// ============================================================
// Runtime Zod schemas for State-injected values.
//
// State.get() returns unknown. These schemas validate the shape of
// injected values at runtime via safeParse, replacing hand-written
// type guards that only checked key existence ("title" in v) or
// typeof === "function" without verifying signatures — which is a
// form of type cheating the project forbids.
// ============================================================

interface RuntimeNavItem {
  text: string;
  link: string;
  items?: RuntimeNavItem[];
}

const NavItemSchema: z.ZodType<RuntimeNavItem> = z.object({
  text: z.string(),
  link: z.string(),
  items: z.lazy(() => z.array(NavItemSchema)).optional(),
});

interface RuntimeSidebarItem {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: RuntimeSidebarItem[];
  isActive?: boolean;
  itemClass?: string;
}

const SidebarItemSchema: z.ZodType<RuntimeSidebarItem> = z.object({
  text: z.string(),
  link: z.string().optional(),
  collapsed: z.boolean().optional(),
  items: z.lazy(() => z.array(SidebarItemSchema)).optional(),
  isActive: z.boolean().optional(),
  itemClass: z.string().optional(),
});

const SidebarConfigSchema = z.union([
  z.literal("auto"),
  z.array(SidebarItemSchema),
]);

const SearchOptionsSchema = z.object({
  provider: z
    .union([z.literal("local"), z.literal("docsearch"), z.literal("none")])
    .optional(),
});

const DocsConfigSchema = z.object({
  docs: z.string().optional(),
  baseUrl: z.string(),
  title: z.string(),
  description: z.string().optional(),
  nav: z.array(NavItemSchema).optional(),
  sidebar: z.record(z.string(), SidebarConfigSchema).optional(),
  search: SearchOptionsSchema.optional(),
});
type RuntimeDocsConfig = z.infer<typeof DocsConfigSchema>;
type RuntimeSidebarMap = NonNullable<RuntimeDocsConfig["sidebar"]>;

const PageHeadingSchema = z.looseObject({
  level: z.number(),
  text: z.string(),
  slug: z.string(),
});
const LoadedContentSchema = z.object({
  pageData: z.looseObject({
    title: z.string(),
    headings: z.array(PageHeadingSchema),
  }),
  contentHtml: z.string(),
});
type LoadedContent = z.infer<typeof LoadedContentSchema>;

// Function-valued State entries: JS cannot runtime-verify a function's
// parameter/return signature, so we validate that the value is a function
// and rely on the declared type at call sites. This is the strictest
// runtime check possible for function values (not a type assertion).
type LoadContentFn = (path: string) => Promise<LoadedContent | null>;
const LoadContentSchema = z.custom<LoadContentFn>(
  (v) => typeof v === "function",
);

const SearchEntrySchema = z.object({
  title: z.string(),
  link: z.string(),
  headings: z.array(z.string()),
  excerpt: z.string(),
});
type RuntimeSearchEntry = z.infer<typeof SearchEntrySchema>;

type GetSearchIndexFn = () => Promise<RuntimeSearchEntry[]>;
const GetSearchIndexSchema = z.custom<GetSearchIndexFn>(
  (v) => typeof v === "function",
);

const FALLBACK_CONFIG: RuntimeDocsConfig = {
  title: "Documentation",
  baseUrl: "/",
};

/** Parse a State value as DocsConfig. Returns null on validation failure. */
function parseDocsConfig(v: unknown): RuntimeDocsConfig | null {
  const r = DocsConfigSchema.safeParse(v);
  return r.success ? r.data : null;
}

/** Parse a State value as the loadContent function. Returns null if invalid. */
function parseLoadContent(v: unknown): LoadContentFn | null {
  const r = LoadContentSchema.safeParse(v);
  return r.success ? r.data : null;
}

/** Parse a State value as the getSearchIndex function. Returns null if invalid. */
function parseGetSearchIndex(v: unknown): GetSearchIndexFn | null {
  const r = GetSearchIndexSchema.safeParse(v);
  return r.success ? r.data : null;
}

/**
 * Flatten the sidebar tree into an ordered list of {link, text} entries.
 * Used to compute prev/next page navigation from the sidebar order.
 */
function collectLinks(items: RuntimeSidebarItem[], out: NavLink[]): void {
  for (const item of items) {
    if (item.link) out.push({ link: item.link, text: item.text });
    if (item.items) collectLinks(item.items, out);
  }
}

/**
 * Compute the previous and next page relative to `currentPath` based on the
 * flattened sidebar order. Returns nulls when the path is not in the sidebar
 * or at the boundary.
 */
function computePrevNext(
  sidebar: RuntimeSidebarMap | undefined,
  currentPath: string,
): { prevPage: NavLink | null; nextPage: NavLink | null } {
  const flat: NavLink[] = [];
  if (sidebar) {
    for (const items of Object.values(sidebar)) {
      if (Array.isArray(items)) collectLinks(items, flat);
    }
  }
  const idx = flat.findIndex((item) => item.link === currentPath);
  if (idx < 0) return { prevPage: null, nextPage: null };
  const prevPage = idx > 0 ? flat[idx - 1] : null;
  const nextPage = idx < flat.length - 1 ? flat[idx + 1] : null;
  return { prevPage, nextPage };
}

/**
 * DocsLayout view definition factory.
 *
 * Call this with the compiled template to produce a registered view.
 *
 * Icons are set once in setup (not in assign) because they are static
 * data that does not change between renders. The icons object is passed
 * to updater.set() so the template can reference them via {{!icons.name}}.
 */
export function createDocsLayoutView(
  template: ViewTemplate | VDomTemplate,
): ViewSetup {
  return defineView((ctx) => {
    // Icons are static data -- set once in setup, not per-render.
    ctx.updater.set({ icons: defaultIcons });

    // Observe path changes so layout re-renders on navigation.
    // The layout view stays mounted (all /docs/* routes map to this view),
    // so observeLocation triggers an async render to reload content.
    ctx.observeLocation([], true);

    // DocSearch is initialized after the first render completes (see
    // renderMethod) because setup runs before the template DOM is mounted,
    // so document.getElementById returns null at setup time.
    let docSearchInitialized = false;

    /**
     * Async render: load the content module for the current route path,
     * publish page headings to State (for the TOC sub-view), then digest.
     *
     * Because all /docs/* routes map to this same viewId, swifty-mvc does NOT
     * unmount/remount the layout on navigation — it only re-runs render().
     * The signature guard short-circuits stale loads when the user navigates
     * again before the previous import resolves.
     */
    ctx.renderMethod = async () => {
      const cfg = parseDocsConfig(State.get("docsConfig")) ?? FALLBACK_CONFIG;
      const loadContent = parseLoadContent(State.get("loadContent"));
      const rawPath = Router.parse().path || cfg.baseUrl || "/";

      // Redirect /index, /index.md, /index.html to the clean directory path.
      // Uses replace=true so no history entry is added (true redirect).
      // e.g. "/docs/guide/index.md" → "/docs/guide", "/index" → "/"
      //
      // The regex REQUIRES "/index" to be present (the previous version made
      // every group optional, which matched ANY string and caused render to
      // return early on every navigation — content was never loaded).
      const indexMatch = rawPath.match(/^(.*?)(\/index(?:\.md|\.html)?)\/?$/);
      if (indexMatch) {
        const cleanPath = indexMatch[1] || "/";
        Router.to(cleanPath, {}, true);
        return;
      }

      // Normalize trailing slashes to match route keys (which never have
      // trailing slashes). "/docs/ch1/" → "/docs/ch1".
      const path = rawPath.replace(/\/+$/, "") || "/";

      const sig = ctx.signature.value;
      let content: LoadedContent | null = null;
      try {
        if (loadContent) {
          const result = await loadContent(path);
          // Validate the loaded module shape before consuming it — the
          // generated loader returns untyped data from a dynamic import.
          const parsed = LoadedContentSchema.safeParse(result);
          content = parsed.success ? parsed.data : null;
        }
      } catch (err) {
        console.warn("[@swifty.js/docs] Failed to load content for", path, err);
      }
      if (ctx.signature.value !== sig) return; // superseded by a newer render

      if (content) {
        // Publish current page headings so the TOC sub-view can render.
        State.set({
          currentPageHeadings: content.pageData.headings,
          currentPageTitle: content.pageData.title,
        }).digest();
      }

      // Compute prev/next from the flattened sidebar order.
      const { prevPage, nextPage } = computePrevNext(cfg.sidebar, path);

      ctx.updater.set({
        siteTitle: cfg.title,
        navItems: cfg.nav ?? [],
        searchProvider: cfg.search?.provider ?? "local",
        contentHtml: content?.contentHtml ?? "<p>Page not found.</p>",
        prevPage,
        nextPage,
      });
      ctx.updater.digest();

      // Initialize DocSearch after the layout DOM is rendered. setup runs
      // before the template is in the DOM, so we defer to a macrotask after
      // the first successful render (the container now exists).
      if (!docSearchInitialized && cfg.search?.provider === "docsearch") {
        docSearchInitialized = true;
        setTimeout(() => {
          void initDocSearch();
        }, 0);
      }
    };

    return {
      template,
      events: {
        "navigateTo<click>": (e: Event) => {
          // Clicks may land on child elements; walk up to the element
          // carrying data-href (see findDataHref).
          const href = findDataHref(e.target);
          if (href) {
            Router.to(href);
          }
        },
        "navigateHome<click>": () => {
          const cfg = parseDocsConfig(State.get("docsConfig"));
          Router.to(cfg?.baseUrl ?? "/docs/");
        },
        "openSearch<click>": () => {
          // Toggle searchOpen via State. The SearchView observes this key and
          // re-renders with `class="modal modal-open"` (via {{if isOpen}} in
          // the template), so modal visibility is fully driven by the Updater
          // pipeline — no manual DOM manipulation.
          State.set({ searchOpen: true }).digest();
        },
      },
    };
  });
}

/**
 * Initialize the Algolia DocSearch widget with local search index.
 *
 * Dynamically imports @docsearch/js and @docsearch/css, then mounts
 * the widget into #docsearch-container. The widget provides its own
 * styled button and search modal with keyboard shortcut (Ctrl+K).
 *
 * Uses createLocalSearchClient() to query the pre-built search index
 * instead of Algolia's hosted API -- no credentials required.
 */
async function initDocSearch(): Promise<void> {
  // searchIndex is lazily built at runtime via getSearchIndex (loading
  // all .md modules on first search) — no build-time serialization.
  const getSearchIndex = parseGetSearchIndex(State.get("getSearchIndex"));
  const rawIndex = getSearchIndex ? await getSearchIndex() : [];
  // Validate the index shape before handing it to the search client.
  const indexParse = z.array(SearchEntrySchema).safeParse(rawIndex);
  const searchIndex = indexParse.success ? indexParse.data : [];
  const localClient = createLocalSearchClient(searchIndex);

  import("@docsearch/css");
  import("@docsearch/js")
    .then(({ default: docsearch }) => {
      const container = document.getElementById("docsearch-container");
      if (!container) return;

      docsearch({
        container,
        // Dummy credentials -- the actual search is handled by our local
        // client injected via transformSearchClient below.
        appId: "local",
        apiKey: "local",
        indexName: "local",
        transformSearchClient: (client) => {
          // Proxy the client so `search` calls route to our local index
          // implementation while all other property access falls through
          // to the original Algolia client. Avoids mutating the upstream
          // client object (fragile across DocSearch versions) and avoids
          // assigning an incompatible function signature to a typed slot.
          return new Proxy(client, {
            get(target, prop, receiver) {
              if (prop === "search") return localClient.search;
              return Reflect.get(target, prop, receiver);
            },
          });
        },
      });
    })
    .catch((e: unknown) => {
      console.warn("[@swifty.js/docs] Failed to initialize DocSearch:", e);
    });
}
