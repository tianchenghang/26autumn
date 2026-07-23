import type { PageHeading } from "./content";

export interface ScrollSpy {
  getActive(): string;
  onChange(fn: (slug: string) => void): () => void;
  destroy(): void;
}

export function createScrollSpy(
  headings: PageHeading[],
  offset = 96,
): ScrollSpy {
  let active = "";
  const listeners: Array<(slug: string) => void> = [];
  let observer: IntersectionObserver | null = null;

  function setActive(slug: string): void {
    if (slug === active) return;
    active = slug;
    for (const fn of listeners) fn(slug);
  }

  function compute(): void {
    let current = "";
    for (const h of headings) {
      const el = document.getElementById(h.slug);
      if (el && el.getBoundingClientRect().top <= offset) {
        current = h.slug;
      }
    }
    setActive(current);
  }

  if (headings.length > 0 && typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver(() => compute(), {
      rootMargin: "0px 0px -70% 0px",
      threshold: 0,
    });

    queueMicrotask(() => {
      for (const h of headings) {
        const el = document.getElementById(h.slug);
        if (el) observer!.observe(el);
      }
    });
  }

  return {
    getActive: () => active,
    onChange(fn) {
      listeners.push(fn);
      return () => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    destroy() {
      observer?.disconnect();
      listeners.length = 0;
    },
  };
}
