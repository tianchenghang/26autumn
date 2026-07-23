import { describe, it, expect } from "vitest";
import { generateSidebar } from "../src/sidebar-generator";
import type { DocsRoute } from "../src/types";

function makeRoute(
  path: string,
  title: string,
  opts?: {
    sidebarPosition?: number;
    sidebarLabel?: string;
    relativePath?: string;
    isDirectoryIndex?: boolean;
  },
): DocsRoute {
  return {
    path,
    filePath: `/project/docs${path.replace("/docs", "")}.md`,
    pageData: {
      title,
      excerpt: "",
      headings: [],
      relativePath: opts?.relativePath || "",
      sidebarPosition: opts?.sidebarPosition,
      sidebarLabel: opts?.sidebarLabel,
    },
    isDirectoryIndex: opts?.isDirectoryIndex,
  };
}

describe("generateSidebar", () => {
  it("generates sidebar items from routes", () => {
    const routes: DocsRoute[] = [
      makeRoute("/docs/guide", "Guide Home"),
      makeRoute("/docs/guide/config", "Configuration"),
      makeRoute("/docs/guide/plugins", "Plugins"),
    ];

    const items = generateSidebar(routes, "/docs/guide/");

    expect(items.length).toBeGreaterThan(0);
    const allTexts = items.flatMap((item) =>
      item.items ? [item.text, ...item.items.map((i) => i.text)] : [item.text],
    );
    expect(allTexts).toContain("Guide Home");
    expect(allTexts).toContain("Configuration");
    expect(allTexts).toContain("Plugins");
  });

  it("sorts by sidebarPosition (0-based)", () => {
    const routes: DocsRoute[] = [
      makeRoute("/docs/guide/plugins", "Plugins", {
        sidebarPosition: 2,
        relativePath: "guide/plugins.md",
      }),
      makeRoute("/docs/guide/config", "Configuration", {
        sidebarPosition: 0,
        relativePath: "guide/config.md",
      }),
      makeRoute("/docs/guide/intro", "Introduction", {
        sidebarPosition: 1,
        relativePath: "guide/intro.md",
      }),
    ];

    const items = generateSidebar(routes, "/docs/guide/");

    const flatItems = items.flatMap((item) => item.items || [item]);
    expect(flatItems[0].text).toBe("Configuration");
    expect(flatItems[1].text).toBe("Introduction");
    expect(flatItems[2].text).toBe("Plugins");
  });

  it("sorts by filename when some sidebar_position missing", () => {
    // config has position 0, but intro and plugins are missing position.
    // Rule: if any missing, ignore all positions and sort by filename.
    const routes: DocsRoute[] = [
      makeRoute("/docs/guide/plugins", "Plugins", {
        sidebarPosition: undefined,
        relativePath: "guide/plugins.md",
      }),
      makeRoute("/docs/guide/config", "Configuration", {
        sidebarPosition: 0,
        relativePath: "guide/config.md",
      }),
      makeRoute("/docs/guide/intro", "Introduction", {
        sidebarPosition: undefined,
        relativePath: "guide/intro.md",
      }),
    ];

    const items = generateSidebar(routes, "/docs/guide/");
    const flatItems = items.flatMap((item) => item.items || [item]);

    // Filename order: config, intro, plugins
    expect(flatItems[0].text).toBe("Configuration");
    expect(flatItems[1].text).toBe("Introduction");
    expect(flatItems[2].text).toBe("Plugins");
  });

  it("sorts by filename when all sidebar_position missing", () => {
    const routes: DocsRoute[] = [
      makeRoute("/docs/guide/zebra", "Zebra", {
        relativePath: "guide/zebra.md",
      }),
      makeRoute("/docs/guide/apple", "Apple", {
        relativePath: "guide/apple.md",
      }),
      makeRoute("/docs/guide/mango", "Mango", {
        relativePath: "guide/mango.md",
      }),
    ];

    const items = generateSidebar(routes, "/docs/guide/");
    const flatItems = items.flatMap((item) => item.items || [item]);

    // Filename order: apple, mango, zebra
    expect(flatItems[0].text).toBe("Apple");
    expect(flatItems[1].text).toBe("Mango");
    expect(flatItems[2].text).toBe("Zebra");
  });

  it("excludes virtual index routes from sidebar", () => {
    const routes: DocsRoute[] = [
      makeRoute("/docs/markdown", "Code Highlighting", {
        relativePath: "markdown/code-highlighting.md",
        isDirectoryIndex: true,
      }),
      makeRoute("/docs/markdown/code-highlighting", "Code Highlighting", {
        relativePath: "markdown/code-highlighting.md",
      }),
      makeRoute("/docs/markdown/containers", "Containers", {
        relativePath: "markdown/containers.md",
      }),
    ];

    const items = generateSidebar(routes, "/docs/markdown/");
    const flatItems = items.flatMap((item) => item.items || [item]);

    // Virtual index should not appear; only 2 real routes
    expect(flatItems.length).toBe(2);
    expect(flatItems.some((i) => i.link === "/docs/markdown")).toBe(false);
  });

  it("uses sidebarLabel when available", () => {
    const routes: DocsRoute[] = [
      makeRoute("/docs/guide/config", "Configuration", {
        sidebarLabel: "Config",
      }),
    ];

    const items = generateSidebar(routes, "/docs/guide/");
    const flatItems = items.flatMap((item) => item.items || [item]);
    expect(flatItems[0].text).toBe("Config");
  });

  it("groups by subdirectory", () => {
    const routes: DocsRoute[] = [
      makeRoute("/docs/guide/getting-started", "Getting Started"),
      makeRoute("/docs/guide/api/router", "Router API"),
      makeRoute("/docs/guide/api/state", "State API"),
    ];

    const items = generateSidebar(routes, "/docs/guide/");

    // Should have root items and an "Api" group
    const groups = items.filter((item) => item.items && item.items.length > 0);
    const rootItems = items.filter(
      (item) => !item.items || item.items.length === 0,
    );

    expect(rootItems.some((i) => i.text === "Getting Started")).toBe(true);
    expect(groups.some((g) => g.text === "Api")).toBe(true);
  });

  it("handles empty routes", () => {
    const items = generateSidebar([], "/docs/guide/");
    expect(items).toEqual([]);
  });

  it("handles no matching routes for prefix", () => {
    const routes: DocsRoute[] = [makeRoute("/docs/api/router", "Router")];

    const items = generateSidebar(routes, "/docs/guide/");
    expect(items).toEqual([]);
  });
});
