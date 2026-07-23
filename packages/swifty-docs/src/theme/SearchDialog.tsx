import { useNavigate } from "@solidjs/router";
import {
  createEffect,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
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

/**
 * Spotlight-style search palette (local provider). MiniSearch powers
 * prefix + fuzzy matching; results are keyboard-navigable and highlights
 * are rendered as real <mark> elements (no innerHTML).
 */
export function SearchDialog() {
  const docs = useDocs();
  const navigate = useNavigate();
  const engine = createSearchEngine(docs.getSearchIndex);

  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<SearchHit[]>([]);
  const [searched, setSearched] = createSignal(false);
  const [activeIdx, setActiveIdx] = createSignal(0);
  const [indexSize, setIndexSize] = createSignal(0);

  let inputRef: HTMLInputElement | undefined;
  const itemRefs = new Map<number, HTMLButtonElement>();
  let seq = 0;

  async function runSearch(value: string) {
    setQuery(value);
    if (!value.trim()) {
      seq++;
      setResults([]);
      setSearched(false);
      setActiveIdx(0);
      return;
    }
    const my = ++seq;
    const hits = await engine.search(value);
    if (my !== seq) return; // superseded by a newer query
    setResults(hits.slice(0, MAX_RESULTS));
    setSearched(true);
    setActiveIdx(0);
    setIndexSize(engine.size());
  }

  function go(link: string) {
    docs.setSearchOpen(false);
    navigate(link);
  }

  function onKeyDown(e: KeyboardEvent) {
    const n = results().length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (n > 0) setActiveIdx((i) => (i + 1) % n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (n > 0) setActiveIdx((i) => (i - 1 + n) % n);
    } else if (e.key === "Enter") {
      const hit = results()[activeIdx()];
      if (hit) go(hit.link);
    }
  }

  // Reset + focus when the dialog opens.
  createEffect(() => {
    if (docs.searchOpen()) {
      setQuery("");
      setResults([]);
      setSearched(false);
      setActiveIdx(0);
      queueMicrotask(() => inputRef?.focus());
    }
  });

  // Keep the active row in view while arrowing through results.
  createEffect(() => {
    const i = activeIdx();
    itemRefs.get(i)?.scrollIntoView({ block: "nearest" });
  });

  // Global shortcuts: ⌘K / Ctrl+K toggles, "/" opens when not typing.
  createEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        docs.toggleSearch();
        return;
      }
      if (e.key === "/" && !docs.searchOpen()) {
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
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  return (
    <Dialog open={docs.searchOpen()} onOpenChange={docs.setSearchOpen}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent class="top-[10vh] left-1/2 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2">
          <DialogAccessibleTitle>Search documentation</DialogAccessibleTitle>

          <div class="border-border/80 flex items-center gap-2.5 border-b px-4">
            <SearchIcon class="text-muted-foreground size-4 shrink-0" />
            <input
              ref={inputRef}
              value={query()}
              onInput={(e) => void runSearch(e.currentTarget.value)}
              onKeyDown={onKeyDown}
              placeholder="Search documentation…"
              aria-label="Search documentation"
              autocomplete="off"
              spellcheck={false}
              class="text-foreground placeholder:text-muted-foreground h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <Show when={query()}>
              <button
                onClick={() => void runSearch("")}
                class="text-muted-foreground hover:bg-accent hover:text-foreground rounded px-1.5 py-0.5 text-[11px] transition-colors"
              >
                Clear
              </button>
            </Show>
            <Kbd>esc</Kbd>
          </div>

          <div class="max-h-[46vh] min-h-32 overflow-y-auto overscroll-contain p-2">
            <Switch>
              <Match when={!query().trim()}>
                <div class="text-muted-foreground px-3 py-10 text-center text-xs leading-relaxed">
                  <SearchIcon class="mx-auto mb-3 size-6 opacity-40" />
                  Search across{" "}
                  {indexSize() > 0
                    ? `${indexSize()} pages`
                    : "the documentation"}{" "}
                  — titles, headings and body text.
                </div>
              </Match>
              <Match when={searched() && results().length === 0}>
                <div class="text-muted-foreground px-3 py-10 text-center text-xs">
                  No results for{" "}
                  <span class="text-foreground font-medium">“{query()}”</span>
                  <p class="mt-1.5">Try a shorter or more general term.</p>
                </div>
              </Match>
              <Match when={results().length > 0}>
                <ul class="space-y-0.5">
                  <For each={results()}>
                    {(hit, i) => (
                      <li>
                        <button
                          ref={(el) => itemRefs.set(i(), el)}
                          onMouseEnter={() => setActiveIdx(i())}
                          onClick={() => go(hit.link)}
                          class={cn(
                            "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
                            i() === activeIdx() &&
                              "bg-accent text-accent-foreground",
                          )}
                        >
                          <FileTextIcon class="mt-0.5 size-4 shrink-0 opacity-60" />
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium">
                              <For each={highlightSegments(hit.title, query())}>
                                {(seg) =>
                                  seg.mark ? <mark>{seg.text}</mark> : seg.text
                                }
                              </For>
                            </span>
                            <Show when={hit.excerpt}>
                              <span class="text-muted-foreground mt-0.5 block truncate text-xs">
                                <For
                                  each={highlightSegments(hit.excerpt, query())}
                                >
                                  {(seg) =>
                                    seg.mark ? (
                                      <mark>{seg.text}</mark>
                                    ) : (
                                      seg.text
                                    )
                                  }
                                </For>
                              </span>
                            </Show>
                          </span>
                          <CornerDownLeftIcon
                            class={cn(
                              "text-muted-foreground mt-1 size-3.5 shrink-0 transition-opacity duration-150",
                              i() === activeIdx() ? "opacity-70" : "opacity-0",
                            )}
                          />
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Match>
            </Switch>
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
