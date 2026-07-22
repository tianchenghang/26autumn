# Swifty CLI — 高级后端工程师面试 QA

> 基于 `github.com/hangtiancheng/swifty.go/swifty_cli` 项目源码分析
> 技术栈：Go 1.26 / Anthropic SDK / OpenAI SDK / MCP / Bubble Tea TUI

---

## 一、系统架构设计

### Q1: 请描述 Swifty CLI 的整体架构分层和核心模块职责

核心设计原则：

- **事件驱动解耦**：Agent Loop 通过 `chan AgentEvent` 与 TUI 通信，执行与渲染完全分离
- **协议无关 LLM 抽象**：单一 `Client` 接口适配 Anthropic / OpenAI / OpenAI-Compatible 三种协议
- **插件化扩展**：Skills (Markdown SOP)、Hooks (生命周期事件)、MCP Servers、Agent Definitions 四种扩展机制

---

### Q2: Agent Loop 的核心循环是如何设计的？为什么选择这种模式？

**A:**

Agent Loop 采用 **goroutine + buffered channel** 的事件驱动模式：

```go
func (a *Agent) Run(ctx context.Context, conv *conversation.Manager) <-chan AgentEvent {
    ch := make(chan AgentEvent, 32)
    go func() {
        defer close(ch)
        for iteration := 1; ; iteration++ {
            // 1. 终止检查 (MaxIterations / ctx.Done)
            // 2. 计算工具 Schema (尊重 ToolNameFilter)
            // 3. L1: tool_result.Apply() — 裁剪超大工具结果
            // 4. L2: compact.ManageContext() — 接近上下文限制时 LLM 摘要
            // 5. Client.Stream() → 流式获取 LLM 响应
            // 6. 处理流事件 (text / thinking / tool_call)
            // 7. 错误恢复 (rate-limit / context-too-long / max_tokens)
            // 8. 无 tool_call → LoopComplete, return
            // 9. StreamingExecutor 批量执行工具
            // 10. 结果追加到 conversation, 注入 memory recall
        }
    }()
    return ch
}
```

**设计选择的原因：**

1. **背压控制**：buffered channel (cap=32) 允许 Agent 在 TUI 渲染慢时继续推进，避免死锁
2. **可取消性**：`context.Context` 贯穿所有 IO 操作，支持优雅中断
3. **可观测性**：所有状态变化通过类型化事件 (`StreamText`, `ToolUseEvent`, `CompactEvent` 等) 暴露
4. **可组合性**：子 Agent 复用同一个 `Run()` 逻辑，仅通过 `ToolNameFilter` 和 `Registry` 差异化

---

### Q3: 为什么 Agent 和 TUI 之间用 channel 而不是回调/observer 模式？

**A:**

| 维度     | Channel                           | Callback/Observer |
| -------- | --------------------------------- | ----------------- |
| 背压     | 天然支持 (buffered)               | 需手动实现队列    |
| 取消     | `select` + `ctx.Done()` 一行      | 需额外标志位      |
| 多消费者 | `fan-out` 即可                    | 需维护监听器列表  |
| 类型安全 | sealed interface (`agentEvent()`) | 同                |
| 调试     | 可拦截/日志/重放                  | 分散在各回调中    |
| 并发安全 | channel 本身保证                  | 需 mutex          |

关键实现细节：

- `emitProgress()` 使用 `select { case ch <- event: default: }` 非阻塞发送，消费者慢时丢弃进度事件（防止 Agent 被 UI 阻塞）
- 但 `ToolResultEvent`、`PermissionRequestEvent` 等关键事件必须阻塞等待（保证语义正确性）

---

## 二、LLM 集成与流式处理

### Q4: 如何设计一个支持多 Provider 的 LLM 抽象层？

**A:**

```go
type Client interface {
    Stream(ctx context.Context, conv *conversation.Manager, tools []map[string]any) (<-chan StreamEvent, <-chan error)
    SetSystemPrompt(prompt string)
}
```

三种实现：

- **Anthropic** (`anthropic-sdk-go`)：Messages API + Extended Thinking + Prompt Cache
- **OpenAI** (`openai-go`)：Responses API + Reasoning Summary
- **OpenAI-Compatible**：Chat Completions API（适配 DeepSeek 等第三方）

**关键设计决策：**

1. **Stream 返回双 channel** `(<-chan StreamEvent, <-chan error)`：
   - 事件和错误分离，避免在事件 channel 中混入 error 类型
   - error channel 在流正常结束时关闭，非 nil 错误触发重试逻辑

2. **协议适配在 Client 内部完成**：
   - Anthropic: `input_json_delta` → `ToolCallDelta`
   - OpenAI: `function_call.arguments` delta → `ToolCallDelta`
   - 上层 Agent 只处理统一的 `StreamEvent` 接口

3. **Model Resolver 模式**：
   ```go
   type ModelResolver func(alias string) (llm.Client, error)
   // "haiku" → claude-haiku-4-5, "sonnet" → claude-sonnet-4-6
   ```
   子 Agent 可以指定不同模型，通过 resolver 延迟创建 Client 实例

---

### Q5: SSE 流式读取中的 idle timeout 机制是如何实现的？解决了什么问题？

**A:**

**问题**：HTTP/2 连接可能静默断开（NAT 超时、代理断连），`stream.Next()` 会永久阻塞。

**解决方案**：goroutine-per-read + idle timer

```go
nextCh := make(chan sseResult, 1)
readNext := func() { nextCh <- sseResult{hasNext: stream.Next()} }
idle := time.NewTimer(5 * time.Minute)

go readNext()
for {
    select {
    case <-ctx.Done():
        return // 用户取消
    case <-idle.C:
        return // 5 分钟无数据 → 判定连接死亡
    case res := <-nextCh:
        if !res.hasNext { return } // 流正常结束
        // 处理事件...
    }
    idle.Reset(5 * time.Minute)
    go readNext() // 启动下一次读取
}
```

