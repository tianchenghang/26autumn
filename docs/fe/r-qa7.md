# 杭天铖 - 前端面试题 (A)

---

## 一、项目深挖题

### 1. Sentry SDK — JSError 还原故障现场

SDK 错误数据采集字段结构：

`@swifty/sentry` 的错误捕获采用发布订阅架构，core 模块定义错误事件的 schema，plugin 子模块负责具体采集。一条完整的 JSError 数据包含以下字段：

```typescript
interface ErrorEvent {
  // 基础信息
  type: "error";
  subtype: "js_error" | "resource_error" | "promise_rejection" | "http_error";
  timestamp: number; // 毫秒级时间戳
  url: string; // 当前页面 URL
  referrer: string; // 来源页

  // 错误详情
  error: {
    message: string; // 错误消息
    name: string; // Error 类型（TypeError, ReferenceError 等）
    stack: string; // 完整堆栈（压缩后的）
    filename?: string; // 出错文件
    lineno?: number; // 行号
    colno?: number; // 列号
  };

  // 环境信息
  environment: {
    ua: string; // User-Agent
    viewport: { width: number; height: number };
    language: string;
    platform: string;
  };

  // 用户行为 breadcrumb（错误前的操作轨迹）
  breadcrumbs: Array<{
    type: "click" | "route" | "http" | "console";
    data: any;
    timestamp: number;
  }>;

  // 会话标识（用于关联同一用户的多次上报）
  sessionId: string;
  eventId: string; // 全局唯一的错误事件 ID
}
```

采集入口通过 `window.onerror` 和 `window.addEventListener('unhandledrejection')` 全局监听，再配合 `Proxy` 包装 `XMLHttpRequest` 和 `fetch` 捕获网络请求错误。错误数据经过 LRU 缓存去重（基于 message + stack 的 hash），再进入上报队列。

服务端 source map 还原流程：

服务端收到压缩堆栈后，还原过程分三步：

1. 解析堆栈字符串：使用正则匹配每一帧的 `filename:line:column`，提取出压缩后的源文件 URL、行号、列号。

2. 定位 source map 文件：根据压缩文件的 URL 路径（如 `https://cdn.example.com/static/js/main.a1b2c3.js`），查找对应的 `.map` 文件。source map 的关联方式有两种：
   - 压缩文件末尾的 `//# sourceMappingURL=main.a1b2c3.js.map` 注释
   - HTTP 响应头 `SourceMap: /path/to/main.a1b2c3.js.map`

3. 使用 `source-map` 库进行映射：加载 `.map` 文件（JSON 格式），调用 `SourceMapConsumer.originalPositionFor({ line, column })`，返回原始文件名、行号、列号，以及原始的变量名（如果 source map 的 `names` 数组中有记录）。

还原后的堆栈会附带原始代码上下文（前后各 5 行），方便快速定位问题。

Source map 上传/匹配机制设计：

CI/CD 阶段，在 Webpack/Vite 的构建插件中，构建产物输出后立即将 `.map` 文件上传到服务端（独立于静态资源 CDN 的 source map 存储服务）。上传时携带：

- `release version`（构建版本号，如 git commit hash）
- `file path`（压缩文件的 CDN 路径，用于匹配）

SDK 在初始化时会采集当前页面的 `release version`（通过 meta 标签或构建时注入的全局变量），上报错误时携带该 version。服务端通过 `version + filename` 在存储中精确匹配对应的 `.map` 文件。这样即使多个版本同时运行（灰度场景），也能正确匹配。

Error Boundary 边界定位：

还原后的堆栈能定位到具体文件和行号，但要确定出错的 React 组件边界，需要结合两个信息：

- React 的组件栈（Component Stack）：在 Error Boundary 的 `componentDidCatch` 中，`errorInfo.componentStack` 记录了从出错组件到根组件的完整路径。SDK 的 React Error Boundary 插件会采集这个信息。
- 将 JSError 的文件行号映射到组件后，通过 componentStack 找到最近的 Error Boundary 层，即"捕获该错误的边界"。

追问：去重和限流设计

客户端去重与限流：

- LRU 去重：维护一个容量为 100 的 LRU Cache，key 为 `error.message + error.stack` 的 hash，相同错误在短时间内只上报一次。
- 采样率控制：对同一类错误设置采样率（如 `sampleRate: 0.1`），客户端随机丢弃 90% 的上报。
- 频率限制：滑动窗口限流，每秒最多上报 10 条，超出部分暂存队列，延迟上报。
- 批量上报：将多条错误合并为一个请求体，减少 HTTP 请求数。

服务端去重与限流：

- 指纹聚合：服务端对错误的 `message + stack fingerprint` 计算 hash，相同指纹的错误只保留一条完整记录，其余仅递增计数器。
- 令牌桶限流：每个 `appId + errorFingerprint` 分配独立的令牌桶，防止单一错误类型占满上报通道。
- 告警收敛：10 秒内同一指纹触发超过阈值（如 100 次），触发告警但停止存储详细堆栈，仅记录统计指标。

---

### 2. Sentry SDK — rrweb 屏幕录制原理与性能代价

rrweb 的 DOM 序列化机制：

rrweb 的录制基于两种快照模式：

- 全量快照（Full Snapshot）：在录制开始时生成一次，将整个 DOM 树序列化为一个树形 JSON 结构。每个 DOM 节点被映射为一个 `SerializedNode`，包含：
  - `type`：节点类型（Document, Element, Text, Comment, CDATA）
  - `tagName`、`attributes`（对 Element 节点）
  - `textContent`（对 Text 节点）
  - `id`：rrweb 为每个节点分配的唯一数字 ID，用于后续增量更新时引用
  - 还会记录节点的父子关系和兄弟关系

- 增量快照（Incremental Snapshot）：录制过程中，通过 `MutationObserver` 监听 DOM 变化，仅记录变更的部分。增量事件类型包括：
  - `Mutation`：节点的增删改（`add`、`remove`、`attributes`、`texts`）
  - `MouseMove`：鼠标移动轨迹（采样降频）
  - `ViewportResize`：视口大小变化
  - `Input`：表单输入
  - `Scroll`：滚动位置
  - `TouchMove`：触摸移动
  - `MediaInteraction`：媒体播放控制
  - `StyleSheetRule`：CSS 规则变化

增量快照通过节点的 `id` 关联到全量快照中的具体节点，避免重复传输完整 DOM。

控制 MutationObserver 的序列化开销：

`MutationObserver` 在高频 DOM 变化时（如动画、虚拟滚动）会产生大量 mutation record。我的控制策略：

1. 批量合并：不在每次 callback 触发时立即序列化，而是使用 `requestAnimationFrame` 或固定时间窗口（如 50ms）将多批 mutation record 合并为一次增量快照。
2. 节点过滤：忽略不需要录制的节点（如 `script`、`style`、广告 iframe、SDK 自身的 UI 元素），通过配置 `block class` 和 `ignore selector` 实现。
3. 属性精简：对 `style` 属性做 diff，只记录变化的属性而非整个 style 字符串。
4. 采样降频：对 `MouseMove` 事件使用节流（throttle），每 50ms 最多记录一次坐标。

gzip 压缩的执行位置与性能影响：

gzip 压缩在 Web Worker 中执行。主线程将序列化后的快照数据通过 `postMessage` 发送给 Worker，Worker 使用 `pako`（纯 JS 的 zlib 实现）进行 deflate 压缩，压缩完成后回传给主线程进行上报。

评估方式：

- 使用 `performance.now()` 测量主线程的 `postMessage` 到收到回传的耗时
- 监控 Worker 内的压缩耗时（通过 Worker 内 `performance.now()`，`postMessage` 回传时间指标）
- 典型数据：一帧全量快照约 200KB 原始 → 30KB 压缩后，Worker 内压缩耗时约 10-30ms，主线程阻塞 < 1ms（仅序列化/反序列化 message 的开销）

录制数据分片上报：

- 时间分片：每 10 秒生成一个数据包（包含该时间段内的全量/增量快照）
- 大小分片：单个数据包如果超过 64KB（`sendBeacon` 限制），则拆分为多个 chunk，每个 chunk 携带 `sequence number` 和 `total count`
- 上报策略：优先使用 `sendBeacon`，降级使用 `Image beacon` 和 `fetch keepAlive`（详见第 4 题）
- 服务端收到所有 chunk 后按 sequence number 重组

追问：rrweb 对 Canvas 和 iframe 的处理

Canvas 局限性：

- rrweb 无法直接序列化 Canvas 的像素内容，因为 Canvas 的绘制操作不经过 DOM 变化
- 解决方案：定时（如每秒 2 次）调用 `canvas.toDataURL()` 或 `canvas.toBlob()` 捕获当前帧，作为 `CanvasSnapshot` 增量事件记录。但这会带来额外的 CPU/GPU 开销和较大的数据量
- 对于 WebGL 场景，`toDataURL` 可能返回空白（需要 `preserveDrawingBuffer: true`），这是 rrweb 的已知限制

iframe 局限性：

- 跨域 iframe 受同源策略限制，无法访问其 DOM，rrweb 只能记录 iframe 元素本身的位置和大小
- 同源 iframe 可以通过 `iframe.contentDocument` 访问 DOM，但需要额外初始化一个 rrweb recorder 实例监听子文档的 mutation
- 我的 SDK 对 iframe 场景没有做特殊处理，在配置文档中标注了这一限制，建议业务方在 iframe 内独立部署 SDK 实例

---

### 3. Sentry SDK — 白屏检测关键点采样

关键点的选择与判断逻辑：

白屏检测的核心思路是：在页面加载完成后的关键时机，检查页面可视区域内是否存在有意义的内容节点。

关键点选择——以下 DOM 节点被视为关键点：

1. `document.body` 的直接子节点（排除 `script`、`style`、`noscript`）
2. 可视区域内的关键语义标签：`h1`~`h6`、`p`、`img`、`video`、`canvas`、`[role="button"]`、`input`、`button`、`a`
3. 自定义关键选择器：业务方可通过 SDK 配置传入 `keySelectors`（如 `.main-content`、`#app > div:first-child`）

判断逻辑：

```
1. 获取视口大小 (viewportWidth, viewportHeight)
2. 对每个关键节点调用 getBoundingClientRect()
3. 判断节点是否在可视区域内（top < viewportHeight && bottom > 0 && left < viewportWidth && right > 0）
4. 对可见节点检查：
   - offsetWidth > 0 && offsetHeight > 0（节点有实际尺寸）
   - getComputedStyle(node).visibility !== 'hidden'
   - getComputedStyle(node).display !== 'none'
   - 节点或其子节点包含非空文本，或有可见的背景色/背景图
5. 统计"有效可见节点数"，如果为 0 或低于阈值（如 < 2），判定为白屏
```

