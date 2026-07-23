import { useEffect, useRef, useState } from "preact/hooks";
import { ListIcon } from "./icons";
import type { PageHeading } from "./lib/content";
import { useScrollSpy } from "./lib/scroll-spy";
import { cn } from "./lib/utils";

interface TocProps {
  headings: PageHeading[];
  inline?: boolean;
}

export function Toc({ headings, inline }: TocProps) {
  const active = useScrollSpy(headings);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [marker, setMarker] = useState({ top: 0, height: 0, show: false });

  useEffect(() => {
    const el = active ? linkRefs.current.get(active) : undefined;
    if (el && el.parentElement) {
      setMarker({
        top: el.parentElement.offsetTop,
        height: el.parentElement.offsetHeight,
        show: true,
      });
    } else {
      setMarker((m) => ({ ...m, show: false }));
    }
  }, [active]);

  const scrollTo = (slug: string) => (e: Event) => {
    e.preventDefault();
    document
      .getElementById(slug)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (headings.length === 0) return null;

  return (
    <div
      class={cn(
        inline &&
          "not-prose border-border/80 bg-muted/30 my-6 rounded-xl border p-4",
      )}
    >
      <p class="text-muted-foreground flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
        <ListIcon class="size-3.5" />
        On this page
      </p>
      <div class="relative mt-3">
        <span
          aria-hidden="true"
          class="bg-border/80 absolute inset-y-0 left-0 w-px"
        />
        <span
          aria-hidden="true"
          class={cn(
            "bg-primary absolute left-0 w-px rounded-full transition-[top,height,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            !marker.show && "opacity-0",
          )}
          style={{ top: `${marker.top}px`, height: `${marker.height}px` }}
        />
        <ul class="space-y-px pl-3">
          {headings.map((h) => (
            <li key={h.slug} class="relative">
              <a
                ref={(el) => {
                  if (el) linkRefs.current.set(h.slug, el);
                }}
                href={`#${h.slug}`}
                onClick={scrollTo(h.slug)}
                class={cn(
                  "block py-1 text-xs leading-snug transition-colors duration-200",
                  h.level >= 3 && "pl-3",
                  active === h.slug
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
