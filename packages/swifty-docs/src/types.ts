/**
 * @swifty.js/docs type definitions.
 * All shared types for the documentation site generator.
 */

// ============================================================
// Configuration types
// ============================================================

/**
 * Top-level configuration for @swifty.js/docs.
 * Passed to defineConfig() in the user's swifty-docs.config.ts.
 */
export interface DocsConfig {
  /** Docs source directory, relative to project root. Default: "docs" */
  docs: string;

  /** Base URL prefix for all generated routes. Default: "/docs/" */
  baseUrl: string;

  /** Site title displayed in the navbar. */
  title: string;

  /** Site description for meta tags. */
  description?: string;

  /** Top navigation items. */
  nav?: NavItem[];

  /**
   * Sidebar configuration per path prefix.
   * "auto" generates the sidebar from the directory structure.
   * An array of SidebarItem provides manual configuration.
   */
  sidebar?: Record<string, SidebarConfig>;

  /** Markdown processing options. */
  markdown?: MarkdownOptions;

  /** Code syntax highlighting options (Shiki). */
  highlight?: HighlightOptions;

  /** Search configuration. */
  search?: SearchOptions;
}

/** Navigation item in the top navbar. */
export interface NavItem {
  /** Display text. */
  text: string;
  /** Link URL (internal or external). */
  link: string;
  /** Nested dropdown items. */
  items?: NavItem[];
}

/** Sidebar config: "auto" for filesystem-based, or explicit items. */
export type SidebarConfig = "auto" | SidebarItem[];

/** Sidebar navigation item. */
export interface SidebarItem {
  /** Display text. */
  text: string;
  /** Link URL. Optional for group headers. */
  link?: string;
  /** Whether the group starts collapsed. Default: false */
  collapsed?: boolean;
  /** Child items (for groups). */
  items?: SidebarItem[];
  /** Whether this item matches the current route (set at runtime). */
  isActive?: boolean;
  /** Pre-computed CSS class string (set at runtime by sidebar view). */
  itemClass?: string;
}

/** Markdown processing options. */
export interface MarkdownOptions {
  /** Heading anchor options. */
  anchor?: { permalink?: boolean };
  /** Custom container labels. Keys: tip, warning, danger, details. */
  containers?: Record<string, { label: string }>;
}

/** Code syntax highlighting options. */
export interface HighlightOptions {
  /** Shiki theme name. Default: "github-dark" */
  theme?: string;
  /** Languages to load. Default: common web languages. */
  languages?: string[];
}

/** Search configuration. */
export interface SearchOptions {
  /**
   * Search provider.
   * - "local": MiniSearch-powered modal with prefix matching, fuzzy matching,
   *   field-weighted scoring, and result highlighting (same engine as VitePress).
   * - "docsearch": Algolia DocSearch UI widget backed by the local search index
   *   (no Algolia account required).
   * - "none": disable search entirely.
   *
   * Default: "local"
   */
  provider?: "local" | "docsearch" | "none";
}

// ============================================================
// Page data types
// ============================================================

/** Metadata extracted from a single .md file's frontmatter + content. */
export interface PageData {
  /** Page title (from frontmatter or first h1). */
  title: string;
  /** Page description (from frontmatter). */
  description?: string;
  /** Plain-text excerpt of the page body, used for search indexing. */
  excerpt: string;
  /** Sort position in sidebar (from frontmatter sidebar_position). */
  sidebarPosition?: number;
  /** Override sidebar label (from frontmatter sidebar_label). */
  sidebarLabel?: string;
  /** If true, excluded from production builds. */
  draft?: boolean;
  /** Extracted h2/h3 headings for TOC. */
  headings: HeadingInfo[];
  /** Path relative to the docs directory. */
  relativePath: string;
}

/** A heading extracted from markdown content. */
export interface HeadingInfo {
  /** Heading level (2 for h2, 3 for h3). */
  level: number;
  /** Plain text content. */
  text: string;
  /** URL-safe slug for anchor links. */
  slug: string;
}

// ============================================================
// Route types
// ============================================================

/** Generated route entry for a single .md file. */
export interface DocsRoute {
  /** Full route path including baseUrl prefix. e.g. "/docs/guide/config" */
  path: string;
  /** Absolute file path to the .md source. */
  filePath: string;
  /** Extracted page metadata. */
  pageData: PageData;
  /**
   * True for virtual index routes generated for directories that have no
   * index.md. These routes point to the first page (by sidebar_position or
   * filename order) and are excluded from the sidebar to avoid duplicates.
   */
  isDirectoryIndex?: boolean;
}

// ============================================================
// Search types
// ============================================================

/** Search index entry for a single docs page. */
export interface SearchEntry {
  /** Page title. */
  title: string;
  /** Route link. */
  link: string;
  /** All heading texts on the page. */
  headings: string[];
  /** First ~200 chars of plain text content. */
  excerpt: string;
}

// ============================================================
// Frontmatter types
// ============================================================

/** Result of frontmatter extraction from a .md file. */
export interface FrontmatterResult {
  /** Parsed YAML frontmatter as key-value pairs. */
  data: Record<string, unknown>;
  /** Markdown content with frontmatter stripped. */
  content: string;
}

// ============================================================
// Compiler types
// ============================================================

/** Options for compileMarkdown(). */
export interface CompileMarkdownOptions {
  /** Full docs config. */
  config: DocsConfig;
  /** Absolute path to the .md file being compiled. */
  filePath: string;
  /** Enable debug line markers. */
  debug?: boolean;
  /** Project root for resolving relative `config.docs`. Defaults to process.cwd(). */
  projectRoot?: string;
}
