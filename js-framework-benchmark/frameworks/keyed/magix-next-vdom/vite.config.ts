import { defineConfig } from "vite";
import { swiftyMvcPlugin } from "swifty-next/vite";

export default defineConfig(({ command }) => ({
  base: "/frameworks/keyed/swifty-next-vdom/dist/",
  plugins: [swiftyMvcPlugin({ vdom: true, debug: command === "serve" })],
  build: {
    rolldownOptions: {
      output: {
        minify: true,
      },
    },
  },
}));
