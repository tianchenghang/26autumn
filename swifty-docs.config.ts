import { defineConfig } from "@swifty.js/docs/vite";

const baseUrl = "/26autumn/";

export default defineConfig({
  docs: "docs",
  baseUrl,
  title: "面试 QA 文档",
  description: "前端、后端及 Swifty 项目的面试 QA 文档",
  nav: [
    { text: "前端基础", link: `${baseUrl}fe/react-qa` },
    { text: "Swifty 前端", link: `${baseUrl}fe/swifty-qa` },
    { text: "后端基础", link: `${baseUrl}be/go-qa` },
    { text: "Swifty 后端", link: `${baseUrl}be/swifty-cli-qa` },
  ],
  sidebar: {
    "/fe/": [
      {
        text: "前端基础",
        items: [
          { text: "React 高级面试题", link: `${baseUrl}fe/react-qa` },
          { text: "Next.js 面试题", link: `${baseUrl}fe/next-qa` },
          { text: "前端综合面试题", link: `${baseUrl}fe/fe-qa` },
          { text: "CSS 面试题", link: `${baseUrl}fe/css-qa` },
          { text: "Vite 面试题", link: `${baseUrl}fe/vite-qa` },
          { text: "简历面试题", link: `${baseUrl}fe/r-qa` },
          { text: "A2UI 面试题", link: `${baseUrl}fe/a2ui-qa` },
        ],
      },
      {
        text: "Swifty 前端",
        items: [
          { text: "Swifty 面试题", link: `${baseUrl}fe/swifty-qa` },
          { text: "Swifty Agent 面试题", link: `${baseUrl}fe/swifty-agent-qa` },
          { text: "Swifty Code 面试题", link: `${baseUrl}fe/swifty-code-qa` },
          {
            text: "Swifty Chatbot 面试题",
            link: `${baseUrl}fe/swifty-chatbot-qa`,
          },
          {
            text: "Swifty Sentry 面试题",
            link: `${baseUrl}fe/swifty-sentry-qa`,
          },
        ],
      },
    ],
    "/be/": [
      {
        text: "后端基础",
        items: [
          { text: "Go 面试题", link: `${baseUrl}be/go-qa` },
          { text: "分布式系统与数据结构面试题", link: `${baseUrl}be/demo-qa` },
          { text: "MySQL 面试题", link: `${baseUrl}be/mysql-qa` },
          { text: "Redis 面试题", link: `${baseUrl}be/redis-qa` },
          { text: "中间件面试题", link: `${baseUrl}be/middleware-qa` },
        ],
      },
      {
        text: "Swifty 后端",
        items: [
          { text: "Swifty CLI 面试题", link: `${baseUrl}be/swifty-cli-qa` },
          { text: "Swifty HTTP 面试题", link: `${baseUrl}be/swifty-http-qa` },
          { text: "Swifty RPC 面试题", link: `${baseUrl}be/swifty-rpc-qa` },
          { text: "Swifty Cache 面试题", link: `${baseUrl}be/swifty-cache-qa` },
          { text: "Swifty Agent 面试题", link: `${baseUrl}be/swifty-agent-qa` },
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
