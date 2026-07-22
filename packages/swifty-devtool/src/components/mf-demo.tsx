/**
 * MfDemo — Micro-Frontend demo component.
 *
 * Demonstrates loading a remote Swifty View from swifty-demo via
 * Webpack Module Federation and rendering it inside a React app.
 *
 * Architecture:
 *   swifty-demo (Remote, port 3000) — exposes CounterView via MF
 *   swifty-devtool (Host, port 5173)  — consumes remote CounterView
 *
 * This proves that Swifty views can be loaded cross-app via MF,
 * enabling micro-frontend architecture without iframes.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Plug } from "lucide-react";

type MfStatus = "idle" | "loading" | "mounted" | "error";

/** Status dot style map — eliminates nested ternaries */
const STATUS_DOT: Record<MfStatus, string> = {
  mounted: "bg-green-400",
  error: "bg-red-400",
  loading: "animate-pulse bg-amber-400",
  idle: "bg-slate-300",
};

export function MfDemo() {
  const [status, setStatus] = useState<MfStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  /** Load and mount the remote CounterView */
  const handleLoad = useCallback(async () => {
    if (status === "loading") return;
    setStatus("loading");
    setErrorMsg(null);

    try {
      // Dynamic import triggers Module Federation runtime to load from swifty-demo
      const module = await import("swifty_demo/counter-view");

      if (!containerRef.current) {
        setStatus("error");
        setErrorMsg("Container element not found");
        return;
      }

      // Call the remote mount function — it handles Swifty framework setup
      const unmount = module.mountCounter(containerRef.current);
      cleanupRef.current = unmount;
      setStatus("mounted");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setErrorMsg(message);
      console.error("[MF Demo] Failed to load remote module:", err);
    }
  }, [status]);

  /** Unmount the remote view */
  const handleUnmount = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setStatus("idle");
  }, []);

  /** Cleanup on component unmount */
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-sky-200/60 bg-sky-50/80 px-4 py-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[11px] font-semibold tracking-wider text-sky-600 uppercase">
              Micro-Frontend Demo
            </h2>
            <p className="text-[10px] text-slate-400">
              @swifty.js/mvc View loaded via Webpack Module Federation
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status !== "mounted" ? (
              <button
                onClick={handleLoad}
                disabled={status === "loading"}
                className="rounded-md bg-sky-600 px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
              >
                {status === "loading" ? "Loading..." : "Load Remote View"}
              </button>
            ) : (
              <button
                onClick={handleUnmount}
                className="rounded-md border border-sky-200 bg-white px-3 py-1 text-[11px] font-medium text-sky-600 transition-colors hover:bg-sky-50"
              >
                Unmount
              </button>
            )}
            <span
              className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[status]}`}
            />
          </div>
        </div>
      </div>

      {/* Architecture diagram */}
      <div className="border-b border-sky-200/60 bg-white/70 px-4 py-3">
        <div className="flex items-center gap-3 text-[10px]">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-emerald-700">
            swifty-demo:3000
            <br />
            <span className="text-emerald-400">(Remote)</span>
          </div>
          <div className="text-slate-300">→ MF →</div>
          <div className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-sky-700">
            swifty-devtool:5173
            <br />
            <span className="text-sky-400">(Host)</span>
          </div>
          <div className="ml-2 text-slate-400">
            Shared: @swifty.js/mvc (singleton)
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {status === "error" && (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-medium text-red-700">
              Failed to load remote module
            </p>
            <p className="mt-1 font-mono text-[10px] text-red-500">
              {errorMsg}
            </p>
            <p className="mt-2 text-[10px] text-red-400">
              Make sure swifty-demo is running on port 3000:
              <code className="ml-1 rounded bg-red-100 px-1">
                cd ./swifty-demo && pnpm dev:webpack
              </code>
            </p>
          </div>
        )}

        {status === "idle" && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Plug className="mb-2 h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-500">
                Click "Load Remote View" to load the CounterView
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                from swifty-demo via Module Federation
              </p>
            </div>
          </div>
        )}

        {/* Remote Swifty View container */}
        <div
          ref={containerRef}
          id="mf-swifty-container"
          className={status === "mounted" ? "" : "hidden"}
        />
      </div>
    </div>
  );
}
