/**
 * CDN View — embeds the CdnManager React component from swifty-devtool
 * via Webpack Module Federation.
 *
 * The React component is loaded asynchronously from the swifty_devtool
 * remote and mounted into a container element within this Swifty MVC view.
 * On view destroy, the React tree is unmounted and cleaned up.
 */
import { defineView, useEffect, Router } from "@swifty.js/mvc";
import { withBaseView } from "../view";
import template from "./cdn.html";
import styles from "./cdn.module.css";

export default defineView(
  withBaseView((ctx, _initParams) => {
    // CSS Module class names are available to the template via updater data.
    ctx.updater.set({ styles });

    useEffect(() => {
      let destroyed = false;
      let unmount: (() => void) | undefined;

      // useEffect runs synchronously during setup, BEFORE ctx.render()
      // puts the template into the DOM. Defer to the next macrotask so
      // the [data-role="cdn-mount"] element exists in the document.
      setTimeout(() => {
        if (destroyed) return;

        const mountEl = document.querySelector<HTMLElement>(
          `#${ctx.id} [data-role="cdn-mount"]`,
        );
        if (!mountEl) return;

        import("swifty_devtool/cdn-manager")
          .then((mod) => {
            if (destroyed) return;
            const mountCdnManager = mod.mountCdnManager ?? mod.default;
            if (typeof mountCdnManager === "function") {
              unmount = mountCdnManager(mountEl);
              // Hide the loading spinner — React component is now mounted.
              ctx.updater.set({ loading: false }).digest();
            }
          })
          .catch((err: unknown) => {
            if (destroyed) return;
            console.error(
              "[CDN View] Failed to load CdnManager from swifty_devtool:",
              err,
            );
            ctx.updater
              .set({
                loading: false,
                error: true,
                errorDetail:
                  err instanceof Error
                    ? err.message
                    : "Make sure swifty-devtool is running on port 5173.",
              })
              .digest();
          });
      }, 0);

      return () => {
        destroyed = true;
        unmount?.();
      };
    }, []);

    const assign = (_options: unknown): boolean | undefined => {
      ctx.updater.snapshot();
      ctx.updater.set({
        loading: true,
        loadingText: "Loading CDN Manager...",
        error: false,
        errorDetail: "",
      });
      return ctx.updater.altered();
    };

    // Call assign for initial render
    assign(undefined);

    return {
      template,
      assign,
      events: {
        "goHome<click>": () => Router.to("/home"),
      },
    };
  }),
);
