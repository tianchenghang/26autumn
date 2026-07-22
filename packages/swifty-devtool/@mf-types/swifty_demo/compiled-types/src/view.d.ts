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
export declare function withBaseView(setup: ViewSetup): ViewSetup;
/**
 * Show alert dialog.
 */
export declare function showAlert(title: string, message: string): void;
/**
 * Route navigation wrapper.
 */
export declare function navigate(path: string, params?: Record<string, unknown>): void;
/**
 * Get URL parameters.
 */
export declare function getUrlParams(): Record<string, string>;
