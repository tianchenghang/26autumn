import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { ArrowLeftIcon, ArrowRightIcon } from "./icons";
import type { NavLink } from "./lib/content";

interface PrevNextProps {
  prev: NavLink | null;
  next: NavLink | null;
}

export function PrevNext(props: PrevNextProps) {
  return (
    <Show when={props.prev || props.next}>
      <nav
        class="mt-14 grid gap-3 border-t border-border/70 pt-6 sm:grid-cols-2"
        aria-label="Page navigation"
      >
        <Show when={props.prev}>
          {(prev) => (
            <A
              href={prev().link}
              class="group flex items-center gap-3 rounded-xl border border-border/80 bg-card/60 px-4 py-3 transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-primary/40 hover:bg-accent/40 hover:shadow-sm"
            >
              <ArrowLeftIcon class="size-4 shrink-0 text-muted-foreground transition-[transform,color] duration-300 group-hover:-translate-x-0.5 group-hover:text-primary" />
              <span class="min-w-0">
                <span class="block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Previous
                </span>
                <span class="block truncate text-sm font-medium text-foreground">
                  {prev().text}
                </span>
              </span>
            </A>
          )}
        </Show>
        <Show when={props.next}>
          {(next) => (
            <A
              href={next().link}
              class="group flex flex-row-reverse items-center gap-3 rounded-xl border border-border/80 bg-card/60 px-4 py-3 text-right transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-primary/40 hover:bg-accent/40 hover:shadow-sm sm:justify-self-end sm:min-w-56"
            >
              <ArrowRightIcon class="size-4 shrink-0 text-muted-foreground transition-[transform,color] duration-300 group-hover:translate-x-0.5 group-hover:text-primary" />
              <span class="min-w-0">
                <span class="block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Next
                </span>
                <span class="block truncate text-sm font-medium text-foreground">
                  {next().text}
                </span>
              </span>
            </A>
          )}
        </Show>
      </nav>
    </Show>
  );
}
