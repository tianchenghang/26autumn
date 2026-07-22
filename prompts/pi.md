全面探索代码库, 分 11 个 md 文档全面介绍 pi coding agent

ch1、pi 的总体架构

ch2、pi 支持的 LLM API 协议: 是否支持 anthropic、是否支持 openai、是否支持 openai-compatible 等等, 如何实现支持多种 LLM API 协议? 配置文件存放在哪里, 如何配置, 具体实现是基于第三方包, 还是手写实现? 是否支持 Extend Thinking 推理? provider 配置包含哪些字段? pi 如何查询某个模型的最大上下文窗口和最大输出 tokens? pi 的流式传输的具体实现是基于第三方包, 还是手写实现?

ch3、工具调用, pi 有哪些工具? 各自的 tool.name 名称、tool.description 描述、tool.input_schema (或者也可以叫 tool.parameters) 输入 schema 和输出 schema? 是否有工具的元信息? 例如工具的权限、工具是否可以并发: 例如读工具是否可以并发执行?

ch4、pi 如何组装系统提示词 system prompt?, system prompt 具体是什么? 详细介绍; 是否支持 plan 规划模式?, 是否支持动态指令注入: 例如 `<system-reminder />` 标签? 如何统计成本: input_tokens、cache_read_tokens、cache_read_tokens、cache_read_tokens?

ch5、pi 的权限模式, 是否有危险命令黑名单? 是否支持路径沙箱? pi 是否有权限配置文件? pi 是否支持不同的权限模式? 例如 bypassPermissions 默认放行? 是否支持 HITL 人在回路? 是否支持 OS 级沙箱?

ch6、pi 是否支持 MCP? 如果不支持 MCP, 则本文档可以跳过, 请在工作完成后告知我

ch7、pi 是如何做上下文压缩 (重点)

- 是否有 budget「大的工具调用结果存磁盘」? 如何实现的?
  - 单个工具调用结果的阈值过大, 怎么办?
  - 单条消息中多个工具调用结果的聚合过大, 怎么办?
- 是否支持自动压缩? 如何计算自动压缩阈值?
- 如何生成对话摘要? 生成对话摘要的 prompt 具体是什么?
- 如果摘要请求出错, 是否有重试、是否有熔断机制?
- 是否有强制压缩? 如何计算强制压缩阈值?
- 是否支持 /compact 手动压缩?

ch8、pi 是否支持指令文件 (例如 AGENTS.md?), 支持哪些名称的指令文件? 如何注入指令文件的内容 (重点)? 是否支持会话持久化? 是通过 jsonl 还是 sqlite? 是否有会话日志 (会话历史记录) 文件? 放在哪个目录? 支持过期会话清理吗? 支持用户与 Agent 对话时, Agent 自动记忆吗? 如果支持, 请在工作完成后告知我

ch9、pi 支持哪些 slash command? 各自的作用是什么?

ch10、pi 支持 skill 吗? skill 目录在哪? skill 的 frontmatter 中支持哪些字段? skill 是如何加载的? 是按需加载的吗?

ch11、pi 支持 hook 吗? 哪些事件会触发 hook? 支持哪些 hook? 工具调用前的 hook 支持拦截本次工具调用吗? pi 支持 trace 吗? 如果支持, 是怎么实现的?

---------- 其他需要告知的内容 ----------

- pi 支持 subagent 吗? 如果支持, 请在工作完成后告知我
- pi 支持 git worktree 吗? 如果支持, 请在工作完成后告知我
- pi 支持 Agent Team 吗? 如果支持, 请在工作完成后告知我

考虑质量与速度, 我希望你全面探索代码库, 并行输出文档, 输出后对文档进行 review, 确保内容准确无误
文档名使用 ch${1...11}.md, 文档内容使用中文, 不要使用表情符号
