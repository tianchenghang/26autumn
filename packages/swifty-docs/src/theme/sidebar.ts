/**
 * Sidebar View - navigation tree.
 *
 * Renders the sidebar navigation groups and items.
 * Reads sidebar data from State via a Zod-validated parse.
 */
import { State, Router, defineView } from "@swifty.js/mvc";
import type { VDomTemplate, ViewSetup, ViewTemplate } from "@swifty.js/mvc";
import { z } from "zod";
import type { SidebarItem } from "../types";
import { findDataHref } from "../utils/dom";

// Validate only the sidebar slice of the injected DocsConfig.
const SidebarItemSchema: z.ZodType<SidebarItem> = z.object({
  text: z.string(),
  link: z.string().optional(),
  collapsed: z.boolean().optional(),
  items: z.lazy(() => z.array(SidebarItemSchema)).optional(),
  isActive: z.boolean().optional(),
  itemClass: z.string().optional(),
});
const SidebarConfigSchema = z.union([
  z.literal("auto"),
  z.array(SidebarItemSchema),
]);
const SidebarMapSchema = z.record(z.string(), SidebarConfigSchema);
const SidebarDocsConfigSchema = z.object({
  sidebar: SidebarMapSchema.optional(),
});

function parseSidebar(
  v: unknown,
): Record<string, z.infer<typeof SidebarConfigSchema>> {
  const r = SidebarDocsConfigSchema.safeParse(v);
  return r.success && r.data.sidebar ? r.data.sidebar : {};
}

export function createSidebarView(
  template: ViewTemplate | VDomTemplate,
): ViewSetup {
  return defineView((ctx) => {
    ctx.observeLocation([], true);

    const assign = (): boolean | undefined => {
      ctx.updater.snapshot();

      const sidebar = parseSidebar(State.get("docsConfig"));
      // Normalize trailing slashes for consistent active-item matching.
      const currentPath =
        (Router.parse().path || "").replace(/\/+$/, "") || "/";

      // Flatten sidebar groups into sidebarGroups array for the template.
      const sidebarGroups: Array<{
        text: string;
        items: SidebarItem[];
      }> = [];

      for (const [prefix, sidebarItems] of Object.entries(sidebar)) {
        if (Array.isArray(sidebarItems)) {
          sidebarGroups.push({
            text: formatPrefix(prefix),
            items: markActive(sidebarItems, currentPath),
          });
        }
      }

      ctx.updater.set({ sidebarGroups });
      return ctx.updater.altered();
    };

    // Initial assign
    assign();

    return {
      template,
      assign,
      events: {
        "navigateTo<click>": (e: Event) => {
          // Clicks may land on child elements; walk up to the element
          // carrying data-href (see findDataHref).
          const href = findDataHref(e.target);
          if (href) {
            Router.to(href);
          }
        },
      },
    };
  });
}

/**
 * Recursively mark the sidebar item whose link matches the current path.
 * Returns a new array with isActive flags set on matching items.
 */
function markActive(items: SidebarItem[], currentPath: string): SidebarItem[] {
  return items.map((item) => {
    const isActive = item.link === currentPath;
    const result: SidebarItem = {
      text: item.text,
      link: item.link,
      isActive,
      itemClass: isActive
        ? "menu-active bg-primary/10 text-primary font-medium rounded-field text-xs"
        : "rounded-field text-xs",
    };
    if (Array.isArray(item.items) && item.items.length > 0) {
      result.collapsed = item.collapsed;
      result.items = markActive(item.items, currentPath);
    }
    return result;
  });
}

function formatPrefix(prefix: string): string {
  return prefix
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
