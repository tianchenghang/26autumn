import $ from "jquery";
import { icons } from "./icons";
import { getState } from "./state";
import { cn, $mount } from "./lib/utils";
import type { SidebarItem } from "../types";

function stripSlash(p: string): string {
  return p.replace(/\/+$/, "") || "/";
}

function containsLink(items: SidebarItem[], path: string): boolean {
  for (const item of items) {
    if (item.link && stripSlash(item.link) === path) return true;
    if (item.items && containsLink(item.items, path)) return true;
  }
  return false;
}

function formatPrefix(prefix: string): string {
  return prefix
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .replace(/[-/]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderNode(item: SidebarItem, path: string): string {
  const hasChildren = Array.isArray(item.items) && item.items.length > 0;
  const active = !!item.link && stripSlash(item.link) === path;
  const containsActive =
    hasChildren && item.items ? containsLink(item.items, path) : false;
  const collapsed = hasChildren && !!item.collapsed && !containsActive;

  if (!hasChildren) {
    return `<li>
      <a href="${item.link ?? "#"}" data-swifty-link data-sidebar-link
        aria-current="${active ? "page" : "false"}"
        class="${cn(
          "relative -ml-px block border-l-2 py-1.5 pr-2 pl-3.5 text-[13px] leading-snug transition-[color,background-color,border-color] duration-200",
          active
            ? "border-primary bg-primary/8 text-primary font-medium"
            : "text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground border-transparent",
        )}">${item.text}</a>
    </li>`;
  }

  const childrenHtml = (item.items ?? [])
    .map((child) => renderNode(child, path))
    .join("");

  return `<li>
    <button data-sidebar-toggle aria-expanded="${!collapsed}"
      class="${cn(
        "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 pl-2.5 text-[13px] font-medium transition-colors duration-200",
        containsActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}">
      <span class="${cn("size-3.5 shrink-0 opacity-60 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]", !collapsed && "rotate-90")}">${icons.chevronRight}</span>
      ${item.text}
    </button>
    <div class="${cn(
      "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
      collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
    )}">
      <div class="overflow-hidden">
        <ul class="border-border/70 ml-3.5 border-l pl-px">${childrenHtml}</ul>
      </div>
    </div>
  </li>`;
}

function renderGroup(
  title: string,
  items: SidebarItem[],
  path: string,
): string {
  const containsActive = containsLink(items, path);
  const collapsed = false;

  const itemsHtml = items.map((item) => renderNode(item, path)).join("");

  return `<div class="mb-6" data-sidebar-group>
    <button data-group-toggle aria-expanded="${!collapsed}"
      class="group text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-full items-center justify-between rounded-md px-2 py-1.5 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none">
      ${title}
      <span class="size-3.5 opacity-60 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">${icons.chevronDown}</span>
    </button>
    <div class="grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
      <div class="overflow-hidden">
        <ul class="border-border/70 mt-1.5 ml-2 border-l pl-px">${itemsHtml}</ul>
      </div>
    </div>
  </div>`;
}

export function initSidebar(
  mount: string | HTMLElement,
  onNavigate?: () => void,
): () => void {
  const $el = $mount(mount);
  const state = getState();
  const path = state.currentPath;

  const sidebar = state.config.sidebar ?? {};
  const groups = Object.entries(sidebar)
    .filter((entry): entry is [string, SidebarItem[]] =>
      Array.isArray(entry[1]),
    )
    .map(([prefix, items]) => ({
      prefix,
      title: formatPrefix(prefix),
      items,
    }));

  const html = groups.map((g) => renderGroup(g.title, g.items, path)).join("");

  $el.html(
    `<nav class="flex flex-col" aria-label="Documentation">${html}</nav>`,
  );

  $el.on("click.swifty-sidebar", "[data-group-toggle]", (e) => {
    const $btn = $(e.currentTarget);
    const $wrapper = $btn.next();
    const expanded = $btn.attr("aria-expanded") === "true";
    $btn.attr("aria-expanded", String(!expanded));
    $wrapper.toggleClass("grid-rows-[0fr] opacity-0", expanded);
    $wrapper.toggleClass("grid-rows-[1fr] opacity-100", !expanded);
    $btn.find("span").first().toggleClass("-rotate-90", expanded);
  });

  $el.on("click.swifty-sidebar", "[data-sidebar-toggle]", (e) => {
    const $btn = $(e.currentTarget);
    const $wrapper = $btn.next();
    const expanded = $btn.attr("aria-expanded") === "true";
    $btn.attr("aria-expanded", String(!expanded));
    $wrapper.toggleClass("grid-rows-[0fr] opacity-0", expanded);
    $wrapper.toggleClass("grid-rows-[1fr] opacity-100", !expanded);
    $btn.find("span").first().toggleClass("rotate-90", !expanded);
  });

  if (onNavigate) {
    $el.on("click.swifty-sidebar", "[data-sidebar-link]", () => onNavigate());
  }

  return () => {
    $el.off(".swifty-sidebar");
    $el.empty();
  };
}
