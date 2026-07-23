import { A } from "@solidjs/router";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { useDocs } from "./context";
import { ArrowUpRightIcon, MenuIcon, SearchIcon } from "./icons";
import { cn } from "./lib/utils";
import type { NavItem } from "../types";
import { Logo } from "./Logo";
import { DocSearchWidget } from "./DocSearchWidget";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

interface NavbarProps {
  path: () => string;
  landing: string;
  onMenuClick: () => void;
}

export function Navbar(props: NavbarProps) {
  const docs = useDocs();
  const [scrolled, setScrolled] = createSignal(false);

  createEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => window.removeEventListener("scroll", onScroll));
  });

  return (
    <header
      class={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300",
        scrolled()
          ? "border-b border-border/80 bg-background/80 shadow-[0_1px_12px_-6px_rgb(0_0_0/0.08)] backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div class="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 lg:px-8">
        <Button
          variant="ghost"
          size="icon"
          class="lg:hidden"
          onClick={props.onMenuClick}
          aria-label="Open navigation menu"
        >
          <MenuIcon class="size-4.5" />
        </Button>

        <Logo href={props.landing} title={docs.config.title} />

        <nav class="ml-4 hidden items-center gap-0.5 md:flex" aria-label="Primary">
          <For each={docs.config.nav ?? []}>
            {(item) => <NavMenuItem item={item} path={props.path} />}
          </For>
        </nav>

        <div class="ml-auto flex items-center gap-1.5">
          <Show
            when={docs.searchProvider !== "none"}
            fallback={<span class="hidden sm:block" />}
          >
            <Show
              when={docs.searchProvider === "local"}
              fallback={<DocSearchWidget />}
            >
              <button
                onClick={docs.toggleSearch}
                aria-label="Search documentation"
                class="group hidden h-8 w-52 items-center gap-2 rounded-md border border-border/80 bg-muted/40 px-2.5 text-left text-xs text-muted-foreground transition-[border-color,background-color,width] duration-300 hover:border-primary/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:flex lg:w-60"
              >
                <SearchIcon class="size-3.5 shrink-0 opacity-70 transition-transform duration-300 group-hover:scale-110" />
                <span class="flex-1 truncate">Search documentation…</span>
                <Kbd>⌘K</Kbd>
              </button>
              <Button
                variant="ghost"
                size="icon"
                class="sm:hidden"
                onClick={docs.toggleSearch}
                aria-label="Search documentation"
              >
                <SearchIcon class="size-4.5" />
              </Button>
            </Show>
          </Show>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function NavMenuItem(props: { item: NavItem; path: () => string }) {
  const external = /^https?:\/\//.test(props.item.link);
  const active = () => {
    if (external) return false;
    const target = props.item.link.replace(/\/+$/, "") || "/";
    const current = props.path();
    return current === target || current.startsWith(target + "/");
  };

  const classes = () =>
    cn(
      "relative flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors duration-200",
      "after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.32,0.72,0,1)]",
      active()
        ? "font-medium text-foreground after:scale-x-100"
        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:after:scale-x-100",
    );

  return (
    <Show
      when={!external}
      fallback={
        <a
          href={props.item.link}
          target="_blank"
          rel="noopener noreferrer"
          class={classes()}
        >
          {props.item.text}
          <ArrowUpRightIcon class="size-3 opacity-60" />
        </a>
      }
    >
      <A href={props.item.link} class={classes()}>
        {props.item.text}
      </A>
    </Show>
  );
}
