/**
 * Shared title derivation utilities.
 *
 * Used by both the scanner and compiler to ensure consistent
 * title generation across the build pipeline.
 */

/**
 * Derive a human-readable title from a file path.
 *
 * Rules:
 * - "index.md" uses the parent directory name (e.g. "guide/index" -> "Guide")
 * - If there is no parent directory, falls back to "Home"
 * - Other files: replace dashes with spaces and capitalize words
 *   (e.g. "getting-started" -> "Getting Started")
 */
export function deriveTitleFromPath(filePath: string): string {
  const segments = filePath.split("/");
  const fileName = segments[segments.length - 1] || "index";
  const name = fileName.replace(/\.md$/, "");
  if (name === "index") {
    const parent = segments[segments.length - 2];
    if (!parent) return "Home";
    return parent
      .replace(/-/g, " ")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
