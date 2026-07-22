import { describe, it, expect } from "vitest";
import { compileMarkdown } from "../src/compile-markdown";
import type { DocsConfig } from "../src/types";

const baseConfig: DocsConfig = {
  docs: "docs",
  baseUrl: "/docs/",
  title: "Test",
};

const highlightConfig: DocsConfig = {
  ...baseConfig,
  highlight: {
    theme: "github-dark",
    languages: ["typescript", "javascript", "bash"],
  },
};

describe("compileMarkdown", () => {
  it("compiles basic markdown to a JS module", async () => {
    const source = "# Hello World\n\nThis is a test.";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/index.md",
    });

    expect(result).toContain("export const pageData");
    expect(result).toContain("export const contentHtml");
    expect(result).toContain("Hello World");
    expect(result).toContain("This is a test.");
  });

  it("extracts pageData from frontmatter", async () => {
    const source = `---
title: My Page
description: A test page
---

# My Page

Content here.
`;
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/guide/index.md",
    });

    expect(result).toContain('"title": "My Page"');
    expect(result).toContain('"description": "A test page"');
  });

  it("extracts headings into pageData", async () => {
    const source =
      "# Title\n\n## Section One\n\n### Subsection\n\n## Section Two";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/test.md",
    });

    expect(result).toContain('"headings"');
    expect(result).toContain('"Section One"');
    expect(result).toContain('"Subsection"');
    expect(result).toContain('"Section Two"');
  });

  it("infers title from first h1 when no frontmatter", async () => {
    const source = "# Inferred Title\n\nContent.";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/test.md",
    });

    expect(result).toContain('"title": "Inferred Title"');
  });

  it("derives title from filename when no h1 and no frontmatter", async () => {
    const source = "Just some content, no heading.";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/getting-started.md",
    });

    expect(result).toContain('"title": "Getting Started"');
  });

  it("derives title from parent directory for index.md", async () => {
    const source = "Content without heading.";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/guide/index.md",
    });

    expect(result).toContain('"title": "Guide"');
  });

  it("defaults description to derived title when frontmatter missing", async () => {
    const source = "# Getting Started\n\nContent.";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/getting-started.md",
    });

    // Description should default to derived title from filename
    expect(result).toContain('"description": "Getting Started"');
  });

  it("defaults description to directory name for index.md", async () => {
    const source = "# Guide\n\nContent.";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/guide/index.md",
    });

    expect(result).toContain('"description": "Guide"');
  });

  it("uses 'Home' for root index.md without heading or frontmatter", async () => {
    const source = "Content without heading.";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/index.md",
    });

    expect(result).toContain('"title": "Home"');
  });

  it("preserves template literal syntax in contentHtml", async () => {
    const source = "Use `${variable}` for template literals.";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/test.md",
    });

    // contentHtml is emitted as a JSON string literal, so ${...} is preserved
    // as-is — it is NOT interpreted as JS template interpolation.
    expect(result).toContain("${variable}");
  });

  it("renders code blocks without highlight config", async () => {
    const source = "```ts\nconst x: number = 42;\n```";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/test.md",
    });

    expect(result).toContain("const x");
    expect(result).toContain("42");
    // Without highlight config, output is plain escaped code
    expect(result).not.toContain("shiki");
  });

  it("renders syntax-highlighted code blocks with Shiki", async () => {
    const source = "```typescript\nconst x: number = 42;\n```";
    const result = await compileMarkdown(source, {
      config: highlightConfig,
      filePath: "docs/test.md",
    });

    // Shiki produces HTML with inline styles and per-token <span> elements
    expect(result).toContain("shiki");
    expect(result).toContain("style=");
    expect(result).toContain("github-dark");
    // Individual tokens are wrapped in colored spans
    expect(result).toContain(">const</span>");
    expect(result).toContain("> 42</span>");
    expect(result).toContain("> number</span>");
  });

  it("renders links with data-swifty-nav for internal links", async () => {
    const source = "[Guide](/guide/)";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/test.md",
    });

    expect(result).toContain("data-swifty-nav");
  });

  it("includes relative path in pageData", async () => {
    const source = "# Test";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/guide/config.md",
    });

    expect(result).toContain('"relativePath": "guide/config.md"');
  });

  it("strips docs prefix from relativePath for consistency with scanner", async () => {
    const source = "# Test";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/api/router.md",
    });

    // Should NOT contain the "docs/" prefix — consistent with
    // scanner.ts which uses path.relative(docsDir, fullPath)
    expect(result).not.toContain('"relativePath": "docs/');
    expect(result).toContain('"relativePath": "api/router.md"');
  });

  it("does not extract headings from fenced code blocks", async () => {
    const source =
      "# Title\n\n## Real Heading\n\n```markdown\n## Not A Heading\n```\n\n## Another Heading";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/test.md",
    });

    expect(result).toContain('"Real Heading"');
    expect(result).toContain('"Another Heading"');
    expect(result).not.toContain('"Not A Heading"');
  });

  it("does not extract title from fenced code blocks", async () => {
    const source =
      "```markdown\n# npm install\n```\n\n# Real Title\n\nContent.";
    const result = await compileMarkdown(source, {
      config: baseConfig,
      filePath: "docs/test.md",
    });

    expect(result).toContain('"title": "Real Title"');
    expect(result).not.toContain('"title": "npm install"');
  });
});
