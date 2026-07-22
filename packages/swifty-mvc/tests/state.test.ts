import { describe, it, expect, vi, beforeEach } from "vitest";
import { State } from "../src/state";

describe("State", () => {
  beforeEach(() => {
    // Clean up State residual event listeners to prevent cross-test pollution
    // State uses module-level singleton emitter internally, off() without handler deletes entire list
    State.off("changed");
    State.off("change");
    State.off("customEvent");
  });

  it("get / set - retrieves and sets data by key", () => {
    const testValue2 = { a: 1 };

    State.set({ testValue1: "abcde" });
    State.set({ testValue2 });

    expect(State.get("testValue1")).toBe("abcde");
    expect(State.get("testValue2")).toEqual(testValue2);
  });

  it("get - returns all data without parameters", () => {
    State.set({ allTestKey: "allTestValue" });

    const result = State.get<Record<string, unknown>>();
    expect(result["allTestKey"]).toBe("allTestValue");
  });

  it("set - returns State for method chaining", () => {
    const result = State.set({ chainTest: 1 });
    expect(result).toBe(State);
  });

  it("digest - triggers changed event on data change", () => {
    const handler = vi.fn();
    State.on("changed", handler);

    State.set({ digestTest: 1 });
    State.digest();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toHaveProperty("keys");
    expect(handler.mock.calls[0][0]["keys"]).toBeInstanceOf(Set);
    expect(
      (handler.mock.calls[0][0]["keys"] as Set<string>).has("digestTest"),
    ).toBe(true);

    State.off("changed", handler);
  });

  it("digest - does not trigger changed event when no changes", () => {
    const handler = vi.fn();
    State.on("changed", handler);

    State.digest();

    expect(handler).not.toHaveBeenCalled();

    State.off("changed", handler);
  });

  it("digest - passing data is equivalent to set then digest", () => {
    const handler = vi.fn();
    State.on("changed", handler);

    State.digest({ digestDataTest: 42 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(State.get("digestDataTest")).toBe(42);

    State.off("changed", handler);
  });

  it("diff - returns keys changed in last digest", () => {
    State.set({ diffTest: "hello" });
    State.digest();

    const diff = State.diff();
    expect(diff).toBeInstanceOf(Set);
    expect(diff.has("diffTest")).toBe(true);
  });

  it("on / off / fire - event delegation", () => {
    const handler = vi.fn();

    State.on("customEvent", handler);
    State.fire("customEvent", { payload: 1 });

    expect(handler).toHaveBeenCalledTimes(1);

    State.off("customEvent", handler);
    State.fire("customEvent", { payload: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("clean - creates cleanup function", () => {
    const cleanup = State.clean("cleanTest1,cleanTest2");

    expect(typeof cleanup).toBe("function");
  });

  it("clean - calling cleanup registers destroy callback", () => {
    const cleanup = State.clean("cleanTest3");
    const mockObj = {
      on: vi.fn(),
    };

    cleanup(mockObj);

    expect(mockObj.on).toHaveBeenCalledWith("destroy", expect.any(Function));
  });
});
