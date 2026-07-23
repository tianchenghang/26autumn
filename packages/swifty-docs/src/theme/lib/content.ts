/**
 * Runtime contracts between the generated module (@swifty-docs/generated)
 * and the SolidJS theme.
 *
 * Values cross a module boundary that TypeScript cannot see through at
 * runtime (the generated file is plain JS), so every shape is validated
 * with Zod at the provider boundary before the theme consumes it.
 */
import { z } from "zod";
import type { NavItem, SidebarItem } from "../../types";

const NavItemSchema: z.ZodType<NavItem> = z.object({
  text: z.string(),
  link: z.string(),
  items: z.lazy(() => z.array(NavItemSchema)).optional(),
});

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

export const DocsConfigSchema = z.object({
  docs: z.string().optional(),
  baseUrl: z.string(),
  title: z.string(),
  description: z.string().optional(),
  nav: z.array(NavItemSchema).optional(),
  sidebar: z.record(z.string(), SidebarConfigSchema).optional(),
  search: z
    .object({
      provider: z
        .union([z.literal("local"), z.literal("docsearch"), z.literal("none")])
        .optional(),
    })
    .optional(),
});
export type RuntimeDocsConfig = z.infer<typeof DocsConfigSchema>;

const PageHeadingSchema = z.looseObject({
  level: z.number(),
  text: z.string(),
  slug: z.string(),
});

export const LoadedContentSchema = z.object({
  pageData: z.looseObject({
    title: z.string(),
    headings: z.array(PageHeadingSchema),
  }),
  contentHtml: z.string(),
});
export type LoadedContent = z.infer<typeof LoadedContentSchema>;
export type PageHeading = z.infer<typeof PageHeadingSchema>;

export type LoadContentFn = (path: string) => Promise<LoadedContent | null>;

export const SearchEntrySchema = z.object({
  title: z.string(),
  link: z.string(),
  headings: z.array(z.string()),
  excerpt: z.string(),
});
export type RuntimeSearchEntry = z.infer<typeof SearchEntrySchema>;
export type GetSearchIndexFn = () => Promise<RuntimeSearchEntry[]>;

// Function-valued entries cannot have their signatures verified at runtime;
// validating typeof === "function" is the strictest possible check.
export const LoadContentSchema = z.custom<LoadContentFn>(
  (v) => typeof v === "function",
);
export const GetSearchIndexSchema = z.custom<GetSearchIndexFn>(
  (v) => typeof v === "function",
);

export const FALLBACK_CONFIG: RuntimeDocsConfig = {
  title: "Documentation",
  baseUrl: "/",
};

/**
 * Normalize a location pathname to a route key: strip trailing slashes and
 * resolve /index, /index.md, /index.html suffixes to the clean directory
 * path. Returns { path, redirect } where redirect is set when the raw path
 * needs a history-replacing rewrite (e.g. "/docs/ch1/index" → "/docs/ch1").
 */
export function normalizePath(raw: string): {
  path: string;
  redirect: string | null;
} {
  const indexMatch = raw.match(/^(.*?)(\/index(?:\.md|\.html)?)\/?$/);
  if (indexMatch) {
    return { path: indexMatch[1] || "/", redirect: indexMatch[1] || "/" };
  }
  const path = raw.replace(/\/+$/, "") || "/";
  return { path, redirect: null };
}

export interface NavLink {
  text: string;
  link: string;
}

function collectLinks(items: SidebarItem[], out: NavLink[]): void {
  for (const item of items) {
    if (item.link) out.push({ link: item.link, text: item.text });
    if (item.items) collectLinks(item.items, out);
  }
}

/**
 * Previous/next page relative to `currentPath` in flattened sidebar order.
 * Sidebar keys are iterated in insertion order, matching the config file.
 */
export function computePrevNext(
  sidebar: RuntimeDocsConfig["sidebar"],
  currentPath: string,
): { prev: NavLink | null; next: NavLink | null } {
  const flat: NavLink[] = [];
  if (sidebar) {
    for (const items of Object.values(sidebar)) {
      if (Array.isArray(items)) collectLinks(items, flat);
    }
  }
  const idx = flat.findIndex((item) => item.link === currentPath);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? flat[idx - 1] : null,
    next: idx < flat.length - 1 ? flat[idx + 1] : null,
  };
}
