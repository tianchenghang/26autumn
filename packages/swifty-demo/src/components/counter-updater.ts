/**
 * Counter Updater Component
 * Pure display + event relay — no own state.
 * Props (count, step, history) come from parent via v-swifty- p-swifty-*.
 * Button clicks fire events to parent via ctx.owner.fire().
 */
import { defineView } from "@swifty.js/mvc";
import { withBaseView } from "../view";
import template from "./counter-updater.html";
import styles from "./counter-updater.module.css";

export default defineView(
  withBaseView((ctx, params) => {
    const p = (params || {}) as Record<string, unknown>;

    // Store props as-is — mountZone will push updates on parent re-render
    ctx.updater.digest({
      count: p["count"] ?? 0,
      step: p["step"] ?? 1,
      history: p["history"] ?? [],
      styles,
    });

    return {
      template,
      events: {
        "increment<click>": () => ctx.owner.fire("increment"),
        "decrement<click>": () => ctx.owner.fire("decrement"),
        "reset<click>": () => ctx.owner.fire("reset"),
        "stepChange<change>": (e: Event) => {
          const target = e.target as HTMLInputElement;
          ctx.owner.fire("stepChange", { step: parseInt(target?.value) || 1 });
        },
        "clearHistory<click>": () => ctx.owner.fire("clearHistory"),
      },
    };
  }),
);
