/**
 * Sidebar auto-generation from scanned routes.
 *
 * Groups routes by directory, sorts by sidebarPosition (frontmatter)
 * then alphabetically, and produces a SidebarItem[] tree.
 */
import type { DocsRoute, SidebarItem } from "./types";
import { sortDocsRoutes } from "./utils/route-sorting";

/**
 * Auto-generate sidebar items for routes under a given prefix.
 *
 * Grouping rules:
 * 1. Routes are grouped by their subdirectory under the prefix
 * 2. Within each group, items sort by sidebarPosition then title
 * 3. index.md becomes a top-level item (not nested)
 * 4. Nested directories become collapsible sub-groups
 */
export function generateSidebar(
  routes: DocsRoute[],
  prefix: string,
): SidebarItem[] {
  const normalizedPrefix = normalizePrefix(prefix);
  // Exclude virtual index routes (directories without index.md) — they
  // duplicate the first page's content and should not appear in the sidebar.
  // Match routes that equal the prefix or start with prefix + "/".
  const prefixRoutes = routes.filter((r) => {
    if (r.isDirectoryIndex) return false;
    if (!normalizedPrefix) return true; // root prefix matches all
    return (
      r.path === normalizedPrefix || r.path.startsWith(normalizedPrefix + "/")
    );
  });

  // Group by subdirectory
  const groups = new Map<string, DocsRoute[]>();

  for (const route of prefixRoutes) {
    const relativePath = route.path.slice(normalizedPrefix.length);
    const parts = relativePath.split("/").filter(Boolean);
    // If only 1 part (or ends with /), it's at the root level
    const groupKey = parts.length > 1 ? parts[0] : "";

    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(route);
  }

  const items: SidebarItem[] = [];

  // Process root-level items first (no subdirectory)
  const rootRoutes = groups.get("") || [];
  sortDocsRoutes(rootRoutes);
  for (const r of rootRoutes) {
    items.push({
      text: r.pageData.sidebarLabel || r.pageData.title,
      link: r.path,
    });
  }

  // Then process subdirectory groups
  for (const [groupKey, groupRoutes] of groups) {
    if (!groupKey) continue; // already handled

    sortDocsRoutes(groupRoutes);
    const subItems: SidebarItem[] = groupRoutes.map((r) => ({
      text: r.pageData.sidebarLabel || r.pageData.title,
      link: r.path,
    }));

    items.push({
      text: formatGroupLabel(groupKey),
      collapsed: false,
      items: subItems,
    });
  }

  return items;
}

function normalizePrefix(prefix: string): string {
  // Strip trailing slashes so prefix matching works with non-trailing-slash
  // route paths. e.g. "/docs/get-started/" → "/docs/get-started"
  return prefix.replace(/\/+$/, "");
}

function formatGroupLabel(key: string): string {
  return key
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
