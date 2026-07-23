import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useLocation } from "wouter-preact";
import { useDocs } from "./context";
import { CornerDownLeftIcon, FileTextIcon, SearchIcon } from "./icons";
import {
  createSearchEngine,
  highlightSegments,
  type SearchHit,
} from "./lib/search";
import { cn } from "./lib/utils";
import {
  Dialog,
  DialogAccessibleTitle,
  DialogContent,
  DialogOverlay,
  DialogPortal,
} from "./ui/dialog";
import { Kbd } from "./ui/kbd";

const MAX_RESULTS = 12;

export function SearchDialog() {
  const docs = useDocs();
  const [, navigate] = useLocation();
  const engine = useRef(createSearchEngine(docs.getSearchIndex)).current;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [indexSize, setIndexSize] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef(new Map<number, HTMLButtonElement>());
  const seqRef = useRef(0);

  const runSearch = useCallback(
    async (value: string) => {
      setQuery(value);
      if (!value.trim()) {
        seqRef.current++;
        setResults([]);
        setSearched(false);
        setActiveIdx(0);
        return;
      }
      const my = ++seqRef.current;
      const hits = await engine.search(value);
      if (my !== seqRef.current) return;
      setResults(hits.slice(0, MAX_RESULTS));
      setSearched(true);
      setActiveIdx(0);
      setIndexSize(engine.size());
    },
    [engine],
  );

  const go = useCallback(
    (link: string) => {
      docs.setSearchOpen(false);
      navigate(link);
    },
    [docs, navigate],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) =>
          results.length > 0 ? (i + 1) % results.length : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) =>
          results.length > 0 ? (i - 1 + results.length) % results.length : 0,
        );
      } else if (e.key === "Enter") {
        const hit = results[activeIdx];
        if (hit) go(hit.link);
      }
    },
    [results, activeIdx, go],
  );

  useEffect(() => {
    if (docs.searchOpen) {
      setQuery("");
      setResults([]);
      setSearched(false);
      setActiveIdx(0);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [docs.searchOpen]);

  useEffect(() => {
    itemRefs.current.get(activeIdx)?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        docs.toggleSearch();
        return;
      }
      if (e.key === "/" && !docs.searchOpen) {
        const t = e.target;
        if (
          t instanceof HTMLElement &&
          t.tagName !== "INPUT" &&
          t.tagName !== "TEXTAREA" &&
          !t.isContentEditable
        ) {
          e.preventDefault();
          docs.setSearchOpen(true);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [docs]);

  return (
    <Dialog open={docs.searchOpen} onOpenChange={docs.setSearchOpen}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent class="top-[10vh] left-1/2 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2">
          <DialogAccessibleTitle>Search documentation</DialogAccessibleTitle>

          <div class="border-border/80 flex items-center gap-2.5 border-b px-4">
            <SearchIcon class="text-muted-foreground size-4 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onInput={(e) =>
                void runSearch((e.target as HTMLInputElement).value)
              }
              onKeyDown={onKeyDown as never}
              placeholder="Search documentation…"
              aria-label="Search documentation"
              autocomplete="off"
              spellcheck={false}
              class="text-foreground placeholder:text-muted-foreground h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {query && (
              <button
                onClick={() => void runSearch("")}
                class="text-muted-foreground hover:bg-accent hover:text-foreground rounded px-1.5 py-0.5 text-[11px] transition-colors"
              >
                Clear
              </button>
            )}
            <Kbd>esc</Kbd>
          </div>

          <div class="max-h-[46vh] min-h-32 overflow-y-auto overscroll-contain p-2">
            {!query.trim() ? (
              <div class="text-muted-foreground px-3 py-10 text-center text-xs leading-relaxed">
                <SearchIcon class="mx-auto mb-3 size-6 opacity-40" />
                Search across{" "}
                {indexSize > 0 ? `${indexSize} pages` : "the documentation"} —
                titles, headings and body text.
              </div>
            ) : searched && results.length === 0 ? (
              <div class="text-muted-foreground px-3 py-10 text-center text-xs">
                No results for{" "}
                <span class="text-foreground font-medium">"{query}"</span>
                <p class="mt-1.5">Try a shorter or more general term.</p>
              </div>
            ) : results.length > 0 ? (
              <ul class="space-y-0.5">
                {results.map((hit, i) => (
                  <li key={hit.link}>
                    <button
                      ref={(el) => {
                        if (el) itemRefs.current.set(i, el);
                      }}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => go(hit.link)}
                      class={cn(
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
                        i === activeIdx && "bg-accent text-accent-foreground",
                      )}
                    >
                      <FileTextIcon class="mt-0.5 size-4 shrink-0 opacity-60" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium">
                          {highlightSegments(hit.title, query).map((seg, si) =>
                            seg.mark ? (
                              <mark key={si}>{seg.text}</mark>
                            ) : (
                              seg.text
                            ),
                          )}
                        </span>
                        {hit.excerpt && (
                          <span class="text-muted-foreground mt-0.5 block truncate text-xs">
                            {highlightSegments(hit.excerpt, query).map(
                              (seg, si) =>
                                seg.mark ? (
                                  <mark key={si}>{seg.text}</mark>
                                ) : (
                                  seg.text
                                ),
                            )}
                          </span>
                        )}
                      </span>
                      <CornerDownLeftIcon
                        class={cn(
                          "text-muted-foreground mt-1 size-3.5 shrink-0 transition-opacity duration-150",
                          i === activeIdx ? "opacity-70" : "opacity-0",
                        )}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div class="border-border/80 bg-muted/30 text-muted-foreground flex items-center gap-3 border-t px-4 py-2.5 text-[11px]">
            <span class="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span class="flex items-center gap-1">
              <Kbd>↵</Kbd> open
            </span>
            <span class="flex items-center gap-1">
              <Kbd>esc</Kbd> close
            </span>
            <span class="ml-auto font-mono tracking-wide opacity-70">
              miniSearch
            </span>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