区分"真实白屏"和"加载中"：

这是白屏检测的核心难点，我的策略是多轮采样 + 时间窗口判断：

1. 多轮采样：不在单一时间点判断，而是在页面加载后的多个时间点采样（如 DOMContentLoaded 后 1s、2s、4s），如果连续 3 轮都检测到白屏，才判定为"真实白屏"。
2. 加载状态检测：检查 `document.readyState`、是否有未完成的 XHR/fetch 请求（通过 SDK 自身对 XHR/fetch 的 Proxy 监控），如果仍有请求在进行中，标记为"加载中"而非白屏。
3. 白屏持续时间阈值：如果白屏状态持续超过 5 秒，无论是否有请求在进行，都上报为异常白屏。

采样时机与 LCP/FCP 的关系：

- FCP（First Contentful Paint）：通过 `PerformanceObserver` 监听 `paint` 类型的 entry，获取 FCP 时间。FCP 之前不做白屏检测（此时页面确实还在加载）。
- LCP（Largest Contentful Paint）：同样通过 `PerformanceObserver` 获取。如果 LCP 已经触发，说明页面已有内容渲染，白屏检测主要在 FCP ~ LCP 之间和 LCP 之后进行。
- 采样时机：FCP 触发后开始采样，如果 FCP 超过 4 秒未触发，也开始采样（此时 FCP 延迟本身可能就是白屏的信号）。

骨架屏误判处理：

骨架屏（Skeleton）包含 DOM 节点且有尺寸，会被误判为"有内容"，导致真实白屏被漏检。处理方式：

1. 骨架屏特征识别：检查节点的子元素是否匹配骨架屏常见模式——大量 `div` 无文本内容，使用 `background: linear-gradient(...)` 做 shimmer 动画，或者节点带有 `.skeleton`、`.placeholder` 等 class。
2. 内容有效性判定：对骨架屏节点，即使有尺寸和背景色，也不计为"有效可见节点"。
3. 业务方配置：提供 `skeletonSelectors` 配置项，让业务方显式声明骨架屏元素的选择器，检测时排除这些节点。

追问：采样过程的性能影响控制

- DOM 查询开销：`querySelectorAll` 和 `getBoundingClientRect` 都会触发强制 reflow。为减少开销：
  - 将关键点查询限定在 `document.body` 的直接子节点和少量关键选择器，避免全 DOM 树遍历
  - 使用 `IntersectionObserver` 替代轮询式 `getBoundingClientRect` 检测（异步回调，不阻塞主线程）
  - 每轮采样的 DOM 查询控制在 20 个节点以内
- 采样频率：采用指数退避策略（1s → 2s → 4s），最多采样 5 轮，总 DOM 查询开销 < 1ms/轮
- `requestIdleCallback`：将采样逻辑放在浏览器空闲时段执行，避免影响页面渲染

---

### 4. Sentry SDK — 3级降级上报策略

三者的兼容性差异与降级场景：

| 方案                                            | 兼容性                    | 特点                                 | 降级触发场景                  |
| ----------------------------------------------- | ------------------------- | ------------------------------------ | ----------------------------- |
| `navigator.sendBeacon`                          | IE 不支持，现代浏览器支持 | 页面卸载时仍可发送，异步，不阻塞关闭 | 默认首选                      |
| Image Beacon (`new Image().src = url?data=...`) | 全浏览器兼容              | GET 请求，URL 长度受限（~2KB）       | sendBeacon 不可用或返回 false |
| `fetch` + `keepalive: true`                     | 现代浏览器                | 页面卸载后可存活，支持 POST          | 前两者均失败时                |

降级链的执行逻辑：

```
trySendBeacon(data)
  → if fail: tryImageBeacon(data)
    → if fail: tryFetchKeepAlive(data)
      → if fail: storeInLocalStorage(data)
```

`sendBeacon` 返回 `false` 的场景：浏览器队列已满、数据超过大小限制、浏览器不支持。

sendBeacon 的数据大小限制：

- Chrome/Chromium：64KB（65536 bytes）
- Firefox：64KB
- Safari：早期版本无限制，较新版本也趋近 64KB

超过限制时的处理方式：

1. gzip 预压缩：在 Worker 中先压缩数据，大多数情况下压缩后可控制在 64KB 以内
2. 分片拆分：如果压缩后仍超过 64KB，将数据拆分为多个 chunk（每个 chunk ≤ 60KB 留余量），每个 chunk 独立上报，携带 `chunkId`、`totalChunks`、`batchId` 供服务端重组
3. 字段裁剪：在极端情况下（如超长堆栈），截断 breadcrumbs 只保留最近 10 条，精简 user agent 字符串

离线数据存储与网络恢复刷盘：

网络状态监听：

```javascript
window.addEventListener("online", handleOnline);
window.addEventListener("offline", handleOffline);
// 补充：navigator.onLine 在初始化时判断当前状态
```

刷盘时的顺序和幂等性保证：

- 顺序保证：localStorage 中的数据按时间戳排序（key 为 `swifty_queue_${timestamp}_${randomId}`），刷盘时按时间戳升序依次上报。
- 幂等性保证：每条数据携带全局唯一的 `eventId`，服务端对 `eventId` 做去重（使用 Redis SET + TTL 24h），即使客户端重复上报，服务端也只处理一次。
- 上报确认机制：每条数据上报成功后才从 localStorage 删除（先上报，收到 200 响应后再 `removeItem`），如果上报失败则保留等待下次重试。

localStorage 淘汰策略（5MB 容量限制）：

- LRU 淘汰：当 `localStorage` 已用空间超过 4MB（留 1MB 余量）时，按时间戳从旧到新删除数据，直到空间充足。优先淘汰最旧的数据。
- 优先级淘汰：数据按类型标记优先级——性能指标 > 用户行为 > 错误数据。淘汰时先删低优先级的数据（性能指标可以丢弃，错误数据尽量保留）。
- 大小监控：每次写入前调用 `JSON.stringify` 估算当前已用空间，避免超限导致 `QuotaExceededError`。

追问：2000 条离线数据的批量上报防冲击

- 分批上报：将 2000 条数据按每批 50 条分组，共 40 批
- 间隔递增：每批之间设置间隔，采用 `setTimeout` 递增延迟（如 100ms → 200ms → 500ms → 1s → 封顶 2s），避免瞬间打满服务端
- 并发控制：同时最多 3 个上报请求在飞行中，使用信号量（Semaphore）控制
- 服务端限流感知：如果服务端返回 `429 Too Many Requests`，客户端读取 `Retry-After` header，暂停上报并在指定时间后恢复
- 指数退避：连续失败 3 次后，退避时间翻倍，最大退避 30 秒

---

### 5. CLI Coding Agent — ReAct 范式实现

ReAct 的 Thought → Action → Observation 循环编排：

我的 CLI Coding Agent（@swifty/swifty）基于 ReAct 范式，Agent Loop 的核心流程如下：

```
┌─────────────────────────────────────────────┐
│                  Agent Loop                  │
│                                              │
│  1. 构建 messages（System Prompt +           │
│     历史消息 + 压缩后的上下文）               │
│                                              │
│  2. 调用 LLM（流式输出 SSE）                 │
│     ↓                                        │
│  3. 解析 LLM 响应：                          │
│     - 纯文本 → 直接展示给用户，结束循环       │
│     - tool_use block → 进入 Action 执行       │
│     ↓                                        │
│  4. Action 执行：                            │
│     - 权限检查（5 层权限系统）                 │
│     - 路由到具体工具并执行                     │
│     - 捕获执行结果（stdout/stderr/返回值）     │
│     ↓                                        │
│  5. Observation 回注：                       │
│     - 将工具执行结果作为 tool_result 消息      │
│       追加到 messages 数组                     │
│     - 回到步骤 2，继续下一轮循环               │
└─────────────────────────────────────────────┘
```

每一轮循环中，LLM 先输出 Thought（以文本形式表达推理过程），然后输出 Action（工具调用请求），Agent 执行工具后将 Observation（执行结果）回注到上下文中，LLM 在下一轮读取 Observation 继续推理。

Action 解析与工具路由：

LLM 返回的 Action 采用结构化的 tool_use 格式（以 Anthropic Claude API 为例）：

```json
{
  "type": "tool_use",
  "id": "toolu_xxx",
  "name": "ReadFile",
  "input": { "file_path": "/path/to/file" }
}
```

Agent 的工具路由机制：

1. 工具注册表：Agent 初始化时，所有工具（ReadFile、WriteFile、EditFile、Bash、Grep 等）在 Registry 中注册，每个工具定义 name、description、input schema（JSON Schema）。
2. 名称匹配：解析 LLM 返回的 `name` 字段，在 Registry 中查找对应工具实例。
3. 参数校验：使用 Zod 对 `input` 做 schema 校验，确保参数类型和必填项正确。
4. 分发执行：调用工具的 `execute(input)` 方法，返回结果。

工具执行失败的错误回注与自我纠错：

当工具执行失败时，Agent 不会中断循环，而是：

1. 捕获异常，生成 `tool_result` 消息，`is_error: true`，内容为错误信息（如 "File not found: /path/to/file"）
2. 将该 `tool_result` 追加到 messages 中
3. LLM 在下一轮读取到错误信息，根据错误内容调整策略（如换一个路径重新 ReadFile，或改用 Bash 的 find 命令定位文件）

这种方式让 LLM 能够自主纠错，无需人工干预。例如：LLM 尝试 EditFile 失败（因为 old_string 不唯一），读到错误信息后，会扩大 old_string 的上下文范围使其唯一，再次尝试。

Agent Loop 最大迭代次数与防死循环：

- 最大迭代次数：默认 200 轮（可通过配置调整）。超过后强制终止循环，向用户报告 "Max iterations reached"。
- 防死循环检测：
  - 重复动作检测：如果连续 5 轮 LLM 调用了相同的工具且参数完全相同，Agent 会插入一条 system 提示 "You seem to be repeating the same action. Try a different approach."
  - token 预算：累计 token 使用量超过预算（如 500K tokens）时终止
  - 用户中断：用户随时可以按 Ctrl+C 中断循环

追问：Subagent vs Agent Team 架构区别

Subagent（子代理）：

