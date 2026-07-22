/**
 * Project View Base — functional higher-order wrapper.
 *
 * Replaces the former `View.extend({ ctor, alert, navigate, getUrlParams })`
 * base class with a `withBaseView(setup)` higher-order function that wraps
 * any `ViewSetup` to inject common initialization logic.
 *
 * In the functional API there is no inheritance — composability is achieved
 * by wrapping setup functions. Each view calls `withBaseView(...)` to gain
 * shared logging, default updater data, and destroy cleanup.
 */
import { Router } from "@swifty.js/mvc";
import type { ViewSetup } from "@swifty.js/mvc";

/**
 * Wrap a ViewSetup with common base-view initialization logic.
 *
 * - Logs view creation and destruction
 * - Sets default shared updater data (appName, currentTime)
 * - Registers a destroy cleanup
 *
 * Usage:
 * ```ts
 * export default defineView(withBaseView((ctx, params) => {
 *   return { template, events, assign };
 * }));
 * ```
 */
export function withBaseView(setup: ViewSetup): ViewSetup {
  return (ctx, params) => {
    console.log(`View instance created: ${ctx.id}`);

    // Set global shared data
    ctx.updater.set({
      appName: "Swifty Demo",
      currentTime: new Date().toLocaleString(),
    });

    // Listen for View destroy event
    ctx.on("destroy", () => {
      console.log(`View destroyed: ${ctx.id}`);
    });

    // Delegate to the wrapped setup
    return setup(ctx, params);
  };
}

/**
 * Show alert dialog.
 */
export function showAlert(title: string, message: string): void {
  alert(`${title}\n\n${message}`);
}

/**
 * Route navigation wrapper.
 */
export function navigate(path: string, params?: Record<string, unknown>): void {
  Router.to(path, params);
}

/**
 * Get URL parameters.
 */
export function getUrlParams(): Record<string, string> {
  return Router.parse().params;
}