**设计要点：**

- 每次 `stream.Next()` 在独立 goroutine 中执行，主 goroutine 始终可被 timer/ctx 唤醒
- `nextCh` 容量为 1：即使主 goroutine 已退出，读取 goroutine 也不会泄漏（写入后立即退出）
- 5 分钟是经验值：覆盖 LLM 长时间思考（thinking）场景，同时不至于让用户等太久

---

### Q6: Prompt Cache 优化策略是什么？如何保证缓存命中率？

**A:**

Anthropic Prompt Cache 要求前缀字节完全一致才能命中。Swifty 的策略：

**三个 Cache Breakpoint：**

1. System Prompt 末尾 — 跨 turn 稳定
2. Tool Schema 列表最后一个 — 跨 turn 稳定
3. 最后一条 User Message 的最后一个 content block — tail anchor

**保证字节稳定性的关键机制 — `ContentReplacementState`：**

```go
type ContentReplacementState struct {
    decisions map[string]ReplacementDecision // tool_use_id → 是否 spill + preview 内容
}
```

- Layer 1 预算裁剪时，对超过阈值的 tool_result 做 spill（存磁盘，留 preview）
- **决策一旦做出就被冻结**：后续 turn 重放相同 tool_result 时，使用完全相同的 preview 字节
- 如果每次重新计算 preview，即使内容相同，时间戳/随机因素会导致字节变化 → cache miss

**Fork 子 Agent 的缓存复用：**

- Fork 继承父 Agent 的完整 conversation + tool pool
- 因为 tool schema 列表相同，system prompt 相同，conversation 前缀相同 → 首次请求即可命中父 Agent 已建立的缓存

---

## 三、上下文窗口管理

### Q7: 两层上下文管理机制的设计思路和触发条件是什么？

**A:**

```
┌─────────────────────────────────────────────┐
│ Layer 1: tool_result.Apply()                │
│ 粒度: 单个 tool_result                       │
│ 策略: 超预算 → spill 到磁盘，留 preview       │
│ 触发: 每轮 LLM 调用前                        │
│ 目标: 控制单条消息大小，保持 prompt cache 稳定  │
├─────────────────────────────────────────────┤
│ Layer 2: compact.ManageContext()            │
│ 粒度: 整个 conversation                      │
│ 策略: LLM 摘要旧消息，保留近期原文            │
│ 触发: 估算 token > effectiveWindow - margin  │
│ 目标: 将总 token 控制在上下文窗口内            │
└─────────────────────────────────────────────┘
```

**Layer 1 细节：**

- 单条 tool_result > 50K chars → spill 到 `.swifty/tool_results/{id}.txt`，conversation 中只留 2K preview
- 单条 message 聚合 > 200K chars → 从最大的 result 开始 spill
- 过时结果（文件已被后续 edit 修改）→ 更激进的裁剪

**Layer 2 细节：**

- Token 估算：Usage Anchor 机制（首次 API 调用后记录真实 token 数，后续增量估算）
- 保留策略：最近 10K tokens / 5 条消息（取大），上限 40K
- 摘要请求本身也可能超长 → PTL Retry（逐步丢弃最旧的 API-round 组，最多 3 次）
- **熔断器**：连续 3 次 compact 失败后停止尝试（避免无限循环）

---

### Q8: Token 估算的 Usage Anchor 机制是如何工作的？为什么不直接用 tokenizer？

**A:**

```go
type UsageAnchor struct {
    BaselineTokens int  // 上次 API 返回的真实 input_tokens
    AnchorCount    int  // 当时 conversation 的消息数
}

func ComputeUsedTokens(conv, anchor) int {
    if anchor.hasUsage {
        // 增量估算：真实基线 + 新增消息的粗略估算
        return anchor.BaselineTokens + EstimateTokens(conv.Messages()[anchor.AnchorCount:])
    }
    // 冷启动：全量粗略估算 (3.5 chars/token)
    return EstimateTokens(conv.Messages())
}
```

**不用 tokenizer 的原因：**

1. **性能**：Go 没有高效的 Claude/GPT tokenizer 库，tiktoken 是 Python 的
2. **精度 vs 成本**：只需要判断"是否接近上限"，不需要精确值；3.5 chars/token 在英文代码场景误差 <15%
3. **自校正**：每次 API 调用后 anchor 更新为真实值，误差不会累积
4. **多 Provider**：不同模型 tokenizer 不同，统一用 chars 估算更简单

---

## 四、工具系统与执行引擎

### Q9: 工具的安全分级执行（Safety-Based Batching）是如何实现的？

**A:**

```go
func partitionToolCalls(calls []ToolCall) []toolBatch {
    // 连续 read-only 工具 → 一个并发 batch
    // write/command 工具 → 各自独立的串行 batch
}

// 执行：
for _, batch := range batches {
    if batch.concurrent {
        var wg sync.WaitGroup
        for _, call := range batch.calls {
            wg.Add(1)
            go func(c ToolCall) {
                defer wg.Done()
                result := executeSingleTool(ctx, c)
                mu.Lock()
                results[c.index] = result
                mu.Unlock()
            }(call)
        }
        wg.Wait()
    } else {
        results[batch.calls[0].index] = executeSingleTool(ctx, batch.calls[0])
    }
}
```

**设计考量：**

