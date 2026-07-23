import { A } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  type Accessor,
} from "solid-js";
import { useDocs } from "./context";
import { ChevronDownIcon, ChevronRightIcon } from "./icons";
import { cn } from "./lib/utils";
import type { SidebarItem } from "../types";

interface SidebarProps {
  path: Accessor<string>;
  /** Called after a leaf link is activated (closes the mobile drawer). */
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

export function Sidebar(props: SidebarProps) {
  const docs = useDocs();

  const groups = createMemo(() => {
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
  });

  return (
    <nav class={cn("flex flex-col", props.class)} aria-label="Documentation">
      <For each={groups()}>
        {(group) => (
          <SidebarGroup
            title={group.title}
            items={group.items}
            path={props.path}
            onNavigate={props.onNavigate}
          />
        )}
      </For>
    </nav>
  );
}

function SidebarGroup(props: {
  title: string;
  items: SidebarItem[];
  path: Accessor<string>;
  onNavigate?: () => void;
}) {
  const containsActive = createMemo(() =>
    containsLink(props.items, props.path()),
  );
  const [collapsed, setCollapsed] = createSignal(false);

  // A group always opens when the current page lives inside it.
  createEffect(() => {
    if (containsActive()) setCollapsed(false);
  });

  return (
    <div class="mb-6">
      <button
        onClick={() => setCollapsed(!collapsed())}
        aria-expanded={!collapsed()}
        class="group flex w-full items-center justify-between rounded-md px-2 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {props.title}
        <ChevronDownIcon
          class={cn(
            "size-3.5 opacity-60 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            collapsed() && "-rotate-90",
          )}
        />
      </button>
      <div
        class={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          collapsed() ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div class="overflow-hidden">
          <ul class="mt-1.5 ml-2 border-l border-border/70 pl-px">
            <For each={props.items}>
              {(item) => (
                <SidebarNode
                  item={item}
                  path={props.path}
                  onNavigate={props.onNavigate}
                />
              )}
            </For>
          </ul>
        </div>
      </div>
    </div>
  );
}

function SidebarNode(props: {
  item: SidebarItem;
  path: Accessor<string>;
  onNavigate?: () => void;
}) {
  const hasChildren = createMemo(
    () => Array.isArray(props.item.items) && props.item.items.length > 0,
  );
  const active = createMemo(
    () =>
      !!props.item.link && stripSlash(props.item.link) === props.path(),
  );
  const containsActive = createMemo(() =>
    hasChildren() && props.item.items
      ? containsLink(props.item.items, props.path())
      : false,
  );
  const [collapsed, setCollapsed] = createSignal(!!props.item.collapsed);
  createEffect(() => {
    if (containsActive()) setCollapsed(false);
  });

  return (
    <li>
      <Show
        when={hasChildren()}
        fallback={
          <A
            href={props.item.link ?? "#"}
            onClick={() => props.onNavigate?.()}
            aria-current={active() ? "page" : undefined}
            class={cn(
              "relative -ml-px block border-l-2 py-1.5 pl-3.5 pr-2 text-[13px] leading-snug transition-[color,background-color,border-color] duration-200",
              active()
                ? "border-primary bg-primary/8 font-medium text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {props.item.text}
          </A>
        }
      >
        <button
          onClick={() => setCollapsed(!collapsed())}
          aria-expanded={!collapsed()}
          class={cn(
            "flex w-full items-center gap-1.5 rounded-md py-1.5 pl-2.5 pr-2 text-[13px] font-medium transition-colors duration-200",
            containsActive()
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ChevronRightIcon
            class={cn(
              "size-3.5 shrink-0 opacity-60 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
              !collapsed() && "rotate-90",
            )}
          />
          {props.item.text}
        </button>
        <div
          class={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            collapsed()
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100",
          )}
        >
          <div class="overflow-hidden">
            <ul class="ml-3.5 border-l border-border/70 pl-px">
              <For each={props.item.items ?? []}>
                {(child) => (
                  <SidebarNode
                    item={child}
                    path={props.path}
                    onNavigate={props.onNavigate}
                  />
                )}
              </For>
            </ul>
          </div>
        </div>
      </Show>
    </li>
  );
}
