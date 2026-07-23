import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { createPortal } from "preact/compat";
import { cn } from "../lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ComponentChildren;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return <>{children}</>;
}

export function DialogPortal({ children }: { children: ComponentChildren }) {
  return createPortal(<>{children}</>, document.body);
}

export function DialogOverlay({ class: className }: { class?: string }) {
  return (
    <div
      class={cn(
        "bg-foreground/25 animate-overlay-in fixed inset-0 z-50 backdrop-blur-[2px] dark:bg-black/50",
        className,
      )}
    />
  );
}

interface DialogContentProps {
  class?: string;
  children: ComponentChildren;
}

export function DialogContent({
  class: className,
  children,
}: DialogContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      class={cn(
        "border-border bg-card text-card-foreground shadow-foreground/10 animate-dialog-in fixed z-50 flex flex-col overflow-hidden rounded-xl border shadow-2xl outline-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DialogAccessibleTitle({
  children,
}: {
  children: ComponentChildren;
}) {
  return <h2 class="sr-only">{children}</h2>;
}

export function DialogTitle({
  children,
  class: className,
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return <h2 class={className}>{children}</h2>;
}

export function DialogDescription({
  children,
  class: className,
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return <p class={className}>{children}</p>;
}

export function DialogClose({
  children,
  class: className,
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return <button class={className}>{children}</button>;
}

export function DialogTrigger({
  children,
  class: className,
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return <button class={className}>{children}</button>;
}
