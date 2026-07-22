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
export declare function mountCdnManager(container: HTMLElement): () => void;
export default mountCdnManager;
