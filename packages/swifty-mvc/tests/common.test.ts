import { describe, it, expect } from "vitest";
import {
  encodeHTML,
  strSafe,
  encodeURIExtra,
  encodeQuote,
  refFn,
  isRefToken,
  nextCounter,
  SPLITTER,
  V_TEXT_NODE,
} from "../src/common";

describe("common", () => {
  describe("encodeHTML", () => {
    it("escapes & to &amp;", () => {
      expect(encodeHTML("a&b")).toBe("a&amp;b");
    });
    it("escapes < to &lt;", () => {
      expect(encodeHTML("a<b")).toBe("a&lt;b");
    });
    it("escapes > to &gt;", () => {
      expect(encodeHTML("a>b")).toBe("a&gt;b");
    });
    it('escapes " to &#34;', () => {
      expect(encodeHTML('a"b')).toBe("a&#34;b");
    });
    it("escapes ' to &#39;", () => {
      expect(encodeHTML("a'b")).toBe("a&#39;b");
    });
    it("escapes ` to &#96;", () => {
      expect(encodeHTML("a`b")).toBe("a&#96;b");
    });
    it("escapes multiple entities", () => {
      expect(encodeHTML('<a href="x">&y</a>')).toBe(
        "&lt;a href=&#34;x&#34;&gt;&amp;y&lt;/a&gt;",
      );
    });
    it("returns empty string for null", () => {
      expect(encodeHTML(null)).toBe("");
    });
    it("returns empty string for undefined", () => {
      expect(encodeHTML(undefined)).toBe("");
    });
    it("converts number to string", () => {
      expect(encodeHTML(42)).toBe("42");
    });
    it("leaves plain text unchanged", () => {
      expect(encodeHTML("hello world")).toBe("hello world");
    });
  });

  describe("strSafe", () => {
    it("returns '' for null", () => {
      expect(strSafe(null)).toBe("");
    });
    it("returns '' for undefined", () => {
      expect(strSafe(undefined)).toBe("");
    });
    it("converts number to string", () => {
      expect(strSafe(42)).toBe("42");
    });
    it("converts boolean true to 'true'", () => {
      expect(strSafe(true)).toBe("true");
    });
    it("converts boolean false to 'false'", () => {
      expect(strSafe(false)).toBe("false");
    });
    it("returns string as-is", () => {
      expect(strSafe("hello")).toBe("hello");
    });
    it("converts 0 to '0'", () => {
      expect(strSafe(0)).toBe("0");
    });
    it("converts empty string to empty string", () => {
      expect(strSafe("")).toBe("");
    });
    it("converts object to string via toString", () => {
      expect(strSafe({ toString: () => "custom" })).toBe("custom");
    });
  });

  describe("encodeURIExtra", () => {
    it("encodes ! to %21", () => {
      expect(encodeURIExtra("!")).toBe("%21");
    });
    it("encodes ' to %27", () => {
      expect(encodeURIExtra("'")).toBe("%27");
    });
    it("encodes ( to %28", () => {
      expect(encodeURIExtra("(")).toBe("%28");
    });
    it("encodes ) to %29", () => {
      expect(encodeURIExtra(")")).toBe("%29");
    });
    it("encodes * to %2A", () => {
      expect(encodeURIExtra("*")).toBe("%2A");
    });
    it("encodes all special chars together", () => {
      expect(encodeURIExtra("a!b'c(d)e*f")).toBe("a%21b%27c%28d%29e%2Af");
    });
    it("handles null", () => {
      expect(encodeURIExtra(null)).toBe("");
    });
    it("leaves normal text unchanged", () => {
      expect(encodeURIExtra("hello")).toBe("hello");
    });
    it("encodes spaces as %20", () => {
      expect(encodeURIExtra("a b")).toBe("a%20b");
    });
  });

  describe("encodeQuote", () => {
    it("escapes double quotes", () => {
      expect(encodeQuote('a"b')).toBe('a\\"b');
    });
    it("escapes single quotes", () => {
      expect(encodeQuote("a'b")).toBe("a\\'b");
    });
    it("escapes backslashes", () => {
      expect(encodeQuote("a\\b")).toBe("a\\\\b");
    });
    it("escapes all together", () => {
      expect(encodeQuote(`a"b'c\\d`)).toBe(`a\\"b\\'c\\\\d`);
    });
    it("handles null", () => {
      expect(encodeQuote(null)).toBe("");
    });
    it("leaves plain text unchanged", () => {
      expect(encodeQuote("hello")).toBe("hello");
    });
  });

  describe("refFn", () => {
    it("stores a new object and returns a unique key", () => {
      const ref: Record<string, unknown> = {};
      ref[SPLITTER] = 1;
      const obj = { name: "test" };
      const key = refFn(ref, obj, "");
      expect(key).toBe(SPLITTER + "1");
      expect(ref[key]).toBe(obj);
    });

    it("returns existing key for same object reference", () => {
      const ref: Record<string, unknown> = {};
      ref[SPLITTER] = 1;
      const obj = { name: "test" };
      const key1 = refFn(ref, obj, "");
      const key2 = refFn(ref, obj, "");
      expect(key1).toBe(key2);
    });

    it("returns different keys for different objects", () => {
      const ref: Record<string, unknown> = {};
      ref[SPLITTER] = 1;
      const obj1 = { name: "a" };
      const obj2 = { name: "b" };
      const key1 = refFn(ref, obj1, "");
      const key2 = refFn(ref, obj2, "");
      expect(key1).not.toBe(key2);
    });

    it("increments counter for each new object", () => {
      const ref: Record<string, unknown> = {};
      ref[SPLITTER] = 1;
      refFn(ref, {}, "");
      refFn(ref, {}, "");
      refFn(ref, {}, "");
      expect(ref[SPLITTER]).toBe(4);
    });

    it("uses strict equality (===) for object comparison", () => {
      const ref: Record<string, unknown> = {};
      ref[SPLITTER] = 1;
      // Two objects with same content but different references
      const key1 = refFn(ref, { a: 1 }, "");
      const key2 = refFn(ref, { a: 1 }, "");
      expect(key1).not.toBe(key2);
    });

    it("stores primitive values correctly", () => {
      const ref: Record<string, unknown> = {};
      ref[SPLITTER] = 1;
      const key = refFn(ref, 42, "");
      expect(ref[key]).toBe(42);
      // Same primitive should return same key
      const key2 = refFn(ref, 42, "");
      expect(key).toBe(key2);
    });
  });

  describe("isRefToken", () => {
    it("returns true for valid single-digit token", () => {
      expect(isRefToken(SPLITTER + "1")).toBe(true);
    });
    it("returns true for valid multi-digit token", () => {
      expect(isRefToken(SPLITTER + "123")).toBe(true);
    });
    it("returns false for empty string", () => {
      expect(isRefToken("")).toBe(false);
    });
    it("returns false for single char string", () => {
      expect(isRefToken("a")).toBe(false);
    });
    it("returns false for SPLITTER alone (no digits)", () => {
      // This is an edge case -- may expose a bug
      expect(isRefToken(SPLITTER)).toBe(false);
    });
    it("returns false for SPLITTER + non-digit", () => {
      expect(isRefToken(SPLITTER + "a")).toBe(false);
    });
    it("returns false for SPLITTER + mixed digits and letters", () => {
      expect(isRefToken(SPLITTER + "12a3")).toBe(false);
    });
    it("returns false for SPLITTER + space + digit", () => {
      expect(isRefToken(SPLITTER + " 1")).toBe(false);
    });
    it("returns false for digit + SPLITTER", () => {
      expect(isRefToken("1" + SPLITTER)).toBe(false);
    });
    it("returns true for SPLITTER + 0", () => {
      expect(isRefToken(SPLITTER + "0")).toBe(true);
    });
  });

  describe("nextCounter", () => {
    it("returns incrementing numbers", () => {
      const c1 = nextCounter();
      const c2 = nextCounter();
      expect(c2).toBe(c1 + 1);
    });
    it("returns a number", () => {
      expect(typeof nextCounter()).toBe("number");
    });
  });

  describe("constants", () => {
    it("SPLITTER is a single character", () => {
      expect(SPLITTER.length).toBe(1);
    });
    it("SPLITTER is U+001E (Record Separator)", () => {
      expect(SPLITTER.charCodeAt(0)).toBe(0x1e);
    });
    it("V_TEXT_NODE is 0 (falsy)", () => {
      expect(V_TEXT_NODE).toBe(0);
      expect(!V_TEXT_NODE).toBe(true);
    });
  });
});
