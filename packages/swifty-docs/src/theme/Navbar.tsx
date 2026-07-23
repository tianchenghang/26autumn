import { Link } from "wouter-preact";
import { useEffect, useState } from "preact/hooks";
import { useDocs } from "./context";
import { ArrowUpRightIcon, MenuIcon, SearchIcon } from "./icons";
import { cn } from "./lib/utils";
import type { NavItem } from "../types";
import { Logo } from "./logo";
import { DocSearchWidget } from "./doc-search-widget";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

interface NavbarProps {
  path: string;
  landing: string;
  onMenuClick: () => void;
}

export function Navbar({ path, landing, onMenuClick }: NavbarProps) {
  const docs = useDocs();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      class={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300",
        scrolled
          ? "border-border/80 bg-background/80 border-b shadow-[0_1px_12px_-6px_rgb(0_0_0/0.08)] backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div class="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 lg:px-8">
        <Button
          variant="ghost"
          size="icon"
          class="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <MenuIcon class="size-4.5" />
        </Button>

        <Logo href={landing} title={docs.config.title} />

        <nav
          class="ml-4 hidden items-center gap-0.5 md:flex"
          aria-label="Primary"
        >
          {(docs.config.nav ?? []).map((item) => (
            <NavMenuItem key={item.link} item={item} path={path} />
          ))}
        </nav>

        <div class="ml-auto flex items-center gap-1.5">
          {docs.searchProvider !== "none" ? (
            docs.searchProvider === "local" ? (
              <>
                <button
                  onClick={docs.toggleSearch}
                  aria-label="Search documentation"
                  class="group border-border/80 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-accent/60 focus-visible:ring-ring/50 hidden h-8 w-52 items-center gap-2 rounded-md border px-2.5 text-left text-xs transition-[border-color,background-color,width] duration-300 focus-visible:ring-2 focus-visible:outline-none sm:flex lg:w-60"
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
              </>
            ) : (
              <DocSearchWidget />
            )
          ) : (
            <span class="hidden sm:block" />
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function NavMenuItem({ item, path }: { item: NavItem; path: string }) {
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
    return (
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        class={classes}
      >
        {item.text}
        <ArrowUpRightIcon class="size-3 opacity-60" />
      </a>
    );
  }

  return (
    <Link href={item.link} class={classes}>
      {item.text}
    </Link>
  );
}
