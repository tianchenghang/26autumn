/**
 * Exposed module: CDN Manager
 *
 * This module is exposed via Module Federation so that other applications
 * (e.g., swifty-demo) can load the CdnManager React component at runtime.
 *
 * Usage from a host app:
 *   const { mountCdnManager } = await import('swifty_devtool/cdn-manager');
 *   const unmount = mountCdnManager(containerElement);
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { CdnManager } from "../components/cdn-manager";

// Import Tailwind CSS so the build tool bundles it into the remote chunk.
// Without this, MF consumers won't have any Tailwind utility classes
// used by the CdnManager component (text-sky-600, bg-sky-50, etc.).
import "../index.css";

/**
 * Mount the CdnManager React component into a container element.
 *
 * Uses React 19's createRoot for concurrent rendering. The component
 * is self-contained — it manages its own state via the useCdnApi hook
 * and requires no props.
 *
 * @param container - The DOM element to render into
 * @returns Cleanup function to unmount and tear down the React tree
 */
export function mountCdnManager(container: HTMLElement): () => void {
  const root = createRoot(container);
  // Pass the component as an element so React invokes it inside its own
  // render context — calling CdnManager() directly would execute its hooks
  // outside of React, causing "Invalid hook call".
  root.render(createElement(CdnManager));

  return () => {
    root.unmount();
  };
}

export default mountCdnManager;
