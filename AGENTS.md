- MUST 仅关注 docs 目录, 其他目录下的文件 (例如 pdd, tesla) 与你的工作完全无关

- 面试 QA 文档输出到 docs 目录下

- 前端/全栈/Agent 面试 QA 文档输出到 docs/fe 目录下

- 后端/分布式面试 QA 文档输出到 docs/be 目录下

- 面试 QA 文档开头 MUST 必须提供可以跳转的目录

- 面试 QA 文档 MUST 必须基于项目事实

- 生成的 markdown 文档中 MUST 不要使用表情符号, MUST 不要使用粗体文本

- MUST 不要在 markdown 的 codeblock 手动绘制图片, 而是使用 mermaid-cli 生成图片, 大多数时候不需要绘制图片, 除非知识概念很抽象

- 使用 mermaid-cli 生成的图片输出到 docs/assets 目录下

目前同一份面试 QA 文档存在重复, 重复的面试 QA 文档的文件名带有带有数字后缀

例如

- docs/be/demo-qa.md 和 docs/be/demo-qa2.md
- docs/be/swifty-cli-qa.md 和 docs/be/swifty-cli-qa2.md 项目源代码在 /Users/hangtiancheng/github/swifty.go/swifty_cli
- docs/fe/css-qa.md 和 docs/fe/css-qa2.md
- docs/fe/fe-qa.md 和 docs/fe/fe-qa2.md 和 docs/fe/fe-qa3.md
- docs/fe/r-qa.md 和 docs/fe/r-qa2.md 和 docs/fe/r-qa3.md 和 docs/fe/r-qa4.md 和 docs/fe/r-qa5.md 和 docs/fe/r-qa6.md 和 docs/fe/r-qa7.md 简历在 /Users/hangtiancheng/github/r/src/i18n/zh.json
- docs/fe/swifty-code-qa.md 和 docs/fe/swifty-code-qa2.md 项目源代码在 /Users/hangtiancheng/github/swifty/apps/swifty-code
- docs/fe/swifty-qa.md 和 docs/fe/swifty-qa2.md 项目源代码在 /Users/hangtiancheng/github/swifty/apps/swifty

现在请你将所有文件名带有数字后缀的、重复的面试 QA 文件的内容, 合并到不带数字后缀的面试 QA 文件, MUST 保证内容不丢失、不重复

你可以并行执行这个大型任务, 面试 QA 文档 MUST 必须基于项目事实
