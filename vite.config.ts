import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { swiftyDocsPlugin } from "@swifty.js/docs/vite";
import docsConfig from "./swifty-docs.config";
import { docsGuardPlugin } from "./plugins/docs-guard";

export default defineConfig({
  base: "/26autumn/",
  root: "app",
  plugins: [
    swiftyDocsPlugin({ config: docsConfig }),
    docsGuardPlugin(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@swifty-docs/generated": resolve(__dirname, ".swifty-docs/generated"),
    },
  },
});
