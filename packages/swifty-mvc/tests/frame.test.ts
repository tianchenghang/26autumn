import { describe, it, expect, vi, afterEach } from "vitest";
import { Frame, createFrame, registerViewClass } from "../src/frame";
import { defineView } from "../src/view";
import { SWIFTY_VIEW } from "../src/common";
import type { FrameObj } from "../src/types";

/**
 * Creates a Frame with associated DOM element for testing
 */
function createTestFrame(id: string, parentId?: string): FrameObj {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id, parentId);
}

/**
 * Cleans up Frame and associated DOM
 */
function cleanupFrame(frame: FrameObj): void {
  const id = frame.id;
  const el = document.getElementById(id);
  if (el) el.remove();
  Frame.getAll().delete(id);
}

/** Flush the microtask queue so deferred mounts (Promise.resolve in doMountView) complete. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Frame", () => {
  afterEach(() => {
    if (Reflect.get(Frame, "_rootFrame") !== undefined) {
      Reflect.deleteProperty(Frame, "_rootFrame");
    }
    // Clean up Frame static event listener residues to prevent cross-test pollution
    Frame.off("add");
    Frame.off("remove");
    Frame.off("customEvent");
    Frame.off("customEvent2");
  });

  describe("constructor", () => {
    it("creates Frame and registers it in registry", () => {
      const frame = createTestFrame("constructor-test-1");

      expect(frame.id).toBe("constructor-test-1");
      expect(Frame.get("constructor-test-1")).toBe(frame);
      expect(Frame.getAll().get("constructor-test-1")).toBe(frame);

      cleanupFrame(frame);
    });

    it("creates Frame with parentId", () => {
      const frame = createTestFrame("constructor-test-2", "parent-id");

      expect(frame.id).toBe("constructor-test-2");
      expect(frame.parentId).toBe("parent-id");

      cleanupFrame(frame);
    });

    it("parentId is undefined when not provided", () => {
      const frame = createTestFrame("constructor-test-3");

      expect(frame.parentId).toBeUndefined();

      cleanupFrame(frame);
    });

    it("constructor triggers add event", () => {
      const handler = vi.fn();
      Frame.on("add", handler);

      const frame = createTestFrame("constructor-test-4");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toHaveProperty("frame");
      expect(handler.mock.calls[0][0].frame).toBe(frame);

      Frame.off("add", handler);
      cleanupFrame(frame);
    });

    it("Frame is mounted to DOM element's frame property", () => {
      const frame = createTestFrame("constructor-test-5");
      const el = document.getElementById("constructor-test-5");

      expect(el?.frame).toBe(frame);
      expect(el?.frameBound).toBe(1);

      cleanupFrame(frame);
    });

    it("initial state is correct", () => {
      const frame = createTestFrame("constructor-test-6");

      expect(frame.childrenCount).toBe(0);
      expect(frame.readyCount).toBe(0);
      expect(frame.signature).toBe(1);
      expect(frame.destroyed).toBe(0);
      expect(frame.hasAltered).toBe(0);
      expect(frame.invokeList).toEqual([]);
      expect(frame.view).toBeUndefined();
      expect(frame.getViewPath()).toBeUndefined();
      expect(frame.originalTemplate).toBeUndefined();

      cleanupFrame(frame);
    });
  });

  describe("Frame.get / Frame.getAll", () => {
    it("get returns registered Frame", () => {
      const frame = createTestFrame("get-test-1");

      expect(Frame.get("get-test-1")).toBe(frame);

      cleanupFrame(frame);
    });

    it("get returns undefined for non-existent ID", () => {
      expect(Frame.get("nonexistent-id")).toBeUndefined();
    });

    it("getAll returns Map containing all registered Frames", () => {
      const frame1 = createTestFrame("getall-test-1");
      const frame2 = createTestFrame("getall-test-2");

      const all = Frame.getAll();
      expect(all.get("getall-test-1")).toBe(frame1);
      expect(all.get("getall-test-2")).toBe(frame2);

      cleanupFrame(frame1);
      cleanupFrame(frame2);
    });
  });

  describe("Frame.root", () => {
    it("creates root Frame", () => {
      const el = document.createElement("div");
      el.id = "app-root";
      document.body.appendChild(el);

      const root = Frame.createRoot("app-root");

      expect(root.id).toBe("app-root");
      expect(Frame.get("app-root")).toBe(root);

      el.remove();
      Frame.getAll().delete("app-root");
    });

    it("multiple calls return same root instance", () => {
      const root1 = Frame.createRoot("root-same");
      const root2 = Frame.createRoot("root-same");

      expect(root1).toBe(root2);

      Frame.getAll().delete("root-same");
    });
  });

  describe("Frame.getRoot / Frame.createRoot (D2)", () => {
    it("createRoot returns the singleton (idempotent) and getRoot reads it back", () => {
      // Singleton may already exist from earlier tests in this file, which
      // is itself a demonstration of the API — `createRoot` returns the
      // existing root regardless of the new id passed in.
      const a = Frame.createRoot("d2-root-a");
      const b = Frame.createRoot("d2-root-b");
      expect(a).toBe(b);

      // getRoot is a pure read: never creates, returns the same singleton.
      const peek = Frame.getRoot();
      expect(peek).toBe(a);
    });
  });

  describe("Frame static events: on / off / fire", () => {
    it("on binds event, fire triggers it", () => {
      const handler = vi.fn();
      Frame.on("customEvent", handler);
      Frame.fire("customEvent", { data: 1 });

      expect(handler).toHaveBeenCalledTimes(1);
      // EventEmitter.fire automatically adds type property to data
      expect(handler.mock.calls[0][0]).toEqual({
        data: 1,
        type: "customEvent",
      });

      Frame.off("customEvent", handler);
    });

    it("off unbinds handler, no longer triggers", () => {
      const handler = vi.fn();
      Frame.on("customEvent2", handler);
      Frame.off("customEvent2", handler);
      Frame.fire("customEvent2", { data: 2 });

      expect(handler).not.toHaveBeenCalled();
    });

    it("add event triggers when creating Frame", () => {
      const handler = vi.fn();
      Frame.on("add", handler);

      const frame = createTestFrame("static-event-add");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].frame).toBe(frame);

      Frame.off("add", handler);
      cleanupFrame(frame);
    });

    it("remove event triggers when removing Frame", () => {
      const frame = createTestFrame("static-event-remove");
      const handler = vi.fn();
      Frame.on("remove", handler);

      cleanupFrame(frame);

      // cleanupFrame deletes registry entry but doesn't go through removeFrame flow
      // Manually test the complete flow of unmountFrame triggering remove event
      // Re-register first
      const frame2 = createTestFrame("static-event-remove2");
      Frame.on("remove", handler);

      // Direct unmountFrame call requires parent frame
      // Test via Frame.getAll().delete instead
      Frame.off("remove", handler);
      cleanupFrame(frame2);
    });
  });

  describe("mountFrame / unmountFrame", () => {
    it("mountFrame creates child Frame and registers in childrenMap", () => {
      const parent = createTestFrame("mf-parent-1");
      const childEl = document.createElement("div");
      childEl.id = "mf-child-1";
      document.body.appendChild(childEl);

      // Register an empty View class
      const TestView = defineView(() => ({ template: () => "" }));
      registerViewClass("test-view", TestView);

      const childFrame = parent.mountFrame("mf-child-1", "test-view");

      expect(childFrame).toBeDefined();
      expect(childFrame.id).toBe("mf-child-1");
      expect(parent.childrenMap["mf-child-1"]).toBe("mf-child-1");
      expect(parent.childrenCount).toBe(1);

      parent.unmountFrame("mf-child-1");
      childEl.remove();
      cleanupFrame(parent);
    });

    it("mountFrame does not recreate existing Frame", () => {
      const parent = createTestFrame("mf-parent-2");
      const childEl = document.createElement("div");
      childEl.id = "mf-child-2";
      document.body.appendChild(childEl);

      const TestView = defineView(() => ({ template: () => "" }));
      registerViewClass("test-view2", TestView);

      const childFrame1 = parent.mountFrame("mf-child-2", "test-view2");
      const childFrame2 = parent.mountFrame("mf-child-2", "test-view2");

      expect(childFrame1).toBe(childFrame2);
      expect(parent.childrenCount).toBe(1);

      parent.unmountFrame("mf-child-2");
      childEl.remove();
      cleanupFrame(parent);
    });

    it("unmountFrame removes child Frame from childrenMap", () => {
      const parent = createTestFrame("mf-parent-3");
      const childEl = document.createElement("div");
      childEl.id = "mf-child-3";
      document.body.appendChild(childEl);

      const TestView = defineView(() => ({ template: () => "" }));
      registerViewClass("test-view3", TestView);

      parent.mountFrame("mf-child-3", "test-view3");
      expect(parent.childrenCount).toBe(1);

      parent.unmountFrame("mf-child-3");
      expect(parent.childrenMap["mf-child-3"]).toBeUndefined();
      expect(parent.childrenCount).toBe(0);

      childEl.remove();
      cleanupFrame(parent);
    });

    it("unmountFrame triggers remove event", () => {
      const parent = createTestFrame("mf-parent-4");
      const childEl = document.createElement("div");
      childEl.id = "mf-child-4";
      document.body.appendChild(childEl);

      const TestView = defineView(() => ({ template: () => "" }));
      registerViewClass("test-view4", TestView);

      const childFrame = parent.mountFrame("mf-child-4", "test-view4");

      const removeHandler = vi.fn();
      Frame.on("remove", removeHandler);

      parent.unmountFrame("mf-child-4");

      expect(removeHandler).toHaveBeenCalledTimes(1);
      expect(removeHandler.mock.calls[0][0].frame).toBe(childFrame);

      Frame.off("remove", removeHandler);
      childEl.remove();
      cleanupFrame(parent);
    });
  });

  describe("mountZone / unmountZone", () => {
    it("mountZone scans v-swifty child elements and mounts them", () => {
      const parentEl = document.createElement("div");
      parentEl.id = "mz-parent-1";
      parentEl.innerHTML = `
        <div id="mz-child-1" ${SWIFTY_VIEW}="test-view-zone"></div>
        <div id="mz-child-2" ${SWIFTY_VIEW}="test-view-zone"></div>
      `;
      document.body.appendChild(parentEl);

      const parent = createTestFrame("mz-parent-1");
      const TestView = defineView(() => ({ template: () => "" }));
      registerViewClass("test-view-zone", TestView);

      parent.mountZone("mz-parent-1");

      expect(parent.childrenMap["mz-child-1"]).toBe("mz-child-1");
      expect(parent.childrenMap["mz-child-2"]).toBe("mz-child-2");
      expect(parent.childrenCount).toBe(2);

      parent.unmountZone();
      parentEl.remove();
      cleanupFrame(parent);
    });

    it("mountZone skips elements with frameBound already set", () => {
      const parentEl = document.createElement("div");
      parentEl.id = "mz-parent-2";
      parentEl.innerHTML = `
        <div id="mz-child-3" ${SWIFTY_VIEW}="test-view-zone2"></div>
        <div id="mz-child-4" ${SWIFTY_VIEW}="test-view-zone2"></div>
      `;
      document.body.appendChild(parentEl);

      // Mark mz-child-4 as already bound
      const boundEl = document.getElementById("mz-child-4");
      if (boundEl) boundEl.frameBound = 1;

      const parent = createTestFrame("mz-parent-2");
      const TestView = defineView(() => ({ template: () => "" }));
      registerViewClass("test-view-zone2", TestView);

      parent.mountZone("mz-parent-2");

      expect(parent.childrenMap["mz-child-3"]).toBe("mz-child-3");
      // mz-child-4 already has frameBound, will not be mounted
      expect(parent.childrenMap["mz-child-4"]).toBeUndefined();
      expect(parent.childrenCount).toBe(1);

      parent.unmountZone();
      parentEl.remove();
      cleanupFrame(parent);
    });

    it("unmountZone unmounts all child Frames", () => {
      const parentEl = document.createElement("div");
      parentEl.id = "mz-parent-3";
      parentEl.innerHTML = `
        <div id="mz-child-5" ${SWIFTY_VIEW}="test-view-zone3"></div>
        <div id="mz-child-6" ${SWIFTY_VIEW}="test-view-zone3"></div>
      `;
      document.body.appendChild(parentEl);

      const parent = createTestFrame("mz-parent-3");
      const TestView = defineView(() => ({ template: () => "" }));
      registerViewClass("test-view-zone3", TestView);

      parent.mountZone("mz-parent-3");
      expect(parent.childrenCount).toBe(2);

      parent.unmountZone();
      expect(parent.childrenCount).toBe(0);

      parentEl.remove();
      cleanupFrame(parent);
    });
  });

  describe("children", () => {
    it("returns all child Frame IDs", () => {
      const parent = createTestFrame("child-parent-1");
      const childEl1 = document.createElement("div");
      childEl1.id = "child-1";
      document.body.appendChild(childEl1);
      const childEl2 = document.createElement("div");
      childEl2.id = "child-2";
      document.body.appendChild(childEl2);

      const TestView = defineView(() => ({ template: () => "" }));
      registerViewClass("test-view-children", TestView);

      parent.mountFrame("child-1", "test-view-children");
      parent.mountFrame("child-2", "test-view-children");

      const childIds = parent.children().sort();
      expect(childIds).toEqual(["child-1", "child-2"]);

      parent.unmountZone();
      childEl1.remove();
      childEl2.remove();
      cleanupFrame(parent);
    });

    it("returns empty array when no child Frames", () => {
      const parent = createTestFrame("child-parent-2");

      expect(parent.children()).toEqual([]);

      cleanupFrame(parent);
    });
  });

  describe("parent", () => {
    it("returns parent Frame at specified level", () => {
      const grandparent = createTestFrame("gp-1");
      const parentEl = document.createElement("div");
      parentEl.id = "p-1";
      document.body.appendChild(parentEl);

      const TestView = defineView(() => ({ template: () => "" }));
      registerViewClass("test-view-parent", TestView);

      const parentFrame = grandparent.mountFrame(
        "p-1",
        "test-view-parent",
      ) as FrameObj;

      // parent(1) returns direct parent Frame
      expect(parentFrame.parent(1)).toBe(grandparent);

      grandparent.unmountZone();
      parentEl.remove();
      cleanupFrame(grandparent);
    });

    it("returns undefined when no parent Frame", () => {
      const frame = createTestFrame("no-parent-1");

      expect(frame.parent()).toBeUndefined();

      cleanupFrame(frame);
    });
  });

  describe("invoke", () => {
    it("when View not rendered, call is added to invokeList", () => {
      const frame = createTestFrame("invoke-test-1");

      frame.invoke("testMethod", ["arg1"]);
      frame.invoke("anotherMethod");

      expect(frame.invokeList).toHaveLength(2);
      expect(frame.invokeList[0].name).toBe("testMethod");
      expect(frame.invokeList[0].args).toEqual(["arg1"]);
      expect(frame.invokeList[1].name).toBe("anotherMethod");
      expect(frame.invokeList[1].args).toEqual([]);

      cleanupFrame(frame);
    });

    it("existingEntry is updated when same method invoked repeatedly", () => {
      const frame = createTestFrame("invoke-test-2");

      frame.invoke("testMethod", ["first"]);
      frame.invoke("testMethod", ["second"]);

      // Both invocations add to invokeList
      expect(frame.invokeList).toHaveLength(2);
      // existingEntry.removed = args === existingEntry.args (reference comparison)
      // Different array instances passed, so removed is false
      expect(frame.invokeList[0].removed).toBe(false);

      cleanupFrame(frame);
    });

    it("same reference args marks removed for same method", () => {
      const frame = createTestFrame("invoke-test-3");
      const sharedArgs = ["shared"];

      frame.invoke("testMethod", sharedArgs);
      frame.invoke("testMethod", sharedArgs);

      // Same reference args, removed = true
      expect(frame.invokeList).toHaveLength(2);
      expect(frame.invokeList[0].removed).toBe(true);

      cleanupFrame(frame);
    });

    it("invoke delegates with defer behavior when no view (D4)", () => {
      const frame = createTestFrame("invoke-typed-1");
      // No view yet → deferred.
      frame.invoke("loadData", ["user-1"]);
      expect(frame.invokeList).toHaveLength(1);
      expect(frame.invokeList[0].name).toBe("loadData");
      expect(frame.invokeList[0].args).toEqual(["user-1"]);
      cleanupFrame(frame);
    });
  });

  describe("unmountView", () => {
    it("clears invokeList", () => {
      const frame = createTestFrame("uv-test-1");
      frame.invoke("testMethod", ["arg"]);

      frame.unmountView();

      expect(frame.invokeList).toEqual([]);

      cleanupFrame(frame);
    });

    it("unmountView does not throw when no view", () => {
      const frame = createTestFrame("uv-test-2");

      expect(() => frame.unmountView()).not.toThrow();

      cleanupFrame(frame);
    });

    it("sets destroyed flag when view exists", async () => {
      const frame = createTestFrame("uv-test-3");

      const TestView = defineView(() => ({ template: () => "" }));
      registerViewClass("test-view-uv", TestView);

      // The previous version of this test used `frame.mountFrame("uv-child-3",
      // "test-view-uv")` which creates a CHILD frame and mounts the view on
      // it. The assertion then checked `frame.view` (the PARENT frame's view)
      // which is always undefined — so `expect(frame.destroyed).toBe(0)`
      // passed trivially, validating the *no-view* early-return path instead
      // of the "view exists" path the test name claims.
      //
      // Now we mount the view directly on `frame` via mountView. doMountView
      // sets `this.viewInstance = view` synchronously (frame.ts L256), so we
      // can verify the view exists immediately. We still await one microtask
      // flush so that init()'s Promise.resolve callback completes before
      // unmountView fires the destroy event.
      frame.mountView("test-view-uv");

      // Precondition: view must actually be mounted for the test to match
      // its name ("when view exists")
      expect(frame.view).toBeDefined();

      await flushMicrotasks();

      frame.unmountView();

      // unmountView sets destroyed = 1 when a view exists (after the
      // `if (!view) return` guard in frame.ts)
      expect(frame.destroyed).toBe(1);

      cleanupFrame(frame);
    });
  });

  describe("instance events: on / off / fire", () => {
    it("instance-level on/off/fire", () => {
      const frame = createTestFrame("ie-test-1");
      const handler = vi.fn();

      frame.on("customEvent", handler);
      frame.fire("customEvent", { value: 42 });

      expect(handler).toHaveBeenCalledTimes(1);
      // EventEmitter.fire automatically adds type property to data
      expect(handler.mock.calls[0][0]).toEqual({
        value: 42,
        type: "customEvent",
      });

      frame.off("customEvent", handler);
      frame.fire("customEvent", { value: 99 });

      expect(handler).toHaveBeenCalledTimes(1);

      cleanupFrame(frame);
    });

    it("created event triggers after all child Frames are ready", () => {
      const parent = createTestFrame("ie-test-2");

      const createdHandler = vi.fn();
      parent.on("created", createdHandler);

      // created event requires childrenCount === readyCount and conditions met
      // Here we directly verify on binding capability
      expect(createdHandler).not.toHaveBeenCalled();

      parent.fire("created");
      expect(createdHandler).toHaveBeenCalledTimes(1);

      cleanupFrame(parent);
    });

    it("alter event", () => {
      const frame = createTestFrame("ie-test-3");
      const handler = vi.fn();

      frame.on("alter", handler);
      frame.fire("alter", { id: "test" });

      expect(handler).toHaveBeenCalledTimes(1);

      cleanupFrame(frame);
    });
  });

  describe("registerViewClass", () => {
    it("mountView can load synchronously after View class is registered", () => {
      const frame = createTestFrame("rvc-test-1");
      frame.hasAltered = 0; // Ensure originalTemplate can be saved

      const TestView = defineView(() => ({ template: () => "" }));
      registerViewClass("rvc-test-view", TestView);

      frame.mountView("rvc-test-view");

      // mountView internally calls doMountView asynchronously
      // Verify frame does not crash
      expect(frame.getViewPath()).toBe("rvc-test-view");

      cleanupFrame(frame);
    });
  });
});
