import { describe, it, expect } from "vitest";
import { extractFrontmatter } from "../src/markdown/frontmatter";

describe("extractFrontmatter", () => {
  it("extracts YAML frontmatter from markdown", () => {
    const source = `---
title: Hello World
description: A test page
sidebar_position: 1
---

# Hello World

Some content here.
`;
    const result = extractFrontmatter(source);

    expect(result.data["title"]).toBe("Hello World");
    expect(result.data["description"]).toBe("A test page");
    expect(result.data["sidebar_position"]).toBe(1);
    expect(result.content).toContain("# Hello World");
    expect(result.content).toContain("Some content here.");
  });

  it("returns empty data when no frontmatter present", () => {
    const source = "# Just a heading\n\nSome content.";
    const result = extractFrontmatter(source);

    expect(result.data).toEqual({});
    expect(result.content).toContain("# Just a heading");
  });

  it("handles empty source", () => {
    const result = extractFrontmatter("");
    expect(result.data).toEqual({});
    expect(result.content).toBe("");
  });

  it("extracts draft flag", () => {
    const source = `---
title: Draft Page
draft: true
---

Draft content.
`;
    const result = extractFrontmatter(source);
    expect(result.data["draft"]).toBe(true);
  });

  it("extracts sidebar_label and sidebar_group", () => {
    const source = `---
title: Config
sidebar_label: Configuration
sidebar_group: Guide
sidebar_position: 3
---

Content.
`;
    const result = extractFrontmatter(source);
    expect(result.data["sidebar_label"]).toBe("Configuration");
    expect(result.data["sidebar_group"]).toBe("Guide");
    expect(result.data["sidebar_position"]).toBe(3);
  });
});
