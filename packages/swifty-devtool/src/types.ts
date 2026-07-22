/**
 * Shared types for the Swifty Frame Tree Devtool.
 */
import type { SerializedFrameTree } from "@swifty.js/mvc/devtool";

export type {
  SerializedViewInfo,
  SerializedFrameNode,
  SerializedFrameTree,
} from "@swifty.js/mvc/devtool";

/** Connection status to the target Swifty application */
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** Message types for the postMessage protocol */
export const MSG_PING = "SWIFTY_DEVTOOL_PING" as const;
export const MSG_PONG = "SWIFTY_DEVTOOL_PONG" as const;
export const MSG_REQUEST_TREE = "SWIFTY_DEVTOOL_REQUEST_TREE" as const;
export const MSG_TREE = "SWIFTY_DEVTOOL_TREE" as const;
export const MSG_TREE_DELTA = "SWIFTY_DEVTOOL_TREE_DELTA" as const;

/** PostMessage event data types */
export interface VisMessage {
  type: string;
  data?: SerializedFrameTree;
}
