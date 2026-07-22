import type { SerializedFrameNode } from "../types";

export interface FrameStatus {
  label: string;
  color: string;
  bgColor: string;
}

const DESTROYED: FrameStatus = {
  label: "Destroyed",
  color: "text-red-500",
  bgColor: "bg-red-50",
};
const EMPTY: FrameStatus = {
  label: "Empty",
  color: "text-slate-400",
  bgColor: "bg-slate-100",
};
const PENDING: FrameStatus = {
  label: "Pending",
  color: "text-amber-600",
  bgColor: "bg-amber-50",
};
const LOADING: FrameStatus = {
  label: "Loading",
  color: "text-sky-600",
  bgColor: "bg-sky-50",
};
const ALTERED: FrameStatus = {
  label: "Altered",
  color: "text-amber-500",
  bgColor: "bg-amber-50",
};
const READY: FrameStatus = {
  label: "Ready",
  color: "text-emerald-600",
  bgColor: "bg-emerald-50",
};

export function getFrameStatus(node: SerializedFrameNode): FrameStatus {
  if (node.destroyed) return DESTROYED;
  if (!node.view) return EMPTY;
  if (!node.view.rendered) return PENDING;
  if (node.childrenCount > 0 && node.childrenCount !== node.readyCount)
    return LOADING;
  if (node.childrenAlter) return ALTERED;
  return READY;
}