- 架构：主 Agent fork 一个子 Agent 进程，子 Agent 拥有独立的上下文（独立的 messages 数组），但共享工具集和文件系统
- 通信：单向——主 Agent 向子 Agent 下达任务描述，子 Agent 执行完毕后将结果返回给主 Agent，结果作为一条消息注入主 Agent 的上下文
- 生命周期：子 Agent 是阻塞式的（或异步等待），任务完成后即销毁
- 适用场景：可独立完成的子任务（如"搜索所有 .ts 文件中的 TODO 注释"、"运行测试并返回结果"）

Agent Team（团队协作）：

- 架构：多个 Agent 作为平等的 teammate 运行在同一个 Team 中，每个 Agent 有独立的上下文和独立的工具集（可以有不同的 System Prompt 和专业技能）
- 通信：双向——Agent 之间通过 `SendMessage` 工具互发消息，消息进入对方的 mailbox，对方在下一轮循环中读取
- 生命周期：Team 是长期运行的，teammate 可以被动态创建和销毁
- 上下文共享：不直接共享上下文，而是通过消息传递信息。这避免了上下文冲突，但也意味着需要显式通信
- 适用场景：需要多角色协作的复杂任务（如一个 Agent 负责写代码，另一个负责 review，第三个负责测试）

---

### 6. CLI Coding Agent — 上下文压缩与会话持久化

上下文压缩策略：

我的 Agent 采用摘要式压缩 + 选择性截断的混合策略：

1. 消息分类：将历史消息分为三类：
   - 高优先级：当前任务描述、最近 3 轮的工具调用和结果、用户最新的指令
   - 中优先级：较早的工具调用结果（如文件内容、命令输出）
   - 低优先级：系统消息、已完成的子任务结果

2. 摘要式压缩：对中优先级消息，调用 LLM（使用轻量模型降低成本）生成摘要：
   - 文件内容摘要：保留关键函数签名和行号，省略实现细节
   - 命令输出摘要：保留 exit code 和关键输出行，省略冗长的日志
   - 对话历史摘要：提炼用户的意图和已完成的操作步骤

3. 选择性截断：对低优先级消息直接截断丢弃，只保留消息数量的元数据（如"之前执行了 15 次文件操作"）

4. 关键信息锚定：以下信息永远不会被压缩掉：
   - 当前工作目录
   - 用户最后一条消息
   - 最近一次失败的错误信息
   - 当前打开/编辑的文件路径

压缩后信息保证：每次压缩后，生成一段 "Context Summary" 放在 System Prompt 之后，包含：已完成的步骤、当前状态、待办事项。LLM 在每轮推理时都能读到这个 Summary。

LLM 记忆提取与整理：

触发时机：

- 会话结束时：用户退出 Agent 时，自动触发记忆提取
- 定期整理：每 50 轮对话触发一次记忆整理（合并、去重、淘汰过时记忆）
- 显式触发：用户使用 `/memory` 命令手动触发

提取的信息类型：

- 事实类：用户的技术栈偏好（如"偏好 TypeScript 严格模式"、"使用 Bun 而非 npm"）、项目结构特征（如"monorepo 结构，packages/ 下有 3 个子包"）
- 意图类：用户的长期目标（如"正在将项目从 Webpack 迁移到 Vite"）
- 代码状态类：当前项目的关键约定（如"ESLint 使用 flat config"、"提交信息遵循 Conventional Commits"）

记忆以 Markdown 文件持久化到 `~/.swifty/memory/` 目录，下次会话启动时加载到 System Prompt 中。

会话持久化数据结构：

```json
{
  "sessionId": "uuid",
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "workingDirectory": "/path/to/project",
  "messages": [
    { "role": "user", "content": "...", "timestamp": "..." },
    { "role": "assistant", "content": "...", "toolUse": [...], "timestamp": "..." },
    { "role": "tool_result", "toolUseId": "...", "content": "...", "timestamp": "..." }
  ],
  "agentState": {
    "openFiles": ["/path/to/file1", "/path/to/file2"],
    "currentTask": "正在重构 auth 模块",
    "completedSteps": ["读取了 auth.ts", "分析了依赖关系"],
    "pendingActions": ["修改 login 函数", "更新测试"]
  },
  "contextSummary": "用户在重构 auth 模块，已完成依赖分析，准备修改 login 函数...",
  "modelConfig": { "provider": "anthropic", "model": "claude-sonnet-4-20250514" }
}
```

跨会话恢复：

- 用户通过 `swifty --resume` 或选择历史会话恢复
- Agent 启动时加载持久化的 messages 数组，重建完整的对话历史
- `agentState` 中的 `openFiles` 用于恢复文件上下文（自动 ReadFile 最近编辑的文件）
- `contextSummary` 注入 System Prompt，让 LLM 快速理解上次中断的位置

追问：压缩对推理质量的影响与信息损失评估

影响：

- 压缩必然导致信息损失，LLM 可能忘记早期的操作细节，导致重复操作（如重新读取已经读过的文件）
- 摘要式压缩可能丢失关键的细节（如某个函数的具体行号），导致 LLM 在后续引用时需要重新查询

评估方式：

1. 重复操作率：统计压缩后 LLM 重复调用相同工具的比例，作为信息损失的量化指标
2. 任务完成率对比：对比压缩前后的同类任务完成率
3. 人工审查：定期抽查压缩后的 Context Summary，确认关键信息是否被保留
4. A/B 测试：对相同任务使用不同的压缩比例，比较 Agent 完成任务所需的总轮数和 token 消耗

实际使用中，摘要式压缩的信息损失约 10-20%，但节省的 token 成本约 60-70%，是一个合理的 trade-off。

---

### 7. 腾讯 — valgrind 排查 Node + C++ .so 内存泄漏

过滤 V8 引擎的假阳性噪声：

直接在 Node.js 进程上运行 valgrind 会产生大量来自 V8 引擎的"假阳性"报告，因为 V8 有自己的内存管理策略（如预留大块内存、mmap 映射），valgrind 无法理解这些行为。

过滤方式：

1. 使用 suppressions 文件：编写 `.supp` 文件，抑制已知的 V8/Node.js 内存报告模式：

   ```
   {
     v8_heap_reservation
     Memcheck:Leak
     ...
     fun:_ZN2v88internal2Heap*
   }
   {
     node_internal_malloc
     Memcheck:Leak
     ...
     fun:node::*
   }
   ```

   Node.js 官方仓库提供了 `valgrind.supp` 文件，我在此基础上补充了项目特有的 suppression 规则。

2. 环境变量控制：设置 `--v8-pool-size=0` 减少 V8 的线程池，`--max-old-space-size=256` 限制堆大小，减少 V8 的内存分配量从而降低噪声。

3. 进程隔离：将 C++ .so 的调用放到独立的 worker 进程中（通过 Node.js `worker_threads`），对 worker 进程单独跑 valgrind，这样 V8 的干扰更小。

调用方式与泄漏定位：

C++ .so 是通过 N-API (Node-API) 调用的。项目中有一个 TCP 连接池和进程池来调用 C++ 动态链接库进行加解密和表文件解析。

- N-API 调用方式：C++ 侧通过 `napi_create_function` 注册函数，JS 侧通过 `require('bindings')('addon')` 加载
- 内存分配发生在 C++ 堆（使用 `malloc`/`new`），不在 JS Heap 上。N-API 的 `napi_create_buffer` 会在 JS Heap 上分配一个 Buffer，但底层数据指针指向 C++ 堆
- 泄漏发生在 C++ 侧：进程池在调用 C++ .so 后，没有正确释放中间计算过程中分配的临时 buffer

最终定位的泄漏点与修复：

泄漏点在 C++ 的表文件解析函数中：

- 解析函数内部分配了一个临时 buffer 用于解密数据，正常路径会 `free` 这个 buffer
- 但当解密失败（密钥错误）时，函数走了 early return 路径，跳过了 `free` 调用
- 这个分支在正常运行时很少触发，但在某些特定表文件损坏的情况下会频繁命中

修复方案：将裸指针改为 RAII 风格的智能指针（`std::unique_ptr` with custom deleter），确保无论函数从哪个路径返回，buffer 都会被自动释放。

辅助排查手段：

除了 valgrind，还使用了：

1. Node.js heapdump：使用 `v8-profiler-next` 定时拍摄 JS Heap snapshot，对比两个时间点的堆大小变化。发现 JS 侧的 Buffer 对象数量持续增长，指向了 C++ 侧的泄漏（因为 Buffer 的底层内存由 C++ 分配但引用计数在 JS 侧）
2. Allocation Timeline：Chrome DevTools 的 Memory 面板录制 Allocation Timeline，观察到 Buffer 的分配频率异常高且没有被 GC 回收
3. RSS 监控：通过 `process.memoryUsage().rss` 监控进程的物理内存占用，RSS 持续增长但 `heapUsed` 稳定，说明泄漏在 V8 堆外（即 C++ 侧）
4. AddressSanitizer：在 C++ .so 的编译阶段加入 `-fsanitize=address`（ASan），直接编译一个测试程序调用 .so 的解析函数，ASan 能精确报告泄漏的调用栈

追问：V8 隐藏类与对象池

V8 隐藏类（Hidden Class / Shape / Map）：

V8 为每个 JS 对象内部维护一个隐藏的 "Map"（也叫 Shape 或 Hidden Class），它描述了对象的属性布局（有哪些属性、属性的偏移量、属性类型）。

- 当创建对象时，V8 分配一个初始的隐藏类
- 每次添加新属性，V8 会基于当前隐藏类派生出一个新的隐藏类（形成一条转换链 transition chain）
- 如果两个对象按相同顺序添加相同属性，它们会共享同一个隐藏类，V8 可以为它们生成相同的优化机器码（Inline Cache 命中）

Inline Cache 与隐藏类的配合：

当代码访问 `obj.x` 时，V8 生成一个 Inline Cache（IC）：

1. 第一次访问：在隐藏类中查找属性 `x` 的偏移量，缓存 `(隐藏类 → 偏移量)` 的映射
2. 后续访问：直接检查对象的隐藏类是否匹配缓存，如果匹配则直接按偏移量读取，跳过属性查找（速度接近 C++ 结构体访问）

如果对象的属性添加顺序不一致，会导致隐藏类不同，IC 无法命中，退化为通用的字典查找（deoptimize）。

GC 分代与对象晋升：

