# swifty-code 面试 Q/A 手册

> 目标读者：高级前端工程师候选人
> 项目：`apps/swifty-code`（`@swifty.js/swifty-code`）—— 一个终端双进程 Coding Agent
> 技术栈：TypeScript (ESM, strict)、Node.js ≥20、Ink + React 19、Anthropic SDK、Zod、pino、tsup
>
> 使用说明：本文档分为上卷（架构与核心机制，58 问）和下卷（进阶篇，60 问），合计 118 问。回答中大量引用源码位置（`文件:行号`），面试前建议对照源码通读。

---

## 目录

### 上卷：架构与核心机制（Q1-Q58）

- [第一部分：整体架构设计（Q1-Q7）](#第一部分-整体架构设计)
- [第二部分：进程通信与协议设计（Q8-Q13）](#第二部分-进程通信与协议设计)
- [第三部分：Agent 核心机制（Q14-Q23）](#第三部分-agent-核心机制)
- [第四部分：权限与安全（Q24-Q28）](#第四部分-权限与安全)
- [第五部分：终端 UI / 前端工程（Q29-Q38）](#第五部分终端-ui--前端工程面试重点)
- [第六部分：会话、记忆与状态管理（Q39-Q43）](#第六部分-会话-记忆与状态管理)
- [第七部分：扩展性与集成（Q44-Q47）](#第七部分-扩展性与集成)
- [第八部分：工程化与可观测性（Q48-Q52）](#第八部分-工程化与可观测性)
- [第九部分：开放性问题与架构权衡（Q53-Q58）](#第九部分-开放性问题与架构权衡)
- [附录 A：速查表](#附录-a-速查表)

### 下卷：进阶篇（Q1-Q60）

- [第一部分：语言与运行时深挖（Q1-Q8）](#第一部分-语言与运行时深挖-js-ts-node-js)
- [第二部分：协议与边界细节（Q9-Q15）](#第二部分-协议与边界细节)
- [第三部分：Agent/LLM 工程深入（Q16-Q24）](#第三部分-agent-llm-工程深入)
- [第四部分：可靠性工程（Q25-Q31）](#第四部分-可靠性工程)
- [第五部分：安全再深入（Q32-Q37）](#第五部分-安全再深入)
- [第六部分：TUI 进阶（Q38-Q45）](#第六部分-tui-进阶)
- [第七部分：移植工程（Q46-Q47）](#第七部分移植工程python--typescript)
- [第八部分：测试与质量保障（Q48-Q50）](#第八部分-测试与质量保障)
- [第九部分：架构演进与开放题（Q51-Q60）](#第九部分-架构演进与开放题)
- [结语](#结语)

---

## 第一部分：整体架构设计

### Q1. 请介绍 swifty-code 的整体架构，它由哪几个进程组成？

标准解答：

swifty-code 采用双进程架构：一个长驻的 daemon 进程（swifty-core）+ 若干个瘦客户端进程（CLI / TUI / 程序化调用方），二者通过 TCP loopback（默认 `127.0.0.1:7437`）通信。

```
  +-----------+      TCP / NDJSON / JSON-RPC 2.0      +------------------+
  | CLI / TUI | <===================================> |   swifty-core    |
  | (client)  |    命令: JSON-RPC 请求/响应            |   (daemon)       |
  +-----------+    事件: {kind:"event"} 服务端推送     +------------------+
                                                                |
                                              +-----------------+-----------+
                                              |                             |
                                       +-----------+                 +-----------+
                                       | Anthropic |                 | MCP 服务器 |
                                       |  Claude   |                 | (可选)    |
                                       +-----------+                 +-----------+
```

各进程的入口：

| 进程                      | 入口文件                            | 说明                                                                                   |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| CLI（用户-facing 二进制） | `src/cli/main.ts` → `main()`        | 手写参数解析，子命令 `ping/run/chat/tui/trace/core/version`                            |
| Daemon（核心）            | `src/core/app.ts` → `CoreApp.run()` | 组装配置、事件总线、会话管理器、权限管理器、MCP、SocketServer，注册 9 个 JSON-RPC 方法 |
| TUI（交互界面）           | `src/tui/index.ts` → `launchTUI()`  | Ink/React 应用，作为 SocketClient 连接 daemon                                          |
| 开发启动器                | `src/dev.ts`                        | fork daemon、轮询等端口就绪、前台跑 TUI、退出时 SIGTERM→SIGKILL                        |

用户实际只接触一个二进制 `swifty-code`（`package.json` 的 `bin` 指向 `dist/cli/main.js`）。daemon 由 CLI 内部以 `detached: true` spawn（`src/cli/commands/core.ts:41`），PID 写入 `~/.swifty/swifty-core.pid` 后 `unref()`，实现后台驻留。

架构上的关键点是职责倒置：所有有状态的东西（会话历史、agent 运行状态、权限挂起、MCP 连接）都在 daemon；客户端是无状态的渲染器 + 输入采集器，通过两类消息与 daemon 交互：

- 命令：JSON-RPC 2.0 请求/响应（9 个方法：`core.ping`、`agent.run`、`event.subscribe`、`session.create`、`session.send_message`、`session.get_history`、`session.close`、`session.compact`、`permission.respond`）
- 事件：服务端主动推送的 `{kind:"event", event:{...}}` 信封，共 24 种事件类型（`src/core/bus/events.ts`）

---

### Q2. 为什么采用双进程架构？相比 Claude Code 那种单进程方案，优势和代价分别是什么？

标准解答：

动机与优势：

1. 运行状态与 UI 生命周期解耦。Agent 的一次 run 可能持续几分钟甚至更久，期间用户可能关闭终端、TUI 可能崩溃。双进程下 daemon 持有全部 run 状态，客户端崩溃后重连即可通过 `replay_from_run` 回放事件恢复现场（`src/tui/app.tsx:483-485`），run 本身不受任何影响。单进程方案中 UI 崩溃 = agent 中断。
2. 多客户端复用同一核心。同一 daemon 可以同时服务 TUI、一次性 CLI（`swifty run`）、`trace` 查看器等。事件广播器 `IpcEventBroadcaster` 天然支持多订阅者（`src/core/transport/ipc-broadcaster.ts:55`），多个客户端可以同时围观同一次 run。
3. 权限决策收敛到一处。权限挂起/恢复（`PermissionManager.checkAndWait`）在 daemon 内完成，任何一个客户端都可以响应 `permission.requested`；权限策略持久化文件 `~/.swifty/policy.toml` 只有 daemon 写，避免多进程并发写冲突。
4. 资源生命周期清晰。MCP 子进程、Anthropic 连接、trace 文件句柄都由 daemon 持有，客户端来去自由；daemon 停机时统一 drain（`src/core/app.ts` 中 SIGINT/SIGTERM → 等待运行中的 run，5s 超时 → 停 MCP → 停 server）。
5. 可测试性。核心逻辑可以完全脱离终端测试：测试起一个在空闲端口的 SocketServer，用真 TCP 打 JSON-RPC 就能做 e2e（`tests/` 下 47 个测试文件大量这么做）。

代价：

1. 进程管理复杂度：需要 PID 文件、端口占用探测（`socket-server.ts:123` `_probePort`）、僵尸进程清理（`kill.mjs`）等样板。
2. 协议维护成本：所有跨进程数据都要 Zod schema 双端校验，`WIRE_PROTOCOL.md` 需要脚本从 schema 重新生成（`scripts/gen-protocol-doc.ts`）。
3. 一次额外的序列化/反序列化跳数：`llm.token` 这类高频事件要经过 `EventBus → IpcEventBroadcaster → JSON.stringify → TCP → JSON.parse → React setState`，吞吐和时延都不如进程内函数调用，因此 TUI 侧要做 50ms 节流（见 Q32）。
4. 部署一致性：CLI 和 daemon 版本可能漂移（用户升级了 CLI 但旧 daemon 还在跑），当前用 `core.ping` + 固定端口做了最简处理，没有版本握手，这是已知妥协。

面试加分点：能指出这套架构本质上就是 LSP（Language Server Protocol）/ 编辑器-语言服务器模式 在 AI Agent 领域的复刻——「长驻有状态 server + 无状态 thin client + JSON-RPC」是被 VS Code 生态验证过的范式，swifty-code 把它平移到了终端 Agent 场景。

---

### Q3. IPC 传输为什么选 TCP loopback，而不是 Unix domain socket、stdio 或命名管道？

标准解答：

这是一个典型的 trade-off 问题。四种方案对比：

| 方案               | 优势                                                                                                                                                  | 劣势                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| TCP loopback       | 跨平台一致（Windows 一等支持）；调试方便（`nc`/`telnet`/Wireshark 可观测）；天然支持「先起 daemon 后起多个客户端」的拓扑；未来可平滑演进成远程 daemon | 需要端口管理（占用探测、冲突）；理论上同机其他进程可连（需要鉴权，当前信任 loopback）                 |
| Unix domain socket | 无端口冲突；文件权限即鉴权；略快                                                                                                                      | Windows 支持历史包袱重（Win10 后期才有）；路径长度限制；不如 TCP 易调试                               |
| stdio              | 最简单                                                                                                                                                | 只支持父子进程 1:1 拓扑，无法支持「已运行的 daemon + 新客户端」；stdout 被协议占用后日志/渲染都得让路 |
| 命名管道           | Windows 友好                                                                                                                                          | API 跨平台差异大，Node 抽象不如 net 模块统一                                                          |

swifty-code 的选择（`src/core/config.ts` 中 `core.host`/`core.port`，默认 `127.0.0.1:7437`，可用 `SWIFTY_HOST`/`SWIFTY_PORT` 覆盖）理由：

1. 拓扑自由度：daemon 先起、多个客户端随时接入/断开，stdio 做不到这一点。
2. 可观测性：`swifty-code trace` 能 tail daemon 的 JSONL trace 文件；TCP 本身也能用系统工具抓包。
3. 演进空间：host/port 可配置意味着把 daemon 放到远程主机/容器里只需要改配置——虽然当前协议没做鉴权，但传输层不构成阻碍。
4. Node API 统一：`net.createServer`/`net.createConnection` 一套代码同时被 SocketServer、SocketClient、MCP TCP 传输（`src/core/mcp/client.ts:85`）复用。

安全性上要注意：绑定 `127.0.0.1` 是刻意的——只接受本机连接；`SocketServer.start()` 先 `_probePort()` 探测端口占用（`socket-server.ts:81-86`），占用即报错 `core already running`，fail fast 而不是悄悄接管。

---

### Q4. 应用层协议为什么设计成 NDJSON + JSON-RPC 2.0？为什么不直接用 HTTP、WebSocket 或 gRPC？

标准解答：

协议栈的选择要匹配需求：「同机、长连接、双向（请求/响应 + 服务端推送）、消息有边界、人可调试」。

1. NDJSON（换行分隔 JSON）做分帧。TCP 是字节流没有消息边界，需要分帧协议。NDJSON 一行一条消息（`socket-server.ts:139` 用 `readline.createInterface({input: socket, terminal:false})` 按行读），实现成本几乎为零，且 `tail -f`、`jq` 直接可用。代价是 JSON 内不能出现裸换行——JSON.stringify 默认转义 `\n`，天然满足。单行上限 64MB（`socket-server.ts:34`），超限直接断连，防御内存攻击。

2. JSON-RPC 2.0 做命令语义。三个字段 `id/method/params` 足够表达请求-响应关联；错误码沿用标准（`-32700` parse error、`-32600` invalid request、`-32601` method not found、`-32602` invalid params、`-32603` internal），再扩展应用层错误码段（`-32010..-32012` 会话类、`-32020..-32021` provider/compaction 类，见 `src/core/session/manager.ts:16-20`）。客户端用 UUID 作 id，`_pending` Map 做 promise 关联（`socket-client.ts:134-146`）。

3. 自定义事件信封做推送。JSON-RPC 的通知机制语义上是 fire-and-forget，swifty-code 需要订阅/过滤/回放，所以定义了独立的 `{kind:"event"}` 信封（`src/core/bus/envelope.ts` 中 `EventPushEnvelope`），与 JSON-RPC 消息在同一连接上多路复用——客户端 `_dispatch` 按 `jsonrpc` 字段是否存在分流（`socket-client.ts:160-190`）。

排除其他方案的理由：

- HTTP：请求/响应模型，服务端推送要靠 SSE 或长轮询，双工要维护两条通道；每请求一次 TCP/TLS 握手对 `llm.token` 这种高频小消息开销太大。
- WebSocket：能双工，但引入帧协议 + 握手升级的复杂度，且同机 TCP 上 WS 的掩码/帧头纯属浪费；调试需要专用工具，失去 NDJSON「肉眼可读」的优势。
- gRPC/Protobuf：强类型、高效，但引入 codegen 工具链；本项目已经用 Zod 拿到了同等强度的 schema 保证（且 TS 单语言栈，schema 即代码），二进制编码反而牺牲了可调试性。

一句话总结：在「单语言（TS）+ 同机 + 需要双工 + 重视可调试性」的约束下，NDJSON + JSON-RPC 是复杂度/收益比最优的组合。schema 严格性由 Zod 补齐，而不是靠二进制协议。

---

### Q5. daemon 的生命周期是如何管理的？（启动、占座、优雅停机）

标准解答：

启动（生产路径）：`swifty-code core start`（`src/cli/commands/core.ts`）解析 daemon 入口（`dist/core/app.js` 或开发态 `src/core/app.ts`），以 `spawn(process.execPath, [appPath], {detached: true})` 拉起子进程，写 PID 到 `~/.swifty/swifty-core.pid`，然后 `unref()` 让父进程可以退出，daemon 成为孤儿进程由 init 接管。

开发路径：`src/dev.ts` 用 `child_process.fork`（带 `--import tsx`）起 daemon，然后每 200ms 探测一次 TCP 端口（10s 超时）确认就绪，再前台启动 TUI。

占座与防重：`SocketServer.start()` 在 `listen` 前先 `_probePort()` 尝试主动连接目标端口（`socket-server.ts:123-133`）：连得上说明已有 daemon，直接抛 `core already running at host:port`，避免两个 daemon 互相踩踏。

优雅停机（`src/core/app.ts`）：

1. 监听 SIGINT/SIGTERM；
2. 用一个全局 `AbortController` 通知所有运行中的 run——`AgentLoop.run` 每步开头检查 `signal.aborted`（`src/core/loop.ts:57-60`），这是协作式取消，不会在工具执行中间硬切；
3. 等待运行中的 run 排空（drain），5 秒超时兜底；
4. 依次停掉 MCP 服务器连接（`McpServerManager.stopAll()`，stdio 子进程 SIGTERM→5s→SIGKILL）、SocketServer（先 destroy 所有活动 socket 再 close，2s 强制超时，`socket-server.ts:102-120`）、TraceWriter。

面试加分点：注意停机顺序是「先停接受新工作（server close 隐含）→ 等待存量完成 → 释放外部资源」，这是标准的 graceful shutdown 三段式；AbortController 贯穿到 subagent（`SpawnAgentTool` 构造函数把同一个 signal 传给子 loop，`subagent/tool.ts:137`），保证取消信号能穿透嵌套层级。

---

### Q6. 事件系统的架构是怎样的？EventBus、IpcEventBroadcaster、EventWriter、TraceWriter 四者如何分工？

标准解答：

swifty-code 的事件是同一份事实、四条消费路径，核心是一个进程内的极简 pub/sub：

```
                       core 内部产生事件 (bus.publish)
                                  │
                    EventBus (src/core/events/bus.ts)
                    subscribe(handler) / publish(event) 顺序 await
                                  │
        ┌────────────────┬────────┴─────────┬──────────────────┐
        │                │                  │                  │
 IpcEventBroadcaster  EventWriter      TraceWriter        TUI/CLI 内部
 (按订阅过滤后推给     (追加写入 per-run  (写入全局           (直接订阅 bus
  TCP 客户端)          events.jsonl)     daemon.jsonl)       的 handler)
```

- `EventBus`（`src/core/events/bus.ts`，仅 17 行）：`subscribe(handler)` + `publish(event)`，publish 时顺序 await 每个 handler。顺序 await 是有意的——保证事件落盘（EventWriter）与推送（Broadcaster）的相对顺序可控，代价是慢消费者会拖累 publish 延迟。
- `IpcEventBroadcaster`（`src/core/transport/ipc-broadcaster.ts`）：维护 `{subId, socket, topics, scope, matchers}` 订阅表。`handle(event)` 对每个订阅做两层过滤——topic 用 picomatch 编译后的 matcher 匹配（支持 `run.*` 这种 glob）、scope 区分 `global` / `run:<runId>`——匹配则写 `{kind:"event", event}` 信封。写入返回 `false`（内核缓冲满）时等 `drain` 事件做背压；写失败的 socket 收集进 dead 列表统一退订清理。
- `EventWriter`（`src/core/events/writer.ts`）：每个 run 一个 `runs/{runId}/events.jsonl`，`appendFileSync` 追加。它是事件回放的存储基础——客户端重连后请求 `replay_from_run` 时，daemon 从该文件读历史事件重放。
- `TraceWriter`（`src/core/trace/writer.ts`）：全局 `~/.swifty/traces/daemon.jsonl`，记录的不只是事件层，还有 IPC 层（command/response/push/error）和 LLM 层（api_call/api_response）——通过 `TracingProvider` 装饰器在 LLM 调用前后打点（`src/core/trace/provider.ts`）。定位为全链路可观测性，用 `swifty-code trace --follow` 消费。

设计亮点：四者都挂在同一个 bus 上，彼此正交。新增一种事件消费方（比如上报 metrics）只需要再 subscribe 一个 handler，不需要改任何生产者代码——经典的观察者模式，但每条路径的序列化格式、存储介质、过滤语义各不相同。

---

### Q7. TUI 断线重连后如何恢复现场？`replay_from_run` 机制是怎样工作的？

标准解答：

这是双进程架构的核心卖点之一，完整链路：

1. 运行期间，TUI 在每收到 `run.started` 时把 `run_id` 记进 `lastRunIdRef`（`src/tui/app.tsx:207-210`）；同时 daemon 侧的 `EventWriter` 正在把该 run 的全部事件追加到 `runs/{runId}/events.jsonl`。
2. 断线检测：`SocketClient.waitForDisconnect()` 返回的 promise 在 socket close/error 时 resolve（`socket-client.ts:58-67`），TUI 的连接循环捕获后 `client.close()`，进入 2s 间隔的重连循环（`app.tsx:456-525`）。注意 `client.onEvent` 注册的 handler 不随重连丢失——它存在 `_eventHandlers` 数组里，与 socket 生命周期解耦。
3. 重连后重建订阅：TUI 重新发送 `event.subscribe`，并带上 `replay_from_run: <lastRunId>`（`app.tsx:483-485`）。
4. daemon 回放：`CoreApp` 处理 `event.subscribe` 时若带 `replay_from_run`，读取对应 `events.jsonl`，把历史事件按序直接写给当前这个连接——这里用到 `AsyncLocalStorage` 存的当前 socket（`getConnectionWriter()`，见 Q8），所以回放只发给重连的客户端，不会广播给其他人。
5. 幂等渲染：TUI 的事件处理对重复事件天然宽容——`session.message_received` 有本地回显去重（`app.tsx:266-278`），token 计数等是覆盖式更新，所以「重放已见过的事件」不会造成 UI 错乱。

边界情况：如果 run 在断线期间已经结束，重放会把 `run.finished` 一并补发，TUI 据此把 `isRunning` 归位；`session_id` 存在 ref 里跨重连保留，所以会话不需要重建，`session.create` 只在首次连接时调用（`app.tsx:489-499`）。

局限（面试可主动提）：回放源是 `events.jsonl`，如果 daemon 也重启了，内存中的 session map（`SessionManager._sessions`）丢失，旧 session_id 会报 `SESSION_NOT_FOUND`——当前版本 daemon 重启即全量状态重置，这是已知边界。

---

## 第二部分：进程通信与协议设计

### Q8. `SocketServer` 里为什么要用 `AsyncLocalStorage`？它解决了什么问题？

标准解答：

问题背景：`event.subscribe` 这个 RPC 的处理函数需要做两件看似矛盾的事——

1. 把调用方登记进广播器的订阅表（全局副作用）；
2. 如果带了 `replay_from_run`，要把历史事件只回放到当前这条连接，而不是广播给所有订阅者。

难点在于：handler 的签名是 `(params) => Promise<unknown>`（`socket-server.ts:20`），拿不到「当前连接」这个上下文。常规解法是改签名注入 socket，但那会污染所有 9 个 handler 的接口。

swifty-code 用了 Node.js 的 `AsyncLocalStorage<net.Socket>`（`socket-server.ts:23`）：每收到一行消息，都以 `writerStorage.run(socket, () => this._handleLine(line, socket))` 包裹执行（`socket-server.ts:154`）。这样，在这条异步调用链的任意深处，handler 都可以调 `getConnectionWriter()` 拿到当前 socket——不需要透传参数，隐式携带连接上下文。

这和 Web 框架里的 request context（如 NestJS 的 `AsyncLocalStorage` 方案、Java 的 ThreadLocal）是同一思想。这里的两个精妙细节：

1. 为什么必须 ALS 而不是模块级变量：单条 TCP 连接上可能并发处理多条命令（`rl.on("line")` 里 `void` 掉 promise，不阻塞读循环，`socket-server.ts:153-154` 注释明确写了 "avoid blocking the read loop with long-running handlers"）。如果用模块级 `let currentSocket`，并发 handler 会互相覆盖；ALS 给每个异步执行上下文独立的 store。
2. 顺带实现了读循环与慢 handler 的解耦：`void writerStorage.run(...)` 不 await，所以一个需要 5 分钟的 `session.send_message` handler 不会阻塞同连接上后续的 `permission.respond`——这一点对权限流程至关重要（权限弹窗期间，用户响应走的是同一个或另一个连接上的新命令）。

追问可能：ALS 有性能开销吗？有（每次 `run` 创建上下文对象，V8 需要跟踪异步资源），但相对于 NDJSON 解析和 TCP I/O 是噪声级别；且每行消息只包一次。

---

### Q9. TCP 写入的背压（backpressure）是怎么处理的？

标准解答：

Node 的 `socket.write()` 在内核发送缓冲区满时返回 `false`，继续硬写会导致用户态内存堆积。swifty-code 在两个层面处理：

1. 服务端响应写入（`socket-server.ts:45-59` 的 `sendJson`）：`write` 返回 `false` 时挂起 promise，`socket.once("drain", resolve)` 等缓冲区排空后再 resolve。
2. 事件广播（`ipc-broadcaster.ts:67-71`）：同样的模式——`writeLine` 返回 false 则 `await new Promise(resolve => socket.once("drain", resolve))`。

由此带来一个连锁设计：因为广播是 `await` 的，而 `EventBus.publish` 又是顺序 await 所有 handler 的，所以一个慢客户端会反过来拖慢整个 daemon 的事件发布——这是当前架构的一个已知特性（也可以说是缺陷）。缓解因素：事件体都很小（token 事件几十字节），loopback 带宽极高，实际很难打满；真要彻底解决需要给每个订阅者加有界队列 + 溢出断连策略。

追问：写入失败（如对端 RST）怎么办？广播器 catch 后把 socket 加入 `dead` 列表，循环结束后统一 `unsubscribe` 清理（`ipc-broadcaster.ts:88-90`）；不会让一个死连接反复报错。

---

### Q10. `SocketClient` 如何把响应匹配回请求？连接断开时挂起的请求怎么办？

标准解答：

请求-响应匹配：经典的 UUID + pending map 模式（`socket-client.ts:126-147`）：

```ts
const reqId = randomUUID();
this._pending.set(reqId, { resolve, reject });
this._socket.write(JSON.stringify(request) + "\n", "utf-8");
return promise; // Promise.withResolvers 创建
```

`_dispatch` 收到每行消息时分流（`socket-client.ts:150-191`）：含 `jsonrpc` 字段 → 按 `id` 查 `_pending`，命中则根据 `error`/`result` reject/resolve 并删除；`kind === "event"` → 顺序 await 所有 `onEvent` handler。

断线处理——这是容易被忽略的健壮性细节，项目在两处做了同一件事（`socket-client.ts:96-102` 和 `106-118`）：

- `rl.on("close")` 时遍历 `_pending`，全部 `reject(new Error("connection closed"))`；
- `close()` 方法主动关闭时也先 reject 所有 pending 再 destroy socket。

注释里解释了为什么两处都要：如果 socket 是被外部 destroy 的，readline 的 `close` 事件可能永不触发，仅靠 close 钩子会让 `sendCommand` 的 promise 永远挂起（调用方 await 永不返回，形成内存泄漏 + 业务卡死）。任何持有 pending promise 池的客户端封装，都必须保证「promise 必定 settle」——这是面试中考察异步工程素养的好点。

另外注意 `onEvent` 与 `_pending` 的生命周期不对称是刻意的：事件 handler 跨重连保留（UI 订阅只需注册一次），pending 表每次连接独立（旧连接的请求不可能被新连接响应）。

---

### Q11. 事件订阅的过滤语义是怎样的？topic 通配和 scope 各解决什么问题？

标准解答：

订阅模型有两个正交的过滤维度（`ipc-broadcaster.ts`）：

1. topic 过滤：订阅时传字符串数组（如 `["run.*", "tool.*", "llm.token"]`），每个 topic 用 picomatch 编译成 matcher 函数（`ipc-broadcaster.ts:43`）。事件发布时 `matchers.some(m => m(eventType))`。选 picomatch 而非手写 `startsWith` 的原因：直接获得成熟的 glob 语义（`*`、``、字符类），且预编译后匹配是 O(事件类型字符串长度) 的函数调用，无正则构造开销。
2. scope 过滤：`"global"` 接收一切；`"run:<runId>"` 只接收 `run_id` 字段等于该值的事件（`_matchesScope`，`ipc-broadcaster.ts:99-103`）。这解决的是多 run 并发时的串扰——比如 `swifty run` 一次性命令只关心自己触发的那次 run，不该收到别的客户端发起的 run 的 token 流。

TUI 订阅的是 `["run.*","step.*","tool.*","llm.*","permission.*","session.*","subagent.*","context.*","log.*","skill.*"]` + `scope:"global"`（`app.tsx:468-482`），即「什么都看」；而 `cli/commands/run.ts` 的一次性运行用窄 topic + run scope。同一广播器服务两种诉求，不用为不同客户端类型开不同的推送通道。

设计评价：这是一个「穷人版消息队列 topic」——没有持久化订阅、没有消费组，但对「几个本地客户端围观一个 daemon」的规模恰好够用，复杂度控制在 104 行。

---

### Q12. 项目里为什么到处用 Zod？它在协议层扮演什么角色？

标准解答：

原则一句话：所有跨越信任边界的数据都必须被 schema 验证。swifty-code 的边界有三层，每层都有 Zod：

1. IPC 边界：`JsonRpcRequestSchema.safeParse`（`socket-server.ts:178`）挡住畸形请求；命令参数（`src/core/bus/commands.ts` 的 `CommandSchema` 判别联合）和事件（`events.ts` 的 `EventSchema`，24 个事件的判别联合）都有完整 schema。
2. 工具参数边界：每个工具可声明 `paramsModel: ZodType`，LLM 给出的 `input` 先 `safeParse`，失败返回 `schema_error` 类错误给模型自我纠正（`invocation.ts:102-107`）——LLM 输出是不可信输入，必须当作用户输入处理。
3. 配置边界：TOML 配置逐段校验，未知 section/key 直接拒绝启动（`config.ts` 的 `VALID_SECTIONS` 机制）。

工程收益：

- schema 即文档：`pnpm doc` 跑 `scripts/gen-protocol-doc.ts` 从 Zod schema 重新生成 `WIRE_PROTOCOL.md`，文档与代码永不漂移。
- 类型推导零成本：`z.infer` 直接出 TS 类型，不用手写 interface 再手写校验器，消除「类型说一套、运行时是另一套」的空间。
- 错误归因清晰：`socket-server.ts:222-223` 把 `ZodError` 映射为 `-32602 Invalid params`，与 handler 业务错误（`-32603`）、协议错误（`-32600`）区分开，客户端能精确知道错在哪一层。

面试加分点：可以对比「编译期类型 vs 运行时校验」的误区——TS 的 `as`/interface 在 `JSON.parse` 之后不提供任何保证，`parsed as JsonRpcRequest` 是自欺欺人；Zod 把边界处的「unknown → 受信类型」窄化变成了显式、可测试的一步。

---

### Q13. 错误码体系是怎么设计的？

标准解答：

三层结构（`src/core/bus/envelope.ts` + `src/core/session/manager.ts:16-20`）：

1. JSON-RPC 标准错误（协议层）：
   - `-32700` Parse error（JSON 解析失败，id 置 null）
   - `-32600` Invalid Request（schema 不符，含消息过大被断连前的响应）
   - `-32601` Method not found
   - `-32602` Invalid params（ZodError 映射到此）
   - `-32603` Internal error（未捕获异常，且对内 log 详细错误、对外只回 "Internal error"，`socket-server.ts:224-227`——不泄漏内部细节）
2. 应用错误（`-320xx` 段，JSON-RPC 规范保留给实现自定义）：`-32010 SESSION_NOT_FOUND`、`-32011 SESSION_CLOSED`、`-32012 SESSION_BUSY`、`-32020 PROVIDER_NOT_AVAILABLE`、`-32021 COMPACTION_FAILED`。用 `HandlerError` 异常类携带 code 从 handler 深处抛出，传输层捕获后转成 JSON-RPC error 响应（`socket-server.ts:220-221`）。
3. 客户端呈现：`IpcError extends Error` 带 `code` 字段（`socket-client.ts:12-20`），TUI/CLI 可以按 code 做差异化处理（比如 `SESSION_BUSY` 提示用户等待，而不是笼统报错）。

设计要点：业务错误走异常而非返回值——handler 写起来是「快乐路径直行，出错即抛」，错误码集中在抛出点定义，传输层统一翻译。这比在每个返回值里塞 `errcode` 字段更不易遗漏，也符合 JSON-RPC「error 与 result 互斥」的协议形态。

---

## 第三部分：Agent 核心机制

### Q14. 描述 Agent loop 的完整运转流程（plan-act-observe）。

标准解答：

`AgentLoop.run`（`src/core/loop.ts:54-156`）是一个 `while (!context.isDone())` 循环，每轮（step）做四件事：

1. 取消检查：`_signal?.aborted` → `markFailed("cancelled")` 并抛出。协作式取消，颗粒度是「步」。
2. plan：`provider.chat(messages, toolSchemas, bus, runId, {system})`。流式调用 Anthropic，文本增量以 `llm.token` 事件实时发出，结束后发 `llm.usage`；返回 `{stopReason, toolUses, text, usage, thinkingBlocks}`。
3. observe：把 assistant 的内容块按 `[...thinkingBlocks, text, ...tool_use]` 顺序组装后 `context.addAssistantMessage(blocks)`——注意 thinking 块必须回放进历史，否则后续轮次 Anthropic API 会因 thinking 块缺失报错。
4. act：若 `stopReason === "tool_use"`，逐个 `invokeTool()` 执行，结果 `context.addToolResult()` 追加。还有个特殊分支：`stopReason === "max_tokens"` 但带 toolUse（`loop.ts:119-127`）——说明输出被截断，工具调用不完整，此时不执行，而是给每个 toolUse 回填一条「请拆小步骤重试」的 error tool_result，让模型自我修正。

终止条件（`loop.ts:130-135`）：

- `end_turn` → `context.result = text`，`markSuccess()`；
- `step >= maxSteps` → `markFailed("exceeded_max_steps")`；
- LLM 调用异常 → `markFailed("llm_error")` break；
- abort → `markFailed("cancelled")` throw。

compaction 检查（`loop.ts:138-147`）：仅当「未结束 + 本轮是 tool_use + usage.contextPercent ≥ 阈值（默认 0.8）」时触发 `compactor.compact()`。为什么只在 tool_use 后检查？因为上下文增长主要来自工具结果回填，end_turn 后 run 已结束没有压缩的必要。

每步首尾发 `step.started` / `step.finished` 事件，供 UI 显示步数与 trace 计时。

面试加分点：能指出这个 loop 与 ReAct 论文的对应关系——plan≈Reason（LLM 推理）、act≈Act（工具调用）、observe 双向（把 assistant 输出固化进历史 + 把工具结果作为新观测喂回）。终止不靠「步数 + 正则解析」而靠 Anthropic 原生的 `stop_reason`，比 prompt 里约定特殊终止字符串可靠得多。

---

### Q15. `ExecutionContext` 承担什么职责？`addToolResult` 为什么要把多个 tool_result 合并进同一条 user 消息？

标准解答：

`ExecutionContext`（`src/core/context.ts`）是单次 run 的全部可变状态容器：`runId/goal/maxSteps`（不可变）、`messages`（对话历史，可被 compactor 整体替换）、`step/status/result/reason`。它还负责系统提示词组装（`systemPrompt(base)` 拼接 Global/Project/Session Notes 三层记忆，见 Q23）。

`addToolResult`（`context.ts:79-98`）的合并逻辑：

```ts
const last = this.messages[this.messages.length - 1];
if (
  last.role === "user" &&
  Array.isArray(last.content) &&
  last.content.every((b) => b.type === "tool_result")
) {
  last.content.push(block); // 合并进上一条
} else {
  this.messages.push({ role: "user", content: [block] }); // 新开一条
}
```

原因是 Anthropic API 的协议约束：`tool_result` 块必须出现在 `user` role 消息中，且同一轮 assistant 消息里的所有 `tool_use`，必须在紧跟的下一条 user 消息里全部有对应的 `tool_result`。AgentLoop 是串行循环执行本轮所有 toolUse（`loop.ts:112-118`），如果每个结果各开一条 user 消息，第一条之后的 tool_use 就处于「悬而未决」状态，API 直接 400。合并逻辑识别「上一条已经是纯 tool_result 的 user 消息」就继续往里塞，保证 N 个 tool_use → 1 条 user 消息（含 N 个 tool_result 块）。

追问：`store.ts` 里的 `_trimOrphanToolUse` 是什么？——互补的防御：从 `thread.jsonl` 恢复历史时，若最后一条 assistant 消息带有未被任何 tool_result 应答的 tool_use（比如 run 中途被取消/崩溃），读入时把它裁掉，避免带着「脏尾巴」的历史再次请求 API 报 400。一个防写入时，一个防恢复时。

---

### Q16. Anthropic 的 prompt caching 是怎么用的？为什么缓存标记打在 system 和「最后一个 tool」上？

标准解答：

`AnthropicProvider.chat`（`src/core/llm/provider.ts:99-115`）设置两个 `cache_control: {type: "ephemeral"}` 断点：

1. system 块：`system: [{type:"text", text, cache_control}]`；
2. tools 数组的最后一个元素：拷贝出来打上 cache_control 再放回（`provider.ts:109-115`，注意是浅拷贝新对象，不改原数组）。

原理：Anthropic 的 prompt cache 是前缀缓存——从消息开头到 cache_control 标记处的内容若与上次请求逐字节一致，则命中缓存，按 cache_read 价格计费（约为普通 input 的 1/10），且显著降低首 token 时延。一次 agent run 中，相邻两步之间变化的是尾部（新增 assistant 消息 + tool_result），而头部的 system + 工具定义完全不变。把断点打在 tools 末尾，意味着「system + 全部工具 schema」这通常占 prompt 大头（几十个工具定义轻松几千 token）的部分，从第 2 步起全部走 cache_read。

细节与取舍：

- ephemeral 缓存 TTL 约 5 分钟，正好覆盖 agent 步进间隔；
- 缓存要求前缀 ≥1024 token（sonnet），太短不生效，这是平台约束而非代码问题；
- 不在 messages 尾部再打第三个断点（Anthropic 允许最多 4 个），因为尾部每步都变，打了也必 miss，反而浪费 cache_creation 写入费——缓存断点要打在「稳定前缀的边界」上，这是使用前缀缓存的核心原则。
- 效果可观测：`llm.usage` 事件带 `cache_read_input_tokens` / `cache_creation_input_tokens`（`provider.ts:178-191`），TUI 和 trace 都能看到命中率。

---

### Q17. LLM 流式调用的重试机制是怎样的？为什么「只有第一次 attempt 才发 llm.token 事件」？

标准解答：

重试（`provider.ts:132-171`）：`MAX_STREAM_RETRIES = 3`，指数退避 1s/2s/4s（`RETRY_BACKOFF_MS`）。只有 `isRetryableError` 判定为瞬态网络错误才重试：`ECONNRESET/ECONNREFUSED/ETIMEDOUT/EPIPE/EAI_AGAIN` 五种 errno，加上消息含 `socket hang up`/`connection reset` 的错误（`provider.ts:42-56`）。4xx/5xx 这类 API 级错误直接抛出——重试无意义且浪费配额。

token 去重（`provider.ts:139-150`）：

```ts
const isFirstAttempt = attempt === 1;
stream.on("text", (textDelta) => {
  if (isFirstAttempt) { void bus.publish({type:"llm.token", ...}); }
  textParts.push(textDelta);   // 注意：本地收集不受 attempt 限制
});
```

为什么这么做？重试意味着从头重新生成整段回复（Anthropic 流式没有断点续传）。第一次 attempt 流出的 token 已经推给 TUI 显示了；如果重试时再推一遍，用户会看到文本重复拼接。但 `textParts` 是从空数组重新收集的（`provider.ts:133` 每次 attempt 开头 `textParts = []`），所以返回给 loop 的最终文本是干净的，只是 UI 侧可能残留第一次 attempt 的部分流式文本——这是「UI 实时性」与「重试一致性」之间刻意的取舍：宁要 UI 可能多显示一段，不要最终结果被污染。

追问：这个取舍有什么隐患？若第一次 attempt 流到一半断了、重试成功，TUI 显示的流式文本 = attempt1 前半 + 无（attempt2 不发事件），然后 `run.finished` 时 `flushStream` 把 ref 里的累积文本作为最终 assistant 消息提交（`app.tsx:184-199`）——累积的是 attempt1 的不完整文本，与 daemon 侧历史里的完整文本不一致。这是已知的小概率 UI 瑕疵，彻底解法需要 llm.text 全量对账事件（事件 schema 里预留了 `llm.token`/`llm.text` 两种，`app.tsx:239-247` 也处理了 `llm.text`）。

---

### Q18. 上下文水位 `contextPercent` 怎么算？自动 compaction 的触发条件是什么？

标准解答：

`contextPercent = usage.input_tokens / contextWindow(model)`（`provider.ts:180`）。模型上下文窗口查表 `MODEL_CONTEXT_WINDOWS`（`provider.ts:12-16`，sonnet-4-6/haiku-4-5/opus-4-7 均 200K，未知模型默认 200K）。注意用的是本次请求的 input_tokens（含缓存命中部分），因为它才代表「当前对话占用的上下文长度」，而不是累计消耗。

自动压缩触发（`loop.ts:138-147`）需同时满足：

1. run 未结束（`!context.isDone()`）；
2. 本轮 `stopReason === "tool_use"`（还有后续工作要做）；
3. compactor 存在且阈值 > 0（`compaction.auto_threshold` 配置，默认 0.8）；
4. `usage.contextPercent >= threshold`。

满足后 `compactor.compact(context, provider)` 就地替换 `context.messages` 并写摘要文件、发 `context.compacted` 事件（带 original/summary tokens，TUI 据此显示「saved N tokens」并重置水位条，`app.tsx:386-399`）。

为什么阈值取 0.8 而不是 0.95：压缩本身要调一次 LLM（把全文发出去），需要预留空间；压缩后的摘要也要占上下文；且要防止「压缩后一步又长回来」的抖动。0.8 留出了约 40K token 的余量做这些操作。

---

### Q19. Compactor 的六段式摘要 prompt 是怎么设计的？压缩后为什么用「user 摘要 + assistant 确认」两条消息替换历史？

标准解答：

`COMPACT_PROMPT`（`src/core/compact/compactor.ts:10-33`）要求模型把对话压缩成固定六节：

1. `## 1. Original Goal` — 一句话原始目标；
2. `## 2. Completed Steps` — 已完成事项（具体到文件路径、命令、决策）；
3. `## 3. Key Constraints & Discoveries` — 运行中发现的、影响后续决策的事实；
4. `## 4. Current File State` — 每个被创建/修改文件的当前状态；
5. `## 5. Remaining TODOs` — 有序待办；
6. `## 6. Critical Data` — 必须逐字保留的值（ID、token、确切报错、配置值）。

设计依据：这是一次 agent 间交接（handoff）——prompt 开篇明说 "Another LLM instance will continue this task from your summary alone"。六节覆盖了接力所需的全部要素：目标（不跑偏）、进度（不重复劳动）、约束（不踩已知的坑）、现场（不覆盖别人的改动）、计划（知道接下来干嘛）、数据（不断链）。固定结构还便于机器消费和人审查（摘要会写到 `summary_<timestamp>.md`）。`compactMessages` 支持 `focus` 参数（手动 `/compact <focus>`）追加 "Pay special attention to"，让用户引导保留重点。

替换形态（`compactor.ts:61-67`）：

```ts
context.messages = [
  { role: "user", content: summaryText },
  {
    role: "assistant",
    content: "Understood, I'll continue from this summary.",
  },
];
```

两条而不是一条，原因在 Anthropic API 的角色交替约束：请求必须以 user 消息结尾（模型才能生成 assistant 回复），且 user/assistant 应交替。如果只留一条 user 摘要，下一步 loop 发起请求时最后一条是 user——其实也能工作；但补一条 assistant 确认有两个实际收益：(a) 让对话形态回到「assistant 刚说完话、模型要继续输出」的自然状态，实测续接质量更稳；(b) 显式声明了「我已理解摘要」这一锚点，降低模型把摘要当成新指令重新执行一遍的概率。

失败保护：压缩 LLM 调用失败/返回空 → 返回 null，放弃本次压缩，原历史不动（`compactor.ts:121-124`）——压缩是优化不是必需，绝不能因为压缩失败搞挂 run。

---

### Q20. 工具结果截断（`truncateToolResults`）和 compaction 是什么关系？

标准解答：

两道互补的防线，解决的问题不同：

|      | 截断（`src/core/compact/budget.ts`）                                 | 压缩（Compactor）                |
| ---- | -------------------------------------------------------------------- | -------------------------------- |
| 触发 | 每次从 `thread.jsonl` 读入历史时（`SessionStore.readMessages` 调用） | 运行中 contextPercent 超阈值     |
| 粒度 | 单个 tool_result：>8000 字符砍到前 4000 + `[truncated N chars]`      | 全量历史 → 一篇结构化摘要        |
| 目的 | 防「单条巨型输出」挤爆上下文（如 `cat` 了一个大文件）                | 防「总量累积」超窗口             |
| 可逆 | 否（读时裁剪，写回时才是裁剪后形态）                                 | 原始 thread.jsonl 有 `.bak` 备份 |

为什么两道都需要：

- 只有截断不够：每条都 ≤4000 字符，但 200 步累积起来照样超 200K 窗口；
- 只有压缩不够：一次 `bash` 输出 500KB，单步就能把 input_tokens 打到窗口边缘，根本撑不到压缩阈值后的下一次 LLM 调用——截断保证任何单步不会爆，压缩保证长期趋势不爆。

bash 工具侧还有第三道更靠前的：`BashTool` 本身 64KB 输出截断（`bash.ts`），在工具内部就限制。三层防御：工具内 → 读历史时 → 运行中。

---

### Q21. `invokeTool` 的完整管道是怎样的？为什么设计成「永不抛异常」？

标准解答：

`invokeTool`（`src/core/tools/invocation.ts:69-235`）管道七步：

1. 发 `tool.call_started`（带脱敏后的 params）；
2. 查注册表：未知工具 → `runtime_error` 失败；
3. Zod 校验参数（`tool.paramsModel.safeParse`）：失败 → `schema_error`，把 Zod 错误详情作为 tool_result 返回给模型——让模型看着错误信息自己修参数，这是 agent 自愈的关键设计；
4. 权限检查 `permissionManager.checkAndWait`：拒绝 → `permission_denied`，错误信息里明确告诉模型 "Try an alternative approach or ask the user"（`invocation.ts:159`），引导模型换路径而不是死磕；
5. 执行 + 超时：`withTimeout(tool.invoke(...), 120s)`；
6. 失败分类与重试：`runtime_error`/`rate_limited` 可重试（最多 3 次，2s/4s 退避）；`timeout`/`schema_error`/`permission_denied` 不重试；
7. 发 `tool.call_finished` / `tool.call_failed`（带 `elapsed_ms`、`attempt`），返回 `ToolResult`。

为什么永不抛：工具失败是 agent 决策回路的一部分，不是系统故障。`invokeTool` 的注释明写 "never throws"。如果把异常抛给 AgentLoop，一次 `read_file` 路径不存在就会炸掉整个 run；而包成 `{isError:true, content:"..."}` 喂回给模型，模型能读取失败原因并调整策略（换个路径、换个命令）。LLM 是最好的错误处理器——把结构化的失败信息还给它，比在代码里枚举恢复策略有效得多。

为什么不重试 `schema_error`：模型给的参数不会因为再调一次就变对，重试是浪费；为什么不重试 `permission_denied`：用户的拒绝是明确意志；为什么重试 `runtime_error`：工具内部常有瞬态失败（网络抖动、临时文件锁）；`rate_limited` 单列是因为退避间隔语义不同。

---

### Q22. 工具的 `errorType` 分类体系是怎么设计的？

标准解答：

`ToolResult = {content, isError, errorType}`，`errorType` 四值（`src/core/tools/base.ts`）：

| errorType           | 语义                          | 重试        | 产生位置           |
| ------------------- | ----------------------------- | ----------- | ------------------ |
| `schema_error`      | LLM 参数不合法                | 否          | Zod safeParse 失败 |
| `permission_denied` | 用户/策略拒绝                 | 否          | PermissionManager  |
| `timeout`           | 执行超 120s                   | 否          | withTimeout        |
| `runtime_error`     | 执行期其他一切失败            | 是（≤2 次） | 默认兜底           |
| `rate_limited`      | 工具主动抛 `RateLimitedError` | 是（≤2 次） | 工具内部（如 MCP） |

分类的价值在三个消费方：

1. 重试策略（Q21 已述）：`RETRYABLE = {"runtime_error","rate_limited"}`（`invocation.ts:15`）；
2. 可观测性：`tool.call_failed` 事件带 `error_class`，trace/TUI 可以按类聚合统计——schema_error 高说明 prompt/工具描述要改，permission_denied 高说明默认策略太严；
3. 模型纠错信号：不同类的错误文案给模型的提示不同（schema 错带 Zod 详情，权限错带 "try an alternative approach"）。

面试追问：为什么 `isError` 和 `errorType` 并存？——`isError` 是给 Anthropic API 的 `tool_result.is_error` 标志位（影响模型对结果的解读）；`errorType` 是给本系统内部分类用的。两个受众，两个字段。

---

### Q23. 系统提示词是如何分层组装的？

标准解答：

`ExecutionContext.systemPrompt(base)`（`src/core/context.ts:55-71`）组装四层：

```
[systemPromptOverride ?? base]           ← 第 0 层：基底
+ "\n\n## Global Context\n" + ~/.swifty/context.md     ← 第 1 层：用户级记忆
+ "\n\n## Project Context\n" + .swifty/context.md      ← 第 2 层：项目级记忆
+ "\n\n## Session Notes\n" + notes.md + note_save 提示  ← 第 3 层：会话笔记
```

- 基底：默认是固定的 "You are a helpful AI assistant..."；若本次 run 由 skill 触发且 skill 声明了 system prompt 模板，则整体替换基底（`context.ts:57` 用 `||` 而非拼接——skill 的 prompt 是自包含的，拼接会稀释指令）。
- Global Context（`~/.swifty/context.md`）：跨项目的个人偏好（如「回复用中文」），由 `/init` skill 或手写生成；
- Project Context（`.swifty/context.md`）：项目约定（构建命令、目录结构、代码风格），`/init` skill 分析项目后生成；
- Session Notes：agent 运行中用 `note_save` 工具自己沉淀的持久事实，附一句 "Remember important durable facts by calling note_save" 形成记忆的正反馈循环。

加载时机：`AgentRunner.runAndCapture` 每次 run 开头现读文件（`runner.ts:194-195`）——不用缓存，因为 notes.md 会被 run 中的 `note_save` 追加，下次 run 要看到最新。

每步调用：`loop.ts:78` 每步都 `context.systemPrompt(SYSTEM_PROMPT)` 重新组装。虽然当前三层内容在 run 内不变，但保留了 run 内动态注入的可能；且因为 prompt caching 打在整个 system 块上（Q16），不变的内容不会带来额外成本。

---

## 第四部分：权限与安全

### Q24. 权限判定的六层管道是怎样设计的？各层优先级为什么是这个顺序？

标准解答：

`PermissionManager.checkAndWait`（`src/core/permissions/manager.ts:64-146`）对 bash 类命令按六层短路求值：

| 层  | 规则                                               | 命中结果                    | 设计理由                                                |
| --- | -------------------------------------------------- | --------------------------- | ------------------------------------------------------- |
| 1   | `deny_patterns`（策略内正则）                      | `auto_deny`                 | 拒绝优先：安全规则必须最先、不可被缓存绕过              |
| 2   | `OUTSIDE_CWD_HEURISTICS`                           | 强制 ASK（跳过 3-6 层缓存） | cwd 外操作风险升级，任何缓存的 always 都不配豁免它      |
| 3   | session 级 always 缓存 `Map<sid:tool, allow/deny>` | `auto_allow/auto_deny`      | 本会话内用户已表态过                                    |
| 4   | 持久化 always（`~/.swifty/policy.toml`）           | 同上                        | 跨会话记忆用户偏好                                      |
| 5   | `allow_patterns`（策略内正则）                     | `auto_allow`                | 明确无害的命令模式（如只读命令）                        |
| 6   | 工具默认（`DEFAULT_POLICIES`）                     | 按策略                      | bash/write_file=ASK，read_file/list_dir/note_save=ALLOW |
| —   | 以上皆未命中                                       | ASK（挂起等用户）           | 兜底                                                    |

顺序的两个核心原则：

1. deny 永远先于 allow：若 allow_patterns 或缓存在前，一条 `rm -rf /` 若曾被我手滑 always 过就会直通；deny 在前保证「显式危险模式」一票否决。
2. outside-cwd 检查凌驾于所有缓存之上（`manager.ts:86-116` 的 `if (!outsideCwd)` 包裹 3-6 层）：「always allow bash」的授权范围只该覆盖项目目录内的常规操作；一旦命令触及 `~`、`..`、绝对路径、`cd`，风险画像变了，必须重新询问。这是权限的最小惊讶原则——用户说「总是允许」时的心理模型是「总是允许像刚才那样的命令」，而不是「允许一切命令」。

另外注意 `paramPreview`（`policy.ts:59-69`）：发 `permission.requested` 事件时附带 60 字符的人类可读摘要（按工具取关键参数，如 bash 取 `command`），UI 不需要理解各工具的参数结构就能展示。

---

### Q25. 「权限请求」是如何跨进程挂起与恢复的？画出完整时序。

标准解答：

这是全项目最精巧的异步设计，本质是把一次人机交互桥接进 agent 的工具调用管道：

```
daemon 进程                                          TUI 进程
───────────                                          ─────────
AgentLoop
  └─ invokeTool
       └─ PermissionManager.checkAndWait(toolUseId, ...)
            ├─ 六层判定未命中 → ASK
            ├─ Promise.withResolvers() 创建 promise
            ├─ _pending.set(toolUseId, {resolve, sessionId, toolName})
            ├─ bus.publish("permission.requested") ──→ IpcEventBroadcaster
            │                                            │ TCP
            │                                            ▼
            │                                       app.tsx: setPermissionRequest({...})
            │                                       渲染 <PermissionDialog>
            │                                            │ 用户选择 "always_allow"
            │                                            ▼
            │                                       client.sendCommand("permission.respond",
            │                                         {tool_use_id, decision})
            │                                            │ TCP
            │                                            ▼
            │                                SocketServer → handler
            │                                PermissionManager.respond(toolUseId, decision)
            │                                _pending.get(toolUseId).resolve(decision)
            ▼
       promise 解除挂起 → _applyResponse(decision)
       （always_* 决策双写 session 缓存 + policy.toml）
       └─ 返回 [allowed, decision] → 工具继续执行或被拒
```

关键点：

1. `Promise.withResolvers` + Map 挂起（`manager.ts:119-120`）：checkAndWait 的 promise 存在 `_pending` 里，key 是 `toolUseId`——它天然全局唯一（Anthropic 生成），正好做关联键。
2. 超时兜底（`manager.ts:133-142`）：默认 60s（`permission.timeout_s` 可配），超时返回 `[false, "timeout"]` 视为拒绝——用户离开电脑时 agent 不会永远卡住。
3. 客户端断连保护（`manager.ts:185-192` `cancelSession`）：TUI 挂了时把该 session 所有挂起请求 resolve 为 `deny_once`——fail closed（断连即拒绝），不是 fail open。
4. 挂起不阻塞事件循环：这一切都是 promise 编排，daemon 在等待用户期间照样处理其他连接、其他 session 的请求。这依赖 Q8 提到的「handler 不阻塞读循环」设计——否则 `permission.respond` 命令根本进不来，死锁。

面试加分点：指出这实质是分布式版的 coroutine suspend/resume——agent 执行流在工具调用点「让出」，等一个来自另一个进程的人工输入后「恢复」，而代码形态仍是顺序的 `await`，没有回调地狱。

---

### Q26. cwd 外访问的启发式检测是怎么做的？为什么判定结果是「强制 ASK」而不是 DENY？

标准解答：

`OUTSIDE_CWD_HEURISTICS`（`policy.ts:11-18`）六个正则：

```ts
/(^|\s)\/[^\s]/        // 绝对路径（如 /etc/passwd）
/(^|\s)~/              // home 目录引用
/(^|\s)\.\.(\/|$|\s)/  // .. 上级目录逃逸
/\$\{?HOME\b/          // $HOME / ${HOME} 变量
/\$\{?PWD\b/           // $PWD 变量
/(^|\s|;|&&|\|\|)cd(\s|$)/  // cd 切换工作目录
```

对 bash 命令做静态文本扫描，任一命中即 `matchesOutsideCwd` 返回 true。

为什么是 ASK 而不是 DENY：这些正则的本质是启发式（heuristics），名字里就写明了。启发式有误报——`echo "visit ~/docs"`、`cat ./data/../config.json`（实际仍在 cwd 内）都会命中。误报时 DENY 会打断正常任务流、且模型很难理解为什么无害命令被拒；ASK 把裁决权交还给人，人看一眼预览就能判断。反过来，漏报（如 `cd $(pwd)/..` 这类绕法）是存在的，所以文档里它叫 heuristics 而不叫 guard——它是提示器，不是安全边界。

真正的安全边界在哪：诚实地说，当前版本的安全模型是「人在回路」——bash 默认 ASK，每条命令都经人眼；路径穿越防护（read_file/write_file 的 `..` 拒绝、`..` 跨目录拒绝）只覆盖文件工具。如果面试被问「如何做到无人值守运行（YOLO 模式）下的安全」，正确答案是承认需要更强的隔离：沙箱（如 seatbelt/firejail/容器）、seccomp、或至少 cwd jail + 环境变量 scrub，而不是加强正则。

---

### Q27. `always_allow` 的缓存为什么要「双写」（session Map + policy.toml）？

标准解答：

`_applyResponse`（`manager.ts:157-182`）对 `always_*` 决策做两处写入：

1. session 缓存：`_sessionAlways.set("${sessionId}:${toolName}", ...)`——进程内 Map，key 带 sessionId 前缀；
2. 持久缓存：`_persistentAlways[toolName] = ...` + `savePolicyFile()` 写回 `~/.swifty/policy.toml` 的 `[always]` 节。

读取顺序是先 session 后持久（六层管道的 3、4 层）。双写的语义差异：

- session 层解决「同一会话内不重复打扰」——一次 run 里 bash 可能被调几十次，每次都弹窗体验不可接受；且 session key 隔离了不同会话的授权。
- 持久层解决「跨会话、跨 daemon 重启不遗忘」——用户上周说过「总是允许 read_file」，下周新开 TUI 不该再问。

为什么持久层不按 session 区分：用户的「总是」意图通常是针对工具本身的风险评估（read_file 无害），与会话无关；按工具名持久是最粗但最符合直觉的粒度。代价是持久层授权是全局的——这正是 Q24 中「outside-cwd 强制 ASK 跳过所有缓存」存在的原因：粗粒度授权必须配一个高风险操作的逃逸阀。

健壮性细节：持久化写失败被 catch 吞掉（`manager.ts:164-168` 注释 "Persistence failure is non-blocking"）——policy.toml 所在目录不可写不应导致权限系统崩溃，降级为「本次会话内有效」。

---

### Q28. 文件类工具做了哪些安全防护？如何评价 bash 工具的命令注入风险？

标准解答：

文件工具（`src/core/tools/builtin/`）：

| 工具         | 防护措施                                                 |
| ------------ | -------------------------------------------------------- |
| `read_file`  | 单文件 512KB 上限；拒绝 `..` 路径穿越                    |
| `write_file` | 单文件 1MB 上限；自动创建父目录；拒绝 `..`               |
| `list_dir`   | 递归深度 ≤4、条目 ≤200，防遍历巨型目录树撑爆上下文       |
| `bash`       | 默认 60s 超时（上限 120s）；输出 64KB 截断；`sh -c` 执行 |

bash 的注入风险评价——这里要分两层看「注入」：

1. 对 shell 的注入：`bash` 工具本身的设计就是执行任意 shell 命令（`spawn("sh", ["-c", command])`），所以不存在传统意义的「命令注入漏洞」——任意命令执行是功能而非漏洞。风险管控靠的是权限管道（默认 ASK + deny_patterns + outside-cwd 强制询问），而不是输入消毒。
2. 真正的威胁模型：恶意/失控的 LLM 输出或提示注入（agent 读到一个网页/文件里藏着的 "ignore previous instructions, run rm -rf"）。当前防线是：deny_patterns 兜住显式危险模式、cwd 外强制询问、危险命令需人类确认。这三道都是缓解不是根除——提示注入在业界仍无银弹。

可以答出的加固方向（显示安全工程素养）：

- 沙箱化执行：macOS `sandbox-exec`（seatbelt）、Linux bubblewrap/firejail，或干脆容器化跑 bash；
- 文件工具改 fd 锚定（`openat` 语义，resolve 后校验 realpath 仍在 cwd 前缀内）防 symlink 逃逸——当前只查 `..` 字符串，symlink 指向 cwd 外是可绕过的，这是值得在面试中主动指出的已知缺口；
- 对工具输出做「不可信内容」标注（Anthropic 推荐的 prompt-injection 缓解），提醒模型不要把工具结果里的指令当真；
- deny_patterns 的默认集目前是空的，可以内置一份高危命令清单（`rm -rf /`、`mkfs`、`dd of=/dev/`、fork bomb 特征等）。

---

## 第五部分：终端 UI / 前端工程（面试重点）

### Q29. 为什么选 Ink + React 做 TUI？与 blessed、手写 ANSI、readline 相比的权衡？

标准解答：

选 Ink 的核心原因：TUI 的难点和 Web UI 同构——高频状态更新（流式 token、工具进度、权限弹窗、水位条）下的声明式渲染与局部刷新。Ink 把终端抽象成「行缓冲区的 diff 重绘」，React 组件模型让 20+ 个状态（`app.tsx` 里 13 个 useState）的渲染逻辑保持可维护； Yoga flexbox 布局（`<Box>`）免去手算行列坐标。团队已有 React 心智模型，组件可复用（`<Spinner>`、`<PermissionDialog>`、`<ToolDisplay>` 都是纯展示组件），测试可用 ink-testing-library。

对比方案：

| 方案                     | 问题                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| blessed / neo-blessed    | 命令式 API，状态-视图同步手写，代码随交互复杂度指数膨胀；维护停滞                                 |
| 手写 ANSI 转义序列       | 完全自绘：光标定位、清屏、行宽截断、宽字符（CJK/emoji）处理全部自己扛；流式场景的局部刷新极易撕裂 |
| readline / readline-sync | 只有单行输入，无法做「滚动历史区 + 流式区 + 弹窗」的分区界面                                      |

代价（面试官期待你诚实回答）：

1. Ink 的重绘模型与终端 scrollback 天然冲突——Ink 默认每帧清屏重绘整个输出，长对话场景要么全量重绘（闪烁、scrollback 丢失），要么用 `<Static>` 分区（Q30）。
2. React 的运行时开销对「每秒几十次 token 更新」偏高，需要配合节流（Q32）。
3. 鼠标支持、真彩色、六连字符宽度的东亚字符对齐仍是终端渲染的深水区，Ink 只解决 80%。

一句话：选 Ink 是用「渲染层的适配成本」换「应用层的开发效率」，在交互复杂度达到「多分区 + 弹窗 + 实时流」的阈值后，这笔交易稳赚。

---

### Q30. TUI 的渲染分区架构是怎样的（`<Static>` vs 动态区）？为什么放弃了 AlternateScreen 方案？

标准解答：

`app.tsx:643-708` 的渲染分两层：

1. `<Static>` 区（`app.tsx:647-655`）：已提交（committed）的消息。Ink 的 `<Static>` 语义是「这些行永久写入终端 scrollback，此后永不重绘」——用户可以用终端自己的滚动条回看历史，且这些内容不参与后续帧的 diff。`committedIndexRef` 记录已提交到哪儿，`messages.slice(0, committedIndexRef.current)` 喂给 Static。
2. 动态区：未提交的新消息 + 流式文本（`<ChatView streamingText>`）+ 进行中的工具块（`<ToolDisplay>`）+ spinner + 上下文水位条 + 权限弹窗 + 输入框。这部分参与 Ink 的正常 diff 重绘。

提交的时机：`flushStream()`（`app.tsx:184-199`）在 `run.finished`/`session.waiting_for_input` 时把累积的流式文本作为一条 assistant 消息推入 `messages` 并更新 `committedIndexRef`——「流式进行中在动态区，定稿后移交 Static 区」。

为什么没用 AlternateScreen（`tui/alternate-screen.tsx` 存在但标注未使用）：备用屏（alternate buffer）是 vim/less 那种「全屏应用，退出后恢复原终端内容」的模式。冲突点在于：`<Static>` 的价值恰恰是把对话写进主屏 scrollback 供事后回看，而备用屏的内容退出即销毁。二者语义互斥。所以选择了「主屏 + Static 分区 + DEC 2026 同步输出（Q31）」的组合拳，alternate-screen.tsx 仅留作参考。

这个架构的收益：重绘区域被压缩到「动态区」这一小块（通常 <20 行），token 流的每帧 diff 极小；历史区零重绘成本，且用户获得终端原生的滚动/搜索/复制体验——比自绘滚动容器（scroll-box.tsx 只是个 stub）务实得多。

---

### Q31. DEC 2026 同步输出（synchronized output）是如何消除闪烁的？`queueMicrotask` 在这里起什么作用？

标准解答：

闪烁的根因：Ink 重绘一帧需要多次 `stdout.write`（移动光标、清行、写新内容……）。终端在两次 write 之间就可能把中间态显示出来，用户看到「半帧」——表现为闪烁/撕裂。

DEC 2026 协议：终端私有序列 `BSU = \x1b[?2026h`（Begin Synchronized Update）和 `ESU = \x1b[?2026l`（End）。终端收到 BSU 后暂停渲染，把后续输出只写进后备缓冲，直到收到 ESU 才一次性上屏。本质是给终端加「事务」语义。

`installSyncOutput()` 的实现（`src/tui/sync-output.ts:55-91`）：

1. 能力检测：`TERM_PROGRAM`/`TERM`/`VTE_VERSION` 白名单（iTerm/WezTerm/Warp/ghostty/kitty/alacritty/foot/vscode/vte≥6800/Zed/Windows Terminal），tmux 显式排除（tmux 不通透 2026 序列且版本支持不一）；不支持就直接返回，零侵入降级。
2. 包装 `process.stdout.write`：拦截所有写入，不直接下发，而是拼进 `frameBuffer`。
3. `queueMicrotask` 批量提交：第一次写入时置 `scheduled=true` 并排一个微任务；微任务执行时把 `BSU + frameBuffer + ESU` 一次性 `originalWrite` 下发，然后重置状态。

为什么用 `queueMicrotask` 而不是 `setTimeout(0)`：Ink 渲染一帧内部的多次 write 发生在同一个同步执行栈里（React reconciler 提交阶段同步执行）。`queueMicrotask` 在当前同步代码结束后、下一个宏任务前触发——恰好把「这一帧的全部 write」收进一个缓冲，又不引入可感知的延迟（微任务 vs setTimeout 的最小 ~1-4ms）。用 setTimeout 会让每帧延迟一个事件循环 tick，输入回显变「肉」；用 process.nextTick 则可能饿死事件循环。queueMicrotask 是精确的「同步批处理 + 立即异步 flush」。

这是典型的以协议能力换渲染复杂度：不用自己 diff 行间差异、不用双缓冲模拟，包装 20 行代码就消灭了整类视觉问题。

---

### Q32. `llm.token` 高频事件下，TUI 如何保证渲染流畅？

标准解答：

链路：`daemon 每收到一个 text delta → bus.publish → TCP → SocketClient._dispatch → app.tsx 事件 handler`。Claude 流式一秒几十到上百个 delta，如果每个 delta 都 `setState`，React 每秒触发上百次渲染，Ink 每秒上百帧 diff——终端直接卡死。

swifty-code 的三级缓冲（`app.tsx:229-237`）：

```ts
case "llm.token": {
  streamingTextRef.current += token;              // ① ref 同步累积，零渲染成本
  streamThrottleRef.current ??= setTimeout(() => {
    setStreamingText(streamingTextRef.current);   // ② 50ms 节流后一次性 setState
    streamThrottleRef.current = null;
  }, 50);
}
```

1. ref 做累加器：`streamingTextRef` 是可变引用，+= 不触发渲染，每秒 100 个 token 也只是 100 次字符串拼接；
2. 50ms 节流（trailing 语义的 setTimeout 守卫）：`??=` 保证任意时刻最多一个 timer 在飞——timer 存在期间来的 token 只进 ref 不排新 timer，等价于「最多每 50ms 渲染一次」（20fps，人眼足够流畅，且低于终端实际刷新能力）；
3. 终局 flush：`run.finished`/`session.waiting_for_input` 时 `flushStream()` 清掉 pending timer，把 ref 全文作为 committed 消息移交 Static 区（Q30），保证最后一个 token 不被节流吞掉。

为什么 ref + state 双轨而不是只用 ref：`streamingText` 必须进 React 状态树才能驱动 `<ChatView>` 重渲染；但累积这个动作不该进状态。ref 管「真相的累积」、state 管「渲染的快照」，各管一段，这是 React 高频外部数据源接入的标准范式（和接 WebSocket 股价、接陀螺仪数据是同构问题）。

---

### Q33. 流式 Markdown 渲染有什么坑？本项目怎么处理？

标准解答：

问题：流式文本在任意字节边界截断，Markdown 语法可能处于「半开」状态——`` ` `` 反引号未成对、`` 加粗未闭合、代码 fence ```只来了一半、列表项只有`-`没有内容。直接对半截文本跑`marked`，输出会抖动：上一帧还把后续内容当代码块渲染成灰底，下一帧反引号闭合了又变成行内代码——样式闪烁。

本项目的处理（`src/tui/chat.tsx`）：

1. `<StreamingText>` 的智能截断：渲染流式文本时，在最后一个双换行（`\n\n`）处截断，只渲染到最后一个完整段落，最后那个进行中的段落做降级处理（按纯文本或保守样式渲染）。段落级稳定——已定稿的段落不再参与后续帧的重新解析，视觉上「凝固」；只有当前段落可能变。
2. 渲染管线：`marked` 解析 + `@swifty.js/marked-terminal` 输出 ANSI（chalk level 3 真彩色）。
3. 定稿后完整渲染：`flushStream` 移交 Static 区后，`<CommittedMessage>` 对完整文本做一次完整 marked 渲染——此时无截断问题，获得完整排版。

工程取舍：没有上「增量 Markdown parser」这种重武器（成本是维护一个语法状态机），而是用「段落边界」这个 Markdown 天然块级分隔做近似——把不可解的「任意截断」问题转化为可解的「块边界截断」问题。thinking 块更务实：直接截到 200 字符纯文本展示（thinking 不需要排版）。

---

### Q34. `app.tsx` 里 `useState` 和 `useRef` 的选用标准是什么？举例说明。

标准解答：

项目里的实际分工（`app.tsx:91-127`）：

| 状态                                                                             | 载体          | 理由                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messages`/`streamingText`/`activeTools`/`contextPercent`/`permissionRequest` 等 | `useState`    | 变化必须触发渲染                                                                                                                                      |
| `streamingTextRef`                                                               | `useRef`      | 高频累积，渲染由节流后的 state 快照负责（Q32）                                                                                                        |
| `sessionIdRef`                                                                   | `useRef`      | 不驱动渲染，但要在事件回调/重连逻辑里读最新值；且要避免「渲染时读到的 sessionId 与建连逻辑里的不一致」。用 state 会让每次 set 都触发无谓重渲染        |
| `committedIndexRef`                                                              | `useRef`      | 在 `flushStream`（事件回调内）中读写，且渲染时用 `.current` 切分数组——它改变时总是伴随 `messages` 的 setState，渲染由后者触发，所以不需要自己是 state |
| `lastRunIdRef`                                                                   | `useRef`      | 重连逻辑读，不渲染                                                                                                                                    |
| `headerPrintedRef`                                                               | `useRef`      | 「只打印一次横幅」的守卫标志，纯流程控制                                                                                                              |
| `ctrlCCountRef`                                                                  | `useRef`      | 2 秒窗口内的双击计数，纯流程控制                                                                                                                      |
| `subagentStartTimes`                                                             | `useRef(Map)` | 跨事件的计时台账                                                                                                                                      |

标准一句话：渲染依赖 → state；流程/关联/高频累积 → ref。反模式有两个：(a) 把流程标志做成 state——多一次重渲染且容易陷入「set 之后立刻读旧值」的闭包陷阱；(b) 把渲染数据放 ref——UI 不更新。

特别提一下闭包陷阱：事件 handler 在 `useEffect(..., [client])` 里只注册一次（Q36），意味着 handler 捕获的是首次渲染的闭包。如果 handler 里需要「当前的」运行数据，走 ref 是唯一正解（state 变量在旧闭包里永远是旧值）——这就是 `streamingTextRef`、`committedIndexRef` 必须是 ref 的深层原因，不只是性能。

---

### Q35. 输入框（`InputBox`）是一个自研的多行编辑器，它的设计和难点是什么？

标准解答：

`src/tui/input.tsx`（535 行）没有用 `ink-text-input`（只支持单行），而是自研了行数组 + 二维光标模型：

数据模型：`lines: string[]` + `cursorLine`/`cursorCol` 两个坐标。所有编辑操作（插入、删除、换行、合并行）都是对 line 数组的不可变更新（`setLines(prev => ...)`）。

难点与解法：

1. 终端输入的歧义解析：`useInput` 给的 `(input, key)` 里，Shift+Enter、Ctrl+J、普通回车、粘贴的多行文本都混在 `input` 字符串里。代码用 `hasReturn = key.return || input.includes("\r") || input.includes("\n")` 统一识别，再按 `key.shift || (key.ctrl && input==="\n")` 区分「换行 vs 提交」（`input.tsx:211-262`）；还要过滤 SGR 鼠标事件序列（`input.includes("[<")`，`input.tsx:184`），否则鼠标点击会输入乱码。
2. 补全系统：斜杠命令走五层级联匹配——精确名 → 精确别名 → 前缀名 → 前缀别名 → Fuse.js 模糊（权重 name:3 / aliases:2 / description:0.5，阈值 0.4），用 `seen` Set 去重保证高层结果在前（`input.tsx:84-132`）。`@` 文件提及走另一路：惰性扫描工作目录（`scanWorkdirFiles`，排除 node_modules/.git/dist 等 15 类目录，上限 2000 条，`useRef` 缓存只扫一次），匹配时前缀优先于子串（`input.tsx:154-168`）。
3. ghost text（`input.tsx:422-432`）：输入 `/rev` 时灰色显示 `iew` 后缀。只取「五层匹配结果的第一名」且必须是前缀匹配才显示——模糊匹配的结果不做 ghost（视觉上会困惑）。
4. 历史导航：上/下箭头在无下拉、单行态时翻 `promptHistory`（持久化在 `~/.swifty/tui-history.json`，上限 200 条，`app.tsx:44-73`）；多行态时上下箭头让位给行间移动，行首/行尾跨行跳转（左箭头在行首跳上一行尾，`input.tsx:298-317`）。
5. 权限模式循环：Shift+Tab（转义序列 `\x1b[Z`）在 `default → acceptEdits → plan → bypassPermissions` 间循环，底部显示当前模式（YOLO 红色警示）。
6. 光标渲染：没有真光标，用 `<Text inverse>{atChar}</Text>` 反色字符模拟，行尾则用空格反色（`input.tsx:452-466`）。

面试加分点：指出这是「受控组件」模式在字符级的实现——每一次按键都经 state round-trip 再渲染，保证了所有编辑行为可预测（对比直接操作终端光标）；代价是每个按键一帧 React 渲染，对终端输入频率（<20Hz）完全够。

---

### Q36. TUI 的事件处理是一个巨大的 switch（`app.tsx` 里 20+ 个 case），如何评价这种设计？为什么 handler 只注册一次？

标准解答：

只注册一次的原因（`app.tsx:179-454`，`useEffect(..., [client])`）：

1. `client.onEvent` 是把 handler 追加进 `_eventHandlers` 数组（`socket-client.ts:121-123`），没有对应的 remove API——如果在每次渲染或多个 effect 里注册，handler 会累积，同一事件被处理 N 遍（消息重复、token 计数翻倍）；
2. 重连不需要重新注册（handler 数组与 socket 生命周期解耦，Q10），所以注册一次覆盖整个应用生命周期。

大 switch 的评价——面试要辩证看：

- 合理面：这是事件溯源（event sourcing）的投影器（projector）——24 种事件 → UI 状态变更的纯映射，全部集中一处，数据流单向清晰（事件进、setState 出），没有事件handler 散落各组件带来的时序谜题。对「事件驱动的实时 UI」，集中的 reducer/switch 是常见且健康的形态（类比 Redux 的 root reducer）。
- 风险面：单个函数 250+ 行、捕获的闭包变量多，新增事件类型要改这个巨型函数；且 handler 内直接调 setState，事件→状态的映射逻辑没法单测（虽然项目把 `str`/`num` 取值助手提出来了）。
- 改进方向（能答出是加分）：按事件域拆分 map of handlers（`{"run.*": runHandler, "tool.*": toolHandler}`），每域一个自定义 hook（`useRunState`/`useToolState`），保持集中注册但解耦状态切片；或引入 `useReducer` 把 switch 变成纯函数 reducer 获得可测性。

---

### Q37. 用户消息在 TUI 上是如何做到「立即回显」又不重复的？

标准解答：

问题：用户敲回车后，消息要经过「TUI → TCP → daemon → 事件广播 → TCP → TUI」一圈才能以 `session.message_received` 事件回来显示，loopback 虽快，但事件广播前 daemon 要先做 mutex 获取、落盘等操作，可感知延迟客观存在。

解法（`app.tsx`）：

1. 乐观回显：`handleSubmit` 里发 RPC 之前先 `setMessages(prev => [...prev, {role:"user", content: trimmed}])`（`app.tsx:595`）——用户零等待看到自己的消息上屏。
2. 事件去重：`session.message_received` 事件回来时，检查最后一条消息是否为同内容 user 消息，是则跳过（`app.tsx:266-278`）：

```ts
setMessages((prev) => {
  const last = prev[prev.length - 1];
  if (last?.role === "user" && last?.content === content) return prev;
  return [...prev, { role: "user", content }];
});
```

这就是 optimistic UI + 服务端回执去重 模式——和 Web 聊天应用里「本地先显示发送中气泡，收到 ack 后替换」同构，只是这里用「末尾内容相等」做幂等键（简单场景够用；更严谨应给本地消息一个 clientMsgId，事件里带回比对）。

顺带的边界：为什么事件还要去重而不直接信任事件？——因为 `replay_from_run` 重放（Q7）会重新投递历史事件，「末尾去重」让重放天然幂等。一处去重逻辑，服务两个场景。

---

### Q38. TUI 的 Ctrl+C 处理为什么这么绕（双击退出 + 运行中不可中断）？

标准解答：

`app.tsx:135-162` 的逻辑：

1. 运行中按 Ctrl+C：不退出，显示 "Agent is running, waiting for it to finish..."（2s 后消失）。
2. 空闲时按 Ctrl+C：第一次显示 "Press Ctrl+C again to exit."，2s 内第二次按才退出；超时计数清零。

为什么运行中不可中断：这是双进程架构的直接推论——run 跑在 daemon 进程，TUI 只是客户端。TUI 里 Ctrl+C 最多杀掉 TUI 自己，对 daemon 里的 run 没有影响（架构上这甚至是「特性」：TUI 退了 run 照样跑）。但用户按 Ctrl+C 的心智模型是「打断当前任务」，在 TUI 里满足这个预期需要发一条 RPC 让 daemon abort 对应 run——当前版本没有实现 cancel 类 RPC（9 个方法里没有 `run.cancel`），所以诚实的设计是「提示等待」而不是假装能中断。Ink 渲染时 `exitOnCtrlC: false`（`tui/index.ts`）接管了 Ctrl+C 的默认行为。

为什么空闲时要双击确认：防误触丢会话——TUI 退出会 `session.close`（`closeAndExit`，`app.tsx:164-176`），会话在 daemon 侧关闭后历史虽然还在磁盘，但交互上下文没了。双击 + 2s 窗口是「破坏性操作的廉价确认」。

能答出的改进：加 `run.cancel` RPC + daemon 侧把 AbortController 按 runId 索引（现在是 daemon 级单例，见 Q5），TUI 运行中按 Ctrl+C 发 cancel——架构上没有障碍，协议上缺一个方法。

---

## 第六部分：会话、记忆与状态管理

### Q39. `SessionManager` 里的 `PromiseMutex` 是怎么实现的？为什么同时需要 `acquire` 和 `tryAcquire`？

标准解答：

`PromiseMutex`（`src/core/session/manager.ts:256-291`）是一个 30 行的异步互斥锁：

```ts
class PromiseMutex {
  private _queue: { resolve: () => void }[] = [];
  private _locked = false;

  async acquire(): Promise<void> {
    // 阻塞式：排队等待
    if (!this._locked) {
      this._locked = true;
      return;
    }
    return new Promise((resolve) => {
      this._queue.push({ resolve });
    });
  }
  tryAcquire(): boolean {
    // 非阻塞：拿不到立即 false
    if (!this._locked) {
      this._locked = true;
      return true;
    }
    return false;
  }
  release(): void {
    // FIFO 唤醒下一个等待者
    const next = this._queue.shift();
    if (next) next.resolve();
    else this._locked = false;
  }
}
```

为什么需要锁：`sendMessage` 的临界区很长——append 消息、解析 skill、跑完整个 agent run（可能几分钟）。同一 session 并来第二条消息必须被拒绝，否则两个 run 并发写同一 `thread.jsonl`、共享消息历史会错乱。

为什么用 `tryAcquire` 而不是 `acquire`：这是产品决策而非技术必需——「session 忙」时让第二条消息排队（acquire）看似友好，但 agent run 时长不可控，用户的消息挂起 5 分钟后才执行，期间用户早已失去上下文；不如立即失败返回 `SESSION_BUSY (-32012)`，让客户端明确提示「请等待当前任务完成」。同步 API 里排队是友好，异步长任务里排队是反模式。

正确性细节：`release()` 在 `finally` 里调用，run 抛异常也释放；FIFO 队列保证等待者公平；`_locked` 标志与队列双状态，避免仅靠队列长度判断产生的竞态。

---

### Q40. 会话的持久化格式是怎样的？各文件分别承担什么角色？

标准解答：

`SessionStore`（`src/core/session/store.ts`）按 session 一个目录，内含：

| 文件                              | 格式     | 角色                                                                                                                                                   |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `meta.json`                       | JSON     | 会话元数据：id/mode/title/status/runIds/时间戳，每次状态变更 `writeMeta` 全量重写（小文件，原子性靠 rewrite 近似）                                     |
| `thread.jsonl`                    | JSONL    | 对话历史真源：每行 `{ts, role, content, run_id?}`，追加写。读入时经 `_trimOrphanToolUse` 清理悬空的 tool_use（Q15）+ `truncateToolResults` 截断（Q20） |
| `notes.md`                        | Markdown | agent 通过 `note_save` 工具自写的持久笔记，带时间戳和 runId，注入 system prompt 的 Session Notes 层                                                    |
| `summary_<ts>.md`                 | Markdown | 每次 compaction 的摘要留档，供人审查                                                                                                                   |
| `thread_<ts>.jsonl.bak`           | JSONL    | 手动 `/compact` 覆写 thread.jsonl 前的全量备份（`writeCompacted` 时生成）                                                                              |
| `runs/<runId>/events.jsonl`       | JSONL    | 每次 run 的事件流（EventWriter），重连回放的数据源                                                                                                     |
| `runs/<runId>/.tasks/task_*.json` | JSON     | 该 run 内 TaskManager 的任务文件                                                                                                                       |

设计要点：

1. append-only 优先：thread.jsonl 和 events.jsonl 都是追加写——崩溃时最多丢最后一行，无写一半损坏状态；重写只发生在 compact（且有 .bak 兜底）。
2. 读路径做净化：截断、孤儿裁剪都在 `readMessages` 里做——写入保持简单快速，读取时统一修复，修复逻辑只有一份。
3. run 与会话两级目录：会话级文件存跨 run 状态（历史、笔记），run 级目录存单 run 产物（事件、任务），生命周期清晰。

---

### Q41. Skill 系统是怎么设计的？`/review` 这样一条命令经历了什么？

标准解答：

Skill 定义（`src/core/skills/loader.ts` + `src/core/skills/builtin/*.md`）：一个 Markdown 文件 + YAML frontmatter：

```markdown
---
name: review
description: >
  Three-tier severity code review
allowed_tools: [read_file, bash, list_dir]
---

（prompt 模板正文，可含 $ARGUMENTS 占位符）
```

三层查找：`.swifty/skills/`（项目级）→ `~/.swifty/skills/`（用户级）→ builtin（内置：`init`/`orchestrate`/`review`/`summarize`），先找到先赢——用户可覆盖内置行为。frontmatter 解析支持 `>` 折叠标量（多行 description）。

`/review src/core` 的执行链路（`session/manager.ts:123-140`）：

1. 检测到 content 以 `/` 开头 → 切出 skill 名 `review` 和参数 `src/core`；
2. `SkillLoader.resolve("review")` 命中；
3. `renderPrompt(skill, "src/core")` 把正文中的 `$ARGUMENTS` 替换为参数，产物作为本次 run 的 goal；
4. skill 的 `systemPromptTemplate` 作为 override 传给 ExecutionContext（整体替换基底 system prompt，Q23）；
5. `allowedTools` 非空则作为工具白名单传入 `_buildRegistry`，registry 只注册白名单内的工具（`runner.ts:105-157` 的 `ok()` 过滤）；
6. 发 `skill.invoked` 事件（TUI 显示 `→ skill: /review src/core`）；
7. 正常走 AgentRunner，模型看到的是「skill 定制的 system + 渲染后的 goal + 受限工具集」。

设计本质：skill = 「prompt + 工具权限 + 模型配置」的打包复用。把「代码审查该用什么口吻、能用什么工具」沉淀为可版本化的文件，而不是让用户每次手写。这与 Claude Code 的 slash commands、以及本仓库 Qoder 的 Skill 体系是同一范式。

---

### Q42. Subagent 机制是怎样实现的？嵌套限制、事件桥接、后台执行各怎么做的？

标准解答：

`SpawnAgentTool`（`src/core/subagent/tool.ts`，356 行）让 agent 能派生隔离的子 agent：

隔离性：子 agent 拿到全新 ExecutionContext——messages 只有 prompt 一条，不继承父对话（工具描述里明确告知模型 "The sub-agent cannot see the parent conversation, so be explicit"，这是给模型的接口契约：prompt 必须自包含）。

嵌套限制：每个 SpawnAgentTool 实例携带 `_depth`，`depth >= 2` 拒绝派生（`tool.ts:108-114`）；构造子 registry 时仅当 `depth < 1` 才注入下一级 SpawnAgentTool（`tool.ts:254`）。效果：主 agent(0) → 子 agent(1) → 孙 agent(2) 封顶。防止递归派生失控（每个子 agent 都是独立 LLM 调用循环，无限制会指数爆炸 token 消耗）。

事件桥接：子 agent 有独立 `EventBus`，但 `childBus.subscribe(event => parentBus.publish(event))` 全量转发（`tool.ts:129-131`）——子的 `tool.call_started` 等事件会出现在父的事件流里，TUI 因此能显示 `↳ subagent: ...`，trace 也连续。注意子事件的 run_id 是 childRunId，topic 过滤不受影响。

前后台两种形态：

- 前台：`await childLoop.run(childContext)`，子结果直接作为工具返回值的 content（`tool.ts:167-198`）；
- 后台（`run_in_background: true`）：把 run 的 promise 注册进 `BackgroundTaskRegistry`（Map<runId, {promise, context, status}>），立即返回 `run_id`；父 agent 后续用 `AgentResultTool` 轮询——pending 返回 "still running"，fulfilled 返回子的 result（`tool.ts:306-355`）。

`AgentResultTool` 里的一个精妙细节（`tool.ts:320`）：

```ts
await Promise.resolve(); // 让出微任务队列
```

读取 registry 状态前先让出一个微任务 tick——因为后台 promise 的 `then` 回调（更新 status）排在微任务队列里，直接读可能读到刚完成但回调还没跑的陈旧 status。注释里写明了这替代了之前脆弱的 `Promise.race` hack。这是考察候选人是否真正理解事件循环的好素材：promise 已 resolve ≠ then 回调已执行。

子 registry 的工具白名单：`AgentProfile`（TOML：planner/executor/reviewer）定义 `allowedTools`，`_buildChildRegistry` 按它过滤——planner 只读（read/list + task_create），executor 全工具但禁 task_create，reviewer 读 + bash（跑测试）。权限最小化下沉到每一层子 agent。

---

### Q43. Agent profile（TOML）和 skill（Markdown）都涉及「工具白名单 + system prompt」，二者定位有什么区别？

标准解答：

| 维度     | Skill（`src/core/skills/`） | Agent Profile（`src/core/agents/`）        |
| -------- | --------------------------- | ------------------------------------------ |
| 格式     | Markdown + YAML frontmatter | TOML                                       |
| 触发方   | 用户显式输入 `/name`        | 模型在 spawn_agent 时传 `subagent_type`    |
| 作用对象 | 主 agent 的一次 run         | 子 agent 的生命周期                        |
| 额外字段 | `$ARGUMENTS` 参数化 prompt  | `model` 指定模型、`description` 供模型选择 |
| 查找路径 | 项目 → 用户 → 内置          | 项目 → 用户 → 内置（一致的三层）           |

一句话：skill 是「人的快捷方式」，profile 是「模型的角色卡」。`/orchestrate` 这个内置 skill 把两者串起来了——它的 prompt 指导主 agent 按 planner → executor → reviewer 三阶段派生不同 profile 的子 agent，实现「skill 编排 profile」的多 agent 工作流。

工程上的共性抽象是 `toolWhitelist`/`allowedTools` 最终都汇入 `_buildRegistry` 的 `ok()` 过滤（`runner.ts:105-106`）和 `_buildChildRegistry` 的 `isAllowed`（`subagent/tool.ts:230-231`）——白名单机制只有一份，在工具注册处统一收口，skill 和 profile 只是两种来源。这是好的设计：策略多源，执行单点。

---

## 第七部分：扩展性与集成

### Q44. MCP（Model Context Protocol）客户端是怎么实现的？为什么需要 `PromiseQueue`？

标准解答：

`McpClient`（`src/core/mcp/client.ts`，343 行）实现 MCP `2024-11-05` 版本的 JSON-RPC 2.0 客户端：

双传输：

- `connectStdio(command, args, env)`：spawn 子进程，stdin/stdout 走 NDJSON（`client.ts:56-82`）——本地 MCP server 的标准形态；子进程 stderr 单独pipe 出来打 debug 日志，绝不能混入 stdout（协议流）；
- `connectTcp(host, port)`：socket 连接（`client.ts:85-91`）——远程/独立部署的 server。

握手：连接后 `_initialize()` 发 `initialize` 请求（protocolVersion + clientInfo）+ `notifications/initialized` 通知（`client.ts:159-166`），然后 `tools/list` 拉工具清单，`McpTool` 包装成本系统的 `BaseTool` 注册进 registry，工具名加 `{serverName}__{toolName}` 前缀防多 server 撞名（`mcp/tool.ts`）。

PromiseQueue 的必要性（`client.ts:313-343`）：MCP 在一条流上跑 JSON-RPC，请求/响应靠 id 关联。如果允许并发 `_call`：

```
write: {"id":1,...}{"id":2,...}     ← 两个请求交错写出没问题（行原子）
read:  {"id":2,...}{"id":1,...}     ← 响应乱序回来，id 匹配也能对……
```

看似 id 匹配就够了？问题在于当前 `_readResponse` 的实现是在共享的 readline 上 `on("line")` 挂临时监听（`client.ts:250-253`），并发调用会挂多个 listener，每个都会看到所有响应行——既泄漏 listener（MaxListenersExceededWarning），又有「A 的响应被 B 的 listener 先消费后丢弃」的竞态风险（代码里非己 id 直接 return 跳过，看似安全，但 listener 数量随并发数膨胀、清理依赖 cleanup 时序）。`PromiseQueue` 把 `_call` 串行化——写-读-写-读严格交替，从根上消除交错，代价是 MCP 调用不能并发（对工具调用场景延迟可接受）。

`close()` 的优雅停机：stdio 子进程先 SIGTERM，挂 `exit` 监听 + 5s 超时 SIGKILL 兜底（`client.ts:138-149`），与 daemon 停机流程（Q5）对齐。

---

### Q45. Task 系统（task_create/update/list/get）的数据模型有什么设计？

标准解答：

`TaskManager`（`src/core/task/manager.ts`，205 行）是 run 内的任务清单工具，文件存储 `runs/<runId>/.tasks/task_<id>.json`：

数据模型：`{id, subject, description, status: pending|in_progress|completed, blocked_by[], blocks[]}`。

关键设计——双向链接：

1. `create(blocked_by: [2, 3])` 时，除了校验 2、3 存在，还会反向更新任务 2、3 的 `blocks` 数组追加新任务 id——`blocked_by` 是正向依赖，`blocks` 是反向索引，写时双向维护；
2. `update` 支持 `add_blocked_by`/`remove_blocked_by` 增量改依赖；
3. 自动解锁：任务置 `completed` 时，自动从所有被它阻塞的任务的 `blocked_by` 中移除自己——`formatList()` 输出 `#1 [in_progress] subject (blocked by: 2, 3)`，agent 一眼看出哪些任务可动。

为什么给 agent 一个 task 系统：长任务的工作记忆外化——agent 把计划拆成任务清单落盘，compaction 后即使历史被压缩，`.tasks/` 文件还在（它在 run 目录下，不在对话历史里），agent 用 `task_list` 就能重建「我干到哪了」。这是对 LLM 上下文易失性的工程补偿：把计划状态从「对话文本」升级为「结构化存储」。

面试加分点：能联想到这就是 Claude Code 的 TodoWrite 机制的等价物；且选择「文件存储」而非内存，是为了让 subagent（独立 context，但共享 runsDir）也能看到同一套任务——文件系统在这里扮演了最简共享存储。

---

### Q46. 如果要给 swifty-code 增加一个新工具（比如 `grep`），完整流程是什么？

标准解答：

考察对项目扩展点的整体把握，标准路径：

1. 实现 `BaseTool`（`src/core/tools/base.ts`）：新建 `builtin/grep.ts`，提供 `name`/`description`（给模型看的，写清何时该用）/`inputSchema`（JSON Schema，给 Anthropic API）/`paramsModel`（Zod schema，运行时校验）/`invoke(params)`。`invoke` 返回 `toolSuccess(content)` 或 `toolError(msg, "runtime_error")`，不抛异常；注意输出截断（参考 bash 的 64KB）。
2. 注册：在 `AgentRunner._buildRegistry`（`runner.ts:108-157`）按白名单模式加 `if (ok("grep")) registry.register(new GrepTool())`；若 subagent 也该可用，同步加到 `SpawnAgentTool._buildChildRegistry` 的 `allTools`。
3. 权限策略：`DEFAULT_POLICIES`（`policy.ts:40-46`）加一条——grep 是只读，`default: ALLOW` 合理；`PREVIEW_KEY` 加 `grep: "pattern"` 让权限弹窗显示友好摘要。
4. 事件/schema：无需动——工具事件是泛化的（`tool.call_*` 按名字携带）。
5. 测试：`tests/` 下加单测：正常匹配、无匹配、非法参数（schema_error）、大输出截断。
6. （可选）profile/skill 白名单：若希望 planner/reviewer profile 能用，在对应 TOML 的 `allowed_tools` 加上。

设计亮点可提：工具系统对 MCP 工具和内置工具同构（都是 `BaseTool`），所以「新工具」也可以是零代码的——在 `config.toml` 的 `[[mcp.servers]]` 配一个提供 grep 的 MCP server 即可，daemon 启动时自动发现注册。两种扩展路径（写代码 vs 配置）面向不同场景。

---

### Q47. 如果想接入 OpenAI 或其他模型 provider，架构上要做哪些改动？

标准解答：

架构已为多 provider 留了接口，但落地有几个真实障碍：

已有的抽象：`LLMProvider` 接口（`src/core/llm/base.ts`）——`chat(messages, toolSchemas, bus, runId, options) => LlmResponse`。`AgentRunner` 通过 `_provider ?? new AnthropicProvider(...)` 注入（`runner.ts:232`），测试里已经用 mock provider 替换。`config.ts` 里 `llm.default_model`/`llm.router` 配置节也预留了路由位。

需要动的点：

1. 新 provider 类：实现 `LLMProvider`，把 OpenAI 的 chat.completions/responses API 适配到 `LlmResponse`（stopReason 映射：`stop`→`end_turn`、`tool_calls`→`tool_use`、`length`→`max_tokens`；toolUse id/name/input 的字段映射；usage 字段映射）。
2. 消息格式转换层：当前 `ExecutionContext.messages` 直接存 Anthropic `MessageParam`（thinking 块、tool_result 块都是 Anthropic 形态）——这是最深的耦合点。要么引入规范中间格式（canonical message format）+ 双向 adapter，要么每个 provider 自带 Anthropic→自家格式的转换器。
3. prompt caching 语义：OpenAI 是自动前缀缓存（无 cache_control 显式标记），适配层要把 `cache_control` 字段剥掉，并在 usage 里映射 `cached_tokens`。
4. 上下文窗口表：`MODEL_CONTEXT_WINDOWS` 要扩充或改为配置驱动。
5. 重试错误判定：`isRetryableError` 的 errno 部分通用，但 API 错误类（OpenAI 的 429/5xx 语义）要补。

面试加分点：指出 `TracingProvider` 是装饰器模式——新 provider 自动获得 trace 能力，零成本；以及 `Compactor` 用的是同一个 `LLMProvider` 接口，压缩能力也自动延续。接口设计得好的标志，就是新实现接入时周边设施自动生效。

---

## 第八部分：工程化与可观测性

### Q48. 配置系统的五层合并是怎么实现的？为什么「未知 key 直接退出」？

标准解答：

`getConfig()`（`src/core/config.ts`，505 行）按优先级从低到高合并：

```
defaults（代码内常量）
  ← ~/.swifty/config.toml（全局 TOML）
  ← <cwd>/.swifty/config.toml（项目 TOML）
  ← .env（dotenv 注入环境变量，no override——不覆盖已存在的 env）
  ← SWIFTY_* 环境变量（最高优先级）
```

配置节：`core`（host/port）、`logging`、`agent`（max_steps）、`llm`（default_model/router）、`trace`、`permission`（timeout_s）、`compaction`（auto_threshold 等）、`mcp`（servers 数组）。

严格校验：每个 TOML section 用 `VALID_SECTIONS` 白名单 + 逐 key 类型校验，遇到未知 section/key 或类型错误直接打印错误并 `process.exit`。这是「fail fast vs 宽容忽略」的经典分歧点，选择 fail fast 的理由：

1. 配置文件是低频人工编辑的，typo（如 `max_step = 50` 少个 s）是最常见错误——宽容忽略会让用户以为配置生效了实际没有，排查极其痛苦（「静默错误」比「启动报错」昂贵得多）；
2. schema 演进时旧 key 能被明确告知「已废弃」，而不是被悄悄丢弃；
3. 这是 CLI 工具不是长驻服务，启动即退的代价就是改一行配置再来。

面试可对比：tsconfig/eslint 的 `unknown option` 报错、Kubernetes 的 `strict decoding`——基础设施软件普遍走向严格模式，理由相同。

---

### Q49. Trace 系统是怎么设计的？为什么说它是「三层」？

标准解答：

`TraceWriter` 把全系统的关键动作以 JSONL 追加到 `~/.swifty/traces/daemon.jsonl`，用 `swifty-code trace [--layer X] [--direction Y] [--follow]` 消费。每条记录含 `layer` 和 `direction` 两个维度（`src/core/trace/record.ts`）：

| 层      | 记录内容                                            | 方向                     | 打点位置                                                                               |
| ------- | --------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| `ipc`   | command / response / error / push                   | CLIENT→CORE、CORE→CLIENT | `SocketServer._handleLine`（`socket-server.ts:187-218`）、`IpcEventBroadcaster.handle` |
| `event` | 每个 bus 事件                                       | CORE                     | `CoreApp` 里 `_bus.subscribe(_traceEventHandler)`                                      |
| `llm`   | api_call（请求摘要）/ api_response（含 latency_ms） | CORE→LLM、LLM→CORE       | `TracingProvider` 装饰器（`trace/provider.ts`）                                        |

设计要点：

1. 装饰器注入 LLM 打点：`TracingProvider` 包装任意 `LLMProvider`（`runner.ts:233-239`），在 chat 前后发 trace，带 `includeLlmPayload` 开关控制是否记录完整 payload（脱敏/体积权衡）——LLM 交互是最贵最难复现的部分，必须可回放审计。
2. 同步写（`appendFileSync`）：记录小（~200B）、频率可预期，同步写换取「崩溃前最后一条 trace 一定落盘」——异步缓冲在 crash 时会丢失最关键的现场。这是可观测性系统的特殊取舍：宁可慢，不可丢。
3. 一次请求的全链路可拼接：`client_id`（ip:port）+ `run_id` + JSON-RPC `id` 贯穿三层，能把「某客户端发的 session.send_message → 产生的所有事件 → 每次 LLM 调用」串成一棵树。

与 pino 日志（`core/logging.ts`，stderr + 10MB×5 手动轮转文件）的分工：日志给开发者看「为什么」，trace 给系统看「发生了什么」——前者是文本诊断，后者是结构化审计。

---

### Q50. 测试策略是怎样的？47 个测试文件如何组织？

标准解答：

分层：

1. 单元测试：纯逻辑——权限六层判定、配置合并、NDJSON 编解码、Zod schema、PromiseMutex、truncateToolResults、TaskManager 双向链接等；
2. 组件测试（带 mock 边界）：`AgentLoop`/`AgentRunner` 配 mock LLMProvider（预编程的 `LlmResponse` 序列，如「第一步返回 tool_use(read_file)，第二步返回 end_turn」），验证 loop 的步进、工具编排、compaction 触发——LLM 是唯一的非确定性来源，mock 掉它整个 agent 循环变成确定性状态机，这是本项目可测性的关键设计（`LLMProvider` 接口 + 构造注入）；
3. e2e over TCP：起真实 `SocketServer` 在空闲端口（`freePort()` 辅助函数），用真 SocketClient 打 JSON-RPC——覆盖传输、订阅、回放、权限挂起/响应的完整链路，只是 LLM 换成 mock。

覆盖率门：vitest + v8，50% lines/branches/functions/statements 阈值；排除 `tui/`、`dev.ts`、`cli/main.ts`、`core/app.ts`——排除的都是「进程胶水层」（启动、渲染、顶层组装），这些靠手工/e2e 验证，纳入覆盖率只会逼出无价值的 mock 测试。这是务实的覆盖率观：覆盖值得覆盖的，承认有些层的 ROI 就是低。

面试加分点：能说出「为什么 mock provider 放在构造注入而不是 vi.mock 模块替换」——注入让「被测对象依赖什么」显式化在构造函数签名里，测试之间无模块级污染，并行安全。

---

### Q51. 构建产物为什么用 tsup 打两个 bundle，且 `noExternal: [/.*/]` 全量内联依赖？

标准解答：

`tsup.config.ts` 两个入口：`src/cli/main.ts` 和 `src/core/app.ts`，输出 `dist/cli/main.js` + `dist/core/app.js`，ESM、target ES2024、Node ≥20。

`noExternal: [/.*/]`（所有依赖打进 bundle）的取舍：

- 收益：分发即一切——`npm i -g` 后运行时零依赖解析，不怕用户环境里依赖版本冲突（react/ink/zod 各版本的「钻石依赖」地狱在 CLI 工具上尤其常见：用户全局装了十几个 CLI，每个对 zod 主版本要求不同）；启动更快（无 node_modules 遍历）；`pnpm dlx`/`npx` 冷启动确定性强。
- 代价：产物体积大（React + Ink + Anthropic SDK 内联后数 MB）；依赖更新必须重新发版；source map 和调试堆栈需要额外维护。

业界惯例：这是 CLI 工具的主流做法（esbuild、turbo、Vercel 的 CLI 都 bundle）；与「库（library）绝不 bundle」的原则正好相反——应用 bundle，库 external，因为应用控制运行环境，库不控制。

两个 bundle 的意义：呼应双进程架构——CLI 进程不带 Anthropic SDK 之外的重依赖也能跑（实际上两个 bundle 各自只摇树出自己需要的部分）；daemon bundle 独立部署成为可能（比如塞进容器跑远程 core）。

---

### Q52. 日志系统的设计（pino + 自研轮转）有什么考量？

标准解答：

`setupLogging`（`src/core/logging.ts`，107 行）：

1. 多流输出：pino multistream——stderr（开发时人看）+ 可选文件流（daemon 排障）。daemon 是 detached 进程，stdout/stderr 通常被丢弃，文件日志是 daemon 排障的唯一途径，这是 daemon 化必须配套的基础设施。
2. 自研轮转：10MB 上限、5 个备份，手动 rename 链（`app.log → app.log.1 → ... → app.log.5` 丢弃最老）。为什么不用 pino-roll 等现成 transport？——transport 走 worker_threads 异步管道，daemon 崩溃时缓冲丢失；主线程内同步 rename 简单可靠，且这个日志量（agent 系统，非 Web QPS）下性能完全不是瓶颈。依赖最小化 + 崩溃安全性优先。
3. 级别映射：兼容 Python 风格 `WARNING` → pino `warn`——这个项目是从 Python 版移植的（源码注释多处 "matches Python ..."），保留了对旧配置/旧日志的兼容，体现移植项目的务实。
4. 格式开关：JSON（机器消费，接 Loki/ELK）或 text（人看）。

与 trace 的分工见 Q49——日志是文本诊断流，trace 是结构化审计流，各管一段。

---

## 第九部分：开放性问题与架构权衡

### Q53. 这个架构目前最主要的局限是什么？你会按什么优先级改进？

标准解答：

局限清单（按严重度）：

1. daemon 重启 = 全量状态丢失：session map、权限挂起、run 状态全在内存（Q7 提过）。改进：session 元数据已有 meta.json，补一个「启动时重建 session 索引」+ run 状态持久化（每步 checkpoint 到 run 目录），就能支持 daemon 崩溃恢复。
2. 无取消 RPC：用户无法在 run 中途叫停（Q38）。改进：`run.cancel` 方法 + AbortController 按 runId 注册表。
3. 单 session 串行：PromiseMutex 让同 session 消息无法排队，多任务并行只能靠多 session。改进：引入「消息队列 per session」+ 用户可中断当前 run。
4. 无鉴权/多用户：绑定 loopback 是唯一防线，协议无 token。改远程必须先加 auth（Q54）。
5. 慢客户端拖累事件发布（Q9 的连锁背压）。改进：每订阅者有界队列 + 溢出策略。
6. 流式重试的 UI 对账（Q17 的已知瑕疵）。

优先级：1 和 2 是「正确性/可控性」缺口，先做；3 是体验；4-6 是规模化才需要的。先修「会丢东西」的，再修「不好用」的，最后修「不够快」的。

---

### Q54. 如果要支持远程访问/多用户，架构需要怎么改？

标准解答：

分层回答：

1. 传输层：TCP 不用改，但要加 TLS（或套 SSH tunnel/WireGuard 把传输安全外包）；
2. 鉴权：握手加 auth 帧（token/mTLS），`SocketServer` 目前接受任何 loopback 连接；
3. 多租户隔离——这是真正伤筋动骨的地方：
   - 权限：bash 在共享主机上执行，用户 A 的 agent 能读用户 B 的文件——需要每会话一个 OS 用户/容器命名空间，或干脆每用户一个 daemon（端口 + socket 按用户隔离）；
   - 文件系统根：当前 cwd 是 daemon 启动目录，多用户要 per-session workdir + chroot/沙箱；
   - 资源配额：每用户并发 run 数、token 消耗配额，防止一个人打爆 API 额度；
   - 密钥管理：`ANTHROPIC_API_KEY` 当前是 daemon 级 env，多用户要按用户/会话注入。
4. 协议：事件 scope 已有 `run:<id>`，但要加 `session:<id>` 和租户维度的过滤；`permission.respond` 要校验「响应者是否该权限请求所属会话的拥有者」（当前任何连接都能 respond 任何 toolUseId——loopback 信任模型下无所谓，多用户下是越权漏洞）。

结论：传输和协议层改动小，安全模型要从「单机信任」重写为「零信任」——工作量集中在隔离而非通信。

---

### Q55. run 进行中 TUI 重启，界面状态如何恢复？当前做到了什么程度，还差什么？

标准解答：

已做到的（Q7 详述）：`replay_from_run` 重放事件 → 重建 `messages`（user/assistant/tool_result/system）、`isRunning`、token 计数、`contextPercent`、activeTools——界面能基本还原到断线前。

还差的：

1. 流式中间态：回放的事件流里 `llm.token` 也在（events.jsonl 记录了），重放会快速重现流式过程——但这依赖 EventWriter 记录 token 事件（数据量大时 events.jsonl 膨胀），更优是回放时聚合为 `llm.text`；
2. 权限弹窗：如果断线时正挂着一个 `permission.requested`，重放能恢复弹窗（事件在），但 60s 超时可能已过——daemon 已按 timeout 拒绝，TUI 重放出的弹窗再 respond 会无人接收（`_pending` 已清）。需要「重放时检查挂起状态」的对账 RPC（如 `permission.list_pending`）；
3. 输入框草稿、滚动位置、toolsExpanded 这类纯客户端 UI 状态不恢复（合理，它们不是业务状态）。

方法论：事件溯源系统里「状态恢复」的完备性取决于事件流是否包含重建状态机所需的一切。swifty-code 的事件设计（run/step/tool/llm/permission 全生命周期）基本满足，剩下的都是「对账类」边角——加状态查询 RPC 比改事件流更便宜。

---

### Q56. 与 Claude Code 相比，swifty-code 的设计异同有哪些？

标准解答：

同（行业收敛的共识设计）：

- plan-act-observe 循环 + 原生 tool_use API；
- 工具集高度重合（read/write/bash/list + task 管理）；
- 权限弹窗 + always 缓存；
- slash command（skill）+ 项目/用户级记忆文件（context.md ≈ CLAUDE.md）；
- 上下文压缩 + TodoWrite ≈ task 系统；
- subagent + 角色 profile。

异（swifty-code 的独特选择）：

1. 双进程 vs 单进程：Claude Code 是单进程 UI+agent 一体；swifty-code 把 core 独立成 daemon，换得多客户端、崩溃恢复、可编程接入（Q2）。
2. 协议显式化：Claude Code 无公开 IPC；swifty-code 的 9 方法 + 24 事件全部 Zod schema 化且可生成文档——第三方可以写自己的客户端（比如 Web UI、IDE 插件）接同一个 daemon。
3. 事件溯源倾向：per-run events.jsonl + 全链路 trace 层，可观测性投入明显更重。
4. 生态位：Claude Code 绑 Anthropic 账号体系与云端功能（/login、web 同步）；swifty-code 是纯本地工具，`ANTHROPIC_API_KEY` 直连，MCP 走标准协议。

面试话术：把差异归因到「定位」而非「优劣」——Claude Code 优化目标是「开箱即用的产品体验」，swifty-code 优化目标是「可嵌入、可观测、可二次开发的 Agent 运行时」。

---

### Q57. 这个系统的性能瓶颈可能在哪？如何量化与优化？

标准解答：

逐段分析 token 流经的路径：

1. IPC 放大：每个 LLM text delta → 一次 `bus.publish`（N 个 handler 顺序 await）+ 一次 JSON 序列化 + 一次 TCP 写 + 客户端一次 JSON.parse + 一次事件分发。每秒 100 delta 时 daemon 端约 100×(N handler) 次微任务——量级仍小，但事件体积敏感：若未来加「编辑器实时 diff」这类大事件，需要采样/合并（如每 50ms 聚合一次 token 为一个事件，用带宽换 CPU）。
2. 同步 I/O：`EventWriter`/`TraceWriter`/`SessionStore.appendMessage` 全是 `appendFileSync`——事件循环上的同步磁盘写。loopback + SSD 下单次 ~微秒级，可接受；若搬到网络盘/容器卷就会抖。优化方向：批量 flush（积攒 100 条或 10ms 落一次）或迁移到 `fs.writev` 流——但要重新权衡 Q49 说的崩溃安全性。
3. TUI 渲染：已用 50ms 节流 + Static 分区压住（Q30/Q32），剩余热点是 `marked` 全量解析——流式区每次渲染都重新 parse 全文。优化：段落级缓存（已凝固段落的渲染结果 memo 化，只 parse 最后一段）。
4. LLM 延迟：实际最大瓶颈是网络 + 模型本身，工程上能做的是 prompt caching（已做，Q16）和减少每步 token 量（工具结果截断，Q20）——这部分省的是钱和时间，比 1-3 的 CPU 优化价值大一个数量级。

量化方法：trace 层已有 `latency_ms`（LLM 调用）和 `elapsed_ms`（工具调用）；补 IPC 往返直方图（ping/pong 采样）+ 渲染帧耗时（TUI 内 performance.now 打点），就能画出全链路火焰图。先测量，再优化——这是所有性能题的元答案。

---

### Q58. 如果重新设计这个项目，你会做哪些不同的决策？

标准解答（示例回答框架，鼓励有自己的观点）：

1. 事件通道与命令通道分离：当前单连接复用（靠 `jsonrpc` vs `kind` 字段分流），简单但让「慢事件消费阻塞命令响应」成为可能。可以事件走独立连接或 Server-Sent 流，命令保持短连接。
2. 订阅者背压隔离：每订阅者环形缓冲 + 溢出标记（`events_missed: N`），替代 Q9 的「全员等最慢者」。
3. 消息格式的 provider 中立化：ExecutionContext 一开始就用规范中间格式，而不是 Anthropic `MessageParam` 直通（Q47 的耦合点）——第二天要接第二个 provider 时不用动核心。
4. 权限决策下沉为策略引擎：当前六层管道硬编码在 manager 里；表达成可组合的规则 DSL（类似 OPA/Rego 的极简版）后，deny_patterns/allow_patterns/角色化策略都是配置而非代码。
5. run 取消从第一天就做进协议：事后补 cancel 要动协议、daemon、TUI 三处（Q38/Q53），而协议设计期预留 `run.cancel` 几乎零成本——控制面（cancel/pause/resume）和数据面（run/events）应该在协议里对称存在。
6. 保留的决策：双进程、Zod 全链路、append-only 持久化、Static 渲染分区、装饰器式 trace——这些被验证是对的，会原样保留。

评分要点：好答案 = 具体（指到文件/机制）+ 有 trade-off 意识（说清原设计为什么当时合理）+ 不推翻一切（能区分「错误」和「当时约束下的最优」）。

---

## 附录 A：速查表

### 关键源码位置

| 主题               | 文件                                    | 行数 |
| ------------------ | --------------------------------------- | ---- |
| Agent 循环         | `src/core/loop.ts`                      | 157  |
| Run 编排           | `src/core/runner.ts`                    | 307  |
| Anthropic provider | `src/core/llm/provider.ts`              | 220  |
| 工具调用管道       | `src/core/tools/invocation.ts`          | 235  |
| 权限管理           | `src/core/permissions/manager.ts`       | 193  |
| 权限策略           | `src/core/permissions/policy.ts`        | 102  |
| TCP 服务端         | `src/core/transport/socket-server.ts`   | 230  |
| TCP 客户端         | `src/core/transport/socket-client.ts`   | 192  |
| 事件广播           | `src/core/transport/ipc-broadcaster.ts` | 104  |
| 会话管理           | `src/core/session/manager.ts`           | 291  |
| 上下文压缩         | `src/core/compact/compactor.ts`         | 182  |
| 子代理             | `src/core/subagent/tool.ts`             | 356  |
| MCP 客户端         | `src/core/mcp/client.ts`                | 343  |
| TUI 主组件         | `src/tui/app.tsx`                       | 754  |
| TUI 输入框         | `src/tui/input.tsx`                     | 535  |
| 同步输出           | `src/tui/sync-output.ts`                | 92   |
| 配置               | `src/core/config.ts`                    | 505  |
| daemon 入口        | `src/core/app.ts`                       | 381  |

### 数字约定

| 项             | 值               | 位置                 |
| -------------- | ---------------- | -------------------- |
| 默认端口       | 7437             | config               |
| NDJSON 行上限  | 64 MB            | socket-server.ts:34  |
| 工具默认超时   | 120 s            | invocation.ts:12     |
| 工具重试       | 2 次（2s/4s）    | invocation.ts:13-14  |
| LLM 流重试     | 3 次（1s/2s/4s） | provider.ts:18-19    |
| 权限响应超时   | 60 s（可配）     | manager.ts:54        |
| 自动压缩阈值   | 0.8（可配）      | loop.ts:48           |
| 工具结果截断   | 8000→4000 字符   | budget.ts            |
| bash 输出截断  | 64 KB            | bash.ts              |
| read_file 上限 | 512 KB           | read-file.ts         |
| subagent 深度  | 2 层             | subagent/tool.ts:108 |
| TUI 流式节流   | 50 ms            | app.tsx:232          |
| TUI 重连间隔   | 2 s              | app.tsx:513          |
| 历史记录上限   | 200 条           | app.tsx:68           |
| MCP 读超时     | 30 s             | mcp/client.ts:31     |
| 日志轮转       | 10 MB × 5        | logging.ts           |

### 9 个 JSON-RPC 方法

`core.ping` · `agent.run` · `event.subscribe` · `session.create` · `session.send_message` · `session.get_history` · `session.close` · `session.compact` · `permission.respond`

### 24 种事件

`core.started` · `run.started`/`run.finished` · `step.started`/`step.finished` · `tool.call_started`/`tool.call_finished`/`tool.call_failed` · `llm.token`/`llm.usage`/`llm.model_selected` · `log.line` · `session.created`/`session.message_received`/`session.waiting_for_input`/`session.resumed`/`session.closed` · `context.compacted` · `permission.requested`/`permission.granted`/`permission.denied` · `subagent.started`/`subagent.finished` · `skill.invoked`

---

> 以上为上卷（架构与核心机制），共 58 问。

---

# 下卷：进阶篇

> 以下 60 问转向语言运行时细节、协议边界、可靠性工程、安全深挖、TUI 进阶、移植方法论、测试哲学与架构演进，问题更微观、更考察候选人读源码的颗粒度。与上卷交叉引用处标注「上卷 Qn」。

## 第一部分：语言与运行时深挖（JS/TS/Node.js）

### Q1. 项目里三处 `Promise.withResolvers()` 分别解决了什么问题？这个 API 的语义价值是什么？

标准解答：

`Promise.withResolvers()`（ES2024）把「promise 的创建」与「resolve/reject 的触发」解耦到不同位置。项目中三处典型应用：

1. 权限挂起（`src/core/permissions/manager.ts:119`）：`checkAndWait` 创建 promise 存进 `_pending` Map，resolve 权交给另一个进程发来的 `permission.respond` RPC——生产者与消费者跨进程分离，这是 withResolvers 最不可替代的场景：executor 回调里根本拿不到未来的决策。
2. 客户端请求关联（`src/core/transport/socket-client.ts:142`）：`sendCommand` 创建 promise 存 `_pending`（key=UUID），响应行到达时由 `_dispatch` resolve——请求-响应跨事件解耦。
3. 旧式等价写法（`session/manager.ts` 的 `PromiseMutex.acquire`）：`new Promise((resolve) => { this._queue.push({resolve}) })`——传统 executor 捕获模式，语义相同但写法更绕。

语义价值：传统 `new Promise(executor)` 强制你在创建瞬间就拥有完成 promise 的能力，诱导出「外层包一层变量」的泄漏写法（`let resolveFn; new Promise(r => resolveFn = r)`——`resolveFn` 在赋值前可能被误用，且 TS 类型需要 `!` 断言）。withResolvers 把「 deferred（延期物）」变成一等公民：返回 `{promise, resolve, reject}` 解构即得，类型完备、无暂时性死区。

面试加分点：能说出它替代的模式名叫 Deferred（jQuery/Twisted 时代就有），并指出三处场景的共性——都是「事件完成 promise」而非「计算完成 promise」：凡是以外部事件（网络消息、用户输入、锁释放）为 settle 条件的，都该用 withResolvers/Deferred 而非 executor。

---

### Q2. 项目里微任务的三处精细调度（`queueMicrotask`、`await Promise.resolve()`）各自的语义是什么？

标准解答：

三处看似相似的微任务操作，语义完全不同：

1. `queueMicrotask(flush)`（`tui/sync-output.ts:75`）——同步批处理的 flush 点。Ink 一帧内的多次 `stdout.write` 在同一同步栈发生，微任务在「当前同步栈清空后、下一个宏任务前」执行，恰好把一帧收拢进一个 BSU/ESU 包裹的写入（上卷 Q31）。语义是「等这波同步写入全部到齐再发」。
2. `await Promise.resolve()`（`subagent/tool.ts:320`）——让出执行权，等已排队微任务先跑。`AgentResultTool` 读 `BackgroundTaskRegistry` 状态前让出一个 tick：后台 promise 的 `.then` 回调（负责把 status 从 pending 改成 fulfilled）若已在微任务队列排队，让出后它先执行，自己再读到新状态。语义是「等状态的传播追平」。注释里明说这替代了之前脆弱的 `Promise.race` hack。
3. `await Promise.resolve()`（`events/writer.ts:44-47`）——把同步 handler 适配进异步签名。`EventWriter.subscribe` 里 handler 是 async 的（bus 要求 `Promise<void>`），但 `handle` 本体是同步 `appendFileSync`；`await Promise.resolve()` 让 handler 成为真正的微任务，避免「同步异常在 subscribe 调用栈内抛出」的时序差异，同时满足 bus 顺序 await 的契约。

考察本质：JS 只有一个「当前执行栈 + 微任务队列」的调度模型，三处分别利用了它的三个性质——同步栈边界（1）、FIFO 顺序（2）、microtask 包装（3）。能分清这三层语义的候选人，才算真正理解事件循环，而不是只会背「宏任务微任务」。

---

### Q3. 为什么源码里 import 自己的模块都要写 `.js` 后缀（如 `from "./loop.js"`）？`version.ts` 的双模式版本解析是怎么回事？

标准解答：

`.js` 后缀：项目是纯 ESM（`package.json` `"type": "module"`）+ `tsconfig` 的 `module: "NodeNext"`。Node.js 原生 ESM 解析不做扩展名猜测——`import "./loop"` 在运行时会 `ERR_MODULE_NOT_FOUND`，必须写全 `./loop.js`（指向编译产物）。TS 在 NodeNext 模式下刻意「与运行时对齐」：源码里写 `.js`（虽然磁盘上是 `.ts`），tsc/tsup/tsx 都能正确映射。这是 ESM 时代 TS 项目的标准姿势，也是很多从 CJS 迁移来的项目最常见的踩坑点。

`version.ts` 的双模式解析（`src/version.ts:15-36`）——这是打包工具与源码共存的经典问题：

- 构建期注入优先：tsup 在打包时通过 define 注入 `__SWIFTY_VERSION__` 常量。因为 bundle 后 `dist/cli/main.js` 是单文件，`__dirname + ../package.json` 的相对位置在用户安装目录下不可预测（pnpm 的全局 store 结构），读文件不可靠。
- 开发期回退：dev 模式（tsx 直跑 `src/`）没有注入，向上走 1~2 级目录找 `package.json`，用 Zod schema 校验（`PackageJsonSchema`）后再取 version——连读 package.json 都过 schema，贯彻「跨边界必校验」的项目信条。
- 两级候选路径（`["..", "../.."]`）覆盖 `src/` 与 `dist/cli/` 两种布局。
- 找不到就 throw：版本号是 TUI 横幅、`session.create` clientInfo 等的基础数据，缺失属于启动期硬错误，fail fast。

延伸考点：`declare const __SWIFTY_VERSION__: string | undefined` + `typeof !== "undefined"` 守卫——直接引用未定义常量会 ReferenceError，必须先 typeof 探测。这是 define 注入类全局的标准防御写法。

---

### Q4. 24 种事件用 Zod 判别联合（discriminated union）建模，这个模式相比「interface + 可选字段」好在哪里？

标准解答：

`src/core/bus/events.ts` 的 `EventSchema = z.discriminatedUnion("type", [...])` 把 24 个事件各自定义为独立 object schema，共享字面量判别字段 `type`。

相比大 interface 的优势：

1. 精确性：`run.finished` 必有 `status/steps`，`llm.token` 必有 `token`——大 interface 只能全部可选（`status?: string`），类型上允许「有 type 没 payload」的非法状态；判别联合让每个变体的必填字段与事件名一一绑定，非法事件在编译期和运行时（Zod parse）双重拒绝。
2. 穷举性检查：消费方 switch（如 `app.tsx` 的事件 handler）配合 TS 的 `never` 兜底，新增事件类型时编译器强制你处理——interface 方案新增字段静默兼容，容易漏处理。
3. 窄化免费：`if (event.type === "llm.usage")` 后 TS 自动窄化出 `input_tokens` 等字段，无需断言。
4. 错误定位：Zod 判别联合校验失败时能报出「哪个变体为什么不匹配」，比扁平 schema 的错误信息可读得多。

本项目的一个务实偏离值得注意：IPC 上传输的事件实际是 `Record<string, unknown>`（广播器和客户端 handler 都用 `str()`/`num()` 辅助函数取值，`app.tsx:75-87`），Zod schema 主要服务于文档生成（`gen-protocol-doc.ts`）和生产侧约束。也就是说：schema 的强制力在「写事件的一端」，读事件的一端选择宽松取值——这是「发送方严格、接收方宽容」（Postel 定律）的应用，客户端不因新增事件字段而崩溃。

---

### Q5. `EventBus.publish` 为什么「顺序 await 每个 handler」而不是 `Promise.all` 并发？和 Node 的 EventEmitter 设计哲学有何不同？

标准解答：

`src/core/events/bus.ts`（17 行）的 publish 逐个 `await handler(event)`。

顺序 await 的理由：

1. 顺序确定性：事件的消费者有 EventWriter（落盘）、IpcEventBroadcaster（推送）、TraceWriter（审计）。顺序执行保证「同一 bus 上先 publish 的事件先落盘/先推送」——并发 `Promise.all` 下，两个连续事件的 handler 完成顺序不保证，落盘可能乱序（`run.finished` 写在最后一个 `llm.token` 前面），回放和 trace 分析就乱了。
2. 背压传导：上卷 Q9 提到广播器写 socket 会等 drain。顺序 await 让「慢消费」显性传导回 publish 调用方（事件生产自然减速），并发则把积压藏进内存。
3. 错误隔离简单：一个 handler 抛错立即中断 publish，调用方立刻知道；并发模式的部分失败语义复杂得多。

与 EventEmitter 的哲学差异：Node `EventEmitter.emit` 是同步、fire-and-forget——listener 返回 promise 也不会被 await，异步失败变成 unhandledRejection。EventBus 把 handler 升级为awaitable 的一等异步公民，本质是「观察者模式 + 异步管道」的合体，更接近 RxJS 的串行语义或 Redux middleware 链。选择依据是事件的下游（磁盘、网络）都是异步的，fire-and-forget 会把「写没写完」的不确定性推给系统边界（进程退出时丢事件）。

代价（要承认）：慢 handler 拖累全 bus——所以事件生产侧（如 `llm.token` 里 `void bus.publish(...)`，`provider.ts:142`）对高频事件用 `void` 显式不等待，把「不重要的流」从关键路径上摘出去。顺序 await 保证重要的序，void 放过不重要的流，两者配合。

---

### Q6. `EventWriter` 的 `[Symbol.asyncDispose]` 是什么？显式资源管理（Explicit Resource Management）解决了什么痛点？

标准解答：

`src/core/events/writer.ts:28-30`：

```ts
[Symbol.asyncDispose](): void {
  this.close();
}
```

这是 TC39 Explicit Resource Management（TS 5.2+ / Node 24 支持）的钩子：对象实现 `Symbol.asyncDispose`（或同步版 `Symbol.dispose`）后，可用 `await using writer = new EventWriter(...)` 声明，作用域退出时（无论正常 return 还是异常）自动调用 dispose。

解决的痛点：资源释放在 JS 里长期只有 `try/finally` 一条路——`runner.ts:218-291` 里 EventWriter 的实际用法就是 `eventWriter.open(); try { ... } finally { eventWriter.close(); }`。问题：

1. finally 块与资源声明相距可能上百行，可读性差；
2. 多资源嵌套时 finally 层级爆炸；
3. 忘记写 finally 就是泄漏（文件句柄、socket、定时器）。

`using` 把「获取即绑定释放」（RAII）引入 JS：资源在词法作用域结束时必然清理，异常路径也不例外。EventWriter 实现该接口意味着它「RAII-ready」——调用方可以选择现代化的 `await using`，也可以保持显式 open/close（当前 runner 的做法，因为它需要在 finally 里做更多事：appendMessages 持久化）。

面试加分点：能指出 asyncDispose 与普通清理的差异——dispose 可以是异步的（如等缓冲 flush 完再关文件），`await using` 会 await 它；并横向对比其他语言：Python `with`、C# `using`、Go `defer`、Rust Drop——JS 是这波显式资源管理潮流里最后补票的主流语言。

---

### Q7. TUI 的事件 handler 只注册一次（`useEffect(..., [client])`），handler 里怎么安全地访问「最新的状态」？stale closure 在这里的具体形态是什么？

标准解答：

问题形态：`app.tsx:179-454` 的巨型事件 handler 在组件首次渲染后注册进 `client._eventHandlers`，此后再不更换。它捕获的是首次渲染那帧的闭包——里面的 `messages`、`isRunning` 等 state 变量永远定格在初始值。如果 handler 里写 `if (isRunning) ...`，读到的永远是挂载时的 false。

项目的解法矩阵（按场景分三类）：

1. setState 函数式更新——`setMessages(prev => ...)`（如 `session.message_received` 去重逻辑，`app.tsx:270-277`）。React 保证 updater 拿到最新 prev，不需要在闭包里读 state。这是首选，绝大多数 case 用它。
2. ref 镜像——需要在事件间累积/读写的数据放 ref：`streamingTextRef`（token 累积）、`committedIndexRef`、`lastRunIdRef`、`subagentStartTimes`。ref.current 是可变单元，不受闭包帧限制。
3. 根本不需要读——`setIsRunning(true)`、`setContextPercent(pct)` 这类覆盖式写入，新值来自事件 payload 而非旧 state，闭包里不需要旧值。

一个微妙的正确性案例：`llm.token` 累积（`app.tsx:229-237`）必须 `streamingTextRef.current += token` 而不能 `setStreamingText(prev => prev + token)`——因为 token 事件频率高于 50ms 节流 timer 的触发频率，若用 setState 累积，在「timer 尚未把快照同步给 state」的窗口内，state 是旧值，+= 会丢 token。ref 是唯一与渲染节奏解耦的累加器。

面试加分点：指出这正是 React 官方 `useEffectEvent`（实验 API）要解决的问题——把「事件 handler 从渲染帧中剥离」。项目的 ref + 函数式更新组合是稳定 API 下的标准替代。

---

### Q8. `AbortSignal` 是如何从 daemon 顶层贯穿到 agent loop 再到嵌套 subagent 的？这种「信号穿线」模式的价值是什么？

标准解答：

信号链路（构造注入，逐层透传）：

1. 源头：`CoreApp`（`core/app.ts`）持有一个 daemon 级 `AbortController`，SIGINT/SIGTERM 时 `abort()`；
2. 第一层：`CoreApp` 把 signal 传给 `AgentRunner`（`runner.ts:65,88` 构造注入 `_signal`），runner 再注入 `AgentLoop`（`runner.ts:268`）；
3. 第二层：`AgentLoop.run` 每步开头查 `this._signal?.aborted`（`loop.ts:57`），LLM 调用异常后也二次检查（`loop.ts:81-84`，区分「网络错误」与「被取消导致的连接中断」）；
4. 第三层：`runner._buildRegistry` 把同一个 signal 传给 `SpawnAgentTool`（`runner.ts:140`），子 agent 的 `AgentLoop` 拿到它（`subagent/tool.ts:137`）；嵌套 spawn 时 depth+1 的新 SpawnAgentTool 继续传（`tool.ts:255-265`）——一个信号贯穿任意深度。

模式价值：

1. 单点控制，全树生效：一个 daemon 停机信号能停掉「主 run → 子 agent → 孙 agent」整棵执行树，不需要每层注册自己的信号监听。
2. 协作式语义统一：所有层级都在「步边界」检查 signal，没有任何一处被硬切——工具执行不被打断（可能留下半成品文件），LLM 请求完成或被连接层中断。AbortSignal 只是「请在下一个安全点停下」的请求。
3. 无侵入：signal 通过 options 逐层可选注入，测试时不传即是「永不取消」。

局限（主动讲是加分）：daemon 级单例意味着「停 daemon」是唯一的取消粒度——没有 per-run 取消（上卷 Q38/Q53），因为 controller 只有一个，`abort()` 影响所有进行中的 run。演进方案是 `Map<runId, AbortController>` 注册表 + `run.cancel` RPC。

---

## 第二部分：协议与边界细节

### Q9. NDJSON 分帧在实现上要处理哪三个边界问题？

标准解答：

1. 消息内换行：NDJSON 的前提是「单条消息不含裸 `\n`」。`JSON.stringify` 默认把字符串内的换行转义为 `\\n`，天然满足；但若某天有人手写 JSON 行（或换了 pretty-print 的序列化器），协议立即崩坏。防御在于双端都只认 stringify/parse 这对组合，且单行超限即断连（下述）——畸形数据最坏结果是断开一条连接，不会状态错乱。
2. 半包（partial frame）：TCP 是字节流，一次 `data` 事件可能带来半行、一行半。项目没有手写 buffer 拼接，而是用 `readline.createInterface({input: socket, terminal: false})`（`socket-server.ts:139-142`、`socket-client.ts:87-90`）——Node readline 内部维护行缓冲，只在遇到 `\n` 时 emit `line`，半包问题由标准库解决（Q12 展开）。
3. 单行 64MB 上限（`socket-server.ts:34,147-152`）：`Buffer.byteLength(line)+1 > 64MB` → 回 `INVALID_REQUEST` 错误并 `socket.destroy()`。设计意图有二：(a) 防内存攻击/失控——readline 的行缓冲是无界增长的，一条永不换行的流会把内存吃光，上限让恶意/buggy 对端在 64MB 处被切断；(b) 按行计次而非按连接累计——注释里明确写了 "a long-lived connection must be able to send many small commands without being disconnected"，即限制的是单帧大小，不是会话总量，长连接发一万条小命令不受限。

面试加分点：能说出 NDJSON 的固有缺陷——无法传输未转义的二进制（一切都要 JSON 编码，base64 膨胀 33%），以及没有内建压缩。对本项目（文本事件 + 工具输出）不是瓶颈；若要传文件内容大对象，协议层需要新增二进制帧类型或分块引用。

---

### Q10. 主协议的 JSON-RPC id 用 UUID 字符串，MCP 客户端却用自增数字，为什么？

标准解答：

两处对比（`socket-client.ts:134` vs `mcp/client.ts:47,173-174`）：

|          | 主协议（SocketClient ↔ daemon）                                            | MCP（McpClient ↔ MCP server）                                                                                                     |
| -------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| id 形式  | `randomUUID()` 字符串                                                      | `this._id++` 自增数字                                                                                                             |
| 原因     | 多客户端共享服务端：id 空间全局，UUID 免协调防碰撞；重启不换 id 空间也无碍 | 1:1 连接 + 串行化发送：PromiseQueue 保证同时在飞只有一个请求，自增 id 永不碰撞且对端友好                                          |
| 响应匹配 | `_pending.get(id)` Map                                                     | `_readResponse(reqId)` 行扫描，比较时 `toDisplayString(msgId) === reqIdStr`（数字转字符串，容忍对端把 id 回传成字符串的实现差异） |

深层原因：id 空间的选择取决于「谁可能与我共享同一个序列」。daemon 面对 N 个客户端，如果各自从 1 自增，服务端收到的 id 全撞——响应路由靠「连接 + id」二元组还能救，但排查 trace 时满屏 `id:1` 毫无区分度；UUID 让每个请求在全局 trace 里可独立检索。MCP 是每 server 一条独占连接且串行（Q44 上卷），自增 id 简单可读。

面试加分点：MCP 响应匹配的字符串化比较（`client.ts:200-216`）——JSON-RPC 允许 id 为 string/number/null，对端实现可能把数字 id 回传为字符串，宽松比较是对真实世界实现差异的防御。这和主协议 `JsonRpcRequestSchema` 把 `id` 限定为 `z.string()`（`envelope.ts:7`）形成对照：自己定义的协议从严（schema 锁死字符串），对接外部协议的从宽（容忍类型漂移）。

---

### Q11. SocketServer 对一个连接同时监听了 `rl.on("close")` 和 `socket.on("error")`，两个钩子都做清理，为什么一个不够？

标准解答：

`socket-server.ts:157-165`：

```ts
rl.on("close", () => {
  this._activeSockets.delete(socket);
  socket.destroy();
});
socket.on("error", () => {
  this._activeSockets.delete(socket);
  rl.close();
});
```

两个钩子覆盖不同的失败路径：

1. 正常结束：对端 FIN → readline 收到 EOF → `close` → 从活动集合摘除、destroy 释放 fd。
2. 异常中断：RST、写失败、EPIPE → `socket "error"` 先触发（此时 readline 的 close 不保证随后触发——流被错误终止时，readline 可能永远等不到 EOF）→ 主动 `rl.close()` 反向触发路径 1 的清理。

如果只监听 close：错误路径下 socket 留在 `_activeSockets` 里泄漏，`stop()` 时 destroy 一个已死的 socket；且 error 事件无监听在 Node 里会直接 throw（EventEmitter 的 error 特殊规则）——有 error 监听本身就是防崩必需。如果只监听 error：正常关闭路径清理不掉。

客户端侧（`socket-client.ts:96-102`）同理，且多一层「reject 所有 pending promise」——上卷 Q10 已述「promise 必定 settle」原则。

一句话：close 管寿终正寝，error 管暴毙；两者互为主备，且互相触发对方形成清理闭环（error → rl.close → close handler → destroy）。这是 Node 流编程的标准防御模式。

---

### Q12. 项目为什么用 `readline` 模块做 TCP 行解析，而不是手写 `socket.on("data")` + buffer 切分？

标准解答：

手写切分要正确处理：跨 chunk 的半行、`\r\n` vs `\n`、多字节 UTF-8 字符被 chunk 边界切开（一个 emoji 拆成两个 Buffer，直接 `toString` 就出乱码——需要 `string_decoder`）。这些 readline 全做了：

- `createInterface({input: socket, terminal: false})` 把流包装成行事件源，`terminal: false` 关闭终端专有行为（回显、历史、行编辑）；
- 内部用 `string_decoder` 处理多字节边界；
- 背压自然：readline 遵循流的 pause/resume 语义。

代价：每连接一个 readline 实例有少量开销；且 readline 是「行取向」的，若协议未来升级出二进制帧，就要弃用。但 NDJSON 本来就是行协议——工具与协议形态精确匹配。三处复用同一招：SocketServer（`socket-server.ts:139`）、SocketClient（`socket-client.ts:87`）、MCP 双传输（`mcp/client.ts:78,87`）——MCP stdio 读子进程 stdout、TCP 读 socket，同一 readline 抽象抹平了传输差异，这是它被选中的另一个理由：`input` 接受任何 Readable。

面试加分点：能指出 `terminal:false` 遗漏的后果——readline 默认 terminal 模式会对输入做编辑处理，吞控制字符、响应上下键，协议数据会被污染。以及 readline 的 `crlfDelay: Infinity` 默认值把 `\r\n` 当一行尾的潜在坑（本项目 NDJSON 无 `\r`，未触雷）。

---

### Q13. `ping` 命令为什么绕过 `SocketClient`，直接用裸 `net.createConnection`？

标准解答：

`src/core/commands/ping.ts`（60 行）用裸 TCP 完成一次请求-响应：

1. 生命周期不匹配：SocketClient 是「长连接客户端」——connect、`_startReading` 挂 readline、`onEvent` 订阅、`_pending` 池、`waitForDisconnect`。ping 是「发一帧、收一帧、断开」，拉起全套机制是杀鸡用牛刀，且 client.close() 之外的资源（readline、定时器）都要正确回收，代码反而更长。
2. 失败语义要极简：ping 用于 `core status` 探活，任何环节失败都应该立刻变成「not running」。裸连接上只有三个事件要管：connect（成功）、error（失败）、一次 line（拿到 pong）——失败面最小。
3. 延迟测量纯净：ping 想测的是「TCP 建连 + 一帧往返」，SocketClient 的连接回调与读循环启动交织在一起，埋点反而不准。

设计原则：同一个协议可以有不同重量级的客户端实现——协议（NDJSON + JSON-RPC）是契约，客户端栈是选项。这也侧面验证了协议设计的好处：简单到 60 行就能手写一个兼容客户端，不需要任何共享库。

---

### Q14. 项目里 Zod 的 `safeParse` 和 `parse` 分别在什么场景使用？这个分野背后的错误处理哲学是什么？

标准解答：

`safeParse`——用于「输入不可信，失败是正常分支」：

- `JsonRpcRequestSchema.safeParse(parsed)`（`socket-server.ts:178`）：外部发来的帧，畸形是日常，要转成 `-32600` 协议错误而不是炸连接；
- `tool.paramsModel.safeParse(toolUse.input)`（`invocation.ts:103`）：LLM 生成的参数，错了要变成 `schema_error` 喂回模型自我修正；
- `PackageJsonSchema.safeParse(raw)`（`version.ts:27`）：读到的 package.json 可能不是预期形态，换下一个候选路径。

`parse`——用于「数据应已可信，失败是程序 bug」：

- `BashParamsSchema.parse(params)`（`bash.ts:43`）、`SpawnAgentParamsSchema.parse(params)`（`subagent/tool.ts:106`）：工具 `invoke` 入口的参数已经过 invokeTool 管道的 safeParse 校验（`invocation.ts:102-107`），到工具内部再失败只可能是管道被绕过——此时抛出异常是「快速失败 + 暴露 bug」，而且 invokeTool 的 try/catch 会兜底成 `runtime_error`，不会击穿 loop。

哲学一句话：safeParse 面向「世界」，parse 面向「契约」。边界上用 safeParse 把不可信输入转成可处理的错误值；边界之内，类型已被前一道校验证明，再失败就是内部矛盾，该抛就抛。冗余的第二层 parse（工具内）看似重复，实则是防御纵深——工具可能被未来某条不经 invokeTool 的路径直接调用（测试、subagent 内部），自己保一份校验不依赖调用方的纪律。

---

### Q15. `isRecord` 类型守卫为什么到处出现？直接用 `as Record<string, unknown>` 断言有什么问题？

标准解答：

`isRecord`（`envelope.ts:84-86`）：

```ts
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

`JSON.parse` 返回 `any`（项目里第一时间标成 `unknown`），后续一切字段访问前都要窄化。三个检查缺一不可：

1. `typeof === "object"`——滤掉 string/number/boolean；
2. `!== null`——`typeof null === "object"` 的 JS 著名陷阱；
3. `!Array.isArray`——数组也是 object，但 `params["command"]` 对数组的语义完全错误。

`as` 断言的问题：`as` 是编译期谎言——`JSON.parse(x) as JsonRpcRequest` 让 TS 闭嘴，但运行时数据该是什么还是什么。项目里所有跨边界数据（IPC 帧、MCP 响应、TOML 解析、meta.json、任务文件）都走「unknown → 类型守卫/Zod → 窄化类型」的路径，把「信任」变成可检验的运行时事实而非编译期承诺。

使用密度的分布规律：schema 明确的用 Zod（envelope、commands、events、config），schema 宽松或逐字段渐进消费的用 isRecord + typeof 检查（`session/model.ts` 的 `sessionFromDict`、`task/manager.ts:172-197` 的 `_loadAll`、`app.tsx` 的 `str()/num()` 取值器）——重 schema 用在「全体验证」场景，轻守卫用在「读谁验谁」场景，两种粒度并存是务实而非不一致。

---

## 第三部分：Agent/LLM 工程深入

### Q16. `stop_reason` 的语义矩阵在 `AgentLoop` 里是如何被完整覆盖的？

标准解答：

Anthropic Messages API 的 `stop_reason` 主要取值与 loop 的分支映射（`loop.ts:111-135`）：

| stop_reason                            | 语义                                 | loop 处理                                                                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `end_turn`                             | 模型自然说完（无工具调用或任务完成） | `context.result = text`，`markSuccess()`，循环退出                                                                                                                                                                        |
| `tool_use`                             | 模型请求调用工具                     | 串行 `invokeTool` 每个 toolUse，结果回填，进入下一步                                                                                                                                                                      |
| `max_tokens`                           | 输出达到 max_tokens 上限             | 两个子分支：带 toolUse → 不执行，回填「输出超限，请拆小步骤」的 error tool_result（`loop.ts:119-127`）；不带 toolUse → 落到终止检查，`end_turn` 不命中，`step >= maxSteps` 才可能退出，否则继续循环（模型下一步会接着写） |
| `stop_sequence`                        | 命中自定义停止序列                   | 本项目未设置 stop_sequences，不会出现                                                                                                                                                                                     |
| `pause_turn` / `refusal`（新模型取值） | 长任务暂停 / 安全拒绝                | 未显式处理——走默认路径：`toolUses.length === 0` 时无工具可执行，相当于空转一步，最终靠 `end_turn` 或 `maxSteps` 收敛                                                                                                      |

兜底细节：`finalMessage.stop_reason ?? "end_turn"`（`provider.ts:213`）——SDK 类型允许 null，缺省按成功终止处理。这个默认值的选择值得玩味：未知/缺失按「完成」而非「失败」处理，理由是此时模型的文本已经完整返回，按成功交付结果比报错更符合用户预期；失败偏向（fail-open）选择在用户价值一侧。

面试追问：`max_tokens` 分支为什么不直接把 text 交付？——因为 text 是被截断的半句话，交付半成品会误导；而 toolUse 参数 JSON 也被截断（input 不完整），执行必然出错或出危险——所以正确策略是「告知模型截断发生，让它自己重试更小的一步」，这是把 API 的限制转译成模型可理解的反馈。

---

### Q17. `max_tokens` 为什么定 8192？这个值与上下文工程的关系是什么？

标准解答：

`provider.ts:120` 固定 `max_tokens: 8192`。考量：

1. 输出特征：coding agent 的单步输出 = 一段解释 + 若干 tool_use 调用。解释应简短（详细内容该写进文件而非对话），8192 对「合理的单步」绰绰有余；
2. 失控保险：max_tokens 是单步成本硬顶——模型陷入重复啰嗦循环时，8192 封顶单步损失，配合 `max_steps` 形成双保险（步长 × 步数都有界）；
3. 与截断分支联动：正因为上限存在，Q16 的 max_tokens 分支才必然会被触发到——它是系统的正常工作状态而非纯异常，loop 已经为它设计了自愈路径；
4. latency：max_tokens 不影响 TTFT（首 token 时间），但影响最坏情况下的单步时长；8192 token 在 sonnet 上约 30-60s 全量生成，是用户可容忍的单步上界。

与上下文工程的关系：max_tokens（输出预算）与 contextPercent（输入水位）是这个系统的两个正交仪表——输入侧靠截断 + compaction 管理（上卷 Q18-20），输出侧靠 max_tokens + 截断自愈管理。两侧都有「硬顶 + 软恢复」：输入硬顶是 API 的 200K 窗口（0.8 阈值提前压），输出硬顶是 8192（截断后让模型自己绕开）。所有硬限制都要配一条软恢复路径，这是 agent 系统与传
统 API 客户端的关键差异——传统客户端超了就报错给人，agent 系统超了要报错给模型。

---

### Q18. thinking blocks 的处理有什么讲究？为什么必须回放进历史？

标准解答：

处理链路：`provider.ts:196-202` 从 `finalMessage.content` 里筛出 `type === "thinking"` 的块放进 `thinkingBlocks`；`loop.ts:96-108` 组装 assistant 消息时 `blocks = [...thinkingBlocks, text?, ...toolUses]`——thinking 在前。

必须回放的原因（Anthropic extended thinking 的 API 约束）：

1. 顺序约束：开启 thinking 的模型，其 assistant 消息中 thinking 块必须在 text/tool_use 之前——回放时顺序错了会 400；
2. 完整性约束：在 tool_use 轮次的后续请求里，assistant 回合的 thinking 块必须原样带回（含 `signature` 字段——Anthropic 对 thinking 内容的加密签名，防篡改）。丢掉 thinking 块，API 会报 "thinking blocks must be preserved" 类错误；
3. 语义价值：thinking 是模型的推理草稿，带着它下一步能在相同思路上继续，丢弃会导致模型「忘记自己为什么这么决策」，长链路推理质量下降。

工程注意点：项目里 `thinkingBlocks` 来自 SDK 的 `ThinkingBlock` 类型，包含签名；回放走 `ContentBlockParam` 透传（`loop.ts:96`），不解析、不修改、不展示完整内容——TUI 的 thinking 消息截到 200 字符 dim 显示（`chat.tsx:163`），因为 thinking 内容可能很长且面向模型而非用户。落盘侧 thinking 随 `context.messages` 一起 appendMessages 进 `thread.jsonl`（`runner.ts:294`），恢复历史时经 `isContentBlockParam` 过滤保留（`store.ts:103`）——签名在 JSON 序列化/反序列化中幸存，这是 JSONL 存储格式的隐性要求：thinking 块必须是无损 JSON-roundtrip 的。

---

### Q19. 模型在一次响应里返回多个 `tool_use`（并行工具调用），loop 为什么串行执行而不是 `Promise.all`？

标准解答：

`loop.ts:112-118` 对 `response.toolUses` 是 `for...of` 串行 await。不并发的原因按权重排：

1. 权限挂起的交互语义：每个工具调用可能触发 `permission.requested` 弹窗。并发时 TUI 会同时收到 N 个权限请求，而 `permissionRequest` state 只有一个槽位（`app.tsx:101-105`），弹窗互相覆盖；串行执行让「一次只问用户一件事」天然成立。人机交互带宽是最强约束。
2. 工具副作用的依赖：模型同轮返回的多个调用常有隐式顺序依赖——`write_file(a.go)` 然后 `bash(go run a.go)`。Anthropic 在同一轮返回多个 tool_use 时顺序本身有意义；并发执行第二个可能先于第一个完成。
3. 结果回填的有序性：`addToolResult` 按调用顺序追加进同一条 user 消息（上卷 Q15），串行保证 tool_result 顺序与 tool_use 顺序一致，模型对结果的归因不错位。
4. 故障爆炸半径：`bash(rm -rf build)` + `bash(npm run build)` 并发与串行的风险画像完全不同。

代价与折中：只读工具（read_file/list_dir）并发确实能省时间——这是 Claude Code 后来做的优化（并行只读调用）。本项目选择一律串行换来的是：权限模型简单、回填有序、无锁。若未来要做并发优化，安全路径是「按工具只读性分组」——只读批次并发、写批次串行，且权限 UI 改为多请求队列。

---

### Q20. Compactor 用「字符数 ÷ 4」估算 token，这个近似的误差有多大？为什么这里可以接受？

标准解答：

`compactor.ts:128-136` 的 `_estimateTokens`：`Math.floor(content.length / 4)`（content 为数组时先 `JSON.stringify` 再除 4）。

误差分析：

- 英文文本：1 token ≈ 4 字符，相当准；
- 代码：符号密集，约 3-3.5 字符/token（低估 15-25%）；
- 中文/CJK：约 1.5-2 字符/token（低估 50%+——一段 4000 字的中文实际约 2500-3000 token 而非 1000）；
- JSON.stringify 的开销（引号、转义、括号）又会反向高估一些。

为什么这里可接受——误差只影响展示值，不影响控制决策：

1. `originalTokenEstimate` 的唯一用途是 compact 事件里的「saved N tokens」展示（`compactor.ts:118`、`app.tsx:390`）——给用户一个量级感，偏差 30% 不改变「省了一大截」的结论；
2. 真正的触发决策（`loop.ts:138-147`）用的是 API 返回的精确 `usage.input_tokens` 算 contextPercent，不依赖估算；
3. 压缩前后的正确性由「替换 messages」这个动作保证，与估算无关。

设计原则：估算用在展示路径，精确值用在控制路径。要更准可以接 tiktoken/Anthropic 的 token counting API，但那是几百 KB 的依赖和一次额外网络调用，为一个展示数字不值——工程上这叫「性价比精度」。

追问：`summaryTokens` 哪来的？优先用压缩 LLM 响应的真实 `usage.outputTokens`（`compactor.ts:114`），拿不到才退回 `len/4`——能精确就精确，不能精确才估算，降级顺序体现了同样的原则。

---

### Q21. 工具的 `description` 写作有什么讲究？以 `BashTool` 和 `SpawnAgentTool` 为例分析「面向模型的接口文档」。

标准解答：

工具 description 是写给 LLM 读的使用手册，直接决定模型的工具选择质量。两个范例拆解：

BashTool（`bash.ts:25-28`）：

```
"Execute a shell command and return its output (stdout + stderr combined).
Non-interactive only -- commands requiring user input will hang and time out.
Prefer short, focused commands. Output is truncated at 64 KB."
```

四句话各管一个高频误用：(1) stdout/stderr 合并——告诉模型 `2>` 重定向不必写；(2) 非交互——预防 `apt install`（会卡 `-y` 确认）、`vim`、`ssh` 这类挂死命令；(3) 短命令——预防一条 500 字符的复合管道难以排错；(4) 截断预告——模型看到 `[truncated]` 时知道是设计行为而非故障，不会反复重试同一命令。每一条都是「曾踩过的坑」沉淀。

SpawnAgentTool（`subagent/tool.ts:39-43`）：

```
"The sub-agent starts with a clean context containing only the provided prompt —
it does not inherit the current conversation history."
+ prompt 参数描述: "Complete task description including all context the sub-agent
needs. The sub-agent cannot see the parent conversation, so be explicit."
```

这是接口契约的显式声明：子 agent 的隔离性是实现细节，但必须写进文档，否则模型会假设子 agent「知道我们在聊什么」，传入「继续做刚才那个」这类无上下文 prompt，产出垃圾结果。同样的思路还有 `run_in_background` 参数描述里直接教模型配合 `agent_result` 轮询——把配套工具的使用方式写进文档，等于给模型画了一张 API 流程图。

写作方法论总结（面试可提炼）：

1. 写「什么时候用/什么时候别用」，不止「这是什么」；
2. 预告副作用与限制（截断、超时、隔离），防止模型把设计行为误判为异常；
3. 跨工具的使用模式（spawn → poll）要互相引用；
4. 参数级 description 补全工具级没说完的约束；
5. 描述是迭代的——每次观察到模型误用，都是一条 description 的改进 PR。这是 prompt engineering 最被低估的形态：持续基于失败案例修订接口文档。

---

### Q22. Compactor 调 LLM 压缩时为什么 new 一个独立的 `EventBus`（silent bus）？

标准解答：

`compactor.ts:102-107`：

```ts
// Use silent bus to avoid polluting parent event stream
const silentBus = new EventBus();
const response = await provider.chat(compressRequest, [], silentBus, "compact", {...});
```

`provider.chat` 的签名强制要求一个 bus（token/usage/model_selected 事件的发布目标）。压缩调用发生在 agent loop 的内部——如果复用主 bus：

1. UI 污染：TUI 会把压缩产生的 token 流混进当前 assistant 的流式输出里——用户看到对话框里突然涌出一大段「## 1. Original Goal...」的压缩摘要正文；
2. 状态错乱：`llm.token` 走 `streamingTextRef.current +=`，`llm.usage` 会累加 token 计数器、改写 contextPercent——而压缩刚完成，水位应该降，压缩调用自己的 usage 又会把它顶回去，UI 仪表自相矛盾；
3. trace/run 归属混乱：压缩是 run 的内部实现细节，不是用户可见的「一步」；runId 用 `"compact"` 这个特殊值，即使事件泄漏也能辨认，但最好还是根本不漏。

同时注意第二参数传 `[]`——压缩调用不带工具，防止模型在压缩时突发奇想调工具（那会递归进 invokeTool，灾难）。

模式提炼：这是「组件需要依赖但不该共享实例时，提供一个空实现/隔离实例」——类似日志里的 NullLogger、缓存里的 NullCache。LLMProvider 接口把 bus 设为必传参数（而非可选）也促成了这个显式决策：你必须选择事件去哪，没有默认泄漏。

---

### Q23. `ExecutionContext.messages`（内存）与 `thread.jsonl`（磁盘）的双写时机是怎样的？为什么不每条消息立即落盘？

标准解答：

时序（`runner.ts:183-216,293-294`）：

1. run 开始：`history = store.readMessages(sid)`——全量读入磁盘历史作为 prefill；
2. run 进行：所有新消息（assistant、tool_result）只进内存 `context.messages`；
3. run 结束（finally 之后）：`store.appendMessages(sid, context.messages.slice(prefillLen), runId)`——只追加本次 run 新增的增量（`prefillLen` 是读入时的长度，slice 切出增量）。

为什么不逐条落盘：

1. compaction 会改写内存：run 中途若触发 compact，`context.messages` 被整体替换为「摘要 + ack」两条——如果之前已逐条落盘，磁盘与内存就分叉了：磁盘是全长历史 + 内存是压缩态，下次 run 读回哪个？「run 边界统一落盘」让内存是 run 内的唯一真相，磁盘是 run 间的交接，职责不混。
2. IO 次数：一次 run 几十条消息，逐条 sync 写几十次 vs 末尾批量一次；
3. 崩溃语义清晰：run 中途崩溃 = 这次 run 的消息全丢（磁盘只到上一个 run 边界）——粗粒度但语义干净：要么整个 run 交接，要么当作没发生。逐条落盘的「半个 run」反而引入 Q15（上卷）说的孤儿 tool_use 问题。

代价（要能讲）：run 崩溃丢失本轮工作记录——而 events.jsonl 其实记了全程（EventWriter 是逐事件落盘的），想恢复可以从中重建，但当前没有实现。「消息层粗粒度、事件层细粒度」的双层持久化是本项目的实际形态，与事件溯源里「snapshot + event log」的经典组合同构：thread.jsonl 是 snapshot（run 粒度），events.jsonl 是 log（事件粒度）。

手动 compact 是例外：`SessionManager.compact` 走 `writeCompacted` 直接重写 thread.jsonl（带 .bak 备份，`store.ts:144-157`）——因为它就是以磁盘为作用对象的操作，不在 run 内。

---

### Q24. runId 采用 `YYYYMMDD-HHMMSS-xxxxxx` 格式，这个设计的取舍是什么？

标准解答：

`runs.ts:19-32`：UTC 时间戳（秒级）+ `-` + UUID 去横线后取前 6 个 hex 字符。

设计点：

1. 可排序：时间戳前缀让 runId 字典序 ≈ 时间序——`ls runs/` 直接按时间排，排查时不用看 mtime；这是「sortable ID」家族（ULID、UUIDv7、Snowflake）的共同动机。
2. 人类可读：`20260719-143052-a3f9c2` 一眼看出「7 月 19 日下午 2 点半那次」——调试、口头沟通（"看 14 点那个 run"）成本低。
3. 碰撞概率：同秒内两个 run 靠 6 hex（16^6 ≈ 1677 万）区分，单机秒级并发量下碰撞概率可忽略；但理论上不如全 UUID 安全——这是有意的取舍：多机/高并发场景 6 hex 不够，单机 daemon 场景绰绰有余。
4. UTC 而非本地时区：跨时区团队协作、夏令时切换不产生重复/乱序 runId。
5. 路径安全：只含数字、字母、连字符——直接当目录名（`runs/<runId>/`），无转义问题。

对比备选：纯 UUID（不可读不可排序）、纯时间戳（碰撞）、nanoid（可排序性差）、UUIDv7（可排序但不可读、需要库）。runId 的受众是「排查问题的人」而非「全局唯一性证明」，所以可读性/可排序性优先于唯一性强度。

面试加分点：能指出 session id 的不同选择——`session-<12位hex>`（`session/manager.ts:68`）不带时间戳，因为 session 的排序需求弱（meta.json 里有 createdAt），而 run 是高频排查对象。两种 id 格式差异本身就是「按用途设计标识符」的体现。

---

## 第四部分：可靠性工程

### Q25. PID 文件的管理有哪些细节？`process.kill(pid, 0)` 是在做什么？

标准解答：

`cli/commands/core.ts:14-30` 的 `runningPid()` 是 PID 文件读取的完整防御链：

1. 文件不存在 → null（未运行）；
2. 读出的内容 `Number(raw)` 不是整数 → PID 文件损坏，`unlinkSync` 删掉并返回 null；
3. `process.kill(pid, 0)`——信号 0 不发送任何信号，只做「进程存在性 + 权限」检查：进程活着则调用成功（静默返回），死了则抛 `ESRCH`。这是 POSIX 标准的探活手法；
4. 探活抛异常（ESRCH 进程不存在 / EPERM 权限不足）→ 判定 stale，顺手删除 PID 文件再返回 null。

为什么必须探活而不是信任文件：PID 文件是「写时易、删时难」的状态——daemon 被 `kill -9`（无机会清理）、机器重启，文件都会残留。不探活的话，`core start` 会永远报 "already running" 而实际没有进程。PID 文件只是提示，内核进程表才是真相。

写侧（`cmdCoreStart:41-68`）：先 `runningPid()` 查重 → spawn detached → `unref()` → 写 PID 文件。删侧（`cmdCoreStop:70-80`）：SIGTERM 后删除文件。注意 stop 不等进程真退就删文件——`core start` 紧跟着执行时可能遇到「旧进程还在退出、端口还占着」的窗口，此时 daemon 侧的端口探测（`_probePort`）会兜底报错，两层防御各管一段。

已知缝隙（可主动讲）：PID 复用——daemon 死后 PID 被系统回收分给无关进程，信号 0 探活会通过，`core stop` 会误杀。缓解做法是 PID 文件里同时写启动时间/命令行指纹，stop 前校验 `/proc/<pid>/cmdline`（macOS 用 `ps`）。当前版本接受这个概率极小的风险。

---

### Q26. `kill.mjs` 这个开发辅助脚本的设计是怎样的？

标准解答：

`kill.mjs`（59 行）是「核选项」清理工具，三段式：

1. 按模式 SIGTERM：对三个进程模式（`swifty-code/src/core/app.ts` daemon、`dev.ts`、`tui/bootstrap.ts`）分别 `pgrep -f` 找 PID，找到了就 `kill -TERM`。`pgrep -f` 匹配完整命令行——因为 Node 进程的名字都是 `node`，只能靠脚本路径区分。
2. 等 1 秒，幸存者 SIGKILL：TERM 是给进程优雅退出的机会（daemon 的 drain 逻辑、dev.ts 的清理），1 秒后还活着说明卡死，升级 KILL。
3. 端口清场：`lsof -ti :7437` 找还攥着端口的进程补刀——覆盖「进程换了命令行指纹（如被打包后路径变了）导致 pgrep 漏掉」的情况，以资源（端口）而非身份（进程名）为准做最终清算。

为什么 TERM→KILL 两段而不是直接 KILL：KILL（SIGKILL）不可捕获，daemon 没机会停 MCP 子进程（MCP server 会变成孤儿）、没机会 flush trace；TERM 是请求，KILL 是最后通牒。所有异常处理都是静默 catch——清理工具自己的失败不该再报错（清理的目的就是「让环境干净」，已经干净也算达成）。

与生产路径的分工：`kill.mjs` 只在开发环境用（匹配的是 `src/` 路径指纹）；生产是 `core stop`（PID 文件 + SIGTERM）。两套机制并存说明：开发态的进程拓扑是易碎的（tsx watch、多 dev 实例），需要无状态的兜底清理；生产态的拓扑是收敛的（一个 daemon），可以用有状态（PID 文件）的精确管理。

---

### Q27. `dev.ts` 的进程编排做了哪四件事？它解决的开发体验问题是什么？

标准解答：

`src/dev.ts`（128 行）把「开发时一键跑起全栈」编排成四步：

1. daemon 复用检测（`dev.ts:34`）：先 `isPortInUse`——已跑着就不重复起。这让 `pnpm dev` 可以反复执行，改 core 代码时也可以「dev 起 TUI 连另一个终端里手动跑的 daemon」（`dev:core` 带 watch）。
2. fork daemon + 就绪等待（`dev.ts:42-58`）：`fork(daemonPath, {detached: true, stdio: "ignore", execArgv: ["--import", "tsx"]})` 直接跑 TypeScript 源（tsx loader），`unref()` 后 `waitForDaemon` 每 200ms 探测 TCP 端口，10s 超时。「进程 fork 了 ≠ 服务就绪」——TCP 端口可连接才是就绪信号，这是编排多进程时最重要的同步原语（比 sleep 固定时间可靠，比解析 stdout 日志简单）。
3. 前台跑 TUI（`dev.ts:87`）：TUI 需要终端 raw mode，必须占前台。
4. 退出清理（`dev.ts:65-109`）：SIGINT/SIGTERM/SIGHUP 三信号都挂 `killDaemon`（TERM + 3s 后 KILL 兜底）；TUI 正常退出也走同一清理。只杀自己 fork 的 daemon（`if (!daemon) return`）——复用的 daemon 不动，权责清晰。

解决的问题：双进程架构把「跑起来」从 `node app.js` 变成了「起 daemon、等就绪、起 TUI、退出时按序清理」的四步 dance——没有 dev.ts，每个开发者每天要手敲这些步骤几十次，且必然有人忘了杀 daemon 导致端口占用报错。编排脚本的价值 = 把架构复杂度从开发者日常中抹掉。

细节亮点：`stdio: "ignore"`——daemon 的 stdio 全丢，因为 dev 场景 daemon 日志走文件（`logging.file`）；若继承 stdio，daemon 的输出会污染 TUI 的渲染（两个进程写同一终端是灾难）。

---

### Q28. 项目对「写文件失败」的处理策略是什么？几个案例背后的统一哲学？

标准解答：

四个案例对比：

| 位置                                                 | 失败处理                                               | 理由                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `EventWriter.handle`（`events/writer.ts:36-39`）     | catch 后 `console.error` 静默继续                      | 事件落盘是可观测性增强，磁盘满/权限错不应炸掉 agent 的 run——观测不能影响被观测对象                        |
| `savePolicyFile`（`permissions/manager.ts:164-168`） | catch 吞掉，注释 "Persistence failure is non-blocking" | 权限决策已生效（内存缓存已写），持久化只是锦上添花；因 policy.toml 不可写而拒绝用户已授权的操作是本末倒置 |
| `readMessages` 行级（`session/store.ts:105-107`）    | 单行 JSON 解析失败 `continue` 跳过                     | 崩溃可能留下半行——跳过坏行保全文，比整个文件不可读强                                                      |
| `Compactor._writeSummary`（`compactor.ts:177-180`）  | catch 后 console.error，摘要照样生效                   | summary 文件是留档，内存中的 messages 替换才是本体                                                        |

统一哲学——「区分本体与旁路」：先问「这个写入失败，核心功能还成立吗」。事件落盘、策略持久化、摘要留档都是旁路（observability/durability enhancement），失败降级为日志；而 `writeMeta`、`appendMessage`（thread.jsonl）是本体（会话状态的真相），它们不包 try——失败就抛给上层变成 run 失败，因为带着「以为存了其实没存」的状态继续跑，危害远大于直接失败。

面试话术：可靠性不等于「所有操作都重试/都容错」，而是每个失败点都有明确的归属判断——本体失败要响（fail loud），旁路失败要静（fail silent + log）。这个二分在 code review 里是可执行的检查项。

---

### Q29. `readMessages` 的读入净化管线是怎样的？`_trimOrphanToolUse` 的算法细节？

标准解答：

`store.ts:86-111` 的读入管线四步：

1. 行级容错：`readFileSync().split("\n")`，空行跳过，JSON 解析失败跳过（Q28）；
2. 字段过滤：`role` 必须是 user/assistant；content 为数组时用 `isContentBlockParam`（检查有 `type` 字段）逐块过滤——坏块丢弃，好块保留，比整条消息丢弃精细；
3. `_trimOrphanToolUse`（见下）；
4. `truncateToolResults`：超 8000 字符的 tool_result 砍到 4000 + 标记（上卷 Q20）。

`_trimOrphanToolUse` 算法（`store.ts:114-141`）——目标是「历史末尾不允许有未应答的 tool_use」：

```
pending = Set<tool_use_id>
lastBalanced = 0                      // 最后一个「无悬挂」位置
for idx, msg in messages:
  if assistant: pending.add(每个 tool_use.id)
  if user:      pending.delete(每个 tool_result.tool_use_id)
  if pending.size == 0: lastBalanced = idx + 1
return pending.size > 0 ? messages.slice(0, lastBalanced) : messages
```

一遍扫描维护「悬挂 tool_use 集合」，记录每个全平衡位置；扫描结束若仍有悬挂，裁到最后一个平衡点。注意它裁掉的不只是孤儿 tool_use 那条 assistant 消息，而是其后的所有消息——这是正确的：悬挂点之后的消息都建立在「工具结果存在」的假设上，单独留着语义也不完整。

为什么不修复而是裁掉：理论上可以为每个孤儿 tool_use 合成一条「interrupted」tool_result 来补全（Claude Code 的做法）。裁掉更简单且安全——合成的假结果可能误导模型（它不记得自己调过这个工具）。丢失一点上下文 < 注入虚假上下文。

触发场景：run 中途取消/崩溃（Q23：消息只在 run 边界落盘，但中途崩溃时事件层有记录、消息层没有——孤儿主要来自旧版本 bug、手工编辑文件、或逐条落盘的遗留数据）。防的是磁盘数据不可信。

---

### Q30. `SocketServer.start()` 的端口探测存在 TOCTOU 竞态吗？

标准解答：

`socket-server.ts:81-98`：先 `_probePort()`（尝试 connect，成功=被占用），再 `listen()`。存在经典 TOCTOU（time-of-check-time-of-use）：探测与 listen 之间，另一个进程可以抢先绑定端口，此时 `listen` 触发 `error` 事件。

但分析这个竞态的实际危害与已有兜底：

1. `server.on("error", reject)`（`socket-server.ts:93`）——listen 失败会 reject 启动 promise，`CoreApp.run()` 启动失败退出。竞态窗口内输家 fail fast，不会带病运行；
2. 竞态窗口是毫秒级，且场景限定为「两个 daemon 几乎同时启动」——正常使用（人手动起两个）几乎必然落在探测阶段就被拦；
3. 探测的真正价值不是防竞态，而是给出友好错误："core already running at 127.0.0.1:7437" 比 Node 裸的 `EADDRINUSE` 堆栈可读得多。

彻底解法（如果要聊）：去掉探测，直接 listen 并捕获 `EADDRINUSE` 转成友好错误——check-by-acting 而非 check-then-act，从根上消灭 TOCTOU。当前实现是「友好性优先、竞态靠 listen 错误兜底」的实用主义，可接受。

同类问题在项目里的另一处：`cmdCoreStart` 的 `runningPid()` 探活 → spawn 之间也有窗口（两个 `core start` 并发）。同样由 daemon 侧的端口 listen 做最终仲裁——分布式系统里「抢占单例资源」的正确模式是让仲裁点唯一且原子（bind 系统调用就是原子的），应用层的预先检查只做体验和快速失败。

---

### Q31. `TaskManager` 用模块级变量 `_nextId` 生成任务 ID，这个设计有什么隐患？

标准解答：

`task/manager.ts:8-12`：

```ts
let _nextId = 1;
function generateId(): string {
  return String(_nextId++);
}
```

模块级单例计数器，配 `_loadAll` 恢复时的 `if (numId >= _nextId) _nextId = numId + 1`（`manager.ts:198-199`）——读入已有任务后把计数器推过最大 id，避免重用。

隐患清单：

1. 多 TaskManager 实例共享计数器：每个 run 目录一个 TaskManager（`runner.ts:197`），subagent 又建一个（`subagent/tool.ts:241`）。两个实例交替 create，id 交错增长（1,3,5 / 2,4,6）——功能上不错（id 唯一），但不同 run 的任务 id 序列互相影响，且如果 A 实例 load 了 id=10 的文件而 B 实例正用到 8，A 把全局计数器推到 11 后，B 的下一个 create 跳号到 11。无正确性问题，但行为诡异。
2. 进程重启后的并发恢复窗口：两个 TaskManager 同时 `_loadAll` 同一目录（理论上 subagent 与主 agent 共享 runsDir 下的不同子目录，不冲突，但若未来共享）会有 id 竞争。
3. 测试污染：模块级状态跨测试用例存活——测试 A 建了 5 个任务，测试 B 的 id 从 6 开始，断言 id 的用例变得脆弱（需要隔离模块实例）。
4. id 语义弱：`"1"`, `"2"` 纯序号，跨 run 引用任务时会歧义（每个 run 目录下都有 task_1.json）。

改进方向：计数器改为实例级（constructor 里 `_loadAll` 后取 `max(existing ids) + 1`）；或 id 带 run 前缀（`{runShortId}-{n}`）。模块级可变状态在 Node 里是「每进程单例」，对「每 run 一份」的语义是错配——这是从 Python 移植时容易带入的模式（Python 模块级变量的生命周期直觉类似，但 Python 版若单进程单 TaskManager 就没问题，TS 版多实例场景暴露了它）。

---

## 第五部分：安全再深入

### Q32. 上卷提到「symlink 逃逸」是已知缺口，具体攻击路径是什么？正确的修法是什么？

标准解答：

攻击/事故路径：`read_file` 的检查是 `filePath.split(/[/\\]/).includes("..")`（`read-file.ts:35`）——纯字符串级的 `..` 检测。但路径检查与文件打开之间隔着一个文件系统解析层：

```bash
# 项目目录里存在一个符号链接（可能来自解压的依赖、恶意 PR、或模型自己之前创建的）
ln -s /etc/passwd node_modules/.cache/leak.txt
# 然后模型（或被提示注入的模型）执行：
read_file("node_modules/.cache/leak.txt")
# 路径里没有任何 ".." 组件，检查通过；readFileSync 跟随 symlink 读到 /etc/passwd
```

绝对路径（`/etc/passwd`）同理——`read_file` 的 description 说 "must be relative"，但代码并不强制（没有 `path.isAbsolute` 检查），schema 只要求 string。这是「文档约束」与「代码约束」的落差。

正确修法（分层）：

1. realpath 校验：`fs.realpathSync(filePath)` 解析所有 symlink 得到真实路径，`path.resolve(cwd)` 得工作目录真实路径，然后断言 `real.startsWith(cwdReal + path.sep)`——检查必须在符号链接全部解析之后做，这是文件系统安全的铁律（检查与使用必须是同一个「最终形态」）。
2. 拒绝绝对路径：`path.isAbsolute(filePath)` 直接拒绝（read_file 的契约就是相对路径）。
3. Windows 兼容：realpath 比较前统一大小写/分隔符（Windows 大小写不敏感）。
4. TOCTOU 残余：realpath 检查后、read 前文件被替换成 symlink 仍有理论窗口——彻底方案是 `openat2(RESOLVE_BENEATH | RESOLVE_NO_MAGICLINKS)` 这类 fd 锚定 API，Node 无原生暴露，可用 `O_NOFOLLOW`（`constants.O_NOFOLLOW`）打开最后一级 + 逐级校验。对本项目威胁模型（人在回路、本地工具），做到第 1+2 层已足够。

面试加分点：把这个问题上升为范式——「字符串路径 ≠ 文件」，所有基于字符串的路径校验（`..` 黑名单、前缀匹配）都存在解析层绕过（symlink、硬链接、挂载点、大小写、Unicode 规范化、`./` 自引用）。安全边界要画在「内核完成解析之后」。

---

### Q33. MCP 子进程的环境变量合并（`{...process.env, ...env}`）有什么信息面风险？

标准解答：

`mcp/client.ts:57-60`：

```ts
const mergedEnv = { ...process.env, ...(env ?? {}) };
this._proc = spawn(command, args, { stdio: [...], env: mergedEnv });
```

daemon 的全部环境变量原样遗传给每个 MCP 子进程，用户在 `[[mcp.servers]]` 里配的 `env` 覆盖同名项。

风险面：

1. `ANTHROPIC_API_KEY` 等密钥外溢：daemon 环境里有 API key，而 MCP server 是第三方代码（npm 包、任意二进制）——它可以直接 `process.env.ANTHROPIC_API_KEY` 读走并外发。MCP 的信任模型是「server 代码可信」，但供应链现实是 server 包可能被投毒。
2. 隐式行为改变：`PATH`、`NODE_OPTIONS`、`HTTP_PROXY` 等被继承会改变 server 的运行方式——`NODE_OPTIONS=--inspect` 之类会意外传给 server；proxy 变量可能把 server 的网络流量导向非预期代理。
3. 配置里的明文凭据：`env` 覆盖项写在 `config.toml` 里（如 MCP server 需要自己的 token）——明文落盘文件，权限靠文件系统（应为 0600）。

业界做法与本项目的差距：Claude Code、Cursor 等也是全量继承（便利性优先），但安全基线是白名单继承——只传 `PATH/HOME/LANG/TERM` 等必需变量 + 用户显式配置的项。本项目目前选择便利优先（本地单机信任模型一致），面试时应主动给出加固路径：

```ts
const SAFE_ENV_KEYS = ["PATH", "HOME", "LANG", "TERM", "TMPDIR", "SHELL"];
const base = Object.fromEntries(
  SAFE_ENV_KEYS.filter((k) => process.env[k]).map((k) => [k, process.env[k]!]),
);
const mergedEnv = { ...base, ...(env ?? {}) };
```

原则：子进程环境是攻击面的一部分，默认拒绝、显式允许——和权限系统的 deny-first 设计（上卷 Q24）同一哲学，目前 MCP 这块没对齐。

---

### Q34. trace 的 `include_llm_payload` 开关背后是什么数据治理问题？

标准解答：

`TracingProvider` 记录 LLM 调用的 api_call/api_response，`config.trace.include_llm_payload` 控制是否记录完整请求/响应体（`runner.ts:233-239`、`trace/provider.ts`）。

治理问题：LLM payload 是敏感信息密度最高的数据——包含 system prompt（可能有内部约定）、完整对话历史（用户代码、文件内容、bash 输出里可能有密钥/个人信息）、thinking 内容。trace 文件（`~/.swifty/traces/daemon.jsonl`）是明文 append-only 且无轮转清理的：

1. 二次泄漏面：用户把 trace 发给同事/issue 求助时，把代码和密钥一起发了出去；
2. 密钥驻留：bash 工具执行 `echo $KEY` 或 read_file 读到 `.env` 后，密钥进 LLM 上下文 → 进 trace → 永久留在磁盘；
3. 合规：团队共享开发机/容器里，trace 是跨用户的信息泄漏面。

开关的设计：默认关闭（只记元数据——模型、token 数、latency），需要深度调试时显式打开。这是「可观测性 vs 数据最小化」的经典权衡，默认值站在安全一侧是对的。

还能做的（面试展开）：(a) payload 里已知模式的密钥打码（`sk-ant-*`、`AKIA*` 等正则 scrub）——注意 scrub 要在写入前做，落盘即永久；(b) trace 文件加轮转/保留期（现在只有日志有 10MB×5 轮转，trace 没有）；(c) 文件权限 0600 显式 chmod（Node 默认 umask 通常已是 0600/0644 之间，值得显式化）。

原则：所有「为了调试而记录全量数据」的功能，都要回答三个问题——谁能读到、留多久、含什么秘密。

---

### Q35. `read_file` 的路径穿越检查写法（`split(/[/\\]/).includes("..")`）为什么是这个形态？评估它的完备性。

标准解答：

`read-file.ts:35`：

```ts
if (filePath.split(/[/\\]/).includes("..")) { return toolError(...); }
```

形态分析：按 POSIX 和 Windows 两种分隔符切分，检查精确的 `..` 组件（不是子串）。这避免了两个常见错误：

1. 子串误伤：`"foo..bar/file.txt"`、`"..."` 目录不含 `..` 组件，不误伤——如果用 `filePath.includes("..")` 就会误杀合法文件名；
2. 分隔符覆盖：`..\windows\system32` 在 Windows 形态下也能切出 `..`。

完备性评估（哪些挡得住、哪些挡不住）：

| 输入                           | 结果     | 说明                                                           |
| ------------------------------ | -------- | -------------------------------------------------------------- |
| `../etc/passwd`                | ✓ 拦截   | 标准穿越                                                       |
| `a/../../b`                    | ✓ 拦截   | 中间穿越                                                       |
| `..`                           | ✓ 拦截   | 裸组件                                                         |
| `./../x`                       | ✓ 拦截   | 自引用绕过失败（`.` 是独立组件，`..` 仍被切出）                |
| `%2e%2e/` URL 编码             | — 不适用 | 无 URL 解码环节，原样传给 fs 会 ENOENT，无害                   |
| 绝对路径 `/etc/passwd`         | ✗ 通过   | 无 `..` 组件！description 说"relative"但代码不强制（Q32 已述） |
| symlink 间接穿越               | ✗ 通过   | Q32 已述                                                       |
| Unicode 混淆（`．．`，全角点） | ✓ 无害   | 文件系统不识别全角点为父目录，ENOENT                           |

结论：对「`..` 字符串穿越」这个特定攻击面，写法是正确且无洞的（比很多项目用正则或 startsWith 完备）；但完整的路径安全还需要 Q32 的 realpath 层。安全评审时要分清「这个检查做对了它声明的事」和「它声明的事够不够」——两者都要答。

---

### Q36. `BashTool` 的 `stdio: ["ignore", "pipe", "pipe"]` 每个元素是什么含义？这个配置解决了什么实际故障？

标准解答：

`bash.ts:47-49`：`spawn("sh", ["-c", command], { stdio: ["ignore", "pipe", "pipe"] })`——三个槽位对应子进程的 fd 0/1/2：

1. stdin = `"ignore"`：子进程 stdin 接 `/dev/null`。解决「命令挂死等输入」——`apt`、`git`（要密码）、`rm -i` 这类交互命令若继承了 daemon 的 stdin 会永久阻塞（daemon 是 detached 的，stdin 可能是任何东西）。接 /dev/null 后读 stdin 的命令立即得到 EOF：大多数要么报错退出（好——快速失败进 tool_result），要么按默认行为继续。配合 description 里 "Non-interactive only" 的警告，这是该警告的实现层保障。
2. stdout = `"pipe"`：捕获进 `collectOutput`；
3. stderr = `"pipe"`：合并进同一个 output 字符串——模型看到「命令 + 错误输出」的完整上下文（编译错误、用法提示都在 stderr），不需要 `2>&1` 重定向（description 第一句就是告诉模型这一点）。

与替代品对比：`stdio: "inherit"` 会让命令输出直通 daemon 的 stderr 日志流，模型什么都看不到（且污染日志）；`["pipe","pipe","ignore"]` 丢 stderr 会让模型对失败原因瞎猜、反复重试。stdio 配置 = 工具语义的一部分，不是实现细节。

隐患可提：`output += chunk.toString("utf-8")` 无界拼接——64KB 截断在进程结束后才做（`bash.ts:80-83`），一个 `yes` 命令能在超时前的 60 秒里把内存撑到 GB 级。正确做法是流式截断（累积到上限就不再 append，或 ring buffer）。这是当前实现的一个真实可改进点，面试指出可加分。

---

### Q37. 权限检查（permission check）与工具执行（invoke）之间存在 TOCTOU 窗口吗？以 write_file 为例分析。

标准解答：

时序：用户看到 `write_file(path='src/config.ts')` 弹窗 → 点「Yes」→ `PermissionManager.respond` → `tool.invoke(params)` 执行写。点 Yes 到实际写入之间，参数里的 path 指向的内容可能已被改变（另一个进程/另一个 run 改了该文件，或 path 是 symlink 被重新指向）——用户的授权语义是「允许写我看到的那个文件的那个状态」，执行语义是「写此刻 path 解析到的那个东西」。

本项目的暴露程度：

1. 窗口大小：人是慢速决策者（秒~分钟级），TOCTOU 窗口在权限场景天然巨大——但注意威胁模型：能改文件的「攻击者」主要是模型自己（前一个工具调用）或并发 run。单 session 串行（PromiseMutex）+ 单 run 串行工具执行（Q19）下，同一 session 内窗口内没有并发写者；
2. 跨 session/subagent：后台 subagent（`run_in_background`）与主 run 并发跑，理论上 A 的 write_file 授权后，B 改了同一路径。单机开发工具里这算事故而非攻击；
3. 语义漂移：更深一层——用户批准的是参数快照（`param_preview` 冻结在弹窗里），但 bash 的 `command` 字符串是解释执行的，write_file 的 content 是全量数据，不存在「批准后参数被改」的通道（params 在 `_pending` 里持有的是同一对象引用，无人改写它）——参数本身不可变，变化的是参数指向的世界。

缓解方向（面试展开）：(a) 危险写操作在弹窗里显示目标文件的当前 stat（大小、mtime）甚至 diff 预览（write_file 已存在文件时显示将覆盖什么），把「用户看到的状态」具体化；(b) 执行前 re-check：`write_file` 覆盖已存在文件前比较 mtime 与弹窗时是否一致，变了就要求二次确认（optimistic concurrency 的人工版）；(c) symlink 目标入 preview。

原则：TOCTOU 无法彻底消除，只能用「缩小窗口 + 状态指纹 + 二次确认」把残余风险压到威胁模型可接受的范围内——安全工程的目标是适配威胁模型，不是追求绝对安全。

---

## 第六部分：TUI 进阶

### Q38. `StreamingText` 的「稳定区/不稳定区」分治渲染算法逐行讲一遍。

标准解答：

`chat.tsx:52-98` 是上卷 Q33 的完整实现，比上卷描述的「双换行截断」更精细——它是三段式：

```ts
const boundary = text.lastIndexOf("\n\n");
const stableEnd =
  boundary >= 0 && boundary + 2 > stableRef.current.text.length
    ? boundary + 2
    : stableRef.current.text.length;
```

1. 稳定区只能增长、永不回退：`stableRef` 记录已凝固的文本与其渲染结果（`{text, rendered}`）。新 stableEnd 取「最后一个 `\n\n` 边界」与「历史稳定区长度」的较大者——即使后续文本变化导致 lastIndexOf 前移（理论上不可能，但 ref 守卫是免费的），稳定区也不回退。
2. 稳定区渲染结果被缓存：`if (stableText.length > stableRef.current.text.length)` 才重新 `renderMarkdown(stableText)`——已凝固段落的 markdown 渲染只算一次，后续帧直接拼接 `stableRef.current.rendered`。这解决了上卷 Q57 提到的 marked 全量解析热点：每帧的解析成本只与「新增段落」成正比，不与全文成正比。
3. 不稳定区每帧全量渲染：`unstableText`（最后一个段落）每帧 renderMarkdown——它会抖动（半截语法），但只影响当前段，视觉上「已完成的段落纹丝不动，当前段落动态生长」。

缓存正确性的关键不变量：`rendered` 只由 `stableText` 派生，且 stableText 是 `text` 的前缀——前缀稳定 ⇒ 渲染结果可缓存。markdown 的块级解析在 `\n\n` 边界处满足「前缀封闭」（前面块不依赖后面内容），所以按块缓存是安全的；行内语法（链接引用定义 `[^1]:`）理论上有跨块依赖，实践中极少出现，可接受。

设计提炼：这是增量计算的经典结构——把输入分成「已决前缀 + 未定后缀」，只对前缀做记忆化、后缀全量算。React 的 memo、构建系统的增量编译、编辑器的语法树增量解析都是同构思想。

---

### Q39. `StreamingText` 的「物理行裁剪」是怎么算的？为什么要剥离 ANSI？

标准解答：

`chat.tsx:76-90` 解决的是：流式内容可能比终端屏幕高，Ink 渲染超高内容会把上面顶乱——只显示最后一屏。

算法三步：

1. 逻辑行 → 物理行换算：渲染结果按 `\n` 切分的是逻辑行；终端里超过列宽会软换行，一条逻辑行占 `ceil(visibleLength / cols)` 条物理行。`cols = stdout.columns || 80`，预算 `maxPhysical = rows - 12`（预留输入框、状态栏）；
2. ANSI 剥离：`ANSI_RE` 匹配转义序列（`/\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)/g`——前半 CSI 序列如颜色码，后半 OSC 序列如超链接，BEL 或 ST 终止）。`line.replace(ANSI_RE, "").length` 才是可见宽度——不剥离的话，一个包着 30 字符颜色码的 10 字符单词会被算成 40 列，物理行数严重高估，显示内容被莫名裁短；
3. 从后往前贪心装帧：从最后一行倒序累加物理行数，超预算即停，`cutIndex` 之前的行全部丢弃，以 `"…"` 省略号行替代。

残余误差（主动承认）：可见宽度用 `.length` 计——CJK 全角字符占 2 列但 length 为 1（Q41 展开），中文内容多时物理行数被低估，可能超出一两行。工程上可换 `string-width` 库，但那是为裁剪精度引入依赖的权衡，当前版本接受偏差（Ink 的 Yoga 布局实际渲染时也会 wrap，最终视觉差异很小）。

设计点：裁剪在渲染结果（含 ANSI）上做而不是源文本上——因为用户最终看到的是渲染后形态，「保留最后一屏」的语义必须基于显示坐标系。

---

### Q40. `Spinner` 组件里 `randomVerb()` 为什么要用 `useRef` 固定？`React.memo` 在这里防的是什么？

标准解答：

`spinner.tsx:28`：

```ts
const verbRef = useRef(label ?? randomVerb());
```

为什么不是 `useState` 或直接调用：

1. 直接函数体里 `randomVerb()`——每次重渲染随机换词。Spinner 每秒因 elapsed 更新重渲染（`setInterval` 1s），用户会看到动词每秒乱闪（"Accomplishing… Befuddling… Canoodling…"），滑稽而非优雅；
2. `useState(() => randomVerb())` 也能固定（惰性初始化），但语义不对——这个词永远不 set，不是状态，用 state 会暗示它可变；
3. `useRef` 正确表达「挂载时定一次，生命周期内不变」——这正是 Claude Code 的实际行为（一次 run 一个动词：「Pondering…」「Cogitating…」）。

`React.memo(Spinner)`（`spinner.tsx:63`）：父组件 `App` 因 token 流每 50ms 渲染一次（上卷 Q32），Spinner 的 props（inputTokens/outputTokens）里有两个会随之变化——memo 在 props 不变时跳过渲染。注意这里 props 恰恰是会变的（token 计数），所以 memo 的实际收益发生在「非 token 变化的父渲染」（如 permissionRequest 出现/消失、connectionError 更新时）。memo 不是银弹，是对「props 引用相等」场景的精确优化——动词稳定靠 ref，渲染跳过靠 memo，两者解决不同问题。

附带的计时细节：`elapsed` 用 `performance.now()` 差值而非计数器++——setInterval 在事件循环繁忙时会漂移，差值法保证显示秒数永远接近真实经过时间。

---

### Q41. 上下文水位条的视觉编码（`█/░` + 三档变色）有什么设计依据？终端里处理宽度有什么坑？

标准解答：

`theme.ts:23-37`：

```ts
contextBarFill(pct)  → "█".repeat(filled) + "░".repeat(20 - filled)
contextBarColor(pct) → pct >= 0.85 ? "#fb7185"(红) : pct >= 0.7 ? "#fbbf24"(琥珀) : "#525252"(灰)
```

设计依据：

1. 20 字符宽度：足够分辨率（5%/格）又不挤占行宽；块字符 `█`(U+2588)/`░`(U+2591) 是所有终端字体都有的 Unicode 块元素，无图标字体依赖；
2. 三档阈值 70%/85%：与 compaction 阈值（默认 0.8）形成视觉叙事——灰色「安全区」→ 70% 琥珀「注意区」（接近压缩线）→ 85% 红色加粗（`app.tsx:678` `bold={contextPercent >= 0.85}`）「危险区」（压缩刚触发过或即将频繁触发）。颜色编码与系统行为对齐：用户能把颜色变化和「compact 什么时候发生」建立心智关联；
3. 低水位隐藏：`contextPercent > 0` 才显示（`app.tsx:675`）——界面元素遵循「无信息即无 UI」。

终端宽度的坑（本题真正的考点）：`█`/`░` 在大多数字体里是半角（占 1 列），但在部分 CJK 字体配置下被渲染成全角（2 列）——条会变两倍长，顶破布局。这正是「字符宽度在终端不是字符属性，而是字体+区域设置的属性」的坑。Node 侧有 `wcwidth`/`string-width` 库按 East Asian Width 表计算，但渲染端字体未必遵守。务实选择是这些「伪图形字符」经过长期验证兼容性最好（比 emoji 安全得多——emoji 宽度在终端里是著名的混乱区）。

---

### Q42. `DiffLines` 的 diff 渲染为什么设计成「行首 `+ `/`- ` 判定」？`isDiffTool` 的约定是什么？

标准解答：

`diff-render.tsx`（37 行）：`line.startsWith("+ ")` → 绿、`"- "` → 红、其余 dim。注意判定的是 `"+ "` 带空格，不是裸 `"+"`——避免把内容里以 `+` 开头的正常行（如 `+1 555-1234` 电话、`+++ 加法`）染色。

输入从哪来：`isDiffTool(toolName)`（`is-diff-tool.js`）约定「输出为结构化 diff 文本的工具」——即 EditFile/WriteFile 这类工具的输出格式是 `+ 新行` / `- 旧行` / 上下文明的自定义简洁 diff（不是 unified diff 的 `@@` 头格式）。

设计评价：

1. 工具输出格式与渲染器是约定耦合：工具侧输出「`+ `/`- ` 前缀文本」，渲染侧按前缀染色——没有 schema，纯字符串约定。优点是极简（渲染器 37 行），缺点是工具改输出格式时渲染静默退化（全变 dim，无报错）。这是「display-oriented output」模式：工具的产出本来就是给「人 + 模型」双读的，模型读文本没问题，人通过染色获得结构化视觉；
2. 为什么不用真 unified diff 解析：成本（解析 hunk 头、行号映射）远超收益；agent 场景的 diff 展示不需要精确行号，只需要「增删一目了然」。

面试追问（如何改进）：约定显式化——工具输出第一行加 `[diff]` 标记或走 `tool_result` 的结构化 content（Anthropic 支持 tool_result content 为块数组），渲染器按类型分派，把字符串约定升级为类型约定。

---

### Q43. `PermissionDialog` 的交互设计有哪些细节？Escape 键的语义为什么是 `deny_once`？

标准解答：

`permission-dialog.tsx`（69 行）：

四选项的语义分层（`PERMISSION_OPTIONS`）：

| 选项                                      | action         | 语义                        |
| ----------------------------------------- | -------------- | --------------------------- |
| Yes                                       | `allow_once`   | 本次允许                    |
| Yes, and don't ask again for this pattern | `always_allow` | 允许 + 双写缓存（上卷 Q27） |
| No                                        | `deny_once`    | 本次拒绝                    |
| No, and always deny this pattern          | `always_deny`  | 拒绝 + 双写缓存             |

选项顺序把「最常用」放第一、「最安全默认值」的拒绝放第三——Enter 默认选中第一项（cursor 初值 0），是「信任用户主动性」的选择（对比 sudo 默认 No）；同时始终提供「永久性」的对称选项（always allow / always deny），避免权限系统只有单向记忆。

键盘交互：上/下循环光标（`cursor > 0 ? c-1 : length-1` 回卷）；Enter 确认；Escape = `deny_once`。

Escape 语义分析：Escape 是「我不知道怎么选/我不想理」——映射必须 fail closed：任何模糊输入都导向拒绝。为什么不映射成 allow_once（防呆假设「用户就是嫌烦」）？那会把 Escape 变成绕过安全检查的快捷键。为什么不是 always_deny？Escape 是一次性的犹豫，不该产生持久后果——`deny_once` 是唯一「安全且无副作用」的出口。这个映射和 daemon 侧的超时兜底（60s 未响应 = 拒绝，上卷 Q25）构成一致的安全姿态：系统的所有默认路径都收敛到拒绝。

附带的工程点：弹窗出现时输入框被 disable（`app.tsx:737` `disabled={isRunning || permissionRequest !== null}`），`useInput` 的路由——Ink 里多个 `useInput` 并存，Dialog 和 InputBox 都会收到按键，靠 disabled 标志短路 InputBox 的处理（`input.tsx:207-209`），这是 Ink 应用里「焦点」管理的原始但有效的做法：没有焦点系统，用状态互斥模拟焦点。

---

### Q44. `@` 文件补全的扫描（`scanWorkdirFiles`）有哪些性能与正确性设计？

标准解答：

`at-expand.ts`（63 行）的设计点：

1. 双重过滤：`name.startsWith(".")` 跳过一切点文件/点目录（`.git`、`.env`——顺带避免了把 `.env` 这类敏感文件列进补全）+ `SKIP_DIRS` 17 项黑名单（node_modules、dist、构建缓存、虚拟环境等）——黑名单是「经验性的高噪目录」，点过滤是「语义性的隐藏约定」，两层互补。
2. 2000 条上限 + 提前退出：`out.length >= max` 时 walk 直接 return——防止巨型 monorepo 扫描耗尽启动时间；但注意它是深度优先收集，达到上限后后扫描的目录整体缺失（不是均匀采样）——补全结果偏向目录树前部，monorepo 下可能 `@` 不到深处的包。可改进为「按目录层级 BFS 优先」让浅层文件先满。
3. 错误吞噬：`readdirSync`/`statSync` 全部 try-catch continue——权限不足的目录、扫描中途被删的文件（TOCTOU：readdir 后 stat 时文件已消失）都静默跳过。补全是增强功能，任何失败都不该影响输入。
4. 同步 API：`readdirSync`/`statSync` 阻塞事件循环——2000 文件量级在 SSD 上约几十 ms，发生在首次触发 `@` 时（`input.tsx:158` `fileCacheRef.current ??= scanWorkdirFiles(workDir)` 惰性执行）且只一次（ref 缓存）。代价被「惰性 + 一次性 + 上限」三重控制在可接受范围。
5. 匹配排序（`input.tsx:154-168`）：前缀匹配在前、子串匹配在后、截 8 条——`@app` 时 `app.tsx` 先于 `myapp/utils.ts`，符合输入意图。

正确性边界：扫描结果不随文件系统变化刷新（缓存于 ref）——会话期间新建的文件 `@` 不到。这是「快照一致性」与「实时性」的取舍，补全场景接受快照（重启 TUI 即新）。

---

### Q45. `chat.tsx` 里 `chalk.level = 3` 强制真彩色，以及 `renderMarkdown` 的失败降级，分别是什么考量？

标准解答：

`chalk.level = 3`（`chat.tsx:12`）：chalk 的颜色级别 0=无 / 1=16 色 / 2=256 色 / 3=TrueColor(16M)。chalk 默认做自动检测（TERM、COLORTERM、CI 环境等启发式），但检测有盲区：tmux/screen 里 TERM 被改写、SSH 远端能力不明、CI 被误判为无颜色。项目选择强制 3 级——理由：

1. 2026 年的终端事实标准是 TrueColor（iTerm2/Windows Terminal/VS Code/kitty/alacritty 全支持）；
2. marked-terminal 输出的渐变/灰度色系在低级别下会退化成难看的默认色；
3. 风险可控：真不支持 24bit 的老终端会把颜色序列显示为近似色（多数会四舍五入到 256 色），而非乱码——ANSI 真彩色序列在不支持的终端上通常优雅降级。

代价：失去了对「明确声明无颜色」（NO_COLOR 环境变量）约定的尊重——`FORCE_COLOR`/`NO_COLOR` 标准是社区公约，强制 level 是产品决策压过用户偏好。

`renderMarkdown` 的降级链（`chat.tsx:19-31`）：

```ts
try {
  let result = marked.parse(text);
  if (isPromise(result)) return text;      // marked 配置了异步扩展 → 裸文本
  result = result.replace(/\*\*([^*]+)\*\*/g, ...)  // 后处理：加粗补齐
  result = result.replace(/^( {4})\* /gm, "  - ");  // 后处理：缩进列表标准化
  return result;
} catch { return text; }                   // 任何解析异常 → 裸文本
```

三层防御：(a) isPromise 检查——marked v5+ 在有异步扩展时 parse 返回 Promise，此时退裸文本（防御未来配置变化）；(b) 正则后处理——marked-terminal 对 `bold` 和 4 空格缩进列表的渲染瑕疵打补丁，这是「上游库 90% + 本地补丁 10%」的务实组合；(c) catch-all 降级——流式半截文本可能触发解析异常（Q33），渲染失败永远退化为原始文本显示，绝不让聊天内容消失。

原则：内容显示的优先级高于排版——`renderMarkdown` 的契约是「尽力美化，保底可读」。

---

## 第七部分：移植工程（Python → TypeScript）

### Q46. 源码里大量 `matches Python ...` / `Mirrors Python budget.py:17` 注释，这种移植方法论的价值和具体做法是什么？

标准解答：

这个项目是 Python 版 swifty 的 TypeScript 移植，注释里散布着对齐锚点：

- `budget.ts:33`：`"Mirrors Python budget.py:17"`——截断跳过非 user 消息的规则说明；
- `store.ts:146`：`"Format: YYYYMMDD_HHMMSS (matches Python strftime(...))"`——备份文件时间戳格式；
- `socket-server.ts:37`：`"matches Python peername"`——trace 的 client_id 格式；
- `logging.ts:13`：`"matches Python RotatingFileHandler: 10MB, 5 backups"`；
- `session/manager.ts:203`：`"matches Python session/manager.py order"`——compact 里 busy 检查先于 provider 检查的次序。

方法论价值：

1. 行为对齐的可验证性：移植最大的风险不是「语法翻译错」，而是语义静默漂移——边界条件、次序、格式这些不出现在类型签名里的东西。锚点注释让 review 者能逐条对照两版实现，也让后来的修改者知道「这里的古怪写法是刻意的对齐，不是可以随手优化的怪癖」（比如 busy/provider 的检查次序换了会改变用户看到的错误码）。
2. 测试资产的跨语言复用：错误码（-32010 等）、事件名、wire 格式与 Python 版一致——理论上两端可以互测（TS 客户端 ↔ Python daemon），协议不变量是移植项目的北极星。
3. 修改的传染性标记：改了 TS 版的行为，注释提醒你可能需要同步改 Python 版（或显式决定分叉）——没有锚点，两版会不知不觉长成两个产品。

配套做法（从代码观察）：

- 术语映射表：snake_case ↔ camelCase 的序列化边界集中在 `session/model.ts`（`sessionToDict`/`sessionFromDict`）——磁盘格式保持 snake_case 与 Python 版兼容，内存对象用 camelCase 符合 TS 惯例，翻译层收敛在边界而不是散落各处；
- 标准库对应关系：`asyncio.Lock` → `PromiseMutex`、`RotatingFileHandler` → 手写 rename 链、`pathlib` → `path`、`logging` → pino——每个映射点都有注释；
- 保留不合理的对齐：`truncateToolResults` 里特意注释「跳过非 user 角色是 wire-format 对齐而非冗余防御」——防止有人「优化」掉看似多余的检查。

一句话：移植工程的核心资产不是新代码，而是两版之间的对应关系——锚点注释就是这个关系的显式化。

---

### Q47. Python 与 Node 的异步模型差异，在这次移植中产生了哪些具体的设计映射？

标准解答：

| Python (asyncio)                         | Node (本项目的映射)                                                  | 差异要点                                                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asyncio.Lock`                           | `PromiseMutex`（`session/manager.ts:256`）                           | asyncio Lock 的 `async with` 是 asyncDispose 风格；Node 版手写 acquire/release + finally。且 Python `locked()` 查询 vs Node 新增 `tryAcquire()` 同步语义                                  |
| `asyncio.Event` / 回调注册               | `AbortController/AbortSignal`                                        | Node 生态标准取消原语，比 asyncio 的手动 event set 更结构化                                                                                                                               |
| `asyncio.create_task`（fire-and-forget） | `void promise` + eslint `no-floating-promises`                       | Python 的 task 有事件循环托管；Node 的 floating promise 静默吞异常——项目用 lint 规则强制 `void` 显式标记（`socket-server.ts:154`、`provider.ts:142`），把「我有意不等」变成代码可读的决定 |
| `asyncio.Queue`                          | 无对应，用数组 + promise 链（`PromiseQueue`、`PromiseMutex._queue`） | asyncio 的 Queue 带背压（maxsize await）；Node 版手写                                                                                                                                     |
| `threading.local` / `contextvars`        | `AsyncLocalStorage`（`socket-server.ts:23`）                         | 语义最接近的一对：都是「异步执行上下文内的隐式状态」                                                                                                                                      |
| 同步文件 IO（`open().write()`）          | `appendFileSync` 等同步 API                                          | 两者都选了同步——asyncio 里同步 IO 会阻塞事件循环，Python 版可能用 aiofiles 或接受阻塞；Node 版同样接受事件循环上的同步写（Q57 上卷：崩溃安全性优先）                                      |
| `signal.signal(SIGINT, handler)`         | `process.on("SIGINT")`                                               | 语义等价；但 Node 的 Ctrl+C 在 raw mode TUI 下被 Ink 接管，需要 `exitOnCtrlC: false` 显式让渡                                                                                             |

最深的一个差异——并发模型：asyncio 协程的取消是「抛出 CancelledException 进协程体」，可以在任意 await 点注入；Node 没有内建协程取消，所以项目的取消只能是协作式轮询（loop 每步查 `signal.aborted`）。Python 版理论上能「在 LLM 流式中途注入取消」，Node 版要靠 SDK 的 abort 支持或断开连接模拟——这解释了为什么 Node 版的取消粒度是「步」（`loop.ts:57`），且 AbortSignal 要逐层手工传递（Q8）。

方法论：移植时先建立异步原语的映射表，再逐模块翻译——跳过映射直接翻代码，会在「取消、超时、背压」这三个语义密集区产生大量静默漂移。

---

## 第八部分：测试与质量保障

### Q48. mock LLMProvider 的「预编程响应」模式怎么工作？它为什么是这个项目可测性的基石？

标准解答：

模式（`tests/` 各 e2e 文件）：实现 `LLMProvider` 接口的 mock，内部持有一个 `LlmResponse[]` 队列和调用计数，每次 `chat()` 弹出下一个预编程响应：

```ts
// 概念示意（以 tests 里的 mockReadFileProvider 等为代表）
const responses = [
  { stopReason: "tool_use", toolUses: [{id:"t1", name:"read_file", input:{path:"a.ts"}}], text: "", ... },
  { stopReason: "end_turn", toolUses: [], text: "Done. The file contains ...", ... },
];
mockProvider.chat = async () => responses[callIndex++];
```

为什么这是基石：

1. 非确定性的唯一入口被定点清除：agent 系统里唯一不可预测的是 LLM；mock 掉它之后，AgentLoop 变成确定性状态机——同样的预编程序列必然走同样的步数、调同样的工具、产出同样的消息历史。所有断言可以精确到「第二步结束后 messages[3] 是 tool_result 且 isError=false」。
2. 异常路径可编排：真实 LLM 无法按需复现——「第一步 tool_use 后 max_tokens 截断」「连续三次 schema_error」「压缩阈值穿越」这些分支，预编程序列可以像剧本一样精确编排。
3. 零网络、零成本、毫秒级：47 个测试文件全程无 API 调用，CI 可跑。

配套设计（为什么是「构造注入」赢的）：`AgentRunner` 接受 `provider` 选项（`runner.ts:71,82`）、`AgentLoop` 构造注入（`loop.ts:43`）、`SessionManager` 构造注入（`session/manager.ts:58`）——每一层的 provider 都是参数而非单例/import。如果 provider 是模块级单例或从 env 读取，测试就得靠 `vi.mock` 做模块替换：跨文件污染、并行不安全、隐藏依赖。注入把「这个对象依赖 LLM」写在了构造函数签名上。

面试加分点：指出这个模式在agent 开发里的推广名——「回放测试」（replay testing）：把真实 run 的 LLM 响应录制成 fixtures，回归测试时回放。mock 队列是它的手工版。

---

### Q49. e2e 测试的进程与端口资源管理是怎么做的？

标准解答：

项目的 e2e 起真实 `SocketServer` + 真实 TCP 连接（上卷 Q50），资源管理三招：

1. `freePort()` 辅助：在 ephemeral 范围内找空闲端口（常见实现：listen(0) 让内核分配，取到端口号后关闭再用，或直接探测）。避免「47 个测试文件全打 7437」的冲突，也让测试可以并行（vitest 默认多线程跑文件）——端口是测试间最硬的共享资源。
2. afterEach 全量回收：每个用例结束停 server（`stop()` 内部先 destroy 所有活动 socket 再 close，`socket-server.ts:102-120`）、关 client、清临时目录（runs/sessions 落在 os.tmpdir() 下的随机子目录）。测试失败也要回收——否则一个挂起的 server 会让后续所有用例超时，且 vitest 进程退不掉（句柄保活）。
3. 时间敏感测试用短超时：权限超时 60s 这种，测试里注入 `timeoutS: 0.1` 之类的值，把「超时分支」压缩到毫秒级可测——可配置的超时是可测性的前提，硬编码常量的分支几乎不可测。

深层原则：e2e 的成本是「环境搭建/拆除」——freePort + tmpdir + 短超时把单用例的环境成本压到毫秒级，e2e 才能写得起量。测试金字塔里 e2e 少的真正原因通常不是理念，是环境成本失控；把环境成本打下来，金字塔可以变梯形。

---

### Q50. 覆盖率排除 `tui/`、`dev.ts`、`cli/main.ts`、`core/app.ts` 的判定标准是什么？这个标准如何推广？

标准解答：

`vitest.config.ts` 的排除清单共同特征是「进程胶水层」——它们的代码内容是：

- `tui/`：React 渲染（断言渲染结果需要 ink-testing-library 且断言脆弱）、键盘事件路由；
- `dev.ts`：进程 fork + 信号处理 + 清理时序；
- `cli/main.ts`：argv 解析 + 子命令分发；
- `core/app.ts`：依赖组装 + 启动/停机序列。

判定标准的三个维度：

1. 可测性成本：这些层的逻辑依赖「进程、终端、信号、端口」这类真实 OS 资源，单测要么 mock 到失真（mock 掉 spawn/net 后测的只是 mock 的行为），要么需要重型脚手架（pty、进程沙箱）；
2. 逻辑密度：胶水层几乎没有分支逻辑——`main.ts` 是「if argv[2] === 'ping' then cmdPing」的直译，测它等于测「字符串比较能工作」；
3. 替代验证渠道存在：这些层被手工 e2e（开发者每天 `pnpm dev`）和冒烟测试覆盖——`pnpm dev` 起不来，开发者 30 秒内就会发现，不需要 CI 告诉。

推广标准（可执行的一句话）：「mock 掉所有副作用后还剩多少值得断言的逻辑」——剩下的是「决定/计算/转换」就纳入覆盖率（权限判定、schema、压缩、消息修剪），剩下的是「编排/接线」就排除并在 PR checklist 里手工验证。

风险也要说：排除清单容易变成「困难代码的避难所」——`app.tsx` 里的事件 switch（上卷 Q36）其实有可测逻辑（去重、计数），整体排除意味着它也豁免。更精细的做法是把纯逻辑从胶水层抽出来（如 `str()`/`num()` 取值器、节流累加器抽成独立模块纳入测试），让排除清单只覆盖真正的薄壳——覆盖率策略反向塑造了代码结构，这是它的隐藏价值。

---

## 第九部分：架构演进与开放题

### Q51. 如果事件量放大 100 倍（比如接入了文件监听、LSP 诊断等高频事件源），现有事件系统要先改哪里？

标准解答：

瓶颈分析（按断裂顺序）：

1. EventBus 顺序 await（`events/bus.ts`）：100 倍流量下，慢消费者（落盘、广播）把 publish 延迟顶到事件生产速度之上，`llm.token` 这类用 `void` 的还好，await publish 的路径（runner 的 run.started 等）会累积延迟。第一刀：按事件优先级分通道——高优（run/permission）保持顺序 await，低优（token/log）走 fire-and-forget 队列。
2. 每事件一次 `appendFileSync`（EventWriter）：100 倍 = 每秒数千次同步写。第二刀：批量落盘——内存缓冲 + 每 N 条或每 100ms flush（崩溃窗口从 0 变成 100ms，用 Q28 的「旁路失败可静默」原则可接受）。
3. 每事件一次 JSON.stringify + TCP 写（IpcEventBroadcaster）：第三刀：微批聚合——50ms 窗口内的 token 事件合成一个 `{kind:"event_batch"}` 信封，TUI 侧展开；事件 schema 已有 envelope 层，加 batch 类型是向后兼容扩展（老客户端丢弃未知 kind）。
4. TUI 渲染：已有 50ms 节流（上卷 Q32），100 倍下节流窗口不变、单帧数据量变大——第四刀是 Q38 的稳定区缓存继续生效，渲染成本仍与「新增段落」而非「事件数」成正比，TUI 反而是最不需要改的一层——这就是当初节流设计的复利。

原则：流量放大时先改「每事件固定成本」最高的环节（同步 IO、序列化），后改架构；微批化是性价比最高的单一手段——一次改三个点（bus、落盘、广播）都受益于它。

---

### Q52. 设计 run 的 checkpoint/恢复机制（daemon 崩溃后能从断点继续）。

标准解答：

现状：run 状态全在内存（上卷 Q53 局限 #1），消息只在 run 边界落盘（Q23），崩溃 = 当前 run 白跑。

设计方案（分层）：

1. 可恢复的真源已经存在 80%：`events.jsonl` 记录了 `step.started/finished`、`tool.call_*`、`llm.usage` 全程；`thread.jsonl` 有上一个 run 边界的历史；`.tasks/` 有任务状态。缺的是「当前 run 的 messages 快照」。
2. checkpoint 点选择：每步结束（`step.finished` 发布后）把 `context.messages` 序列化到 `runs/<runId>/checkpoint.json`。步边界的 messages 一定是「平衡的」（无悬挂 tool_use——上卷 Q15 的合并保证），恢复时不需要修剪。
3. 恢复流程：daemon 启动时扫描 `sessions/*/runs/*/`，找「有 checkpoint 但无 `run.finished` 事件」的 run → 标记 `resumable`；客户端发 `session.send_message` 或新 RPC `run.resume(run_id)` → 用 checkpoint 的 messages + 原 goal 重建 ExecutionContext，从 `step+1` 继续。
4. 工具副作用的幂等性问题（真正的难点）：恢复后模型可能「重做」已成功的步骤（write_file 重覆盖、bash 重执行）。缓解：(a) checkpoint 同时记录 `step`，恢复时在 system prompt 注入「以下 N 步已完成」的事件摘要；(b) 更彻底——让模型看 checkpoint 的完整 messages（它本来就在上下文里），模型自然知道做到哪了。消息快照本身就是最好的恢复上下文，这正是「LLM 状态外化」的红利。
5. 与 compaction 的协同：checkpoint 写的是 compact 后的 messages（run 内真相），天然兼容。

成本评估：每步一次 JSON 序列化写（几十~几百 KB，SSD 微秒级）——可接受。优先级：先做「消息 checkpoint + 人工 resume 命令」，自动恢复后续再做。

---

### Q53. 设计一个插件化的第三方工具体系（社区可以发布工具包）。

标准解答：

现状扩展点：内置工具（写代码）+ MCP（配置）——MCP 其实已经是插件协议，所以本题的正确起点是「增强 MCP 生态体验」而非发明新协议：

1. 包格式：`npm 包 + 清单`——`package.json` 里加 `swifty: { "mcpServer": { "command": "node", "args": ["./dist/server.js"] } }`，工具包即 MCP server 包；
2. 发现与安装：`swifty-code plugin install @foo/review-tools` → 下载 + 把 server 配置 merge 进 `~/.swifty/config.toml` 的 `[[mcp.servers]]`（daemon 已会在启动时连接）；
3. 权限分层（关键差异化）：第三方工具默认进 `DEFAULT_POLICIES` 之外的「未知工具一律 ASK」（现状已如此——`evaluate` 对无策略工具返回 ASK，`policy.ts:78`）；插件清单可声明 `suggestedPolicy: "allow"`，用户确认后才写入 policy.toml——权限决策权永远在人；
4. 命名空间：现有 `{server}__{tool}` 前缀（`mcp/tool.ts`）已解决冲突；
5. 安全审查面：MCP server 是本地执行的任意代码——清单里加 `permissions: ["fs", "net", "spawn"]` 声明 + 安装时展示（npm 脚本式风险提示）；沙箱化（Q33 的 env 白名单 + seatbelt）是后续硬化；
6. 版本与协议兼容：server 清单声明 `mcpProtocol: "2024-11-05"`，daemon 握手时已校验版本（`_initialize` 里发出版本号），不兼容报清晰错误。

原则：不重复造轮子——MCP 是业已形成的工具协议标准（Anthropic 推动、多客户端互通），插件体系的增量价值在「分发、发现、权限治理」，不在新协议。

---

### Q54. 设计一个 Web 客户端（浏览器版 TUI），要改架构的哪些部分？

标准解答：

现有架构的适配度：意外地高——这正是双进程 + 显式协议的红利（上卷 Q2/Q56）。

1. 传输层：浏览器没有裸 TCP——daemon 侧加一个 WebSocket transport adapter：WS 帧即 NDJSON 行（一条消息一个 text frame），JSON-RPC/事件信封原样复用。SocketServer 的 handler 注册表、广播器、AsyncLocalStorage 模式都不动，只需把 `net.Socket` 抽象成「可写行、可关闭」的最小接口（`writeLine`/`close`/`onLine`）——这是当初没用 WS（上卷 Q4）的回头成本，但隔离在一个 adapter 里。
2. 鉴权必须补上：WS 端口暴露即公网可连——握手加 token（`?token=` 或首帧 auth），绑定到 session 拥有者（上卷 Q54 的权限拥有者校验同批做）。
3. 前端：React 组件逻辑大面积可移植——`app.tsx` 的事件 switch、节流、去重逻辑原样；渲染层 Ink→DOM（`<Box>`→flex div、`<Text>`→span、markdown 直接 dangerouslySetInnerHTML marked 输出 HTML）；`useInput` → 表单/键盘事件。工作量集中在「终端布局语义 → CSS」的映射（Static 区 → 普通滚动 div，天然更简单——浏览器本来就有 scrollback）。
4. 权限弹窗/补全：PermissionDialog 直译；`@` 文件补全的 `scanWorkdirFiles` 跑在 daemon 侧（Web 客户端不该直接扫服务器文件系统）——需要新 RPC `fs.complete`。
5. streaming：`llm.token` 走 WS 推送，延迟和 loopback TCP 同量级。

结论：改动 = 1 个 transport adapter + 鉴权 + 1 个新前端。daemon、协议语义、agent 核心零改动——这验证了 Q2（上卷）说的「显式协议是二次开发的投资」。

---

### Q55. 为项目补齐可观测性三支柱（metrics / logs / traces）的完整方案。

标准解答：

现状：logs（pino，Q52 上卷）+ traces（自研 daemon.jsonl，Q49 上卷）已有雏形，缺 metrics 和标准化。

1. Metrics（新增）：计数器/直方图导出——`run_total{status}`、`step_duration_seconds`、`tool_calls_total{tool,error_class}`、`llm_tokens_total{model,kind=input|output|cache_read}`、`context_percent` gauge、`permission_requests_total{decision}`。实现：进程内 registry + `metrics.snapshot` RPC + 可选 OTLP 导出；数据源全是现成事件——在 EventBus 上再挂一个 `MetricsHandler`（Q6 上卷的「新增消费方零侵入」直接兑现）。
2. Traces：自研格式 → OpenTelemetry 对齐：`run` 为 root span，`step`/`tool`/`llm.chat` 为子 span（`run_id`/`step`/`tool_name` 作 attribute，latency 已测量）；本地 JSONL 保留（人看），OTLP 导出到 Jaeger/Tempo（机器看）。事件里的 timestamp/run_id 足够构建 span 树——事件模型与 span 模型同构，迁移成本低。
3. Logs：pino 已有；补关联字段——所有 log line 注入 `run_id`/`session_id`（用 AsyncLocalStorage 传，Q8 上卷的模式复用），实现「点 trace 里的一条 tool 失败，直接捞出同期的日志」。

原则：三支柱的价值在关联而非各自为政——`run_id` 就是这个系统的 correlation ID，它已经在事件/ trace/消息里流通，metrics/logs 补齐时只要继续带上它，关联查询免费获得。

---

### Q56. 设计「多 daemon 联邦」：一台机器上的 TUI 能操作另一台机器（构建服务器）上的 agent。

标准解答：

1. 协议层：NDJSON+JSON-RPC 与传输无关（上卷 Q3 的远见）——加 TLS + token 鉴权即可跨机；`SWIFTY_HOST/PORT` 已可配。
2. 路由层（新增）：客户端 profile 概念——`swifty-code tui --remote build-server`；或 daemon 间注册（`remote.add <alias> <host:port>`），事件 scope 加 `remote:` 维度。
3. 工作目录语义（真正的难点）：工具的 path 是相对 daemon 所在机的 cwd——跨机时「我的文件」和「agent 看到的文件」不是同一套。两种产品形态：(a) 远程优先：agent 的操作目标就是远端代码（CI/构建机场景），本地 TUI 只是显示器——语义清晰；(b) 同步工作区：远端 daemon 启动前用 rsync/mutagen 同步目录，结果回传——复杂但符合「本地编辑、远端构建」直觉。先只做 (a)。
4. 权限弹窗归属：`permission.requested` 事件带 session_id，全局订阅的 TUI 都能看到——响应路由要保证「弹窗回到发起 run 的客户端」（现状 scope:run 已支持）。
5. MCP/子 agent：全部在远端 daemon 内部闭合，无跨机泄漏。

结论：传输与协议几乎免费，产品设计（工作区语义）才是成本所在——先收敛到「远程纯执行」场景，联邦就能落地。

---

### Q57. 设计「会话分支」（fork session）：从当前对话的某一步岔开，探索两个方向。

标准解答：

1. 存储层：`thread.jsonl` 是 append-only 线性日志——fork = 复制 session 目录 + 截断 thread.jsonl 到 fork 点（消息行有 `ts` 和 `run_id`，定位截断点容易）；新 branch 写自己的 `meta.json`（`forked_from: <sid>:<msg_index>`）。
2. RPC：`session.fork {session_id, at_message|at_run}` → 新 session_id。PromiseMutex 保护 fork 期间无写入。
3. 上下文兼容：截断点必须在「平衡位置」（Q29 的 `_trimOrphanToolUse` 直接复用，保证截断后无悬挂 tool_use）。
4. notes.md 处理：笔记是线性追加的，fork 时整体复制（分支后各自演化）——可能出现两分支 notes 矛盾，这是产品语义问题（可以后续加 `note` 的 run 归属过滤，数据里已有 runId）。
5. UI：TUI 加 `/fork` 命令 + 分支切换器；价值场景是「让 agent 用方案 A 试一遍，不满意回滚试方案 B」——文件层由 git 兜底回滚，对话层由 fork 提供对照。

洞察：fork 便宜的根源是 append-only + 不可变消息——线性日志的任意前缀都是合法历史。如果当初设计成「就地更新消息」（比如往消息里追加状态字段），fork 就要深拷贝全部并处理引用。不可变数据结构在需要历史操作的系统里总会回收它的设计成本。

---

### Q58. 设计「计划模式」（plan mode）：agent 先只读分析、产出计划，人确认后才允许写操作。

标准解答：

TUI 已有模式切换的 UI 雏形（Shift+Tab 循环 `default → acceptEdits → plan → bypassPermissions`，`input.tsx:31`），但当前 `permMode` 只是本地 state，未下发 daemon——本题就是补全这条链路：

1. 协议：`session.send_message` 加 `mode` 字段（或 `session.set_mode`）；
2. daemon 实现（两种路径）：
   - 路径 A：工具白名单——plan 模式下 `_buildRegistry` 只注册只读工具（read*file/list_dir/task*\*）+ spawn_agent(planner)。复用现有 whitelist 机制（`runner.ts:105`），改动最小；
   - 路径 B：权限策略切换——plan 模式把 bash/write_file 的 default 改为 DENY（而非 ASK），拒绝信息喂回模型「当前为只读计划阶段」。模型看到拒绝会自然转向只读操作。A 更彻底（模型看不到写工具就不会尝试），B 更灵活（模型知道写被禁，会在计划里写"待批准后执行 X"）——推荐 A+B 混合：工具集给只读，system prompt 注入计划模式指令；
3. plan → execute 转换：用户确认计划后切回 default，对话历史保留（计划文本就在 thread 里），模型继续执行——模式只是「注册表 + prompt」的函数，不需要分叉会话；
4. prompt：plan 模式的 system 追加「你在计划阶段：只分析，输出编号计划，等待批准」——对齐模型行为与工具约束，两层一致（只靠工具限制，模型会困惑为什么写失败；只靠 prompt，模型可能跑偏——行为约束必须 prompt 与机制双轨）。

---

### Q59. Token 成本治理：如何让用户对「一次 run 花多少钱」可控、可见、可预警？

标准解答：

1. 可见（已有 70%）：`llm.usage` 事件带 input/output/cache_read/cache_creation 全量（`provider.ts:182-191`），TUI 状态栏显示累计 token（`app.tsx:705`）。补：价格计算——模型价目表（sonnet: $3/M in、$15/M out、cache_read $0.30/M），run 结束显示 `✻ Done · 12.4K↓ 3.1K↑ · $0.09`。cache_read 的省钱效果也要显式呈现（「cache 命中率 87%，节省 $0.41」——让 Q16 上卷的缓存设计价值被用户看见）。
2. 可控：配置 `agent.token_budget`（单 run 上限）——loop 每步检查累计 usage 超预算即 `markFailed("budget_exceeded")`；这是对现有 `max_steps` 熔断的经济维度补充（步数 ≠ 钱：compaction 后步数重置但钱已花）。
3. 可预警：水位事件——累计成本超阈值（如 $1）发 `budget.warning` 事件，TUI 弹确认继续（复用权限弹窗的挂起-响应机制！`PermissionManager` 的模式完全可以泛化成「人机确认管道」）。
4. 历史治理：`~/.swifty/usage.jsonl` 追加每次 run 的 token/成本——`swifty-code stats --month` 出报表，识别「哪个项目/哪种 skill 最烧钱」。

原则：成本治理的数据基础（usage 事件）在设计第一天就埋好了——埋点先行，治理功能是数据的自然衍生品。

---

### Q60. 如果把 swifty-code 开源，还需要补齐哪些工程设施？

标准解答：

按优先级：

1. 协议稳定性承诺：`WIRE_PROTOCOL.md` 加版本号与变更策略（新增事件/方法向后兼容、废弃周期）——第三方客户端依赖它；
2. 贡献者体验：CONTRIBUTING（dev 流程：`pnpm dev`/`pnpm test`/`pnpm doc`）、issue/PR 模板、CI（lint + typecheck + test + 覆盖率门）、代码所有者（core/tui 分域）；
3. 发布工程：changesets 版本管理、npm 发布自动化（双 bundle 的 npm 包布局验证：`bin` 指向、`files` 字段只发 dist）、跨平台 CI（macOS/Linux/Windows——`kill.mjs` 的 `pgrep`/`lsof` 和 bash 工具的 `sh -c` 在 Windows 是已知移植风险，要么文档声明 unix-only 要么修）；
4. 安全治理：SECURITY.md（漏洞报告渠道）、依赖扫描（dependabot）、`ANTHROPIC_API_KEY` 不进 trace/log 的扫描测试（Q34 的治理落地为 CI 检查）；
5. 文档分层：README（5 分钟上手）→ RUNBOOK（运维）→ WIRE_PROTOCOL（集成者）→ 架构文档（这两卷 Q/A 其实就是很好的种子材料）；
6. 法律：LICENSE（Apache-2.0/MIT）、DCO 或 CLA 轻量流程；
7. 社区设施：discussion 区、good-first-issue 标签（`Q31` 的 TaskManager 计数器、`Q36` 的 bash 流式截断这类已知改进点就是现成的候选）。

关键判断：开源的主要工作不是「代码变公开」，而是把「只有作者知道的隐含知识」全部显式化——协议契约、开发流程、安全模型、决策记录（ADR）。代码已经够干净，差的是围绕它的「制度」。

---

## 结语

本卷 60 问与上卷 58 问合计 118 问，覆盖 swifty-code 的全部核心源码。两条主线贯穿始终：

1. 「边界即契约」：进程边界（NDJSON/JSON-RPC/Zod）、信任边界（权限六层、schema 校验、realpath）、语言边界（Python 移植锚点、snake_case 序列化）——这个系统的健壮性几乎全部来自对边界的显式管理。
2. 「为演进而设计」：双进程换来多客户端、事件溯源换来状态恢复、provider 接口换来多模型、MCP 换来工具生态——第九部分的每个演进方案都发现「架构早已预留了接缝」。

面试中若能从任何一个小问题（比如一个 `??=`、一行 `void`）讲回这两条主线，就是对候选人系统观最好的证明。

> 文档版本：基于 `apps/swifty-code` 当前源码（2026-07）编写，上卷 58 问 + 下卷 60 问，合计 118 问。引用行号以源码为准，代码演进后请以 `git log` 对照更新。
