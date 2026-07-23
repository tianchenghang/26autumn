import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import type { PageHeading } from "./content";

/**
 * IntersectionObserver scroll-spy over the heading elements of the current
 * page. The last heading whose top sits at or above `offset` (navbar
 * height + breathing room) is considered active. All observed headings are
 * re-scanned on every intersection so the result is stable regardless of
 * which entries fired.
 */
export function createScrollSpy(
  headings: Accessor<PageHeading[]>,
  offset = 96,
): Accessor<string> {
  const [active, setActive] = createSignal("");
  let observer: IntersectionObserver | null = null;

  createEffect(() => {
    const list = headings();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    setActive("");
    if (list.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    observer = new IntersectionObserver(
      () => {
        let current = "";
        for (const h of list) {
          const el = document.getElementById(h.slug);
          if (el && el.getBoundingClientRect().top <= offset) {
            current = h.slug;
          }
        }
        setActive(current);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    // Heading DOM is rebuilt when content changes; observe on a microtask
    // so the freshly rendered elements are in the document.
    queueMicrotask(() => {
      if (!observer) return;
      for (const h of list) {
        const el = document.getElementById(h.slug);
        if (el) observer.observe(el);
      }
    });
  });

  onCleanup(() => observer?.disconnect());
  return active;
}
