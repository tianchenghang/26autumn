/**
 * Hot Module Replacement (HMR) for Swifty MVC views.
 *
 * HMR hot-swaps view code without a full page reload, preserving view-local
 * state (counter values, form input, scroll-derived data) across updates.
 *
 * ## Two HMR layers
 *
 * 1. **Template layer** (`.html` changes): `hotSwapByTemplate(old, new)`
 *    finds every mounted view whose template function matches the old
 *    reference, replaces it, and force-renders.
 *
 * 2. **View setup layer** (`.ts` changes): `hotSwapByView(old, new)` updates
 *    the view-registry and calls `hotSwapFrames(viewPath, newSetup)` which
 *    runs `hotSwapView` on every matching frame.
 *
 * ## State preservation strategy
 *
 * `hotSwapView` preserves the entire `ViewCtx` — `updater.data`, `resources`,
 * `emitter`, `signature`, `id`, and `owner` all stay the same. It:
 * 1. Runs old `useEffect` cleanups
 * 2. Unregisters old events
 * 3. Destroys `destroyOnRender` resources
 * 4. Re-runs `newSetup(ctx)` — the same ctx instance
 * 5. Updates template/events/assign from the new descriptor
 * 6. Registers new events
 * 7. Increments signature, fires `render`, destroys transient resources,
 *    and calls `updater.forceDigest()`
 *
 * Because the setup function re-runs against the preserved ctx, any data set
 * via `ctx.updater.set()` in the previous setup survives the swap.
 */
import { parseUri } from "./utils";
import { getViewClassRegistry } from "./view-registry";
import { unregisterEvents, registerEvents, destroyAllResources } from "./view";
import { setCurrentCtx } from "./hooks";
import type { ViewSetup, ViewTemplate, FrameObj } from "./types";
import { Frame } from "./frame";

/**
 * Hot-swap a single frame's view setup in place, preserving the `ViewCtx`.
 *
 * This is the building block for state-preserving HMR. The existing ctx is
 * reused — only the setup function, template, events, and assign are
 * replaced. See the module-level docs for the full step-by-step sequence.
 *
 * @param frame - The frame whose view should be hot-swapped
 * @param newSetup - The new view setup function produced by the updated module
 */
export function hotSwapView(frame: FrameObj, newSetup: ViewSetup): void {
  const oldView = frame.view;
  if (!oldView) {
    const vp = frame.getViewPath();
    if (vp) frame.mountView(vp);
    return;
  }
  for (let i = oldView.cleanups.length - 1; i >= 0; i--) {
    oldView.cleanups[i]();
  }
  oldView.cleanups.length = 0;
  unregisterEvents(oldView);
  destroyAllResources(oldView, false);
  // Set currentCtx so hooks inside the new setup can access the ctx
  setCurrentCtx(oldView);
  let descriptor: ReturnType<ViewSetup>;
  try {
    descriptor = newSetup(oldView, undefined);
  } finally {
    setCurrentCtx(null);
  }
  oldView.setTemplate(descriptor.template);
  oldView.setEvents(descriptor.events);
  if (descriptor.assign) oldView.setAssign(descriptor.assign);
  registerEvents(oldView);
  if (oldView.signature.value > 0) {
    oldView.signature.value++;
    oldView.fire("render");
    destroyAllResources(oldView, false);
    oldView.updater.forceDigest();
  }
}

/**
 * Find all mounted frames whose view path matches `viewPath`.
 *
 * @param viewPath - The view path (without query params) to match
 * @returns Array of `{ frame, fullPath }` for each matching frame
 */
function findFramesByViewPath(
  viewPath: string,
): Array<{ frame: FrameObj; fullPath: string }> {
  const result: Array<{ frame: FrameObj; fullPath: string }> = [];
  for (const [, frame] of Frame.getAll()) {
    const vp = frame.getViewPath();
    if (vp) {
      const parsed = parseUri(vp);
      if (parsed.path === viewPath) {
        result.push({ frame, fullPath: vp });
      }
    }
  }
  return result;
}

