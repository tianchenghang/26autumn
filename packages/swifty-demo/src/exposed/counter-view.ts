/**
 * Exposed module: Counter View
 *
 * This module is exposed via Webpack Module Federation so that
 * other applications (e.g., swifty-devtool) can load the CounterView
 * and its sub-components at runtime.
 *
 * Usage from a host app:
 *   const { mountCounter } = await import('swifty-demo/counter-view');
 *   const unmount = mountCounter(containerElement);
 */
import {
  Framework,
  Frame,
  createFrame,
  registerViewClass,
  EventDelegator,
  Router,
  State,
} from "@swifty.js/mvc";
import CounterView from "../views/counter";
import CounterStoreComponent from "../components/counter-store";
import CounterUpdaterComponent from "../components/counter-updater";

// Import Tailwind CSS so that webpack bundles it into the remote chunk.
// Without this, MF consumers won't have any of the utility classes
// (bg-emerald-600, text-cyan-400, etc.) used in the templates.
import "../index.css";

/** Unique view path for the top-level counter view */
const MF_COUNTER = "mf/counter";

// Register views (idempotent)
// Top-level view uses mf/ prefix to avoid collision with host app.
// Sub-components MUST use their ORIGINAL paths because the compiled
// template embeds these path strings in v-swifty attributes at build time.
registerViewClass(MF_COUNTER, CounterView);
registerViewClass("components/counter-store", CounterStoreComponent);
registerViewClass("components/counter-updater", CounterUpdaterComponent);

/**
 * Mount the Counter view into a container element.
 *
 * This function handles all Swifty framework setup:
 * 1. Boots the framework minimally if not already booted
 * 2. Registers view classes with MF-prefixed names
 * 3. Creates an independent Frame and mounts the Counter view
 *
 * IMPORTANT: We use `new Frame(containerId)` instead of `Frame.createRoot()`
 * because `Frame.createRoot()` is a singleton — it returns the same rootFrame
 * on every call, ignoring the rootId parameter after first creation.
 * Using `new Frame()` ensures each mount gets its own Frame, allowing
 * multiple containers to render independently (e.g., mf-demo and sf-cdn-demo).
 *
 * @param container - The DOM element to render into
 * @returns Cleanup function to unmount and tear down
 */
export function mountCounter(container: HTMLElement): () => void {
  const containerId = container.id || "mf-counter-root";
  container.id = containerId;

  // Minimal framework boot (idempotent — safe to call on every mount).
  // Framework.isBooted() checks framework.ts's module-level `booted`
  // variable, which is only set by Framework.boot(). Since we only call
  // Framework.setConfig() (not boot()), isBooted() always returns false,
  // so this block always executes — which is fine because config()
  // just merges config and EventDelegator.setFrameGetter is idempotent.
  //
  // vdom: true MUST match the build-time loader option.
  // Templates in this remote module are compiled with vdom: true,
  // so they return VDomNode objects instead of HTML strings. If the
  // runtime config has vdom: false (default), the updater takes
  // the string rendering path and treats VDomNode objects as HTML
  // strings → "[object Object]" in the DOM.
  Framework.setConfig({
    rootId: containerId,
    vdom: true,
    error(e: Error) {
      console.error("[MF Counter View]", e);
    },
  });
  EventDelegator.setFrameGetter((id: string) => Frame.get(id));

  // Create an INDEPENDENT Frame for this container.
  // Do NOT use Frame.createRoot() — it is a singleton that always returns the
  // first-created rootFrame, making all subsequent mounts render into the
  // first container instead of their own.
  const frame = createFrame(containerId);
  frame.mountView(MF_COUNTER);

  // Return cleanup function
  return () => {
    frame.unmountView();
    // Remove independent frame from registry and DOM.
    // The rootFrame singleton (if any) is NOT affected.
    const registry = Frame.getAll();
    registry.delete(containerId);
    const el = document.getElementById(containerId);
    if (el) {
      Reflect.set(el, "frameBound", 0);
    }
  };
}

/** The raw CounterView class (for advanced usage) */
export { CounterView };

/** Default export: the mount function */
export default mountCounter;
