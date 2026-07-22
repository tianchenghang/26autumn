import { describe, it, expect, vi } from "vitest";
import { defineView, createCtx, mountCtx, unmountCtx } from "../src/view";
import { Frame, createFrame } from "../src/frame";
import type { AnyFunc, FrameObj, ViewCtx, ViewSetup } from "../src/types";

/**
 * Creates Frame with DOM for testing
 */
function createTestFrame(id: string): FrameObj {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id);
}

/**
 * Cleans up test Frame
 */
function cleanupFrame(frame: FrameObj): void {
  const el = document.getElementById(frame.id);
  if (el) el.remove();
  (Frame.getAll() as Map<string, FrameObj>).delete(frame.id);
}

describe("View (functional)", () => {
  describe("defineView", () => {
    it("returns the setup function as-is", () => {
      const setup: ViewSetup = () => ({ template: () => "" });
      const result = defineView(setup);
      expect(result).toBe(setup);
      expect(typeof result).toBe("function");
    });

    it("setup function receives ctx and returns descriptor", () => {
      const frame = createTestFrame("test-frame-1");
      const templateFn = () => "hello";
      let receivedCtx: ViewCtx | undefined;

      const setup = defineView((ctx) => {
        receivedCtx = ctx;
        return { template: templateFn };
      });

      const ctx = mountCtx(frame, setup);
      expect(receivedCtx).toBe(ctx);
      expect(ctx.id).toBe("test-frame-1");
      expect(ctx.owner).toBe(frame);
      expect(ctx.updater).toBeDefined();
      expect(typeof ctx.render).toBe("function");
      expect(ctx.getTemplate()).toBe(templateFn);

      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("events returned by setup are accessible via getEvents", () => {
      const frame = createTestFrame("test-frame-2");
      const handler = vi.fn();
      const setup = defineView(() => ({
        template: () => "",
        events: { "btn<click>": handler },
      }));

      const ctx = mountCtx(frame, setup);
      expect(ctx.getEvents()).toEqual({ "btn<click>": handler });

      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("on / off / fire", () => {
    it("binds and triggers events", () => {
      const frame = createTestFrame("evt-frame-1");
      const ctx = createCtx(frame);
      const handler = vi.fn();

      ctx.on("testEvent", handler);
      ctx.fire("testEvent", { data: 1 });

      expect(handler).toHaveBeenCalledTimes(1);

      ctx.off("testEvent", handler);
      ctx.fire("testEvent", { data: 2 });

      expect(handler).toHaveBeenCalledTimes(1);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("wrapAsync", () => {
    it("executes callback when current signature is valid", () => {
      const frame = createTestFrame("wa-frame-1");
      const ctx = createCtx(frame);
      ctx.signature.value = 1;

      const callback = vi.fn();
      const wrapped = ctx.wrapAsync(callback);

      wrapped();
      expect(callback).toHaveBeenCalledTimes(1);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("does not execute callback after signature change", () => {
      const frame = createTestFrame("wa-frame-2");
      const ctx = createCtx(frame);
      ctx.signature.value = 1;

      const callback = vi.fn();
      const wrapped = ctx.wrapAsync(callback);

      ctx.signature.value = 2;
      wrapped();
      expect(callback).not.toHaveBeenCalled();
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("does not execute callback when signature is 0", () => {
      const frame = createTestFrame("wa-frame-3");
      const ctx = createCtx(frame);
      ctx.signature.value = 1;

      const callback = vi.fn();
      const wrapped = ctx.wrapAsync(callback);

      ctx.signature.value = 0;
      wrapped();
      expect(callback).not.toHaveBeenCalled();
      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("observeLocation", () => {
    it("string parameter + observePath=true", () => {
      const frame = createTestFrame("ol-frame-1");
      const ctx = createCtx(frame);
      ctx.observeLocation("a,b,c", true);

      expect(ctx.locationObserved.flag).toBe(1);
      expect(ctx.locationObserved.observePath).toBe(true);
      expect(ctx.locationObserved.keys).toEqual(["a", "b", "c"]);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("string parameter + observePath=false", () => {
      const frame = createTestFrame("ol-frame-2");
      const ctx = createCtx(frame);
      ctx.observeLocation("d,e,f", false);

      expect(ctx.locationObserved.flag).toBe(1);
      expect(ctx.locationObserved.observePath).toBe(false);
      expect(ctx.locationObserved.keys).toEqual(["d", "e", "f"]);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("object parameter with path", () => {
      const frame = createTestFrame("ol-frame-3");
      const ctx = createCtx(frame);
      ctx.observeLocation({ params: "g,h,i", path: true });

      expect(ctx.locationObserved.observePath).toBe(true);
      expect(ctx.locationObserved.keys).toEqual(["g", "h", "i"]);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("object parameter without path", () => {
      const frame = createTestFrame("ol-frame-4");
      const ctx = createCtx(frame);
      ctx.observeLocation({ params: "j,k,l" });

      expect(ctx.locationObserved.observePath).toBe(false);
      expect(ctx.locationObserved.keys).toEqual(["j", "k", "l"]);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("observeState", () => {
    it("string parameter", () => {
      const frame = createTestFrame("os-frame-1");
      const ctx = createCtx(frame);
      ctx.observeState("a,b,c");

      expect(ctx.getObservedStateKeys()).toEqual(["a", "b", "c"]);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("array parameter", () => {
      const frame = createTestFrame("os-frame-2");
      const ctx = createCtx(frame);
      ctx.observeState(["x", "y"]);

      expect(ctx.getObservedStateKeys()).toEqual(["x", "y"]);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("capture / release", () => {
    it("capture registers resource", () => {
      const frame = createTestFrame("cr-frame-1");
      const ctx = createCtx(frame);
      const resource = { destroy: vi.fn() };

      ctx.capture("test1", resource, true);

      expect(ctx.resources["test1"]).toEqual({
        entity: resource,
        destroyOnRender: true,
      });
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("capture returns existing entity when no resource provided", () => {
      const frame = createTestFrame("cr-frame-2");
      const ctx = createCtx(frame);
      const resource = { id: 1 };

      ctx.capture("test1", resource, true);
      const result = ctx.capture("test1");

      expect(result).toBe(resource);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("release destroys resource", () => {
      const frame = createTestFrame("cr-frame-3");
      const ctx = createCtx(frame);
      const resource = { destroy: vi.fn() };

      ctx.capture("test1", resource, true);
      ctx.release("test1", true);

      expect(resource.destroy).toHaveBeenCalled();
      expect(ctx.resources["test1"]).toBeUndefined();
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("release does not call destroy", () => {
      const frame = createTestFrame("cr-frame-4");
      const ctx = createCtx(frame);
      const resource = { destroy: vi.fn() };

      ctx.capture("test1", resource, true);
      ctx.release("test1", false);

      expect(resource.destroy).not.toHaveBeenCalled();
      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("defineView (D1)", () => {
    it("returns a setup function", () => {
      const setup = defineView((ctx) => {
        void ctx;
        return { template: () => "hello" };
      });
      expect(typeof setup).toBe("function");
    });

    it("mountCtx runs setup and exposes template via ctx", () => {
      const frame = createTestFrame("define-view-1");
      const setup = defineView(() => ({
        template: () => "count=5",
      }));
      const ctx = mountCtx(frame, setup);
      expect(typeof ctx.getTemplate).toBe("function");
      expect(ctx.getTemplate()).toBeDefined();
      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });
});

// Keep type references for compile-time validation
export type { AnyFunc };
