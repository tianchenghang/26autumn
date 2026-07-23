import { Link } from "wouter-preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { useDocs } from "./context";
import { ChevronDownIcon, ChevronRightIcon } from "./icons";
import { cn } from "./lib/utils";
import type { SidebarItem } from "../types";

interface SidebarProps {
  path: string;
  onNavigate?: () => void;
  class?: string;
}

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

export function Sidebar({ path, onNavigate, class: className }: SidebarProps) {
  const docs = useDocs();

  const groups = useMemo(() => {
    const sidebar = docs.config.sidebar ?? {};
    return Object.entries(sidebar)
      .filter((entry): entry is [string, SidebarItem[]] =>
        Array.isArray(entry[1]),
      )
      .map(([prefix, items]) => ({
        prefix,
        title: formatPrefix(prefix),
        items,
      }));
  }, [docs.config.sidebar]);

  return (
    <nav class={cn("flex flex-col", className)} aria-label="Documentation">
      {groups.map((group) => (
        <SidebarGroup
          key={group.prefix}
          title={group.title}
          items={group.items}
          path={path}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

function SidebarGroup({
  title,
  items,
  path,
  onNavigate,
}: {
  title: string;
  items: SidebarItem[];
  path: string;
  onNavigate?: () => void;
}) {
  const containsActive = containsLink(items, path);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (containsActive) setCollapsed(false);
  }, [containsActive]);

  return (
    <div class="mb-6">
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        class="group text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-full items-center justify-between rounded-md px-2 py-1.5 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
      >
        {title}
        <ChevronDownIcon
          class={cn(
            "size-3.5 opacity-60 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            collapsed && "-rotate-90",
          )}
        />
      </button>
      <div
        class={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          collapsed
            ? "grid-rows-[0fr] opacity-0"
            : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div class="overflow-hidden">
          <ul class="border-border/70 mt-1.5 ml-2 border-l pl-px">
            {items.map((item, i) => (
              <SidebarNode
                key={item.link ?? `${item.text}-${i}`}
                item={item}
                path={path}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SidebarNode({
  item,
  path,
  onNavigate,
}: {
  item: SidebarItem;
  path: string;
  onNavigate?: () => void;
}) {
  const hasChildren = Array.isArray(item.items) && item.items.length > 0;
  const active = !!item.link && stripSlash(item.link) === path;
  const containsActive =
    hasChildren && item.items ? containsLink(item.items, path) : false;
  const [collapsed, setCollapsed] = useState(!!item.collapsed);

  useEffect(() => {
    if (containsActive) setCollapsed(false);
  }, [containsActive]);

  if (!hasChildren) {
    return (
      <li>
        <Link
          href={item.link ?? "#"}
          onClick={() => onNavigate?.()}
          aria-current={active ? "page" : undefined}
          class={cn(
            "relative -ml-px block border-l-2 py-1.5 pr-2 pl-3.5 text-[13px] leading-snug transition-[color,background-color,border-color] duration-200",
            active
              ? "border-primary bg-primary/8 text-primary font-medium"
              : "text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground border-transparent",
          )}
        >
          {item.text}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        class={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 pl-2.5 text-[13px] font-medium transition-colors duration-200",
          containsActive
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ChevronRightIcon
          class={cn(
            "size-3.5 shrink-0 opacity-60 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            !collapsed && "rotate-90",
          )}
        />
        {item.text}
      </button>
      <div
        class={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          collapsed
            ? "grid-rows-[0fr] opacity-0"
            : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div class="overflow-hidden">
          <ul class="border-border/70 ml-3.5 border-l pl-px">
            {(item.items ?? []).map((child, i) => (
              <SidebarNode
                key={child.link ?? `${child.text}-${i}`}
                item={child}
                path={path}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}