- Young Generation（新生代）：使用 Scavenge 算法（Cheney 复制），将存活对象从 From Space 复制到 To Space。容量小（约 1-8MB），GC 频繁但速度快
- 晋升条件：对象如果在一次 Scavenge GC 中存活（被复制到 To Space），下次 GC 时如果仍然存活，就会被晋升到 Old Generation。即"存活两次 Scavenge"
- Old Generation（老生代）：使用 Mark-Sweep（标记清除）+ Mark-Compact（标记整理），GC 频率低但耗时较长

对象池优化与 GC：

在腾讯项目中，对象池用于复用频繁创建/销毁的对象（如加解密过程中的中间数据结构），减少 GC 压力：

- 避免被 GC 回收：对象池中的对象被一个长期存活的数组引用，不会被 GC 视为垃圾。池中的对象在使用完毕后不置 null，而是标记为 "available"，等待下次复用
- V8 层面的优化：由于池中对象的结构（属性添加顺序）固定，它们共享相同的隐藏类，Inline Cache 命中率高，属性访问速度快
- 潜在的去优化风险：如果池中对象的属性类型发生变化（如某个属性有时是 number 有时是 string），V8 会将该属性的 IC 标记为 polymorphic 甚至 megamorphic，导致性能下降。解决方案是确保池中对象的属性类型始终一致（使用 TypeScript 约束 + 初始化时赋默认值）

---

### 8. 字节 Data 架构 — JSError LLM 自动修复

完整修复流程：

```
1. 线上 JSError 报警触发
   ↓
2. Sentry 服务端聚合错误，按指纹分组，生成错误报告
   （包含：错误消息、压缩堆栈、source map 还原后的原始堆栈、
    出错代码上下文、错误发生频率、影响用户数）
   ↓
3. 错误报告进入 LLM 修复流水线（异步队列）
   ↓
4. 构建 Prompt 上下文：
   - 还原后的堆栈信息
   - 出错文件的前后 50 行源码
   - 关联的 Git blame 信息（最近修改该文件的人和时间）
   - 历史相似错误的修复案例（从知识库中检索）
   - 相关的 TypeScript 类型定义
   ↓
5. LLM 生成修复 patch（统一的 diff 格式）
   ↓
6. 自动验证：
   - 语法检查（TypeScript 编译通过）
   - 单测运行（相关模块的单元测试）
   - diff 审查规则（不允许删除安全相关代码、不允许修改公共 API 签名）
   ↓
7. 验证通过 → 自动创建 CR（Code Review）
   - 分配 reviewer（优先选择 Git blame 中的最近修改者）
   - 附带修复说明和影响分析
   ↓
8. 人工 Review 通过后合并上线
```

Prompt 上下文包含的信息：

```
System: 你是一个前端代码修复专家。请根据以下 JSError 信息生成修复 patch。

User:
## 错误信息
- 错误类型: TypeError
- 错误消息: Cannot read properties of undefined (reading 'map')
- 发生频率: 过去 24 小时 1200 次
- 影响用户: 约 800 人

## 还原后堆栈
at renderUserList (src/pages/users/UserList.tsx:42:18)
at UserList (src/pages/users/UserList.tsx:35:5)
at renderWithHooks (node_modules/react-dom/...)

## 出错代码上下文（src/pages/users/UserList.tsx:25-60）
[源码片段，标注第 42 行]

## Git Blame 信息
最近修改者: zhangsan@bytedance.com, 2 天前
修改内容: 重构了 API 调用逻辑

## 历史相似修复案例
案例 1: [类似的 null pointer 错误，修复方式是添加可选链]
案例 2: [类似的类型错误，修复方式是添加类型守卫]

## TypeScript 类型定义
[相关接口定义]

请生成统一的 diff 格式修复 patch。
```

修复代码验证：

1. TypeScript 编译检查：在沙箱环境中对修复后的代码执行 `tsc --noEmit`，确保没有类型错误
2. 单元测试：自动运行出错文件相关的测试文件（通过文件名匹配 `*.test.ts` / `*.spec.ts`），确保测试全部通过
3. Diff 审查规则（静态分析）：
   - 修复 patch 不能超过 20 行改动
   - 不能删除 `try-catch` 块
   - 不能修改导出函数的签名
   - 不能引入新的 npm 依赖
4. 沙箱执行：在隔离的沙箱环境中模拟触发该错误的场景，验证修复后不再抛出相同错误

实际落地数据：

- 修复成功率：约 35-40%（LLM 生成的 patch 通过所有验证的比例）
- CR 通过率：通过验证的 patch 中，约 60% 最终被人工 Review 通过
- 整体有效率：约 20-25% 的 JSError 被自动修复并上线
- 主要修复类型：
  - Null/Undefined 访问（添加可选链 `?.`、空值兜底 `?? []`）—— 占比约 45%
  - 类型错误（添加类型守卫、类型断言）—— 占比约 25%
  - API 返回值变更（适配新的数据结构）—— 占比约 15%
  - 边界条件缺失（添加数组长度检查、条件判断）—— 占比约 15%

追问：False Positive 处理与快速回滚

误修处理：

- 人工 Review 是最后的防线。CR 中会高亮 LLM 生成的修改，并标注 "AI Generated Fix" 提示 reviewer 仔细审查
- 自动标记风险等级：如果 patch 涉及核心业务逻辑、支付链路、权限控制等敏感区域，自动提高风险等级，要求更高级别的 reviewer 审批
- 灰度验证：修复上线后先在 1% 流量灰度，监控该错误的复发率和相关指标（如页面错误率、用户投诉量），确认无误后全量

快速回滚机制：

- 每个自动修复的 CR 都会创建一个对应的 revert commit（预备回滚用）
- 如果上线后监控发现异常（如该错误的复发率不降反升，或出现新的关联错误），自动触发回滚——直接 revert 对应的 commit 并快速部署
- 回滚速度目标：从触发回滚到部署完成 < 5 分钟（通过 CI/CD 的快速部署通道）

---

### 9. 阿里妈妈 — 模块联邦接入与开源贡献

模块联邦的核心机制：

模块联邦（Module Federation）是 Webpack 5 引入的特性，核心思想是让独立构建的应用在运行时动态加载和共享模块。

Remote 和 Host 之间的模块共享：

- Remote（远程端）：暴露模块的一方。构建时生成一个 `remoteEntry.js`，其中包含：
  - 暴露模块的映射表（模块名 → chunk ID）
  - `get(module)` 方法：返回一个 Promise，resolve 为模块的工厂函数
  - `init(sharingScope)` 方法：初始化共享依赖的作用域
- Host（宿主端）：消费远程模块的一方。运行时：
  1. 动态加载 remote 的 `remoteEntry.js`（通过 `<script>` 标签或 `import()`）
  2. 调用 `remote.init(__webpack_share_scopes__.default)` 初始化共享依赖
  3. 调用 `remote.get('./Button')` 获取模块工厂
  4. 调用工厂函数得到模块的 exports

Webpack vs Vite 模块联邦的本质区别：

| 维度        | Webpack MF                        | Vite MF (@module-federation/vite) |
| ----------- | --------------------------------- | --------------------------------- |
| 构建模式    | 编译时将模块打包为 chunk          | 利用 ESM 原生模块，开发时不打包   |
| remoteEntry | 编译生成的 JS 文件                | 运行时动态生成的 ESM 入口         |
| 模块加载    | Webpack runtime 的 chunk 加载机制 | 原生 `import()` 动态导入          |
| Shared 依赖 | Webpack 的 sharing scope 机制     | 需要额外的运行时协调层            |
| 开发体验    | 需要完整构建                      | 即时 HMR，开发效率高              |

Webpack 的 MF 深度集成在 Webpack 的 runtime 中（chunk loading、module registry），而 Vite 基于原生 ESM，没有 Webpack 那样的 runtime 层，因此 `@module-federation/vite` 需要在 Vite 插件层自行实现模块注册、加载和共享的运行时逻辑。

我在 @module-federation/vite 中的贡献：

我主要贡献了以下几方面：

1. Vite ESM 兼容的 remoteEntry 生成：Vite 在 dev 模式下使用原生 ESM，不做 bundling。我实现了在 Vite 的 dev server 中动态生成 remoteEntry 的逻辑——拦截对 `/@mf/remoteEntry.js` 的请求，运行时构建暴露模块的映射表并返回 ESM 格式的入口代码。

2. Shared 依赖的去重与单例处理：在 Vite 的 ESM 环境下，`node_modules` 中的依赖通过 Vite 的 dependency pre-bundling（使用 esbuild）处理。我实现了 shared 依赖的版本协商逻辑——在 `init()` 阶段比对 host 和 remote 的 shared 依赖版本，根据 `requiredVersion` 和 `singleton` 配置决定使用哪一方的版本。

3. CSS 隔离：解决了 remote 模块的 CSS 加载到 host 后样式泄漏的问题。通过为 remote 模块的 CSS 添加 scope 前缀（基于模块名的 hash），实现样式隔离。

生产环境中版本冲突与 shared 依赖的单例约束：

- `singleton: true`：标记某个依赖（如 React）在整个应用中只能有一个实例。如果 host 和 remote 都依赖 React，只会加载一份（通常是 host 的版本），避免 React 多实例导致的 hooks 报错
- `requiredVersion`：指定版本范围（semver），如果 remote 要求的版本与 host 提供的版本不兼容（不满足 semver range），会在控制台发出警告，并可能加载两份（取决于 `singleton` 配置）
- `eager: true`：将 shared 依赖打包进当前 chunk（而非异步加载），减少运行时的异步请求，适用于对首屏加载速度要求高的场景

追问：Remote chunk 加载失败的降级与稳定性保证

加载失败降级：

1. 重试机制：加载 `remoteEntry.js` 失败时自动重试 2 次，每次间隔 1 秒
2. Fallback UI：如果重试仍然失败，渲染预定义的 fallback 组件（如"模块加载失败，点击重试"按钮），而不是让整个 host 应用崩溃
3. 版本回退：配置 `fallback` 字段指向一个兜底版本的 remoteEntry URL（如上一个稳定版本的 CDN 地址）
4. 超时控制：设置 5 秒加载超时，超时后触发 fallback

保证 remote 不破坏 host 稳定性：

1. Error Boundary 隔离：每个 remote 组件用独立的 React Error Boundary 包裹，remote 内的 JS 错误不会传播到 host
2. 沙箱执行：remote 模块的代码在独立的执行上下文中运行（通过 `new Function` 或 iframe sandbox），限制其对 host 全局变量的访问
3. 版本锁定：在 CI 阶段对 remote 模块运行 smoke test，通过后才更新 remoteEntry 的 CDN 地址
4. 运行时健康检查：host 定时 ping remote 的健康接口，如果 remote 不健康，自动切换到 fallback 版本

