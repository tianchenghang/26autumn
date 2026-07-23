import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "../lib/utils";

export function Kbd(props: ComponentProps<"kbd">) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <kbd
      class={cn(
        "border-border bg-muted/60 text-muted-foreground pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-mono text-[10px] font-medium select-none",
        local.class,
      )}
      {...rest}
    />
  );
}
