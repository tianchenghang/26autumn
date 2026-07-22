/**
 * Frame Devtool Bridge — runs inside the target Swifty application.
 *
 * Serializes the Frame tree and responds to postMessage requests
 * from the Swifty devtool panel.
 *
 * Message protocol:
 *   Devtool → Bridge:  { type: 'SWIFTY_DEVTOOL_PING' }
 *   Bridge → Devtool:  { type: 'SWIFTY_DEVTOOL_PONG' }
 *   Devtool → Bridge:  { type: 'SWIFTY_DEVTOOL_REQUEST_TREE' }
 *   Bridge → Devtool:  { type: 'SWIFTY_DEVTOOL_TREE', data: SerializedFrameTree }
 *   Bridge → Devtool:  { type: 'SWIFTY_DEVTOOL_TREE_DELTA', data: SerializedFrameTree }
 *     (pushed automatically when frame tree changes)
 */
import { Frame } from "./frame";
import type { ViewCtx } from "./types";

// ============================================================
// Serialized frame tree types
// ============================================================

/** Serialized view info attached to a frame node */
export interface SerializedViewInfo {
  /** View ID (same as frame ID) */
  id: string;
  /** Whether the view has rendered at least once */
  rendered: boolean;
  /** View signature (> 0 = active) */
  signature: number;
  /** Observed state keys */
  observedStateKeys: string[] | null;
  /** Location observation config */
  locationObserved: {
    flag: number;
    keys: string[];
    observePath: boolean;
  };
  /** Whether view has a template function */
  hasTemplate: boolean;
  /** Delegated event types (keys from $evtObjMap) */
  eventMethodKeys: string[];
  /** Captured resource keys */
  resourceKeys: string[];
  /** Whether view exposes an assign method */
  hasAssign: boolean;
  /** Updater refData snapshot (shallow copy of current data) */
  updaterData: Record<string, unknown> | null;
}

/** A single node in the serialized frame tree */
export interface SerializedFrameNode {
  /** Frame ID (same as owner DOM element ID) */
  id: string;
  /** Parent frame ID (null for root) */
  parentId: string | null;
  /** View path (v-swifty attribute value) */
  viewPath: string | null;
  /** Number of child frames */
  childrenCount: number;
  /** Number of children that have fired 'created' */
  readyCount: number;
  /** Whether children have been created */
  childrenCreated: number;
  /** Whether children are in alter state */
  childrenAlter: number;
  /** Whether this frame is destroyed */
  destroyed: number;
  /** Serialized view info (null if no view mounted) */
  view: SerializedViewInfo | null;
  /** Child frame nodes */
  children: SerializedFrameNode[];
}

/** Top-level serialized frame tree */
export interface SerializedFrameTree {
  /** Root frame node */
  root: SerializedFrameNode | null;
  /** Total frame count */
  totalFrames: number;
  /** Timestamp of serialization */
  timestamp: number;
  /** Root element ID */
  rootId: string;
}

// ============================================================
// Message type constants
// ============================================================

export const FrameDevtoolBridge = {
  MSG_PING: "SWIFTY_DEVTOOL_PING",
  MSG_PONG: "SWIFTY_DEVTOOL_PONG",
  MSG_REQUEST_TREE: "SWIFTY_DEVTOOL_REQUEST_TREE",
  MSG_TREE: "SWIFTY_DEVTOOL_TREE",
  MSG_TREE_DELTA: "SWIFTY_DEVTOOL_TREE_DELTA",
};

// ============================================================
// Serialization
// ============================================================

/**
 * Serialize a `ViewCtx` into a JSON-safe snapshot for the Devtool panel.
 *
 * Captures the view's ID, render state, signature, observed keys,
 * template/events/resources presence, and a shallow snapshot of `updater.refData`
 * (objects are stringified as `[object]` to stay JSON-safe).
 */
function serializeView(view: ViewCtx): SerializedViewInfo {
  const events = view.getEvents();
  const eventMethodKeys = events ? Object.keys(events) : [];
  const resourceKeys = view.resources ? Object.keys(view.resources) : [];
  const hasAssign = typeof view.getAssign() === "function";

  let updaterData: Record<string, unknown> | null = null;
  try {
    const ref = view.updater?.refData;
    if (ref && typeof ref === "object") {
      updaterData = {};
      for (const k of Object.keys(ref as Record<string, unknown>)) {
        const v = (ref as Record<string, unknown>)[k];
        updaterData[k] =
          v === null || typeof v !== "object" ? v : `[${typeof v}]`;
      }
    }
  } catch {
    // ignore
  }

  return {
    id: view.id,
    rendered: !!view.rendered,
    signature: view.signature.value,
    observedStateKeys: view.getObservedStateKeys() ?? null,
    locationObserved: {
      flag: view.locationObserved.flag,
      keys: view.locationObserved.keys,
      observePath: view.locationObserved.observePath,
    },
    hasTemplate: !!view.getTemplate(),
    eventMethodKeys,
    resourceKeys,
    hasAssign,
    updaterData,
  };
}

