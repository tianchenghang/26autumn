/**
 * Shared DOM traversal helpers for theme views.
 */

/**
 * Walk up from `target` to find the nearest element carrying `data-href`.
 * Returns the href value or null if not found.
 *
 * Theme templates render <a> elements with `data-href` and a @click handler.
 * Clicks may land on child elements (<svg>, <span>, <mark>), so the handler
 * must walk up to the element that actually carries the attribute.
 */
export function findDataHref(target: EventTarget | null): string | null {
  let el = target instanceof HTMLElement ? target : null;
  while (el && !el.dataset["href"]) {
    el = el.parentElement;
  }
  return el ? (el.dataset["href"] ?? null) : null;
}
