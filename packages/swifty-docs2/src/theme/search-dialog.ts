import $ from "jquery";
import { icons } from "./icons";
import { getState, setSearchOpen, onStateChange } from "./state";
import { navigate } from "./router";
import {
  createSearchEngine,
  highlightSegments,
  type SearchHit,
} from "./lib/search";
import { cn } from "./lib/utils";

const MAX_RESULTS = 12;

function highlightHtml(text: string, query: string): string {
  return highlightSegments(text, query)
    .map((seg) => (seg.mark ? `<mark>${seg.text}</mark>` : seg.text))
    .join("");
}

function resultItemHtml(
  hit: SearchHit,
  idx: number,
  activeIdx: number,
  query: string,
): string {
  return `<li>
    <button data-result-idx="${idx}"
      class="${cn(
        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
        idx === activeIdx && "bg-accent text-accent-foreground",
      )}">
      <span class="mt-0.5 size-4 shrink-0 opacity-60">${icons.fileText}</span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium">${highlightHtml(hit.title, query)}</span>
        ${hit.excerpt ? `<span class="text-muted-foreground mt-0.5 block truncate text-xs">${highlightHtml(hit.excerpt, query)}</span>` : ""}
      </span>
      <span class="${cn("text-muted-foreground mt-1 size-3.5 shrink-0 transition-opacity duration-150", idx === activeIdx ? "opacity-70" : "opacity-0")}">${icons.cornerDownLeft}</span>
    </button>
  </li>`;
}

