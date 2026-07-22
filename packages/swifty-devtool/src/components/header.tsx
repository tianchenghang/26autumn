/**
 * Header component — displays target URL input, connection status, and controls.
 */
import { useState, useEffect } from "react";
import { Search, RefreshCw, Cat } from "lucide-react";
import type { ConnectionStatus } from "../types";

interface HeaderProps {
  /** Current target URL */
  targetUrl: string | null;
  /** Connection status */
  status: ConnectionStatus;
  /** Total frames in the tree */
  totalFrames: number;
  /** Last update timestamp */
  lastUpdate: number | null;
  /** Callback to refresh the tree */
  onRefresh: () => void;
  /** Callback when URL is submitted */
  onUrlChange: (url: string) => void;
}

/** Status indicator colors and labels */
const STATUS_CONFIG: Record<
  ConnectionStatus,
  { color: string; bg: string; dot: string; label: string; pulse: boolean }
> = {
  disconnected: {
    color: "text-slate-400",
    bg: "bg-slate-300",
    dot: "bg-slate-400",
    label: "Disconnected",
    pulse: false,
  },
  connecting: {
    color: "text-amber-600",
    bg: "bg-amber-400",
    dot: "bg-amber-400",
    label: "Connecting...",
    pulse: true,
  },
  connected: {
    color: "text-emerald-600",
    bg: "bg-emerald-500",
    dot: "bg-emerald-500",
    label: "Connected",
    pulse: false,
  },
  error: {
    color: "text-red-500",
    bg: "bg-red-500",
    dot: "bg-red-500",
    label: "Error",
    pulse: false,
  },
};

export function Header({
  targetUrl,
  status,
  totalFrames,
  lastUpdate,
  onRefresh,
  onUrlChange,
}: HeaderProps) {
  const [inputValue, setInputValue] = useState(targetUrl ?? "");

  useEffect(() => {
    setInputValue(targetUrl ?? "");
  }, [targetUrl]);

  const cfg = STATUS_CONFIG[status];

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const url = inputValue.trim();
    if (url) {
      onUrlChange(url);
    }
  };

  const formatTime = (ts: number | null): string => {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString();
  };

  return (
    <header className="border-b border-sky-200/60 bg-white px-6 py-4">
      <div className="flex items-center gap-6">
        {/* Logo */}
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-sky-500 to-blue-600">
            <Cat className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-800">
              Swifty Devtool
            </h1>
            <p className="-mt-0.5 text-[11px] text-slate-400">
              Frame Tree & Module Federation Inspector
            </p>
          </div>
        </div>

        {/* URL input */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 items-center gap-2"
        >
          <div className="relative flex-1">
            <div className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter target URL (e.g. http://localhost:3000)"
              className="w-full rounded-lg border border-sky-200 bg-sky-50/50 py-2 pr-4 pl-9 text-sm text-slate-700 placeholder-slate-400 transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600"
          >
            Connect
          </button>
        </form>

        {/* Status */}
        <div className="flex shrink-0 items-center gap-4">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {cfg.pulse && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.dot} opacity-75`}
                />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cfg.dot}`}
              />
            </span>
            <span className={`text-xs font-medium ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>

          {/* Stats */}
          {status === "connected" && (
            <>
              <div className="h-4 w-px bg-sky-200" />
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  {totalFrames}
                </span>{" "}
                frames
              </div>
              <div className="text-xs text-slate-400">
                Updated {formatTime(lastUpdate)}
              </div>
            </>
          )}

          {/* Refresh button */}
          {status === "connected" && (
            <button
              onClick={onRefresh}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-sky-100 hover:text-sky-600"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
