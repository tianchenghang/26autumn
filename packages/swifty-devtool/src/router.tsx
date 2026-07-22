/**
 * Router — TanStack Router configuration for the Swifty Devtool.
 *
 * Route tree:
 *   rootRoute (RootLayout: Header + TabBar + hidden iframe + Outlet)
 *     ├── "/"         → InspectorRoute (frame tree + detail panel)
 *     ├── "/mf-demo"  → MfDemo (Module Federation demo)
 *     ├── "/cdn"      → CdnManager (CDN project/version management)
 *     └── "/sf-cdn"   → SfCdnDemo (dynamic MF via CDN)
 *
 * The target app URL is stored as the `url` search param on the root route,
 * enabling shareable URLs like: http://localhost:5173/?url=http://localhost:3000
 */
import { useCallback, useMemo } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Link,
  useSearch,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useFrameTree } from "./hooks/use-frame-tree";
import { Header } from "./components/header";
import { MfDemo } from "./components/mf-demo";
import { CdnManager } from "./components/cdn-manager";
import { MfCdn } from "./components/mf-cfn";
import { ErrorBoundary } from "./components/error-boundary";
import { InspectorRoute } from "./routes/inspector";
import { FrameTreeContext, type FrameTreeContextValue } from "./router-context";

/** Tab navigation entries — paths double as route paths for <Link to> */
const TABS = [
  { path: "/", label: "Inspector" },
  { path: "/mf-demo", label: "MF Demo" },
  { path: "/cdn", label: "CDN" },
  { path: "/sf-cdn", label: "MF CDN" },
] as const;

/**
 * Root layout: owns the useFrameTree hook and hidden iframe so that the
 * Header shows live connection status on every tab, and switching tabs
 * does not tear down the iframe connection.
 */
function RootLayout() {
  const { url } = useSearch({ from: "__root__" });
  const targetUrl = url ?? null;
  const navigate = useNavigate();

  const { tree, status, refresh, reconnect, iframeRef } = useFrameTree({
    targetUrl,
    pollInterval: 2000,
  });

  /** Navigate to the inspector route with the new target URL.
   * When the URL is unchanged (e.g. user clicks Connect again after a
   * timeout), fall back to `reconnect()` so the connection effect re-runs. */
  const handleUrlChange = useCallback(
    (newUrl: string) => {
      if (newUrl === targetUrl) {
        reconnect();
      } else {
        navigate({ to: "/", search: { url: newUrl } });
      }
    },
    [navigate, targetUrl, reconnect],
  );

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const contextValue = useMemo<FrameTreeContextValue>(
    () => ({ targetUrl, tree, status }),
    [targetUrl, tree, status],
  );

  return (
    <FrameTreeContext.Provider value={contextValue}>
      <div className="flex h-screen flex-col overflow-hidden bg-sky-50 text-slate-800">
        {/* Header */}
        <Header
          targetUrl={targetUrl}
          status={status}
          totalFrames={tree?.totalFrames ?? 0}
          lastUpdate={tree?.timestamp ?? null}
          onRefresh={refresh}
          onUrlChange={handleUrlChange}
        />

        {/* Tab bar */}
        <div className="flex border-b border-sky-200/60 bg-white">
          {TABS.map((tab) => {
            const active = pathname === tab.path;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`px-5 py-2 text-[11px] font-semibold tracking-wide uppercase transition-colors ${
                  active
                    ? "border-b-2 border-sky-600 text-sky-700"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Route content */}
        <Outlet />

        {/* Hidden iframe for target Swifty app */}
        {targetUrl && (
          <iframe
            ref={iframeRef}
            src={targetUrl}
            className="hidden"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Target @swifty.js/mvc app"
          />
        )}
      </div>
    </FrameTreeContext.Provider>
  );
}

// ── Route definitions ──

const rootRoute = createRootRoute({
  validateSearch: (search: Record<string, unknown>): { url?: string } => ({
    url: typeof search.url === "string" ? search.url : undefined,
  }),
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: InspectorRoute,
});

function MfDemoWrapper() {
  return (
    <ErrorBoundary fallbackTitle="MF Demo module crashed">
      <div className="flex-1 overflow-hidden">
        <MfDemo />
      </div>
    </ErrorBoundary>
  );
}

const mfDemoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "mf-demo",
  component: MfDemoWrapper,
});

function CdnWrapper() {
  return (
    <div className="flex-1 overflow-hidden">
      <CdnManager />
    </div>
  );
}

const cdnRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "cdn",
  component: CdnWrapper,
});

function SfCdnWrapper() {
  return (
    <ErrorBoundary fallbackTitle="MF CDN module crashed">
      <div className="flex-1 overflow-hidden">
        <MfCdn />
      </div>
    </ErrorBoundary>
  );
}

const sfCdnRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "sf-cdn",
  component: SfCdnWrapper,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  mfDemoRoute,
  cdnRoute,
  sfCdnRoute,
]);

export const router = createRouter({
  routeTree,
});

// Type registration for full type-safety of <Link to>, useSearch, navigate, etc.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
