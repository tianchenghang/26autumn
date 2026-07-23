/**
 * Shiki syntax highlighter (lazy-loaded singleton).
 *
 * Shiki uses TextMate grammars via WASM to produce accurate,
 * VSCode-quality syntax highlighting. The output is HTML with inline
 * styles -- no external CSS needed at runtime.
 *
 * The highlighter is expensive to create (WASM + grammar loading),
 * so we lazy-load it on first use and cache the singleton.
 * Subsequent calls to getHighlighter() return instantly.
 */
import type { Highlighter, BundledLanguage } from "shiki";

const DEFAULT_LANGUAGES: BundledLanguage[] = [
  "bash",
  "cjs",
  "css",
  "csv",
  "cts",
  "docker",
  "dockerfile",
  "dotenv",
  "go",
  "graphql",
  "html",
  "http",
  "javascript",
  "js",
  "json",
  "json5",
  "jsonc",
  "jsonl",
  "jsx",
  "less",
  "make",
  "makefile",
  "markdown",
  "md",
  "mdc",
  "mdx",
  "mermaid",
  "mjs",
  "mts",
  "nginx",
  "prisma",
  "proto",
  "protobuf",
  "scss",
  "sql",
  "toml",
  "tsx",
  "typescript",
  "vue",
  "wasm",
  "xml",
  "yaml",
  "yml",
  "zsh",
];

// Cache highlighters by theme+languages so that different configs (e.g. in
// multi-site builds or tests) get correctly-themed highlighters instead of
// sharing the first-created singleton.
const cache = new Map<string, Highlighter>();
const initPromises = new Map<string, Promise<Highlighter>>();

function cacheKey(
  theme: string | undefined,
  languages: string[] | undefined,
  darkTheme?: string,
): string {
  const langs = (languages ?? []).slice().sort().join(",") || "default";
  return `${theme ?? "github-dark"}+${darkTheme ?? ""}:${langs}`;
}

/**
 * Get or create the Shiki highlighter for the given theme+languages.
 * Thread-safe: concurrent calls with the same key share the init promise.
 * When `darkTheme` is set, both themes are loaded so codeToHtml can emit
 * dual-theme output (see highlightCode).
 */
export async function getHighlighter(
  theme?: string,
  languages?: string[],
  darkTheme?: string,
): Promise<Highlighter> {
  const key = cacheKey(theme, languages, darkTheme);
  const cached = cache.get(key);
  if (cached) return cached;
  const existing = initPromises.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const { createHighlighter } = await import("shiki");
    const themes = [theme ?? "github-dark"];
    if (darkTheme && darkTheme !== themes[0]) themes.push(darkTheme);
    const h = await createHighlighter({
      themes,
      langs: (languages as BundledLanguage[]) ?? DEFAULT_LANGUAGES,
    });
    cache.set(key, h);
    initPromises.delete(key);
    return h;
  })();
  initPromises.set(key, promise);
  return promise;
}

/**
 * Reset the highlighter cache. Useful for tests and config switches.
 */
export function resetHighlighter(): void {
  cache.clear();
  initPromises.clear();
}

/**
 * Highlight a code string. Returns complete `<pre>` HTML.
 *
 * With a single theme the output uses inline colors. With `darkTheme` set,
 * output uses `themes: { light, dark }` with `defaultColor: false` — every
 * token then carries `--shiki-light` / `--shiki-dark` variables and no
 * inline color, letting the theme stylesheet switch schemes under `.dark`.
 * Falls back to escaped plain text on any error.
 */
export function highlightCode(
  hl: Highlighter,
  code: string,
  lang: string,
  theme?: string,
  darkTheme?: string,
): string {
  try {
    const loadedLangs = hl.getLoadedLanguages();
    const safeLang = loadedLangs.includes(lang as BundledLanguage)
      ? lang
      : "text";

    if (darkTheme) {
      return hl.codeToHtml(code, {
        lang: safeLang,
        themes: {
          light: theme ?? "github-light",
          dark: darkTheme,
        },
        defaultColor: false,
      });
    }

    return hl.codeToHtml(code, {
      lang: safeLang,
      theme: theme ?? "github-dark",
    });
  } catch {
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
