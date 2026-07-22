import { describe, it } from "vitest";
import { compileTemplate, extractGlobalVars } from "../src/compiler";

describe("Comment placeholder spoofing investigation", () => {
  it("shows what happens with __swifty_comment_0__ in template", async () => {
    const source = "before __swifty_comment_0__ after";
    const result = await compileTemplate(source, { globalVars: [] });
    console.log("\n=== Source with __swifty_comment_0__ ===");
    console.log(result);
  });

  it("shows what happens with real comment", async () => {
    const source = "before <!-- real comment --> after";
    const result = await compileTemplate(source, { globalVars: [] });
    console.log("\n=== Source with real comment ===");
    console.log(result);
  });

  it("shows what happens with both", async () => {
    const source = "before <!-- real comment --> __swifty_comment_0__ after";
    const result = await compileTemplate(source, { globalVars: [] });
    console.log("\n=== Source with both ===");
    console.log(result);
  });

  it("shows extractGlobalVars result for destructuring", async () => {
    const source1 = "{{set {a, b} = obj}}{{=a}}{{=b}}";
    const vars1 = await extractGlobalVars(source1);
    console.log("\n=== Destructuring test 1: {a, b} = obj ===");
    console.log("Extracted vars:", vars1);

    const source2 = "{{set [a, b] = arr}}{{=a}}";
    const vars2 = await extractGlobalVars(source2);
    console.log("\n=== Destructuring test 2: [a, b] = arr ===");
    console.log("Extracted vars:", vars2);

    const source3 = "{{set fn = ({a, b}) => a + b}}{{=fn(obj)}}";
    const vars3 = await extractGlobalVars(source3);
    console.log("\n=== Destructuring test 3: arrow function params ===");
    console.log("Extracted vars:", vars3);
  });
});
