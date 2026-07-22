import { describe, it, expect } from "vitest";
import { compileTemplate, extractGlobalVars } from "../src/compiler";
import * as runtime from "../src/runtime";

/**
 * Helper: compile + execute a template, returning the rendered string.
 *
 * The compiled module is an ES module that `import`s from `@swifty.js/mvc/runtime`.
 * `new Function` cannot evaluate `import` statements, so we strip the import
 * line and inject the runtime helpers as locals instead.
 */
async function render(
  source: string,
  data: Record<string, unknown> = {},
  options?: { debug?: boolean; file?: string },
): Promise<string> {
  const globalVars = await extractGlobalVars(source);
  const moduleCode = await compileTemplate(source, { ...options, globalVars });

  // Replace the static `import { ... } from "@swifty.js/mvc/runtime"` with a
  // destructuring `const`, then turn the `export default function` into a
  // `return function` so `new Function` produces the template.
  const transformed = moduleCode
    .replace(
      /import\s*\{[\s\S]*?\}\s*from\s*["']@swifty\.js\/mvc\/runtime["'];?/,
      "const { encHtml: __swifty_enc_html__, strSafe: __swifty_str_safe__, encUri: __swifty_enc_uri__, encQuote: __swifty_enc_quote__, refFn: __swifty_ref_fn__ } = __runtime;",
    )
    .replace("function __swifty_template__(", "return function(")
    .replace("\nexport default __swifty_template__;", "");

  const fn = new Function("__runtime", transformed)(runtime);
  return fn(data, "testViewId", null);
}

describe("compileTemplate", () => {
  describe("{{=}} escaped output", () => {
    it("outputs variable value", async () => {
      const result = await render("{{=name}}", { name: "hello" });
      expect(result).toBe("hello");
    });

    it("escapes HTML entities", async () => {
      const result = await render("{{=html}}", { html: "<b>bold</b>" });
      expect(result).toBe("&lt;b&gt;bold&lt;/b&gt;");
    });

    it("null/undefined converted to empty string", async () => {
      const result1 = await render("{{=val}}", { val: null });
      expect(result1).toBe("");

      const result2 = await render("{{=val}}", { val: undefined });
      expect(result2).toBe("");
    });
  });

  describe("{{!}} raw output", () => {
    it("outputs without escaping", async () => {
      const result = await render("{{!rawHtml}}", { rawHtml: "<b>bold</b>" });
      expect(result).toBe("<b>bold</b>");
    });
  });

  describe("{{forOf}} loop", () => {
    it("basic array iteration", async () => {
      const result = await render(
        "{{forOf list as item}}<span>{{=item}}</span>{{/forOf}}",
        {
          list: ["a", "b", "c"],
        },
      );
      expect(result).toContain("<span>a</span>");
      expect(result).toContain("<span>b</span>");
      expect(result).toContain("<span>c</span>");
    });

    it("array iteration with index", async () => {
      const result = await render(
        "{{forOf list as item idx}}[{{=idx}}:{{=item}}]{{/forOf}}",
        {
          list: ["x", "y"],
        },
      );
      expect(result).toContain("[0:x]");
      expect(result).toContain("[1:y]");
    });

    it("nested loops", async () => {
      const result = await render(
        "{{forOf outer as o}}{{forOf o as v}}{{=v}}{{/forOf}}{{/forOf}}",
        {
          outer: [
            [1, 2],
            [3, 4],
          ],
        },
      );
      expect(result).toContain("1");
      expect(result).toContain("2");
      expect(result).toContain("3");
      expect(result).toContain("4");
    });
  });

  describe("{{if}} / {{else}} / {{else if}} conditionals", () => {
    it("if condition is true", async () => {
      const result = await render("{{if show}}visible{{/if}}", { show: true });
      expect(result).toBe("visible");
    });

    it("if condition is false", async () => {
      const result = await render("{{if show}}visible{{/if}}", { show: false });
      expect(result).toBe("");
    });

    it("if / else", async () => {
      const result = await render("{{if active}}on{{else}}off{{/if}}", {
        active: false,
      });
      expect(result).toBe("off");
    });

    it("if / else if / else", async () => {
      const result1 = await render(
        "{{if level > 2}}high{{else if level > 0}}mid{{else}}low{{/if}}",
        {
          level: 3,
        },
      );
      expect(result1).toBe("high");

      const result2 = await render(
        "{{if level > 2}}high{{else if level > 0}}mid{{else}}low{{/if}}",
        {
          level: 1,
        },
      );
      expect(result2).toBe("mid");

      const result3 = await render(
        "{{if level > 2}}high{{else if level > 0}}mid{{else}}low{{/if}}",
        {
          level: 0,
        },
      );
      expect(result3).toBe("low");
    });

    it("complex conditional expressions", async () => {
      const result = await render("{{if a && b || c}}yes{{/if}}", {
        a: true,
        b: false,
        c: true,
      });
      expect(result).toBe("yes");
    });
  });

  describe("{{forIn}} object iteration", () => {
    it("iterates over object properties", async () => {
      const result = await render(
        "{{forIn obj as val key}}[{{=key}}:{{=val}}]{{/forIn}}",
        {
          obj: { x: 1, y: 2 },
        },
      );
      expect(result).toContain("[x:1]");
      expect(result).toContain("[y:2]");
    });
  });

  describe("{{for}} for loop", () => {
    it("standard for loop", async () => {
      const result = await render("{{for(let i=0;i<3;i++)}}{{=i}}{{/for}}", {});
      expect(result).toContain("0");
      expect(result).toContain("1");
      expect(result).toContain("2");
    });
  });

  describe("{{set}} variable declaration", () => {
    it("declares variables and uses them", async () => {
      const result = await render("{{set a=20,b=30}}{{=a}}-{{=b}}", {});
      expect(result).toBe("20-30");
    });
  });

  describe("@event attribute handling", () => {
    it("@click event binding", async () => {
      const result = await render(
        '<div @click="handlerName()">click</div>',
        {},
      );
      // @event attribute should include viewId prefix
      expect(result).toContain("@click=");
      expect(result).toContain("handlerName()");
    });

    it("@click with arguments", async () => {
      const result = await render(
        "<div @click=\"handlerName({key: 'value'})\">click</div>",
        {},
      );
      expect(result).toContain("@click=");
      expect(result).toContain("handlerName(");
    });
  });

  describe("HTML comment protection", () => {
    it("template syntax inside comments is not transformed", async () => {
      const result = await render(
        "<!-- {{=shouldNotRender}} --><p>{{=text}}</p>",
        {
          text: "visible",
          shouldNotRender: "hidden",
        },
      );
      expect(result).toContain("visible");
      // Comment content should remain unchanged
      expect(result).toContain("shouldNotRender");
    });
  });

  describe("viewId injection", () => {
    it("\\x1f placeholder in template replaced with viewId", async () => {
      const result = await render('<div @click="handler()">text</div>', {});
      // viewId "testViewId" should appear in output
      expect(result).toContain("testViewId");
    });
  });

  describe("debug mode", () => {
    it("compiles successfully in debug mode", async () => {
      const moduleCode = await compileTemplate("{{=name}}", { debug: true });
      expect(moduleCode).toContain("function __swifty_template__");
      expect(moduleCode).toContain("export default __swifty_template__");
    });
  });

  describe("error handling", () => {
    it("unclosed block throws error", async () => {
      await expect(() => {
        return compileTemplate("{{if true}}never closed");
      }).rejects.toThrow();
    });

    it("mismatched block closing throws error", async () => {
      await expect(() => {
        return compileTemplate("{{if true}}text{{/forOf}}");
      }).rejects.toThrow();
    });

    it("excess block closing throws error", async () => {
      await expect(() => {
        return compileTemplate("{{/if}}");
      }).rejects.toThrow();
    });
  });

  describe("miscellaneous", () => {
    it("pure HTML output as-is", async () => {
      const result = await render("<div>hello</div>");
      expect(result).toBe("<div>hello</div>");
    });

    it("empty template outputs empty string", async () => {
      const result = await render("");
      expect(result).toBe("");
    });

    it("function call output", async () => {
      // `fn` as a CallExpression callee is excluded by extractGlobalVars,
      // so the test passes globalVars manually.
      const moduleCode = await compileTemplate("{{=fn(a,b,c)}}", {
        globalVars: ["fn", "a", "b", "c"],
      });
      const transformed = moduleCode
        .replace(
          /import\s*\{[\s\S]*?\}\s*from\s*["']@swifty\.js\/mvc\/runtime["'];?/,
          "const { encHtml: __swifty_enc_html__, strSafe: __swifty_str_safe__, encUri: __swifty_enc_uri__, encQuote: __swifty_enc_quote__, refFn: __swifty_ref_fn__ } = __runtime;",
        )
        .replace("function __swifty_template__(", "return function(")
        .replace("\nexport default __swifty_template__;", "");
      const fn = new Function("__runtime", transformed)(runtime);
      const result = fn(
        {
          fn: (a: number, b: number, c: number) => a + b + c,
          a: 1,
          b: 2,
          c: 3,
        },
        "testViewId",
        null,
      );
      expect(result).toBe("6");
    });
  });
});

describe("extractGlobalVars", () => {
  it("extracts global variables used in template", async () => {
    const vars = await extractGlobalVars("{{=name}}-{{=age}}");
    expect(vars).toContain("name");
    expect(vars).toContain("age");
  });

  it("extracts variables from each loop", async () => {
    const vars = await extractGlobalVars(
      "{{forOf list as item}}{{=item}}{{/forOf}}",
    );
    expect(vars).toContain("list");
  });

  it("extracts variables from if condition", async () => {
    const vars = await extractGlobalVars("{{if visible}}show{{/if}}");
    expect(vars).toContain("visible");
  });

  it("does not extract built-in global variables", async () => {
    const vars = await extractGlobalVars("{{=Math.round(val)}}");
    // Math is built-in global, should not be extracted
    expect(vars).not.toContain("Math");
    expect(vars).toContain("val");
  });

  it("does not extract local variables declared in {{set}}", async () => {
    const vars = await extractGlobalVars("{{set localVar=10}}{{=localVar}}");
    // localVar is a local variable, should not be extracted
    expect(vars).not.toContain("localVar");
  });

  it("empty template returns empty array", async () => {
    const vars = await extractGlobalVars("<div>plain html</div>");
    expect(vars).toEqual([]);
  });
});
