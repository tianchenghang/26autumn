import $ from "jquery";
import { icons } from "./icons";
import { getState, setState } from "./state";
import { onRouteChange, navigate, getPath } from "./router";
import {
  computePrevNext,
  LoadedContentSchema,
  normalizePath,
  type LoadedContent,
} from "./lib/content";
import { cn, $mount } from "./lib/utils";
import { initNavbar } from "./navbar";
import { initSidebar } from "./sidebar";
import { initToc } from "./toc";
import { initContentRenderer } from "./content-renderer";
import { initPrevNext } from "./prev-next";
import { initSearchDialog } from "./search-dialog";
import { logoTemplate } from "./logo";

function backgroundLayersHtml(): string {
  return `<div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10">
    <div class="absolute inset-0 bg-[radial-gradient(56rem_30rem_at_16%_-10%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_70%)]"></div>
    <div class="absolute inset-0 bg-[radial-gradient(44rem_26rem_at_96%_-4%,color-mix(in_oklab,var(--primary)_6%,transparent),transparent_70%)]"></div>
    <div class="via-primary/40 absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent"></div>
    <div class="docs-grid absolute inset-0"></div>
    <div class="docs-grain absolute inset-0"></div>
  </div>`;
}

function pageSkeletonHtml(): string {
  return `<div class="animate-fade-in space-y-4" role="status">
    <div class="skeleton h-9 w-2/5 rounded-lg"></div>
    <div class="skeleton mt-6 h-4 w-full rounded-md"></div>
    <div class="skeleton h-4 w-11/12 rounded-md"></div>
    <div class="skeleton h-4 w-4/5 rounded-md"></div>
    <div class="skeleton mt-8 h-44 w-full rounded-xl"></div>
    <div class="skeleton mt-4 h-4 w-3/5 rounded-md"></div>
    <span class="sr-only">Loading page…</span>
  </div>`;
}

function notFoundHtml(path: string, home: string): string {
  return `<div class="animate-fade-in flex flex-col items-start gap-4 py-16">
    <span class="border-border bg-muted/40 text-muted-foreground grid size-12 place-items-center rounded-xl border">
      <span class="size-6">${icons.compass}</span>
    </span>
    <h1 class="font-display text-3xl font-semibold tracking-tight">Page not found</h1>
    <p class="text-muted-foreground max-w-md text-sm leading-relaxed">
      Nothing lives at <code class="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs">${path}</code>. It may have moved, or the link may be out of date.
    </p>
    <a href="${home}" class="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">Back to the docs</a>
  </div>`;
}

