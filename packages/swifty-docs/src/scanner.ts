/**
 * Recursive docs directory scanner.
 *
 * Walks the filesystem to discover .md files, extracts frontmatter
 * and headings from each, and produces DocsRoute entries.
 *
 * Routing rules (no trailing slashes):
 * - Files/dirs starting with `_` or `.` are skipped
 * - `index.md` maps to the directory path without trailing slash
 *   (e.g. root index → "/docs", subdir index → "/docs/guide")
 * - Other `.md` files map to their stem (e.g. "/docs/guide/config")
 * - Directories without `index.md` get a virtual index route that
 *   points to the first page (by sidebar_position or filename order).
 * - Files with `draft: true` in frontmatter are excluded when `excludeDrafts` is set
 */
import fs from "node:fs";
import path from "node:path";
import type { DocsRoute, PageData } from "./types";
import { extractFrontmatter } from "./markdown/frontmatter";
import { deriveTitleFromPath } from "./utils/derive-title";
import {
  extractExcerpt,
  extractFirstHeading,
  extractHeadings,
} from "./utils/heading-extraction";
import { getFirstRoute } from "./utils/route-sorting";

const IGNORED_PREFIXES = ["_", "."];
const IGNORED_DIRS = new Set([
  "node_modules",
  "__tests__",
  "__fixtures__",
  ".git",
  ".vitepress",
  ".swifty-docs",
  "dist",
]);

interface DirInfo {
  hasIndex: boolean;
  children: DocsRoute[];
}

/**
 * Recursively scan a docs directory and return route entries.
 */
export function scanDocsDir(
  docsDir: string,
  baseUrl: string,
  options?: { excludeDrafts?: boolean },
): DocsRoute[] {
  const routes: DocsRoute[] = [];
  const base = normalizeBase(baseUrl); // "/swifty-cli" or "/"
  const effectiveBase = base === "/" ? "" : base;

  // Track directory info for virtual index route generation.
  // Key: directory prefix (e.g. "", "/guide", "/markdown").
  const dirInfoMap = new Map<string, DirInfo>();

  function getOrCreateDirInfo(prefix: string): DirInfo {
    if (!dirInfoMap.has(prefix)) {
      dirInfoMap.set(prefix, { hasIndex: false, children: [] });
    }
    return dirInfoMap.get(prefix)!;
  }

  function walk(dir: string, prefix: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // directory doesn't exist or not readable
    }

    for (const entry of entries) {
      if (IGNORED_PREFIXES.some((p) => entry.name.startsWith(p))) continue;
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, `${prefix}/${entry.name}`);
        continue;
      }

      if (!entry.name.endsWith(".md")) continue;

      const stem = entry.name.replace(/\.md$/, "");
      const isIndex = stem === "index";
      // routeSegment: "" for root index, "/guide" for subdir index,
      // "/ch1" for root file, "/guide/config" for subdir file
      const routeSegment = isIndex ? prefix : `${prefix}/${stem}`;
      // Explicit precedence: `+` binds tighter than `||`, so the original
      // `effectiveBase + routeSegment || "/"` was technically correct but
      // relied on implicit precedence. Make it obvious.
      const computedPath = effectiveBase + routeSegment;
      const fullRoutePath = computedPath || "/";

      // Read and parse
      const raw = fs.readFileSync(fullPath, "utf-8");
      const { data: frontmatter, content } = extractFrontmatter(raw);

      if (options?.excludeDrafts && frontmatter["draft"]) continue;

      const relativePath = path.relative(docsDir, fullPath);
      const derivedTitle = deriveTitleFromPath(relativePath);

      const pageData: PageData = {
        title:
          (frontmatter["title"] as string) ||
          extractFirstHeading(content) ||
          derivedTitle,
        description: (frontmatter["description"] as string) || derivedTitle,
        excerpt: extractExcerpt(content),
        sidebarPosition: frontmatter["sidebar_position"] as number | undefined,
        sidebarLabel: frontmatter["sidebar_label"] as string | undefined,
        draft: frontmatter["draft"] as boolean | undefined,
        headings: extractHeadings(content),
        relativePath,
      };

      const route: DocsRoute = {
        path: fullRoutePath,
        filePath: fullPath,
        pageData,
      };

      routes.push(route);

      // Track directory membership for virtual index generation
      const info = getOrCreateDirInfo(prefix);
      if (isIndex) {
        info.hasIndex = true;
      } else {
        info.children.push(route);
      }
    }
  }

  walk(docsDir, "");

  // Generate virtual index routes for directories without index.md.
  // These routes point to the first page (by sidebar_position or filename)
  // so that /docs/markdown serves content even without markdown/index.md.
  for (const [prefix, info] of dirInfoMap) {
    if (info.hasIndex) continue;
    if (info.children.length === 0) continue;

    const firstRoute = getFirstRoute(info.children);
    if (!firstRoute) continue;

    const routeSegment = prefix; // treated as index
    const computedPath = effectiveBase + routeSegment;
    const fullRoutePath = computedPath || "/";

    const virtualRoute: DocsRoute = {
      path: fullRoutePath,
      filePath: firstRoute.filePath,
      pageData: firstRoute.pageData,
      isDirectoryIndex: true,
    };

    routes.push(virtualRoute);
  }

  return routes;
}

/**
 * Normalize baseUrl to NOT have a trailing slash.
 * "/swifty-cli/" → "/swifty-cli", "/docs/" → "/docs", "/" → "/"
 */
function normalizeBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed || "/";
}
