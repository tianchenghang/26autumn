import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { useLocation } from "wouter-preact";
import { ContentRenderer } from "./content-renderer";
import { useDocs } from "./context";
import { CompassIcon, XIcon } from "./icons";
import {
  computePrevNext,
  LoadedContentSchema,
  normalizePath,
  type LoadedContent,
} from "./lib/content";
import { cn } from "./lib/utils";
import { Logo } from "./logo";
import { Navbar } from "./navbar";
import { PrevNext } from "./prev-next";
import { SearchDialog } from "./search-dialog";
import { Sidebar } from "./sidebar";
import { Toc } from "./toc";
import { Button } from "./ui/button";

export function DocsLayout() {
  const docs = useDocs();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const landing = docs.config.nav?.[0]?.link ?? docs.config.baseUrl ?? "/";

  const normalized = useMemo(() => normalizePath(location), [location]);
  const path = normalized.path;

  useEffect(() => {
    const redirect = normalized.redirect;
    if (redirect !== null && redirect !== location) {
      navigate(redirect, { replace: true });
    }
  }, [normalized.redirect, location, navigate]);

  const [content, setContent] = useState<LoadedContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (!docs.loadContent) {
      setContent(null);
      setLoading(false);
      return;
    }
    docs
      .loadContent(path)
      .then((result) => {
        if (cancelled) return;
        const parsed = LoadedContentSchema.safeParse(result);
        setContent(parsed.success ? parsed.data : null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[@swifty.js/docs] Failed to load content for", path, err);
        setContent(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, docs.loadContent]);

  useEffect(() => {
    if (loading || content !== null) return;
    const base = docs.config.baseUrl.replace(/\/+$/, "") || "/";
    if (path === base || path === "/") {
      navigate(landing, { replace: true });
    }
  }, [loading, content, path, docs.config.baseUrl, landing, navigate]);

  useEffect(() => {
    document.title = content
      ? `${content.pageData.title} · ${docs.config.title}`
      : docs.config.title;
  }, [content, docs.config.title]);

  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0 });
  }, [path]);

  useEffect(() => {
    if (!content) return;
    const hash = window.location.hash.slice(1);
    if (hash) {
      queueMicrotask(() =>
        document.getElementById(hash)?.scrollIntoView({ block: "start" }),
      );
    }
  }, [content]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
  }, [sidebarOpen]);

  const headings = useMemo(() => content?.pageData.headings ?? [], [content]);
  const pager = useMemo(
    () => computePrevNext(docs.config.sidebar, path),
    [docs.config.sidebar, path],
  );

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

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
            {loading ? (
              <PageSkeleton />
            ) : content ? (
              <>
                <ContentRenderer
                  html={content.contentHtml}
                  headings={headings}
                />
                <PrevNext prev={pager.prev} next={pager.next} />
              </>
            ) : (
              <NotFound path={path} home={landing} />
            )}

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
          !sidebarOpen && "pointer-events-none",
        )}
        aria-hidden={!sidebarOpen}
      >
        <div
          onClick={closeSidebar}
          class={cn(
            "bg-foreground/25 absolute inset-0 backdrop-blur-[2px] transition-opacity duration-300 dark:bg-black/50",
            sidebarOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          class={cn(
            "border-border bg-sidebar absolute inset-y-0 left-0 flex w-72 flex-col border-r shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div class="border-border/70 flex h-14 shrink-0 items-center justify-between border-b px-4">
            <Logo href={landing} title={docs.config.title} />
            <Button
              variant="ghost"
              size="icon"
              onClick={closeSidebar}
              aria-label="Close navigation menu"
            >
              <XIcon class="size-4.5" />
            </Button>
          </div>
          <div class="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 py-6">
            <Sidebar path={path} onNavigate={closeSidebar} />
          </div>
        </div>
      </div>

      {docs.searchProvider === "local" && <SearchDialog />}
    </div>
  );
}

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

function NotFound({ path, home }: { path: string; home: string }) {
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
          {path}
        </code>
        . It may have moved, or the link may be out of date.
      </p>
      <Button onClick={() => (window.location.href = home)}>
        Back to the docs
      </Button>
    </div>
  );
}
