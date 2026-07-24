import { defineConfig } from "@swifty.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/26autumn/",
  title: "面试 QA 文档",
  description: "前端、后端及 Swifty 项目的面试 QA 文档",
  nav: [
    { text: "前端基础", link: "/26autumn/fe/react-qa" },
    { text: "Swifty 前端", link: "/26autumn/fe/swifty-qa" },
    { text: "后端基础", link: "/26autumn/be/go-qa" },
    { text: "Swifty 后端", link: "/26autumn/be/swifty-cli-qa" },
  ],
  sidebar: {
    "/26autumn/fe/": [
      {
        text: "前端基础",
        items: [
          { text: "React 高级面试题", link: "/26autumn/fe/react-qa" },
          { text: "Next.js 面试题", link: "/26autumn/fe/next-qa" },
          { text: "前端综合面试题", link: "/26autumn/fe/fe-qa" },
          { text: "CSS 面试题", link: "/26autumn/fe/css-qa" },
          { text: "Vite 面试题", link: "/26autumn/fe/vite-qa" },
          { text: "简历面试题", link: "/26autumn/fe/r-qa" },
          { text: "A2UI 面试题", link: "/26autumn/fe/a2ui-qa" },
        ],
      },
      {
        text: "Swifty 前端",
        items: [
          { text: "Swifty 面试题", link: "/26autumn/fe/swifty-qa" },
          { text: "Swifty Agent 面试题", link: "/26autumn/fe/swifty-agent-qa" },
          { text: "Swifty Code 面试题", link: "/26autumn/fe/swifty-code-qa" },
          { text: "Swifty Chatbot 面试题", link: "/26autumn/fe/swifty-chatbot-qa" },
          { text: "Swifty Sentry 面试题", link: "/26autumn/fe/swifty-sentry-qa" },
        ],
      },
    ],
    "/26autumn/be/": [
      {
        text: "后端基础",
        items: [
          { text: "Go 面试题", link: "/26autumn/be/go-qa" },
          { text: "分布式系统与数据结构面试题", link: "/26autumn/be/demo-qa" },
          { text: "MySQL 面试题", link: "/26autumn/be/mysql-qa" },
          { text: "Redis 面试题", link: "/26autumn/be/redis-qa" },
          { text: "中间件面试题", link: "/26autumn/be/middleware-qa" },
        ],
      },
      {
        text: "Swifty 后端",
        items: [
          { text: "Swifty CLI 面试题", link: "/26autumn/be/swifty-cli-qa" },
          { text: "Swifty HTTP 面试题", link: "/26autumn/be/swifty-http-qa" },
          { text: "Swifty RPC 面试题", link: "/26autumn/be/swifty-rpc-qa" },
          { text: "Swifty Cache 面试题", link: "/26autumn/be/swifty-cache-qa" },
          { text: "Swifty Agent 面试题", link: "/26autumn/be/swifty-agent-qa" },
        ],
      },
    ],
  },
  highlight: {
    theme: "github-dark",
    darkTheme: "github-dark",
    languages: [
      "go",
      "typescript",
      "javascript",
      "jsx",
      "tsx",
      "bash",
      "json",
      "yaml",
      "sql",
      "css",
      "html",
      "lua",
      "python",
    ],
  },
  search: { provider: "local" },
});
