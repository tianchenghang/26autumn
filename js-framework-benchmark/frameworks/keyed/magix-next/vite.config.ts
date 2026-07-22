import { defineConfig } from "vite";
import { swiftyMvcPlugin } from "swifty-next/vite";

export default defineConfig(({ command }) => ({
  base: "/frameworks/keyed/swifty-next/dist/",
  plugins: [swiftyMvcPlugin({ vdom: false, debug: false })],
  build: {
    rolldownOptions: {
      output: {
        minify: true,
      },
    },
  },
}));
