/**
 * Client-side full-text search engine (local provider).
 *
 * MiniSearch (same engine as VitePress) with prefix matching, fuzzy
 * matching, and field-weighted scoring. The index is built lazily on the
 * first query by loading every page module via getSearchIndex().
 */
import MiniSearch, { type SearchResult } from "minisearch";
import { z } from "zod";
import {
  GetSearchIndexSchema,
  SearchEntrySchema,
  type GetSearchIndexFn,
  type RuntimeSearchEntry,
} from "./content";

export interface SearchHit {
  title: string;
  link: string;
  excerpt: string;
}

export interface SearchEngine {
  search(query: string): Promise<SearchHit[]>;
  /** Total number of indexed pages (available after first build). */
  size(): number;
}

export function createSearchEngine(
  getSearchIndex: GetSearchIndexFn | null,
): SearchEngine {
  let mini: MiniSearch | null = null;
  let pending: Promise<MiniSearch | null> | null = null;
  let docCount = 0;

  function ensure(): Promise<MiniSearch | null> {
    if (mini) return Promise.resolve(mini);
    if (pending) return pending;

    pending = (async () => {
      const fnParse = GetSearchIndexSchema.safeParse(getSearchIndex);
      if (!fnParse.success) {
        console.warn(
          "[@swifty.js/docs] getSearchIndex not injected — search is unavailable.",
        );
        return null;
      }
      const raw = await fnParse.data();
      const indexParse = z.array(SearchEntrySchema).safeParse(raw);
      if (!indexParse.success) {
        console.warn(
          "[@swifty.js/docs] search index failed validation — search is unavailable.",
        );
        return null;
      }
      const index: RuntimeSearchEntry[] = indexParse.data;
      if (index.length === 0) return null;

      const m = new MiniSearch({
        fields: ["title", "headings", "excerpt"],
        storeFields: ["title", "link", "headings", "excerpt"],
        searchOptions: {
          prefix: true,
          fuzzy: 0.2,
          boost: { title: 2, headings: 1.5 },
        },
      });
      m.addAll(index.map((entry, i) => ({ ...entry, id: i })));
      docCount = index.length;
      mini = m;
      return m;
    })().finally(() => {
      pending = null;
    });
    return pending;
  }

  return {
    async search(query: string): Promise<SearchHit[]> {
      const m = await ensure();
      if (!m) return [];
      let raw: (SearchResult & Partial<RuntimeSearchEntry>)[] = [];
      try {
        raw = m.search(query);
      } catch {
        raw = [];
      }
      return raw.map((r) => ({
        title: r.title || "",
        link: r.link || "",
        excerpt: r.excerpt || "",
      }));
    },
    size: () => docCount,
  };
}

export type HighlightSegment = { text: string; mark: boolean };

/**
 * Split text into plain/marked segments for each query term occurrence.
 * Rendered as <mark> elements in Solid — no innerHTML involved.
 */
export function highlightSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  if (!text) return [];
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return [{ text, mark: false }];

  const pattern = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);
  const segments: HighlightSegment[] = [];
  for (const part of parts) {
    if (!part) continue;
    const mark = terms.some((t) => part.toLowerCase() === t);
    const last = segments[segments.length - 1];
    if (last && last.mark === mark) {
      last.text += part;
    } else {
      segments.push({ text: part, mark });
    }
  }
  return segments;
}
