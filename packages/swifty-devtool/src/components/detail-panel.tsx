/**
 * DetailPanel — shows detailed information about a selected frame node.
 */
import type { SerializedFrameNode } from "../types";
import { getFrameStatus } from "../utils/frame-status";

interface DetailPanelProps {
  /** The selected frame node (null if nothing selected) */
  node: SerializedFrameNode | null;
  /** Callback when a child frame is clicked */
  onSelect?: (id: string) => void;
}

export function DetailPanel({ node, onSelect }: DetailPanelProps) {
  if (!node) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        Select a frame to view details
      </div>
    );
  }

  const view = node.view;

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {/* Frame info */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-sky-600 uppercase">
          Frame
        </h3>
        <div className="space-y-1.5">
          <DetailRow label="ID" value={node.id} mono />
          {node.parentId && (
            <DetailRow label="Parent" value={node.parentId} mono />
          )}
          {node.viewPath && (
            <DetailRow label="View Path" value={node.viewPath} mono highlight />
          )}
          <DetailRow
            label="Children"
            value={`${node.childrenCount} (${node.readyCount} ready)`}
          />
          <DetailRow label="Status" value={getFrameStatus(node).label} />
        </div>
      </section>

      {/* View info */}
      {view && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-sky-600 uppercase">
            View
          </h3>
          <div className="space-y-1.5">
            <DetailRow label="Rendered" value={view.rendered ? "Yes" : "No"} />
            <DetailRow label="Signature" value={String(view.signature)} mono />
            <DetailRow
              label="Template"
              value={view.hasTemplate ? "Yes" : "No"}
            />
            {view.observedStateKeys && view.observedStateKeys.length > 0 && (
              <DetailRow
                label="State Keys"
                value={view.observedStateKeys.join(", ")}
                mono
              />
            )}
            {view.locationObserved.flag > 0 && (
              <>
                {view.locationObserved.observePath && (
                  <DetailRow label="Observe Path" value="Yes" />
                )}
                {view.locationObserved.keys.length > 0 && (
                  <DetailRow
                    label="Route Keys"
                    value={view.locationObserved.keys.join(", ")}
                    mono
                  />
                )}
              </>
            )}
            <DetailRow label="Assign" value={view.hasAssign ? "Yes" : "No"} />
            {view.eventMethodKeys && view.eventMethodKeys.length > 0 && (
              <DetailRow
                label="Events"
                value={view.eventMethodKeys.join(", ")}
                mono
              />
            )}
            {view.resourceKeys && view.resourceKeys.length > 0 && (
              <DetailRow
                label="Resources"
                value={view.resourceKeys.join(", ")}
                mono
              />
            )}
          </div>
        </section>
      )}

      {/* Updater data */}
      {view?.updaterData && Object.keys(view.updaterData).length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-sky-600 uppercase">
            Updater Data
          </h3>
          <div className="space-y-1.5">
            {Object.entries(view.updaterData).map(([key, val]) => (
              <DetailRow
                key={key}
                label={key}
                value={val === null ? "null" : String(val)}
                mono
              />
            ))}
          </div>
        </section>
      )}

      {/* Children list */}
      {node.children.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-sky-600 uppercase">
            Children
          </h3>
          <div className="space-y-1">
            {node.children.map((child) => (
              <div
                key={child.id}
                className={`flex items-center gap-2 rounded bg-sky-50 px-2 py-1 text-xs${onSelect ? "cursor-pointer hover:bg-sky-100" : ""}`}
                onClick={onSelect ? () => onSelect(child.id) : undefined}
              >
                <span className="truncate font-mono text-slate-600">
                  {child.viewPath || child.id}
                </span>
                <span className="shrink-0 text-slate-400">#{child.id}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** A single key-value row in the detail panel */
function DetailRow({
  label,
  value,
  mono = false,
  highlight = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-24 shrink-0 text-[11px] text-slate-400">{label}</span>
      <span
        className={`text-xs break-all ${
          highlight
            ? "text-sky-600"
            : mono
              ? "font-mono text-slate-700"
              : "text-slate-500"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
