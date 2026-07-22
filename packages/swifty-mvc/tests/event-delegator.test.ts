import { describe, it, expect, vi, afterEach } from "vitest";
import { EventDelegator } from "../src/event-delegator";

describe("EventDelegator", () => {
  // Track bindings for cleanup
  const boundTypes: string[] = [];

  afterEach(() => {
    for (const type of boundTypes) {
      EventDelegator.unbind(type);
    }
    boundTypes.length = 0;
  });

  describe("bind / unbind", () => {
    it("bind attaches event listener to document.body", () => {
      const addSpy = vi.spyOn(document.body, "addEventListener");
      EventDelegator.bind("test-bind-1");
      boundTypes.push("test-bind-1");
      expect(addSpy).toHaveBeenCalledWith(
        "test-bind-1",
        expect.any(Function),
        true,
      );
      addSpy.mockRestore();
    });

    it("bind increments reference count", () => {
      // Bind twice for the same event type
      EventDelegator.bind("test-bind-ref");
      EventDelegator.bind("test-bind-ref");
      boundTypes.push("test-bind-ref"); // Only push once for cleanup

      const removeSpy = vi.spyOn(document.body, "removeEventListener");
      // First unbind should NOT remove (ref count > 1)
      EventDelegator.unbind("test-bind-ref");
      expect(removeSpy).not.toHaveBeenCalled();

      // Second unbind should remove (ref count = 0)
      EventDelegator.unbind("test-bind-ref");
      expect(removeSpy).toHaveBeenCalledWith(
        "test-bind-ref",
        expect.any(Function),
        true,
      );
      removeSpy.mockRestore();
      boundTypes.length = 0; // Already cleaned up
    });

    it("unbind removes listener when count reaches 0", () => {
      EventDelegator.bind("test-unbind");
      const removeSpy = vi.spyOn(document.body, "removeEventListener");
      EventDelegator.unbind("test-unbind");
      expect(removeSpy).toHaveBeenCalled();
      removeSpy.mockRestore();
    });

    it("bind with hasSelector=true tracks selector events", () => {
      EventDelegator.bind("test-selector", true);
      boundTypes.push("test-selector");
      // The selector tracking is internal, but we can verify by unbinding with hasSelector
      // and checking no error is thrown
      EventDelegator.unbind("test-selector", true);
      boundTypes.length = 0;
    });

    it("unbind for non-existent event type does not throw", () => {
      expect(() => {
        EventDelegator.unbind("nonexistent-event-xyz");
      }).not.toThrow();
    });
  });

  describe("setFrameGetter", () => {
    it("accepts a getter function", () => {
      expect(() => {
        EventDelegator.setFrameGetter(
          (_id: string, _unused: void) => undefined,
        );
      }).not.toThrow();
    });
  });
});