- **Read 工具并发安全**：Glob、Grep、ReadFile 无副作用，可安全并行
- **Write 工具必须串行**：Edit A.js 和 Edit B.js 可能通过 import 关系相互影响；LLM 的意图是按序执行
- **Index 追踪**：结果按原始提交顺序放回，保证 conversation 中 tool_result 顺序与 tool_use 对应
- **流式提交**：工具在 LLM 还在输出时就开始提交（`StreamingExecutor`），不必等所有 tool_call 解析完

---

### Q10: Deferred Tool Loading（延迟工具加载）解决了什么问题？

**A:**

**问题**：MCP Server 可能注册数十个工具，每个工具的 JSON Schema 占 200-500 tokens。全部注入 prompt 会：

1. 浪费上下文窗口（10 个 MCP Server × 5 个工具 × 300 tokens ≈ 15K tokens）
2. 增加首次响应延迟（更多 input tokens）
3. 降低模型选择正确工具的准确率（选项过多）

**解决方案**：

```go
type DeferrableTool interface {
    ShouldDefer() bool  // MCP 工具默认 true
}

// 初始 prompt 只包含核心工具 (Read/Write/Edit/Bash/Glob/Grep)
// + 一个 ToolSearch 工具

// LLM 需要时调用 ToolSearch：
// ToolSearch({query: "database query"}) → 发现 mcp__postgres__query
// Registry.MarkDiscovered("mcp__postgres__query")
// 下一轮 API 请求自动包含该工具的 schema
```

**ToolSearch 的两种模式：**

- `select:Name1,Name2` — 精确加载（LLM 已知工具名）
- 关键词搜索 — 模糊匹配 description（LLM 描述需求）

---

### Q11: FileStateCache 的 "Read-before-Edit" 机制是如何工作的？

**A:**

```go
type FileStateCache struct {
    states map[string]FileState // path → {modTime, content hash}
}

// ReadFile 执行后：
cache.Record(path, modTime)

// EditFile/WriteFile 执行前：
if err := cache.Check(path); err != nil {
    return ToolResult{Error: "file not read or externally modified"}
}

// EditFile 执行后：
cache.Update(path, newModTime)
```

**解决的问题：**

1. **防止盲写**：LLM 可能基于幻觉编辑文件，强制先读确保 LLM 看到了真实内容
2. **检测外部修改**：用户在 IDE 中修改了文件 → mtime 变化 → 拒绝编辑 → LLM 重新读取
3. **Prompt Cache 友好**：确保 conversation 中的文件内容是最新的，减少基于过时信息的错误编辑

---

## 五、权限与安全

### Q12: 五层权限系统的架构设计及各层职责是什么？

**A:**

```
请求 → Layer 0: Plan Mode 例外
     → Layer 1: 安全命令白名单 (auto-allow)
     → Layer 2: 危险命令黑名单 (auto-deny)
     → Layer 2b: OS 沙箱 (auto-allow if sandboxed)
     → Layer 3: 路径沙箱 (project root + temp)
     → Layer 4: YAML 规则引擎 (glob matching)
     → Layer 4b: Session 级 "always allow" (in-memory)
     → Layer 5: Permission Mode 矩阵
     → Fallback: ASK (Human-in-the-Loop)
```

**各层详解：**

| 层  | 机制                                       | 示例                                      |
| --- | ------------------------------------------ | ----------------------------------------- |
| L0  | Plan 模式下允许写 plan file                | `Write(.swifty/plan.md)`                  |
| L1  | ~50 个安全命令前缀白名单                   | `git status`, `ls`, `cat`, `go test`      |
| L2  | 正则黑名单（不可绕过）                     | `rm -rf /`, `mkfs`, fork bomb, `curl\|sh` |
| L2b | macOS seatbelt / Linux bwrap 内 → 跳过确认 | 沙箱限制了实际破坏范围                    |
| L3  | 文件操作限制在项目根 + /tmp                | 拒绝写 `~/.ssh/authorized_keys`           |
| L4  | `Bash(npm install*)` → allow               | 用户自定义规则                            |
| L5  | Mode 矩阵: default/acceptEdits/bypass      | `acceptEdits`: Write auto-allow           |

**防绕过设计：**

- `splitCompoundCommand()` 拆分 `&&`, `||`, `;`, `|`，每段独立检查
- 例：`ls && rm -rf /` → `ls` (allow) + `rm -rf /` (deny) → 整体 deny

---

### Q13: OS 级沙箱（macOS seatbelt / Linux bubblewrap）是如何集成的？

**A:**

```go
type Sandbox interface {
    Wrap(command string, config Config) string  // 返回包装后的命令
    Available() bool
}
```

**macOS (seatbelt)：**

```scheme
; 动态生成的 sandbox profile
(version 1)
(deny default)                          ; 默认拒绝所有
(allow process-exec)                    ; 允许执行
(allow file-read*)                      ; 允许读
(allow file-write* (subpath "/project")) ; 只允许写项目目录
(allow file-write* (subpath "/tmp"))    ; 允许写 tmp
(deny file-write* (subpath "/project/.swifty/config.yaml")) ; 保护配置
(deny network*)                         ; 可选：禁止网络
```

- 使用硬编码路径 `/usr/bin/sandbox-exec` 防止 PATH 注入

**Linux (bubblewrap)：**

```bash
bwrap --unshare-user --unshare-pid \
  --ro-bind / / \                       # 只读根
  --bind /project /project \            # 项目可写
  --bind /tmp /tmp \                    # tmp 可写
  --unshare-net \                       # 网络隔离
  -- /bin/bash -c "original_command"
```

**与权限系统的协作：**

- 沙箱启用时，Layer 2b 自动放行大部分命令（因为实际破坏力已被沙箱限制）
- 但 Layer 2 危险命令黑名单仍然生效（defense in depth）
- 用户显式 deny 规则仍然生效

---

