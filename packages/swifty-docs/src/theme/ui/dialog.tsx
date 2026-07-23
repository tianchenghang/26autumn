import { Dialog as DialogPrimitive } from "@kobalte/core/dialog";
import { splitProps, type ComponentProps, type ParentProps } from "solid-js";
import { cn } from "../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.CloseButton;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogOverlay(
  props: ComponentProps<typeof DialogPrimitive.Overlay>,
) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <DialogPrimitive.Overlay
      class={cn(
        "fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[2px] animate-overlay-in dark:bg-black/50",
        local.class,
      )}
      {...rest}
    />
  );
}

export function DialogContent(
  props: ParentProps<ComponentProps<typeof DialogPrimitive.Content>>,
) {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <DialogPrimitive.Content
      class={cn(
        "fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl shadow-foreground/10 outline-none animate-dialog-in",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </DialogPrimitive.Content>
  );
}

/** Visually hidden but announced to screen readers. */
export function DialogAccessibleTitle(props: ParentProps) {
  return (
    <DialogPrimitive.Title class="sr-only">
      {props.children}
    </DialogPrimitive.Title>
  );
}
