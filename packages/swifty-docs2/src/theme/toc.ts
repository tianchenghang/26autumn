import { icons } from "./icons";
import type { PageHeading } from "./lib/content";
import { createScrollSpy, type ScrollSpy } from "./lib/scroll-spy";
import { cn, $mount } from "./lib/utils";

export function initToc(
  mount: string | HTMLElement,
  headings: PageHeading[],
  inline = false,
): () => void {
  const $el = $mount(mount);

  if (headings.length === 0) {
    $el.empty();
    return () => {};
  }

  const linksHtml = headings
    .map(
      (h) =>
        `<li class="relative"><a href="#${h.slug}" data-toc-slug="${h.slug}" class="${cn(
          "block py-1 text-xs leading-snug transition-colors duration-200",
          h.level >= 3 && "pl-3",
          "text-muted-foreground hover:text-foreground",
        )}">${h.text}</a></li>`,
    )
    .join("");

  $el.html(
    `<div class="${cn(inline && "not-prose border-border/80 bg-muted/30 my-6 rounded-xl border p-4")}">
      <p class="text-muted-foreground flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
        <span class="size-3.5">${icons.list}</span> On this page
      </p>
      <div class="relative mt-3">
        <span aria-hidden="true" class="bg-border/80 absolute inset-y-0 left-0 w-px"></span>
        <span aria-hidden="true" data-toc-marker class="bg-primary absolute left-0 w-px rounded-full opacity-0 transition-[top,height,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"></span>
        <ul class="space-y-px pl-3">${linksHtml}</ul>
      </div>
    </div>`,
  );

  const $marker = $el.find("[data-toc-marker]");

  const spy: ScrollSpy = createScrollSpy(headings);
  const disposeSpy = spy.onChange((slug) => {
    $el.find("a[data-toc-slug]").each((_, a) => {
      const $a = $(a);
      const isActive = $a.attr("data-toc-slug") === slug;
      $a.toggleClass("text-primary font-medium", isActive);
      $a.toggleClass("text-muted-foreground", !isActive);
    });

    if (slug) {
      const $link = $el.find(`a[data-toc-slug="${slug}"]`);
      const $li = $link.closest("li");
      if ($li.length) {
        $marker.css({
          top: `${$li[0].offsetTop}px`,
          height: `${$li[0].offsetHeight}px`,
        });
        $marker.removeClass("opacity-0");
      }
    } else {
      $marker.addClass("opacity-0");
    }
  });

  $el.on("click.swifty-toc", "a[data-toc-slug]", (e) => {
    e.preventDefault();
    const slug = $(e.currentTarget).attr("data-toc-slug");
    if (slug) {
      document
        .getElementById(slug)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  return () => {
    disposeSpy();
    spy.destroy();
    $el.off(".swifty-toc");
    $el.empty();
  };
}
