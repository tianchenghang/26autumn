# swifty-code 面试 Q/A 手册（下卷 · 进阶篇）

> 目标读者：高级前端工程师候选人（已通读上卷）
> 项目：`apps/swifty-code`（`@swifty.js/swifty-code`）—— 终端双进程 Coding Agent
> 定位：上卷（`swifty-code-qa.md`，58 问）覆盖架构与核心机制；本卷 60 问转向语言运行时细节、协议边界、可靠性工程、安全深挖、TUI 进阶、移植方法论、测试哲学与架构演进，问题更微观、更考察候选人读源码的颗粒度。
>
> 使用说明：所有回答仍以源码为准（`文件:行号` 引用），与上卷交叉引用处标注「上卷 Qn」。

## 目录

- [第一部分：语言与运行时深挖（Q1–Q8）](#第一部分语言与运行时深挖jstsnodejs)
- [第二部分：协议与边界细节（Q9–Q15）](#第二部分协议与边界细节)
- [第三部分：Agent/LLM 工程深入（Q16–Q24）](#第三部分agentllm-工程深入)
- [第四部分：可靠性工程（Q25–Q31）](#第四部分可靠性工程)
- [第五部分：安全再深入（Q32–Q37）](#第五部分安全再深入)
- [第六部分：TUI 进阶（Q38–Q45）](#第六部分tui-进阶)
- [第七部分：移植工程（Q46–Q47）](#第七部分移植工程python--typescript)
- [第八部分：测试与质量保障（Q48–Q50）](#第八部分测试与质量保障)
- [第九部分：架构演进与开放题（Q51–Q60）](#第九部分架构演进与开放题)

---

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

> 文档版本：基于 `apps/swifty-code` 当前源码（2026-07）编写，共 60 问。引用行号以源码为准，代码演进后请以 `git log` 对照更新。