---

## 二、技术原理题

### 10. React Fiber 架构深度解析

Fiber 节点的完整数据结构：

```typescript
interface FiberNode {
  // 节点类型与标识
  tag: WorkTag; // 组件类型（FunctionComponent=0, ClassComponent=1, HostComponent=5 等）
  key: null | string;
  elementType: any; // 对于函数组件是函数本身，对于类组件是 class
  type: any; // 通常等于 elementType（对于 lazy 组件是 resolve 后的值）
  stateNode: any; // 类组件的实例 / DOM 节点 / FiberRoot

  // 树结构（链表而非传统树的 children 数组）
  return: Fiber | null; // 父节点
  child: Fiber | null; // 第一个子节点
  sibling: Fiber | null; // 下一个兄弟节点
  index: number; // 在兄弟节点中的索引

  // 双缓冲（工作单元）
  alternate: Fiber | null; // 指向另一棵 Fiber 树上对应的节点

  // 工作单元状态
  pendingProps: any; // 新的 props
  memoizedProps: any; // 上次渲染的 props
  memoizedState: any; // 上次渲染的 state（函数组件中是 hooks 链表）
  updateQueue: any; // 更新队列（类组件的 setState 队列）

  // 副作用
  flags: Flags; // 副作用标记（Placement, Update, Deletion, Ref 等）
  subtreeFlags: Flags; // 子树的副作用聚合
  deletions: Fiber[] | null; // 需要删除的子节点

  // 调度优先级
  lanes: Lanes; // 当前节点的优先级（lane 模型）
  childLanes: Lanes; // 子节点的优先级

  // ref
  ref: mixed;
  refCleanup: mixed;
}
```

Fiber 节点与 vDOM 节点的关系：

- vDOM 节点是 React Element（`React.createElement` 的返回值），是轻量级的 JS 对象，只包含 `type`、`props`、`key`、`ref`
- Fiber 节点是 React 内部的工作单元，包含 vDOM 节点的全部信息，外加调度、副作用、树结构等运行时信息
- 每次 render 时，React 根据新的 vDOM（JSX 生成的 Element）对比旧的 Fiber 树（Diff），生成新的 Fiber 树

Render 阶段与 Commit 阶段：

Render 阶段（可中断）：

- beginWork：从根节点开始，深度优先遍历 Fiber 树。对每个节点：
  - 对比新旧 props（Diff），计算副作用标记（flags）
  - 对于函数组件：调用函数，处理 hooks（useState, useEffect 等），生成子 vDOM
  - 对于类组件：调用 `render()` 方法，生成子 vDOM
  - 对于 Host 组件（div, span 等）：标记是否需要创建/更新 DOM
  - 返回 child Fiber（继续向下遍历）或 null（到达叶子节点）
- completeWork：从叶子节点向上回溯。对每个节点：
  - 创建/更新 DOM 节点（但不实际挂载到页面）
  - 收集副作用（将需要操作的 DOM 节点串联成 Effect List）
  - 处理 ref

Commit 阶段（不可中断）：

- 将所有收集到的副作用一次性同步执行：
  1. Before Mutation 阶段：执行 `getSnapshotBeforeUpdate`（类组件）
  2. Mutation 阶段：执行 DOM 操作（增删改）、调用 `useInsertionEffect`
  3. Layout 阶段：执行 `useLayoutEffect`、更新 ref、调用 `componentDidMount`/`componentDidUpdate`

Render 可中断的原因：Render 阶段只是计算 Diff 和副作用列表，不涉及真实的 DOM 操作，没有可见的 UI 变化，因此可以安全地中断和恢复。
Commit 不可中断的原因：Commit 阶段操作真实 DOM，如果中断会导致 UI 不一致（如部分节点已更新、部分未更新），用户会看到闪烁或中间状态。

useTransition 和 useDeferredValue 与 Lane 模型：

React 18 的优先级使用 Lane 模型（位掩码表示），不同优先级用不同的 bit 位表示：

- `SyncLane` (0b0000000000000000000000000000001)：最高优先级，同步更新（如 `flushSync`）
- `InputContinuousLane`：连续输入（如拖拽）
- `DefaultLane`：默认优先级（普通 setState）
- `TransitionLane`：过渡更新（`useTransition` 触发）
- `IdleLane`：空闲优先级

`useTransition`：

- `startTransition(callback)` 将 callback 中的 setState 标记为 `TransitionLane` 优先级
- 如果此时有更高优先级的更新（如用户输入），Transition 更新会被中断，让高优先级更新先执行
- Transition 更新完成后，`isPending` 从 `true` 变为 `false`

`useDeferredValue`：

- 将传入的值包装为一个 Deferred 更新（`TransitionLane` 优先级）
- 当有高优先级更新时，Deferred 值保持旧值不变，直到高优先级更新完成后才更新为新值
- 底层实现：`useDeferredValue` 内部使用 `useState` + `useEffect` + `startTransition` 实现延迟更新

Concurrent Mode 下 setState 的打断与恢复：

1. 用户调用 `setState`，React 创建一个 Update 对象，加入 Fiber 节点的 `updateQueue`
2. 开始 Render 阶段，从根节点 beginWork 向下遍历
3. 遍历到一半时，一个更高优先级的更新到来（如 `flushSync` 或用户输入）
4. React 检查当前工作的 lane 与新更新的 lane，发现当前工作优先级较低
5. 打断：React 放弃当前正在构建的 Fiber 树（workInProgress），不提交任何副作用
6. 优先处理高优先级更新，完整执行 Render + Commit
7. 恢复：高优先级更新完成后，React 重新开始低优先级的 Render，从头开始 beginWork（因为高优先级更新可能已经改变了 Fiber 树的结构）
8. 注意：React 不会"从打断点继续"，而是重新开始整个 Render 阶段，但可以复用之前计算过的 Fiber 节点（如果该节点没有变化）

追问：时间切片的调度器实现

React 的时间切片不依赖 `requestIdleCallback`，而是自己实现了一个调度器（`scheduler` 包）。

放弃 `requestIdleCallback` 的原因：

1. 兼容性问题：Safari 长期不支持 `requestIdleCallback`
2. 触发频率不稳定：`requestIdleCallback` 的触发时机由浏览器决定，在某些场景下触发频率过低（如每秒只有几次），无法满足 React 60fps 的需求
3. 空闲时间太短：浏览器分配给 idle callback 的时间通常很短（几毫秒），不足以完成有意义的工作

React 自实现的调度器：

- 使用 `MessageChannel`（降级为 `setTimeout`）实现宏任务调度
- 维护一个最小堆（按过期时间排序的任务队列）
- 每次调度器获得执行权时，从堆顶取出最高优先级的任务执行
- 使用 `performance.now()` 跟踪已用时间，每执行完一个任务检查是否超过时间片（默认 5ms），超过则将控制权让给浏览器
- 这种方式保证了稳定的 5ms 时间切片，且兼容性更好

---

### 11. Vue3 响应式原理深度解析

reactive 与 ref 的底层实现区别：

`reactive`：

```typescript
function reactive(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      track(target, key); // 依赖收集
      const result = Reflect.get(target, key, receiver);
      if (isObject(result)) {
        return reactive(result); // 惰性深度代理
      }
      return result;
    },
    set(target, key, value, receiver) {
      const oldValue = target[key];
      const result = Reflect.set(target, key, value, receiver);
      if (oldValue !== value) {
        trigger(target, key); // 触发更新
      }
      return result;
    },
    deleteProperty(target, key) {
      /* 处理属性删除 */
    },
  });
}
```

- 基于 `Proxy`，只能代理对象（Object、Array、Map、Set 等）
- 无法代理原始类型（string、number、boolean），因为 Proxy 只能拦截对象操作

`ref`：

```typescript
function ref(value) {
  return new RefImpl(value);
}

class RefImpl {
  private _value;
  private _rawValue;
  dep = new Set(); // 依赖集合

  constructor(value) {
    this._rawValue = value;
    this._value = isObject(value) ? reactive(value) : value;
  }

  get value() {
    trackRefValue(this); // 依赖收集
    return this._value;
  }

  set value(newValue) {
    if (newValue !== this._rawValue) {
      this._rawValue = newValue;
      this._value = isObject(newValue) ? reactive(newValue) : newValue;
      triggerRefValue(this); // 触发更新
    }
  }
}
```

- `ref` 使用 `class` 的 getter/setter 实现响应式
- 需要 `.value` 访问的原因：原始类型（如 number）不是对象，无法使用 Proxy。`.value` 的 getter/setter 是唯一能拦截读写操作的方式
- 在模板中使用时，Vue 会自动解包 `.value`，无需手动访问

依赖收集与触发更新的数据结构：

```
targetMap: WeakMap<object, Map<string | symbol, Set<ReactiveEffect>>>

结构示意：
WeakMap {
  target1 (对象引用) → Map {
    "name" → Set [effect1, effect2, computedEffect]
    "age"  → Set [effect1, effect3]
  }
  target2 (对象引用) → Map {
    "count" → Set [effect4]
  }
}
```

- `WeakMap`：以原始对象为 key，弱引用（对象被 GC 时自动清理）
- `Map`：以属性名（key）为 key
- `Set`：存储依赖于该属性的所有 effect（去重）

track（依赖收集）：

```typescript
function track(target, key) {
  if (!activeEffect) return; // 没有正在执行的 effect，无需收集
  let depsMap = targetMap.get(target);
  if (!depsMap) targetMap.set(target, (depsMap = new Map()));
  let dep = depsMap.get(key);
  if (!dep) depsMap.set(key, (dep = new Set()));
  dep.add(activeEffect);
}
```

trigger（触发更新）：

```typescript
function trigger(target, key) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;
  const dep = depsMap.get(key);
  if (dep) {
    const effects = new Set(dep); // 复制一份，避免循环中修改
    effects.forEach((effect) => {
      if (effect.scheduler) {
        effect.scheduler(effect); // 有调度器则走调度（如组件更新走队列）
      } else {
        effect.run(); // 直接执行
      }
    });
  }
}
```

effect、computed、watch 三者关系：

- `effect`：最基础的响应式副作用。`effect(fn)` 会立即执行 `fn`，执行过程中访问的响应式数据会自动收集依赖。当依赖变化时，`fn` 会重新执行。
- `computed`：基于 `effect` 的惰性求值实现。内部创建一个 effect，但不立即执行，而是标记为"脏"（dirty）。只有当读取 `.value` 时才执行计算，且如果依赖没变化则直接返回缓存值。
- `watch`：基于 `effect` 的变化监听实现。接收一个 getter 函数（或 ref/reactive），在 effect 中执行 getter 收集依赖，依赖变化时执行回调函数（而非重新执行 getter）。

