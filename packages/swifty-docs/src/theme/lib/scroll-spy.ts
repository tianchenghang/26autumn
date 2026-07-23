import { useEffect, useState } from "preact/hooks";
import type { PageHeading } from "./content";

/**
 * IntersectionObserver scroll-spy over the heading elements of the current
 * page. The last heading whose top sits at or above `offset` (navbar
 * height + breathing room) is considered active.
 */
export function useScrollSpy(headings: PageHeading[], offset = 96): string {
  const [active, setActive] = useState("");

  useEffect(() => {
    setActive("");
    if (headings.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      () => {
        let current = "";
        for (const h of headings) {
          const el = document.getElementById(h.slug);
          if (el && el.getBoundingClientRect().top <= offset) {
            current = h.slug;
          }
        }
        setActive(current);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    queueMicrotask(() => {
      for (const h of headings) {
        const el = document.getElementById(h.slug);
        if (el) observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [headings, offset]);

  return active;
}
