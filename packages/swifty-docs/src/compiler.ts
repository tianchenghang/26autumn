/**
 * Public compiler entry point.
 *
 * Re-exports compileMarkdown for use by build plugins (Vite/Webpack/Rspack)
 * and for direct programmatic usage.
 */
export { compileMarkdown } from "./compile-markdown";
export type { CompileMarkdownOptions } from "./types";
