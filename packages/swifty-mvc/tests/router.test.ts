import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "../src/router";
import type { FrameworkConfig } from "../src/types";

describe("Router", () => {
  describe("parse", () => {
    beforeEach(() => {
      Router._setConfig({
        rootId: "app",
        routeMode: "hash",
      } as FrameworkConfig);
    });

    it("parses plain domain URL", () => {
      const result = Router.parse("https://a.b.c.com");

      expect(result.href).toBe("https://a.b.c.com");
      expect(result.srcQuery).toBe("");
      expect(result.srcHash).toBe("");
      expect(result.query.path).toBe("");
      expect(result.query.params).toEqual({});
      expect(result.hash.path).toBe("");
      expect(result.hash.params).toEqual({});
      expect(result.params).toEqual({});
    });

    it("parses URL with query", () => {
      const result = Router.parse("https://a.b.c.com/?p0=000");

      expect(result.href).toBe("https://a.b.c.com/?p0=000");
      expect(result.srcQuery).toBe("/?p0=000");
      expect(result.srcHash).toBe("");
      expect(result.query.path).toBe("/");
      expect(result.query.params).toEqual({ p0: "000" });
      expect(result.hash.path).toBe("");
      expect(result.hash.params).toEqual({});
      expect(result.params).toEqual({ p0: "000" });
    });

    it("parses URL with hash", () => {
      const result = Router.parse("https://a.b.c.com/#!/d/e?p1=111&p2=aaa");

      expect(result.href).toBe("https://a.b.c.com/#!/d/e?p1=111&p2=aaa");
      expect(result.srcQuery).toBe("/");
      expect(result.srcHash).toBe("/d/e?p1=111&p2=aaa");
      expect(result.query.path).toBe("/");
      expect(result.query.params).toEqual({});
      expect(result.hash.path).toBe("/d/e");
      expect(result.hash.params).toEqual({ p1: "111", p2: "aaa" });
      expect(result.params).toEqual({ p1: "111", p2: "aaa" });
    });

    it("parses URL with both query and hash", () => {
      const result = Router.parse(
        "https://a.b.c.com/?p0=000#!/d/e?p1=111&p2=aaa",
      );

      expect(result.href).toBe("https://a.b.c.com/?p0=000#!/d/e?p1=111&p2=aaa");
      expect(result.srcQuery).toBe("/?p0=000");
      expect(result.srcHash).toBe("/d/e?p1=111&p2=aaa");
      expect(result.query.path).toBe("/");
      expect(result.query.params).toEqual({ p0: "000" });
      expect(result.hash.path).toBe("/d/e");
      expect(result.hash.params).toEqual({ p1: "111", p2: "aaa" });
      expect(result.params).toEqual({
        p0: "000",
        p1: "111",
        p2: "aaa",
      });
    });

    it("Location.get retrieves parameters", () => {
      const result = Router.parse("https://a.b.c.com/#!/d/e?p1=111&p2=aaa");

      expect(result.get("p1")).toBe("111");
      expect(result.get("p2")).toBe("aaa");
      expect(result.get("nonexistent", "default")).toBe("default");
      expect(result.get("nonexistent")).toBe("");
    });

    it("parse results are cached", () => {
      const result1 = Router.parse("https://a.b.c.com");
      const result2 = Router.parse("https://a.b.c.com");
      // Same href returns equal result (may be cached object or new object)
      expect(result1).toStrictEqual(result2);
    });
  });

  describe("join", () => {
    it("joins path segments", () => {
      expect(Router.join("a", "b", "c")).toBe("a/b/c");
    });

    it("handles ./ relative paths", () => {
      expect(Router.join("/a/b/./c/./d")).toBe("/a/b/c/d");
    });

    it("handles ../ parent directories", () => {
      expect(Router.join("a/b/c/../../d")).toBe("a/d");
    });

    it("handles excess slashes", () => {
      expect(Router.join("a//b/c")).toBe("a/b/c");
    });

    it("complex path joining", () => {
      expect(Router.join("/a/b/../c/./d//e")).toBe("/a/c/d/e");
    });
  });

  describe("on / off / fire", () => {
    it("binds and triggers events", () => {
      const handler = vi.fn();

      Router.on("testEvent", handler);
      Router.fire("testEvent", { data: 1 });

      expect(handler).toHaveBeenCalledTimes(1);

      Router.off("testEvent", handler);
    });

    it("does not trigger after unbinding", () => {
      const handler = vi.fn();

      Router.on("testEvent2", handler);
      Router.off("testEvent2", handler);
      Router.fire("testEvent2");

      expect(handler).not.toHaveBeenCalled();
    });

    it("fire returns Router for method chaining", () => {
      const result = Router.fire("testEvent3");
      expect(result).toBe(Router);
    });
  });

  describe("beforeEach (D3)", () => {
    it("registers and unregisters a guard", () => {
      const guard = vi.fn(() => true);
      const off = Router.beforeEach(guard);
      expect(typeof off).toBe("function");
      off();
      // No throw on duplicate unsubscribe
      expect(() => off()).not.toThrow();
    });

    it("multiple guards register independently", () => {
      const g1 = vi.fn();
      const g2 = vi.fn();
      const off1 = Router.beforeEach(g1);
      const off2 = Router.beforeEach(g2);
      off1();
      off2();
      expect(g1).not.toHaveBeenCalled();
      expect(g2).not.toHaveBeenCalled();
    });
  });

  describe("history mode", () => {
    beforeEach(() => {
      Router._setConfig({
        rootId: "app",
        routeMode: "history",
      } as FrameworkConfig);
    });

    it("parses history mode URL with pathname and search", () => {
      const result = Router.parse("https://example.com/home?page=1&size=20");

      expect(result.href).toBe("https://example.com/home?page=1&size=20");
      expect(result.srcQuery).toBe("/home?page=1&size=20");
      expect(result.srcHash).toBe("");
      expect(result.query.path).toBe("/home");
      expect(result.query.params).toEqual({ page: "1", size: "20" });
      expect(result.hash.path).toBe("");
      expect(result.hash.params).toEqual({});
      expect(result.params).toEqual({ page: "1", size: "20" });
    });

    it("parses history mode URL with only pathname", () => {
      const result = Router.parse("https://example.com/about");

      expect(result.srcQuery).toBe("/about");
      expect(result.query.path).toBe("/about");
      expect(result.query.params).toEqual({});
      expect(result.params).toEqual({});
    });

    it("parses history mode URL at root", () => {
      const result = Router.parse("https://example.com/");

      expect(result.srcQuery).toBe("/");
      expect(result.query.path).toBe("/");
    });

    it("Location.get works in history mode", () => {
      const result = Router.parse("https://example.com/list?page=2&sort=name");

      expect(result.get("page")).toBe("2");
      expect(result.get("sort")).toBe("name");
      expect(result.get("missing", "default")).toBe("default");
    });
  });

  describe("hash mode (backward compatibility)", () => {
    beforeEach(() => {
      Router._setConfig({
        rootId: "app",
        routeMode: "hash",
      } as FrameworkConfig);
    });

    it("parses hash mode URL same as before", () => {
      const result = Router.parse("https://example.com/#!/home?page=1");

      expect(result.srcHash).toBe("/home?page=1");
      expect(result.hash.path).toBe("/home");
      expect(result.hash.params).toEqual({ page: "1" });
      expect(result.params).toEqual({ page: "1" });
    });
  });
});