/**
 * Recursively serialize a Frame and all its descendants into a tree.
 *
 * @param frameId - The frame ID to serialize
 * @returns A `SerializedFrameNode` (with children), or `null` if the frame doesn't exist
 */
function serializeFrame(frameId: string): SerializedFrameNode | null {
  const frame = Frame.get(frameId);
  if (!frame) return null;

  const view = frame.view;
  const children: SerializedFrameNode[] = [];

  for (const childId of frame.children()) {
    const childNode = serializeFrame(childId);
    if (childNode) {
      children.push(childNode);
    }
  }

  return {
    id: frame.id,
    parentId: frame.parentId ?? null,
    viewPath: frame.getViewPath() ?? null,
    childrenCount: frame.childrenCount,
    readyCount: frame.readyCount,
    childrenCreated: frame.childrenCreated,
    childrenAlter: frame.childrenAlter,
    destroyed: frame.destroyed,
    view: view ? serializeView(view) : null,
    children,
  };
}

/**
 * Serialize the entire Frame tree starting from root.
 * Returns an empty snapshot if the app hasn't booted yet.
 */
export function serializeFrameTree(): SerializedFrameTree {
  const root = Frame.getRoot();
  if (!root) {
    return { root: null, totalFrames: 0, timestamp: Date.now(), rootId: "" };
  }
  const rootNode = serializeFrame(root.id);
  let totalFrames = 0;

  const countFrames = (node: SerializedFrameNode | null): void => {
    if (!node) return;
    totalFrames++;
    for (const child of node.children) {
      countFrames(child);
    }
  };
  countFrames(rootNode);

  return {
    root: rootNode,
    totalFrames,
    timestamp: Date.now(),
    rootId: root.id,
  };
}

// ============================================================
// Bridge: postMessage listener
// ============================================================

/** Whether the bridge has been installed */
let bridgeInstalled = false;

/** Previous serialized tree for delta detection */
let lastTreeJson = "";

/**
 * Install the Frame Devtool Bridge.
 * Listens for postMessage events from the devtool panel and responds
 * with serialized frame tree data.
 *
 * This should be called once during Framework.boot().
 */
export function installFrameDevtoolBridge(): void {
  if (bridgeInstalled || typeof window === "undefined") return;
  bridgeInstalled = true;
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    const type = data.type;

    if (type === FrameDevtoolBridge.MSG_PING) {
      // Respond with pong so the devtool knows we're a Swifty app
      const source = event.source as WindowProxy | null;
      if (source) {
        source.postMessage(
          { type: FrameDevtoolBridge.MSG_PONG },
          { targetOrigin: "*" },
        );
      }
      return;
    }

    if (type === FrameDevtoolBridge.MSG_REQUEST_TREE) {
      // Serialize and send back the frame tree
      const tree = serializeFrameTree();
      const source = event.source as WindowProxy | null;
      if (source) {
        source.postMessage(
          { type: FrameDevtoolBridge.MSG_TREE, data: tree },
          { targetOrigin: "*" },
        );
      }
    }
  });

  // Listen for Frame add/remove events to push delta updates
  Frame.on("add", () => {
    pushTreeUpdate();
  });

  Frame.on("remove", () => {
    pushTreeUpdate();
  });
}

/**
 * Push a frame-tree delta to the parent window (the Devtool panel).
 *
 * Only sends if the serialized tree differs from the last push (compared via
 * `JSON.stringify`). This prevents flooding the Devtool with redundant
 * messages when `Frame.on("add"/"remove")` fires without actual changes.
 *
 * No-op when the page is not inside an iframe (i.e., `window === window.parent`).
 */
function pushTreeUpdate(): void {
  if (window === window.parent) return; // Not in iframe

  const tree = serializeFrameTree();
  const treeJson = JSON.stringify(tree);

  if (treeJson !== lastTreeJson) {
    lastTreeJson = treeJson;
    window.parent.postMessage(
      { type: FrameDevtoolBridge.MSG_TREE_DELTA, data: tree },
      "*",
    );
  }
}
