/**
 * Counter View
 * Demonstrates v-swifty nested sub-components
 */
import { defineView, Router } from "@swifty.js/mvc";
import { withBaseView } from "../view";
import template from "./counter.html";
import styles from "./counter.module.css";

interface CounterState {
  count: number;
  step: number;
  history: string[];
}

export default defineView(
  withBaseView((ctx) => {
    // CSS Module class names are available to the template via updater data.
    // ctx.updater.set({ styles });

    // ── init: set initial data (replaces async render()) ──
    ctx.updater.digest({
      count: 0,
      step: 1,
      history: [],
      styles,
    });

    return {
      template,
      events: {
        "increment<click>": () => {
          const { count, step, history } = ctx.updater.get<CounterState>();
          const newCount = count + step;
          ctx.updater
            .set({
              count: newCount,
              history: [`+${step} → ${newCount}`, ...history],
            })
            .digest();
        },
        "decrement<click>": () => {
          const { count, step, history } = ctx.updater.get<CounterState>();
          const newCount = count - step;
          ctx.updater
            .set({
              count: newCount,
              history: [`-${step} → ${newCount}`, ...history],
            })
            .digest();
        },
        "reset<click>": () => {
          ctx.updater
            .set({
              count: 0,
              history: ["Reset → 0", ...ctx.updater.get<string[]>("history")],
            })
            .digest();
        },
        "stepChange<change>": (e: { step?: number }) => {
          const newStep = e?.step ?? 1;
          ctx.updater.set({ step: newStep }).digest();
        },
        "clearHistory<click>": () => {
          ctx.updater.set({ history: [] }).digest();
        },
        "navigateTo<click>": (e: Record<string, unknown>) => {
          const p = e["params"] as Record<string, string> | undefined;
          if (p?.["path"]) {
            Router.to(p["path"]);
          }
        },
      },
    };
  }),
);
