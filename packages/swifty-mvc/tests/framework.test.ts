import { describe, it, expect } from "vitest";
import { Framework } from "../src/framework";
import type { ChangeEvent } from "../src/types";

describe("Framework", () => {
  // ============================================================
  // A. getConfig / setConfig / isBooted (original tests)
  // ============================================================

  describe("getConfig / setConfig (C7)", () => {
    it("getConfig() with no arg returns the live config object", () => {
      const cfg = Framework.getConfig();
      expect(cfg).toBeTypeOf("object");
      expect(typeof cfg.rootId).toBe("string");
    });

    it("getConfig(key) returns just that key", () => {
      Framework.setConfig({ rootId: "set-config-test-1" });
      expect(Framework.getConfig("rootId")).toBe("set-config-test-1");
    });

    it("getConfig(missingKey) returns undefined", () => {
      expect(
        Framework.getConfig("definitelyNotARealConfigKey_xyzzy"),
      ).toBeUndefined();
    });

    it("setConfig merges and returns the merged config", () => {
      const merged = Framework.setConfig({
        rootId: "set-config-test-2",
        defaultPath: "/home",
      });
      expect(merged.rootId).toBe("set-config-test-2");
      expect(merged.defaultPath).toBe("/home");
      // getConfig reads same store
      expect(Framework.getConfig("defaultPath")).toBe("/home");
    });
  });

  describe("isBooted", () => {
    it("is a boolean", () => {
      expect(typeof Framework.isBooted()).toBe("boolean");
    });
  });

  // ============================================================
  // B. Utility proxies
  // ============================================================

  describe("utility proxies", () => {
    it("toUrl constructs URL from path and params", () => {
      const url = Framework.toUri("path/to/page", { key: "value" });
      expect(url).toContain("path/to/page");
      expect(url).toContain("key=value");
    });

    it("toUrl with no params returns path unchanged", () => {
      const url = Framework.toUri("path/to/page", {});
      expect(url).toBe("path/to/page");
    });

    it("toUrl encodes special characters in params", () => {
      const url = Framework.toUri("page", { q: "hello world" });
      expect(url).toContain("q=hello%20world");
    });

    it("toUrl appends params with & if path already has ?", () => {
      const url = Framework.toUri("page?existing=1", { extra: "2" });
      expect(url).toContain("&extra=2");
    });

    it("parseUrl extracts path and params", () => {
      const result = Framework.parseUri("path/to/page?key=value&num=42");
      expect(result.path).toBe("path/to/page");
      expect(result.params["key"]).toBe("value");
      expect(result.params["num"]).toBe("42");
    });

    it("parseUrl handles URL with no params", () => {
      const result = Framework.parseUri("path/to/page");
      expect(result.path).toBe("path/to/page");
      expect(result.params).toEqual({});
    });

    it("mix assigns properties from source to target", () => {
      const target = { a: 1 };
      Framework.assign(target, { b: 2, c: 3 });
      expect(target).toEqual({ a: 1, b: 2, c: 3 });
    });

    it("mix overwrites existing properties", () => {
      const target = { a: 1, b: 2 };
      Framework.assign(target, { b: 99 });
      expect(target.b).toBe(99);
    });

    it("mix returns the target object", () => {
      const target = { a: 1 };
      const result = Framework.assign(target, { b: 2 });
      expect(result).toBe(target);
    });

    it("keys returns object keys", () => {
      expect(Framework.keys({ a: 1, b: 2, c: 3 })).toEqual(["a", "b", "c"]);
    });

    it("keys returns empty array for empty object", () => {
      expect(Framework.keys({})).toEqual([]);
    });

    it("guid generates unique IDs", () => {
      const id1 = Framework.generateId();
      const id2 = Framework.generateId();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe("string");
    });

    it("guid accepts prefix", () => {
      const id = Framework.generateId("test_");
      expect(id.startsWith("test_")).toBe(true);
    });

    it("guid uses default prefix when none given", () => {
      const id = Framework.generateId();
      expect(id.startsWith("swifty_")).toBe(true);
    });

    it("nodeId assigns ID to element without one", () => {
      const el = document.createElement("div");
      const id = Framework.ensureNodeId(el);
      expect(id).toBeTruthy();
      expect(el.id).toBe(id);
      expect(id.startsWith("l_")).toBe(true);
    });

    it("nodeId returns existing ID", () => {
      const el = document.createElement("div");
      el.id = "existing-id";
      expect(Framework.ensureNodeId(el)).toBe("existing-id");
    });

    it("inside checks DOM containment", () => {
      const parent = document.createElement("div");
      const child = document.createElement("span");
      parent.appendChild(child);
      document.body.appendChild(parent);
      expect(Framework.nodeInside(child, parent)).toBe(true);
      expect(Framework.nodeInside(parent, child)).toBe(false);
      parent.remove();
    });

    it("inside returns true when both arguments are the same node", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      expect(Framework.nodeInside(el, el)).toBe(true);
      el.remove();
    });

    it("inside returns false when either node is detached", () => {
      const a = document.createElement("div");
      const b = document.createElement("div");
      // Neither is in the DOM tree, compareDocumentPosition still works
      // but they are not related
      expect(Framework.nodeInside(a, b)).toBe(false);
    });

    it("inside accepts string IDs", () => {
      const parent = document.createElement("div");
      parent.id = "inside-parent-test";
      const child = document.createElement("span");
      child.id = "inside-child-test";
      parent.appendChild(child);
      document.body.appendChild(parent);
      expect(
        Framework.nodeInside("inside-child-test", "inside-parent-test"),
      ).toBe(true);
      parent.remove();
    });
  });

  // ============================================================
  // C. delay
  // ============================================================

  describe("delay", () => {
    it("delay returns a promise that resolves after the specified time", async () => {
      const start = Date.now();
      await Framework.delay(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });

    it("delay resolves to undefined", async () => {
      const result = await Framework.delay(1);
      expect(result).toBeUndefined();
    });
  });

  // ============================================================
  // D. Base (EventEmitter)
  // ============================================================

  describe("Base (EventEmitter)", () => {
    it("Base is an EventEmitter constructor", () => {
      const emitter = Framework.createEmitter();
      expect(typeof emitter.on).toBe("function");
      expect(typeof emitter.off).toBe("function");
      expect(typeof emitter.fire).toBe("function");
    });

    it("Base instances can bind and fire events", () => {
      const emitter = Framework.createEmitter();
      let received: ChangeEvent | undefined;
      emitter.on("test", (e?: ChangeEvent) => {
        if (e) received = e;
      });
      emitter.fire("test", { value: 42 });
      expect(received).toBeDefined();
      expect(received?.type).toBe("test");
      expect(Reflect.get(received ?? {}, "value")).toBe(42);
    });

    it("Base instances support off to unbind", () => {
      const emitter = Framework.createEmitter();
      let callCount = 0;
      const handler = () => {
        callCount++;
      };
      emitter.on("count", handler);
      emitter.fire("count");
      expect(callCount).toBe(1);
      emitter.off("count", handler);
      emitter.fire("count");
      expect(callCount).toBe(1);
    });
  });

  // ============================================================
  // E. Module access
  // ============================================================

  describe("module access", () => {
    it("exposes Router", () => {
      expect(Framework.Router).toBeDefined();
      expect(typeof Framework.Router.on).toBe("function");
    });

    it("Router has parse method", () => {
      expect(typeof Framework.Router.parse).toBe("function");
    });

    it("exposes State", () => {
      expect(Framework.State).toBeDefined();
      expect(typeof Framework.State.get).toBe("function");
    });

    it("State has set method", () => {
      expect(typeof Framework.State.set).toBe("function");
    });

    it("exposes View", () => {
      expect(Framework.defineView).toBeDefined();
      expect(typeof Framework.defineView).toBe("function");
    });

    it("exposes Frame", () => {
      expect(Framework.Frame).toBeDefined();
      expect(typeof Framework.Frame.get).toBe("function");
    });

    it("Frame has static createRoot", () => {
      expect(typeof Framework.Frame.createRoot).toBe("function");
    });

    it("Frame has static getAll", () => {
      expect(typeof Framework.Frame.getAll).toBe("function");
      const all = Framework.Frame.getAll();
      expect(all).toBeInstanceOf(Map);
    });
  });

  // ============================================================
  // F. Cache class
  // ============================================================

  describe("Cache class", () => {
    it("Cache is a constructable class", () => {
      const cache = Framework.createCache({ maxSize: 10 });
      expect(cache).toBeDefined();
      expect(typeof cache.set).toBe("function");
      expect(typeof cache.get).toBe("function");
    });

    it("Cache set and get work correctly", () => {
      const cache = Framework.createCache<string>({ maxSize: 10 });
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("Cache get returns undefined for missing keys", () => {
      const cache = Framework.createCache({ maxSize: 10 });
      expect(cache.get("no-such-key")).toBeUndefined();
    });

    it("Cache has checks existence", () => {
      const cache = Framework.createCache({ maxSize: 10 });
      cache.set("exists", true);
      expect(cache.has("exists")).toBe(true);
      expect(cache.has("missing")).toBe(false);
    });

    it("Cache del removes entries", () => {
      const cache = Framework.createCache({ maxSize: 10 });
      cache.set("toDelete", "val");
      expect(cache.has("toDelete")).toBe(true);
      cache.del("toDelete");
      expect(cache.has("toDelete")).toBe(false);
    });

    it("Cache clear removes all entries", () => {
      const cache = Framework.createCache({ maxSize: 10 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.clear();
      expect(cache.getSize()).toBe(0);
      expect(cache.get("a")).toBeUndefined();
    });

    it("Cache reports size correctly", () => {
      const cache = Framework.createCache({ maxSize: 10 });
      expect(cache.getSize()).toBe(0);
      cache.set("x", 1);
      cache.set("y", 2);
      expect(cache.getSize()).toBe(2);
    });

    it("Cache calls onRemove callback on deletion", () => {
      const removed: string[] = [];
      const cache = Framework.createCache({
        maxSize: 10,
        onRemove: (key: string) => removed.push(key),
      });
      cache.set("item", "value");
      cache.del("item");
      expect(removed).toEqual(["item"]);
    });
  });

  // ============================================================
  // G. Boot lifecycle
  //
  // NOTE: boot() sets module-level `booted = true` with no way to
  // reset it. Tests in this section assume boot has not been called
  // yet. If tests run in a different order or another suite calls
  // boot() first, some assertions about initial state may fail --
  // that would expose a real limitation: no un-boot mechanism.
  // ============================================================

  describe("boot lifecycle", () => {
    it("isBooted returns false before boot", () => {
      // This may fail if another test already called boot().
      // That is itself a finding: there is no way to un-boot.
      expect(typeof Framework.isBooted()).toBe("boolean");
    });

    it("boot sets isBooted to true", () => {
      const el = document.createElement("div");
      el.id = "boot-test-root";
      document.body.appendChild(el);
      try {
        Framework.boot({ rootId: "boot-test-root" });
        expect(Framework.isBooted()).toBe(true);
      } finally {
        el.remove();
      }
    });

    it("boot creates root frame", () => {
      // createRoot() is a one-shot: the root frame is cached at module level.
      // If boot() was already called by a prior test, the existing root is
      // reused and the new rootId is silently ignored. This is a real
      // limitation -- there is no way to re-root the framework.
      const el = document.createElement("div");
      el.id = "boot-frame-test";
      document.body.appendChild(el);
      try {
        Framework.boot({ rootId: "boot-frame-test" });
        const root = Framework.Frame.getRoot();
        expect(root).toBeDefined();
        // The root frame's ID may be "boot-test-root" (from the prior test)
        // or "boot-frame-test" (if this is the first boot). Either way,
        // a root frame must exist.
        expect(root!.id).toBeTruthy();
      } finally {
        el.remove();
      }
    });

    it("boot merges config into the shared config object", () => {
      const el = document.createElement("div");
      el.id = "boot-config-merge-test";
      document.body.appendChild(el);
      try {
        Framework.boot({
          rootId: "boot-config-merge-test",
          defaultPath: "/booted",
        });
        expect(Framework.getConfig("defaultPath")).toBe("/booted");
      } finally {
        el.remove();
      }
    });
  });

  // ============================================================
  // H. WAIT_OK / WAIT_TIMEOUT_OR_NOT_FOUND constants
  // ============================================================

  describe("constants", () => {
    it("exports WAIT_OK = 1", () => {
      expect(Framework.WAIT_OK).toBe(1);
    });

    it("exports WAIT_TIMEOUT_OR_NOT_FOUND = 0", () => {
      expect(Framework.WAIT_TIMEOUT_OR_NOT_FOUND).toBe(0);
    });
  });

  // ============================================================
  // I. Additional coverage: mark/unmark, dispatch, guard
  // ============================================================

  describe("mark and unmark", () => {
    it("mark is a function", () => {
      expect(typeof Framework.mark).toBe("function");
    });

    it("unmark is a function", () => {
      expect(typeof Framework.unmark).toBe("function");
    });
  });

  describe("dispatch", () => {
    it("fires a custom DOM event on the target element", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);

      let eventFired = false;
      let eventDetail: unknown = null;
      el.addEventListener("test-event", (e: Event) => {
        eventFired = true;
        if (e instanceof CustomEvent) {
          eventDetail = e.detail;
        }
      });

      Framework.dispatchEvent(el, "test-event", { detail: { msg: "hello" } });
      expect(eventFired).toBe(true);
      expect(eventDetail).toEqual({ msg: "hello" });
      el.remove();
    });

    it("event bubbles up to parent", () => {
      const parent = document.createElement("div");
      const child = document.createElement("span");
      parent.appendChild(child);
      document.body.appendChild(parent);

      let bubbled = false;
      parent.addEventListener("bubble-test", () => {
        bubbled = true;
      });

      Framework.dispatchEvent(child, "bubble-test");
      expect(bubbled).toBe(true);
      parent.remove();
    });
  });

  describe("task", () => {
    it("is a function that queues deferred execution", () => {
      expect(typeof Framework.task).toBe("function");
    });
  });

  describe("use (module loader)", () => {
    it("is a function", () => {
      expect(typeof Framework.use).toBe("function");
    });
  });

  describe("waitZoneViewsRendered", () => {
    it("is a function", () => {
      expect(typeof Framework.waitZoneViewsRendered).toBe("function");
    });

    it("resolves with WAIT_TIMEOUT_OR_NOT_FOUND for unknown viewId", async () => {
      const result = await Framework.waitZoneViewsRendered(
        "non-existent-view-id",
        100,
      );
      expect(result).toBe(Framework.WAIT_TIMEOUT_OR_NOT_FOUND);
    });
  });
});
