import { describe, it, expect } from "vitest";
import { createUpdater } from "../src/updater";

describe("Updater", () => {
  it("constructor - initial state", () => {
    const updater = createUpdater("viewId1");

    // get() without parameters returns entire data object
    const data = updater.get<Record<string, unknown>>();
    expect(data["vId"]).toBe("viewId1");

    // refData initial counter
    expect(updater.refData).toBeDefined();
  });

  it("set / get - data binding and reading", () => {
    const updater = createUpdater("viewId2");

    // set returns this for method chaining
    const result = updater.set({ a: 1, b: 2 });
    expect(result).toBe(updater);

    expect(updater.get("a")).toBe(1);
    expect(updater.get("b")).toBe(2);

    // get without parameters returns entire data
    const allData = updater.get<Record<string, unknown>>();
    expect(allData["a"]).toBe(1);
    expect(allData["b"]).toBe(2);
  });

  it("set - updates existing key", () => {
    const updater = createUpdater("viewId1");
    updater.set({ x: 1 });
    expect(updater.get("x")).toBe(1);

    updater.set({ x: 2 });
    expect(updater.get("x")).toBe(2);
  });

  it("snapshot / altered - snapshot and change detection", () => {
    const updater = createUpdater("viewId2");
    const setObj = { key: "value" };

    updater.set({ a: 1, b: setObj });

    // altered is undefined before snapshot
    expect(updater.altered()).toBeUndefined();

    // no change after snapshot
    updater.snapshot();
    expect(updater.altered()).toBe(false);

    // altered is true after change
    updater.set({ c: 1 });
    expect(updater.altered()).toBe(true);
  });

  it("snapshot / altered - altered is false when value unchanged", () => {
    const updater = createUpdater("viewId1");

    updater.set({ a: 1 });
    updater.snapshot();

    // setting same value again, altered remains false (same after JSON serialization)
    updater.set({ a: 1 });
    expect(updater.altered()).toBe(false);
  });

  it("snapshot / altered - works with self-referential data (no JSON.stringify)", () => {
    const updater = createUpdater("viewId1");
    type Node = { name: string; self?: Node };
    const node: Node = { name: "root" };
    node.self = node; // cyclic — would throw under JSON.stringify

    updater.set({ node });
    updater.snapshot();
    expect(updater.altered()).toBe(false);

    updater.set({ node, extra: 1 });
    expect(updater.altered()).toBe(true);
  });

  it("get - returns undefined for non-existent key", () => {
    const updater = createUpdater("viewId1");
    expect(updater.get("nonexistent")).toBeUndefined();
  });

  it("translate - converts data references with SPLITTER prefix", () => {
    const updater = createUpdater("viewId1");

    // strings without SPLITTER prefix returned as-is
    expect(updater.translate("normalString")).toBe("normalString");
    expect(updater.translate(123)).toBe(123);
  });

  it("translate - resolves a SPLITTER+digits ref token", () => {
    const updater = createUpdater("viewId1");
    const SPLITTER = "\x1e";
    const target = { hello: "world" };
    updater.refData[`${SPLITTER}9`] = target;
    expect(updater.translate(`${SPLITTER}9`)).toBe(target);
  });

  it("translate - ignores SPLITTER-prefixed string that is not a ref token", () => {
    const updater = createUpdater("viewId1");
    const SPLITTER = "\x1e";
    // not all-digits after SPLITTER → not a ref, returned as-is
    expect(updater.translate(`${SPLITTER}user-input`)).toBe(
      `${SPLITTER}user-input`,
    );
    // SPLITTER alone → not enough characters, returned as-is
    expect(updater.translate(SPLITTER)).toBe(SPLITTER);
  });

  it("parse - resolves dotted property paths against refData", () => {
    const updater = createUpdater("viewId1");
    updater.refData["user"] = { profile: { name: "alice" } };

    expect(updater.parse("user.profile.name")).toBe("alice");
    expect(updater.parse("user.profile")).toEqual({ name: "alice" });
    expect(updater.parse("missing")).toBeUndefined();
  });

  it("parse - returns numbers for numeric literals", () => {
    const updater = createUpdater("viewId1");
    expect(updater.parse("42")).toBe(42);
    expect(updater.parse("-1.5")).toBe(-1.5);
  });

  it("parse - rejects arbitrary expressions (no eval)", () => {
    const updater = createUpdater("viewId1");
    // Anything that isn't a numeric literal or a dotted path is rejected
    expect(updater.parse("1 + 2")).toBeUndefined();
    expect(updater.parse("alert(1)")).toBeUndefined();
    expect(updater.parse("a[b]")).toBeUndefined();
  });

  it("getChangedKeys - initially empty", () => {
    const updater = createUpdater("viewId1");
    const keys = updater.getChangedKeys();
    expect(keys).toBeInstanceOf(Set);
    expect(keys.size).toBe(0);
  });

  it("forceDigest - marks all keys as changed and triggers digest", () => {
    const updater = createUpdater("force-test");
    updater.set({ a: 1, b: 2, c: 3 });
    // Run a normal digest first to clear the changed flags
    updater.digest();

    // After digest, changedKeys should be empty and no pending change
    expect(updater.getChangedKeys().size).toBe(0);

    // forceDigest should mark ALL keys as changed regardless of value equality
    // (even primitive values that haven't changed), enabling a full re-render.
    // It should not throw even without a mounted view/DOM.
    expect(() => updater.forceDigest()).not.toThrow();

    // After forceDigest runs, changedKeys are consumed (cleared by runDigest)
    expect(updater.getChangedKeys().size).toBe(0);
  });
});
