/**
 * Custom markdown-it plugin: admonition containers.
 *
 * Supports the `::: type` syntax for tip, warning, danger, and details blocks.
 * Uses markdown-it-container under the hood for parsing, with custom render
 * functions that produce DaisyUI-compatible class names.
 */
import type MarkdownIt from "markdown-it";
import container from "markdown-it-container";
import type { Token } from "markdown-it/index.js";

const CONTAINER_TYPES = ["tip", "warning", "danger", "details"] as const;

/** Map container type to daisyUI alert color class. */
const ALERT_COLOR: Record<string, string> = {
  tip: "alert-info",
  warning: "alert-warning",
  danger: "alert-error",
  details: "",
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
          // Opening tag
          const customTitle = tokens[idx].info.trim().slice(type.length).trim();
          const title = customTitle || label;
          const escapedTitle = escapeHtml(title);
          const alertColor = ALERT_COLOR[type] ?? "";
          // Avoid a trailing space when alertColor is empty (e.g. details).
          const alertClass = alertColor ? `alert ${alertColor}` : "alert";

          if (type === "details") {
            return `
            <details role="alert" class="${alertClass}">
              <summary class="font-semibold">${escapedTitle}</summary>`;
          }
          return `
          <div role="alert" class="${alertClass}">
            <div>
              <p class="font-semibold">${escapedTitle}</p>`;
        }
        // Closing tag
        return type === "details" ? "</details>" : "</div></div>";
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
