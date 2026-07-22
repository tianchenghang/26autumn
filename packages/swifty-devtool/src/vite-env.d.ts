/// <reference path="../@mf-types/index.d.ts" />
// Loads Module Federation consumed types (declare module "@module-federation/runtime"
// augmentations for loadRemote, plus the swifty_demo/* path-mapped declarations).
//
// This MUST be a triple-slash reference (not a tsconfig `types` entry) because
// the DTS plugin generates a tsconfig in node_modules/.federation/ — a relative
// `types` path would break there. Triple-slash paths are resolved relative to
// the source file, so they work regardless of tsconfig location.

declare module "*.css" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  const content: string;
  export default content;
}
