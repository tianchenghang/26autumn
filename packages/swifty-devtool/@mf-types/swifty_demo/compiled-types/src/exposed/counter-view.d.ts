import CounterView from "../views/counter";
import "../index.css";
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
export declare function mountCounter(container: HTMLElement): () => void;
/** The raw CounterView class (for advanced usage) */
export { CounterView };
/** Default export: the mount function */
export default mountCounter;
