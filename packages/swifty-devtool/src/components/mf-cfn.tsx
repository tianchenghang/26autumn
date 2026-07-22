/**
 * SfCdnDemo — Server-Federation CDN demo component.
 *
 * Demonstrates loading a remote Swifty View from the CDN server
 * using DYNAMIC Module Federation (no static remotes config).
 *
 * Architecture:
 *   swifty-cdn:3300 (CDN) → swifty-devtool:5173 (Host)
 *   The remoteEntry.js is loaded at runtime from the CDN URL.
 *
 * Flow:
 *   1. User enters CDN remoteEntry.js URL
 *   2. Dynamic script injection loads the remote container
 *   3. __webpack_init_sharing__ + __webpack_share_scopes__ for shared deps
 *   4. Container.get("./counter-view") loads the remote modulex
 *   5. mountCounter() renders the Swifty View
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Globe, Plug } from "lucide-react";
import { loadRemoteFromCdn, clearRemoteCache } from "../utils/dynamic-remote";

type MfCdnStatus = "idle" | "loading" | "mounted" | "error";

const DEFAULT_CDN_URL = "http://localhost:3300/cdn/swifty-demo/remoteEntry.js";
const MODULE_PATH = "./counter-view";

/** Status dot style map */
const STATUS_DOT: Record<MfCdnStatus, string> = {
  mounted: "bg-green-400",
  error: "bg-red-400",
  loading: "animate-pulse bg-amber-400",
  idle: "bg-slate-300",
};

export function MfCdn() {
  const [cdnUrl, setCdnUrl] = useState(DEFAULT_CDN_URL);
  const [status, setStatus] = useState<MfCdnStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  /** Load and mount the remote CounterView from CDN */
  const handleLoad = useCallback(async () => {
    if (status === "loading") return;
    setStatus("loading");
    setErrorMsg(null);

    try {
      const remoteModule = await loadRemoteFromCdn<Record<string, unknown>>(
        cdnUrl,
        MODULE_PATH,
      );

      if (!containerRef.current) {
        setStatus("error");
        setErrorMsg("Container element not found");
        return;
      }

      const mountCounter = remoteModule["mountCounter"] as
        | ((el: HTMLElement) => () => void)
        | undefined;
      if (typeof mountCounter !== "function") {
        const keys = Object.keys(remoteModule).join(", ");
        throw new Error(
          `mountCounter not found in remote module. Module keys: [${keys}]. ` +
            `Make sure swifty-demo is built and published to the CDN.`,
        );
      }

      const unmount = mountCounter(containerRef.current);
      cleanupRef.current = unmount;
      setStatus("mounted");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setErrorMsg(message);
      console.error("[MF CDN] Failed to load remote from CDN:", err);
    }
  }, [cdnUrl, status]);

  /** Unmount the remote view */
  const handleUnmount = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    // Clear the cached remote so it can be re-loaded with fresh code
    clearRemoteCache(cdnUrl);
    setStatus("idle");
  }, [cdnUrl]);

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
              MF CDN Demo
            </h2>
            <p className="text-[10px] text-slate-400">
              Dynamic Module Federation via CDN — no static remotes config
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status !== "mounted" ? (
              <button
                onClick={() => void handleLoad()}
                disabled={status === "loading" || !cdnUrl}
                className="rounded-md bg-sky-600 px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
              >
                {status === "loading" ? "Loading..." : "Load from CDN"}
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

      {/* CDN URL input */}
      <div className="border-b border-sky-200/60 bg-white/70 px-4 py-2">
        <label className="mb-1 block text-[10px] font-medium text-slate-500">
          CDN remoteEntry.js URL
        </label>
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-slate-400" />
          <input
            type="url"
            value={cdnUrl}
            onChange={(e) => setCdnUrl(e.target.value)}
            placeholder={DEFAULT_CDN_URL}
            className="flex-1 rounded-md border border-sky-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-700 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200"
          />
        </div>
      </div>

      {/* Architecture diagram */}
      <div className="border-b border-sky-200/60 bg-white/70 px-4 py-3">
        <div className="flex items-center gap-3 text-[10px]">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-amber-700">
            swifty-cdn:3300
            <br />
            <span className="text-amber-400">(CDN)</span>
          </div>
          <div className="text-slate-300">→ dynamic script →</div>
          <div className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-sky-700">
            swifty-devtool:5173
            <br />
            <span className="text-sky-400">(Host)</span>
          </div>
          <div className="ml-2 text-slate-400">
            Dynamic MF: runtime remote loading
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {status === "error" && (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-medium text-red-700">
              Failed to load remote from CDN
            </p>
            <p className="mt-1 font-mono text-[10px] text-red-500">
              {errorMsg}
            </p>
            <p className="mt-2 text-[10px] text-red-400">
              Make sure swifty-cdn is running and the project is published:
              <code className="ml-1 rounded bg-red-100 px-1">pnpm cdn</code>
            </p>
          </div>
        )}

        {status === "idle" && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Plug className="mx-auto mb-2 h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-500">
                Click "Load from CDN" to load the CounterView
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                dynamically from {cdnUrl ? new URL(cdnUrl).host : "CDN"}
              </p>
            </div>
          </div>
        )}

        {/* Remote Swifty View container */}
        <div
          ref={containerRef}
          id="mf-cdn-swifty-container"
          className={status === "mounted" ? "" : "hidden"}
        />
      </div>
    </div>
  );
}
