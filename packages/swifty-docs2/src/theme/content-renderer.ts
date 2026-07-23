import { icons } from "./icons";
import type { PageHeading } from "./lib/content";
import { navigate } from "./router";
import { initToc } from "./toc";
import { $mount } from "./lib/utils";

export function initContentRenderer(
  mount: string | HTMLElement,
  html: string,
  headings: PageHeading[],
): () => void {
  const $el = $mount(mount);
  const disposers: Array<() => void> = [];

  $el.html(html);

  const el = $el[0];
  el.classList.remove("page-enter");
  void el.offsetWidth;
  el.classList.add("page-enter");

  $el.find("[data-swifty-toc]").each((_, holder) => {
    disposers.push(initToc(holder, headings, true));
  });

  $el.find(".codeblock").each((_, block) => {
    const $block = $(block);
    const pre = $block.find("pre")[0] ?? block;
    const $actions = $('<div class="codeblock-actions"></div>');
    $block.append($actions);

    const $btn = $(
      `<button class="codeblock-copy" aria-label="Copy code to clipboard"><span class="size-3.5">${icons.copy}</span></button>`,
    );
    $actions.append($btn);

    $btn.on("click", async () => {
      try {
        await navigator.clipboard.writeText(pre.innerText);
        $btn.addClass("codeblock-copy-done");
        $btn.html(`<span class="size-3.5">${icons.check}</span>`);
        $btn.attr("aria-label", "Copied");
        setTimeout(() => {
          $btn.removeClass("codeblock-copy-done");
          $btn.html(`<span class="size-3.5">${icons.copy}</span>`);
          $btn.attr("aria-label", "Copy code to clipboard");
        }, 1600);
      } catch {
        /* clipboard unavailable */
      }
    });

    disposers.push(() => $btn.off());
  });

  $el.on("click.swifty-content", "a", (e) => {
    const anchor = e.currentTarget;
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      e.preventDefault();
      document
        .getElementById(href.slice(1))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (anchor.hasAttribute("data-swifty-nav")) {
      e.preventDefault();
      navigate(href);
    }
  });

  return () => {
    for (const d of disposers.splice(0)) d();
    $el.off(".swifty-content");
    $el.empty();
  };
}
