import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hotSwapView,
  hotSwapFrames,
  hotSwapByTemplate,
  hotSwapByView,
} from "../src/hmr";
import {
  injectTemplateHmrSnippet,
  injectViewHmrSnippet,
  importsHtmlTemplate,
} from "../src/hmr-inject";
import { defineView } from "../src/view";
import {
  Frame,
  createFrame,
  registerViewClass,
  invalidateViewClass,
  getViewClassRegistry,
} from "../src/frame";
import type { FrameObj } from "../src/types";

/** Simple template factory for testing. */
function makeTemplate(label: string): (data: unknown) => string {
  return (data: unknown) => {
    const d = (data || {}) as Record<string, unknown>;
    return `<div class="${label}">count=${d["count"] ?? 0}</div>`;
  };
}

/** Flush microtasks so deferred renders complete. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createTestFrame(id: string): FrameObj {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id);
}

function cleanupFrame(frame: FrameObj): void {
  const el = document.getElementById(frame.id);
  if (el) el.remove();
  Frame.getAll().delete(frame.id);
}

describe("HMR", () => {
  beforeEach(() => {
    const reg = getViewClassRegistry();
    for (const key of Object.keys(reg)) invalidateViewClass(key);
  });

  afterEach(() => {
    for (const [id] of Frame.getAll()) {
      const el = document.getElementById(id);
      if (el) el.remove();
      Frame.getAll().delete(id);
    }
  });

  // ============================================================
  // hotSwapView
  // ============================================================
  describe("hotSwapView", () => {
    it("preserves updater.data across hot-swap", async () => {
      const frame = createTestFrame("hot-swap-preserve");
      const OldView = defineView(() => ({ template: makeTemplate("old") }));
      registerViewClass("test/preserve", OldView);
      frame.mountView("test/preserve");
      await flushMicrotasks();

      frame.view!.updater.set({ count: 42 }).digest();
      const NewView = defineView(() => ({ template: makeTemplate("new") }));
      const viewBefore = frame.view;

      hotSwapView(frame, NewView);

      expect(frame.view!.updater.get<number>("count")).toBe(42);
      expect(frame.view).toBe(viewBefore);
      expect(
        document.getElementById("hot-swap-preserve")!.querySelector(".new"),
      ).not.toBeNull();
      cleanupFrame(frame);
    });

    it("falls back to mountView when frame has no existing view", () => {
      const frame = createTestFrame("hot-swap-fallback");
      vi.spyOn(frame, "getViewPath").mockReturnValue("test/fallback");
      const NewView = defineView(() => ({ template: makeTemplate("fb") }));
      registerViewClass("test/fallback", NewView);

      const spy = vi.spyOn(frame, "mountView");
      hotSwapView(frame, NewView);

      expect(spy).toHaveBeenCalledWith("test/fallback");
      spy.mockRestore();
      cleanupFrame(frame);
    });
  });

  // ============================================================
  // hotSwapFrames
  // ============================================================
  describe("hotSwapFrames", () => {
    it("hot-swaps all frames matching the viewPath", async () => {
      const OldView = defineView(() => ({ template: makeTemplate("old") }));
      registerViewClass("test/batch", OldView);

      const f1 = createTestFrame("b1");
      const f2 = createTestFrame("b2");
      f1.mountView("test/batch");
      f2.mountView("test/batch");
      await flushMicrotasks();

      f1.view!.updater.set({ count: 100 }).digest();
      f2.view!.updater.set({ count: 200 }).digest();

      const NewView = defineView(() => ({ template: makeTemplate("new") }));
      hotSwapFrames("test/batch", NewView);

      expect(f1.view!.updater.get<number>("count")).toBe(100);
      expect(f2.view!.updater.get<number>("count")).toBe(200);
      cleanupFrame(f1);
      cleanupFrame(f2);
    });
  });

  // ============================================================
  // hotSwapByTemplate
  // ============================================================
  describe("hotSwapByTemplate", () => {
    it("updates template on all views using the old template", async () => {
      const oldTpl = makeTemplate("old");
      const newTpl = makeTemplate("new");
      const frame = createTestFrame("template-swap");
      registerViewClass(
        "test/tpl",
        defineView(() => ({ template: oldTpl })),
      );
      frame.mountView("test/tpl");
      await flushMicrotasks();

      frame.view!.updater.set({ count: 77 }).digest();
      hotSwapByTemplate(oldTpl, newTpl);

      expect(frame.view!.updater.get<number>("count")).toBe(77);
      expect(
        document.getElementById("template-swap")!.querySelector(".new"),
      ).not.toBeNull();
      cleanupFrame(frame);
    });

    it("does nothing when oldTemplate === newTemplate", async () => {
      const tpl = makeTemplate("same");
      const frame = createTestFrame("template-same");
      registerViewClass(
        "test/same",
        defineView((ctx) => {
          ctx.updater.set({ count: 5 });
          return { template: tpl };
        }),
      );
      frame.mountView("test/same");
      await flushMicrotasks();

      hotSwapByTemplate(tpl, tpl);
      expect(frame.view!.updater.get<number>("count")).toBe(5);
      cleanupFrame(frame);
    });
  });

  // ============================================================
  // hotSwapByView
  // ============================================================
  describe("hotSwapByView", () => {
    it("swaps and updates registry for matching class", async () => {
      const OldView = defineView(() => ({ template: makeTemplate("old") }));
      registerViewClass("test/swap", OldView);
      const frame = createTestFrame("swap");
      frame.mountView("test/swap");
      await flushMicrotasks();
      frame.view!.updater.set({ count: 33 }).digest();

      const NewView = defineView(() => ({ template: makeTemplate("new") }));
      hotSwapByView(OldView, NewView);

      expect(frame.view!.updater.get<number>("count")).toBe(33);
      expect(getViewClassRegistry()["test/swap"]).toBe(NewView);
      cleanupFrame(frame);
    });

    it("does nothing when oldClass === newClass", async () => {
      const V = defineView((ctx) => {
        ctx.updater.set({ count: 1 });
        return { template: makeTemplate("same") };
      });
      registerViewClass("test/same-class", V);
      const frame = createTestFrame("same-class");
      frame.mountView("test/same-class");
      await flushMicrotasks();

      hotSwapByView(V, V);
      expect(frame.view!.updater.get<number>("count")).toBe(1);
      cleanupFrame(frame);
    });
  });

  // ============================================================
  // hmr-inject — snippet generation
  // ============================================================
  describe("hmr-inject", () => {
    it("injects Vite template HMR with import.meta.hot", () => {
      const result = injectTemplateHmrSnippet(
        "export default function() {}",
        "vite",
      );
      expect(result).toContain("import.meta.hot");
      expect(result).toContain("hotSwapByTemplate");
      expect(result).toContain("__swifty_template__");
    });

    it("injects webpack template HMR with import.meta.webpackHot", () => {
      const result = injectTemplateHmrSnippet(
        "export default function() {}",
        "webpack",
      );
      expect(result).toContain("import.meta.webpackHot");
      expect(result).toContain("hotSwapByTemplate");
    });

    it("injects rspack template HMR with import.meta.webpackHot", () => {
      const result = injectTemplateHmrSnippet(
        "export default function() {}",
        "rspack",
      );
      expect(result).toContain("import.meta.webpackHot");
      expect(result).not.toContain("import.meta.hot");
    });

    it("detects .html import", () => {
      expect(importsHtmlTemplate('import t from "./x.html"')).toBe(true);
      expect(importsHtmlTemplate('import V from "../view"')).toBe(false);
    });

    it("wraps export default and injects view HMR for .ts importing .html", () => {
      const src = `import template from "./home.html";\nexport default defineView(() => ({}));`;
      const result = injectViewHmrSnippet(src, "vite");
      expect(result).toContain("const __swifty_view__ =");
      expect(result).toContain("import.meta.hot");
      expect(result).toContain("hotSwapByView");
    });

    it("returns source unchanged when no .html import", () => {
      const src = "export default defineView(() => ({}));";
      expect(injectViewHmrSnippet(src, "vite")).toBe(src);
    });

    it("uses import.meta.webpackHot for webpack", () => {
      const src = `import template from "./home.html";\nexport default defineView(() => ({}));`;
      const result = injectViewHmrSnippet(src, "webpack");
      expect(result).toContain("import.meta.webpackHot");
    });
  });
});
