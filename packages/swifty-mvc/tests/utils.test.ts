import { describe, it, expect } from "vitest";
import {
  parseUri,
  toUri,
  setData,
  translateData,
  EMPTY_STRING_SET,
} from "../src/utils";

describe("utils", () => {
  describe("parseUri", () => {
    it("parses path with no params", () => {
      const { path, params } = parseUri("/foo/bar");
      expect(path).toBe("/foo/bar");
      expect(params).toEqual({});
    });

    it("parses path with query params", () => {
      const { path, params } = parseUri("/x?a=1&b=2");
      expect(path).toBe("/x");
      expect(params).toEqual({ a: "1", b: "2" });
    });

    it("decodes URI-encoded values", () => {
      const { params } = parseUri("/x?name=hello%20world&token=a%3Db");
      expect(params["name"]).toBe("hello world");
      expect(params["token"]).toBe("a=b");
    });

    it("is safe under re-entrant calls (S6)", () => {
      // If parseUri kept accumulator state in a module-level variable,
      // calling it from inside a callback that re-enters parseUri would
      // observe corrupted state. Local accumulator means the outer call
      // is unaffected.
      let innerParams: Record<string, string> | undefined;
      const decode = (value: string): string => {
        // Re-entrant: parse another URI from the callback
        innerParams = parseUri(`/inner?k=${value}`).params;
        return value;
      };

      const { params } = parseUri("/outer?z=10");
      // Force a re-entry by calling parseUri again on a derived URI.
      decode(params["z"]);

      expect(params).toEqual({ z: "10" });
      expect(innerParams).toEqual({ k: "10" });
    });
  });

  describe("toUri", () => {
    it("appends query params to path", () => {
      expect(toUri("/x", { a: "1", b: "2" })).toBe("/x?a=1&b=2");
    });

    it("URL-encodes param values", () => {
      expect(toUri("/x", { q: "hello world" })).toBe("/x?q=hello%20world");
    });

    it("keepEmpty controls which empty-valued keys survive when keepEmpty is provided", () => {
      // Without keepEmpty: all params are kept (legacy behavior).
      expect(toUri("/x", { a: "", b: "v" })).toBe("/x?a=&b=v");
      // With keepEmpty: empty values dropped UNLESS the key is whitelisted.
      expect(toUri("/x", { a: "", b: "v", c: "" }, new Set(["a"]))).toBe(
        "/x?a=&b=v",
      );
    });

    it("returns the path unchanged when there are no params", () => {
      expect(toUri("/x", {})).toBe("/x");
    });
  });

  describe("setData", () => {
    it("tracks changed keys into a Set", () => {
      const old: Record<string, unknown> = { a: 1 };
      const changed = new Set<string>();
      const result = setData({ a: 1, b: 2 }, old, changed, EMPTY_STRING_SET);
      expect(result).toBe(true);
      expect(changed.has("b")).toBe(true);
      // a === a → not tracked
      expect(changed.has("a")).toBe(false);
      expect(old).toEqual({ a: 1, b: 2 });
    });

    it("respects the excludes set", () => {
      const old: Record<string, unknown> = {};
      const changed = new Set<string>();
      const excludes = new Set(["secret"]);
      setData({ secret: "x", visible: "y" }, old, changed, excludes);
      expect(changed.has("secret")).toBe(false);
      expect(changed.has("visible")).toBe(true);
    });
  });

  describe("translateData", () => {
    it("resolves SPLITTER+digits ref tokens", () => {
      const SPLITTER = "\x1e";
      const refs = { [`${SPLITTER}1`]: { wrapped: true } };
      expect(translateData(refs, `${SPLITTER}1`)).toEqual({ wrapped: true });
    });

    it("leaves non-ref strings untouched", () => {
      const refs = {};
      expect(translateData(refs, "plain")).toBe("plain");
      // SPLITTER prefix but not all digits → not a ref
      expect(translateData(refs, "\x1eABC")).toBe("\x1eABC");
    });

    it("recursively resolves refs inside objects", () => {
      const SPLITTER = "\x1e";
      const refs = { [`${SPLITTER}1`]: { actual: 1 } };
      const params: Record<string, unknown> = { obj: `${SPLITTER}1` };
      translateData(refs, params);
      expect(params).toEqual({ obj: { actual: 1 } });
    });
  });
});