computed 惰性求值实现：

```typescript
class ComputedRefImpl {
  private _value;
  private _dirty = true;
  private _effect;

  constructor(getter) {
    this._effect = new ReactiveEffect(getter, {
      lazy: true,
      scheduler: () => {
        if (!this._dirty) {
          this._dirty = true; // 依赖变化时标记为脏
          triggerRefValue(this); // 通知依赖 computed 的 effect 重新执行
        }
      },
    });
  }

  get value() {
    if (this._dirty) {
      this._value = this._effect.run(); // 脏了才重新计算
      this._dirty = false;
    }
    trackRefValue(this); // 收集对 computed 本身的依赖
    return this._value;
  }
}
```

shallowRef 与 shallowReactive：

`shallowRef`：

- 只有 `.value` 的赋值是响应式的，`.value` 内部的属性变化不触发更新
- 实现：setter 中不递归调用 `reactive()`，直接赋值原始值
- 使用场景：大对象（如 Echarts 配置项）不需要深度响应式，避免 Proxy 递归的性能开销

`shallowReactive`：

- 只有第一层属性是响应式的，嵌套对象的属性变化不触发更新
- 实现：Proxy 的 get 拦截中不对返回值递归调用 `reactive()`
- 使用场景：列表数据（如从 API 获取的大量数据），只需要检测列表的增删，不需要检测每条数据的内部变化

追问：深度 Proxy vs 惰性 Proxy，循环引用处理

Vue3 采用惰性 Proxy（Lazy Proxy）：

- `reactive(obj)` 只代理 `obj` 本身，不立即递归代理所有嵌套对象
- 只有当访问嵌套对象时（`get` 拦截触发），才对被访问的子对象创建 Proxy
- 优势：避免初始化时的大量 Proxy 创建开销，对于大对象（如 10000 条记录的列表）性能显著提升

循环引用处理：

- Vue3 内部维护一个 `reactiveMap: WeakMap<object, Proxy>` 缓存已代理的对象
- 在 Proxy 的 `get` 拦截中，对返回值调用 `reactive()` 时，先检查 `reactiveMap` 是否已有缓存
- 如果对象 A 引用了 B，B 又引用了 A：访问 `A.B` 时为 B 创建 Proxy，访问 `B.A` 时发现 A 已在 `reactiveMap` 中，直接返回缓存的 Proxy，不会无限递归

---

### 12. V8 隐藏类与 GC 机制

V8 隐藏类（Hidden Class / Shape / Map）：

V8 隐藏类是 V8 引擎为优化 JS 对象属性访问而引入的内部数据结构。它不是 JS 层面可见的"类"，而是 V8 内部为每个对象维护的一个属性布局描述符。

在属性访问优化中的角色：

JS 对象的属性存储有两种模式：

1. 快属性（Fast Properties）：属性存储在连续的线性数组（properties backing store）中，通过隐藏类记录的偏移量直接访问，O(1) 时间复杂度
2. 字典模式（Dictionary Mode）：属性存储在哈希表中，适用于属性频繁增删的场景，访问速度较慢

隐藏类的作用：

- 记录对象的属性名称、属性在 backing store 中的偏移量、属性的描述符（writable, enumerable, configurable）
- 当两个对象具有相同的隐藏类时，V8 可以为它们生成相同的优化机器码（Inline Cache），避免每次访问都走通用的属性查找路径

属性添加顺序与隐藏类稳定性：

V8 通过 transition chain（转换链）管理隐藏类的派生：

```
初始隐藏类 C0 (空对象 {})
  → 添加 x → C1 ({x})
    → 添加 y → C2 ({x, y})
      → 添加 z → C3 ({x, y, z})
```

- 如果另一个对象也按 `x → y → z` 的顺序添加属性，它会走到同一个 C3，与第一个对象共享隐藏类
- 如果按 `y → x → z` 的顺序添加，会走一条不同的转换链，生成不同的隐藏类 C3'

因此，"按相同顺序添加属性"确保了隐藏类的稳定性，使得同构对象（相同属性布局）可以共享 Inline Cache。

Inline Cache 与隐藏类的配合：

当 JIT 编译 `obj.x` 的机器码时：

1. 生成一段检查代码：`if (obj.hiddenClass === cachedHiddenClass) { return obj.properties[offset]; }`
2. 如果命中（monomorphic IC）：直接按偏移量读取，速度接近 C++ 结构体
3. 如果未命中但有 2-4 个隐藏类（polymorphic IC）：依次检查每个隐藏类
4. 如果超过 4 个（megamorphic IC）：退化为哈希表查找

GC 分代与对象晋升：

Young Generation（新生代）：

- 使用 Scavenge 算法（Cheney's algorithm）
- 将内存分为 From Space 和 To Space
- GC 时：从根对象（全局变量、栈上的引用）出发，标记所有可达对象，将存活对象从 From Space 复制到 To Space，然后交换 From/To
- 优点：GC 时间只与存活对象数量成正比，与总对象数量无关（适合大量短生命周期对象）

晋升条件：

1. 存活两次 Scavenge：对象在一次 Scavenge 中存活并被复制到 To Space 后，如果下次 Scavenge 仍然存活，就晋升到 Old Generation
2. To Space 使用率超过 25%：如果 To Space 已使用超过 25%，新复制的对象直接晋升（避免频繁 Scavenge）

Old Generation（老生代）：

- Mark-Sweep：标记所有可达对象，清除未标记的对象（会产生内存碎片）
- Mark-Compact：标记后将存活对象向一端移动（整理），消除碎片（代价是移动对象需要更新所有引用）
- V8 使用 Incremental Marking（增量标记）和 Concurrent Scavenging（并发回收）来减少 GC 停顿时间

追问：对象池与 V8 优化

对象池避免被 GC 回收的方式：

- 对象池本身是一个长期存活的数组（`pool: MyObject[]`），被全局或模块级变量引用
- 池中的对象被数组引用，GC 的根可达性分析会将它们标记为存活
- 使用完毕的对象不置 null（`pool[i] = null` 会让对象变成垃圾），而是标记 `pool[i]._available = true`，保持引用

V8 层面的优化：

- 池中对象在初始化时按相同顺序添加属性，共享相同的隐藏类，Inline Cache 命中率高
- 属性类型保持一致（如 `x` 始终是 number），确保 IC 是 monomorphic 的

潜在的去优化风险：

- 如果池中对象的某些属性被删除（`delete obj.prop`），V8 会将该对象的隐藏类切换到字典模式，并可能导致整条 transition chain 的 deoptimization
- 如果池中对象的数量很大，且长期不被 GC 回收，可能占用过多 Old Generation 空间，触发更频繁的 Major GC

`%HasFastProperties(obj)` 和 `%DebugPrint(obj)`：

这两个是 V8 的内部调试函数，通过 `--allow-natives-syntax` 参数启用：

- `%HasFastProperties(obj)`：返回 boolean，检查对象是否具有快属性（即属性存储在连续数组中，而非字典模式）
- `%DebugPrint(obj)`：打印对象的 V8 内部信息，包括隐藏类地址、属性存储方式、元素存储方式等

实际项目中的使用：
在腾讯项目中，我用 `%HasFastProperties` 验证了对象池中对象的隐藏类稳定性。在性能基准测试中，确认池中对象在多次复用后仍然保持快属性模式，证明对象池 + 隐藏类的优化方案有效。

---

### 13. 模块联邦原理

Webpack 模块联邦的编译产物：

构建时，Webpack 为 Remote 端生成以下额外产物：

1. `remoteEntry.js`：远程入口文件，结构如下：

```javascript
var moduleMap = {
  "./Button": () => import("./src_Button_js.js"),
  "./Header": () => import("./src_Header_js.js"),
};

var get = (module) => {
  return moduleMap[module]().then((factory) => factory());
};

var init = (shareScope) => {
  // 初始化共享依赖作用域
  // 将 shareScope 中的依赖注册到全局
};

// 暴露给 host 的 API
globalThis["myRemote"] = { get, init };
```

2. 各暴露模块的独立 chunk（如 `src_Button_js.js`）：按需加载的模块代码

Host 端运行时加载流程：

```javascript
// 1. 动态加载 remoteEntry.js
await loadScript("https://cdn.example.com/remoteEntry.js");

// 2. 初始化共享依赖
await __webpack_init_sharing__("default");

// 3. 获取 remote 容器
const container = globalThis["myRemote"];

// 4. 初始化容器（传入共享依赖作用域）
await container.init(__webpack_share_scopes__.default);

// 5. 获取具体模块
const factory = await container.get("./Button");
const Button = factory();

// 6. 使用模块
<Button />;
```

API 调用顺序：

```
__webpack_init_sharing__("default")     // 初始化 host 的共享作用域
  → container.init(shareScope)           // remote 注册共享依赖
    → container.get("./Module")          // 获取模块工厂
      → factory()                        // 执行工厂函数，得到 exports
```

shared 依赖配置项的影响：

| 配置项                       | 作用                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `singleton: true`            | 整个应用只加载一份该依赖。如 React 必须 singleton，否则多实例导致 hooks 报错                    |
| `requiredVersion: "^18.0.0"` | 指定版本范围。如果 host 提供的版本不满足，remote 会加载自己的版本（如果非 singleton）或发出警告 |
| `eager: true`                | 将共享依赖同步打包进当前 chunk，不产生异步请求。适用于首屏关键依赖，减少 waterfall              |

Vite 模块联邦为什么不能复用 Webpack 的实现：

1. 无 Webpack Runtime：Vite 没有 Webpack 的 runtime（chunk loading、module registry、HMR runtime），Webpack MF 深度依赖这些运行时机制
2. ESM vs Bundle：Vite 的 dev 模式使用原生 ESM（每个模块是一个独立的 HTTP 请求），没有"chunk"的概念。Webpack MF 的 `remoteEntry.js` 内部使用 Webpack 的 chunk loading 机制加载子 chunk，在 Vite 中需要用 ESM 的 `import()` 替代
3. 依赖预构建：Vite 使用 esbuild 对 `node_modules` 进行依赖预构建（pre-bundling），这与 Webpack 的模块解析方式不同，shared 依赖的版本协商需要在预构建阶段介入
4. HMR 差异：Vite 的 HMR 基于 ESM 的热更新（直接替换模块），Webpack 的 HMR 基于 chunk 级别的热更新。MF 的 remote 模块更新需要适配 Vite 的 HMR 协议