## 六、并发与状态管理

### Q14: 项目中使用了哪些并发模式？如何避免数据竞争？

**A:**

| 模式                  | 使用场景                         | 同步机制                          |
| --------------------- | -------------------------------- | --------------------------------- |
| Goroutine + Channel   | Agent Loop → TUI 事件流          | buffered chan (cap=32)            |
| Goroutine + WaitGroup | 并发执行 read-only 工具          | `sync.WaitGroup` + `sync.Mutex`   |
| Goroutine-per-read    | SSE 流读取 + idle timeout        | chan (cap=1)                      |
| Non-blocking send     | 进度事件 (可丢弃)                | `select` + `default`              |
| Background goroutine  | 异步子 Agent / Memory extraction | `TaskManager` + notification chan |
| File locking          | Memory consolidation             | `flock` 系统调用                  |

**避免数据竞争的关键设计：**

1. **StreamingExecutor 的 index 模式**：

   ```go
   results := make([]ToolResult, len(calls)) // 预分配
   // 每个 goroutine 只写自己的 index：
   results[entry.index] = execute(...)
   // 无需 mutex（不同 index 无竞争）
   // 但实际需要 mutex 因为 results slice 的 header 可能被并发读
   ```

2. **RecoveryState 的 mutex 保护**：
   - 多个并发工具 goroutine 可能同时记录文件快照
   - `mu.Lock()` 保护 `fileSnapshots` map

3. **Conversation Manager 非并发安全（by design）**：
   - 只在 Agent Loop goroutine 中修改
   - TUI 通过事件 channel 获取只读快照
   - 避免了对 conversation 加锁的性能开销

---

### Q15: Session 持久化为什么选择 JSONL 格式？Compact Boundary 的作用是什么？

**A:**

**JSONL 的优势：**

1. **Append-only**：每次写一行，无需读取/重写整个文件（O(1) 写入）
2. **崩溃安全**：最多丢失最后一行（未 flush 的），不会损坏整个文件
3. **增量解析**：resume 时可以从任意行开始读取
4. **可 grep**：`grep "tool_use" session.jsonl` 快速定位

**Compact Boundary 的作用：**

```jsonl
{"role":"user","content":"fix the bug","ts":1700000001}
{"role":"assistant","content":"I'll look into...","ts":1700000002}
... (200 条消息)
{"type":"compact_boundary","summary":"User asked to fix auth bug. We identified...","keep":[...最近5条...]}
{"role":"user","content":"now add tests","ts":1700000500}
...
```

- **Resume 优化**：不需要重放全部 200 条消息，从最后一个 boundary 恢复即可
- **语义连续**：summary 保留了关键上下文（做了什么、为什么、当前状态）
- **Keep 数组**：最近的消息原文保留（避免摘要丢失细节）

---

## 七、扩展性设计

### Q16: Hook 系统的条件引擎是如何设计的？支持哪些表达式？

**A:**

```yaml
hooks:
  - event: pre_tool_use
    condition: 'tool == "EditFile" && file_path =* "**/*.go"'
    action:
      type: command
      command: "gofmt -w ${SWIFTY_FILE_PATH}"
    on_error: ignore
```

**条件表达式语法：**

| 运算符 | 含义      | 示例                     |
| ------ | --------- | ------------------------ |
| `==`   | 精确匹配  | `tool == "Bash"`         |
| `!=`   | 不等于    | `tool != "ReadFile"`     |
| `=~`   | 正则匹配  | `file_path =~ "\\.go$"`  |
| `=*`   | Glob 匹配 | `file_path =* "**/*.ts"` |
| `&&`   | 逻辑与    | 复合条件                 |
| `\|\|` | 逻辑或    | 复合条件                 |
| `!`    | 逻辑非    | `!tool == "Glob"`        |

**可用变量：** `tool`, `event`, `file_path`, `message`, `args.*`（工具参数）

**四种 Action 类型：**

1. `command`：执行 shell 命令（注入 `SWIFTY_EVENT`, `SWIFTY_TOOL`, `SWIFTY_FILE_PATH` 环境变量）
2. `prompt`：向 conversation 注入一条 system-reminder 消息
3. `http`：发送 webhook（10s 超时）
4. `agent`：调用一个 L one-shot agent 做判断

**执行模式：**

- 同步（默认）：阻塞工具执行直到 hook 完成
- `async: true`：fire-and-forget
- `once: true`：session 内只触发一次（通过 `fired` map 去重）
- `reject: true`：hook 失败/返回非零 → 拒绝工具执行

---

### Q17: MCP 集成的架构设计？如何处理多传输协议？

**A:**

```go
type Manager struct {
    clients map[string]*mcp.Client  // server name → client
}

type MCPToolWrapper struct {
    ServerName string
    ToolName   string
    Schema     map[string]any
    Client     *mcp.Client
}

func (w *MCPToolWrapper) Name() string {
    return "mcp__" + sanitize(w.ServerName) + "__" + sanitize(w.ToolName)
}
```

**三种传输协议：**

| 传输            | 配置                                                                    | 实现                               |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------- |
| Stdio           | `command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"]` | `exec.Command` + stdin/stdout pipe |
| Streamable HTTP | `url: "http://localhost:3000/mcp", transport: "streamable-http"`        | HTTP POST + SSE response           |
| SSE (legacy)    | `url: "http://localhost:3000/sse", transport: "sse"`                    | GET /sse + POST /messages          |

**关键设计决策：**

1. **所有 MCP 工具默认 Deferred**：不占用初始 prompt 空间
2. **命名空间隔离**：`mcp__<server>__<tool>` 防止工具名冲突
3. **Header 注入**：`headerRoundTripper` 支持 `Authorization: Bearer ${API_TOKEN}`（env 展开）
4. **Stderr 丢弃**：防止子进程的 OSC color query 污染 TUI 输入缓冲