/**
 * Batch hot-swap every frame matching `viewPath` with `newSetup`.
 *
 * Convenience wrapper around {@link hotSwapView} — finds all matching frames
 * via {@link findFramesByViewPath} and applies the new setup to each.
 *
 * @param viewPath - The view path to match against mounted frames
 * @param newSetup - The new view setup function to apply
 */
export function hotSwapFrames(viewPath: string, newSetup: ViewSetup): void {
  const targets = findFramesByViewPath(viewPath);
  for (const { frame } of targets) {
    hotSwapView(frame, newSetup);
  }
}

/**
 * Template-only HMR: find every mounted view whose template function matches
 * `oldTemplate`, replace it with `newTemplate`, and force-render.
 *
 * Event handlers are NOT re-delegated because they live in the `events` map
 * returned by the setup function, not in the template. Only the template
 * function reference is swapped.
 *
 * @param oldTemplate - The previous template function reference
 * @param newTemplate - The new template function reference
 */
export function hotSwapByTemplate(
  oldTemplate: ViewTemplate,
  newTemplate: ViewTemplate,
): boolean {
  if (!oldTemplate || !newTemplate || oldTemplate === newTemplate) return false;
  let swapped = false;
  for (const [, frame] of Frame.getAll()) {
    const view = frame.view;
    if (!view || view.getTemplate() !== oldTemplate) continue;
    view.setTemplate(newTemplate);
    if (view.signature.value > 0) {
      view.signature.value++;
      view.fire("render");
      destroyAllResources(view, false);
      view.updater.forceDigest();
    }
    swapped = true;
  }
  return swapped;
}

/**
 * View setup HMR: update the view-registry and hot-swap every frame using
 * `oldSetup` with `newSetup`.
 *
 * 1. Walk the registry, replacing any entry equal to `oldSetup` with `newSetup`
 * 2. Walk all frames, hot-swapping any whose registry entry now points to
 *    `newSetup`
 *
 * @param oldSetup - The previous setup function reference
 * @param newSetup - The new setup function reference
 */
export function hotSwapByView(
  oldSetup: ViewSetup,
  newSetup: ViewSetup,
): boolean {
  if (!oldSetup || !newSetup || oldSetup === newSetup) return false;
  const reg = getViewClassRegistry();
  for (const path in reg) {
    if (reg[path] === oldSetup) reg[path] = newSetup;
  }
  let swapped = false;
  for (const [, frame] of Frame.getAll()) {
    const view = frame.view;
    const vp = frame.getViewPath();
    if (view && vp) {
      const parsed = parseUri(vp);
      if (reg[parsed.path] === newSetup) {
        hotSwapView(frame, newSetup);
        swapped = true;
      }
    }
  }
  return swapped;
}

// ─── Global HMR handle ────────────────────────────────────────────────
// Expose hotSwapByTemplate / hotSwapByView on globalThis so that the
// auto-injected HMR snippets (see ./hmr-inject.ts) can call them WITHOUT
// importing "@swifty.js/mvc".
//
// Why a global instead of import/require("@swifty.js/mvc"):
// Under Module Federation (@swifty.js/mvc shared singleton), ANY reference
// to @swifty.js/mvc inside an HMR accept callback registers the calling
// module (compiled .html template / .ts view) as a shared consumer.
// Webpack then marks the main chunk — which initializes the MF shared
// scope — as needing a hot-update. But since main's code didn't actually
// change, no main.<hash>.hot-update.js is emitted, so the HMR runtime
// request 404s:
//   ChunkLoadError: Loading hot update chunk main failed.
//   (missing: http://localhost:<port>/main.<hash>.hot-update.js)
// The accept callback never runs → UI never updates.
//
// globalThis.__swifty_hmr__ sidesteps module resolution entirely: no import,
// no require, no chunk-graph side effect. Set once when this module loads
// (which happens before any HMR callback can fire, since the framework
// boots before views mount). Functions are hoisted (function declarations),
// so they are already defined when this top-level code runs.
if (typeof globalThis !== "undefined" && !globalThis.__swifty_hmr__) {
  globalThis.__swifty_hmr__ = {
    hotSwapByTemplate,
    hotSwapByView,
  };
}
