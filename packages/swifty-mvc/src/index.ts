/**
 * Swifty Framework — public API barrel export.
 *
 * Re-exports the complete public surface of `@swifty.js/mvc` from a single
 * entry point. Consumers can `import { defineView, Framework, State, ... }`
 * from `"@swifty.js/mvc"` without knowing the internal module layout.
 *
 * ## API surface
 *
 * | Category | Exports |
 * | -------- | ------- |
 * | Framework | `Framework`, `defineView`, `EventDelegator` |
 * | State | `State`, `createStore`, `computed`, `bindStore`, `useUrlState` |
 * | Router | `Router` |
 * | View | `defineView`, `ViewCtx`, `useState`, `useEffect`, `useStore`, ... |
 * | Frame | `Frame`, `createFrame`, `registerViewClass`, `invalidateViewClass` |
 * | Service | `createService`, `ServiceApi`, `PayloadApi` |
 * | VDOM | `vdomCreate` (used by compiled template modules) |
 * | Types | All types from `./types` via `export *` |
 *
 * Internal-only utilities (`mark`, `createCache`, `createEmitter`, HMR swap
 * functions, etc.) are accessible via the `Framework` object or `globalThis`
 * rather than re-exported here — they are implementation details that bloat
 * the public API surface without serving external consumers.
 */

// State (cross-view observable data)
export { State } from "./state";

// Router (history/hash with two-phase change)
export { Router } from "./router";

// Frame (view lifecycle management — functional factory + singleton)
export { Frame, createFrame } from "./frame";
export type { FrameApi } from "./frame";
export { registerViewClass, invalidateViewClass } from "./frame";

// View (functional — defineView factory)
export { defineView } from "./view";

// Hooks runtime
export {
  useState,
  useEffect,
  useStore,
  useInterval,
  useTimeout,
  useResource,
  useEvent,
} from "./hooks";

// Service (API request management)
export { createService } from "./service";
export type { ServiceApi, ServiceInstance } from "./service";

// EventDelegator (DOM event delegation)
export { EventDelegator } from "./event-delegator";

// Framework (main entry point)
export { Framework } from "./framework";

// URL state hook (sync view state with URL params)
export { useUrlState } from "./url-state";

// Store (zustand-aligned state management)
export { createStore, computed, bindStore } from "./store";
export type { StoreApi } from "./store";

// VDOM engine — vdomCreate is imported by compiled template modules at runtime
// (`import { vdomCreate } from "@swifty.js/mvc"`). Must stay in the public barrel.
export { vdomCreate } from "./vdom";

// Types (re-exported for consumer convenience)
export * from "./types";
