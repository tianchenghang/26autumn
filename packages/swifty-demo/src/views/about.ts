/**
 * About Page View
 * Demonstrates route navigation + shared store state
 */
import { defineView, Router, bindStore } from "@swifty.js/mvc";
import { withBaseView } from "../view";
import template from "./about.html";
import styles from "./about.module.css";
import useCountStore from "../store/count";

export default defineView(
  withBaseView((ctx, initParams) => {
    // CSS Module class names are available to the template via updater data.
    ctx.updater.set({ styles });

    // ── init: bind store ──
    bindStore(ctx, useCountStore, (s) => ({ count: s.count, step: s.step }));

    // ── assign: incremental DOM update ──
    const assign = (_options?: unknown): boolean | undefined => {
      ctx.updater.snapshot();

      const urlParams = Router.parse().params;
      const { count, step } = useCountStore.getState();

      ctx.updater.set({
        title: "About Swifty",
        content: "Swifty is a TypeScript MVC framework",
        author: urlParams["author"] || "Anonymous",
        version: urlParams["version"] || "1.0",
        count,
        step,
      });

      return ctx.updater.altered();
    };

    // Call assign for initial render
    assign(initParams);

    return {
      template,
      assign,
      events: {
        "goHome<click>": () => {
          Router.to("/home");
        },
      },
    };
  }),
);
