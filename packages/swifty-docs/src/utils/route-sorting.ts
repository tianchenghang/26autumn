/**
 * Shared route sorting logic used by both the scanner (for virtual index
 * route first-page selection) and the sidebar generator.
 *
 * Sorting rules (per directory group):
 * 1. If ALL routes have `sidebarPosition`: sort by position ascending,
 *    then by filename (dictionary order) as tiebreaker.
 * 2. If ANY route is missing `sidebarPosition`: ignore all positions
 *    and sort by filename (dictionary order) only.
 *
 * Position values are 0-based (0 = first, 1 = second, ...).
 */
import type { DocsRoute } from "../types";

/**
 * Extract the filename stem (without .md extension) from a relative path.
 * e.g. "guide/config.md" → "config", "index.md" → "index"
 */
function getFilenameStem(relativePath: string): string {
  const parts = relativePath.split("/");
  const filename = parts[parts.length - 1] || "";
  return filename.replace(/\.md$/, "");
}

/**
 * Sort an array of routes in-place using the "all or nothing"
 * sidebar_position rule.
 *
 * - All routes have sidebarPosition → sort by position, then filename.
 * - Any route missing sidebarPosition → sort by filename only.
 */
export function sortDocsRoutes(routes: DocsRoute[]): void {
  const allHavePosition = routes.every(
    (r) => r.pageData.sidebarPosition !== undefined,
  );

  if (allHavePosition) {
    routes.sort((a, b) => {
      const posA = a.pageData.sidebarPosition!;
      const posB = b.pageData.sidebarPosition!;
      if (posA !== posB) return posA - posB;
      return getFilenameStem(a.pageData.relativePath).localeCompare(
        getFilenameStem(b.pageData.relativePath),
      );
    });
  } else {
    routes.sort((a, b) => {
      return getFilenameStem(a.pageData.relativePath).localeCompare(
        getFilenameStem(b.pageData.relativePath),
      );
    });
  }
}

/**
 * Return the first route after sorting, without mutating the input array.
 * Used by the scanner to pick the target page for virtual index routes.
 */
export function getFirstRoute(routes: DocsRoute[]): DocsRoute | undefined {
  if (routes.length === 0) return undefined;
  const sorted = [...routes];
  sortDocsRoutes(sorted);
  return sorted[0];
}
