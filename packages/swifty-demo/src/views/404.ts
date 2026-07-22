/**
 * 404 Page View
 * Displayed when route is not matched
 */
import { defineView, Router } from "@swifty.js/mvc";
import template from "./404.html";
import styles from "./404.module.css";

export default defineView((ctx, params) => {
  // CSS Module class names are available to the template via updater data.
  // The bundler handles CSS injection at import time
  ctx.updater.set({ styles });

  // ── assign: incremental DOM update ──
  const assign = (_options?: unknown): boolean | undefined => {
    ctx.updater.snapshot();

    const loc = Router.parse();

    ctx.updater.set({
      path: loc.path || "Unknown path",
    });

    return ctx.updater.altered();
  };

  // Call assign for initial render
  assign(params);

  return {
    template,
    assign,
    events: {
      "goHome<click>": () => {
        Router.to("/home");
      },
    },
  };
});
