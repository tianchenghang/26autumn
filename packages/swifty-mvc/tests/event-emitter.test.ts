import { describe, it, expect, vi } from "vitest";
import { createEmitter } from "../src/event-emitter";
import type { AnyFunc, ChangeEvent, EmitterApi } from "../src/types";

describe("EmitterApi", () => {
  it("on / off - binds and unbinds event handlers", () => {
    const emitter = createEmitter();
    const fn = vi.fn();

    emitter.on("testEvent", fn);
    emitter.fire("testEvent", { value: 1 });
    expect(fn).toHaveBeenCalledTimes(1);

    emitter.off("testEvent", fn);
    emitter.fire("testEvent", { value: 2 });
    expect(fn).toHaveBeenCalledTimes(1); // should not trigger again
  });

  it("off - removes all handlers for event when no handler provided", () => {
    const emitter = createEmitter();
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    emitter.on("testEvent", fn1);
    emitter.on("testEvent", fn2);

    emitter.off("testEvent");

    emitter.fire("testEvent");
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  it("fire - triggers event and passes data", () => {
    const emitter = createEmitter();
    const received: unknown[] = [];

    emitter.on("testEvent", (data) => {
      received.push(data);
    });

    emitter.fire("testEvent", { msg: "hello" });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ msg: "hello", type: "testEvent" });
  });

  it("fire - executes in normal order by default", () => {
    const emitter = createEmitter();
    const order: number[] = [];

    emitter.on("testEvent", () => order.push(1));
    emitter.on("testEvent", () => order.push(2));
    emitter.on("testEvent", () => order.push(3));

    emitter.fire("testEvent", {}, false, false);

    expect(order).toEqual([1, 2, 3]);
  });

  it("fire - executes in reverse order when lastToFirst=true", () => {
    const emitter = createEmitter();
    const order: number[] = [];

    emitter.on("testEvent", () => order.push(1));
    emitter.on("testEvent", () => order.push(2));
    emitter.on("testEvent", () => order.push(3));

    emitter.fire("testEvent", {}, false, true);

    expect(order).toEqual([3, 2, 1]);
  });

  it("fire - removes all handlers after triggering when remove=true", () => {
    const emitter = createEmitter();
    const fn = vi.fn();

    emitter.on("testEvent", fn);
    emitter.fire("testEvent", {}, true);

    // Should not be called on subsequent fire
    emitter.fire("testEvent");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fire - invokes onEventName method if defined", () => {
    const emitter: EmitterApi & {
      onTestEvent?: AnyFunc;
    } = createEmitter();
    let onFnValue: unknown;
    emitter.onTestEvent = (data: unknown) => {
      onFnValue = data;
    };
    emitter.fire("testEvent", { key: "val" });
    expect(onFnValue).toEqual({ key: "val", type: "testEvent" });
  });

  it("off - removes onEventName method", () => {
    const emitter: EmitterApi & {
      onTestEvent?: AnyFunc;
    } = createEmitter();
    const fn = vi.fn();
    emitter.onTestEvent = fn;

    emitter.off("testEvent");
    // off without handler deletes onEventName
    expect(emitter.onTestEvent).toBeUndefined();
  });

  it("on / off - supports method chaining", () => {
    const emitter = createEmitter();
    const fn = vi.fn();

    const result1 = emitter.on("testEvent", fn);
    expect(result1).toBe(emitter);

    const result2 = emitter.off("testEvent", fn);
    expect(result2).toBe(emitter);
  });

  it("fire - returns this for chaining", () => {
    const emitter = createEmitter();
    const result = emitter.fire("testEvent");
    expect(result).toBe(emitter);
  });

  it("fire - automatically creates empty object and adds type when no data provided", () => {
    const emitter = createEmitter();
    let received: ChangeEvent | undefined;
    emitter.on("testEvent", (data) => {
      received = data;
    });
    emitter.fire("testEvent");
    expect(received).toEqual({ type: "testEvent" });
  });

  describe("re-entrant safety (C4)", () => {
    it("handler that calls off() does not skip its sibling", () => {
      const emitter = createEmitter();
      const calls: string[] = [];
      const a = (): void => {
        calls.push("a");
        emitter.off("e", a); // detach during dispatch
      };
      const b = (): void => {
        calls.push("b");
      };
      emitter.on("e", a);
      emitter.on("e", b);

      emitter.fire("e");
      expect(calls).toEqual(["a", "b"]);

      // a should be gone for subsequent fires
      emitter.fire("e");
      expect(calls).toEqual(["a", "b", "b"]);
    });

    it("compacts removed listeners after outermost fire completes", () => {
      const emitter = createEmitter();
      const a = (): void => {
        emitter.off("e", a);
      };
      const b = (): void => undefined;
      emitter.on("e", a);
      emitter.on("e", b);

      emitter.fire("e");

      const list =
        (
          Reflect.get(emitter, "listeners") as Map<
            string,
            { handler: AnyFunc }[]
          >
        ).get("\x1ee") ?? [];
      // After compaction, only `b` remains (no noop placeholders).
      expect(list.length).toBe(1);
      expect(list[0].handler).toBe(b);
    });

    it("nested fire works without compacting prematurely", () => {
      const emitter = createEmitter();
      const outer = vi.fn(() => {
        emitter.fire("inner");
      });
      const inner = vi.fn();
      emitter.on("outer", outer);
      emitter.on("inner", inner);
      emitter.fire("outer");
      expect(outer).toHaveBeenCalledTimes(1);
      expect(inner).toHaveBeenCalledTimes(1);
    });
  });
});
