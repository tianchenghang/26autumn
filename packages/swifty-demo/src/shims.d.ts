/// <reference path="../@mf-types/index.d.ts" />
// Loads Module Federation consumed types (declare module "@module-federation/runtime"
// augmentations for loadRemote, plus the swifty_demo/* path-mapped declarations).
//
// This MUST be a triple-slash reference (not a tsconfig `types` entry) because
// the DTS plugin generates a tsconfig in node_modules/.federation/ — a relative
// `types` path would break there. Triple-slash paths are resolved relative to
// the source file, so they work regardless of tsconfig location.

// CSS module type declarations
// Regular .css files return a string (the CSS text)
declare module "*.css" {
  const content: string;
  export default content;
}

// CSS Module files (*.module.css) return a mapping of original class names
// to scoped (hashed) class names. Used `{{=styles['bem-class-name']}}` in HTML templates.
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.html" {
  import type { ViewTemplate, VDomTemplate } from "@swifty.js/mvc";

  const template: ViewTemplate | VDomTemplate;
  export default template;
}
