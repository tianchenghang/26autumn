import { describe, it, expect } from "vitest";
import { createParser } from "../src/markdown/parser";
import { renderToSwiftyTemplate } from "../src/markdown/renderer";

describe("renderToSwiftyTemplate", () => {
  it("renders tokens to HTML string", () => {
    const md = createParser();
    const tokens = md.parse("# Hello\n\nWorld", {});
    const html = renderToSwiftyTemplate(tokens, md);

    expect(html).toContain("<h1");
    expect(html).toContain("Hello");
    expect(html).toContain("<p>World</p>");
  });

  it("renders code blocks", () => {
    const md = createParser();
    const tokens = md.parse("```js\nconsole.log('hi');\n```", {});
    const html = renderToSwiftyTemplate(tokens, md);

    expect(html).toContain('class="language-js"');
    expect(html).toContain("console.log");
  });

  it("renders lists", () => {
    const md = createParser();
    const tokens = md.parse("- item 1\n- item 2\n- item 3", {});
    const html = renderToSwiftyTemplate(tokens, md);

    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item 1</li>");
    expect(html).toContain("<li>item 2</li>");
    expect(html).toContain("<li>item 3</li>");
  });

  it("renders tables", () => {
    const md = createParser();
    const tokens = md.parse("| A | B |\n|---|---|\n| 1 | 2 |", {});
    const html = renderToSwiftyTemplate(tokens, md);

    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders blockquotes", () => {
    const md = createParser();
    const tokens = md.parse("> This is a quote", {});
    const html = renderToSwiftyTemplate(tokens, md);

    expect(html).toContain("<blockquote>");
    expect(html).toContain("This is a quote");
  });
});
