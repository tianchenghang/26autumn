import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { swiftyDocsPlugin } from "@swifty.js/docs/vite";
import docsConfig from "./swifty-docs.config";

export default defineConfig({
  root: "app",
  plugins: [swiftyDocsPlugin({ config: docsConfig }), tailwindcss()],
  resolve: {
    alias: {
      "@swifty-docs/generated": resolve(__dirname, ".swifty-docs/generated"),
    },
  },
});
