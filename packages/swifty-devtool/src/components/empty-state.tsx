/**
 * EmptyState — shown when no target URL is configured or connection is in progress.
 */
import { LayoutGrid, CircleAlert } from "lucide-react";
import type { ConnectionStatus } from "../types";

interface EmptyStateProps {
  status: ConnectionStatus;
  targetUrl: string | null;
}

export function EmptyState({ status, targetUrl }: EmptyStateProps) {
  if (!targetUrl) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100">
            <LayoutGrid className="h-8 w-8 text-sky-500" strokeWidth={1.5} />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">
            No target configured
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-slate-500">
            Enter a URL in the search bar above to connect to a Swifty
            application, or navigate to{" "}
            <code className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-600">
              http://localhost:5173/?url=http://localhost:3000
            </code>
          </p>
          <div className="space-y-3 rounded-lg border border-sky-200/60 bg-white p-4 text-left">
            <h3 className="text-[11px] font-semibold tracking-wider text-sky-600 uppercase">
              How it works
            </h3>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-600">
                1
              </span>
              <p className="text-xs text-slate-500">
                The Swifty devtool loads the target app in a hidden iframe
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-600">
                2
              </span>
              <p className="text-xs text-slate-500">
                The Swifty bridge in the target app serializes the Frame tree
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-600">
                3
              </span>
              <p className="text-xs text-slate-500">
                The tree data is sent via postMessage and rendered here
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "connecting") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-xl border-2 border-sky-200 border-t-sky-500" />
          <h2 className="mb-1 text-sm font-medium text-slate-700">
            Connecting to {targetUrl}
          </h2>
          <p className="text-xs text-slate-400">
            Waiting for Swifty bridge to respond...
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
            <CircleAlert className="h-6 w-6 text-red-500" />
          </div>
          <h2 className="mb-1 text-sm font-medium text-slate-700">
            Connection failed
          </h2>
          <p className="text-xs text-slate-400">
            Could not connect to the Swifty application at {targetUrl}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
