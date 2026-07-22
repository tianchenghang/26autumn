/**
 * FrameTreeContext — shares useFrameTree state between the RootLayout
 * (which owns the hook and renders the Header + hidden iframe) and the
 * Inspector route (which renders the tree and detail panel).
 */
import { createContext, useContext } from "react";
import type { SerializedFrameTree, ConnectionStatus } from "./types";

export interface FrameTreeContextValue {
  /** Target URL loaded in the hidden iframe */
  targetUrl: string | null;
  /** Current frame tree data */
  tree: SerializedFrameTree | null;
  /** Connection status */
  status: ConnectionStatus;
}

export const FrameTreeContext = createContext<FrameTreeContextValue | null>(
  null,
);

export function useFrameTreeContext(): FrameTreeContextValue {
  const ctx = useContext(FrameTreeContext);
  if (!ctx) {
    throw new Error(
      "useFrameTreeContext must be used within a FrameTreeContext.Provider",
    );
  }
  return ctx;
}