追问：CSS-in-JS 的样式隔离

如果 remote 模块使用 CSS-in-JS（如 styled-components、emotion），加载到 host 后：

潜在问题：

- CSS-in-JS 在运行时生成 `<style>` 标签插入到 `<head>` 中，这些样式是全局的
- 如果 remote 和 host 使用了相同的 class name（如都使用了 `.button`），样式会互相覆盖

隔离方案：

1. CSS-in-JS 的 scope 配置：styled-components 支持 `StyleSheetManager` 设置 `namespace`，emotion 支持 `cache` 配置 `key` 前缀。为 remote 模块配置独立的 namespace/key，使生成的 class name 带有 remote 特有的前缀
2. Shadow DOM：将 remote 组件渲染到 Shadow DOM 中，Shadow DOM 的样式天然隔离，不会影响外部
3. CSS Modules：如果使用 CSS Modules，class name 会经过 hash 处理，天然避免冲突
4. 运行时样式注入控制：拦截 remote 模块的 `<style>` 标签创建，将其限定在特定的容器元素内（如使用 `StyleSheetManager` 指定 `target` 为 remote 的容器 DOM）

---

## 三、场景设计题

### 14. 设计一个大规模前端灰度发布系统

灰度策略的配置和分发机制：

采用服务端下发策略 + 客户端执行判断的混合模式：

```
┌──────────────────────────────────────────────────────┐
│                  灰度配置中心                          │
│  ┌────────────────────────────────────────────────┐  │
│  │ 灰度规则：                                      │  │
│  │ - 按用户 ID 取模（userId % 100 < 10 → 10% 灰度）│  │
│  │ - 按地域（region === "cn-east" → 灰度）          │  │
│  │ - 按用户标签（userTag.includes("beta") → 灰度）  │  │
│  │ - 按流量比例（random 0-100 < 5 → 5% 灰度）      │  │
│  └────────────────────────────────────────────────┘  │
│                        ↓                              │
│  灰度 API: GET /api/feature-flags?userId=xxx          │
│  返回: { features: { newDashboard: { enabled: true,   │
│          variant: "B", version: "2.1.0" } } }         │
└──────────────────────────────────────────────────────┘
```

- 服务端负责灰度规则的存储和计算（避免客户端暴露灰度逻辑）
- 客户端通过 SDK 在初始化时请求灰度 API，获取当前用户的灰度状态
- SDK 本地缓存灰度结果（`localStorage` + 5 分钟 TTL），避免每次页面跳转都请求
- 灰度状态变化时通过 WebSocket 推送（可选）

前端代码层面的灰度切换方案：

采用运行时动态加载方案：

```typescript
// feature flag SDK
const flags = await getFeatureFlags(userId);

// 路由层灰度
<Route path="/dashboard">
  {flags.newDashboard.enabled
    ? <NewDashboard />    // 灰度版本
    : <OldDashboard />    // 对照版本
  }
</Route>

// 组件层灰度（动态 import）
const Dashboard = lazy(() =>
  flags.newDashboard.enabled
    ? import('./DashboardV2')
    : import('./DashboardV1')
);
```

不用编译时多版本打包的原因：

- 多版本打包会使构建时间翻倍，CI/CD 流水线变慢
- 产物体积增大（包含新旧两个版本的代码）
- 无法灵活调整灰度比例（需要重新构建部署）

运行时动态加载的优势：

- 只需构建一次，新旧版本作为独立 chunk 按需加载
- 灰度比例可以实时调整（修改服务端配置即可）
- 结合模块联邦，灰度版本可以作为 remote 模块独立部署

灰度期间的数据隔离和指标对比：

```
数据采集层：
  每个用户行为事件、性能指标都携带灰度标记：
  {
    eventId: "page_view",
    featureFlags: { newDashboard: "variant_B" },
    userId: "xxx",
    timestamp: 1234567890
  }

数据分析层：
  按灰度标记分组聚合：
  - 对照组（oldDashboard）：平均 LCP = 2.1s, 错误率 = 0.3%
  - 灰度组（newDashboard）：平均 LCP = 1.8s, 错误率 = 0.5%

  对比维度：
  - 性能指标（LCP, FCP, CLS, INP）
  - 业务指标（转化率、留存率、页面停留时间）
  - 错误率（JSError 数量 / PV）
  - 用户投诉量
```

会话一致性保证：

同一用户在灰度期间不会在灰度版和对照版之间跳变：

1. 灰度分桶持久化：用户首次命中灰度时，将分桶结果（`variant_B`）写入 cookie（`_gf_newDashboard=B`），后续请求直接读取 cookie，不再重新计算
2. 服务端一致性：灰度 API 返回结果时，服务端记录 `(userId, feature, variant)` 的映射到 Redis（TTL = 灰度周期），确保同一用户始终返回相同结果
3. Session 级缓存：SDK 在 `sessionStorage` 中缓存灰度结果，同一会话内不会变化

全量回滚方案：

```
回滚触发条件：
  - 灰度版错误率 > 对照组 * 2
  - 灰度版 P0 告警
  - 人工决策

回滚操作：
  1. 在灰度配置中心将 feature flag 设为 enabled: false
  2. 配置变更通过 WebSocket 推送到所有在线客户端（< 1 秒生效）
  3. 未在线的客户端下次请求灰度 API 时获取新配置

回滚速度目标：
  - 在线用户：< 3 秒（WebSocket 推送 + 客户端切换）
  - 全量生效：< 5 分钟（考虑 CDN 缓存刷新、API 缓存过期）
  - 无需重新部署代码（运行时切换，不涉及代码回滚）
```

追问：前后端灰度版本不一致的处理

当灰度功能依赖后端 API 字段变更时：

1. API 版本兼容：后端 API 采用向后兼容策略——新增字段而不删除旧字段，灰度期间 API 同时返回新旧字段。前端灰度版读新字段，对照版读旧字段
2. BFF 层适配：在 BFF 层根据前端的灰度标记，对 API 响应做适配转换，屏蔽前后端版本差异
3. API Feature Flag：后端 API 也使用 Feature Flag，与前端的灰度标记联动——前端传 `X-Feature-Flags: newDashboard=B`，后端据此返回对应版本的数据
4. 降级兜底：前端灰度版在请求 API 时，如果返回的数据缺少新字段（说明后端还未灰度到该用户），自动降级到对照版的渲染逻辑

---

### 15. 设计一个高性能实时数据大屏

数据层：WebSocket 管理

```typescript
class RealtimeDataManager {
  private ws: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private messageBuffer: Message[] = [];
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  connect() {
    this.ws = new WebSocket("wss://api.example.com/realtime");

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.flushBuffer(); // 重连后发送缓冲的消息
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      // 序号校验：防止乱序
      if (msg.seq <= this.lastProcessedSeq) return;
      this.lastProcessedSeq = msg.seq;

      // 去重：基于消息 ID
      if (this.processedIds.has(msg.id)) return;
      this.processedIds.add(msg.id);

      // 分发到对应图表的 handler
      const handler = this.messageHandlers.get(msg.chartId);
      if (handler) handler(msg.data);
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.reconnect();
    };
  }

  // 心跳：每 30 秒发送 ping，60 秒未收到 pong 则断开重连
  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.ws?.send(JSON.stringify({ type: "ping" }));
      this.heartbeatTimeout = setTimeout(() => {
        this.ws?.close(); // 触发重连
      }, 60000);
    }, 30000);
  }

  // 指数退避重连
  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }
}
```

消息积压处理：

- 客户端维护一个消息队列（Ring Buffer，容量 1000），超出时丢弃最旧的消息
- 服务端做流控：如果客户端的 TCP 接收窗口满了（背压），服务端暂停推送
- 重连后通过 `lastProcessedSeq` 向服务端请求缺失的消息（增量同步）

渲染层：避免主线程阻塞

10 个 Echarts 图表同时每秒更新，主线程压力很大。优化策略：

1. Echarts 不支持在 Worker 中运行（依赖 DOM API），但可以做以下优化：
   - 数据预处理在 Worker 中完成：将原始数据的清洗、聚合、格式转换放到 Web Worker 中，只将处理好的图表配置传回主线程
   - 分帧渲染：10 个图表不全部在同一帧更新，而是分散到不同的帧（每帧更新 2-3 个图表），使用 `requestAnimationFrame` 调度

2. Echarts 增量更新：
   - 使用 `chart.setOption(newData, { notMerge: false, lazyUpdate: true })`，Echarts 会合并配置而非全量替换
   - `lazyUpdate: true` 让 Echarts 在下一帧统一渲染，避免连续多次 `setOption` 导致重复渲染

3. Canvas 渲染器：使用 `canvas` 渲染器（而非 SVG），Canvas 在大量数据点时性能更好

   ```typescript
   const chart = echarts.init(dom, undefined, { renderer: "canvas" });
   ```

4. OffscreenCanvas（如果支持）：将 Canvas 转移到 Worker 中渲染，但 Echarts 目前不原生支持 OffscreenCanvas，需要自行适配（复杂度高，收益有限）

状态管理：Zustand Store 设计

```typescript
interface DashboardStore {
  // 按图表 ID 分离状态，避免一个图表更新导致所有图表 re-render
  chartData: Record<
    string,
    {
      series: any[];
      lastUpdated: number;
    }
  >;

  // 每个图表独立的更新函数
  updateChart: (chartId: string, data: any) => void;
}

const useDashboardStore = create<DashboardStore>((set) => ({
  chartData: {},
  updateChart: (chartId, data) =>
    set((state) => ({
      chartData: {
        ...state.chartData,
        [chartId]: { series: data, lastUpdated: Date.now() },
      },
    })),
}));
```

避免不必要 re-render：

```typescript
// 每个图表组件只订阅自己的数据
function ChartA() {
  const data = useDashboardStore((state) => state.chartData["chartA"]);
  // 只有 chartA 的数据变化时才 re-render
}

// 使用 React.memo 包裹图表组件
const ChartA = React.memo(ChartAImpl, (prev, next) => {
  return prev.data === next.data; // 浅比较
});
```

性能保障：帧率监控与降级

