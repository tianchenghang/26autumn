import { A } from "@solidjs/router";
import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "./lib/utils";

interface LogoProps {
  href: string;
  title: string;
  class?: string;
}

/**
 * Site logotype: a sage gradient tile with a swift-wing mark, the site
 * wordmark in the display face, and a monospace "DOCS" tag.
 */
export function Logo(props: LogoProps) {
  return (
    <A
      href={props.href}
      class={cn(
        "group flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        props.class,
      )}
      aria-label={`${props.title} — home`}
    >
      <span class="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm shadow-primary/30 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-rotate-6 group-hover:scale-105">
        <svg
          viewBox="0 0 24 24"
          class="size-4.5"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 19c9.5-.5 15-6 16-15-9 1-14.5 6.5-15 15" />
          <path d="M4 19c.5-5.5 3.5-9 9.5-10.5" />
        </svg>
      </span>
      <span class="flex items-baseline gap-2">
        <span class="font-display text-lg font-semibold tracking-tight text-foreground">
          {props.title}
        </span>
        <span class="hidden rounded border border-primary/25 bg-primary/8 px-1.5 py-px font-mono text-[10px] font-medium tracking-widest text-primary sm:inline-block">
          DOCS
        </span>
      </span>
    </A>
  );
}

export function ThemeToggleIcon(props: ComponentProps<"span"> & { dark: boolean }) {
  const [local, rest] = splitProps(props, ["class", "dark"]);
  return (
    <span
      class={cn("relative block size-4", local.class)}
      aria-hidden="true"
      {...rest}
    >
      <svg
        viewBox="0 0 24 24"
        class={cn(
          "absolute inset-0 size-4 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
          local.dark
            ? "rotate-0 scale-100 opacity-100"
            : "-rotate-90 scale-50 opacity-0",
        )}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        class={cn(
          "absolute inset-0 size-4 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
          local.dark
            ? "rotate-90 scale-50 opacity-0"
            : "rotate-0 scale-100 opacity-100",
        )}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    </span>
  );
}