export function initLayout(mount: string | HTMLElement): () => void {
  const $root = $mount(mount);
  const state = getState();
  const landing = state.config.nav?.[0]?.link ?? state.config.baseUrl ?? "/";
  const disposers: Array<() => void> = [];

  let contentDisposer: (() => void) | null = null;
  let tocDisposer: (() => void) | null = null;
  let prevNextDisposer: (() => void) | null = null;
  let sidebarDisposer: (() => void) | null = null;
  let mobileSidebarDisposer: (() => void) | null = null;

  $root.html(
    `<div class="bg-background text-foreground min-h-screen font-sans antialiased">
      <a href="#main-content" class="skip-link">Skip to content</a>
      ${backgroundLayersHtml()}
      <div data-navbar></div>
      <div class="mx-auto max-w-[1440px] px-4 pt-14 lg:px-8">
        <div class="grid grid-cols-1 gap-10 lg:grid-cols-[236px_minmax(0,1fr)] xl:grid-cols-[236px_minmax(0,1fr)_224px]">
          <aside class="hidden lg:block">
            <div class="sidebar-scroll sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pr-3" data-sidebar></div>
          </aside>
          <main id="main-content" class="min-w-0 scroll-mt-20 py-8 lg:py-10">
            <div data-content></div>
            <div data-prev-next></div>
            <footer class="border-border/70 text-muted-foreground mt-16 flex flex-wrap items-center justify-between gap-2 border-t pt-5 pb-10 text-xs">
              <span>© ${new Date().getFullYear()} ${state.config.title}</span>
              <span class="font-mono">Built with <span class="text-primary">@swifty.js/docs</span></span>
            </footer>
          </main>
          <aside class="hidden xl:block">
            <div class="sidebar-scroll sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-10" data-toc></div>
          </aside>
        </div>
      </div>
      <div data-mobile-drawer class="fixed inset-0 z-50 pointer-events-none lg:hidden" aria-hidden="true">
        <div data-drawer-backdrop class="bg-foreground/25 absolute inset-0 backdrop-blur-[2px] opacity-0 transition-opacity duration-300 dark:bg-black/50"></div>
        <div role="dialog" aria-modal="true" aria-label="Navigation menu"
          class="border-border bg-sidebar absolute inset-y-0 left-0 flex w-72 -translate-x-full flex-col border-r shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
          <div class="border-border/70 flex h-14 shrink-0 items-center justify-between border-b px-4">
            ${logoTemplate(landing, state.config.title)}
            <button data-action="close-menu" aria-label="Close navigation menu"
              class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 h-9 w-9 text-muted-foreground hover:bg-accent/60 hover:text-foreground">
              <span class="size-4.5">${icons.x}</span>
            </button>
          </div>
          <div class="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 py-6" data-mobile-sidebar></div>
        </div>
      </div>
    </div>`,
  );

  disposers.push(
    initNavbar($root.find("[data-navbar]")[0], () => openDrawer()),
  );

  if (state.searchProvider === "local") {
    disposers.push(initSearchDialog());
  }

  function openDrawer() {
    setState({ sidebarOpen: true });
    const $drawer = $root.find("[data-mobile-drawer]");
    $drawer.removeClass("pointer-events-none").attr("aria-hidden", "false");
    $drawer
      .find("[data-drawer-backdrop]")
      .removeClass("opacity-0")
      .addClass("opacity-100");
    $drawer
      .find("[role='dialog']")
      .removeClass("-translate-x-full")
      .addClass("translate-x-0");
    document.body.style.overflow = "hidden";

    mobileSidebarDisposer?.();
    mobileSidebarDisposer = initSidebar(
      $root.find("[data-mobile-sidebar]")[0],
      closeDrawer,
    );
  }

  function closeDrawer() {
    setState({ sidebarOpen: false });
    const $drawer = $root.find("[data-mobile-drawer]");
    $drawer.addClass("pointer-events-none").attr("aria-hidden", "true");
    $drawer
      .find("[data-drawer-backdrop]")
      .addClass("opacity-0")
      .removeClass("opacity-100");
    $drawer
      .find("[role='dialog']")
      .addClass("-translate-x-full")
      .removeClass("translate-x-0");
    document.body.style.overflow = "";
  }

  $root.on("click.swifty-layout", "[data-action='close-menu']", () =>
    closeDrawer(),
  );
  $root.on("click.swifty-layout", "[data-drawer-backdrop]", () =>
    closeDrawer(),
  );

  function renderSidebar() {
    sidebarDisposer?.();
    sidebarDisposer = initSidebar($root.find("[data-sidebar]")[0]);
  }

  function loadPage(path: string) {
    const $content = $root.find("[data-content]");
    const $toc = $root.find("[data-toc]");
    const $prevNext = $root.find("[data-prev-next]");

    contentDisposer?.();
    tocDisposer?.();
    prevNextDisposer?.();
    contentDisposer = null;
    tocDisposer = null;
    prevNextDisposer = null;

    $content.html(pageSkeletonHtml());
    $toc.empty();
    $prevNext.empty();

    if (!state.loadContent) {
      $content.html(notFoundHtml(path, landing));
      return;
    }

    state
      .loadContent(path)
      .then((result) => {
        const parsed = LoadedContentSchema.safeParse(result);
        if (!parsed.success) {
          handleNotFound(path, $content, $toc);
          return;
        }
        const content: LoadedContent = parsed.data;
        const headings = content.pageData.headings ?? [];

        document.title = `${content.pageData.title} · ${state.config.title}`;

        contentDisposer = initContentRenderer(
          $content[0],
          content.contentHtml,
          headings,
        );

        tocDisposer = initToc($toc[0], headings);

        const pager = computePrevNext(state.config.sidebar, path);
        prevNextDisposer = initPrevNext($prevNext[0], pager.prev, pager.next);

        if (!window.location.hash) {
          window.scrollTo({ top: 0 });
        } else {
          const hash = window.location.hash.slice(1);
          queueMicrotask(() =>
            document.getElementById(hash)?.scrollIntoView({ block: "start" }),
          );
        }
      })
      .catch((err) => {
        console.warn(
          "[@swifty.js/docs2] Failed to load content for",
          path,
          err,
        );
        handleNotFound(path, $content, $toc);
      });
  }

  function handleNotFound(path: string, $content: JQuery, $toc: JQuery) {
    const base = state.config.baseUrl.replace(/\/+$/, "") || "/";
    if (path === base || path === "/") {
      navigate(landing, { replace: true });
      return;
    }
    document.title = state.config.title;
    $content.html(notFoundHtml(path, landing));
    $toc.empty();
  }

  renderSidebar();
  loadPage(getPath());

  const disposeRoute = onRouteChange((path) => {
    renderSidebar();
    loadPage(path);
    if (getState().sidebarOpen) closeDrawer();
  });
  disposers.push(disposeRoute);

  return () => {
    for (const d of disposers.splice(0)) d();
    sidebarDisposer?.();
    mobileSidebarDisposer?.();
    contentDisposer?.();
    tocDisposer?.();
    prevNextDisposer?.();
    $root.off(".swifty-layout");
    $root.empty();
  };
}
