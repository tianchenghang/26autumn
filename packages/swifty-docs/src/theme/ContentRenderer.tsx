import { useNavigate } from "@solidjs/router";
import {
  createEffect,
  createSignal,
  onCleanup,
  Show,
  type Accessor,
} from "solid-js";
import { render } from "solid-js/web";
import { CheckIcon, CopyIcon } from "./icons";
import type { PageHeading } from "./lib/content";
import { cn } from "./lib/utils";
import { Toc } from "./Toc";

interface ContentRendererProps {
  html: string;
  headings: Accessor<PageHeading[]>;
}

/**
 * Injects the build-time rendered markdown HTML and wires up the runtime
 * behaviors that static HTML cannot provide: SPA link interception, inline
 * [[toc]] mounts, and code-block copy buttons.
 */
export function ContentRenderer(props: ContentRendererProps) {
  const navigate = useNavigate();
  let articleRef: HTMLElement | undefined;
  const disposers: Array<() => void> = [];

  const disposeAll = () => {
    for (const dispose of disposers.splice(0, disposers.length)) dispose();
  };

  createEffect(() => {
    const html = props.html;
    const el = articleRef;
    if (!el) return;

    disposeAll();
    // Security: `html` is the build-time output of this package's own
    // compileMarkdown() pipeline over first-party .md sources in the repo,
    // embedded as a JSON string in the compiled page module — it never
    // contains runtime user input. Raw HTML passthrough (markdown-it
    // `html: true`) is an intentional, documented authoring feature, so
    // the content is injected as-is rather than sanitized.
    el.innerHTML = html;

    // Restart the entrance animation on every page change.
    el.classList.remove("page-enter");
    void el.offsetWidth;
    el.classList.add("page-enter");

    // Mount inline TOC placeholders emitted by the [[toc]] directive.
    for (const holder of Array.from(
      el.querySelectorAll<HTMLElement>("[data-swifty-toc]"),
    )) {
      disposers.push(
        render(() => <Toc headings={props.headings} inline />, holder),
      );
    }

    // Attach copy buttons to code blocks.
    for (const block of Array.from(
      el.querySelectorAll<HTMLElement>(".codeblock"),
    )) {
      const pre = block.querySelector("pre");
      const holder = document.createElement("div");
      holder.className = "codeblock-actions";
      block.appendChild(holder);
      disposers.push(
        render(() => <CopyButton target={pre ?? block} />, holder),
      );
    }
  });

  onCleanup(disposeAll);

  const onClick = (e: MouseEvent) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const anchor = target.closest("a");
    if (!anchor) return;
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
  };

  return (
    <article ref={articleRef} onClick={onClick} class="prose max-w-none" />
  );
}

function CopyButton(props: { target: HTMLElement }) {
  const [copied, setCopied] = createSignal(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.target.innerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable (insecure context) — leave the button inert
    }
  };

  return (
    <button
      onClick={() => void copy()}
      aria-label={copied() ? "Copied" : "Copy code to clipboard"}
      class={cn("codeblock-copy", copied() && "codeblock-copy-done")}
    >
      <Show when={!copied()} fallback={<CheckIcon class="size-3.5" />}>
        <CopyIcon class="size-3.5" />
      </Show>
    </button>
  );
}
