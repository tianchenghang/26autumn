/**
 * Centralized icon registry for @swifty.js/docs theme views.
 *
 * Imports individual SVG files from lucide-static as raw strings (Vite ?raw).
 * Each icon is a complete `<svg>...</svg>` markup string at build time.
 *
 * Usage in theme templates (via {{!}} raw output operator):
 *   {{!icons.search}}
 *
 * Icons inherit `currentColor` from their parent container, so color is
 * controlled via Tailwind text-color utilities on the wrapper <span>.
 */
import search from "lucide-static/icons/search.svg?raw";

export const icons = { search };
