import { Link } from "wouter-preact";
import { ArrowLeftIcon, ArrowRightIcon } from "./icons";
import type { NavLink } from "./lib/content";

interface PrevNextProps {
  prev: NavLink | null;
  next: NavLink | null;
}

export function PrevNext({ prev, next }: PrevNextProps) {
  if (!prev && !next) return null;

  return (
    <nav
      class="border-border/70 mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2"
      aria-label="Page navigation"
    >
      {prev && (
        <Link
          href={prev.link}
          class="group border-border/80 bg-card/60 hover:border-primary/40 hover:bg-accent/40 flex items-center gap-3 rounded-xl border px-4 py-3 transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-sm"
        >
          <ArrowLeftIcon class="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-[transform,color] duration-300 group-hover:-translate-x-0.5" />
          <span class="min-w-0">
            <span class="text-muted-foreground block font-mono text-[10px] font-medium tracking-[0.14em] uppercase">
              Previous
            </span>
            <span class="text-foreground block truncate text-sm font-medium">
              {prev.text}
            </span>
          </span>
        </Link>
      )}
      {next && (
        <Link
          href={next.link}
          class="group border-border/80 bg-card/60 hover:border-primary/40 hover:bg-accent/40 flex flex-row-reverse items-center gap-3 rounded-xl border px-4 py-3 text-right transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-sm sm:min-w-56 sm:justify-self-end"
        >
          <ArrowRightIcon class="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-[transform,color] duration-300 group-hover:translate-x-0.5" />
          <span class="min-w-0">
            <span class="text-muted-foreground block font-mono text-[10px] font-medium tracking-[0.14em] uppercase">
              Next
            </span>
            <span class="text-foreground block truncate text-sm font-medium">
              {next.text}
            </span>
          </span>
        </Link>
      )}
    </nav>
  );
}
