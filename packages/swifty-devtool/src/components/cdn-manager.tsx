/**
 * CdnManager — CDN project and version management page.
 *
 * Layout:
 * - Left panel: Project list with expandable versions
 * - Right panel: Discovery panel — scan workspace for dist directories, one-click publish
 *
 * All CRUD operations use the useCdnApi hook.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen,
  Trash2,
  RefreshCw,
  Search,
  Upload,
  ChevronRight,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  useCdnApi,
  type CdnProject,
  type CdnVersion,
  type DiscoveredDist,
} from "../hooks/use-cdn-api";

export function CdnManager() {
  const api = useCdnApi();
  // Use ref to hold stable API references — avoids infinite re-render loops
  // because the `api` object is a new reference every render.
  const apiRef = useRef(api);
  apiRef.current = api;

  const [projects, setProjects] = useState<CdnProject[]>([]);
  const [dists, setDists] = useState<DiscoveredDist[]>([]);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Load projects on mount ──

  const loadProjects = useCallback(async () => {
    try {
      const data = await apiRef.current.fetchProjects();
      setProjects(data);
      setActionError(null);
    } catch {
      // error is captured in api.error
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // ── Discover dists ──

  const handleDiscover = useCallback(async () => {
    try {
      const data = await apiRef.current.discoverDists();
      setDists(data);
      setActionError(null);
    } catch {
      // error captured in api.error
    }
  }, []);

  // ── One-click publish ──

  const handlePublish = useCallback(
    async (dist: DiscoveredDist) => {
      try {
        await apiRef.current.publish({
          name: dist.name,
          version: dist.version,
          distPath: dist.distPath,
        });
        setActionError(null);
        await loadProjects();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setActionError(message);
      }
    },
    [loadProjects],
  );

  // ── Delete project ──

  const handleDeleteProject = useCallback(
    async (name: string) => {
      try {
        await apiRef.current.deleteProject(name);
        setActionError(null);
        await loadProjects();
        if (expandedProject === name) setExpandedProject(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setActionError(message);
      }
    },
    [loadProjects, expandedProject],
  );

  // ── Delete version ──

  const handleDeleteVersion = useCallback(
    async (projectName: string, version: string) => {
      try {
        await apiRef.current.deleteVersion(projectName, version);
        setActionError(null);
        await loadProjects();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setActionError(message);
      }
    },
    [loadProjects],
  );

  // ── Toggle version active ──

  const handleToggleActive = useCallback(
    async (projectName: string, version: CdnVersion) => {
      try {
        await apiRef.current.updateVersion(projectName, version.version, {
          isActive: !version.isActive,
        });
        setActionError(null);
        await loadProjects();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setActionError(message);
      }
    },
    [loadProjects],
  );

  // ── Toggle project expand ──

  const toggleExpand = useCallback((name: string) => {
    setExpandedProject((prev) => (prev === name ? null : name));
  }, []);

  return (
    <div className="flex h-full">
      {/* Left panel: Project list */}
      <div className="flex w-96 shrink-0 flex-col border-r border-sky-200/60 bg-white/70">
        <div className="border-b border-sky-200/60 bg-sky-50/80 px-4 py-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold tracking-wider text-sky-600 uppercase">
              Projects
            </h2>
            <button
              onClick={() => void loadProjects()}
              className="rounded p-1 text-slate-400 hover:bg-sky-100 hover:text-sky-600"
              title="Refresh projects"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {projects.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <FolderOpen className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              <p className="text-[11px] text-slate-400">No projects yet</p>
              <p className="text-[10px] text-slate-300">
                Use Discover to find and publish dist directories
              </p>
            </div>
          ) : (
            <div className="divide-y divide-sky-100/60">
              {projects.map((project) => (
                <div key={project.name}>
                  {/* Project header */}
                  <div
                    className="flex cursor-pointer items-center gap-1.5 px-3 py-2 hover:bg-sky-50/50"
                    onClick={() => toggleExpand(project.name)}
                  >
                    {expandedProject === project.name ? (
                      <ChevronDown className="h-3 w-3 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-slate-400" />
                    )}
                    <span className="flex-1 truncate font-mono text-xs font-medium text-slate-700">
                      {project.name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {project.versions.length} ver
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteProject(project.name);
                      }}
                      className="rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                      title="Delete project"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Expanded versions */}
                  {expandedProject === project.name && (
                    <div className="bg-slate-50/50 px-3 pb-2 pl-7">
                      <div className="mb-1 text-[10px] text-slate-400">
                        default: {project.defaultVersion}
                      </div>
                      {project.versions.length === 0 ? (
                        <div className="text-[10px] text-slate-300">
                          No versions
                        </div>
                      ) : (
                        project.versions.map((v) => (
                          <div
                            key={v.version}
                            className="mb-1 flex items-center gap-1.5 rounded border border-slate-100 bg-white px-2 py-1.5"
                          >
                            <span className="font-mono text-[11px] font-medium text-slate-600">
                              {v.version}
                            </span>
                            <span className="flex-1 truncate text-[10px] text-slate-400">
                              {v.distPath.split("/").slice(-2).join("/")}
                            </span>

                            {/* Weight badge */}
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] text-sky-600">
                              w:{v.weight}
                            </span>

                            {/* Active toggle */}
                            <button
                              onClick={() =>
                                void handleToggleActive(project.name, v)
                              }
                              className="text-slate-400 hover:text-sky-600"
                              title={v.isActive ? "Deactivate" : "Activate"}
                            >
                              {v.isActive ? (
                                <ToggleRight className="h-4 w-4 text-sky-500" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-slate-300" />
                              )}
                            </button>

                            <button
                              onClick={() =>
                                void handleDeleteVersion(
                                  project.name,
                                  v.version,
                                )
                              }
                              className="rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                              title="Delete version"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: Discovery */}
      <div className="flex flex-1 flex-col bg-white/40">
        <div className="border-b border-sky-200/60 bg-sky-50/80 px-4 py-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold tracking-wider text-sky-600 uppercase">
              Discover & Publish
            </h2>
            <button
              onClick={() => void handleDiscover()}
              disabled={api.loading}
              className="flex items-center gap-1 rounded-md bg-sky-600 px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
            >
              <Search className="h-3 w-3" />
              {api.loading ? "Scanning..." : "Scan Workspace"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Error display */}
          {(actionError || api.error) && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="font-mono text-[10px] text-red-500">
                {actionError ?? api.error}
              </p>
            </div>
          )}

          {dists.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">
                  Click "Scan Workspace" to discover dist directories
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  Requires CDN_WORKSPACE_ROOT to be configured
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500">
                Found {dists.length} dist director
                {dists.length === 1 ? "y" : "ies"}. Click publish to register
                with CDN.
              </p>
              {dists.map((dist) => {
                const alreadyRegistered = projects.some(
                  (p) =>
                    p.name === dist.name &&
                    p.versions.some((v) => v.version === dist.version),
                );
                return (
                  <div
                    key={dist.distPath}
                    className="flex items-center gap-3 rounded-lg border border-sky-100 bg-white px-4 py-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-700">
                          {dist.name}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                          {dist.type}
                        </span>
                        <span className="rounded bg-violet-50 px-1.5 py-0.5 font-mono text-[10px] text-violet-600">
                          v{dist.version}
                        </span>
                        {alreadyRegistered && (
                          <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-600">
                            registered
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                        {dist.distPath}
                      </p>
                    </div>
                    <button
                      onClick={() => void handlePublish(dist)}
                      disabled={api.loading}
                      className="flex items-center gap-1 rounded-md bg-sky-600 px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
                    >
                      <Upload className="h-3 w-3" />
                      Publish
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
