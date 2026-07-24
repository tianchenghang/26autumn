import { ErrorInfo, render } from "preact";
import { useState } from "preact/hooks";
import { LocationProvider, Router, Route } from "preact-iso";
import { DocsProvider, DocsLayout, createContentGuard } from "@swifty.js/docs";
import {
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@swifty-docs/generated";
import "./main.css";
import { init, enablePlugin } from "@swifty.js/sentry";
import {
  ScreenRecordPlugin,
  PerformancePlugin,
  ExposurePlugin,
} from "@swifty.js/sentry/plugins";
import { PreactErrorBoundary } from "@swifty.js/sentry/preact";

init({
  dsn: "/26autumn",
  debug: true,
  beforePushEventList(eventList) {
    if (!import.meta.env.DEV) {
      console.log("@swifty.js/sentry App:", eventList);
      return false;
    }
    return eventList;
  },
});
enablePlugin(new ScreenRecordPlugin());
enablePlugin(new PerformancePlugin());
enablePlugin(new ExposurePlugin());

// Built-in password guard: pages compiled with docsGuardPlugin()
// (frontmatter `protected: true` + DOCS_PASSWORD env) prompt for a
// password; everything else passes through untouched.
const guard = createContentGuard(loadContent);
function ErrorFallback({
  error,
  errorInfo,
}: {
  error: Error;
  errorInfo?: ErrorInfo;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div class="bg-background text-foreground flex min-h-dvh items-center justify-center p-6 font-mono">
      <div class="animate-guard-pop w-full max-w-sm text-center">
        <h1 class="text-lg font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p class="text-muted-foreground mt-2 text-sm wrap-break-word">
          {error.message || "An unexpected error occurred."}
        </p>

        {errorInfo?.componentStack && (
          <pre class="border-border bg-muted text-muted-foreground mt-5 max-h-28 overflow-auto rounded-md border p-3 text-left text-[0.7rem] leading-relaxed">
            {errorInfo.componentStack.trim()}
          </pre>
        )}

        <div class="mt-6 flex items-center justify-center">
          <button
            onClick={() => setDismissed(true)}
            class="bg-primary text-primary-foreground cursor-pointer rounded-md px-4 py-2 text-xs font-semibold shadow-(--sakura-shadow-soft) transition-all duration-200 hover:-translate-y-px hover:shadow-(--sakura-shadow-lift) active:translate-y-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const fallback = (error: Error, errorInfo?: ErrorInfo) => (
  <ErrorFallback error={error} errorInfo={errorInfo} />
);
function App() {
  return (
    <>
      <guard.ContentGuard />
      <PreactErrorBoundary fallback={fallback}>
        <DocsProvider
          config={docsConfig}
          loadContent={guard.loadContent}
          getSearchIndex={getSearchIndex}
        >
          <LocationProvider>
            <Router>
              <Route path="/" component={DocsLayout} />
              <Route default component={DocsLayout} />
            </Router>
          </LocationProvider>
        </DocsProvider>
      </PreactErrorBoundary>
    </>
  );
}

render(<App />, document.getElementById("app")!);
