import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineView } from "../src/view";
import {
  Frame,
  createFrame,
  registerViewClass,
  invalidateViewClass,
  getViewClassRegistry,
} from "../src/frame";
import { refFn } from "../src/common";
import type { FrameObj, ViewTemplate } from "../src/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function makeFrame(id: string): FrameObj {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id);
}

function cleanup(): void {
  for (const [id] of Frame.getAll()) {
    const el = document.getElementById(id);
    if (el) el.remove();
    Frame.getAll().delete(id);
  }
}

function findChild(parentFrame: FrameObj): FrameObj | undefined {
  return Array.from(Frame.getAll().values()).find(
    (f) => f.parentId === parentFrame.id && f.getViewPath(),
  );
}

/**
 * Create a parent template that uses refFn to pass an object/array prop —
 * simulating what the compiled {{@value}} expression does at runtime.
 *
 * The returned template function receives (data, viewId, refData) and calls
 * refFn(refData, data[key], "") to store the value and get a SPLITTER token.
 * The token is rendered into the p-swifty-attribute.
 */
function makeRefPropTemplate(propName: string, dataKey: string): ViewTemplate {
  return (data: unknown, _viewId: string, refData: unknown) => {
    const d = (data || {}) as Record<string, unknown>;
    const ref = refData as Record<string, unknown>;
    const token = refFn(ref, d[dataKey], "");
    return `<div v-swifty="test/child" p-swifty-${propName}="${token}"></div>`;
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("v-swifty Props & Events", () => {
  beforeEach(() => {
    const reg = getViewClassRegistry();
    for (const key of Object.keys(reg)) invalidateViewClass(key);
  });

  afterEach(() => cleanup());

  // ============================================================
  // 1. String Props
  // ============================================================
  describe("string props", () => {
    it("passes string prop to child setup params", async () => {
      let received = "";
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          received = String(p["msg"] ?? "");
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ greeting: "hello" });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              return `<div v-swifty="test/child" p-swifty-msg="${d["greeting"]}"></div>`;
            },
          };
        }),
      );

      const frame = makeFrame("s1");
      frame.mountView("test/parent");
      await flush();

      expect(received).toBe("hello");
    });

    it("updates child props when parent re-renders", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          ctx.updater.digest({ msg: String(p["msg"] ?? "") });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              return `<div data-msg="${d["msg"] ?? ""}">child</div>`;
            },
          };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ greeting: "first" });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              return `<div v-swifty="test/child" p-swifty-msg="${d["greeting"]}"></div>`;
            },
          };
        }),
      );

      const frame = makeFrame("s2");
      frame.mountView("test/parent");
      await flush();

      // Natural update: set + digest → re-render → mountZone pushes new props
      frame.view!.updater.set({ greeting: "second" }).digest();
      await flush();

      const childView = findChild(frame)?.view;
      expect(childView?.updater.get<string>("msg")).toBe("second");
    });

    it("handles empty string prop", async () => {
      let received = "UNSET";
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          received = String(
            (params as Record<string, unknown>)?.["val"] ?? "UNSET",
          );
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ val: "" });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              return `<div v-swifty="test/child" p-swifty-val="${d["val"]}"></div>`;
            },
          };
        }),
      );

      const frame = makeFrame("s3");
      frame.mountView("test/parent");
      await flush();

      expect(received).toBe("");
    });
  });

  // ============================================================
  // 2. Object/Array Props (via {{@value}} → refFn)
  // ============================================================
  describe("object/array props", () => {
    it("passes array reference to child", async () => {
      let received: unknown = null;
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          received = p["history"];
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      const history = ["a", "b", "c"];
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ history });
          return { template: makeRefPropTemplate("history", "history") };
        }),
      );

      const frame = makeFrame("o1");
      frame.mountView("test/parent");
      await flush();

      expect(received).toBe(history);
      expect(received).toEqual(["a", "b", "c"]);
    });

    it("passes object reference to child", async () => {
      let received: unknown = null;
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          received = p["config"];
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      const config = { theme: "dark", timeout: 5000 };
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ config });
          return { template: makeRefPropTemplate("config", "config") };
        }),
      );

      const frame = makeFrame("o2");
      frame.mountView("test/parent");
      await flush();

      expect(received).toBe(config);
      expect(received).toEqual({ theme: "dark", timeout: 5000 });
    });

    it("updates child when parent pushes to array", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          const h = Array.isArray(p["history"]) ? p["history"] : [];
          ctx.updater.digest({ history: h });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              const arr = (d["history"] as unknown[]) || [];
              return `<div data-len="${arr.length}">${arr.length}</div>`;
            },
          };
        }),
      );

      const arr: string[] = ["a"];
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ history: arr });
          return { template: makeRefPropTemplate("history", "history") };
        }),
      );

      const frame = makeFrame("o3");
      frame.mountView("test/parent");
      await flush();

      const childEl3 = document
        .getElementById("o3")!
        .querySelector("[data-len]");
      expect(childEl3?.getAttribute("data-len")).toBe("1");

      arr.push("b", "c");
      frame.view!.updater.set({ history: arr }).digest();
      await flush();

      const childEl3b = document
        .getElementById("o3")!
        .querySelector("[data-len]");
      expect(childEl3b?.getAttribute("data-len")).toBe("3");
    });

    it("updates child when parent pops from array", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          const h = Array.isArray(p["history"]) ? p["history"] : [];
          ctx.updater.digest({ history: h });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              const arr = (d["history"] as unknown[]) || [];
              return `<div data-len="${arr.length}">${arr.length}</div>`;
            },
          };
        }),
      );

      const arr = ["x", "y", "z"];
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ history: arr });
          return { template: makeRefPropTemplate("history", "history") };
        }),
      );

      const frame = makeFrame("o4");
      frame.mountView("test/parent");
      await flush();

      const el4 = document.getElementById("o4")!.querySelector("[data-len]");
      expect(el4?.getAttribute("data-len")).toBe("3");

      arr.pop();
      frame.view!.updater.set({ history: arr }).digest();
      await flush();

      const el4b = document.getElementById("o4")!.querySelector("[data-len]");
      expect(el4b?.getAttribute("data-len")).toBe("2");
    });

    it("updates child when array length changes", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          const h = Array.isArray(p["items"]) ? p["items"] : [];
          ctx.updater.digest({ items: h });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              const arr = (d["items"] as unknown[]) || [];
              return `<div data-len="${arr.length}">${arr.length}</div>`;
            },
          };
        }),
      );

      const items = [1, 2, 3];
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ items });
          return { template: makeRefPropTemplate("items", "items") };
        }),
      );

      const frame = makeFrame("o5");
      frame.mountView("test/parent");
      await flush();

      const el5 = document.getElementById("o5")!.querySelector("[data-len]");
      expect(el5?.getAttribute("data-len")).toBe("3");

      items.length = 1;
      frame.view!.updater.set({ items }).digest();
      await flush();

      const el5b = document.getElementById("o5")!.querySelector("[data-len]");
      expect(el5b?.getAttribute("data-len")).toBe("1");
    });

    it("updates child when object property is added", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          const c = (p["config"] as Record<string, unknown>) || {};
          ctx.updater.digest({ config: c });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              const c = (d["config"] as Record<string, unknown>) || {};
              const keys = Object.keys(c).join(",");
              return `<div data-keys="${keys}">${keys}</div>`;
            },
          };
        }),
      );

      const config: Record<string, unknown> = { theme: "dark" };
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ config });
          return { template: makeRefPropTemplate("config", "config") };
        }),
      );

      const frame = makeFrame("o6");
      frame.mountView("test/parent");
      await flush();

      const el6 = document.getElementById("o6")!.querySelector("[data-keys]");
      expect(el6?.getAttribute("data-keys")).toBe("theme");

      config["timeout"] = 5000;
      frame.view!.updater.set({ config }).digest();
      await flush();

      const el6b = document.getElementById("o6")!.querySelector("[data-keys]");
      expect(el6b?.getAttribute("data-keys")).toBe("theme,timeout");
    });

    it("updates child when object property is deleted", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          const c = (p["config"] as Record<string, unknown>) || {};
          ctx.updater.digest({ config: c });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              const c = (d["config"] as Record<string, unknown>) || {};
              const keys = Object.keys(c).join(",");
              return `<div data-keys="${keys}">${keys}</div>`;
            },
          };
        }),
      );

      const config: Record<string, unknown> = { theme: "dark", timeout: 5000 };
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ config });
          return { template: makeRefPropTemplate("config", "config") };
        }),
      );

      const frame = makeFrame("o7");
      frame.mountView("test/parent");
      await flush();

      const el7 = document.getElementById("o7")!.querySelector("[data-keys]");
      expect(el7?.getAttribute("data-keys")).toBe("theme,timeout");

      delete config["timeout"];
      frame.view!.updater.set({ config }).digest();
      await flush();

      const el7b = document.getElementById("o7")!.querySelector("[data-keys]");
      expect(el7b?.getAttribute("data-keys")).toBe("theme");
    });

    it("passes null/undefined as raw string when not a ref token", async () => {
      let received = "UNSET";
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          received = String(p["val"] ?? "UNSET");
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ val: "null" });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              return `<div v-swifty="test/child" p-swifty-val="${d["val"]}"></div>`;
            },
          };
        }),
      );

      const frame = makeFrame("o8");
      frame.mountView("test/parent");
      await flush();

      expect(received).toBe("null");
    });
  });

  // ============================================================
  // 3. Event Binding (child → parent)
  // ============================================================
  describe("event binding", () => {
    it("calls parent handler when child fires event", async () => {
      const handler = vi.fn();
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: () => "<div>child</div>",
            events: {
              "fire<click>": () => {
                ctx.owner.fire("customEvent");
              },
            },
          };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: () =>
              `<div v-swifty="test/child" e-swifty-customEvent="onCustom"></div>`,
            events: { "onCustom<click>": handler },
          };
        }),
      );

      const frame = makeFrame("e1");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("customEvent");
      await flush();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("passes data from child to parent handler", async () => {
      let received: unknown;
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: () => "<div>child</div>",
            events: {
              "fire<click>": () => {
                ctx.owner.fire("dataEvent", { value: 42 });
              },
            },
          };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: () =>
              `<div v-swifty="test/child" e-swifty-dataEvent="onData"></div>`,
            events: {
              "onData<click>": (data: Record<string, unknown>) => {
                received = data;
              },
            },
          };
        }),
      );

      const frame = makeFrame("e2");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("dataEvent", { value: 42 });
      await flush();

      expect((received as Record<string, unknown>)["value"]).toBe(42);
    });

    it("supports async parent handler", async () => {
      const results: string[] = [];
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: () => "<div>child</div>",
            events: {
              "fire<click>": () => {
                ctx.owner.fire("asyncEvent");
              },
            },
          };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: () =>
              `<div v-swifty="test/child" e-swifty-asyncEvent="onAsync"></div>`,
            events: {
              "onAsync<click>": () => {
                return new Promise<void>((resolve) => {
                  setTimeout(() => {
                    results.push("done");
                    resolve();
                  }, 10);
                });
              },
            },
          };
        }),
      );

      const frame = makeFrame("e3");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("asyncEvent");
      await new Promise((r) => setTimeout(r, 50));

      expect(results).toContain("done");
    });

    it("matches camelCase event names case-insensitively", async () => {
      const handler = vi.fn();
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: () => "<div>child</div>",
            events: {
              "fire<click>": () => {
                ctx.owner.fire("clearHistory");
              },
            },
          };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            // HTML lowercases attr name: e-swifty-clearHistory → e-swifty-clearhistory
            // Emitter matches case-insensitively: fire("clearHistory") matches on("clearhistory")
            template: () =>
              `<div v-swifty="test/child" e-swifty-clearHistory="onClear"></div>`,
            events: { "onClear<click>": handler },
          };
        }),
      );

      const frame = makeFrame("e4");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("clearHistory");
      await flush();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("maps different event name to handler name", async () => {
      const handler = vi.fn();
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: () => "<div>child</div>",
            events: {
              "fire<click>": () => {
                ctx.owner.fire("childEvent");
              },
            },
          };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: () =>
              `<div v-swifty="test/child" e-swifty-childEvent="parentHandler"></div>`,
            events: { "parentHandler<click>": handler },
          };
        }),
      );

      const frame = makeFrame("e5");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("childEvent");
      await flush();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not crash when no matching handler in parent", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: () => "<div>child</div>",
            events: {
              "fire<click>": () => {
                ctx.owner.fire("noHandler");
              },
            },
          };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: () =>
              `<div v-swifty="test/child" e-swifty-noHandler="nonExistent"></div>`,
            events: {},
          };
        }),
      );

      const frame = makeFrame("e6");
      frame.mountView("test/parent");
      await flush();

      expect(() =>
        findChild(frame)?.view?.owner.fire("noHandler"),
      ).not.toThrow();
    });
  });

  // ============================================================
  // 4. Multiple Props & Edge Cases
  // ============================================================
  describe("multiple props & edge cases", () => {
    it("passes multiple props simultaneously", async () => {
      let received: Record<string, unknown> = {};
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          received = { ...(params || {}) } as Record<string, unknown>;
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ a: "valA", b: "valB", c: "valC" });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              return `<div v-swifty="test/child" p-swifty-a="${d["a"]}" p-swifty-b="${d["b"]}" p-swifty-c="${d["c"]}"></div>`;
            },
          };
        }),
      );

      const frame = makeFrame("m1");
      frame.mountView("test/parent");
      await flush();

      expect(received["a"]).toBe("valA");
      expect(received["b"]).toBe("valB");
      expect(received["c"]).toBe("valC");
    });

    it("does not call digest on child when no p-swifty-attributes", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({ msg: "child" });
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ msg: "parent" });
          return { template: () => `<div v-swifty="test/child"></div>` };
        }),
      );

      const frame = makeFrame("m2");
      frame.mountView("test/parent");
      await flush();

      const childView = findChild(frame)?.view;
      const spy = vi.spyOn(childView!.updater, "digest");
      frame.view!.updater.set({ msg: "updated" }).digest();
      await flush();

      expect(spy).not.toHaveBeenCalled();
    });

    it("preserves child's own data when updating props", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          ctx.updater.digest({
            count: Number(p["count"]) || 0,
            styles: { color: "red" },
            msg: "child",
          });
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ count: 5 });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              return `<div v-swifty="test/child" p-swifty-count="${d["count"]}"></div>`;
            },
          };
        }),
      );

      const frame = makeFrame("m3");
      frame.mountView("test/parent");
      await flush();

      frame.view!.updater.set({ count: 10 }).digest();
      await flush();

      const childView = findChild(frame)?.view;
      expect(childView?.updater.get<unknown>("styles")).toEqual({
        color: "red",
      });
      expect(childView?.updater.get<string>("msg")).toBe("child");
    });
  });
});
