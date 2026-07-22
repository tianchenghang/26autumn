import { describe, it, expect } from "vitest";
import { compileTemplate } from "../src/compiler";
import { vdomCreate } from "../src/vdom";
import { V_TEXT_NODE, SPLITTER } from "../src/common";
import * as runtime from "../src/runtime";
import type { VDomNode } from "../src/types";

// ===== Helpers =====

/**
 * Compile a template in VDOM mode and execute it with the real vdomCreate
 * and real runtime helpers. Returns the root VDomNode.
 *
 * The compiled module uses ES module imports that cannot run directly in
 * Node, so we transform them to local references before evaluation via
 * new Function.
 */
async function compileAndRun(
  template: string,
  data: Record<string, unknown> = {},
  globalVars: string[] = [],
): Promise<VDomNode> {
  const moduleSource = await compileTemplate(template, {
    vdom: true,
    globalVars,
  });

  const transformed = moduleSource
    .replace(
      /import\s*\{[^}]*\}\s*from\s*["']@swifty\.js\/mvc["'];?\n?/,
      "const __swifty_vdom_create__ = __mvc.vdomCreate;\n",
    )
    .replace(
      /import\s*\{[^}]*\}\s*from\s*["']@swifty\.js\/mvc\/runtime["'];?\n?/,
      "const { strSafe: __swifty_str_safe__, refFn: __swifty_ref_fn__ } = __runtime;\n",
    )
    .replace("function __swifty_template__(", "return function(")
    .replace("\nexport default __swifty_template__;", "");

  const factory = new Function("__mvc", "__runtime", transformed);
  const templateFn = factory({ vdomCreate }, runtime);
  return templateFn(data, "test-view", null) as VDomNode;
}

/**
 * Get the compiled module source for string-level inspection.
 */
async function compileSource(
  template: string,
  options: { debug?: boolean; globalVars?: string[] } = {},
): Promise<string> {
  return compileTemplate(template, { vdom: true, ...options });
}

// ===== Tests =====

