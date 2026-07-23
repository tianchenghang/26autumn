import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "../lib/utils";

export function Kbd(props: ComponentProps<"kbd">) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <kbd
      class={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center rounded border border-border bg-muted/60 px-1 font-mono text-[10px] font-medium text-muted-foreground",
        local.class,
      )}
      {...rest}
    />
  );
}
