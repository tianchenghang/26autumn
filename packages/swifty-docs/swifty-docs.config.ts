// !!! For your project, it should be: import { defineConfig } from "@swifty.js/docs/vite";
import { defineConfig } from "./src/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/swifty/",
  title: "Swifty Docs",
  description: "@swifty.js/docs -- Documentation site generator",
  nav: [
    { text: "Swifty Docs", link: "/swifty/v2/swifty-docs/" },
    { text: "Swifty MVC", link: "/swifty/v2/swifty-mvc/" },
    { text: "English", link: "/swifty/en/swifty-mvc/" },
  ],
  sidebar: {
    "/swifty/v2/swifty-docs/": "auto",
    "/swifty/v2/swifty-mvc/": "auto",
    "/swifty/en/swifty-mvc/": "auto",
    "/swifty/en/swifty-docs/": "auto",
  },
  highlight: { theme: "github-light", darkTheme: "github-dark" },
  search: { provider: "local" },
});
