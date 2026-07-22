import { describe, it, expect } from "vitest";
import { createParser } from "../src/markdown/parser";

describe("createParser", () => {
  it("creates a markdown-it instance", () => {
    const md = createParser();
    expect(md).toBeDefined();
    expect(typeof md.render).toBe("function");
    expect(typeof md.parse).toBe("function");
  });

  it("renders basic markdown to HTML", () => {
    const md = createParser();
    const html = md.render("# Hello\n\nParagraph text.");

    expect(html).toContain("<h1");
    expect(html).toContain("Hello");
    expect(html).toContain("<p>Paragraph text.</p>");
  });

  it("adds scroll offset class to headings", () => {
    const md = createParser();
    const html = md.render("## Section Title");

    expect(html).toContain('class="scroll-mt-20"');
    expect(html).toContain("Section Title");
  });

  it("adds anchor IDs to headings", () => {
    const md = createParser({ anchor: { permalink: false } });
    const html = md.render("## My Section");

    expect(html).toContain('id="my-section"');
  });

  it("adds permalink anchors for h2/h3", () => {
    const md = createParser({ anchor: { permalink: true } });
    const html = md.render("## Linked Heading");

    expect(html).toContain('class="link link-hover');
    expect(html).toContain('href="#linked-heading"');
  });

  it("marks internal links with data-swifty-nav", () => {
    const md = createParser();
    const html = md.render("[Guide](/guide/)");

    expect(html).toContain('data-swifty-nav="true"');
    expect(html).toContain('href="/guide/"');
  });

  it("marks external links with target=_blank", () => {
    const md = createParser();
    const html = md.render("[GitHub](https://github.com)");

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renders code blocks with language class", () => {
    const md = createParser();
    const html = md.render("```ts\nconst x = 1;\n```");

    expect(html).toContain('class="language-ts"');
    expect(html).toContain("const x = 1;");
  });

  it("handles HTML passthrough", () => {
    const md = createParser();
    const html = md.render('<div class="custom">Hello</div>');

    expect(html).toContain('<div class="custom">Hello</div>');
  });

  it("auto-detects URLs (linkify)", () => {
    const md = createParser();
    const html = md.render("Visit https://example.com for details.");

    expect(html).toContain('href="https://example.com"');
  });
});
