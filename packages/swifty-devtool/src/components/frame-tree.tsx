import { useState, useCallback, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, Square, AppWindow } from "lucide-react";
import type { SerializedFrameNode } from "../types";
import { getFrameStatus } from "../utils/frame-status";

interface FlatNode {
  node: SerializedFrameNode;
  depth: number;
  isRoot: boolean;
}

interface FrameTreeProps {
  root: SerializedFrameNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ROW_HEIGHT = 32;

function flattenTree(
  node: SerializedFrameNode,
  depth: number,
  expanded: Set<string>,
  isRoot: boolean,
): FlatNode[] {
  const result: FlatNode[] = [{ node, depth, isRoot }];
  if (expanded.has(node.id) && node.children.length > 0) {
    for (const child of node.children) {
      result.push(...flattenTree(child, depth + 1, expanded, false));
    }
  }
  return result;
}

function collectDefaultExpanded(
  node: SerializedFrameNode,
  depth: number,
  set: Set<string>,
): void {
  if (depth < 3) {
    set.add(node.id);
    for (const child of node.children) {
      collectDefaultExpanded(child, depth + 1, set);
    }
  }
}

export function FrameTree({ root, selectedId, onSelect }: FrameTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    collectDefaultExpanded(root, 0, set);
    return set;
  });

  const parentRef = useRef<HTMLDivElement>(null);

  const flatNodes = useMemo(
    () => flattenTree(root, 0, expanded, true),
    [root, expanded],
  );

  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto py-1">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const { node, depth, isRoot } = flatNodes[virtualRow.index];
          const hasChildren = node.children.length > 0;
          const isExpanded = expanded.has(node.id);
          const isSelected = selectedId === node.id;
          const status = getFrameStatus(node);
          const paddingLeft = depth * 20 + 12;

          return (
            <div
              key={node.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: ROW_HEIGHT,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className={`group flex h-full cursor-pointer items-center gap-2 transition-colors duration-75 ${isSelected ? "border-l-2 border-sky-500 bg-sky-100/70" : "border-l-2 border-transparent hover:bg-sky-50/80"}`}
                style={{ paddingLeft }}
                onClick={() => onSelect(node.id)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasChildren) toggleExpand(node.id);
                  }}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${hasChildren ? "text-slate-400 hover:bg-sky-100 hover:text-sky-500" : "text-transparent"}`}
                >
                  {hasChildren && (
                    <ChevronRight
                      className={`h-3.5 w-3.5 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                    />
                  )}
                </button>

                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${isRoot ? "bg-sky-100 text-sky-600" : "bg-slate-100 text-slate-400"}`}
                >
                  {isRoot ? (
                    <Square className="h-3 w-3" />
                  ) : (
                    <AppWindow className="h-3 w-3" />
                  )}
                </div>

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

                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${status.color} ${status.bgColor} shrink-0`}
                >
                  {status.label}
                </span>

                {hasChildren && (
                  <span className="shrink-0 pr-2 text-[10px] text-slate-400">
                    {node.children.length}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
