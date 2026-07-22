// !!! For your project, it should be: import { defineConfig } from "@swifty.js/docs/vite";
import { defineConfig } from "./src/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/swifty/",
  title: "Swifty Docs",
  description: "@swifty.js/docs -- Documentation site generator",
  nav: [
    { text: "Base", link: "/swifty/base/" },
    { text: "Frontend", link: "/swifty/frontend/" },
    { text: "Backend", link: "/swifty/backend/" },
  ],
  sidebar: {
    "/swifty/base/": "auto",
    "/swifty/frontend/": "auto",
    "/swifty/backend/": "auto",
  },
  highlight: { theme: "github-light" },
  search: { provider: "local" },
});
