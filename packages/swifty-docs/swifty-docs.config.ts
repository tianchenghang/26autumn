// !!! For your project, it should be: import { defineConfig } from "@swifty.js/docs/vite";
import { defineConfig } from "./src/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/swifty/",
  title: "Swifty Docs",
  description: "@swifty.js/docs -- Documentation site generator",
  nav: [
    { text: "基础", link: "/swifty/base/" },
    { text: "前端", link: "/swifty/frontend/" },
    { text: "后端", link: "/swifty/backend/" },
    { text: "QA", link: "/swifty/qa/" },
  ],
  sidebar: {
    "/swifty/base/": "auto",
    "/swifty/frontend/": "auto",
    "/swifty/backend/": "auto",
    "/swifty/qa/": "auto",
  },
  highlight: { theme: "github-light", darkTheme: "github-dark" },
  search: { provider: "local" },
});