---

### Q18: Skills 系统的 Inline vs Fork 模式有何区别？各自的适用场景？

**A:**

```yaml
# .swifty/skills/my-skill/SKILL.md
---
name: my-skill
description: "..."
when_to_use: "..."
mode: inline # or fork
model: sonnet
fork_context: recent
---
# Skill Body (Markdown SOP)
...
```

| 维度       | Inline                       | Fork                   |
| ---------- | ---------------------------- | ---------------------- |
| 执行方式   | Body 注入当前 conversation   | 委托给子 Agent         |
| 上下文     | 共享父 Agent 全部上下文      | 可选 full/recent/none  |
| 模型       | 使用父 Agent 的模型          | 可指定不同模型         |
| 工具       | 使用父 Agent 的工具          | 可限制工具子集         |
| 适用场景   | 需要访问当前对话上下文的 SOP | 独立任务、保护主上下文 |
| 上下文污染 | 会占用主 conversation 空间   | 不影响主 conversation  |

**$ARGUMENTS 替换**：Skill body 中的 `$ARGUMENTS` 被替换为用户调用时传入的参数。

**热重载**：`/skills reload` 重新扫描 `.swifty/skills/` 目录，无需重启。

---

## 八、多 Agent 协作

### Q19: 子 Agent 的三种 spawn 模式（Sync/Async/Fork）的设计考量？

**A:**

| 模式  | 触发条件                  | 上下文                     | 阻塞 | 适用场景                  |
| ----- | ------------------------- | -------------------------- | ---- | ------------------------- |
| Sync  | `subagent_type` 指定      | 新 conversation + 系统提示 | 是   | 快速查询（Explore agent） |
| Async | `run_in_background: true` | 新 conversation            | 否   | 耗时任务（测试、构建）    |
| Fork  | 无 `subagent_type`        | **复制父 conversation**    | 否   | 需要完整上下文的分支任务  |

**Fork 的独特设计：**

- 继承父 Agent 的完整 conversation → prompt cache 复用
- 继承父 Agent 的 tool pool → schema 一致 → cache 命中
- **嵌套 Fork 防护**：
  - `QuerySource` 字段标记来源
  - 扫描 conversation 中的 `<fork_boilerplate>` 标签
  - 防止 Fork 中再 Fork 导致指数级资源消耗

**Async 的 Notification 机制：**

```go
type TaskManager struct {
    tasks map[string]*Task
    mu    sync.Mutex
}
// 完成后通过 NotificationFn 注入 system-reminder：
// "<task-notification>Agent 'explore-auth' completed: ...</task-notification>"
```

---

### Q20: Teams 多 Agent 协作系统的架构？Agent 之间如何通信？

**A:**

```
TeamManager
  └── Team
       ├── Member (coordinator) — ToolNameFilter 限制为协调工具
       ├── Member (worker-1) — 完整工具集
       └── Member (worker-2) — 完整工具集
```

**通信机制：**

1. **FileMailBox**（基于文件的邮箱）：

   ```
   .swifty/teams/{team}/mailbox/{member}/
     ├── msg-001.json  // {from, to, content, ts}
     └── msg-002.json
   ```

   - `SendMessageTool` 写入目标成员的 mailbox 目录
   - 每个 turn 开始时 drain 自己的 mailbox

2. **SharedTaskStore**（共享任务板）：

   ```json
   // .swifty/teams/{team}/tasks.json
   {
     "tasks": [
       {
         "id": "1",
         "title": "...",
         "assignee": "worker-1",
         "status": "in_progress"
       }
     ]
   }
   ```

   - `TaskCreate/Get/List/Update` 工具操作
   - 文件锁防止并发写冲突

**运行后端：**

- `in-process`：goroutine（开发/测试）
- `tmux`：每个 member 一个 tmux pane（可视化调试）
- `iTerm`：每个 member 一个 iTerm tab（macOS）

**Coordinator 模式：**

```go
agent.ToolNameFilter = func(name string) bool {
    return coordinationTools[name] // 只允许 SendMessage, TaskCreate, TaskList 等
}
```

强制 coordinator 只做调度，不做实际工作。

---

## 九、错误处理与容错

### Q21: Agent Loop 中的错误恢复策略有哪些？

**A:**

| 错误类型              | 恢复策略                                            | 最大重试              |
| --------------------- | --------------------------------------------------- | --------------------- |
| `RateLimitError`      | 解析 `Retry-After` header → sleep → 重试            | 无限（用户可 ctrl-c） |
| `ContextTooLongError` | ForceCompact → 重试                                 | 1 次（再失败则报错）  |
| `max_tokens` stop     | 1) 提升 output limit 到 64K; 2) 多轮恢复 "Continue" | 1 + 3 次              |
| Stream idle timeout   | 断开 → 重新发起请求                                 | 按 rate-limit 逻辑    |
| Auto-compact 失败     | 熔断器：连续 3 次失败后停止                         | 3 次                  |
| 连续未知工具调用      | 硬停止（防止幻觉工具死循环）                        | 3 次                  |
| PTL (summary 超长)    | 逐步丢弃最旧 API-round 组                           | 3 次                  |

**max_tokens 多轮恢复：**

```
Turn 1: LLM 输出到一半被截断 (stop_reason: max_tokens)
→ 提升 MaxOutputTokens 到 64K (一次性)
Turn 2: 仍然截断
→ 注入 "Resume directly from where you stopped"
Turn 3-4: 最多再恢复 3 次
→ 仍然失败 → 报错给用户
```

---

