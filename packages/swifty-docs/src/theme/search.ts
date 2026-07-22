/**
 * SearchView - client-side full-text search dialog (local provider).
 *
 * Uses MiniSearch (same engine as VitePress) for prefix matching, fuzzy
 * matching, and field-weighted scoring. The search index is built lazily
 * from getSearchIndex (injected into State) on the first query.
 *
 * Open/close state is driven by State.searchOpen so the layout's navbar
 * button can toggle this sub-view without a direct reference.
 */
import MiniSearch, { type SearchResult } from "minisearch";
import { State, Router, defineView } from "@swifty.js/mvc";
import type { VDomTemplate, ViewSetup, ViewTemplate } from "@swifty.js/mvc";
import { z } from "zod";
import { icons as defaultIcons } from "./icons";
import type { SearchEntry } from "../types";

const SearchEntrySchema = z.object({
  title: z.string(),
  link: z.string(),
  headings: z.array(z.string()),
  excerpt: z.string(),
});
type RuntimeSearchEntry = z.infer<typeof SearchEntrySchema>;

// JS cannot runtime-verify a function's signature; validate it is a function
// and rely on the declared type at call sites.
type GetSearchIndexFn = () => Promise<RuntimeSearchEntry[]>;
const GetSearchIndexSchema = z.custom<GetSearchIndexFn>(
  (v) => typeof v === "function",
);

export function createSearchView(
  template: ViewTemplate | VDomTemplate,
): ViewSetup {
  return defineView((ctx) => {
    // Closure state (replaces former this._mini)
    let mini: MiniSearch | null = null;

    ctx.updater.set({
      icons: defaultIcons,
      results: [],
      hasSearched: false,
      query: "",
    });
    // Re-render when the layout toggles searchOpen via State.
    ctx.observeState("searchOpen");

    const assign = (): boolean | undefined => {
      ctx.updater.snapshot();
      const isOpen = !!State.get("searchOpen");
      ctx.updater.set({
        isOpen,
        modalClass: isOpen ? "modal modal-open" : "modal",
      });
      return ctx.updater.altered();
    };

    // Initial assign so the modal has a baseline state before the first
    // observeState-triggered render. renderMethod re-assigns on subsequent
    // toggles; altered() deduplicates no-op updates (P2-14).
    assign();

    ctx.renderMethod = () => {
      assign();
      ctx.updater.digest();
      if (ctx.updater.get("isOpen")) {
        requestAnimationFrame(() => {
          const el = document.getElementById("docs-search-input");
          if (el instanceof HTMLInputElement) {
            el.focus();
          }
        });
      }
    };

    /**
     * Lazily build the MiniSearch instance. The search index is built on
     * first query by loading all .md modules (via getSearchIndex from State)
     * and extracting pageData — no build-time searchIndex serialization.
     * MiniSearch requires a unique `id` field, synthesized from array index.
     */
    async function ensureMiniSearch(): Promise<MiniSearch | null> {
      if (mini) return mini;
      const fnParse = GetSearchIndexSchema.safeParse(
        State.get("getSearchIndex"),
      );
      if (!fnParse.success) {
        console.warn(
          "[@swifty.js/docs] getSearchIndex not injected — search is unavailable.",
        );
        return null;
      }
      const rawIndex = await fnParse.data();
      const indexParse = z.array(SearchEntrySchema).safeParse(rawIndex);
      if (!indexParse.success) {
        console.warn(
          "[@swifty.js/docs] search index failed validation — search is unavailable.",
        );
        return null;
      }
      const index = indexParse.data;
      if (index.length === 0) return null;

      const docs = index.map((entry, i) => ({ ...entry, id: i }));
      mini = new MiniSearch({
        fields: ["title", "headings", "excerpt"],
        storeFields: ["title", "link", "headings", "excerpt"],
        searchOptions: {
          prefix: true,
          fuzzy: 0.2,
          boost: { title: 2, headings: 1.5 },
        },
      });
      mini.addAll(docs);
      return mini;
    }

    return {
      template,
      assign,
      events: {
        "onModalClick<click>": (e: { eventTarget?: EventTarget | null }) => {
          // Only close when the click lands on the modal backdrop itself,
          // not on content inside the modal-box.
          const t = e.eventTarget;
          if (t instanceof HTMLElement && t.id === "docs-search-modal") {
            State.set({ searchOpen: false }).digest();
          }
        },
        "noop<click>": () => {
          // Prevent click propagation from modal-box to modal overlay.
        },
        "onSearchInput<input>": async (e: Event) => {
          const input = e.target instanceof HTMLInputElement ? e.target : null;
          const query = input?.value ?? "";

          if (!query.trim()) {
            ctx.updater
              .set({ results: [], hasSearched: false, query: "" })
              .digest();
            return;
          }

          const m = await ensureMiniSearch();

          let raw: (SearchResult & Partial<SearchEntry>)[] = [];
          if (m) {
            try {
              raw = m.search(query);
            } catch {
              raw = [];
            }
          }

          const results = raw.map((r) => ({
            title: r.title || "",
            link: r.link || "",
            excerpt: r.excerpt || "",
            highlightedTitle: highlightMatch(r.title || "", query),
            highlightedExcerpt: highlightMatch(r.excerpt || "", query),
          }));

          ctx.updater.set({ results, hasSearched: true, query }).digest();
        },
        "goToResult<click>": (e: Event) => {
          // The click may land on a child element (<p>, <mark>) inside the <a>,
          // so walk up to find the element carrying data-href.
          let el = e.target instanceof HTMLElement ? e.target : null;
          while (el && !el.dataset["href"]) el = el.parentElement;
          const href = el ? (el.dataset["href"] ?? null) : null;
          if (href) {
            Router.to(href);
            State.set({ searchOpen: false }).digest();
          }
        },
      },
    };
  });
}

/**
 * Wrap each query term occurrence in <mark> for highlighting.
 * Used with the raw {{!}} output operator in the template.
 */
function highlightMatch(text: string, query: string): string {
  if (!text) return "";
  if (!query) return text;
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  let result = text;
  for (const term of terms) {
    const regex = new RegExp(`(${escapeRegExp(term)})`, "gi");
    result = result.replace(regex, "<mark>$1</mark>");
  }
  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