```typescript
class PerformanceMonitor {
  private frameTimes: number[] = [];
  private lastFrameTime = performance.now();

  monitor() {
    requestAnimationFrame((now) => {
      const delta = now - this.lastFrameTime;
      this.lastFrameTime = now;
      this.frameTimes.push(delta);

      // 保留最近 60 帧的数据
      if (this.frameTimes.length > 60) this.frameTimes.shift();

      // 计算平均帧率
      const avgDelta =
        this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
      const fps = 1000 / avgDelta;

      if (fps < 30) {
        this.triggerDegradation();
      }

      this.monitor();
    });
  }

  private triggerDegradation() {
    // 降级策略（逐级递进）
    // Level 1: 降低刷新频率（从 1s 降到 3s）
    // Level 2: 简化图表配置（关闭动画、减少数据点、关闭 tooltip）
    // Level 3: 减少图表数量（隐藏非核心图表）
    // Level 4: 切换到静态截图模式
  }
}
```

降级策略具体实现：

- Level 1：数据更新频率从 1Hz 降到 0.33Hz（每 3 秒更新一次），累积 3 秒的数据取最后一个点
- Level 2：`chart.setOption({ animation: false, series: [{ data: downsampledData }] })`，关闭动画，数据点从 1000 降到 200（使用 LTTB 降采样算法）
- Level 3：按优先级排序图表，隐藏优先级最低的 5 个图表（使用 `display: none`，不销毁实例）

追问：消息乱序和重复处理

- 乱序处理：每条消息携带单调递增的序号（`seq`），客户端维护 `lastProcessedSeq`，小于该序号的消息直接丢弃
- 重复处理：每条消息携带唯一的 `id`（UUID），客户端维护一个 `Set<string>` 记录已处理的 ID（容量限制 10000，超出时 FIFO 淘汰）
- 缺失消息：如果发现 `seq` 跳号（如收到 seq=100 后直接收到 seq=103），向服务端请求 seq 101-102 的消息（通过 HTTP 回退接口）

---

### 16. 设计一个 Agent 开发平台的前端架构

整体前端架构：

```
路由结构：
/                          → 首页/仪表盘（Agent 列表、运行统计）
/agents/:id/config         → Agent 配置编辑器
/agents/:id/debug          → Agent 调试面板（运行日志流 + 工具调用链）
/agents/:id/sessions       → 历史会话列表
/agents/:id/sessions/:sid  → 会话回放
/settings                  → 全局设置（模型 API Key、权限配置）

状态管理分层：
┌─────────────────────────────────────────┐
│ Server State (React Query / SWR)         │
│ - Agent 配置数据（CRUD）                  │
│ - 历史会话列表                            │
│ - 运行统计数据                            │
├─────────────────────────────────────────┤
│ Realtime State (Zustand)                 │
│ - SSE 日志流数据                          │
│ - 工具调用链实时状态                       │
│ - Agent/Subagent 并发状态                 │
├─────────────────────────────────────────┤
│ UI State (Zustand / useReducer)          │
│ - 编辑器光标位置、折叠状态                  │
│ - 面板布局、主题设置                       │
└─────────────────────────────────────────┘

数据流：
用户操作 → UI State 更新 → 触发 API 调用 / SSE 连接
                              ↓
服务端响应 → Server State 更新 → 组件 re-render
SSE 事件 → Realtime State 更新 → 组件 re-render
```

SSE 长连接可靠性设计：

```typescript
class SSEReliabilityManager {
  private eventSource: EventSource | null = null;
  private lastEventId: string | null = null;
  private messageBuffer: SSEMessage[] = [];
  private maxBufferSize = 500;

  connect(agentId: string) {
    this.eventSource = new EventSource(
      `/api/agents/${agentId}/stream?lastEventId=${this.lastEventId || ""}`,
    );

    this.eventSource.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      // 序号校验：基于 Last-Event-ID
      if (msg.id <= this.lastEventId) return; // 去重
      this.lastEventId = msg.id;

      // 缓冲：断线期间的消息不丢失
      this.messageBuffer.push(msg);
      if (this.messageBuffer.length > this.maxBufferSize) {
        this.messageBuffer.shift();
      }

      // 分发到 UI
      this.dispatch(msg);
    };

    this.eventSource.onerror = () => {
      // 断线重连：EventSource 自带重连，但需要设置 retry 时间
      // 额外：如果连续重连失败 5 次，切换到轮询模式
      this.reconnectCount++;
      if (this.reconnectCount > 5) {
        this.fallbackToPolling(agentId);
      }
    };
  }

  // 重连后通过 lastEventId 请求缺失的消息（服务端需要维护消息缓冲）
  // GET /api/agents/:id/stream/events?since={lastEventId}
}
```

关键设计点：

- Last-Event-ID 恢复：SSE 协议原生支持，客户端断线重连时携带 `Last-Event-ID`，服务端从该 ID 之后继续推送
- 消息缓冲：服务端为每个 Agent 会话维护最近 1000 条消息的缓冲（Redis Stream），断线期间的消息不丢失
- 序号校验：客户端按 `eventId` 单调递增校验，发现跳号则通过 HTTP 请求缺失的消息
- 降级轮询：SSE 连续失败时降级为每 2 秒轮询一次（HTTP GET），确保可用性

工具调用链可视化方案：

选择 DAG（有向无环图）：

| 方案   | 适用场景                          | 优劣                                                |
| ------ | --------------------------------- | --------------------------------------------------- |
| 时序图 | 线性流程，单 Agent                | 简单直观，但无法表达并行和分支                      |
| 树形图 | 层级关系（如 Subagent 嵌套）      | 适合展示父子关系，但工具调用有交叉依赖时不清晰      |
| DAG    | 多 Agent 并行、工具调用有依赖关系 | 能同时表达顺序、并行、分支和汇聚，最适合 Agent 场景 |

实现方案：使用 `react-flow`（基于 dagre 布局算法）渲染 DAG：

- 每个节点代表一次工具调用（包含工具名、耗时、状态标记）
- 边代表调用关系（A 的输出是 B 的输入）
- 节点颜色：绿色=成功，红色=失败，黄色=执行中，灰色=等待
- 点击节点展开详情面板（输入参数、输出结果、耗时分布）

大数据量渲染优化：

- 虚拟渲染：只渲染视口内的节点（react-flow 自带视口裁剪）
- 折叠/展开：Subagent 的工具调用链默认折叠为一个摘要节点，点击展开
- LOD（Level of Detail）：缩小时只显示节点名和状态，放大后显示详细参数
- 增量更新：新工具调用完成时只添加新节点和边，不重新渲染整个图

会话回放功能：

数据结构：

```typescript
interface SessionReplay {
  sessionId: string;
  agentId: string;
  startTime: number;
  endTime: number;
  events: ReplayEvent[];
}

interface ReplayEvent {
  id: string;
  timestamp: number; // 绝对时间戳
  relativeTime: number; // 相对于 startTime 的毫秒数
  type:
    | "user_message"
    | "assistant_message"
    | "tool_call"
    | "tool_result"
    | "thought";
  data: {
    role?: string;
    content?: string;
    toolName?: string;
    toolInput?: any;
    toolOutput?: any;
    thinking?: string; // LLM 的推理过程
  };
  duration?: number; // 工具调用耗时
}
```

播放引擎设计：

```typescript
class ReplayPlayer {
  private events: ReplayEvent[];
  private currentEventIndex = 0;
  private playbackSpeed = 1; // 倍速
  private isPlaying = false;
  private timer: number | null = null;

  play() {
    this.isPlaying = true;
    this.scheduleNext();
  }

  pause() {
    this.isPlaying = false;
    if (this.timer) clearTimeout(this.timer);
  }

  seekTo(timestamp: number) {
    // 二分查找定位到目标时间点
    this.currentEventIndex = binarySearch(this.events, timestamp);
    this.renderUpTo(this.currentEventIndex);
  }

  setSpeed(speed: number) {
    // 0.5x, 1x, 2x, 4x, 8x
    this.playbackSpeed = speed;
  }

  private scheduleNext() {
    if (this.currentEventIndex >= this.events.length) return;

    const event = this.events[this.currentEventIndex];
    const nextEvent = this.events[this.currentEventIndex + 1];

    // 渲染当前事件
    this.renderEvent(event);

    // 计算到下一事件的延迟（考虑倍速）
    const delay = nextEvent
      ? (nextEvent.relativeTime - event.relativeTime) / this.playbackSpeed
      : 0;

    this.timer = setTimeout(
      () => {
        this.currentEventIndex++;
        this.scheduleNext();
      },
      Math.min(delay, 5000),
    ); // 最大等待 5 秒（避免长时间停顿）
  }
}
```

进度条：类似视频播放器，底部进度条显示时间轴，支持拖拽跳转。不同类型的事件在进度条上用不同颜色的标记点展示。

追问：多 Agent 并发状态的实时展示

当 Agent 运行时触发多个 Subagent 并行执行：

UI 布局：

```
┌──────────────────────────────────────────────────────┐
│  Agent Team: "代码重构任务"                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │ Lead Agent │ │ Coder      │ │ Reviewer   │       │
│  │ ● Running  │ │ ● Running  │ │ ○ Waiting  │       │
│  │ 思考中...  │ │ 编辑文件   │ │            │       │
│  └────────────┘ └────────────┘ └────────────┘       │
│                                                       │
│  ┌────────────┐ ┌────────────┐                       │
│  │ Tester     │ │ Researcher │                       │
│  │ ● Running  │ │ ✓ Done     │                       │
│  │ 运行测试   │ │ 3 files    │                       │
│  └────────────┘ └────────────┘                       │
│                                                       │
│  ─── 消息流 ──────────────────────────────────────     │
│  [Lead → Coder] "请重构 auth 模块的 login 函数"        │
│  [Researcher → Lead] "找到 3 个相关文件"               │
│  [Lead → Tester] "重构完成后运行 auth.test.ts"         │
└──────────────────────────────────────────────────────┘
```

技术实现：

- 每个 Agent 是一个独立的 SSE 流（`/api/agents/:id/teams/:teamId/members/:memberId/stream`）
- 前端维护一个 `Map<string, AgentState>` 管理所有 Agent 的状态
- Agent 之间的消息通过专门的 `messages` SSE 事件推送（`type: 'team_message'`）
- 使用 CSS Grid 布局 Agent 卡片，支持动态增减（Agent 被创建/销毁时自动调整布局）
- 每个 Agent 卡片内部显示最近 3 条活动记录（滚动更新），点击展开完整日志

---

_以上回答结合了 @swifty/sentry SDK、@swifty/swifty CLI Agent、以及在字节跳动（TikTok Performance、Data-架构）、腾讯（IEG NoSQL 数据库管理系统）、阿里巴巴（阿里妈妈广告技术部）的实际项目经验。_
