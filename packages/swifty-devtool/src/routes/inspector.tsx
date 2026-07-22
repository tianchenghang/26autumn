/**
 * InspectorRoute — the index route ("/").
 *
 * Renders the frame tree (left) + detail panel (right), or the EmptyState
 * when not connected. Frame tree data comes from FrameTreeContext, which is
 * owned by the RootLayout (the hidden iframe + useFrameTree hook live there).
 */
import { useState, useCallback, useMemo } from "react";
import { FrameTree } from "../components/frame-tree";
import { DetailPanel } from "../components/detail-panel";
import { EmptyState } from "../components/empty-state";
import { useFrameTreeContext } from "../router-context";
import type { SerializedFrameNode } from "../types";

export function InspectorRoute() {
  const { tree, status, targetUrl } = useFrameTreeContext();
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);

  /** Find a frame node by ID in the tree */
  const findFrameNode = useCallback(
    (id: string | null): SerializedFrameNode | null => {
      if (!id || !tree?.root) return null;
      const search = (
        node: SerializedFrameNode,
      ): SerializedFrameNode | null => {
        if (node.id === id) return node;
        for (const child of node.children) {
          const found = search(child);
          if (found) return found;
        }
        return null;
      };
      return search(tree.root);
    },
    [tree],
  );

  const selectedNode = useMemo(
    () => findFrameNode(selectedFrameId),
    [findFrameNode, selectedFrameId],
  );

  /** Handle frame node selection */
  const handleSelect = useCallback((id: string) => {
    setSelectedFrameId(id);
  }, []);

  const isConnected = status === "connected";
  const showTree = isConnected && tree?.root != null;
  const rootNode = tree?.root;

  return (
    <div className="flex flex-1 overflow-hidden">
      {showTree ? (
        <>
          {/* Tree view */}
          <div className="flex w-120 shrink-0 flex-col overflow-hidden border-r border-sky-200/60 bg-white/70">
            <div className="border-b border-sky-200/60 bg-sky-50/80 px-4 py-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-semibold tracking-wider text-sky-600 uppercase">
                  Frame Tree
                </h2>
                <span className="text-[10px] text-slate-400">
                  {tree?.rootId}
                </span>
              </div>
            </div>
            {rootNode && (
              <FrameTree
                root={rootNode}
                selectedId={selectedFrameId}
                onSelect={handleSelect}
              />
            )}
          </div>

          {/* Detail panel */}
          <div className="flex flex-1 flex-col overflow-hidden bg-white/40">
            <div className="border-b border-sky-200/60 bg-sky-50/80 px-4 py-2">
              <h2 className="text-[11px] font-semibold tracking-wider text-sky-600 uppercase">
                Details
              </h2>
            </div>
            <DetailPanel node={selectedNode} onSelect={handleSelect} />
          </div>
        </>
      ) : (
        <EmptyState status={status} targetUrl={targetUrl} />
      )}
    </div>
  );
}
