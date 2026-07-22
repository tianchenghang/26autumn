/**
 * FrameTreeNode — recursive tree node component for rendering a single Frame.
 * Shows frame ID, viewPath, view status, and expandable children.
 */
import { useState, useCallback } from "react";
import { ChevronRight, Square, AppWindow } from "lucide-react";
import type { SerializedFrameNode } from "../types";
import { getFrameStatus } from "../utils/frame-status";

interface FrameTreeNodeProps {
  /** The frame node to render */
  node: SerializedFrameNode;
  /** Depth in the tree (0 = root) */
  depth: number;
  /** Currently selected frame ID */
  selectedId: string | null;
  /** Callback when a node is selected */
  onSelect: (id: string) => void;
  /** Whether this is the root node */
  isRoot?: boolean;
}

export function FrameTreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  isRoot = false,
}: FrameTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const status = getFrameStatus(node);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasChildren) {
        setExpanded((prev) => !prev);
      }
    },
    [hasChildren],
  );

  const handleSelect = useCallback(() => {
    onSelect(node.id);
  }, [node.id, onSelect]);

  // Indentation based on depth
  const paddingLeft = depth * 20 + 12;

  return (
    <div>
      {/* Node row */}
      <div
        className={`group flex cursor-pointer items-center gap-2 py-1.5 transition-colors duration-75 ${isSelected ? "border-l-2 border-sky-500 bg-sky-100/70" : "border-l-2 border-transparent hover:bg-sky-50/80"} `}
        style={{ paddingLeft }}
        onClick={handleSelect}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={handleToggle}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${hasChildren ? "text-slate-400 hover:bg-sky-100 hover:text-sky-500" : "text-transparent"} `}
        >
          {hasChildren && (
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
            />
          )}
        </button>

        {/* Frame icon */}
        <div
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${isRoot ? "bg-sky-100 text-sky-600" : "bg-slate-100 text-slate-400"} `}
        >
          {isRoot ? (
            <Square className="h-3 w-3" />
          ) : (
            <AppWindow className="h-3 w-3" />
          )}
        </div>

        {/* Frame ID / viewPath */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {node.viewPath ? (
            <>
              <span className="truncate font-mono text-sm text-slate-700">
                {node.viewPath}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                #{node.id}
              </span>
            </>
          ) : (
            <span className="truncate font-mono text-sm text-slate-500">
              {isRoot ? "root" : node.id}
            </span>
          )}
        </div>

        {/* Status badge */}
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${status.color} ${status.bgColor} shrink-0`}
        >
          {status.label}
        </span>

        {/* Children count */}
        {hasChildren && (
          <span className="shrink-0 text-[10px] text-slate-400">
            {node.children.length}
          </span>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FrameTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