export function initSearchDialog(): () => void {
  const state = getState();
  const engine = createSearchEngine(state.getSearchIndex);

  let query = "";
  let results: SearchHit[] = [];
  let searched = false;
  let activeIdx = 0;
  let seq = 0;
  let $overlay: JQuery | null = null;

  function renderResults() {
    if (!$overlay) return;
    const $body = $overlay.find("[data-search-body]");

    if (!query.trim()) {
      const size = engine.size();
      $body.html(
        `<div class="text-muted-foreground px-3 py-10 text-center text-xs leading-relaxed">
          <span class="mx-auto mb-3 block size-6 opacity-40">${icons.search}</span>
          Search across ${size > 0 ? `${size} pages` : "the documentation"} — titles, headings and body text.
        </div>`,
      );
    } else if (searched && results.length === 0) {
      $body.html(
        `<div class="text-muted-foreground px-3 py-10 text-center text-xs">
          No results for <span class="text-foreground font-medium">"${query}"</span>
          <p class="mt-1.5">Try a shorter or more general term.</p>
        </div>`,
      );
    } else if (results.length > 0) {
      $body.html(
        `<ul class="space-y-0.5">${results
          .map((hit, i) => resultItemHtml(hit, i, activeIdx, query))
          .join("")}</ul>`,
      );
    } else {
      $body.empty();
    }
  }

  function updateActive() {
    if (!$overlay) return;
    $overlay.find("[data-result-idx]").each((_, el) => {
      const idx = Number($(el).attr("data-result-idx"));
      $(el).toggleClass("bg-accent text-accent-foreground", idx === activeIdx);
      $(el)
        .find("span:last-child")
        .toggleClass("opacity-70", idx === activeIdx)
        .toggleClass("opacity-0", idx !== activeIdx);
    });
    const $active = $overlay.find(`[data-result-idx="${activeIdx}"]`);
    if ($active.length) $active[0].scrollIntoView({ block: "nearest" });
  }

  async function runSearch(value: string) {
    query = value;
    if ($overlay) {
      $overlay.find("[data-search-input]").val(value);
      $overlay.find("[data-search-clear]").toggleClass("hidden", !value);
    }
    if (!value.trim()) {
      seq++;
      results = [];
      searched = false;
      activeIdx = 0;
      renderResults();
      return;
    }
    const my = ++seq;
    const hits = await engine.search(value);
    if (my !== seq) return;
    results = hits.slice(0, MAX_RESULTS);
    searched = true;
    activeIdx = 0;
    renderResults();
  }

  function go(link: string) {
    close();
    navigate(link);
  }

  function open() {
    query = "";
    results = [];
    searched = false;
    activeIdx = 0;

    $overlay = $(
      `<div class="fixed inset-0 z-50" data-search-overlay>
        <div class="fixed inset-0 bg-black/50 backdrop-blur-[2px] animate-overlay-in" data-search-backdrop></div>
        <div class="fixed top-[10vh] left-1/2 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 animate-dialog-in rounded-xl border border-border/80 bg-background shadow-2xl" role="dialog" aria-modal="true" aria-label="Search documentation">
          <div class="border-border/80 flex items-center gap-2.5 border-b px-4">
            <span class="text-muted-foreground size-4 shrink-0">${icons.search}</span>
            <input data-search-input type="text" placeholder="Search documentation…" aria-label="Search documentation" autocomplete="off" spellcheck="false"
              class="text-foreground placeholder:text-muted-foreground h-12 min-w-0 flex-1 bg-transparent text-sm outline-none" />
            <button data-search-clear class="text-muted-foreground hover:bg-accent hover:text-foreground hidden rounded px-1.5 py-0.5 text-[11px] transition-colors">Clear</button>
            <kbd class="border-border bg-muted text-muted-foreground pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100">esc</kbd>
          </div>
          <div data-search-body class="max-h-[46vh] min-h-32 overflow-y-auto overscroll-contain p-2"></div>
          <div class="border-border/80 bg-muted/30 text-muted-foreground flex items-center gap-3 border-t px-4 py-2.5 text-[11px]">
            <span class="flex items-center gap-1"><kbd class="border-border bg-muted pointer-events-none inline-flex h-5 select-none items-center rounded border px-1.5 font-mono text-[10px] font-medium">↑</kbd><kbd class="border-border bg-muted pointer-events-none inline-flex h-5 select-none items-center rounded border px-1.5 font-mono text-[10px] font-medium">↓</kbd> navigate</span>
            <span class="flex items-center gap-1"><kbd class="border-border bg-muted pointer-events-none inline-flex h-5 select-none items-center rounded border px-1.5 font-mono text-[10px] font-medium">↵</kbd> open</span>
            <span class="flex items-center gap-1"><kbd class="border-border bg-muted pointer-events-none inline-flex h-5 select-none items-center rounded border px-1.5 font-mono text-[10px] font-medium">esc</kbd> close</span>
            <span class="ml-auto font-mono tracking-wide opacity-70">miniSearch</span>
          </div>
        </div>
      </div>`,
    );

    $("body").append($overlay);
    renderResults();

    queueMicrotask(() => $overlay?.find("[data-search-input]").focus());

    $overlay.on("input", "[data-search-input]", (e) => {
      void runSearch((e.target as HTMLInputElement).value);
    });

    $overlay.on("click", "[data-search-clear]", () => void runSearch(""));
    $overlay.on("click", "[data-search-backdrop]", () => close());

    $overlay.on("click", "[data-result-idx]", (e) => {
      const idx = Number($(e.currentTarget).attr("data-result-idx"));
      const hit = results[idx];
      if (hit) go(hit.link);
    });

    $overlay.on("mouseenter", "[data-result-idx]", (e) => {
      activeIdx = Number($(e.currentTarget).attr("data-result-idx"));
      updateActive();
    });

    $overlay.on("keydown", "[data-search-input]", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIdx = results.length > 0 ? (activeIdx + 1) % results.length : 0;
        updateActive();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx =
          results.length > 0
            ? (activeIdx - 1 + results.length) % results.length
            : 0;
        updateActive();
      } else if (e.key === "Enter") {
        const hit = results[activeIdx];
        if (hit) go(hit.link);
      } else if (e.key === "Escape") {
        close();
      }
    });
  }

  function close() {
    setSearchOpen(false);
    $overlay?.remove();
    $overlay = null;
  }

  const disposeState = onStateChange((s) => {
    if (s.searchOpen && !$overlay) open();
    else if (!s.searchOpen && $overlay) close();
  });

  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const s = getState();
      setSearchOpen(!s.searchOpen);
      return;
    }
    if (e.key === "/" && !getState().searchOpen) {
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        t.tagName !== "INPUT" &&
        t.tagName !== "TEXTAREA" &&
        !t.isContentEditable
      ) {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
  };
  document.addEventListener("keydown", onKey);

  return () => {
    disposeState();
    document.removeEventListener("keydown", onKey);
    $overlay?.remove();
    $overlay = null;
  };
}
