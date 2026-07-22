import { describe, it, expect, beforeEach } from "vitest";
import {
  getViewClass,
  registerViewClass,
  invalidateViewClass,
  getViewClassRegistry,
} from "../src/view-registry";
import { defineView } from "../src/view";

describe("view-registry", () => {
  beforeEach(() => {
    // Wipe registry between tests
    const reg = getViewClassRegistry();
    for (const key of Object.keys(reg)) {
      invalidateViewClass(key);
    }
  });

  it("registers and looks up a view class by path", () => {
    const A = defineView(() => ({ template: () => "" }));
    registerViewClass("foo/a", A);
    expect(getViewClass("foo/a")).toBe(A);
  });

  it("strips query parameters from the view path", () => {
    const B = defineView(() => ({ template: () => "" }));
    registerViewClass("bar/b?x=1", B);
    // Lookup uses path only — the query was stripped on register.
    expect(getViewClass("bar/b")).toBe(B);
    expect(getViewClass("bar/b?x=1")).toBeUndefined();
  });

  it("ignores empty path on registration", () => {
    const C = defineView(() => ({ template: () => "" }));
    registerViewClass("", C);
    expect(getViewClass("")).toBeUndefined();
  });

  it("invalidate removes a previously registered class", () => {
    const D = defineView(() => ({ template: () => "" }));
    registerViewClass("baz/d", D);
    invalidateViewClass("baz/d");
    expect(getViewClass("baz/d")).toBeUndefined();
  });

  it("getViewClassRegistry returns the live registry map", () => {
    const E = defineView(() => ({ template: () => "" }));
    registerViewClass("zzz/e", E);
    const reg = getViewClassRegistry();
    expect(reg["zzz/e"]).toBe(E);
  });
});
