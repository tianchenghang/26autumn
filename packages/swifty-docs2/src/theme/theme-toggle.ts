import { cn, $mount } from "./lib/utils";

const STORAGE_KEY = "swifty-docs-theme";

function themeToggleIcon(dark: boolean): string {
  return `<span class="relative block size-4" aria-hidden="true">
    <svg viewBox="0 0 24 24" class="${cn("absolute inset-0 size-4 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]", dark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0")}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
    <svg viewBox="0 0 24 24" class="${cn("absolute inset-0 size-4 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]", dark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100")}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
  </span>`;
}

export function initThemeToggle(mount: string | HTMLElement): () => void {
  const $el = $mount(mount);
  let dark = document.documentElement.classList.contains("dark");

  function render() {
    $el.html(
      `<button class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 h-9 w-9 text-muted-foreground hover:bg-accent/60 hover:text-foreground" aria-label="${dark ? "Switch to light mode" : "Switch to dark mode"}">${themeToggleIcon(dark)}</button>`,
    );
  }

  render();

  $el.on("click.swifty-theme", "button", () => {
    dark = !dark;
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      /* storage unavailable */
    }
    render();
  });

  return () => {
    $el.off(".swifty-theme");
    $el.empty();
  };
}
