import { describe, it, expect } from "vitest";
import { scanDocsDir } from "../src/scanner";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function createTempDocs(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swifty-docs-test-"));
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }
  return dir;
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("scanDocsDir", () => {
  it("scans a flat docs directory", () => {
    const dir = createTempDocs({
      "index.md": "---\ntitle: Home\n---\n# Home\n",
      "getting-started.md": "# Getting Started\n\nIntro.",
      "config.md": "---\ntitle: Config\n---\n# Config\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");

      expect(routes.length).toBe(3);

      const paths = routes.map((r) => r.path).sort();
      expect(paths).toContain("/docs");
      expect(paths).toContain("/docs/getting-started");
      expect(paths).toContain("/docs/config");
    } finally {
      cleanup(dir);
    }
  });

  it("scans nested directories", () => {
    const dir = createTempDocs({
      "index.md": "# Home\n",
      "guide/index.md": "# Guide\n",
      "guide/config.md": "# Config\n",
      "api/router.md": "# Router\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");

      // 5 routes: root index, guide index, guide/config, api/router,
      // plus a virtual index for api/ (no api/index.md)
      expect(routes.length).toBe(5);
      const paths = routes.map((r) => r.path).sort();
      expect(paths).toContain("/docs");
      expect(paths).toContain("/docs/guide");
      expect(paths).toContain("/docs/guide/config");
      expect(paths).toContain("/docs/api/router");
      expect(paths).toContain("/docs/api");

      // The virtual index for api/ should point to router.md's content
      const apiIndex = routes.find((r) => r.path === "/docs/api");
      expect(apiIndex).toBeDefined();
      expect(apiIndex!.isDirectoryIndex).toBe(true);
      expect(apiIndex!.filePath).toMatch(/router\.md$/);
    } finally {
      cleanup(dir);
    }
  });

  it("ignores files starting with _ or .", () => {
    const dir = createTempDocs({
      "index.md": "# Home\n",
      "_draft.md": "# Draft\n",
      ".hidden.md": "# Hidden\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      expect(routes.length).toBe(1);
      expect(routes[0].path).toBe("/docs");
    } finally {
      cleanup(dir);
    }
  });

  it("ignores node_modules and .git directories", () => {
    const dir = createTempDocs({
      "index.md": "# Home\n",
      "node_modules/pkg.md": "# Pkg\n",
      ".git/config.md": "# Git\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      expect(routes.length).toBe(1);
    } finally {
      cleanup(dir);
    }
  });

  it("extracts frontmatter from scanned files", () => {
    const dir = createTempDocs({
      "test.md":
        "---\ntitle: Test Page\ndescription: A test\nsidebar_position: 2\n---\n# Test\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      // 2 routes: test.md + virtual index /docs (root has no index.md)
      expect(routes.length).toBe(2);

      const testRoute = routes.find((r) => r.path === "/docs/test");
      expect(testRoute).toBeDefined();
      expect(testRoute!.pageData.title).toBe("Test Page");
      expect(testRoute!.pageData.description).toBe("A test");
      expect(testRoute!.pageData.sidebarPosition).toBe(2);
    } finally {
      cleanup(dir);
    }
  });

  it("extracts headings from content", () => {
    const dir = createTempDocs({
      "test.md": "# Title\n\n## Section One\n\n### Sub\n\n## Section Two\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      const testRoute = routes.find((r) => r.path === "/docs/test");
      const headings = testRoute!.pageData.headings;

      expect(headings).toHaveLength(3);
      expect(headings[0]).toEqual({
        level: 2,
        text: "Section One",
        slug: "section-one",
      });
      expect(headings[1]).toEqual({
        level: 3,
        text: "Sub",
        slug: "sub",
      });
      expect(headings[2]).toEqual({
        level: 2,
        text: "Section Two",
        slug: "section-two",
      });
    } finally {
      cleanup(dir);
    }
  });

  it("ignores headings inside fenced code blocks", () => {
    const dir = createTempDocs({
      "test.md":
        "# Title\n\n## Real Heading\n\n```markdown\n## Not A Heading\n```\n\n## Another Heading\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      const testRoute = routes.find((r) => r.path === "/docs/test");
      const headings = testRoute!.pageData.headings;
      const texts = headings.map((h) => h.text);

      expect(texts).toContain("Real Heading");
      expect(texts).toContain("Another Heading");
      expect(texts).not.toContain("Not A Heading");
    } finally {
      cleanup(dir);
    }
  });

  it("does not infer title from headings inside code blocks", () => {
    const dir = createTempDocs({
      "test.md": "```markdown\n# npm install\n```\n\n# Real Title\n\nContent.",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      const testRoute = routes.find((r) => r.path === "/docs/test");
      expect(testRoute!.pageData.title).toBe("Real Title");
    } finally {
      cleanup(dir);
    }
  });

  it("excludes drafts when excludeDrafts is true", () => {
    const dir = createTempDocs({
      "published.md": "# Published\n",
      "draft.md": "---\ndraft: true\n---\n# Draft\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/", { excludeDrafts: true });
      // 2 routes: published.md + virtual index /docs (root has no index.md)
      expect(routes.length).toBe(2);
      const published = routes.find((r) => r.path === "/docs/published");
      expect(published).toBeDefined();
      expect(published!.pageData.title).toBe("Published");
    } finally {
      cleanup(dir);
    }
  });

  it("normalizes baseUrl", () => {
    const dir = createTempDocs({
      "index.md": "# Home\n",
    });

    try {
      // baseUrl without trailing slash
      const routes = scanDocsDir(dir, "/docs");
      expect(routes[0].path).toBe("/docs");
    } finally {
      cleanup(dir);
    }
  });

  it("infers title from first h1 when no frontmatter title", () => {
    const dir = createTempDocs({
      "test.md": "# My Inferred Title\n\nContent.",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      const testRoute = routes.find((r) => r.path === "/docs/test");
      expect(testRoute!.pageData.title).toBe("My Inferred Title");
    } finally {
      cleanup(dir);
    }
  });

  it("derives title from filename when no heading and no frontmatter", () => {
    const dir = createTempDocs({
      "getting-started.md": "Just some content, no heading.",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      const gs = routes.find((r) => r.path === "/docs/getting-started");
      expect(gs!.pageData.title).toBe("Getting Started");
    } finally {
      cleanup(dir);
    }
  });

  it("derives title from parent directory for index.md without heading", () => {
    const dir = createTempDocs({
      "guide/index.md": "Guide content without heading.",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      const guide = routes.find((r) => r.path === "/docs/guide");
      expect(guide!.pageData.title).toBe("Guide");
    } finally {
      cleanup(dir);
    }
  });

  it("uses 'Home' as fallback for root index.md without heading", () => {
    const dir = createTempDocs({
      "index.md": "Content without heading.",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      const root = routes.find((r) => r.path === "/docs");
      expect(root!.pageData.title).toBe("Home");
    } finally {
      cleanup(dir);
    }
  });

  it("returns empty array for non-existent directory", () => {
    const routes = scanDocsDir("/non/existent/path", "/docs/");
    expect(routes).toEqual([]);
  });

  // ============================================================
  // Virtual index route tests
  // ============================================================

  it("creates virtual index for flat directory without root index.md", () => {
    const dir = createTempDocs({
      "ch1.md": "# Chapter 1\n",
      "ch2.md": "# Chapter 2\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");

      // 3 routes: ch1, ch2, virtual index /docs
      expect(routes.length).toBe(3);

      const virtualIndex = routes.find((r) => r.path === "/docs");
      expect(virtualIndex).toBeDefined();
      expect(virtualIndex!.isDirectoryIndex).toBe(true);
      // Should point to ch1.md (first alphabetically)
      expect(virtualIndex!.filePath).toMatch(/ch1\.md$/);
    } finally {
      cleanup(dir);
    }
  });

  it("creates virtual index for subdirectory without index.md", () => {
    const dir = createTempDocs({
      "index.md": "# Home\n",
      "markdown/code-highlighting.md": "# Code\n",
      "markdown/containers.md": "# Containers\n",
      "markdown/frontmatter.md": "# Frontmatter\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");

      // Virtual index for markdown/ pointing to first page (alphabetical)
      const virtualIndex = routes.find((r) => r.path === "/docs/markdown");
      expect(virtualIndex).toBeDefined();
      expect(virtualIndex!.isDirectoryIndex).toBe(true);
      expect(virtualIndex!.filePath).toMatch(/code-highlighting\.md$/);
    } finally {
      cleanup(dir);
    }
  });

  it("does not create virtual index when directory has index.md", () => {
    const dir = createTempDocs({
      "index.md": "# Home\n",
      "guide/index.md": "# Guide\n",
      "guide/config.md": "# Config\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");

      // No virtual index for guide/ — it has guide/index.md
      const virtualIndex = routes.find(
        (r) => r.isDirectoryIndex && r.path === "/docs/guide",
      );
      expect(virtualIndex).toBeUndefined();
    } finally {
      cleanup(dir);
    }
  });

  it("virtual index picks first page by sidebar_position when all have it", () => {
    const dir = createTempDocs({
      "index.md": "# Home\n",
      "markdown/alpha.md": "---\nsidebar_position: 2\n---\n# Alpha\n",
      "markdown/beta.md": "---\nsidebar_position: 0\n---\n# Beta\n",
      "markdown/gamma.md": "---\nsidebar_position: 1\n---\n# Gamma\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");

      const virtualIndex = routes.find((r) => r.path === "/docs/markdown");
      expect(virtualIndex).toBeDefined();
      // beta.md has position 0 (lowest)
      expect(virtualIndex!.filePath).toMatch(/beta\.md$/);
    } finally {
      cleanup(dir);
    }
  });

  it("virtual index falls back to filename order when some sidebar_position missing", () => {
    const dir = createTempDocs({
      "index.md": "# Home\n",
      "markdown/zebra.md": "---\nsidebar_position: 0\n---\n# Zebra\n",
      "markdown/apple.md": "# Apple\n",
      "markdown/mango.md": "# Mango\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");

      const virtualIndex = routes.find((r) => r.path === "/docs/markdown");
      expect(virtualIndex).toBeDefined();
      // apple.md comes first alphabetically (positions ignored because
      // apple.md and mango.md are missing sidebar_position)
      expect(virtualIndex!.filePath).toMatch(/apple\.md$/);
    } finally {
      cleanup(dir);
    }
  });

  // ============================================================
  // Metadata default tests
  // ============================================================

  it("defaults description to derived title when frontmatter missing", () => {
    const dir = createTempDocs({
      "index.md": "# Home\n",
      "getting-started.md": "# Getting Started\n\nContent.",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      const gs = routes.find((r) => r.path === "/docs/getting-started");
      expect(gs).toBeDefined();
      expect(gs!.pageData.description).toBe("Getting Started");
    } finally {
      cleanup(dir);
    }
  });

  it("defaults description to directory name for index.md", () => {
    const dir = createTempDocs({
      "index.md": "# Home\n",
      "guide/index.md": "# Guide\n\nContent.",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      const guide = routes.find((r) => r.path === "/docs/guide");
      expect(guide).toBeDefined();
      expect(guide!.pageData.description).toBe("Guide");
    } finally {
      cleanup(dir);
    }
  });

  // ============================================================
  // Integration test: user's exact directory structure
  // ============================================================

  it("handles the full docs directory structure from the requirement", () => {
    const dir = createTempDocs({
      "index.md": "---\ntitle: Home\n---\n# Home\n",
      "api/index.md": "---\ntitle: API\n---\n# API\n",
      "app/boot.ts": "// non-md file\n",
      "app/index.html": "<html></html>",
      "app/main.css": "body {}",
      "get-started/index.md":
        "---\ntitle: Get Started\nsidebar_position: 0\n---\n# Get Started\n",
      "get-started/configuration.md":
        "---\ntitle: Configuration\nsidebar_position: 1\n---\n# Configuration\n",
      "markdown/code-highlighting.md": "# Code Highlighting\n",
      "markdown/containers.md": "# Containers\n",
      "markdown/frontmatter.md": "# Frontmatter\n",
      "router/index.md": "---\ntitle: Router\n---\n# Router\n",
    });

    try {
      const routes = scanDocsDir(dir, "/docs/");
      const allPaths = routes.map((r) => r.path);

      // Root index: /docs (no trailing slash)
      expect(allPaths).toContain("/docs");

      // api/ has index.md: /docs/api (no trailing slash)
      expect(allPaths).toContain("/docs/api");
      const apiIndex = routes.find((r) => r.path === "/docs/api");
      expect(apiIndex!.isDirectoryIndex).toBeUndefined();

      // get-started/ has index.md
      expect(allPaths).toContain("/docs/get-started");
      expect(allPaths).toContain("/docs/get-started/configuration");

      // markdown/ has NO index.md → virtual index pointing to first page
      expect(allPaths).toContain("/docs/markdown");
      const markdownIndex = routes.find((r) => r.path === "/docs/markdown");
      expect(markdownIndex!.isDirectoryIndex).toBe(true);
      // First page alphabetically: code-highlighting.md
      expect(markdownIndex!.filePath).toMatch(/code-highlighting\.md$/);

      // Individual markdown pages (no trailing slashes)
      expect(allPaths).toContain("/docs/markdown/code-highlighting");
      expect(allPaths).toContain("/docs/markdown/containers");
      expect(allPaths).toContain("/docs/markdown/frontmatter");

      // router/ has index.md
      expect(allPaths).toContain("/docs/router");

      // app/ and build/ (empty or non-md) should NOT produce routes
      expect(allPaths.filter((p) => p.includes("/app"))).toHaveLength(0);
      expect(allPaths.filter((p) => p.includes("/build"))).toHaveLength(0);

      // No route should have a trailing slash
      for (const p of allPaths) {
        expect(p.endsWith("/")).toBe(false);
      }
    } finally {
      cleanup(dir);
    }
  });

  // ============================================================
  // Swiftyy project scenario: flat directory with custom baseUrl
  // ============================================================

  it("handles flat directory with custom baseUrl (swiftyy scenario)", () => {
    const dir = createTempDocs({
      "ch1.md": "---\ntitle: Introduction\n---\n# Introduction\n",
      "ch2.md": "---\ntitle: Getting Started\n---\n# Getting Started\n",
    });

    try {
      const routes = scanDocsDir(dir, "/swifty-cli/");

      // 3 routes: ch1, ch2, virtual index /swifty-cli (root has no index.md)
      expect(routes.length).toBe(3);

      const allPaths = routes.map((r) => r.path);
      expect(allPaths).toContain("/swifty-cli");
      expect(allPaths).toContain("/swifty-cli/ch1");
      expect(allPaths).toContain("/swifty-cli/ch2");

      // Virtual index points to ch1 (first alphabetically)
      const virtualIndex = routes.find((r) => r.path === "/swifty-cli");
      expect(virtualIndex!.isDirectoryIndex).toBe(true);
      expect(virtualIndex!.filePath).toMatch(/ch1\.md$/);

      // No trailing slashes anywhere
      for (const p of allPaths) {
        expect(p.endsWith("/")).toBe(false);
      }
    } finally {
      cleanup(dir);
    }
  });
});
