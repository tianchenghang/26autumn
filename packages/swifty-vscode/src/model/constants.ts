// Shared regex patterns for template import detection
// Used by both view-file-cache and definition-provider

// Global flag version for use with exec() in loops (requires lastIndex reset)
export const TEMPLATE_IMPORT_REGEX_GLOBAL =
  /import\s+\w+\s+from\s+['"]([^'"]+\.html)['"]/g;

// Non-global version for single-line matching
export const TEMPLATE_IMPORT_REGEX =
  /import\s+\w+\s+from\s+['"]([^'"]+\.html)['"]/;