### Q22: 类型化错误层次结构的设计？为什么不用 errors.Is/As？

**A:**

```go
type LLMError struct{ Message string }
type AuthenticationError struct{ Message string }
type RateLimitError struct{ Message string; RetryAfter string }
type NetworkError struct{ Message string }
type ContextTooLongError struct{ Message string }
```

**实际上项目确实使用了类型断言（等效于 errors.As）：**

```go
var rateLimitErr *llm.RateLimitError
if errors.As(err, &rateLimitErr) {
    // 解析 RetryAfter, sleep, retry
}
var ctxErr *llm.ContextTooLongError
if errors.As(err, &ctxErr) {
    // force compact, retry
}
```

**为什么不用 sentinel errors (errors.Is)：**

- 错误需要携带上下文数据（`RetryAfter` 时间、原始消息）
- 不同错误类型需要不同的恢复逻辑
- 类型层次让 switch/if 分支更清晰

---

## 十、配置与部署

### Q23: 分层配置系统的合并策略？如何处理冲突？

**A:**

```
优先级（低 → 高）：
~/.swifty/config.yaml           (用户全局)
<project>/.swifty/config.yaml   (项目级, git tracked)
<project>/.swifty/config.local.yaml (项目本地, gitignored)
环境变量                         (API Keys)
```

**合并规则：**

- 标量字段：后者覆盖前者
- `providers` 数组：按 `name` 匹配，同名覆盖，不同名追加
- `mcp_servers` 数组：按 server name 匹配，同名覆盖
- `hooks` 数组：追加（不覆盖）
- `permissions`：三层独立加载，按优先级短路

**API Key 解析链：**

```
config.yaml 中的 api_key 字段
→ 环境变量 ANTHROPIC_API_KEY / OPENAI_API_KEY
→ 报错 "no API key found"
```

**Context Window 解析链（4 层）：**

```
config 中显式指定 context_window
→ 自动从 Provider API 获取 (/v1/models/{model})
→ 内置模型名映射表 (claude→200K, gpt-4.1→1M)
→ 保守默认值 (claude→200K, others→128K)
```

---

## 十一、性能优化

### Q24: 项目中有哪些关键的性能优化手段？

**A:**

| 优化                             | 位置                        | 效果                                 |
| -------------------------------- | --------------------------- | ------------------------------------ |
| Prompt Cache (3 breakpoint)      | llm/anthropic.go            | 减少 90%+ input token 计费           |
| ContentReplacementState 字节冻结 | tool_result/                | 保证 cache 命中率                    |
| Deferred Tool Loading            | tools/tool_search.go        | 减少初始 prompt 3-15K tokens         |
| 并发 Read 工具执行               | agent/streaming_executor.go | 多文件读取延迟从串行 O(n) 降为 O(1)  |
| Usage Anchor 增量估算            | compact/                    | 避免每轮全量 token 计算              |
| JSONL append-only 写入           | session/                    | O(1) 持久化，无锁竞争                |
| 流式工具提交                     | agent/streaming_executor.go | LLM 还在输出时就开始执行先完成的工具 |
| Non-blocking progress emit       | agent/                      | TUI 慢时不阻塞 Agent                 |
| FileStateCache mtime 检查        | tools/                      | O(1) stat 代替全文 hash              |
| Glob 跳过 SkipDirs               | tools/glob.go               | 避免遍历 node_modules/.git           |

---

### Q25: 流式工具提交（Streaming Tool Execution）的实现原理？

**A:**

传统方式：等 LLM 输出完所有 tool_call → 解析 → 执行。
Swifty 方式：LLM 输出过程中，每个 `ToolCallComplete` 事件立即提交给 Executor。

```go
// 在 stream 事件处理循环中：
case ToolCallComplete:
    executor.Submit(event.ToolCall)  // 立即提交

// 流结束后：
results := executor.ExecuteAll(ctx, agent)  // 批量执行
```

**好处：**

- 如果 LLM 输出了 3 个 ReadFile 调用，第 1 个解析完时就可以开始执行
- 实际上由于 LLM 输出速度 < 工具执行速度，收益有限
- 但对 Bash 命令（可能耗时数秒），提前提交可以 overlap LLM 输出时间和工具执行时间

**StreamingExecutor 内部状态：**

```go
type StreamingExecutor struct {
    calls   []toolCallEntry  // 按提交顺序
    results []ToolResult     // 按 index 放置
    mu      sync.Mutex
}
```

---

## 十二、设计模式与工程实践

### Q26: 项目中用到了哪些设计模式？

**A:**

| 模式                    | 应用                                  | 文件                       |
| ----------------------- | ------------------------------------- | -------------------------- |
| Strategy                | LLM Client 多协议实现                 | llm/client.go              |
| Observer/Event Bus      | AgentEvent channel                    | agent/events.go            |
| Registry                | Tool 注册表                           | tools/tool.go              |
| Decorator               | MCPToolWrapper 包装远程工具           | mcp/mcp.go                 |
| Chain of Responsibility | 5 层权限检查                          | permissions/permissions.go |
| Template Method         | Tool 接口 (Name/Schema/Execute)       | tools/tool.go              |
| Factory                 | NewClient() 根据 protocol 创建        | llm/client.go              |
| Builder                 | prompt.Builder 分段构建 system prompt | prompt/builder.go          |
| Adapter                 | MCPToolWrapper 适配 Tool 接口         | mcp/mcp.go                 |
| Circuit Breaker         | compact 连续失败熔断                  | agent/agent.go             |
| State                   | TUI 状态机 (select/chat/resume)       | tui/tui.go                 |
| Mediator                | TeamManager 协调多 Agent              | teams/teams.go             |
| Memento                 | FileHistory 文件快照/回滚             | file_history/              |
| Proxy                   | headerRoundTripper 注入 HTTP headers  | mcp/mcp.go                 |

