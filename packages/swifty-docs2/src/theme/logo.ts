import { cn, $mount } from "./lib/utils";

export function logoTemplate(href: string, title: string): string {
  return `<a href="${href}" data-swifty-link class="${cn("group focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:outline-none")}" aria-label="${title} — home">
    <span class="from-primary to-primary/70 text-primary-foreground shadow-primary/30 grid size-8 place-items-center rounded-lg bg-gradient-to-br shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-105 group-hover:-rotate-6">
      <svg viewBox="0 0 24 24" class="size-4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19c9.5-.5 15-6 16-15-9 1-14.5 6.5-15 15"/><path d="M4 19c.5-5.5 3.5-9 9.5-10.5"/></svg>
    </span>
    <span class="flex items-baseline gap-2">
      <span class="font-display text-foreground text-lg font-semibold tracking-tight">${title}</span>
      <span class="border-primary/25 bg-primary/8 text-primary hidden rounded border px-1.5 py-px font-mono text-[10px] font-medium tracking-widest sm:inline-block">DOCS</span>
    </span>
  </a>`;
}

export function initLogo(
  mount: string | HTMLElement,
  href: string,
  title: string,
): () => void {
  const $el = $mount(mount);
  $el.html(logoTemplate(href, title));
  return () => $el.empty();
}
