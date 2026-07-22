/**
 * useCdnApi — React hook for the Swifty CDN REST API.
 *
 * Provides typed async functions for all CDN management endpoints:
 * - Project CRUD
 * - Version CRUD
 * - Discover (scan workspace for dist directories)
 * - Publish (one-click register a dist directory)
 */
import { useState, useCallback } from "react";

// ============================================================
// Types
// ============================================================

const DEFAULT_BASE = "http://localhost:3300";

/** Project as returned by the CDN API */
export interface CdnProject {
  name: string;
  description: string;
  defaultVersion: string;
  versions: CdnVersion[];
}

/** Version within a project */
export interface CdnVersion {
  version: string;
  distPath: string;
  weight: number;
  isActive: boolean;
  createdAt: number;
}

/** A discovered dist directory */
export interface DiscoveredDist {
  name: string;
  distPath: string;
  type: "dist" | "dist-webpack";
  /** Version read from dist/package.json, or "0.0.0" if unavailable */
  version: string;
}

// ============================================================
// API helpers
// ============================================================

interface ApiResult<T> {
  success: true;
  data: T;
}

interface ApiError {
  success: false;
  error: string;
  message: string;
}

type ApiResponse<T> = ApiResult<T> | ApiError;

async function apiRequest<T>(
  path: string,
  options?: RequestInit,
  baseUrl = DEFAULT_BASE,
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body: ApiResponse<T> = await res.json();

  if (!body.success) {
    throw new Error(body.message);
  }

  return body.data;
}

// ============================================================
// Hook
// ============================================================

export function useCdnApi(baseUrl = DEFAULT_BASE) {
  const [loadingCount, setLoadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const loading = loadingCount > 0;

  const withLoading = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoadingCount((c) => c + 1);
      setError(null);
      try {
        const result = await fn();
        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoadingCount((c) => c - 1);
      }
    },
    [],
  );

  // ── Project CRUD ──

  const fetchProjects = useCallback(
    () =>
      withLoading(() =>
        apiRequest<CdnProject[]>("/api/projects", undefined, baseUrl),
      ),
    [withLoading, baseUrl],
  );

  const fetchProject = useCallback(
    (name: string) =>
      withLoading(() =>
        apiRequest<CdnProject>(`/api/projects/${name}`, undefined, baseUrl),
      ),
    [withLoading, baseUrl],
  );

  const createProject = useCallback(
    (data: { name: string; description?: string; defaultVersion?: string }) =>
      withLoading(() =>
        apiRequest<CdnProject>(
          "/api/projects",
          {
            method: "POST",
            body: JSON.stringify(data),
          },
          baseUrl,
        ),
      ),
    [withLoading, baseUrl],
  );

  const updateProject = useCallback(
    (name: string, data: { description?: string; defaultVersion?: string }) =>
      withLoading(() =>
        apiRequest<CdnProject>(
          `/api/projects/${name}`,
          {
            method: "PUT",
            body: JSON.stringify(data),
          },
          baseUrl,
        ),
      ),
    [withLoading, baseUrl],
  );

  const deleteProject = useCallback(
    (name: string) =>
      withLoading(() =>
        apiRequest<{ deleted: boolean }>(
          `/api/projects/${name}`,
          {
            method: "DELETE",
          },
          baseUrl,
        ),
      ),
    [withLoading, baseUrl],
  );

  // ── Version CRUD ──

  const addVersion = useCallback(
    (
      projectName: string,
      data: {
        version: string;
        distPath: string;
        weight?: number;
        isActive?: boolean;
      },
    ) =>
      withLoading(() =>
        apiRequest<CdnProject>(
          `/api/projects/${projectName}/versions`,
          {
            method: "POST",
            body: JSON.stringify(data),
          },
          baseUrl,
        ),
      ),
    [withLoading, baseUrl],
  );

  const updateVersion = useCallback(
    (
      projectName: string,
      version: string,
      data: { distPath?: string; weight?: number; isActive?: boolean },
    ) =>
      withLoading(() =>
        apiRequest<CdnProject>(
          `/api/projects/${projectName}/versions/${version}`,
          {
            method: "PUT",
            body: JSON.stringify(data),
          },
          baseUrl,
        ),
      ),
    [withLoading, baseUrl],
  );

  const deleteVersion = useCallback(
    (projectName: string, version: string) =>
      withLoading(() =>
        apiRequest<CdnProject>(
          `/api/projects/${projectName}/versions/${version}`,
          { method: "DELETE" },
          baseUrl,
        ),
      ),
    [withLoading, baseUrl],
  );

  // ── Discover & Publish ──

  const discoverDists = useCallback(
    () =>
      withLoading(() =>
        apiRequest<DiscoveredDist[]>("/api/discover", undefined, baseUrl),
      ),
    [withLoading, baseUrl],
  );

  const publish = useCallback(
    (data: { name: string; version: string; distPath: string }) =>
      withLoading(() =>
        apiRequest<CdnProject>(
          "/api/publish",
          {
            method: "POST",
            body: JSON.stringify(data),
          },
          baseUrl,
        ),
      ),
    [withLoading, baseUrl],
  );

  return {
    loading,
    error,
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    deleteProject,
    addVersion,
    updateVersion,
    deleteVersion,
    discoverDists,
    publish,
  };
}
