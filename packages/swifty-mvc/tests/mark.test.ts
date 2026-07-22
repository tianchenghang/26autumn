import { describe, it, expect } from "vitest";
import { mark, unmark } from "../src/mark";

describe("mark / unmark", () => {
  it("checker returns true until host is unmarked", () => {
    const host = {};
    const check = mark(host, "render");
    expect(check()).toBe(true);
    unmark(host);
    expect(check()).toBe(false);
  });

  it("re-marking a key invalidates all previous checkers for that key", () => {
    const host = {};
    const first = mark(host, "render");
    expect(first()).toBe(true);
    // Marking the same key again bumps the sign, so `first` is now stale.
    const second = mark(host, "render");
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("different keys on the same host are independent", () => {
    const host = {};
    const a = mark(host, "a");
    const b = mark(host, "b");
    // Bumping "a" must not invalidate "b".
    mark(host, "a");
    expect(a()).toBe(false);
    expect(b()).toBe(true);
  });

  it("does not pollute the host object with magic keys (S3)", () => {
    const host: Record<string, unknown> = { name: "view" };
    mark(host, "render");
    expect(Object.keys(host)).toEqual(["name"]);
    expect(Object.getOwnPropertySymbols(host)).toEqual([]);
    unmark(host);
    expect(Object.keys(host)).toEqual(["name"]);
  });

  it("works on frozen host objects", () => {
    const host = Object.freeze({ name: "frozen" });
    const check = mark(host, "render");
    expect(check()).toBe(true);
    unmark(host);
    expect(check()).toBe(false);
  });

  it("unmark called before mark still invalidates", () => {
    const host = {};
    unmark(host);
    const check = mark(host, "render");
    // host was marked deleted; mark() returns a permanently-false checker.
    expect(check()).toBe(false);
  });
});
