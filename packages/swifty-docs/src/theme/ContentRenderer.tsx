import { useEffect, useRef, useState } from "preact/hooks";
import { render } from "preact";
import { useLocation } from "wouter-preact";
import { CheckIcon, CopyIcon } from "./icons";
import type { PageHeading } from "./lib/content";
import { cn } from "./lib/utils";
import { Toc } from "./Toc";

interface ContentRendererProps {
  html: string;
  headings: PageHeading[];
}

export function ContentRenderer({ html, headings }: ContentRendererProps) {
  const [, navigate] = useLocation();
  const articleRef = useRef<HTMLElement>(null);
  const disposersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;

    for (const dispose of disposersRef.current.splice(0)) dispose();

    // Security: `html` is the build-time output of this package's own
    // compileMarkdown() pipeline over first-party .md sources — it never
    // contains runtime user input.
    el.innerHTML = html;

    el.classList.remove("page-enter");
    void el.offsetWidth;
    el.classList.add("page-enter");

    for (const holder of Array.from(
      el.querySelectorAll<HTMLElement>("[data-swifty-toc]"),
    )) {
      render(<Toc headings={headings} inline />, holder);
      disposersRef.current.push(() => render(null, holder));
    }

    for (const block of Array.from(
      el.querySelectorAll<HTMLElement>(".codeblock"),
    )) {
      const pre = block.querySelector("pre");
      const holderEl = document.createElement("div");
      holderEl.className = "codeblock-actions";
      block.appendChild(holderEl);
      render(<CopyButton target={pre ?? block} />, holderEl);
      disposersRef.current.push(() => render(null, holderEl));
    }
  }, [html, headings]);

  useEffect(() => {
    return () => {
      for (const dispose of disposersRef.current.splice(0)) dispose();
    };
  }, []);

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

function CopyButton({ target }: { target: HTMLElement }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(target.innerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <button
      onClick={() => void copy()}
      aria-label={copied ? "Copied" : "Copy code to clipboard"}
      class={cn("codeblock-copy", copied && "codeblock-copy-done")}
    >
      {copied ? <CheckIcon class="size-3.5" /> : <CopyIcon class="size-3.5" />}
    </button>
  );
}
