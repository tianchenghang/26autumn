import {
  createEffect,
  createSignal,
  For,
  Show,
  type Accessor,
} from "solid-js";
import { ListIcon } from "./icons";
import type { PageHeading } from "./lib/content";
import { createScrollSpy } from "./lib/scroll-spy";
import { cn } from "./lib/utils";

interface TocProps {
  headings: Accessor<PageHeading[]>;
  /** Render as an inline card (used by the [[toc]] markdown directive). */
  inline?: boolean;
}

/**
 * Heading outline with IntersectionObserver scroll-spy. The active marker
 * is a rail segment that springs between entries instead of snapping.
 */
export function Toc(props: TocProps) {
  const active = createScrollSpy(props.headings);
  const linkRefs = new Map<string, HTMLAnchorElement>();
  const [marker, setMarker] = createSignal({ top: 0, height: 0, show: false });

  createEffect(() => {
    const slug = active();
    const el = slug ? linkRefs.get(slug) : undefined;
    if (el && el.parentElement) {
      setMarker({
        top: el.parentElement.offsetTop,
        height: el.parentElement.offsetHeight,
        show: true,
      });
    } else {
      setMarker((m) => ({ ...m, show: false }));
    }
  });

  const scrollTo = (slug: string) => (e: Event) => {
    e.preventDefault();
    document
      .getElementById(slug)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Show when={props.headings().length > 0}>
      <div
        class={cn(
          props.inline &&
            "not-prose my-6 rounded-xl border border-border/80 bg-muted/30 p-4",
        )}
      >
        <p class="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <ListIcon class="size-3.5" />
          On this page
        </p>
        <div class="relative mt-3">
          <span
            aria-hidden="true"
            class="absolute inset-y-0 left-0 w-px bg-border/80"
          />
          <span
            aria-hidden="true"
            class={cn(
              "absolute left-0 w-px rounded-full bg-primary transition-[top,height,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
              !marker().show && "opacity-0",
            )}
            style={{ top: `${marker().top}px`, height: `${marker().height}px` }}
          />
          <ul class="space-y-px pl-3">
            <For each={props.headings()}>
              {(h) => (
                <li class="relative">
                  <a
                    ref={(el) => linkRefs.set(h.slug, el)}
                    href={`#${h.slug}`}
                    onClick={scrollTo(h.slug)}
                    class={cn(
                      "block py-1 text-xs leading-snug transition-colors duration-200",
                      h.level >= 3 && "pl-3",
                      active() === h.slug
                        ? "font-medium text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {h.text}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </div>
      </div>
    </Show>
  );
}
