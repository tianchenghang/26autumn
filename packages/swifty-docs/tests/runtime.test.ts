import { describe, it, expect } from "vitest";
import { slugify } from "../src/utils/slugify";

describe("slugify", () => {
  it("converts text to URL-safe slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces special characters with dashes", () => {
    expect(slugify("What's New?!")).toBe("what-s-new");
  });

  it("preserves CJK characters", () => {
    expect(slugify("路由导航")).toBe("路由导航");
    expect(slugify("Getting Started 入门")).toBe("getting-started-入门");
  });

  it("prefixes leading digits for CSS selector safety", () => {
    expect(slugify("123 Release")).toBe("_123-release");
    expect(slugify("v2.0 Changes")).toBe("v2-0-changes");
  });

  it("collapses multiple dashes", () => {
    expect(slugify("a -- b")).toBe("a-b");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles already-slugged text", () => {
    expect(slugify("already-slugged")).toBe("already-slugged");
  });

  it("trims leading dashes", () => {
    expect(slugify("-leading")).toBe("leading");
    expect(slugify("--leading")).toBe("leading");
  });

  it("trims trailing dashes", () => {
    expect(slugify("trailing-")).toBe("trailing");
    expect(slugify("trailing--")).toBe("trailing");
  });

  it("trims both leading and trailing dashes", () => {
    expect(slugify("-both-")).toBe("both");
    expect(slugify("-- -already- --")).toBe("already");
  });
});
