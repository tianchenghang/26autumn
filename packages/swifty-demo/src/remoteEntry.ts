/**
 * Module Federation async boundary.
 * Webpack requires the entry point to be an async boundary for MF to work.
 * The actual bootstrap logic lives in boot.ts.
 */
import("./boot");
