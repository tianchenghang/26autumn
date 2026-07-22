/**
 * useFrameTree — React hook for communicating with a Swifty application
 * loaded in an iframe via postMessage protocol.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import type {
  SerializedFrameTree,
  ConnectionStatus,
  VisMessage,
} from "../types";
import {
  MSG_PING,
  MSG_PONG,
  MSG_REQUEST_TREE,
  MSG_TREE,
  MSG_TREE_DELTA,
} from "../types";

/**
 * Debug logger — prefixed with `[Devtool]` so you can filter it in the
 * browser DevTools console (e.g. type `[Devtool]` in the console filter box).
 * Remove or gate behind a flag once the issue is resolved.
 */
const log = (...args: unknown[]): void => console.log("[Devtool]", ...args);

/** Hook configuration */
interface UseFrameTreeConfig {
  /** Target URL to load in the iframe */
  targetUrl: string | null;
  /** Polling interval in ms for tree refresh (default: 2000) */
  pollInterval?: number;
}

/** Hook return value */
interface UseFrameTreeReturn {
  /** Current frame tree data */
  tree: SerializedFrameTree | null;
  /** Connection status */
  status: ConnectionStatus;
  /** Manually refresh the frame tree */
  refresh: () => void;
  /** Force a reconnection even when the target URL is unchanged */
  reconnect: () => void;
  /** Reference to the iframe element for attaching to DOM */
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

/**
 * Hook that manages communication with a Swifty application iframe.
 *
 * Protocol:
 * 1. Load target URL in iframe
 * 2. Send PING to detect if Swifty bridge is present
 * 3. On PONG, request frame tree
 * 4. Listen for TREE and TREE_DELTA responses
 * 5. Periodically re-request tree for updates
 */
export function useFrameTree({
  targetUrl,
  pollInterval = 2000,
}: UseFrameTreeConfig): UseFrameTreeReturn {
  const [tree, setTree] = useState<SerializedFrameTree | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  /**
   * Bumped by `reconnect()` to force the connection effect to re-run even
   * when `targetUrl` is unchanged — e.g. the user clicks "Connect" again
   * after a timeout, with the same URL still in the input.
   */
  const [attempt, setAttempt] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Send a message to the iframe */
  const sendMessage = useCallback(
    (msg: VisMessage) => {
      const iframe = iframeRef.current;
      const origin = targetUrl ? new URL(targetUrl).origin : "*";
      if (!iframe) {
        log("sendMessage SKIP — iframeRef.current is null:", msg.type);
        return;
      }
      if (!iframe.contentWindow) {
        log("sendMessage SKIP — iframe.contentWindow is null:", msg.type);
        return;
      }
      log("sendMessage →", msg.type, "targetOrigin:", origin);
      iframe.contentWindow.postMessage(msg, origin);
    },
    [targetUrl],
  );

  /** Request the frame tree from the iframe */
  const refresh = useCallback(() => {
    sendMessage({ type: MSG_REQUEST_TREE });
  }, [sendMessage]);

  /** Force a reconnection. Bumps `attempt` so the connection effect re-runs
   * (resetting status, restarting the ping interval and timeout). */
  const reconnect = useCallback((): void => {
    log("reconnect() called — bumping attempt to force re-handshake");
    setAttempt((a) => a + 1);
  }, []);

  /** Handle incoming postMessage events */
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as VisMessage | undefined;
      const typeLabel =
        data && typeof data === "object" ? String(data.type) : "(non-object)";
      log(
        "message ← type:",
        typeLabel,
        "| origin:",
        event.origin,
        "| source is self:",
        event.source === window,
      );

      if (!data || typeof data !== "object") return;

      switch (data.type) {
        case MSG_PONG:
          log("PONG received — status → connected, requesting tree");
          setStatus("connected");
          if (pingTimerRef.current) {
            clearInterval(pingTimerRef.current);
            pingTimerRef.current = null;
          }
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          sendMessage({ type: MSG_REQUEST_TREE });
          break;

        case MSG_TREE:
          if (data.data) {
            log("TREE received — totalFrames:", data.data.totalFrames);
            setTree(data.data);
          }
          break;

        case MSG_TREE_DELTA:
          if (data.data) {
            log("TREE_DELTA received — totalFrames:", data.data.totalFrames);
            setTree(data.data);
          }
          break;
      }
    };

    log("message listener installed on window");
    window.addEventListener("message", handler);
    return () => {
      log("message listener removed");
      window.removeEventListener("message", handler);
    };
  }, [sendMessage]);

  /** When targetUrl changes (or reconnect is called), reset state and start connection */
  useEffect(() => {
    log("connection effect — targetUrl:", targetUrl, "| attempt:", attempt);
    setTree(null);

    if (!targetUrl) {
      log("no targetUrl — status → disconnected");
      setStatus("disconnected");
      return;
    }

    log("status → connecting; starting PING interval (1s) + timeout (10s)");
    setStatus("connecting");

    // Start ping interval to detect when iframe is ready
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    pingTimerRef.current = setInterval(() => {
      log("PING tick — calling sendMessage");
      sendMessage({ type: MSG_PING });
    }, 1000);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      log("TIMEOUT — no PONG after 10s, status → error");
      setStatus((s) => (s === "connecting" ? "error" : s));
    }, 10_000);

    return () => {
      log("connection effect cleanup — clearing ping interval + timeout");
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [targetUrl, sendMessage, attempt]);

  /** When connected, start polling for tree updates */
  useEffect(() => {
    if (status !== "connected") return;

    log("connected — starting tree polling every", pollInterval, "ms");

    // Initial request already sent on PONG

    // Set up polling interval
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      sendMessage({ type: MSG_REQUEST_TREE });
    }, pollInterval);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [status, pollInterval, sendMessage]);

  /** Handle iframe load event */
  useEffect(() => {
    const iframe = iframeRef.current;
    log(
      "iframe load effect — iframeRef.current exists:",
      !!iframe,
      "| targetUrl:",
      targetUrl,
    );
    if (!iframe) return;

    const onLoad = (): void => {
      log("iframe 'load' event fired — waiting 500ms then PING");
      // Wait a moment for the Swifty app to initialize, then ping
      setTimeout(() => {
        sendMessage({ type: MSG_PING });
      }, 500);
    };

    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [sendMessage, targetUrl]);

  return { tree, status, refresh, reconnect, iframeRef };
}
