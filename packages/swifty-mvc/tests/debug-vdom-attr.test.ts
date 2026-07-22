import { describe, it, expect } from "vitest";
import { compileTemplate, extractGlobalVars } from "../src/compiler";
import { vdomCreate } from "../src/vdom";
import * as runtime from "../src/runtime";

describe("VDOM Attribute XSS Investigation", () => {
  it("check what vdomCreate does with attributes", async () => {
    const source = '<div class="{{=xss}}">x</div>';
    const globalVars = await extractGlobalVars(source);
    const moduleCode = await compileTemplate(source, {
      vdom: true,
      globalVars,
    });

    console.log("\n=== Compiled module code ===");
    console.log(moduleCode);

    // Transform and execute
    const transformed = moduleCode
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

    console.log("\n=== Transformed code ===");
    console.log(transformed);

    const factory = new Function("__mvc", "__runtime", transformed);
    const templateFn = factory({ vdomCreate }, runtime);
    const result = templateFn(
      { xss: '"><script>alert(1)</script>' },
      "test-view",
      null,
    );

    console.log("\n=== Result ===");
    console.log("Full result:", JSON.stringify(result, null, 2));

    const div = result.children[0];
    console.log("\n=== Div details ===");
    console.log("Div tag:", div.tag);
    console.log("Div attrsMap:", div.attrsMap);
    console.log("Div html:", div.html);
    console.log("Div attrs:", div.attrs);

    // Check if the attribute value is escaped
    const classValue = div.attrsMap.class;
    console.log("\n=== Class attribute value ===");
    console.log("Type:", typeof classValue);
    console.log("Value:", classValue);
    console.log("Contains <script>?", classValue.includes("<script>"));
    console.log(
      "Contains &lt;script&gt;?",
      classValue.includes("&lt;script&gt;"),
    );

    expect(div).toBeDefined();
  });
});
