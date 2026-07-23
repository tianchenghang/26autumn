import { useLocation, useNavigate } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Match,
  Show,
  Switch,
} from "solid-js";
import { ContentRenderer } from "./ContentRenderer";
import { useDocs } from "./context";
import { CompassIcon, XIcon } from "./icons";
import {
  computePrevNext,
  LoadedContentSchema,
  normalizePath,
  type LoadedContent,
} from "./lib/content";
import { cn } from "./lib/utils";
import { Logo } from "./Logo";
import { Navbar } from "./Navbar";
import { PrevNext } from "./PrevNext";
import { SearchDialog } from "./SearchDialog";
import { Sidebar } from "./Sidebar";
import { Toc } from "./Toc";
import { Button } from "./ui/button";

/**
 * Master docs shell: navbar, sidebar rail, prose column, TOC rail, search
 * palette and mobile drawer. Stays mounted across all routes — navigation
 * only swaps the content column.
 */
export function DocsLayout() {
  const docs = useDocs();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  const landing = docs.config.nav?.[0]?.link ?? docs.config.baseUrl ?? "/";

  const normalized = createMemo(() => normalizePath(location.pathname));
  const path = createMemo(() => normalized().path);

  // Rewrite /index, /index.md, /index.html URLs to the clean directory path.
  createEffect(() => {
    const redirect = normalized().redirect;
    if (redirect !== null && redirect !== location.pathname) {
      navigate(redirect, { replace: true });
    }
  });

  const [content] = createResource<LoadedContent | null, string>(
    path,
    async (p) => {
      if (!docs.loadContent) return null;
      try {
        const result = await docs.loadContent(p);
        const parsed = LoadedContentSchema.safeParse(result);
        return parsed.success ? parsed.data : null;
      } catch (err) {
        console.warn("[@swifty.js/docs] Failed to load content for", p, err);
        return null;
      }
    },
  );

  // The bare site root is not a real route — send visitors to the landing page.
  createEffect(() => {
    if (content.state !== "ready" || content() !== null) return;
    const base = docs.config.baseUrl.replace(/\/+$/, "") || "/";
    if (path() === base || path() === "/") {
      navigate(landing, { replace: true });
    }
  });

  createEffect(() => {
    const page = content();
    document.title = page
      ? `${page.pageData.title} · ${docs.config.title}`
      : docs.config.title;
  });

  // Fresh page → back to the top (unless navigating to an anchor).
  createEffect(() => {
    path();
    if (!location.hash) window.scrollTo({ top: 0 });
  });

  // Anchor targets only exist once the content HTML is in the DOM.
  createEffect(() => {
    const page = content();
    if (!page) return;
    const hash = location.hash.slice(1);
    if (hash) {
      queueMicrotask(() =>
        document.getElementById(hash)?.scrollIntoView({ block: "start" }),
      );
    }
  });

  // Lock body scroll while the mobile drawer is open.
  createEffect(() => {
    document.body.style.overflow = sidebarOpen() ? "hidden" : "";
  });

  const headings = createMemo(() => content()?.pageData.headings ?? []);
  const pager = createMemo(() => computePrevNext(docs.config.sidebar, path()));

  return (
    <div class="bg-background text-foreground min-h-screen font-sans antialiased">
      <a href="#main-content" class="skip-link">
        Skip to content
      </a>

      <BackgroundLayers />

      <Navbar
        path={path}
        landing={landing}
        onMenuClick={() => setSidebarOpen(true)}
      />

      <div class="mx-auto max-w-[1440px] px-4 pt-14 lg:px-8">
        <div class="grid grid-cols-1 gap-10 lg:grid-cols-[236px_minmax(0,1fr)] xl:grid-cols-[236px_minmax(0,1fr)_224px]">
          <aside class="hidden lg:block">
            <div class="sidebar-scroll sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pr-3">
              <Sidebar path={path} />
            </div>
          </aside>

          <main id="main-content" class="min-w-0 scroll-mt-20 py-8 lg:py-10">
            <Switch>
              <Match
                when={
                  content.state === "unresolved" || content.state === "pending"
                }
              >
                <PageSkeleton />
              </Match>
              <Match when={content()}>
                {(page) => (
                  <>
                    <ContentRenderer
                      html={page().contentHtml}
                      headings={headings}
                    />
                    <PrevNext prev={pager().prev} next={pager().next} />
                  </>
                )}
              </Match>
              <Match when={content.state === "ready"}>
                <NotFound path={path()} home={landing} />
              </Match>
            </Switch>

            <footer class="border-border/70 text-muted-foreground mt-16 flex flex-wrap items-center justify-between gap-2 border-t pt-5 pb-10 text-xs">
              <span>
                © {new Date().getFullYear()} {docs.config.title}
              </span>
              <span class="font-mono">
                Built with <span class="text-primary">@swifty.js/docs</span>
              </span>
            </footer>
          </main>

          <aside class="hidden xl:block">
            <div class="sidebar-scroll sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-10">
              <Toc headings={headings} />
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      <div
        class={cn(
          "fixed inset-0 z-50 lg:hidden",
          !sidebarOpen() && "pointer-events-none",
        )}
        aria-hidden={!sidebarOpen()}
      >
        <div
          onClick={() => setSidebarOpen(false)}
          class={cn(
            "bg-foreground/25 absolute inset-0 backdrop-blur-[2px] transition-opacity duration-300 dark:bg-black/50",
            sidebarOpen() ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          class={cn(
            "border-border bg-sidebar absolute inset-y-0 left-0 flex w-72 flex-col border-r shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            sidebarOpen() ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div class="border-border/70 flex h-14 shrink-0 items-center justify-between border-b px-4">
            <Logo href={landing} title={docs.config.title} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation menu"
            >
              <XIcon class="size-4.5" />
            </Button>
          </div>
          <div class="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 py-6">
            <Sidebar path={path} onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      </div>

      <Show when={docs.searchProvider === "local"}>
        <SearchDialog />
      </Show>
    </div>
  );
}

/** Fixed, non-interactive atmosphere: sage washes, dot grid and grain. */
function BackgroundLayers() {
  return (
    <div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10">
      <div class="absolute inset-0 bg-[radial-gradient(56rem_30rem_at_16%_-10%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_70%)]" />
      <div class="absolute inset-0 bg-[radial-gradient(44rem_26rem_at_96%_-4%,color-mix(in_oklab,var(--primary)_6%,transparent),transparent_70%)]" />
      <div class="via-primary/40 absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent" />
      <div class="docs-grid absolute inset-0" />
      <div class="docs-grain absolute inset-0" />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div class="animate-fade-in space-y-4" role="status">
      <div class="skeleton h-9 w-2/5 rounded-lg" />
      <div class="skeleton mt-6 h-4 w-full rounded-md" />
      <div class="skeleton h-4 w-11/12 rounded-md" />
      <div class="skeleton h-4 w-4/5 rounded-md" />
      <div class="skeleton mt-8 h-44 w-full rounded-xl" />
      <div class="skeleton mt-4 h-4 w-3/5 rounded-md" />
      <span class="sr-only">Loading page…</span>
    </div>
  );
}

function NotFound(props: { path: string; home: string }) {
  return (
    <div class="animate-fade-in flex flex-col items-start gap-4 py-16">
      <span class="border-border bg-muted/40 text-muted-foreground grid size-12 place-items-center rounded-xl border">
        <CompassIcon class="size-6" />
      </span>
      <h1 class="font-display text-3xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p class="text-muted-foreground max-w-md text-sm leading-relaxed">
        Nothing lives at{" "}
        <code class="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs">
          {props.path}
        </code>
        . It may have moved, or the link may be out of date.
      </p>
      <Button onClick={() => (window.location.href = props.home)}>
        Back to the docs
      </Button>
    </div>
  );
}
