import { State, defineView } from "@swifty.js/mvc";
import type { VDomTemplate, ViewSetup, ViewTemplate } from "@swifty.js/mvc";
import { z } from "zod";

const ACTIVE_CLASS =
  "menu-active bg-base-200 text-primary font-medium rounded-field text-base-content/60 text-xs";
const NORMAL_CLASS = "rounded-field text-base-content/60 text-xs";

// Validate the heading payload published to State by the layout view.
const TocHeadingSchema = z.looseObject({
  level: z.number(),
  slug: z.string(),
  text: z.string(),
});
const TocHeadingsSchema = z.array(TocHeadingSchema);
type TocHeading = z.infer<typeof TocHeadingSchema>;

/**
 * TocView - right-side heading outline.
 *
 * Renders h2/h3 headings extracted from the current page and highlights the
 * heading currently in view via an IntersectionObserver-based scroll-spy.
 */
export function createTocView(
  template: ViewTemplate | VDomTemplate,
): ViewSetup {
  return defineView((ctx) => {
    // Re-render when the layout publishes new headings for the current page.
    ctx.observeState("currentPageHeadings");

    // Closure state for scroll-spy.
    let activeSlug = "";
    let observer: IntersectionObserver | null = null;

    const readHeadings = (): TocHeading[] => {
      const r = TocHeadingsSchema.safeParse(State.get("currentPageHeadings"));
      return r.success ? r.data : [];
    };

    const buildHeadings = () =>
      readHeadings().map((h) => ({
        level: h.level,
        slug: h.slug,
        text: h.text,
        liClass: h.level === 3 ? "pl-2" : "",
        itemClass: h.slug === activeSlug ? ACTIVE_CLASS : NORMAL_CLASS,
      }));

    const assign = (): boolean | undefined => {
      ctx.updater.snapshot();
      ctx.updater.set({ headings: buildHeadings() });
      return ctx.updater.altered();
    };

    // Initial assign
    assign();

    /**
     * (Re)observe heading elements for scroll-spy. Called after each render
     * because the heading DOM is rebuilt when content changes. DOM lookup is
     * deferred to a macrotask — setup/assign run before the template DOM is
     * mounted, so getElementById returns null synchronously.
     */
    const observeHeadings = (): void => {
      if (typeof IntersectionObserver === "undefined") return;
      if (observer) observer.disconnect();
      const headings = readHeadings();
      if (headings.length === 0) return;

      observer = new IntersectionObserver(
        () => {
          // Re-scan all observed headings (not just the callback entries) so
          // the active heading is stable regardless of which intersections
          // fired. The last heading whose top is at or above the navbar
          // offset (100px) is considered active.
          let current = "";
          for (const h of headings) {
            const el = document.getElementById(h.slug);
            if (!el) continue;
            if (el.getBoundingClientRect().top <= 100) {
              current = h.slug;
            }
          }
          if (current === activeSlug) return;
          activeSlug = current;
          ctx.updater.set({ headings: buildHeadings() });
          ctx.updater.digest();
        },
        { rootMargin: "0px 0px -70% 0px", threshold: 0 },
      );

      setTimeout(() => {
        if (!observer) return;
        for (const h of headings) {
          const el = document.getElementById(h.slug);
          if (el) observer.observe(el);
        }
      }, 0);
    };

    // observeState fires render on heading changes — re-assign and refresh
    // the scroll-spy observers in the render cycle.
    ctx.renderMethod = () => {
      assign();
      ctx.updater.digest();
      observeHeadings();
    };

    return {
      template,
      assign,
      events: {
        "scrollToHeading<click>": (e: Event) => {
          // Walk up from the click target to the element carrying data-slug
          // (the <a> may wrap child text nodes).
          let el = e.target instanceof HTMLElement ? e.target : null;
          while (el && !el.dataset["slug"]) el = el.parentElement;
          const slug = el ? (el.dataset["slug"] ?? null) : null;
          if (slug) {
            const target = document.getElementById(slug);
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }
        },
      },
    };
  });
}
