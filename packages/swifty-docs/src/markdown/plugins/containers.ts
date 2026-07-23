/**
 * Custom markdown-it plugin: admonition containers.
 *
 * Supports the `::: type` syntax for tip, warning, danger, and details
 * blocks. Uses markdown-it-container for parsing, with render functions
 * that emit the theme's .callout components (styled by client.css).
 */
import type MarkdownIt from "markdown-it";
import container from "markdown-it-container";
import type { Token } from "markdown-it/index.js";

const CONTAINER_TYPES = ["tip", "warning", "danger", "details"] as const;

/** Inline SVG glyphs per container type (24px viewBox, stroke style). */
const ICONS: Record<string, string> = {
  tip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  warning:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  danger:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
  details:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
};

export interface ContainerOptions {
  [type: string]: { label: string };
}

export function containerPlugin(
  md: MarkdownIt,
  options?: ContainerOptions,
): void {
  for (const type of CONTAINER_TYPES) {
    const label = options?.[type]?.label ?? type.toUpperCase();

    md.use(container, type, {
      render(tokens: Token[], idx: number): string {
        if (tokens[idx].nesting === 1) {
          const customTitle = tokens[idx].info.trim().slice(type.length).trim();
          const title = customTitle || label;
          const escapedTitle = escapeHtml(title);
          const icon = ICONS[type] ?? "";

          if (type === "details") {
            return `
            <details class="callout callout-details">
              <summary class="callout-title">${icon}${escapedTitle}</summary>`;
          }
          return `
          <div class="callout callout-${type}" role="note">
            <p class="callout-title">${icon}${escapedTitle}</p>`;
        }
        return type === "details" ? "</details>" : "</div>";
      },
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
