import $ from "jquery";
import { icons } from "./icons";
import { getState, toggleSearch } from "./state";
import { cn, $mount } from "./lib/utils";
import type { NavItem } from "../types";
import { logoTemplate } from "./logo";
import { initThemeToggle } from "./theme-toggle";

function navItemTemplate(item: NavItem, path: string): string {
  const external = /^https?:\/\//.test(item.link);
  const target = item.link.replace(/\/+$/, "") || "/";
  const active =
    !external && (path === target || path.startsWith(target + "/"));

  const classes = cn(
    "relative flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors duration-200",
    "after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.32,0.72,0,1)]",
    active
      ? "font-medium text-foreground after:scale-x-100"
      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:after:scale-x-100",
  );

  if (external) {
    return `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="${classes}">${item.text}<span class="size-3 opacity-60">${icons.arrowUpRight}</span></a>`;
  }
  return `<a href="${item.link}" data-swifty-link class="${classes}">${item.text}</a>`;
}

export function initNavbar(
  mount: string | HTMLElement,
  onMenuClick: () => void,
): () => void {
  const $el = $mount(mount);
  const state = getState();
  const path = state.currentPath;
  const landing = state.config.nav?.[0]?.link ?? state.config.baseUrl ?? "/";

  const navItems = (state.config.nav ?? [])
    .map((item) => navItemTemplate(item, path))
    .join("");

  const searchHtml =
    state.searchProvider === "local"
      ? `<button data-action="toggle-search" aria-label="Search documentation"
          class="group border-border/80 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-accent/60 focus-visible:ring-ring/50 hidden h-8 w-52 items-center gap-2 rounded-md border px-2.5 text-left text-xs transition-[border-color,background-color,width] duration-300 focus-visible:ring-2 focus-visible:outline-none sm:flex lg:w-60">
          <span class="size-3.5 shrink-0 opacity-70 transition-transform duration-300 group-hover:scale-110">${icons.search}</span>
          <span class="flex-1 truncate">Search documentation…</span>
          <kbd class="border-border bg-muted text-muted-foreground pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100">⌘K</kbd>
        </button>
        <button data-action="toggle-search" aria-label="Search documentation"
          class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 h-9 w-9 text-muted-foreground hover:bg-accent/60 hover:text-foreground sm:hidden">
          <span class="size-4.5">${icons.search}</span>
        </button>`
      : "";

  $el.html(
    `<header class="fixed inset-x-0 top-0 z-40 border-b border-transparent bg-transparent transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300">
      <div class="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 lg:px-8">
        <button data-action="open-menu" aria-label="Open navigation menu"
          class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 h-9 w-9 text-muted-foreground hover:bg-accent/60 hover:text-foreground lg:hidden">
          <span class="size-4.5">${icons.menu}</span>
        </button>
        ${logoTemplate(landing, state.config.title)}
        <nav class="ml-4 hidden items-center gap-0.5 md:flex" aria-label="Primary">${navItems}</nav>
        <div class="ml-auto flex items-center gap-1.5">
          ${searchHtml}
          <span data-theme-toggle></span>
        </div>
      </div>
    </header>`,
  );

  const disposeThemeToggle = initThemeToggle(
    $el.find("[data-theme-toggle]")[0],
  );

  const onScroll = () => {
    const $header = $el.find("header");
    const scrolled = window.scrollY > 8;
    $header.toggleClass(
      "border-border/80 bg-background/80 border-b shadow-[0_1px_12px_-6px_rgb(0_0_0/0.08)] backdrop-blur-xl",
      scrolled,
    );
    $header.toggleClass("border-transparent bg-transparent", !scrolled);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  $el.on("click.swifty-navbar", "[data-action='toggle-search']", () =>
    toggleSearch(),
  );
  $el.on("click.swifty-navbar", "[data-action='open-menu']", () =>
    onMenuClick(),
  );

  return () => {
    disposeThemeToggle();
    window.removeEventListener("scroll", onScroll);
    $el.off(".swifty-navbar");
    $el.empty();
  };
}
