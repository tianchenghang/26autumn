import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "../lib/utils";

export function Input(props: ComponentProps<"input">) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <input
      class={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring/60 focus-visible:ring-ring/30 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        local.class,
      )}
      {...rest}
    />
  );
}