---

### Q27: 如何保证 "Read-before-Edit" 这类不变量（invariant）？还有哪些类似的防御性设计？

**A:**

**Read-before-Edit：**

- `FileStateCache` 在 ReadFile 时记录 mtime
- EditFile/WriteFile 前检查 cache，未读或外部修改 → 拒绝
- 这是一种 **capability-based security** 思想：必须先获得"读过"的 capability 才能写

**其他防御性设计：**

1. **嵌套 Fork 防护**：
   - `QuerySource` 字段 + conversation 标签扫描
   - 防止 Fork → Fork → Fork 指数爆炸

2. **连续未知工具硬停止**：
   - LLM 连续 3 次调用不存在的工具 → 停止循环
   - 防止模型幻觉导致的死循环

3. **Compact 熔断器**：
   - 连续 3 次 compact 失败 → 放弃
   - 防止 context 不可恢复时的无限重试

4. **危险命令不可绕过**：
   - Layer 2 黑名单在 sandbox auto-allow 之前检查
   - 即使沙箱启用，`rm -rf /` 仍被拒绝

5. **复合命令拆分**：
   - `safe_cmd && dangerous_cmd` 不能绕过检查
   - 每段独立过权限系统

6. **Session 级 allow 不持久化**：
   - "always allow" 只在当前 session 有效
   - 新 session 重新确认（防止权限 creep）

---

### Q28: 项目的测试策略是什么？如何测试一个 LLM Agent 系统？

**A:**

**测试层次：**

| 层次      | 方法                     | 示例                                        |
| --------- | ------------------------ | ------------------------------------------- |
| 单元测试  | 纯函数/逻辑测试          | permissions, hooks condition, compact, glob |
| 集成测试  | httptest.Server mock LLM | llm/usage_cache_test.go                     |
| E2E 测试  | 完整流程                 | memory/consolidation/e2e_test.go            |
| Live 测试 | 真实 API (env gate)      | agent/agent_live_test.go                    |
| Benchmark | 性能回归                 | tools/deferred_benchmark_test.go            |

**测试 LLM Agent 的挑战与应对：**

1. **非确定性输出**：
   - 不测试 LLM 输出内容，测试 **行为逻辑**（收到 tool_call → 执行 → 结果追加）
   - Mock LLM 返回预定义的 SSE 事件序列

2. **httptest.Server 模拟 SSE：**

   ```go
   server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
       w.Header().Set("Content-Type", "text/event-stream")
       // 写入预定义的 SSE 事件
   }))
   ```

3. **Table-driven tests**：权限系统、条件引擎等用大量 case 覆盖边界

4. **无第三方测试框架**：纯 `testing` 包（减少依赖，Go 标准库足够）

5. **57 个测试文件**覆盖所有核心模块

---

## 十三、深度设计问题

### Q29: 如果让你重新设计上下文管理系统，你会如何改进？

**A:**

**当前方案的局限：**

1. 3.5 chars/token 估算对中文/代码混合内容误差大（中文 ~1.5 chars/token）
2. Layer 2 摘要本身消耗一次完整 API 调用（延迟 + 费用）
3. 摘要不可避免地丢失信息（特别是精确的代码片段）

**可能的改进方向：**

1. **分层保留策略**：
   - 系统提示 + 工具 schema：永不压缩（cache 锚点）
   - 最近 N 轮：原文保留
   - 中间部分：保留 tool_use/tool_result 的结构化摘要（而非自然语言摘要）
   - 最旧部分：仅保留 key decisions

2. **Semantic Spill**：
   - 基于 embedding 相似度判断哪些旧消息与当前任务相关
   - 相关消息保留原文，不相关消息激进压缩

3. **Tokenizer 缓存**：
   - 首次估算用 chars，API 返回后记录真实 token/message 比率
   - 动态调整估算系数（而非固定 3.5）

4. **Predictive Compact**：
   - 监控 token 增长速率，提前触发 compact（而非等到接近上限）
   - 在 LLM 思考时异步执行 compact

---

### Q30: 如何评估和改进 Agent 的工具调用准确率？

**A:**

**当前设计中的辅助机制：**

1. **Deferred Loading**：减少工具数量 → 降低选择难度
2. **Tool Schema 中的 Description**：详细描述 when to use / when not to use
3. **System Prompt 中的工具使用指南**：优先级、并行规则、Agent 委托规则
4. **连续未知工具硬停止**：检测幻觉工具调用

**评估维度：**

- 正确工具选择率（是否选了最合适的工具）
- 参数准确率（路径、命令是否正确）
- 冗余调用率（是否重复读取同一文件）
- 遗漏率（是否跳过了必要步骤）

**改进方向：**

1. **Few-shot examples in schema**：在工具 description 中嵌入典型调用示例
2. **Tool result feedback**：工具返回错误时附带 "did you mean..." 提示
3. **调用序列模式学习**：记录成功的工具调用序列，作为后续参考
4. **A/B testing framework**：不同 prompt 策略的工具调用准确率对比

---

## 十四、Go 语言特定问题

### Q31: 项目中 `context.Context` 的使用模式？如何做到优雅取消？

**A:**

**传播链：**

```
main (signal.NotifyContext)
  → Agent.Run(ctx)
    → Client.Stream(ctx, ...)
      → http.NewRequestWithContext(ctx, ...)
    → executeSingleTool(ctx, ...)
      → exec.CommandContext(ctx, "bash", "-c", cmd)
    → subagent.Run(ctx, ...)
```

**关键模式：**

