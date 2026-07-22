/**
 * Counter Store Component
 * Demonstrates zustand-style store state management
 */
import { defineView, bindStore } from "@swifty.js/mvc";
import { withBaseView } from "../view";
import template from "./counter-store.html";
import styles from "./counter-store.module.css";
import useCountStore from "../store/count";

export default defineView(
  withBaseView((ctx) => {
    ctx.updater.set({ styles });

    // ── init: bind store ──
    bindStore(ctx, useCountStore);

    return {
      template,
      events: {
        "increment<click>": () => {
          useCountStore.getState().increment();
        },
        "decrement<click>": () => {
          useCountStore.getState().decrement();
        },
        "reset<click>": () => {
          useCountStore.getState().reset();
        },
        "stepChange<change>": (e: Event) => {
          const target = e.target as HTMLInputElement;
          const newStep = parseInt(target.value) || 1;
          useCountStore.getState().setStep(newStep);
        },
        "clearHistory<click>": () => {
          useCountStore.getState().clearHistory();
        },
      },
    };
  }),
);
