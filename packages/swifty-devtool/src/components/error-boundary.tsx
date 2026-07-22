import * as Sentry from "@sentry/react";
import * as React from "react";
import { CircleAlert, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

/**
 * Fallback UI rendered when a descendant component throws.
 *
 * Mirrors the original custom ErrorBoundary's crash screen: an alert icon,
 * a configurable title, the error message, and a Retry button that resets
 * the Sentry ErrorBoundary.
 */
function ErrorFallback({
  error,
  fallbackTitle,
  resetError,
}: {
  error: unknown;
  fallbackTitle?: string;
  resetError: () => void;
}) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
          <CircleAlert className="h-6 w-6 text-red-500" />
        </div>
        <h2 className="mb-1 text-sm font-medium text-slate-700">
          {fallbackTitle ?? "Component crashed"}
        </h2>
        <p className="mb-4 font-mono text-[10px] break-all text-red-500">
          {message}
        </p>
        <button
          onClick={resetError}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-sky-700"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    </div>
  );
}

/**
 * ErrorBoundary — a thin wrapper around `@sentry/react`'s ErrorBoundary.
 *
 * Captures errors thrown by descendant components, automatically reports them
 * to Sentry (when configured via `Sentry.init`), and renders a crash fallback
 * UI with a retry button. The `fallbackTitle` prop is preserved for drop-in
 * compatibility with the original custom ErrorBoundary.
 */
export function ErrorBoundary({ children, fallbackTitle }: ErrorBoundaryProps) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <ErrorFallback
          error={error}
          fallbackTitle={fallbackTitle}
          resetError={resetError}
        />
      )}
    >
      <>{children}</>
    </Sentry.ErrorBoundary>
  );
}