describe("VDOM Compiler", () => {
  // ===== A. Module output format =====
  describe("module output format", () => {
    it("imports vdomCreate from @swifty.js/mvc", async () => {
      const src = await compileSource("<div>hi</div>");
      expect(src).toContain(
        'import { vdomCreate as __swifty_vdom_create__ } from "@swifty.js/mvc"',
      );
    });

    it("imports runtime helpers from @swifty.js/mvc/runtime", async () => {
      const src = await compileSource("<div>hi</div>");
      expect(src).toContain("strSafe as __swifty_str_safe__");
      expect(src).toContain("refFn as __swifty_ref_fn__");
    });

    it("does NOT import encHtml (not needed for VDOM)", async () => {
      const src = await compileSource("<div>hi</div>");
      expect(src).not.toContain("encHtml");
    });

    it("exports default function with correct signature", async () => {
      const src = await compileSource("<div>hi</div>");
      expect(src).toContain(
        "function __swifty_template__(data, viewId, refData)",
      );
      expect(src).toContain("export default __swifty_template__");
    });

    it("inner function has 5 params (no encHtml/encUri/encQuote)", async () => {
      const src = await compileSource("<div>hi</div>");
      expect(src).toContain(
        "__swifty_data__,__swifty_view_id__,__swifty_ref_alt__,__swifty_str_safe__,__swifty_ref_fn__",
      );
    });

    it("includes globalVars destructuring", async () => {
      const src = await compileSource("<div>{{=title}}</div>", {
        globalVars: ["title", "count"],
      });
      expect(src).toContain(
        "let title=__swifty_data__.title;let count=__swifty_data__.count;",
      );
    });
  });

  // ===== B. Basic element compilation =====
  describe("basic elements", () => {
    it("compiles a simple div with text", async () => {
      const root = await compileAndRun("<div>hello</div>");
      expect(root.tag).toBe("test-view");
    });

    it("compiles nested elements", async () => {
      const root = await compileAndRun("<div><span>text</span></div>");
      expect(root.tag).toBe("test-view");
    });

    it("compiles element with static attributes", async () => {
      const root = await compileAndRun(
        '<div class="container" id="main">content</div>',
      );
      expect(root).toBeDefined();
    });

    it("compiles self-closing elements", async () => {
      const src = await compileSource("<div><br/><hr/></div>");
      expect(src).toMatch(/__swifty_vdom_create__\('br',\w+,1\)/);
      expect(src).toMatch(/__swifty_vdom_create__\('hr',\w+,1\)/);
    });

    it("compiles multiple sibling elements", async () => {
      const root = await compileAndRun("<p>first</p><p>second</p>");
      expect(root.tag).toBe("test-view");
    });

    // Regression: previously a fixed maxVars=30 caused every element past
    // the 30th to alias the last variable (__swifty_vdom29__). That produced
    // self-referential children arrays (span.children === arr, then
    // arr.push(span)) and silently dropped earlier siblings, leading to
    // duplicated/missing output. With >30 elements all content must survive.
    it("renders all siblings when template exceeds 30 elements", async () => {
      const spans = Array.from(
        { length: 35 },
        (_, i) => `<span>item${i}</span>`,
      ).join("");
      const root = await compileAndRun(
        `<div class="container">${spans}</div>`,
        {},
        [],
      );

      const texts: string[] = [];
      function walk(node: VDomNode) {
        if (node.tag === V_TEXT_NODE) {
          texts.push(node.html);
          return;
        }
        if (Array.isArray(node.children)) {
          for (const child of node.children) walk(child);
        }
      }
      walk(root);

      // Every item must appear exactly once — no losses, no duplicates.
      expect(texts).toHaveLength(35);
      for (let i = 0; i < 35; i++) {
        expect(texts[i]).toBe(`item${i}`);
      }
    });
  });

  // ===== C. Expression handling =====
  describe("expressions", () => {
    it("compiles {{=expr}} as text node", async () => {
      const src = await compileSource("<div>{{=name}}</div>", {
        globalVars: ["name"],
      });
      expect(src).toContain(
        "__swifty_vdom_create__(0,__swifty_str_safe__(name))",
      );
    });

    it("compiles {{!expr}} as SPLITTER raw HTML node (not V_TEXT_NODE)", async () => {
      // {{!}} must produce a SPLITTER-tagged raw HTML node by passing `1`
      // as the children argument: `__swifty_vdom_create__(0, __swifty_str_safe__(expr), 1)`.
      // If it omitted the `1` (as before the fix), vdomCreate would return a
      // V_TEXT_NODE whose html gets HTML-encoded when serialized into the
      // parent's innerHTML — breaking raw HTML semantics in VDOM mode.
      const src = await compileSource("<div>{{!rawContent}}</div>", {
        globalVars: ["rawContent"],
      });
      expect(src).toContain(
        "__swifty_vdom_create__(0,__swifty_str_safe__(rawContent),1)",
      );
    });

    it("compiles {{@expr}} as ref lookup", async () => {
      const src = await compileSource("<div>{{@objRef}}</div>", {
        globalVars: ["objRef"],
      });
      expect(src).toContain("__swifty_ref_fn__(__swifty_ref_alt__,objRef)");
    });

    it("compiles expression in attribute value", async () => {
      const src = await compileSource('<div id="item-{{=item.id}}"></div>', {
        globalVars: ["item"],
      });
      expect(src).toContain("item");
    });

    it("compiles expression as full attribute value", async () => {
      const src = await compileSource('<span class="{{=cls}}"></span>', {
        globalVars: ["cls"],
      });
      expect(src).toContain("__swifty_str_safe__(cls)");
    });
  });

  // ===== D. Control flow =====
  describe("control flow", () => {
    it("compiles {{if}}...{{/if}}", async () => {
      const src = await compileSource(
        "<div>{{if show}}<span>visible</span>{{/if}}</div>",
        {
          globalVars: ["show"],
        },
      );
      expect(src).toContain("if(show)");
      expect(src).toContain("visible");
    });

    it("compiles {{if}}...{{else}}...{{/if}}", async () => {
      const src = await compileSource(
        "<div>{{if a}}<p>yes</p>{{else}}<p>no</p>{{/if}}</div>",
        {
          globalVars: ["a"],
        },
      );
      expect(src).toContain("if(a)");
      expect(src).toContain("}else{");
    });

    it("compiles {{forOf}} loop", async () => {
      const src = await compileSource(
        "<ul>{{forOf items as item idx}}<li>{{=item}}</li>{{/forOf}}</ul>",
        { globalVars: ["items"] },
      );
      expect(src).toContain("for(let");
      expect(src).toContain("idx");
    });

    it("compiles nested control flow", async () => {
      const src = await compileSource(
        `<div>{{forOf list as item}}<span>{{if item.active}}on{{else}}off{{/if}}</span>{{/forOf}}</div>`,
        { globalVars: ["list"] },
      );
      expect(src).toContain("for(let");
      expect(src).toContain("if(item.active)");
    });

    it("compiles {{set}} variable declaration", async () => {
      const src = await compileSource(
        "<div>{{set x = 42}}<span>{{=x}}</span></div>",
        {
          globalVars: [],
        },
      );
      expect(src).toContain("let x = 42");
    });
  });

  // ===== D2. Control flow inside attribute values (IIFE path) =====
  //
  // When {{if}}/{{else}}/{{/if}} (or {{forOf}} etc.) appear inside an HTML
  // attribute value, the compiled code-block entries are JS statements
  // (e.g. "if(width){", "}else{", "}") that cannot be wrapped in
  // __swifty_str_safe__(). The compiler must detect this and generate an IIFE that
  // builds and returns the attribute string via statement-based accumulation.
  describe("control flow in attributes", () => {
    it("compiles {{if}} inside attribute value as IIFE (not __swifty_str_safe__(if())", async () => {
      const src = await compileSource(
        '<div class="base {{if show}}extra{{/if}}">x</div>',
        {
          globalVars: ["show"],
        },
      );
      // Must NOT produce the buggy __swifty_str_safe__(if(...)) wrapping
      expect(src).not.toContain("__swifty_str_safe__(if(");
      // Must produce an IIFE that accumulates into _s
      expect(src).toContain("(()=>{let _s=''");
      expect(src).toContain("if(show)");
    });

    it("compiles {{if}}...{{else}}...{{/if}} inside attribute value", async () => {
      const src = await compileSource(
        '<div style="{{if w}}width:{{=w}}px;{{else}}width:100%;{{/if}}">x</div>',
        { globalVars: ["w"] },
      );
      expect(src).not.toContain("__swifty_str_safe__(if(");
      expect(src).not.toContain("__swifty_str_safe__(}else{)");
      expect(src).not.toContain("__swifty_str_safe__(})");
      expect(src).toContain("if(w)");
      expect(src).toContain("}else{");
    });

    it("compiles {{if}} with || operator inside attribute value", async () => {
      const src = await compileSource(
        '<a class="base {{if disabled || loading}}opacity-50{{/if}}">x</a>',
        { globalVars: ["disabled", "loading"] },
      );
      expect(src).not.toContain("__swifty_str_safe__(if(");
      expect(src).toContain("if(disabled || loading)");
    });

    it("compiles forOf inside attribute value as IIFE", async () => {
      const src = await compileSource(
        '<div class="{{forOf items as item}}{{=item}} {{/forOf}}">x</div>',
        { globalVars: ["items"] },
      );
      expect(src).not.toContain("__swifty_str_safe__(for(");
      expect(src).toContain("(()=>{let _s=''");
      expect(src).toContain("for(let");
    });

    it("renders {{if}} in attribute — true branch", async () => {
      const root = await compileAndRun(
        '<div class="base {{if show}}visible{{/if}}">x</div>',
        { show: true },
        ["show"],
      );
      expect(root.html).toContain('class="base visible"');
    });

    it("renders {{if}} in attribute — false branch", async () => {
      const root = await compileAndRun(
        '<div class="base {{if show}}visible{{/if}}">x</div>',
        { show: false },
        ["show"],
      );
      // When show is false, the if-block yields nothing, so class is
      // "base " (with trailing space from the literal text before {{if}}).
      expect(root.html).toContain('class="base "');
      expect(root.html).not.toContain("visible");
    });

    it("renders {{if}}...{{else}} in style attribute — true branch", async () => {
      const root = await compileAndRun(
        '<div style="{{if w}}width:{{=w}}px;{{else}}width:100%;{{/if}}">x</div>',
        { w: 200 },
        ["w"],
      );
      expect(root.html).toContain('style="width:200px;"');
    });

    it("renders {{if}}...{{else}} in style attribute — false branch", async () => {
      const root = await compileAndRun(
        '<div style="{{if w}}width:{{=w}}px;{{else}}width:100%;{{/if}}">x</div>',
        { w: 0 },
        ["w"],
      );
      expect(root.html).toContain('style="width:100%;"');
    });

    it("renders forOf in attribute value", async () => {
      const root = await compileAndRun(
        '<div class="{{forOf items as item}}{{=item}} {{/forOf}}">x</div>',
        { items: ["a", "b"] },
        ["items"],
      );
      expect(root.html).toContain('class="a b "');
    });

    it("renders mixed expression + if in attribute (btn-style)", async () => {
      // Mirrors the real btn component template: expression + if/else
      // concatenated in a single style attribute.
      const root = await compileAndRun(
        '<div style="{{=base}}; {{if w}}width:{{=w}}px;{{else}}width:100%;{{/if}}">x</div>',
        { base: "display:block", w: 50 },
        ["base", "w"],
      );
      expect(root.html).toContain('style="display:block; width:50px;"');
    });
  });

  // ===== E. Execution tests (compile + run with real vdomCreate) =====
  describe("execution", () => {
    it("renders static HTML to VDomNode tree", async () => {
      const root = await compileAndRun("<div>hello</div>");
      expect(root.tag).toBe("test-view");
      expect(root.html).toBe("<div>hello</div>");
      expect(root.children).toHaveLength(1);
      const divChild = root.children![0] as VDomNode;
      expect(divChild.tag).toBe("div");
      expect(divChild.html).toBe("hello");
    });

    it("renders dynamic text from data", async () => {
      const root = await compileAndRun(
        "<p>{{=message}}</p>",
        { message: "Hello World" },
        ["message"],
      );
      expect(root.tag).toBe("test-view");
      expect(root.html).toContain("Hello World");
      const pChild = root.children![0] as VDomNode;
      expect(pChild.tag).toBe("p");
      const textNode = pChild.children![0] as VDomNode;
      expect(textNode.tag).toBe(V_TEXT_NODE);
      expect(textNode.html).toBe("Hello World");
    });

    it("escapes HTML entities in {{=}} text output", async () => {
      const root = await compileAndRun(
        "<div>{{=content}}</div>",
        { content: "<script>alert(1)</script>" },
        ["content"],
      );
      // The text node stores the raw string value; encoding happens when
      // the parent element serializes its innerHTML (via encodeHTML).
      const textNode = root.children![0]!.children![0] as VDomNode;
      expect(textNode.tag).toBe(V_TEXT_NODE);
      expect(textNode.html).toBe("<script>alert(1)</script>");
      // The parent div's serialized html must contain the encoded form.
      const div = root.children![0] as VDomNode;
      expect(div.html).toContain("&lt;script&gt;");
      expect(div.html).not.toContain("<script>");
    });

    it("renders forOf loop with correct children count", async () => {
      const root = await compileAndRun(
        "<ul>{{forOf items as item}}<li>{{=item}}</li>{{/forOf}}</ul>",
        { items: ["a", "b", "c"] },
        ["items"],
      );
      expect(root.tag).toBe("test-view");
      const ul = root.children![0] as VDomNode;
      expect(ul.tag).toBe("ul");
      expect(ul.children).toHaveLength(3);
      for (const li of ul.children!) {
        expect((li as VDomNode).tag).toBe("li");
      }
      expect((ul.children![0] as VDomNode).html).toContain("a");
      expect((ul.children![2] as VDomNode).html).toContain("c");
    });

    it("renders if/else -- true branch", async () => {
      const root = await compileAndRun(
        "<div>{{if show}}<span class='yes'>visible</span>{{else}}<span class='no'>hidden</span>{{/if}}</div>",
        { show: true },
        ["show"],
      );
      expect(root.html).toContain("visible");
      expect(root.html).not.toContain("hidden");
      expect(root.html).toContain('class="yes"');
    });

    it("renders if/else -- false branch", async () => {
      const root = await compileAndRun(
        "<div>{{if show}}<span class='yes'>visible</span>{{else}}<span class='no'>hidden</span>{{/if}}</div>",
        { show: false },
        ["show"],
      );
      expect(root.html).toContain("hidden");
      expect(root.html).not.toContain("visible");
      expect(root.html).toContain('class="no"');
    });

    it("handles empty template", async () => {
      const root = await compileAndRun("");
      expect(root.tag).toBe("test-view");
      expect(root.html).toBe("");
    });

    it("handles template with only text", async () => {
      const root = await compileAndRun("just text");
      expect(root.tag).toBe("test-view");
      expect(root.html).toBe("just text");
      expect(root.children).toHaveLength(1);
      expect((root.children![0] as VDomNode).tag).toBe(V_TEXT_NODE);
      expect((root.children![0] as VDomNode).html).toBe("just text");
    });

    it("renders null/undefined as empty string in {{=}}", async () => {
      const root = await compileAndRun("<p>{{=val}}</p>", { val: null }, [
        "val",
      ]);
      const p = root.children![0] as VDomNode;
      const textNode = p.children![0] as VDomNode;
      expect(textNode.html).toBe("");
    });

    it("renders nested loops correctly", async () => {
      const root = await compileAndRun(
        "<div>{{forOf rows as row}}{{forOf row as cell}}<span>{{=cell}}</span>{{/forOf}}{{/forOf}}</div>",
        {
          rows: [
            [1, 2],
            [3, 4],
          ],
        },
        ["rows"],
      );
      expect(root.html).toContain("1");
      expect(root.html).toContain("4");
      const div = root.children![0] as VDomNode;
      expect(div.children!.length).toBe(4);
    });

    it("renders {{!expr}} as raw HTML (not escaped) in VDOM mode", async () => {
      // Regression test for the compiler + vdomCreateNode coupling bug:
      // {{!}} must produce a SPLITTER-tagged raw HTML node (via
      // __swifty_vdom_create__(0, __swifty_str_safe__(expr), 1)) whose html is NOT HTML-encoded
      // when serialized into the parent's innerHTML.
      //
      // Before the fix, {{!}} produced a V_TEXT_NODE whose html was
      // escaped via encodeHTML, so <b>bold</b> became &lt;b&gt;bold&lt;/b&gt;.
      const root = await compileAndRun(
        "<div>{{!rawHtml}}</div>",
        { rawHtml: "<b>bold</b>" },
        ["rawHtml"],
      );
      const div = root.children![0] as VDomNode;
      const rawNode = div.children![0] as VDomNode;

      // The raw HTML node must be a SPLITTER node, not a V_TEXT_NODE
      expect(rawNode.tag).toBe(SPLITTER);
      expect(rawNode.tag).not.toBe(V_TEXT_NODE);

      // The html field holds the raw HTML string unmodified
      expect(rawNode.html).toBe("<b>bold</b>");

      // Critical: the parent div's serialized innerHTML must contain the
      // raw <b> tag (NOT the HTML-encoded &lt;b&gt; form). This is what
      // distinguishes {{!}} (raw) from {{=}} (escaped).
      expect(div.html).toContain("<b>bold</b>");
      expect(div.html).not.toContain("&lt;b&gt;");
    });

    it("renders {{!}} and {{=}} with correct escape semantics side by side", async () => {
      // Ensures both operators coexist correctly: {{=}} escapes, {{!}} doesn't.
      const root = await compileAndRun(
        "<div>{{=escaped}}{{!raw}}</div>",
        { escaped: "<i>x</i>", raw: "<b>y</b>" },
        ["escaped", "raw"],
      );
      const div = root.children![0] as VDomNode;

      // {{=escaped}} → V_TEXT_NODE, HTML-encoded in parent innerHTML
      const escapedNode = div.children![0] as VDomNode;
      expect(escapedNode.tag).toBe(V_TEXT_NODE);

      // {{!raw}} → SPLITTER, raw HTML preserved
      const rawNode = div.children![1] as VDomNode;
      expect(rawNode.tag).toBe(SPLITTER);
      expect(rawNode.html).toBe("<b>y</b>");

      // Parent innerHTML contains escaped form for {{=}} and raw form for {{!}}
      expect(div.html).toContain("&lt;i&gt;x&lt;/i&gt;");
      expect(div.html).toContain("<b>y</b>");
    });
  });

  // ===== F. String mode regression =====
  describe("string mode (regression)", () => {
    it("still generates HTML string output when vdom is false", async () => {
      const src = await compileTemplate("<div>{{=name}}</div>", {
        globalVars: ["name"],
      });
      expect(src).toContain("encHtml");
      expect(src).not.toContain("vdomCreate");
      expect(src).toContain("__swifty_out__");
    });

    it("still generates HTML string when vdom is not specified", async () => {
      const src = await compileTemplate("<p>hello</p>");
      expect(src).toContain("encHtml");
      expect(src).not.toContain("vdomCreate");
    });
  });

  // ===== G. Edge cases =====
  describe("edge cases", () => {
    it("handles whitespace-only text nodes", async () => {
      const root = await compileAndRun("<div>   </div>");
      // Whitespace may or may not be trimmed by the compiler.
      // If it produces a text node, verify the structure is valid.
      expect(root.tag).toBe("test-view");
      const div = root.children![0] as VDomNode;
      expect(div.tag).toBe("div");
    });

    it("renders {{set}} and uses the declared variable", async () => {
      const root = await compileAndRun(
        "<div>{{set x = 42}}<span>{{=x}}</span></div>",
        {},
        [],
      );
      expect(root.html).toContain("42");
    });

    it("renders forOf with index variable", async () => {
      const root = await compileAndRun(
        "<ul>{{forOf items as item idx}}<li>{{=idx}}:{{=item}}</li>{{/forOf}}</ul>",
        { items: ["x", "y"] },
        ["items"],
      );
      expect(root.html).toContain("0");
      expect(root.html).toContain("x");
      expect(root.html).toContain("1");
      expect(root.html).toContain("y");
      const ul = root.children![0] as VDomNode;
      expect(ul.children).toHaveLength(2);
    });

    it("renders multiple root-level siblings", async () => {
      const root = await compileAndRun("<p>first</p><p>second</p>");
      expect(root.children).toHaveLength(2);
      expect((root.children![0] as VDomNode).tag).toBe("p");
      expect((root.children![1] as VDomNode).tag).toBe("p");
      expect(root.html).toContain("first");
      expect(root.html).toContain("second");
    });

    it("renders void elements (input) as self-closing", async () => {
      const root = await compileAndRun('<div><input type="text"/></div>');
      const div = root.children![0] as VDomNode;
      expect(div.children).toHaveLength(1);
      const input = div.children![0] as VDomNode;
      expect(input.tag).toBe("input");
      expect(input.selfClose).toBe(true);
    });
  });
});
