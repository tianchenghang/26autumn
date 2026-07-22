/**
 * Swifty Application Bootstrap
 *
 * Chunk-split architecture: each view is a separate chunk loaded via
 * dynamic import(). When mountView encounters an unregistered view path,
 * it calls Framework.use() → require() → import() → registers + mounts.
 *
 * Sub-components of "counter" are preloaded in parallel with the parent
 * view so they're available when mountZone processes v-swifty elements.
 */
import { Framework, registerViewClass } from "@swifty.js/mvc";
import type { FrameworkConfig, ViewSetup } from "@swifty.js/mvc";
import "./index.css";

console.log("Initializing Swifty application...");

// ── View path → dynamic import loader ──
// Each import() call creates a separate chunk in both Vite and Webpack.
// The bundler scans these at build time and splits them into independent files.
const VIEW_MODULES: Record<string, () => Promise<unknown>> = {
  home: () => import("./views/home").then((home) => home.default),
  about: () => import("./views/about").then((about) => about.default),
  counter: () => import("./views/counter").then((counter) => counter.default),
  cdn: () => import("./views/cdn").then((cdn) => cdn.default),
  "404": () => import("./views/404").then((notFound) => notFound.default),
  "components/counter-store": () =>
    import("./components/counter-store").then(
      (counterStore) => counterStore.default,
    ),
  "components/counter-updater": () =>
    import("./components/counter-updater").then(
      (counterUpdater) => counterUpdater.default,
    ),
};

// ── Sub-component dependency map ──
// When a parent view is loaded, its sub-components are preloaded in
// parallel so they're registered before mountZone processes v-swifty.
const VIEW_DEPS: Record<string, string[]> = {
  counter: ["components/counter-store", "components/counter-updater"],
};

// Configure and start Swifty application
const config: FrameworkConfig = {
  defaultPath: "/home",
  defaultView: "home",
  routeMode: "history",
  routes: {
    "/home": "home",
    "/about": "about",
    "/counter": "counter",
    "/cdn": "cdn",
  },
  unmatchedView: "404",
  rootId: "app",
  vdom: true,
  devtool: true,
  error(e: Error) {
    console.error("Swifty application error:", e);
  },

  // ── Lazy view loading via dynamic import ──
  // When mountView encounters an unregistered view path, it calls
  // Framework.use() → this require function → dynamic import() →
  // loads the View class → registers it → mounts it.
  //
  // Sub-component dependencies are preloaded in parallel with the
  // parent view so mountZone finds them already registered.
  require: async (names: string[]): Promise<unknown[]> => {
    // Collect sub-component dependencies to preload
    const preloadNames: string[] = [];
    for (const name of names) {
      const deps = VIEW_DEPS[name];
      if (deps) {
        for (const dep of deps) {
          if (!names.includes(dep) && !preloadNames.includes(dep)) {
            preloadNames.push(dep);
          }
        }
      }
    }

    // Load requested modules and preload dependencies in parallel
    const allNames = [...names, ...preloadNames];
    const allResults = await Promise.all(
      allNames.map(async (name) => {
        const loader = VIEW_MODULES[name];
        if (!loader) {
          console.warn(`[Swifty] Unknown view path: ${name}`);
          return { name, ViewClass: undefined };
        }
        const mod = await loader();

        // Register preloaded sub-components immediately.
        // Requested views are registered by mountView's use() callback.
        if (preloadNames.includes(name) && typeof mod === "function") {
          // Type assertion: dynamically loaded module shape is unknown at compile time,
          // but at runtime it's a Swifty View setup function (returned by defineView).
          registerViewClass(name, mod as ViewSetup);
        }

        return { name, ViewClass: mod };
      }),
    );

    // Return only the requested modules (preloaded ones are already registered)
    return allResults
      .filter((r) => names.includes(r.name))
      .map((r) => r.ViewClass);
  },
};

Framework.boot(config);

console.log("@swifty.js/mvc application started (chunk-split mode)!");
console.log("Visit http://localhost:3000 to get started");