1. **BashTool 进程级取消**：

   ```go
   cmd := exec.CommandContext(ctx, "bash", "-c", command)
   // ctx 取消 → 发送 SIGKILL 给进程组
   ```

2. **SSE 流的协作取消**：

   ```go
   select {
   case <-ctx.Done():
       stream.Close() // 关闭 HTTP 连接
       return
   case event := <-nextCh:
       // 处理
   }
   ```

3. **子 Agent 的级联取消**：
   - 父 ctx 取消 → 所有子 Agent 的 ctx 也取消
   - `context.WithCancel` 创建子 ctx，defer cancel()

4. **非阻塞操作不需要 ctx**：
   - `MemoryRecallCh` 的 `select` + `default` 不需要 ctx（立即返回）

---

### Q32: 为什么选择 Bubble Tea 作为 TUI 框架？Elm Architecture 在 Go CLI 中的优劣？

**A:**

**Bubble Tea (Elm Architecture)：**

```
Model → Update(msg) → (Model, Cmd) → View(Model) → string
```

**优势：**

1. **单向数据流**：所有状态变化通过 `Msg` → `Update`，可追踪、可调试
2. **纯函数 View**：`View(Model) string`，无副作用，易测试
3. **组合性**：子组件（bubbles）独立 Update/View，嵌套组合
4. **生态**：lipgloss (样式)、glamour (markdown)、bubbles (组件)

**劣势：**

1. **性能**：每帧全量渲染（vs ncurses 的增量更新），复杂 UI 可能闪烁
2. **学习曲线**：Msg 类型爆炸（每个事件一个 struct）
3. **异步复杂**：Cmd 是 fire-and-forget，结果通过 Msg 回来，调试困难
4. **状态机复杂**：多状态（select/chat/resume/permission）需要手动管理

**Swifty 的适配：**

- Agent 事件通过 `tea.Cmd` 桥接到 Bubble Tea 的 Msg 系统
- 权限请求阻塞 Agent（通过 channel 等待 TUI 回复）
- Markdown 渲染用 glamour（代码高亮 + 表格）

---

## 十五、系统设计开放题

### Q33: 如果要为 Swifty 添加 "Undo/Redo" 功能（撤销 Agent 的文件修改），你会如何设计？

**A:**

**现有基础：**

- `internal/file_history/` 已有文件快照机制
- `FileStateCache` 记录了每次读写的 mtime

**设计方案：**

```go
type ChangeSet struct {
    ID        string
    TurnID    int
    Changes   []FileChange  // {path, before, after}
    Timestamp time.Time
}

type UndoManager struct {
    history []ChangeSet
    pointer int  // 当前位置
}
```

1. **记录时机**：每次 WriteFile/EditFile 执行前，snapshot 原文件内容
2. **粒度**：一个 turn 中的所有文件修改为一个 ChangeSet（原子 undo）
3. **Undo**：恢复 ChangeSet 中所有文件的 before 内容
4. **Redo**：重新应用 after 内容
5. **与 Git 的关系**：
   - 如果用户已 commit，undo 需要创建新 commit（而非 reset）
   - 如果未 commit，直接恢复文件即可
6. **Bash 命令的 undo**：
   - 不可自动 undo（副作用不可逆）
   - 只能记录命令，提示用户手动回滚

---

### Q34: 如何设计一个分布式 Agent 系统（多机协作）？Swifty 的 Teams 系统如何扩展到分布式场景？

**A:**

**当前 Teams 的局限：**

- FileMailBox 依赖共享文件系统
- SharedTaskStore 是单文件 JSON（无并发安全保证 beyond flock）
- in-process/tmux/iTerm 后端都是单机

**分布式扩展方案：**

1. **通信层替换**：
   - FileMailBox → NATS/Redis Pub-Sub
   - SharedTaskStore → etcd/PostgreSQL
   - 保持 `MailBox` / `TaskStore` 接口不变

2. **Agent 调度**：
   - Coordinator 通过 gRPC 分发任务
   - Worker 注册 capability（工具集、文件系统访问范围）
   - 心跳 + 故障转移

3. **一致性挑战**：
   - 多 Agent 编辑同一文件 → 需要分布式锁或 CRDT
   - Worktree 隔离（当前方案）在分布式下变为 branch 隔离
   - 最终一致性：每个 Agent 在自己的 branch 工作，coordinator 负责 merge

4. **安全边界**：
   - 每个 Worker 有独立的 sandbox + permission 配置
   - Coordinator 不能直接执行命令（只能调度）
   - 审计日志集中收集

---

### Q35: Swifty 的 Prompt 构建系统如何保证可维护性和可扩展性？

**A:**

**当前设计 — Priority-Sorted Section Builder：**

```go
type Section struct {
    Name     string
    Priority int
    Content  string
}

// 按 priority 排序后拼接
sections := []Section{
    {"identity", 0, "You are Swifty..."},
    {"system", 10, "Tool rules..."},
    {"doing_tasks", 20, "Best practices..."},
    {"environment", 70, envInfo},
    {"custom_instructions", 80, swiftyMD},
    {"skills", 90, activeSkills},
    {"memory", 95, memoryContent},
}
```

**设计优势：**

1. **关注点分离**：每个 section 独立维护，修改一个不影响其他
2. **优先级控制注意力**：memory 放最后（LLM 对末尾内容注意力最高 — recency bias）
3. **可插拔**：新增 section 只需指定 priority，无需修改其他代码
4. **可测试**：每个 section 的内容可以独立单元测试

**可改进方向：**

- Section 之间的依赖关系（如 skills 依赖 environment 中的 OS 信息）
- 动态 section（根据当前任务类型选择性包含）
- A/B testing 不同 section 顺序对效果的影响
- Token 预算分配（每个 section 有最大 token 限制）
