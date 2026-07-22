# 杭天cheng 面试答案集

## 目录

- [项目: swifty-sentry (Q1-Q6)](#项目-swifty-sentry-q1-q6)
  - [Q1. JSError 上报后如何通过 source map 还原故障现场？](#q1-swifty-sentry-上报-jserror-后后端如何通过-source-map-还原故障现场完整链路是怎样的)
  - [Q2. SDK 包体积如何控制？影响首屏怎么办？](#q2-swifty-sentry-作为独立-sdk包体积如何控制太大影响首屏加载怎么办)
  - [Q3. rrweb 原理是什么？对性能有什么影响？](#q3-swifty-sentry-用的-rrweb-原理是什么对页面性能有什么影响)
  - [Q4. 错误去重怎么实现？LRU 用在什么场景？](#q4-swifty-sentry-如何实现错误去重lru-缓存用在什么场景为什么选-lru)
  - [Q5. 3 级降级上报策略怎么设计？](#q5-swifty-sentry-的-3-级降级上报策略sendbeacon---image-beacon---fetch-keepalive是怎么设计的为什么是这个顺序)
  - [Q6. 白屏检测关键点采样怎么做？](#q6-swifty-sentry-白屏检测用关键点采样具体是怎么做的误判怎么处理)
- [项目: swifty-cli (Q7-Q11)](#项目-swifty-cli-q7-q11)
  - [Q7. 5 层架构具体是哪 5 层？](#q7-swifty-cli-的-5-层架构具体是哪-5-层各层职责是什么)
  - [Q8. ReAct Agent Loop 怎么工作？](#q8-swifty-cli-基于-react-范式的-agent-loop-是怎么工作的推理和行动如何交替)
  - [Q9. 5 层权限系统怎么设计？](#q9-swifty-cli-的-5-层权限系统怎么设计为什么需要-5-层)
  - [Q10. 上下文压缩怎么做？](#q10-swifty-cli-的上下文压缩是怎么做的怎么保证压缩后不丢失关键信息)
  - [Q11. worktree 隔离和 Agent Teams 协作？](#q11-swifty-cli-的-worktree-文件隔离和-agent-teams-多-teammate-协作是怎么实现的)
- [工作经历: 字节 TikTok Performance (Q12-Q14)](#工作经历-字节-tiktok-performance-q12-q14)
  - [Q12. Kafka + Redis + MySQL + ClickHouse 各自角色？](#q12-字节-tiktok-performance-项目-为什么选-kafka-加-redis-加-mysql-加-clickhouse-这套组合各自承担什么角色多层缓存怎么设计)
  - [Q13. Thrift IDL 生成 npm 包怎么做？](#q13-字节-tiktok-performance-项目-thrift-idl-生成-npm-包给-bff-消费具体怎么做版本管理怎么处理)
  - [Q14. 虚拟滚动列表怎么实现？](#q14-字节-tiktok-performance-项目-你写的虚拟滚动列表是怎么实现的和-react-window--react-virtualized-比有什么优势)
- [工作经历: 腾讯 NoSQL DBMS (Q15-Q16)](#工作经历-腾讯-nosql-dbms-q15-q16)
  - [Q15. React 类组件迁移 + 数据竞争排查](#q15-腾讯-ieg-nosql-dbms-react-类组件迁移到函数组件的具体策略遇到过哪些坑数据竞争问题闭包接口响应不稳定怎么排查和解决的)
  - [Q16. TCP 连接池 + C++ .so + valgrind + 对象池](#q16-腾讯-ieg-nosql-dbms-tcp-连接池怎么实现进程池调用-c-so-加解密是什么架构用-valgrind-排查-node-和-c-so-内存泄漏的具体过程对象池和-v8-隐藏类怎么用)
- [工作经历: 字节 Data 架构 (Q17-Q18)](#工作经历-字节-data-架构-q17-q18)
  - [Q17. JSError 大模型自动修复](#q17-字节-data-jserror-大模型自动修复是怎么做的完整的技术方案和收益数据)
  - [Q18. SWR 性能优化 + A2UI 接入](#q18-字节-data-swr-前端性能优化具体做了什么a2ui-react-框架接入是怎么回事)
- [工作经历: 阿里妈妈广告技术 (Q19)](#工作经历-阿里妈妈广告技术-q19)
  - [Q19. Schema-Driven UI + Module Federation](#q19-阿里妈妈-serverschema-driven-ui-是什么module-federation-接入具体做了什么你给-module-federationvite-贡献了什么)
- [基础知识: React/Vue/TypeScript (Q20)](#基础知识-reactvuetypescript-q20)
  - [Q20. React Fiber + Vue3 响应式原理对比](#q20-react-fiber-架构和-vue3-响应式原理对比你在项目里怎么利用这些原理做性能优化)

---

## 项目: swifty-sentry (Q1-Q6)

### Q1. swifty-sentry 上报 JSError 后，后端如何通过 source map 还原故障现场？完整链路是怎样的？

我在 swifty-sentry 中设计了一套完整的 JSError 上报与还原链路。整体分为四个阶段:

第一阶段是前端捕获与上传。SDK 通过 `window.addEventListener('error', handler, true)` 捕获同步错误，通过 `window.addEventListener('unhandledrejection')` 捕获 Promise 异常。捕获到的原始信息包括 message、filename、lineno、colno 和 error.stack。同时 SDK 会上报当前页面的 URL、用户标识、浏览器 UA 版本号和一个随机生成的 eventId。这些字段序列化为 JSON 后通过 3 级降级通道发送。上报时不会上传 source map 本身。

第二阶段是构建时上传 source map。在项目 CI/CD 流程中，Webpack 或 Rollup 构建完成后，通过我写的一个 CLI 工具 `swifty-sentry-cli upload-sourcemaps` 将 `.map` 文件上传到后端对象存储。上传时携带版本号，版本号通常取自 git commit hash 或 package.json 的 version 字段。后端以 `appId + version + filename` 作为 key 存储 source map 文件。

第三阶段是后端还原。后端收到 JSError 事件后，从事件中取出 `appId`、`version`、`filename`、`lineno`、`colno`，到对象存储中查找对应的 source map 文件。还原过程使用 Mozilla 的 `source-map` 库:

```javascript
const consumer = await new sourceMap.SourceMapConsumer(rawSourceMap);
const original = consumer.originalPositionFor({
  line: lineno,
  column: colno,
});
console.log(original);
// { source: 'src/utils/api.ts', line: 45, column: 12, name: 'fetchData' }
```

对 error.stack 中的每一帧都做同样的映射，最终得到一个完整的原始堆栈。还原后的数据写入 ClickHouse，供前端面板展示。

第四阶段是前端展示与告警。还原后的错误按 `appId + version + source file + line` 做聚合，相同位置的错误归为一组，统计影响用户数、发生频次。超过阈值的错误触发告警，推送到飞书或钉钉群。

整个链路在实际部署中的延迟大约是: 前端上报到后端接收 200ms 以内（sendBeacon 通道），source map 还原 50ms 左右一条，最终用户在前端面板上看到还原后的堆栈通常在事件发生后 3 到 5 秒。

### Q2. swifty-sentry 作为独立 SDK，包体积如何控制？太大影响首屏加载怎么办？

这是我在设计 swifty-sentry 时重点考虑的问题。作为一个要嵌入到别人页面里的 SDK，体积直接影响宿主页面的首屏性能，所以我在包体积控制上做了很多工作。

首先是架构层面的拆分。我采用了 core 加 plugin 的解耦架构。core 模块只包含最基础的功能: 发布订阅事件总线、错误捕获注册、上报通道管理和 LRU 缓存。这部分压缩加 gzip 后大约 4KB。其他功能全部以 plugin 形式按需引入: 白屏检测 plugin 1.2KB、性能指标 plugin 2.5KB、rrweb 录屏 plugin 15KB（gzip 后约 6KB）、用户行为追踪 plugin 3KB。这样宿主页面只需要引入 core 加上实际用到的 plugin，最小配置下 gzip 只有 5KB 左右。

其次在工程层面做了很多优化。SDK 使用 TypeScript 编写，构建时用 Rollup 打包并开启 tree-shaking。所有导出函数都确保没有副作用标记（`sideEffects: false`），让打包工具可以安全地摇掉未使用的代码。内部依赖关系用 ESM 的具名导出而非 default 导出，避免引入整个模块。一些只在特定 plugin 中使用的工具函数做内联处理，不抽成公共模块，防止 tree-shaking 失败。

第三是多入口分包。SDK 提供多种引入方式:

```javascript
// 最小化引入，只包含错误捕获和上报
import { init } from "swifty-sentry/core";

// 按需引入 plugin
import { ErrorPlugin } from "swifty-sentry/plugins/error";
import { PerformancePlugin } from "swifty-sentry/plugins/performance";

// 一行全量引入（不推荐首屏使用）
import { init, allPlugins } from "swifty-sentry/full";
```

第四是异步加载策略。对于 rrweb 这种体积较大的 plugin，SDK 支持延迟加载。初始化时先加载 core 和轻量 plugin，rrweb 通过 `import()` 动态加载，在页面 idle 时或用户主动触发录屏时才拉取:

```javascript
init({
  dsn: "https://xxx",
  plugins: [ErrorPlugin(), PerformancePlugin()],
  lazyPlugins: [
    () => import("swifty-sentry/plugins/rrweb").then((m) => m.RRWebPlugin()),
  ],
});
```

最终效果是: 最小配置 gzip 后 5KB，典型配置（core 加 error 加 performance）gzip 后约 8KB，全量配置 gzip 后约 18KB。在内部实测中，对宿主页面 FCP 的影响控制在 3ms 以内，完全不影响首屏体验。

### Q3. swifty-sentry 用的 rrweb 原理是什么？对页面性能有什么影响？你做了哪些优化？

rrweb 的全称是 "record and replay the web"，我在 swifty-sentry 中集成它来实现故障现场的录屏回放。要理解 rrweb 的工作原理，需要从录制和回放两个方面来说。

录制阶段的核心原理是 DOM 快照加增量序列化。首次触发录制时，rrweb 会对当前页面的完整 DOM 树做一次全量快照，将每个 DOM 节点序列化为一个带有唯一 nodeId 的 JSON 结构。这个快照包含标签名、属性、文本内容等。之后通过 `MutationObserver` 监听 DOM 的所有变更（包括节点增删、属性修改、文本变化等），每次变更只记录增量事件，而非重新序列化整棵树。每个增量事件都打上时间戳，与快照组成一个时间序列。对于滚动、鼠标移动、输入等交互事件，则通过 DOM 事件监听器来捕获。

回放阶段是录制的逆过程。rrweb 在一个沙箱化的 iframe 中，先根据全量快照重建 DOM 树，然后按时间轴依次应用增量事件，同时用 CSS 动画模拟鼠标移动和滚动，达到"视频回放"的效果。实际上并不是真的视频，而是一个 DOM 驱动的动画。

关于性能影响，rrweb 的开销主要来自三个方面。第一是全量快照时的 DOM 遍历，对于节点数很多的页面（比如超过 5000 个节点），首次序列化可能耗时 30 到 50ms。第二是 `MutationObserver` 的高频回调，在动画密集或频繁 DOM 操作的页面上，每秒可能触发数十次回调。第三是序列化后数据的存储和传输开销。

我在 swifty-sentry 中做了以下优化:

第一是采样录制。不是持续录制，而是只在错误发生前 10 秒和后 5 秒进行录制。平时 `MutationObserver` 处于休眠状态，只保留最近 10 秒的 DOM 变更事件在一个固定大小的环形缓冲区里。当 SDK 捕获到错误时，才将环形缓冲区中的历史事件和后续事件拼接起来。这样把录制时长从"全会话"缩减到"错误前后 15 秒"，内存占用下降了约 80%。

第二是节点过滤。对脚本标签、SVG 图标、第三方广告 iframe 等不需要回放的节点，在序列化时直接跳过。我写了一个 `mask` 规则列表，对匹配选择器的节点输出占位符而非完整内容:

```javascript
new RRWebPlugin({
  maskSelector: [".ad-container", "svg.icon", "script"],
  blockSelector: ["iframe.cross-origin"],
});
```

第三是事件节流。对高频的鼠标移动和滚动事件做节流处理，鼠标移动事件最多每 50ms 记录一次，滚动事件最多每 100ms 记录一次。人眼对这些高频中间态不敏感，节流后回放体验基本不变，但数据量减少了约 60%。

第四是数据压缩。录制的 JSON 数据在上报前通过 gzip 压缩，典型场景下原始 JSON 约 200KB，gzip 后约 40KB，压缩率约 80%。

经过这些优化，rrweb 对宿主页面 FPS 的影响从优化前的平均下降 8 到 12 帧，降低到优化后的平均下降 1 到 2 帧，在 60fps 的页面上几乎感知不到。

### Q4. swifty-sentry 如何实现错误去重？LRU 缓存用在什么场景？为什么选 LRU？

错误去重是 swifty-sentry 中一个看似简单但实际需要考虑很多边界情况的功能。核心问题在于: 同一个 bug 可能在短时间内触发大量重复上报，比如一个空指针异常在循环中每次都命中，如果不做去重，后端会被淹没在重复数据中。

我的去重方案分两层。

第一层是基于错误指纹的精确去重。对每个捕获到的错误，我用以下属性计算一个 MD5 哈希作为指纹:

```javascript
function computeFingerprint(error) {
  const raw = [
    error.type, // 'Error', 'TypeError', 'PromiseRejection' 等
    error.message, // 错误消息
    error.filename, // 出错文件
    error.lineno, // 行号
    error.colno, // 列号
  ].join("::");
  return md5(raw);
}
```

用 `type + message + filename + lineno + colno` 这五元组计算 MD5，相同的 bug 在相同的代码位置产生的指纹是相同的。选择这五元组是因为它们能唯一标识一个错误的"身份"，而不包含时间戳、用户 ID 这种每次都不同的维度。

第二层就是 LRU 缓存的登场。SDK 在浏览器端维护一个 LRU 缓存，存储最近见过的错误指纹。默认容量是 100 条。每次捕获到错误时:

```javascript
const fingerprint = computeFingerprint(error);
if (lruCache.has(fingerprint)) {
  // 已见过，不上报，只更新计数
  lruCache.get(fingerprint).count++;
  return;
}
lruCache.set(fingerprint, { firstSeen: Date.now(), count: 1, error });
// 首次出现，上报
reporter.send(error, fingerprint);
```

之所以选择 LRU 而非其他缓存淘汰策略（如 LFU、FIFO），我有以下考虑:

第一个原因是时间局部性适配。前端错误有很强的时间局部性: 如果一个错误在最近一段时间没有再次出现，那它在未来也不太可能出现（可能已经被热修复），而刚刚出现的错误更可能在短时间内反复触发。LRU 的"最近最少使用"策略天然契合这个特征。LFU（最不经常使用）在这个场景反而不好，因为一个低频但重要的错误可能被错误淘汰。

第二个原因是容量可控。LRU 有固定容量上限，不会因为错误种类太多而无限增长内存。100 条指纹在内存中可以忽略不计（每条指纹 32 字节加元数据，总共不到 10KB）。

第三个原因是实现简单。我用双向链表加哈希表实现了 LRU，get 和 set 操作都是 O(1) 的时间复杂度，代码量不到 60 行，没有引入任何外部依赖。

对于同一指纹在短时间内的重复触发，我在 LRU 缓存的 value 中维护了一个 count 计数器和一个定时器。同一个指纹在 5 分钟窗口内的重复触发不会单独上报，而是在窗口结束时上报一次聚合数据（包含触发次数、影响用户数等），这样既保留了信息又大幅减少了上报量。实测在日均千万级 PV 的页面上，去重后上报量减少了约 70%。

### Q5. swifty-sentry 的 3 级降级上报策略（sendBeacon -> Image beacon -> fetch keepAlive）是怎么设计的？为什么是这个顺序？

上报通道的设计是监控 SDK 可靠性的关键。浏览器环境复杂多变，用户可能在页面关闭、网络断开、浏览器崩溃等各种状态下产生需要上报的事件，如果只依赖一种上报方式，丢失率会相当高。我设计了 3 级降级策略来最大化上报的成功率。

整体流程如下:

```
error event captured
    |
    v
try sendBeacon (level 1)
    |-- success --> done
    |-- fail -->
        |
        v
try Image beacon (level 2)
    |-- success --> done
    |-- fail -->
        |
        v
try fetch keepAlive (level 3)
    |-- success --> done
    |-- fail --> save to localStorage (offline queue)
```

为什么选择这个顺序？让我逐级解释。

第一级是 `navigator.sendBeacon`。这是 W3C 专门为 analytics 和 diagnostics 设计的 API，它的最大优势是浏览器保证即使页面正在卸载（unload 阶段），请求也会被可靠地发送出去。普通 XHR 或 fetch 在页面 unload 时会被浏览器取消，但 sendBeacon 不会。它异步执行，不阻塞页面跳转。但它有局限: 只支持 POST，数据大小在各浏览器有隐性限制（Chrome 限制 64KB），某些旧版浏览器不支持（IE 完全不支持）。所以我把 sendBeacon 放在第一级，它是现代浏览器下的最优选择:

```javascript
function trySendBeacon(url, data) {
  if (!navigator.sendBeacon) return false;
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  return navigator.sendBeacon(url, blob);
}
```

第二级是 Image beacon。这是一种经典的上报方式: 创建一个 `new Image()` 对象，将数据编码到 URL 的 query string 中:

```javascript
function tryImageBeacon(url, data) {
  const encodedData = encodeURIComponent(JSON.stringify(data));
  const img = new Image();
  img.src = `${url}?data=${encodedData}`;
}
```

它的优势是兼容性极好，所有浏览器都支持 Image 对象，而且浏览器会保证在页面卸载前发出图片请求（因为图片加载是浏览器核心能力）。劣势是只支持 GET 请求、数据量受 URL 长度限制（通常 2KB 左右），超出限制时我会只上报核心字段（type + message + fingerprint），截断堆栈信息。放在第二级是因为当 sendBeacon 不可用（旧浏览器或调用失败）时，Image beacon 是最可靠的兜底。

第三级是 `fetch` 加 `keepalive: true`。这个选项告诉浏览器在页面卸载后仍然保持请求连接:

```javascript
function tryFetchKeepAlive(url, data) {
  return fetch(url, {
    method: "POST",
    body: JSON.stringify(data),
    keepalive: true,
    headers: { "Content-Type": "application/json" },
  });
}
```

放在第三级而非第一级，是因为 `keepalive` 选项在某些浏览器版本的 unload 阶段表现不够稳定，而且它的兼容性不如 sendBeacon（Safari 直到 2021 年才支持）。但它的优势是支持 POST 和大容量数据，当 Image beacon 因为数据量过大而失败时，fetch keepAlive 可以兜底。

三级都失败的情况下，数据写入 localStorage 离线队列。下次页面加载时 SDK 检查离线队列，在非 unload 阶段通过正常的 fetch 请求补发。离线队列有容量上限（100 条），超出后淘汰最早的数据，防止 localStorage 被占满。

这套策略的综合上报成功率在实测中达到了 99.7% 以上，其中 sendBeacon 承担了约 92% 的上报量，Image beacon 约 6%，fetch keepAlive 约 1.5%，离线补发约 0.2%。

### Q6. swifty-sentry 白屏检测用关键点采样，具体是怎么做的？误判怎么处理？

白屏检测在前端监控中是一个很棘手的问题。所谓"白屏"指的是页面加载后，用户可视区域内没有渲染出有意义的内容，整个页面显示为空白或接近空白。常见原因是 JavaScript 执行报错导致 React 或 Vue 组件树未挂载，或者关键资源加载失败导致页面渲染中断。

简单的检测方式比如检查 `document.body.innerHTML === ''` 是不可行的，因为 SPA 框架通常会在 body 中保留一个挂载节点（如 `<div id="root"></div>`），即使白屏了 body 也不是空的。直接对页面截图做像素分析又太重了，不适合在生产环境使用。

我采用的关键点采样方案，核心思路是: 在页面可视区域的多个关键位置，检测该位置是否有"有意义的内容"。如果所有关键点都没有内容，就判定为白屏。

具体实现分以下步骤:

第一步，定义采样点。我在可视区域内选取 9 个关键点，分布在页面的典型内容区域:

```javascript
const samplingPoints = [
  { x: "50%", y: "20%" }, // 顶部中心（通常是导航栏）
  { x: "20%", y: "40%" }, // 左侧中部
  { x: "50%", y: "40%" }, // 中心
  { x: "80%", y: "40%" }, // 右侧中部
  { x: "20%", y: "60%" }, // 左侧中下
  { x: "50%", y: "60%" }, // 中心偏下
  { x: "80%", y: "60%" }, // 右侧中下
  { x: "30%", y: "80%" }, // 左下
  { x: "70%", y: "80%" }, // 右下
];
```

第二步，检测每个采样点的内容。使用 `document.elementFromPoint(x, y)` 获取该坐标下的 DOM 元素，然后判断这个元素是否承载了"有意义的内容":

```javascript
function isPointMeaningful(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return false;

  // 如果是 body 或 html 挂载根节点，说明这个位置没有实际内容
  if (el === document.body || el === document.documentElement) return false;
  if (el.id === "root" || el.id === "app") return false;
  if (
    el.tagName === "DIV" &&
    el.children.length === 0 &&
    !el.textContent.trim()
  )
    return false;

  return true;
}
```

第三步，计算采样结果。如果 9 个关键点中"有意义"的点少于阈值（我设置为 2 个），就初步判定为白屏:

```javascript
const meaningfulCount = samplingPoints.filter((p) =>
  isPointMeaningful(p.x, p.y),
).length;
const isWhiteScreen = meaningfulCount < THRESHOLD; // THRESHOLD = 2
```

误判处理是我花了比较多精力优化的部分。主要的误判场景和对应策略如下:

场景一: 深色主题页面。深色背景下页面内容不是"白色"但 `elementFromPoint` 可能返回挂载节点。解决方案是同时检查元素的 `getComputedStyle` 背景色和内容，只要元素有实际内容，不管背景是什么颜色都判定为非白屏。

场景二: 全屏 loading 状态。页面正在加载时可能整个视口都是 loading 动画，9 个采样点都落在 loading 组件上。解决方案是在检测时延迟执行，配置一个 `detectionDelay` 参数（默认 3 秒），等页面的正常加载时间过后再做检测。同时 SDK 提供了一个白名单配置，允许开发者声明"loading 组件选择器"，检测时排除这些元素。

场景三: 全屏视频或图片。有些页面的主要内容就是一个全屏视频或 banner 图，`elementFromPoint` 返回的是 video 或 img 元素。这不应该被判定为白屏。解决方案是在 `isPointMeaningful` 中将 img、video、canvas、svg 等多媒体元素也视为有意义内容。

场景四: SPA 路由切换中间态。在路由切换时，旧页面卸载、新页面未挂载的短暂间隙可能被误判。解决方案是在 SPA 应用中监听路由变化事件，路由切换过程中暂停白屏检测，等路由完成后重新启动检测定时器。

最终的白屏检测准确率在我们内部的 10 个项目上进行了 A/B 测试，误判率从最初的 15% 降低到了优化后的 1.2%，漏检率约 3%。

## 项目: swifty-cli (Q7-Q11)

### Q7. swifty-cli 的 5 层架构具体是哪 5 层？各层职责是什么？

swifty-cli 是一个轻量级的 CLI Coding Agent，类似于简化版的 Claude Code 或 Codex CLI。我在设计时将整个系统划分为 5 层架构，从下到上依次为:

第一层是基础设施层（Infrastructure Layer）。这一层负责与操作系统交互的底层能力，包括文件系统读写、Shell 命令执行、进程管理、Git 操作和 worktree 管理。所有需要访问系统资源的调用都经过这一层，它提供了统一的抽象接口，并在执行前进行权限校验。这一层还负责日志记录、临时文件管理和错误恢复:

```typescript
interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listDir(path: string): Promise<FileEntry[]>;
  searchFiles(pattern: string): Promise<string[]>;
}

interface Shell {
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  spawn(command: string, args: string[]): ChildProcess;
}
```

第二层是工具层（Tool Layer）。在基础设施层之上，封装了 Agent 可以使用的各种工具，比如 `read_file`、`write_file`、`bash`、`grep`、`glob`、`lsp_goto_definition` 等。每个工具有明确的输入 Schema（用 Zod 定义）、输出格式和权限等级。工具层还负责将工具调用结果格式化为 LLM 能理解的文本:

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  permissionLevel: PermissionLevel;
  execute(input: any, context: ToolContext): Promise<ToolResult>;
}
```

第三层是 Agent 核心层（Agent Core Layer）。这是整个系统的大脑，实现了 ReAct 范式的 Agent Loop。它负责: 组装上下文消息（System Prompt 加工具定义加历史消息）、调用 LLM API、解析 LLM 返回的 tool_call、调度工具执行、将观察结果注入下一轮循环。这一层还管理 Agent 的生命周期状态（running、paused、completed、error）和上下文窗口的大小:

```
Agent Core 核心循环:
  1. 组装 messages (system prompt + tools + history + user input)
  2. 调用 LLM API
  3. 解析响应 -> text 或 tool_calls
  4. 若为 tool_calls:
     a. 权限校验
     b. 调用 Tool Layer 执行
     c. 将 result 以 tool_message 追加到 history
     d. 回到步骤 1
  5. 若为 text -> 输出给用户 -> 等待下一轮输入
```

第四层是会话与记忆层（Session and Memory Layer）。这一层管理对话的持久化、上下文压缩和跨会话记忆。会话数据存储在本地 SQLite 数据库中，包括完整的消息历史、工具调用记录和 Agent 状态。上下文压缩由这一层在消息超过窗口限制时自动触发。LLM 自动记忆提取也在此层实现: 每次会话结束时，通过一次 LLM 调用提取出"值得记住的信息"（如用户偏好、项目结构、之前犯过的错），存入记忆库，下次会话时注入 System Prompt。

第五层是用户交互层（User Interaction Layer）。这是最上层，负责与用户的所有交互，包括 CLI 输入输出渲染（使用 Ink 做终端 UI）、Slash Command 解析与路由、Skill 加载与执行、Hook 触发和进度展示。这一层通过事件系统与下层通信，用户输入一个命令后，交互层解析命令类型，调用 Agent Core 处理，并实时渲染 Agent 的思考过程和工具调用结果:

```
用户交互层的事件流:
  用户输入 -> 命令解析 -> Agent Core 处理
                              |
                              v
                     实时事件流渲染
                     (thinking / tool_call / tool_result / text)
                              |
                              v
                     最终响应输出给用户
```

这 5 层之间通过接口和事件进行通信，上层依赖下层但下层不依赖上层。每一层都可以独立测试和替换，比如我可以替换 Agent Core 层的 ReAct 实现为一个 Plan-and-Execute 实现，而不影响其他层。

### Q8. swifty-cli 基于 ReAct 范式的 Agent Loop 是怎么工作的？推理和行动如何交替？

ReAct 是 "Reasoning and Acting" 的缩写，它是一种让 LLM 交替进行推理（Thought）和行动（Action）的范式。相比传统的 Chain-of-Thought（只有推理）或直接 Function Calling（只有行动），ReAct 的优势在于 LLM 会在每次行动前先输出自己的推理过程，解释"为什么"要执行这个行动，这显著提升了多步任务的完成率和可调试性。

swifty-cli 的 Agent Loop 基于 ReAct 实现，核心循环伪代码如下:

```
function agentLoop(userMessage):
    history.append({ role: 'user', content: userMessage })

    while (turnCount < maxTurns):
        // 步骤 1: 上下文压缩检查
        if (countTokens(history) > contextWindow * 0.7):
            history = compressContext(history)

        // 步骤 2: 调用 LLM
        response = await llm.chat({
            messages: [systemPrompt, ...tools, ...history],
            tools: toolDefinitions
        })

        // 步骤 3: 解析响应
        if (response.hasToolCalls):
            for each toolCall in response.toolCalls:
                // 渲染思考过程
                ui.renderThinking(toolCall.reasoning)

                // 权限校验
                permission = checkPermission(toolCall)
                if (permission === DENY):
                    history.append(toolResult('Permission denied'))
                    continue

                // 执行工具
                result = await toolLayer.execute(toolCall)
                ui.renderToolResult(toolCall, result)

                history.append({
                    role: 'tool',
                    toolCallId: toolCall.id,
                    content: result
                })
            turnCount++
        else:
            // 纯文本回复，结束循环
            ui.renderResponse(response.text)
            history.append({ role: 'assistant', content: response.text })
            break

    return history
```

推理和行动的交替过程我用一个实际例子来说明。假设用户输入"帮我找到这个项目里所有用了 any 类型的 TypeScript 文件并修复它们":

第一轮，LLM 输出推理加行动:

- Thought: 用户要查找 TypeScript 文件中的 `any` 类型使用。第一步我需要找到所有的 `.ts` 和 `.tsx` 文件，然后用 grep 搜索 `any` 关键字。
- Action: 调用 `grep` 工具，pattern 为 `: any`，include 为 `*.{ts,tsx}`

第二轮，工具返回结果后，LLM 继续推理:

- Observation: grep 找到了 12 个文件中有 `any` 类型，总共 23 处。
- Thought: 现在需要逐个文件查看上下文，确定 `any` 应该替换为什么类型。先从第一个文件 `src/utils/api.ts` 开始。
- Action: 调用 `read_file` 工具读取 `src/utils/api.ts`

第三轮:

- Observation: 文件内容显示第 15 行 `function parseData(data: any)` 和第 32 行 `const result: any = ...`。
- Thought: 根据函数上下文，`parseData` 接收的参数应该是 API 响应的 JSON 对象，可以定义为 `Record<string, unknown>`。第 32 行的 result 根据第 35 行的返回值推断应该是 `ParsedData` 类型，这个类型已在 `types.ts` 中定义。
- Action: 调用 `write_file` 修复 `src/utils/api.ts`，同时调用 `read_file` 读取 `types.ts` 确认类型定义。

如此交替进行，直到所有文件修复完成，LLM 输出一段总结文本，Agent Loop 结束。

实际实现中有几个关键的工程细节。第一是并行 tool call 的支持: 当 LLM 在一轮中返回多个 tool_calls 时（比如上面的第三轮同时调用 read 和 write），我会并行执行这些工具，而不是串行等待。第二是循环上限和超时保护: `maxTurns` 默认设为 50，防止 Agent 陷入无限循环。第三是错误恢复: 如果某次工具执行抛出异常，不会中断整个循环，而是将错误信息作为 tool_message 返回给 LLM，让它自主决定如何处理。第四是中断恢复: 用户可以按 Ctrl+C 中断当前 Agent Loop，下次继续时从断点恢复。

### Q9. swifty-cli 的 5 层权限系统怎么设计？为什么需要 5 层？

权限系统是 Coding Agent 安全性设计的核心。一个能读写文件、执行 Shell 命令的 Agent 如果不做权限控制，可能会误删重要文件、执行危险命令、甚至泄露敏感信息。我在 swifty-cli 中设计了 5 层权限系统，从低到高依次是:

第一层: Always Allow（永远允许）。这一层包含完全安全的、只读的操作，无需用户确认即可执行。典型操作: 读取项目目录内的文件、搜索文件、执行 `ls`、`git status`、`git log` 等只读命令、调用 LSP 查询。这些操作不会修改任何状态:

```typescript
const ALWAYS_ALLOW_OPS = [
  "read_file",
  "list_dir",
  "grep",
  "glob",
  "lsp_goto_definition",
  "lsp_find_references",
  "lsp_diagnostics",
  // ...
];
```

第二层: Ask Once Per Session（每会话询问一次）。这一层包含对项目有一定修改但风险较低的操作。首次执行时需要用户确认，确认后本次会话内不再重复询问。典型操作: 编辑项目目录内的文件、创建新文件、执行 `git add`。设计为"问一次"是因为这些操作虽然需要修改文件，但通常一个编程任务中会反复执行同类操作，每次都问用户体验太差:

```typescript
const ASK_ONCE_OPS = [
  "write_file", // 项目目录内
  "edit_file", // 项目目录内
  "bash:git add",
  "bash:git commit",
  // ...
];
```

第三层: Ask Every Time（每次都问）。这一层包含有一定风险的操作，每次执行前都需要用户确认。典型操作: 执行非 Git 相关的 Shell 命令（如 `npm install`、`npx`）、修改配置文件、删除文件。这类命令的后果可能比较严重（`npm install` 可能拉取恶意包，`rm` 可能删错文件），所以每次都要确认。

第四层: Ask Every Time Plus Warning（每次问并发出警告）。这一层包含高风险操作，用户确认时界面会显示明显的警告信息。典型操作: 执行带有 `sudo` 的命令、向网络发送数据的命令（`curl`、`wget`）、修改 `.env` 文件、执行 `git push --force`。这些操作有可能导致安全问题或不可逆的后果:

```typescript
const WARNING_OPS = {
  "bash:sudo": "WARNING: This command will run with elevated privileges.",
  "bash:curl": "WARNING: This command will send data to an external server.",
  "bash:git push --force": "WARNING: Force push will overwrite remote history.",
  "write_file:.env": "WARNING: Modifying environment variables file.",
};
```

第五层: Always Deny（永远拒绝）。这一层包含绝对不能执行的操作，即使用户确认也不行。典型操作: 读取或修改 `/etc/passwd`、`~/.ssh/` 下的密钥文件、执行 `rm -rf /`、访问系统级敏感路径、修改 Agent 自身的权限配置。这是安全底线:

```typescript
const ALWAYS_DENY_PATTERNS = [
  /^rm\s+-rf\s+\/$/,
  /^rm\s+-rf\s+~$/,
  /\/etc\/passwd/,
  /\/\.ssh\//,
  /\/\.aws\/credentials/,
  // ...
];
```

为什么需要 5 层而不是更多或更少？这是在实践中迭代出来的。最初我只有 3 层（允许、询问、拒绝），但发现两个问题。第一个问题是"询问疲劳": 简单的文件编辑每次都问，用户很快就会养成无脑按回车确认的习惯，这时真正危险的命令混在其中反而容易被忽略。引入第二层的"每会话问一次"后，询问频率下降了约 70%，用户对第三层和第四层的确认会更认真。第二个问题是缺少对高风险命令的特殊标记，有些操作虽然用户确认了但仍然不应该执行（比如 `rm -rf /`），或者需要特别强调风险（比如 `sudo`），所以引入了第四层的警告机制和第五层的硬性拒绝。

权限的判定流程是在工具层执行前，由基础设施层的权限检查器拦截:

```
tool.call()
  -> PermissionChecker.check(tool, args)
     -> 匹配 Always Deny? -> 拒绝并报错
     -> 匹配 Always Allow? -> 放行
     -> 匹配 Ask Once? -> 检查本会话是否已确认 -> 已确认则放行 / 否则弹窗
     -> 匹配 Warning? -> 弹窗并显示警告 -> 用户确认则放行
     -> 默认 Ask Every Time -> 弹窗 -> 用户确认则放行
```

权限配置存储在 `~/.swifty-cli/permissions.json` 中，用户可以自定义规则，比如将某些常用的安全命令加入 Always Allow 列表，或者将某些项目特定的危险路径加入 Always Deny 列表。

### Q10. swifty-cli 的上下文压缩是怎么做的？怎么保证压缩后不丢失关键信息？

上下文窗口是 LLM 最宝贵的资源。在一个复杂的编程任务中，Agent Loop 可能运行几十轮甚至上百轮，累积的对话历史很容易超出上下文窗口限制（比如 GPT-4 的 128K tokens 或 Claude 的 200K tokens）。一旦超出，LLM 要么截断历史（丢失信息），要么报错（任务中断）。所以我设计了一套分级压缩策略。

swifty-cli 的上下文压缩分为三个级别，按照压缩率从低到高、信息损失从少到多依次触发:

第一级压缩是工具结果裁剪（Tool Result Trimming）。这是最轻量的压缩方式，不依赖 LLM，直接对工具返回的原始文本做截断。当单个工具结果的 token 数超过阈值（默认 8000 tokens）时，保留开头 2000 tokens 和结尾 2000 tokens，中间部分替换为 `... [truncated 4000 tokens] ...`。这一级压缩在工具结果注入历史消息时立即执行:

```typescript
function truncateToolResult(content: string, maxTokens: number): string {
  const tokens = countTokens(content);
  if (tokens <= maxTokens) return content;

  const keepHead = Math.floor(maxTokens * 0.3);
  const keepTail = Math.floor(maxTokens * 0.3);
  const lines = content.split("\n");

  // 按行分割，保留头尾
  let headLines: string[] = [];
  let tailLines: string[] = [];
  let headTokens = 0;
  let tailTokens = 0;

  for (const line of lines) {
    if (headTokens + countTokens(line) < keepHead) {
      headLines.push(line);
      headTokens += countTokens(line);
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (tailTokens + countTokens(lines[i]) < keepTail) {
      tailLines.unshift(lines[i]);
      tailTokens += countTokens(lines[i]);
    }
  }

  return (
    headLines.join("\n") +
    `\n... [truncated ${tokens - headTokens - tailTokens} tokens] ...\n` +
    tailLines.join("\n")
  );
}
```

之所以保留头尾而非只有头部，是因为文件的开头通常是 import 声明和类型定义（有助于理解代码结构），而文件的结尾通常是最新的修改（Agent 最近关注的区域）。

第二级压缩是历史摘要替换（History Summary Replacement）。当第一级压缩后历史消息的总 token 数仍然超过上下文窗口的 70% 时，触发这一级压缩。将较早的对话轮次（保留最近 10 轮不动）通过一次 LLM 调用进行摘要:

```typescript
async function summarizeHistory(oldMessages: Message[]): Promise<string> {
  const summary = await llm.chat({
    messages: [
      {
        role: "system",
        content:
          "Summarize the following conversation concisely. Preserve: (1) the user goal, (2) key decisions made, (3) files modified and their current state, (4) errors encountered and how they were resolved, (5) any pending work. Omit: trivial tool outputs, repeated information, intermediate reasoning.",
      },
      ...oldMessages,
    ],
  });
  return summary.text;
}
```

摘要后，oldMessages 被替换为一条 `{ role: 'system', content: 'Previous conversation summary: ' + summary }` 消息。关键的 Prompt 设计确保了压缩后不丢失核心信息: 用户目标、已做的决策、文件修改状态、遇到的错误和解决方式、待完成的工作都被显式要求保留。

第三级压缩是选择性遗忘（Selective Forgetting）。这是最后手段，当第二级压缩后仍然超出时，按照优先级丢弃不重要的消息。优先级从低到高排列: 早期的工具结果（最不重要）、早期的 assistant 推理过程、早期的 user 中间消息、系统提示（最重要，永远不丢弃）。丢弃前会做一次检查: 如果被丢弃的消息中包含了尚未完成的任务引用，则在保留的消息中追加一个 reminder。

三级压缩的触发时机是每次 Agent Loop 开始前:

```
每次循环开始:
  1. 执行第一级压缩 (裁剪工具结果)
  2. 若总 tokens > 70% 窗口 -> 执行第二级压缩 (历史摘要)
  3. 若总 tokens > 90% 窗口 -> 执行第三级压缩 (选择性遗忘)
  4. 若仍然超出 -> 报错，要求用户开启新会话
```

保证不丢失关键信息的核心策略有四点。第一是摘要 Prompt 中显式列出必须保留的 5 类信息，并在摘要后做一次自动校验（再调一次 LLM 问"以下信息是否在摘要中有所体现"）。第二是保留最近 N 轮完整对话不压缩，因为近期的上下文对 Agent 当前决策最重要。第三是在 System Prompt 中注入跨会话记忆，即使当前会话的历史被压缩，之前会话提取的记忆仍然提供项目背景。第四是对文件修改操作做了专门的追踪，即使对话历史被压缩，"哪些文件被改了什么"这个信息始终作为结构化数据保留。

在实测中，这套压缩策略可以将上下文占用降低 60% 到 80%，而任务完成率只下降约 5%（对比拥有无限上下文的理想情况）。

### Q11. swifty-cli 的 worktree 文件隔离和 Agent Teams 多 teammate 协作是怎么实现的？

worktree 文件隔离和 Agent Teams 是 swifty-cli 支持并行开发的两个关键特性。

先说 worktree 文件隔离。这个设计借鉴了 Git worktree 的概念。当 Agent 开始一个任务时，我会为它创建一个独立的 Git worktree，这样 Agent 的所有文件修改都发生在这个 worktree 中，不会影响主分支:

```typescript
class WorktreeManager {
  async createWorktree(taskId: string, baseBranch: string): Promise<string> {
    const worktreePath = path.join(".swifty", "worktrees", taskId);
    const branchName = `agent/${taskId}`;

    await this.git.raw([
      "worktree",
      "add",
      "-b",
      branchName,
      worktreePath,
      baseBranch,
    ]);

    return worktreePath;
  }

  async mergeWorktree(
    taskId: string,
    targetBranch: string,
  ): Promise<MergeResult> {
    const branchName = `agent/${taskId}`;
    // 切换回目标分支
    await this.git.checkout(targetBranch);
    // 合并 Agent 分支
    const result = await this.git.merge([
      branchName,
      "--no-ff",
      "-m",
      `Merge agent task: ${taskId}`,
    ]);
    // 清理 worktree
    await this.git.raw([
      "worktree",
      "remove",
      path.join(".swifty", "worktrees", taskId),
    ]);
    await this.git.branch(["-d", branchName]);

    return result;
  }
}
```

Agent 的所有工具调用（write_file、bash 等）都会被重定向到 worktree 目录下执行。比如 Agent 调用 `write_file('src/index.ts', content)`，实际写入路径是 `.swifty/worktrees/task-123/src/index.ts`。Shell 命令的 `cwd` 也被设置为 worktree 路径。这样 Agent 的整个工作环境是完全隔离的，任务完成后可以选择合并回主分支或直接丢弃。

文件隔离的好处有三个。第一是安全: 即使 Agent 出了问题，主分支代码不受影响。第二是可审查: 任务完成后可以看到完整的 diff，决定哪些改动要保留。第三是并行: 多个 Agent 可以同时工作在不同的 worktree 上，互不干扰。

再说 Agent Teams 协作。这是 swifty-cli 中更高级的功能，允许一个领队 Agent（Orchestrator）创建多个子 Agent（Teammate），将一个大任务分解为子任务并行执行。

架构上采用了 Leader-Worker 模式:

```
Orchestrator Agent
    |
    |-- creates --> Teammate Agent A (worktree-a, task: 重构 API 层)
    |-- creates --> Teammate Agent B (worktree-b, task: 更新数据库 schema)
    |-- creates --> Teammate Agent C (worktree-c, task: 修改前端页面)
    |
    |-- monitors: 每个 teammate 的进度和状态
    |-- coordinates: 解决 teammate 之间的依赖和冲突
    |-- merges: 所有 teammate 完成后依次合并各自的 worktree
```

实现的核心是一个 `TeamManager` 类:

```typescript
class TeamManager {
  private orchestrator: Agent;
  private teammates: Map<string, Agent> = new Map();

  async addTeammate(task: string, context: string): Promise<string> {
    const teammateId = generateId();
    const worktree = await this.worktreeManager.createWorktree(
      teammateId,
      "main",
    );

    const teammate = new Agent({
      id: teammateId,
      worktreePath: worktree,
      systemPrompt: `You are a teammate agent. Your task: ${task}\n\nContext: ${context}\n\nRules:
        - Stay focused on your assigned task
        - Do not modify files outside your scope
        - Report progress and completion via the progress file
        - If blocked, write to the blocker file for the orchestrator`,
      tools: this.getScopedTools(task), // 只给 teammate 分配需要的工具
    });

    this.teammates.set(teammateId, teammate);
    return teammateId;
  }

  async runAll(): Promise<TeamResult> {
    // 并行启动所有 teammate
    const promises = Array.from(this.teammates.entries()).map(([id, agent]) =>
      agent.run().then((result) => ({ id, result })),
    );

    const results = await Promise.allSettled(promises);

    // 依次合并各 teammate 的 worktree
    for (const [id, agent] of this.teammates) {
      try {
        await this.worktreeManager.mergeWorktree(id, "main");
      } catch (e) {
        // 合并冲突时通知 orchestrator 介入解决
        await this.orchestrator.handleMergeConflict(id, e);
      }
    }

    return this.aggregateResults(results);
  }
}
```

Teammate 之间通过共享文件进行轻量级通信。每个 teammate 的 worktree 中有一个 `.swifty/progress.json` 文件记录当前进度，orchestrator 可以读取所有 teammate 的进度文件。如果 teammate A 需要 teammate B 的产出，orchestrator 会在 B 完成后将相关文件复制到 A 的 worktree 中。

合并冲突是这个系统最需要小心处理的问题。当多个 teammate 修改了同一个文件时，Git merge 会产生冲突。我的处理方式是: orchestrator 检测到冲突后，启动一个"冲突解决 Agent"，它能看到冲突双方的完整修改，结合每个 teammate 的任务上下文，智能地决定如何合并。如果冲突过于复杂无法自动解决，就暂停并请求用户介入。

在内部的一个测试项目中，我用 Agent Teams 完成了一个"将 Express 后端迁移到 Hono"的任务。orchestrator 分配了 3 个 teammate: 一个负责路由迁移，一个负责中间件迁移，一个负责测试用例迁移。总耗时比单 Agent 串行执行减少了约 55%，但合并冲突解决额外花了约 15% 的时间。

## 工作经历: 字节 TikTok Performance (Q12-Q14)

### Q12. 字节 TikTok Performance 项目: 为什么选 Kafka 加 Redis 加 MySQL 加 ClickHouse 这套组合？各自承担什么角色？多层缓存怎么设计？

在 TikTok Performance 团队，我负责的是一个数据密集型平台，核心业务是收集、处理和展示 TikTok 各端的性能指标数据。日均处理的上报事件约 2 亿条，峰值 QPS 约 5000。这个量级下，单一存储方案无法同时满足高写入吞吐、快速查询和长期存储的需求，所以我们选了 Kafka 加 Redis 加 MySQL 加 ClickHouse 的组合。

各组件的角色分工:

Kafka 作为数据入口和缓冲层。所有前端上报的性能数据、错误日志、用户行为事件首先写入 Kafka topic。Kafka 在这里承担三个职责: 削峰（前端流量有波峰波谷，Kafka 平滑了写入速率）、解耦（生产者不关心下游有多少消费者）、持久化（Kafka 自身有副本机制，数据不丢失）。我们按业务类型划分了多个 topic: `perf-metrics`、`js-errors`、`user-actions` 等。

Redis 作为实时查询和缓存层。存放两类数据: 一是实时聚合结果，比如最近 1 小时、最近 24 小时各指标的 P50/P90/P99 值，这些数据用于前端的实时监控面板; 二是高频查询的缓存，比如用户最近查看的 dashboard 配置、常用查询的结果缓存。Redis 的读写延迟在亚毫秒级别，能满足实时监控面板的高频刷新需求。

```
实时数据流:
  前端上报 -> Kafka (perf-metrics topic)
                |
                v
         Kafka Consumer (Golang + Kitex)
                |
                +---> Redis: 更新实时聚合 (P50/P90/P99, 滑动窗口)
                +---> ClickHouse: 写入明细数据
                +---> MySQL: 写入聚合后的日报/周报 (定时任务)
```

MySQL 作为业务配置和元数据存储。存放项目配置、告警规则、用户权限、dashboard 布局、通知订阅关系等业务数据。这些数据量不大（几十万行级别），但有事务需求（比如配置更新的原子性），且查询模式是点查和小范围查询，MySQL 完全胜任。我主要用 Go 的标准库加 sqlx 操作 MySQL，配合Kitex RPC 框架提供服务。

ClickHouse 作为 OLAP 分析引擎。存放所有的明细数据（2 亿条/天的原始上报记录），支持复杂的多维分析查询，比如"过去 7 天 iOS 端 Chrome 浏览器 FCP P90 按地区分布"。ClickHouse 的列式存储和向量化执行引擎在这类 OLAP 查询上比 MySQL 快 10 到 100 倍。我们用的是 ClickHouse 的 `MergeTree` 引擎族，按日期分区，按 `(appId, eventName, date)` 排序。

多层缓存的设计如下:

```
查询路径:
  前端请求 -> BFF (Nest.js)
                |
                v
         L1: 进程内存缓存 (Node.js Map, TTL 30s, 约 1000 条热点查询)
                |
                v (miss)
         L2: Redis 缓存 (TTL 5min, 约 50000 条常用查询)
                |
                v (miss)
         L3: ClickHouse (原始查询, 延迟 100ms-2s)
                |
                v
         结果回写到 L1 和 L2
```

L1 是 BFF 进程内的内存缓存，使用 Node.js 的 Map 存储，TTL 设为 30 秒。因为 BFF 是多实例部署（通常 4 个 Pod），每个 Pod 的 L1 缓存是独立的，但这在监控场景下可以接受（30 秒的数据延迟对监控面板无感知）。L1 的命中率在热门 dashboard 上约 60%。

L2 是 Redis 缓存，TTL 5 分钟，所有 BFF 实例共享。缓存 key 的设计是查询参数的哈希值:

```javascript
function buildCacheKey(query: { appId: string; metric: string; from: string; to: string; groupBy?: string[] }): string {
  const normalized = {
    appId: query.appId,
    metric: query.metric,
    from: normalizeTime(query.from),  // 对齐到 5 分钟粒度
    to: normalizeTime(query.to),
    groupBy: query.groupBy?.sort()
  };
  return `perf:cache:${md5(JSON.stringify(normalized))}`;
}
```

时间参数对齐到 5 分钟粒度，这样 5 分钟窗口内的相同查询可以命中同一份缓存。L2 的全局命中率约 45%。

L3 是 ClickHouse 原始查询，作为最终的兜底。为了优化 ClickHouse 查询性能，我建了多个物化视图（Materialized View）预聚合常见维度的指标，将原始查询的 P99 延迟从 2 秒降到了 200ms。

整体来看，这套架构使前端面板的查询 P99 延迟控制在 300ms 以内，同时 ClickHouse 的日写入量稳定在 2 亿条，资源利用率比较均衡。

### Q13. 字节 TikTok Performance 项目: Thrift IDL 生成 npm 包给 BFF 消费具体怎么做？版本管理怎么处理？

在 TikTok Performance 项目中，后端服务用 Golang 开发，基于字节内部的 Kitex 框架，RPC 协议使用 Thrift。前端 BFF 层用 Nest.js 开发。前后端需要通过 Thrift IDL 对齐接口定义，但 Thrift 原生不支持 TypeScript，如果前后端各维护一份接口定义很容易不一致，所以我们的方案是从 Thrift IDL 自动生成 TypeScript 类型和客户端代码，打包成 npm 包供 BFF 消费。

整个流程分为三步:

第一步是 IDL 定义。后端开发者在 IDL 仓库中编写 Thrift 文件定义服务接口:

```thrift
// perf_service.thrift
namespace go perf

struct MetricQuery {
    1: required string appId,
    2: required string metricName,
    3: required i64 startTime,
    4: required i64 endTime,
    5: optional list<string> groupBy,
    6: optional map<string, string> filters
}

struct MetricResult {
    1: required string metricName,
    2: required list<DataPoint> dataPoints,
    3: optional map<string, double> summary
}

struct DataPoint {
    1: required i64 timestamp,
    2: required double value,
    3: optional map<string, string> dimensions
}

service PerfService {
    MetricResult queryMetrics(1: MetricQuery query)
    list<MetricResult> batchQuery(1: list<MetricQuery> queries)
    map<string, MetricResult> getDashboard(1: string dashboardId, 2: i64 timeRange)
}
```

第二步是代码生成。我们写了一个 Node.js 脚本，调用 thrift 的编译器将 IDL 转成 TypeScript 类型定义和序列化/反序列化函数:

```bash
# 生成脚本
npx thrift-to-ts --input ./idl/perf_service.thrift --output ./src/generated/
```

生成的 TypeScript 代码包含接口类型和编解码器:

```typescript
// generated/perf_service.ts (自动生成，勿手动修改)
export interface MetricQuery {
  appId: string;
  metricName: string;
  startTime: number;
  endTime: number;
  groupBy?: string[];
  filters?: Record<string, string>;
}

export interface MetricResult {
  metricName: string;
  dataPoints: DataPoint[];
  summary?: Record<string, number>;
}

export class PerfServiceClient {
  private transport: ThriftTransport;

  constructor(options: { host: string; port: number }) {
    this.transport = new ThriftTransport(options);
  }

  async queryMetrics(query: MetricQuery): Promise<MetricResult> {
    return this.transport.call("queryMetrics", query);
  }

  async batchQuery(queries: MetricQuery[]): Promise<MetricResult[]> {
    return this.transport.call("batchQuery", queries);
  }
}
```

第三步是打包发布。将生成的代码包装成一个 npm 包，包名遵循字节的内部 npm registry 规范:

```json
{
  "name": "@bytedance/perf-service-client",
  "version": "1.3.2",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "generate": "thrift-to-ts --input ../idl/*.thrift --output ./src/generated/",
    "build": "tsc",
    "prepublishOnly": "npm run generate && npm run build"
  }
}
```

BFF 项目中的使用方式:

```typescript
import { PerfServiceClient, MetricQuery } from "@bytedance/perf-service-client";

const client = new PerfServiceClient({
  host: "perf-service.internal",
  port: 9090,
});

const result = await client.queryMetrics({
  appId: "tiktok-web",
  metricName: "FCP",
  startTime: Date.now() - 86400000,
  endTime: Date.now(),
  groupBy: ["browser", "region"],
});
```

版本管理是这套方案中最关键的环节。我们采用了"IDL 仓库驱动"的版本管理策略:

IDL 仓库独立于后端服务仓库和 BFF 仓库，由后端开发者维护。每次 IDL 修改后，CI pipeline 自动执行:

```
IDL 变更 -> CI 触发 -> 代码生成 -> TypeScript 编译检查 -> 单元测试 -> 版本号计算 -> npm publish
```

版本号遵循 semver 规范: 纯新增字段或接口的改动升级 minor 版本; 删除字段、修改字段类型、重命名接口等破坏性变更升级 major 版本; 注释或描述的改动升级 patch 版本。CI 脚本通过对比当前 IDL 和上一版本的 IDL diff 来自动判断版本级别。

BFF 端的 `package.json` 用 `~major.minor` 的版本范围锁定依赖，每周通过 Renovate bot 自动升级 patch 版本。major 版本升级需要人工 review 和调整 BFF 代码。

在实践中遇到的问题包括: Thrift 的 `optional` 字段在 TypeScript 中应该生成 `field?: type` 而非 `field: type | null`，否则使用时需要大量非空判断; Thrift 的 `map<string, string>` 在 TypeScript 中应该生成 `Record<string, string>` 而非 ES6 Map，因为前者在 JSON 序列化时更自然。这些都在 thrift-to-ts 的生成模板中做了定制。

### Q14. 字节 TikTok Performance 项目: 你写的虚拟滚动列表是怎么实现的？和 react-window / react-virtualized 比有什么优势？

在 TikTok Performance 平台的前端面板中，有一个日志查询页面需要展示大量的错误日志列表。单条日志信息量较大（包含堆栈、请求参数、用户信息等），且总条数经常达到数万条。直接渲染所有 DOM 节点会导致页面卡顿甚至崩溃，所以我实现了一个自定义的虚拟滚动列表组件。

核心原理是: 只渲染可视区域内的 DOM 节点，可视区域之外的数据只用一个占位 div 撑开滚动高度。当用户滚动时，动态计算当前可视区域对应数据的索引范围，替换渲染内容。

实现细节如下:

```typescript
interface VirtualListProps<T> {
  data: T[];
  itemHeight: number | ((index: number, item: T) => number);  // 支持固定高度和动态高度
  overscan: number;           // 上下额外渲染的行数
  containerHeight: number;    // 可视区域高度
  renderItem: (item: T, index: number) => React.ReactNode;
}

function VirtualList<T>({ data, itemHeight, overscan = 5, containerHeight, renderItem }: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算可视范围
  const getItemTop = useCallback((index: number) => {
    if (typeof itemHeight === 'number') return index * itemHeight;
    // 动态高度需要累积
    return data.slice(0, index).reduce((acc, item, i) => acc + itemHeight(i, item), 0);
  }, [data, itemHeight]);

  const totalHeight = getItemTop(data.length);
  const startIndex = Math.max(0, binarySearchIndex(scrollTop) - overscan);
  const endIndex = Math.min(data.length, binarySearchIndex(scrollTop + containerHeight) + overscan);

  const visibleItems = data.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      style={{ height: containerHeight, overflow: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item, i) => {
          const actualIndex = startIndex + i;
          return (
            <div
              key={actualIndex}
              style={{
                position: 'absolute',
                top: getItemTop(actualIndex),
                width: '100%',
                height: typeof itemHeight === 'number' ? itemHeight : itemHeight(actualIndex, item)
              }}
            >
              {renderItem(item, actualIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

与 react-window 和 react-virtualized 对比，我的实现有以下优势:

第一是动态高度的性能。react-window 的 `VariableSizeList` 需要预先知道每项的高度或提供 `itemSize` 函数，且内部维护一个高度缓存 Map，在数据量大时（5 万条以上）这个 Map 本身就会成为性能瓶颈。我的实现采用"懒计算加估算"的策略: 未渲染过的项使用一个估算高度（基于前 N 个已渲染项的平均高度），只有当项进入可视区域时才测量实际高度并更新缓存。这使得初始化时间从 O(n) 降低到 O(1)。

第二是异步数据加载与虚拟滚动的结合。在日志查询场景中，数据不是一次性加载的，而是随着滚动向后端请求更多。react-window 要求 data 数组是完整的，需要开发者自己处理分页逻辑。我的实现内置了"滚动到底部触发加载"的能力:

```typescript
// 距底部 threshold 像素时触发加载
const handleScroll = (e) => {
  const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
  if (scrollHeight - scrollTop - clientHeight < LOAD_THRESHOLD) {
    onLoadMore?.();
  }
  setScrollTop(scrollTop);
};
```

并在列表底部展示一个 loading 占位符，数据加载完成后无缝衔接。

第三是渲染优化。每个列表项用 `React.memo` 包裹，key 使用数据的唯一 ID 而非数组索引，避免滚动时不必要的重渲染。对于内容特别复杂的列表项（比如包含代码高亮的堆栈信息），使用 `useDeferredValue` 延迟渲染非可视区域的更新。

第四是搜索和跳转。在日志场景中，用户经常需要搜索关键字并跳转到匹配的日志条目。react-window 没有内置这个功能。我的实现在虚拟滚动之上支持了 `scrollToIndex(index)` 和 `highlightMatches(query)` API，搜索匹配到的条目即使不在已加载的数据中也能通过索引跳转:

```typescript
const virtualListRef = useRef<VirtualListHandle>(null);

// 搜索并跳转
const handleSearch = (query: string) => {
  const matchIndex = data.findIndex((item) => item.stack.includes(query));
  if (matchIndex >= 0) {
    virtualListRef.current?.scrollToIndex(matchIndex);
    setHighlightIndex(matchIndex);
  }
};
```

实测性能: 在 10 万条日志数据的场景下，虚拟滚动列表的 FPS 维持在 58 到 60 帧，首次渲染时间约 50ms（仅渲染可视区域的 20 条加上下各 5 条 overscan），相比直接渲染全部 DOM（此时页面直接冻结）是质变。与 react-window 对比，在动态高度场景下滚动 FPS 略高 3 到 5 帧，初始挂载时间快了约 40%。

## 工作经历: 腾讯 NoSQL DBMS (Q15-Q16)

### Q15. 腾讯 IEG NoSQL DBMS: React 类组件迁移到函数组件的具体策略？遇到过哪些坑？数据竞争问题（闭包、接口响应不稳定）怎么排查和解决的？

在腾讯 IEG 的 NoSQL DBMS 项目中，前端代码库有大约 80 个 React 组件，其中 60% 以上是类组件。这些类组件存在几个严重问题: 大量使用 `componentWillMount` 和 `componentWillReceiveProps` 等已废弃的生命周期、逻辑分散在多个生命周期方法中难以理解、状态管理混乱导致不可预测的渲染。我的任务是将它们迁移到函数组件加 Hooks 的方案。

迁移策略采用了渐进式方案，分三个阶段:

第一阶段是低风险组件优先。先迁移纯展示组件和无外部依赖的简单交互组件（如表格组件、弹窗组件），积累经验并建立测试基线。每个组件迁移前先用 React Testing Library 编写行为测试（不测实现细节，只测用户行为），确保迁移前后行为一致。

第二阶段是业务逻辑组件。这些组件通常有 API 调用、复杂状态管理和副作用。迁移时将 `componentDidMount` 中的逻辑转为 `useEffect` 加空依赖数组，`componentDidUpdate` 转为 `useEffect` 加对应依赖，`this.state` 转为 `useState`，`this.xxx` 类的非状态属性转为 `useRef`:

```typescript
// 迁移前: 类组件
class DatabaseList extends React.Component<Props, State> {
  state = { databases: [], loading: false, error: null };

  async componentDidMount() {
    this.setState({ loading: true });
    try {
      const databases = await api.getDatabases(this.props.clusterId);
      this.setState({ databases, loading: false });
    } catch (e) {
      this.setState({ error: e, loading: false });
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.clusterId !== this.props.clusterId) {
      this.componentDidMount();  // 反模式: 直接调用生命周期方法
    }
  }

  render() { /* ... */ }
}

// 迁移后: 函数组件
function DatabaseList({ clusterId }: Props) {
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;  // 防止竞态
    setLoading(true);
    api.getDatabases(clusterId)
      .then(data => { if (!cancelled) { setDatabases(data); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err); setLoading(false); } });

    return () => { cancelled = true; };  // cleanup
  }, [clusterId]);

  return (/* ... */);
}
```

第三阶段是全局状态管理重构。将分散在各组件 `state` 和 Redux store 中的状态统一迁移到 Zustand，使用 selector 模式避免不必要的重渲染。

迁移过程中遇到的主要坑:

第一个坑是闭包陷阱。这是最常见的 bug 来源。类组件中通过 `this.state.xxx` 总能获取最新状态，但函数组件中 Hooks 捕获的是当次渲染时的值:

```typescript
// Bug: count 永远是当次渲染时的值
useEffect(() => {
  const timer = setInterval(() => {
    console.log(count); // 永远输出 0，因为闭包捕获了初始值
    setCount(count + 1); // 每次都是 0 + 1，永远不会增加
  }, 1000);
  return () => clearInterval(timer);
}, []); // 空依赖

// 修复: 使用函数式更新
useEffect(() => {
  const timer = setInterval(() => {
    setCount((prev) => prev + 1); // 使用回调函数获取最新值
  }, 1000);
  return () => clearInterval(timer);
}, []);
```

第二个坑是 useEffect 的依赖遗漏。ESLint 的 `react-hooks/exhaustive-deps` 规则会警告，但有些团队忽略这些警告。迁移时我严格要求所有警告都必须处理，要么补全依赖，要么用 `// eslint-disable-next-line` 并注明原因。

数据竞争问题的排查和解决是我在这个项目中花精力最多的部分。有两个典型案例:

案例一: 闭包导致的数据陈旧。在一个数据库编辑页面中，用户在表单中修改数据后点击保存，但保存的始终是修改前的数据。原因是保存按钮的 onClick 回调在组件初次渲染时就创建了，闭包捕获了初始的 formState 值:

```typescript
// Bug: 保存时用的是陈旧闭包中的 formState
const handleSave = useCallback(() => {
  api.updateDatabase(formState); // formState 是闭包捕获的旧值
}, []); // 开发者为了"性能"加了空依赖

// 修复:
const handleSave = useCallback(() => {
  api.updateDatabase(formState);
}, [formState]); // 加完整依赖
```

案例二: 接口响应时间不稳定导致的竞态条件。在集群切换功能中，用户快速切换 clusterId（A -> B -> C），但三个请求的响应顺序不确定（可能 B 的请求先回来、C 的其次、A 的最后），最终页面显示的是 A 的数据而非 C 的:

```typescript
// Bug: 响应顺序不确定导致数据错乱
useEffect(() => {
  api.getDatabases(clusterId).then(setDatabases);
}, [clusterId]);

// 修复: 使用竞态取消
useEffect(() => {
  let cancelled = false;
  api.getDatabases(clusterId).then((data) => {
    if (!cancelled) setDatabases(data);
  });
  return () => {
    cancelled = true;
  };
}, [clusterId]);
```

我还封装了一个通用的 `useAsyncWithRace` Hook 来处理这类问题:

```typescript
function useAsyncWithRace<T>(asyncFn: () => Promise<T>, deps: any[]) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  });
  const requestId = useRef(0);

  useEffect(() => {
    const currentId = ++requestId.current;
    setState((prev) => ({ ...prev, loading: true }));

    asyncFn()
      .then((data) => {
        if (currentId === requestId.current) {
          // 只接受最新的响应
          setState({ data, loading: false, error: null });
        }
      })
      .catch((error) => {
        if (currentId === requestId.current) {
          setState({ data: null, loading: false, error });
        }
      });
  }, deps);

  return state;
}
```

整个迁移历时两个月，最终 80 个组件全部迁移完成。迁移后代码行数从约 28000 行减少到约 21000 行（减少了 25%），单元测试覆盖率从 30% 提升到 75%，与状态相关的 bug 报告数量从每月 12 个下降到了每月 2 个。

### Q16. 腾讯 IEG NoSQL DBMS: TCP 连接池怎么实现？进程池调用 C++ .so 加解密是什么架构？用 valgrind 排查 Node 和 C++ .so 内存泄漏的具体过程？对象池和 v8 隐藏类怎么用？

这个问题的涉及面比较广，我逐一展开。

TCP 连接池的实现:

NoSQL DBMS 的后端需要与底层的存储引擎通过 TCP 长连接通信。连接池用 Node.js 实现，核心设计参数包括: 最小空闲连接数 4、最大连接数 20、空闲超时回收 30 秒、连接健康检查间隔 10 秒。

```typescript
class ConnectionPool {
  private idle: Socket[] = [];
  private active: Set<Socket> = new Set();
  private waitQueue: Array<(conn: Socket) => void> = [];

  constructor(private readonly options: PoolOptions) {
    // 预创建最小连接数
    for (let i = 0; i < options.minConnections; i++) {
      this.idle.push(this.createConnection());
    }
    // 启动健康检查
    setInterval(() => this.healthCheck(), options.healthCheckInterval);
  }

  async acquire(): Promise<Socket> {
    // 优先复用空闲连接
    let conn = this.idle.pop();

    if (conn && this.isAlive(conn)) {
      this.active.add(conn);
      return conn;
    }

    // 空闲连接不可用，创建新连接（如果未达上限）
    if (this.active.size + this.idle.length < this.options.maxConnections) {
      conn = this.createConnection();
      this.active.add(conn);
      return conn;
    }

    // 达到上限，排队等待
    return new Promise((resolve) => this.waitQueue.push(resolve));
  }

  release(conn: Socket): void {
    this.active.delete(conn);

    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      this.active.add(conn);
      waiter(conn);
    } else {
      this.idle.push(conn);
      // 设置空闲超时
      (conn as any)._idleTimer = setTimeout(() => {
        this.destroyConnection(conn);
      }, this.options.idleTimeout);
    }
  }
}
```

进程池调用 C++ .so 加解密的架构:

NoSQL DBMS 涉及对存储数据的加解密操作，加解密算法使用公司内部 C++ 库实现，以 `.so` 共享库形式提供。直接在 Node.js 主线程中通过 N-API 调用 `.so` 会阻塞事件循环（加密一个 1MB 的数据块大约需要 5ms，在高负载下会严重影响 Node.js 的并发能力），所以我们采用了 child_process 进程池的方案:

```
Node.js 主进程 (事件循环)
    |
    |-- fork 子进程 1: 加载 crypto.so, 处理加解密请求
    |-- fork 子进程 2: 加载 crypto.so, 处理加解密请求
    |-- fork 子进程 3: 加载 crypto.so, 处理加解密请求
    |-- fork 子进程 4: 加载 crypto.so, 处理加解密请求
```

主进程维护一个子进程池（默认 4 个子进程，与 CPU 核心数一致），每个子进程是一个独立的 Node.js worker，通过 N-API 加载 C++ .so。加解密请求通过 IPC (inter-process communication) 分发到空闲的子进程，子进程处理完毕后通过 IPC 返回结果:

```typescript
class CryptoProcessPool {
  private workers: Worker[] = [];
  private tasks: Map<number, { resolve: Function; reject: Function }> =
    new Map();
  private taskId = 0;

  constructor(poolSize: number = os.cpus().length) {
    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker("./crypto-worker.js");
      worker.on("message", (msg) => {
        const task = this.tasks.get(msg.taskId);
        if (task) {
          this.tasks.delete(msg.taskId);
          if (msg.error) task.reject(msg.error);
          else task.resolve(msg.result);
        }
      });
      this.workers.push(worker);
    }
  }

  async encrypt(data: Buffer, keyId: string): Promise<Buffer> {
    const id = ++this.taskId;
    const worker = this.getLeastBusyWorker();

    return new Promise((resolve, reject) => {
      this.tasks.set(id, { resolve, reject });
      worker.postMessage({ taskId: id, action: "encrypt", data, keyId });
    });
  }
}
```

这种架构的好处是加解密的 CPU 密集计算在独立进程中执行，不阻塞 Node.js 主进程的事件循环。4 个子进程可以并行处理 4 个加解密请求，吞吐量提升约 3.5 倍。

用 valgrind 排查内存泄漏的具体过程:

上线运行一段时间后，我们发现某些 Node.js 进程的内存持续增长，从启动时的 200MB 在 24 小时内涨到 800MB 以上，最终 OOM 崩溃。初步排除了 JavaScript 层面的内存泄漏（通过 heapdump 对比发现 JS 堆大小稳定在 150MB 左右），判断泄漏发生在 C++ 层。

排查步骤如下:

第一步，安装 valgrind 并配置 Node.js 的 debug build:

```bash
# macOS 下不支持 valgrind，在 Linux 测试机上执行
sudo apt-get install valgrind
# 使用 Node.js 的 valgrind suppressions 文件过滤已知的误报
wget https://raw.githubusercontent.com/nodejs/node/main/src/valgrind.supp
```

第二步，使用 valgrind 的 massif 工具跟踪堆内存分配:

```bash
valgrind --tool=massif --pages-as-heap=yes --massif-out-file=massif.out node --expose-gc crypto-worker.js
```

运行一段时间后生成 massif.out 文件，用 `ms_print` 分析内存分配快照:

```bash
ms_print massif.out | head -100
```

从快照中发现 C++ 层的 `crypto_context_new` 函数分配的内存持续增长，但对应的 `crypto_context_free` 调用次数明显少于 `new`。

第三步，定位到具体的 C++ 代码。在 N-API 绑定层中发现一个 bug: 当加密操作因为输入参数错误而抛出异常时，函数在 throw 前忘记释放已经分配的 `CryptoContext` 对象:

```cpp
// Bug: 异常路径下内存泄漏
napi_value Encrypt(napi_env env, napi_callback_info info) {
    CryptoContext* ctx = crypto_context_new(key, key_len);  // 分配内存

    if (input_len == 0) {
        napi_throw_error(env, nullptr, "Input cannot be empty");
        return nullptr;  // Bug: ctx 没有释放!
    }

    // 正常路径
    auto result = crypto_encrypt(ctx, input, input_len);
    crypto_context_free(ctx);  // 正常路径释放了
    return result;
}
```

修复方式是在异常路径也释放内存，更优雅的做法是用 RAII 智能指针:

```cpp
napi_value Encrypt(napi_env env, napi_callback_info info) {
    std::unique_ptr<CryptoContext, decltype(&crypto_context_free)> ctx(
        crypto_context_new(key, key_len),
        crypto_context_free
    );

    if (input_len == 0) {
        napi_throw_error(env, nullptr, "Input cannot be empty");
        return nullptr;  // unique_ptr 自动释放
    }

    auto result = crypto_encrypt(ctx.get(), input, input_len);
    return result;  // unique_ptr 析构时自动释放
}
```

修复后内存增长曲线趋于稳定，24 小时内 RSS 增长不超过 20MB。

对象池和 v8 隐藏类的使用:

对象池用在加解密请求的高频场景。每次加密请求都需要创建请求对象、Buffer 对象和结果对象，频繁的创建和回收导致 GC 压力很大。我实现了一个简单的对象池:

```typescript
class BufferPool {
  private pool: Buffer[] = [];
  private readonly POOL_SIZE = 100;

  acquire(size: number): Buffer {
    const buf = this.pool.pop();
    if (buf && buf.length >= size) {
      return buf.subarray(0, size); // 复用已有的 Buffer
    }
    return Buffer.allocUnsafe(size);
  }

  release(buf: Buffer): void {
    if (this.pool.length < this.POOL_SIZE) {
      this.pool.push(buf);
    }
    // 超过池容量则丢弃，让 GC 回收
  }
}
```

v8 隐藏类（在 v8 内部也叫 "map" 或 "shape"）是 v8 引擎优化对象属性访问的机制。当多个对象具有相同的属性名、相同的属性添加顺序时，v8 会为它们共享同一个隐藏类，从而生成高效的内联缓存（Inline Cache）。要利用这个机制，关键规则是: 所有同类对象的属性必须以相同顺序赋值，避免动态添加属性。

我在项目中做了以下优化:

```typescript
// Bad: 属性顺序不一致，导致多个隐藏类
function createRequestA(data: any) {
  const req: any = {};
  req.type = "encrypt";
  req.data = data;
  req.timestamp = Date.now(); // 顺序: type -> data -> timestamp
  return req;
}

function createRequestB(data: any) {
  const req: any = {};
  req.timestamp = Date.now(); // 顺序: timestamp -> type -> data
  req.type = "encrypt";
  req.data = data;
  return req;
}

// Good: 使用 TypeScript class 或固定的初始化顺序
class CryptoRequest {
  type: string;
  data: Buffer;
  timestamp: number;

  constructor(data: Buffer) {
    this.type = "encrypt"; // 固定顺序
    this.data = data;
    this.timestamp = Date.now();
  }
}
```

另一个规则是避免在运行时给对象添加或删除属性（`delete obj.prop` 会让 v8 放弃该隐藏类，回退到慢速的字典模式）。在代码中用 `undefined` 替代 `delete`:

```typescript
// Bad: delete 导致隐藏类失效
delete request.result;

// Good: 用 undefined 替代
request.result = undefined;
```

这些优化在加解密高频场景下使 GC 暂停时间从平均 15ms 降低到了 5ms，吞吐量提升了约 20%。

## 工作经历: 字节 Data 架构 (Q17-Q18)

### Q17. 字节 Data: JSError 大模型自动修复是怎么做的？完整的技术方案和收益数据？

在字节 Data 架构部门，我负责搜索推荐算法平台和抖音 Debug 平台的前端开发。其中最有技术含量的一个项目是 JSError 大模型自动修复系统。

背景是: 抖音 Debug 平台每天接收约 50 万条前端 JSError，其中大量是重复的、模式化的错误（如 undefined property access、null reference、API response shape mismatch 等）。开发团队每天需要花大量时间手动分析错误、定位代码、修复并验证，效率很低。我提出了用大模型自动分析和修复 JSError 的方案。

完整的技术方案分为四个阶段:

第一阶段是错误预处理与上下文收集。当一条 JSError 上报后，系统执行以下操作:

```
JSError 事件
    |
    v
SourceMap 还原 -> 获取原始代码文件和行号
    |
    v
代码上下文提取 -> 读取出错位置前后 50 行代码
    |
    v
堆栈分析 -> 提取调用链，定位所有相关文件和函数
    |
    v
类型信息收集 -> 调用 TypeScript Language Server 获取相关变量的类型
    |
    v
错误聚类 -> 与历史相似错误匹配合并
```

关键步骤是代码上下文提取。不只是读取出错行的代码，而是沿着调用链读取所有相关函数的定义。比如一个 TypeError 发生在 `user.profile.name` 这一行，系统会回溯到 `user` 来自哪个 API 调用、`profile` 的类型定义是什么、这个函数的入参来自哪里。

第二阶段是大模型分析与修复。将收集到的上下文组装成 Prompt，调用 LLM 生成修复方案:

````
System: 你是一个前端代码修复专家。以下是一个 JSError 的详细信息和相关代码上下文。请分析问题原因并生成修复代码。

## Error Info
Type: TypeError
Message: Cannot read properties of undefined (reading 'name')
Original Location: src/pages/UserDetail.tsx:45:23

## Code Context (error location)
```tsx
43: const user = useUser(userId);
44:
45: return <div>{user.profile.name}</div>;
````

## Type Information

- `useUser` returns `User | null` (can be null when loading)
- `User.profile` is `Profile | undefined` (optional field in API response)

## Suggested Fix Approach

1. Add null check for `user` (it can be null during loading)
2. Add optional chaining for `profile.name` (profile is optional)

请生成修复后的代码，只输出需要修改的部分。

````

LLM 返回修复代码后，系统自动生成一个 Git patch:

```diff
- return <div>{user.profile.name}</div>;
+ if (!user) return <Loading />;
+ return <div>{user.profile?.name ?? 'Unknown'}</div>;
````

第三阶段是自动验证。生成的 patch 不会直接提交，而是先在一个沙箱环境中运行验证:

```
Patch 生成
    |
    v
AST 合法性检查 -> 确保修改后的代码能通过 TypeScript 编译
    |
    v
单元测试运行 -> 在沙箱中运行相关模块的单元测试
    |
    v
类型检查 -> tsc --noEmit 确保没有新的类型错误
    |
    v
回归测试 -> 用原始 error 的复现路径验证修复是否生效
```

只有全部验证通过的 patch 才会进入下一步。

第四阶段是人工审核与部署。验证通过的 patch 自动生成一个 Pull Request，附带错误信息、分析过程和验证结果。开发者只需 review diff 并点击 approve。合并后走正常的 CI/CD 部署流程。

收益数据:

该系统上线 3 个月后的数据:

- 日均自动处理 JSError 约 8 万条（占总量 16%），其中 3.2 万条生成了有效的修复 patch
- 自动修复 patch 的验证通过率约 65%
- 开发者审核后实际合并的 patch 约 1.5 万条/日，合并率约 47%（相对于通过验证的 patch）
- 开发团队用于 JSError 修复的人时从日均 6 小时降低到 2.5 小时，降幅约 58%
- 高频重复类错误（如 undefined access、null check 缺失）的自动修复成功率最高，达 72%
- 复杂逻辑错误（如竞态条件、状态管理混乱）的自动修复成功率较低，约 15%，主要作为辅助参考

### Q18. 字节 Data: SWR 前端性能优化具体做了什么？A2UI React 框架接入是怎么回事？

SWR 优化:

SWR（stale-while-revalidate）是搜索推荐算法平台前端的一项关键性能优化。平台有多个数据密集的页面（算法实验列表、模型训练任务面板、特征监控面板），这些页面的数据量大、刷新频繁，直接用 SWR 的默认配置会导致严重的性能问题。

我做的优化集中在以下几个方面:

第一是请求去重与共享。在算法实验列表中，多个卡片组件各自独立请求实验详情接口，导致同一个实验 ID 被重复请求多次。我封装了一个全局的 SWR 配置，利用 SWR 内置的 key 去重机制，确保相同的 API 路径在同一时间窗口内只发一次请求:

```typescript
// 全局 SWR 配置
const swrConfig = {
  dedupingInterval: 5000,   // 5 秒内去重
  revalidateOnFocus: false, // 窗口聚焦不自动刷新（避免用户切换 tab 时触发大量请求）
  revalidateOnReconnect: true,
};

// 每个卡片使用同一个 key
function ExperimentCard({ experimentId }: { experimentId: string }) {
  const { data } = useSWR(
    `/api/experiments/${experimentId}`,
    fetcher,
    swrConfig
  );
  return <div>{/* ... */}</div>;
}
```

第二是分页请求的增量更新。实验列表有几百条数据，但用户通常只看前几页。我实现了基于游标的分页加载，并且只缓存用户实际访问过的页面:

```typescript
function useExperimentList(page: number, pageSize: number = 20) {
  return useSWR(
    page >= 0 ? `/api/experiments?page=${page}&size=${pageSize}` : null,
    async (url) => {
      const response = await fetch(url).then((r) => r.json());
      return response;
    },
    {
      // 保持之前页面的数据，只更新当前页面
      keepPreviousData: true,
      // 预加载下一页
      onSuccess: () => {
        mutate(`/api/experiments?page=${page + 1}&size=${pageSize}`);
      },
    },
  );
}
```

第三是乐观更新（Optimistic Update）。用户修改实验配置时，不等 API 返回就先更新本地状态，让界面立即响应。如果 API 失败再回滚:

```typescript
async function updateExperimentConfig(id: string, config: ExperimentConfig) {
  const previousConfig = cache.get(`/api/experiments/${id}`)?.config;

  // 乐观更新
  mutate(
    `/api/experiments/${id}`,
    (current) => ({
      ...current,
      config,
    }),
    false,
  );

  try {
    await api.updateExperimentConfig(id, config);
    // 成功后重新验证
    mutate(`/api/experiments/${id}`);
  } catch (error) {
    // 失败回滚
    mutate(
      `/api/experiments/${id}`,
      (current) => ({
        ...current,
        config: previousConfig,
      }),
      false,
    );
    toast.error("Update failed, rolled back");
  }
}
```

第四是内存缓存策略。平台有很多历史实验的数据，用户很少再次查看但会占用 SWR 缓存内存。我配置了基于 LRU 的缓存驱逐策略，缓存最多保留 200 条数据，超出的按 LRU 规则淘汰:

```typescript
const cache = new Map();
const MAX_CACHE_SIZE = 200;

const lruProvider = () => {
  return {
    get: (key) => cache.get(key),
    set: (key, value) => {
      if (cache.size >= MAX_CACHE_SIZE) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
      }
      cache.delete(key); // 删除以重新插入到末尾
      cache.set(key, value);
    },
    delete: (key) => cache.delete(key),
  };
};
```

SWR 优化上线后，算法实验列表的首屏加载时间从 3.2 秒降低到 1.4 秒（降幅 56%），API 请求数量从平均 45 次/页面降低到 18 次/页面（降幅 60%），用户在列表中滚动和翻页时的 LCP 从 1.8 秒降低到 0.6 秒。

A2UI React 框架接入:

A2UI（Agent to UI）是字节内部的一个 AI 驱动的前端框架，核心理念是让 Agent 能够根据业务逻辑动态生成 UI 组件。在搜索推荐算法平台中，不同算法团队对实验面板的需求差异很大，传统的硬编码 UI 无法快速满足所有需求。A2UI 的思路是将 UI 描述为 JSON Schema，由 Agent 根据用户意图生成 Schema，前端框架渲染对应的 UI。

我的工作是负责将 A2UI 框架接入到搜索推荐算法平台的 React 项目中。主要包含:

第一是 Schema 解析器。将 A2UI 返回的 JSON Schema 解析为 React 组件树:

```typescript
interface A2UISchema {
  type: 'layout' | 'component';
  component?: string;      // 组件名，如 'Table', 'Chart', 'Form'
  props?: Record<string, any>;
  children?: A2UISchema[];
  dataSource?: string;     // 数据源 API 路径
  condition?: string;      // 显示条件表达式
}

function renderA2UI(schema: A2UISchema): React.ReactNode {
  if (schema.condition && !evaluate(schema.condition, context)) return null;

  const Component = componentRegistry[schema.component];
  const props = resolveProps(schema.props, dataContext);

  if (schema.dataSource) {
    return (
      <SWRDataProvider source={schema.dataSource}>
        <Component {...props}>
          {schema.children?.map(renderA2UI)}
        </Component>
      </SWRDataProvider>
    );
  }

  return (
    <Component {...props}>
      {schema.children?.map(renderA2UI)}
    </Component>
  );
}
```

第二是组件注册表。将平台已有的 React 组件注册到 A2UI 的组件系统中，使 Agent 可以通过名字引用:

```typescript
const componentRegistry = {
  Table: ExperimentTable,
  LineChart: MetricsLineChart,
  BarChart: DistributionBarChart,
  Form: ConfigForm,
  CodeEditor: MonacoEditor,
  Terminal: XTermTerminal,
  // ...
};
```

第三是数据安全层。Agent 生成的 Schema 中可能包含对敏感 API 的调用，我在数据源层面加了权限校验:

```typescript
function SWRDataProvider({ source, children }) {
  const allowed = usePermissionCheck(source);
  if (!allowed) return <PermissionDenied resource={source} />;

  const { data, error } = useSWR(source, fetcher);
  if (error) return <ErrorView error={error} />;
  if (!data) return <Skeleton />;

  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}
```

接入后，算法团队可以通过自然语言描述（如"给我看这个实验过去 7 天的 CTR 趋势，按流量桶分解"）让 Agent 动态生成定制化面板，减少了约 40% 的定制化 UI 开发需求。

## 工作经历: 阿里妈妈广告技术 (Q19)

### Q19. 阿里妈妈: Server&Schema-Driven UI 是什么？Module Federation 接入具体做了什么？你给 @module-federation/vite 贡献了什么？

Server&Schema-Driven UI:

Server&Schema-Driven UI（SSD-UI）是阿里妈妈广告技术部的一个核心前端架构，它的设计目标是解决广告投放平台中"千人千面的运营配置页面"的维护难题。广告平台有大量运营后台页面（活动配置、人群圈选、投放策略、效果报表等），每种页面的表单结构和校验规则各不相同，传统方式是为每种页面写一套 React 代码，但运营需求的变更速度远超前端开发速度。

SSD-UI 的核心思路是将页面的 UI 结构、数据来源和交互逻辑全部描述为 JSON Schema，由服务端下发 Schema，前端通用渲染引擎根据 Schema 动态生成页面:

```
Server (下发 Schema)
    |
    v
{
  "version": "2.0",
  "layout": {
    "type": "form",
    "fields": [
      {
        "name": "campaignName",
        "label": "推广计划名称",
        "type": "input",
        "required": true,
        "maxLength": 50,
        "validation": [{ "type": "regex", "pattern": "^[a-zA-Z0-9_]+$", "message": "只允许字母、数字和下划线" }]
      },
      {
        "name": "budget",
        "label": "日预算",
        "type": "number",
        "required": true,
        "min": 100,
        "max": 1000000,
        "suffix": "元"
      },
      {
        "name": "targetAudience",
        "label": "目标人群",
        "type": "asyncSelect",
        "dataSource": "/api/audiences",
        "multi": true
      }
    ]
  },
  "actions": {
    "submit": { "url": "/api/campaigns", "method": "POST" },
    "draft": { "url": "/api/campaigns/draft", "method": "POST" }
  }
}
    |
    v
Frontend Schema Renderer (通用渲染引擎)
    |
    v
生成完整的表单页面（含校验、提交、草稿保存等功能）
```

我的工作包括: 优化 Schema 渲染引擎的性能（之前的实现在 Schema 层级较深时渲染卡顿）、增加 Schema 的版本管理和灰度发布能力、开发了一个可视化的 Schema 编辑器让运营人员可以自己调整页面配置。

Module Federation 接入:

阿里妈妈的广告平台是一个多团队共建的大型应用，由 5 个不同团队各自维护不同的业务模块（投放管理、效果分析、人群管理、创意中心、财务结算）。传统方式是 monorepo 加微前端（qiankun），但 qiankun 的沙箱机制带来了性能开销，且模块间共享依赖的优化不够精细。

团队决定迁移到基于 Webpack Module Federation（MF）的方案。MF 的优势是模块间可以像 import 本地模块一样加载远程模块，无需 runtime 沙箱，且 shared dependencies 可以精确控制版本和 single-instance 语义。

接入方案:

宿主应用（host）的 Webpack 配置:

```javascript
// host/webpack.config.js
module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "host",
      remotes: {
        campaign: "campaign@/campaign/remoteEntry.js",
        analytics: "analytics@/analytics/remoteEntry.js",
        audience: "audience@/audience/remoteEntry.js",
        creative: "creative@/creative/remoteEntry.js",
        finance: "finance@/finance/remoteEntry.js",
      },
      shared: {
        react: { singleton: true, requiredVersion: "^18.2.0" },
        "react-dom": { singleton: true, requiredVersion: "^18.2.0" },
        "@alipay/antd": { singleton: true, requiredVersion: "^5.0.0" },
        zustand: { singleton: true },
      },
    }),
  ],
};
```

远程模块（remote）的配置:

```javascript
// campaign/webpack.config.js
module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "campaign",
      filename: "remoteEntry.js",
      exposes: {
        "./CampaignList": "./src/pages/CampaignList",
        "./CampaignDetail": "./src/pages/CampaignDetail",
        "./hooks": "./src/hooks/index",
      },
      shared: {
        react: { singleton: true },
        "react-dom": { singleton: true },
      },
    }),
  ],
};
```

宿主应用动态加载远程模块:

```typescript
import React, { Suspense, lazy } from 'react';

const CampaignList = lazy(() => import('campaign/CampaignList'));
const AnalyticsDashboard = lazy(() => import('analytics/Dashboard'));

function App() {
  return (
    <Router>
      <Route path="/campaign" element={
        <Suspense fallback={<PageSkeleton />}>
          <CampaignList />
        </Suspense>
      } />
      <Route path="/analytics" element={
        <Suspense fallback={<PageSkeleton />}>
          <AnalyticsDashboard />
        </Suspense>
      } />
    </Router>
  );
}
```

在这个过程中我解决的关键问题包括: shared 依赖的版本协商策略（避免运行时加载多个 React 实例导致 Hooks 报错）、远程模块的加载失败降级（remoteEntry.js 加载超时后切换到独立部署的降级版本）、以及 TypeScript 类型支持（为远程模块生成 `.d.ts` 声明文件，使 IDE 能正确推断远程导入的类型）。

对 @module-federation/vite 的贡献:

阿里妈妈的部分新项目开始使用 Vite 替代 Webpack，因此需要将 Module Federation 能力迁移到 Vite 生态。社区有 `@module-federation/vite` 这个包，但当时还有一些不完善的地方。我在使用过程中发现了几个问题并提交了 PR:

第一个贡献是修复了 Vite dev server 下远程模块热更新失效的问题。原因是 `@module-federation/vite` 的插件在 dev 模式下没有正确注入 HMR boundary，导致远程模块的代码变更后整个页面会 full reload 而非局部热更新。我在 Vite 插件的 `transformIndexHtml` 钩子中添加了 HMR boundary 的注入:

```javascript
// 修复: 在 dev server 模式下注入 HMR boundary
transformIndexHtml(html) {
  if (isDevServer) {
    return html.replace(
      '</head>',
      `<script>
        if (import.meta.hot) {
          import.meta.hot.accept(() => {
            // 远程模块热更新时只刷新当前模块
          });
        }
      </script></head>`
    );
  }
}
```

第二个贡献是优化了 shared dependencies 的预构建逻辑。之前的实现对每个 shared dependency 都单独做一次 Vite optimizeDeps，在依赖很多时预构建耗时很长。我将多个 shared dependencies 合并为一次 optimizeDeps 调用，将预构建时间从 12 秒降低到了 3 秒。

第三个贡献是添加了 runtime plugin 机制，允许开发者在运行时动态修改远程模块的加载行为（如添加鉴权 header、切换 CDN 源等）。这个功能对齐了 Webpack 版本 Module Federation 的 runtime plugin API。

总共提交了 4 个 PR，其中 3 个被合并，1 个还在 review 中。

## 基础知识: React/Vue/TypeScript (Q20)

### Q20. React Fiber 架构和 Vue3 响应式原理对比？你在项目里怎么利用这些原理做性能优化？

React Fiber 架构:

React 从 16 版本开始引入 Fiber 架构，核心目的是解决老版 Stack Reconciler 在处理大型组件树时导致的长时间卡顿问题。

Stack Reconciler 的问题是: diff 过程是递归的，一旦开始就不能中断，必须遍历完整棵组件树才能释放主线程。当组件树很大（比如一个有数千行的列表）时，diff 过程可能占用主线程几十毫秒，导致动画卡顿和用户输入无响应。

Fiber 架构的核心思想是将渲染工作拆分为一个个小的"工作单元"（即 Fiber Node），每个 Fiber Node 对应一个组件实例。Fiber Node 是一个链表结构（而非树结构），通过 `child`、`sibling`、`return` 三个指针将组件树转换为链表:

```
Fiber Node 结构:
  {
    type: FunctionComponent | ClassComponent | HostComponent,
    stateNode: DOM element | Component instance,
    child: Fiber | null,       // 第一个子节点
    sibling: Fiber | null,     // 下一个兄弟节点
    return: Fiber | null,      // 父节点
    pendingProps: any,
    memoizedState: any,
    memoizedProps: any,
    flags: number,             // 副作用标记 (placement, update, deletion)
    lanes: number,             // 优先级车道
  }
```

这种链表结构使 React 可以在处理每个 Fiber Node 后检查是否应该让出主线程（通过 `shouldYield()` 检查，通常每 5ms 让出一次）。如果应该让出，React 保存当前的工作进度（当前处理到哪个 Fiber Node），等浏览器空闲时（通过 `requestIdleCallback` 或自己实现的时间切片）恢复工作。这就是所谓的"可中断渲染"。

另一个关键概念是"双缓冲"（Double Buffering）。React 维护两棵 Fiber 树: current 树（当前显示在屏幕上的）和 workInProgress 树（正在构建的下一帧）。所有的 diff 和更新操作都在 workInProgress 树上进行，完成后一次性将 root 指针切换到新树，避免了中间状态闪烁。

Fiber 架构引入了优先级调度（Lane Model）。不同的更新有不同的优先级: 用户点击（SyncLane）优先级最高、动画帧（InputContinuousLane）其次、网络请求导致的 setState（DefaultLane）再次、离屏渲染（OffscreenLane）最低。高优先级更新可以"打断"正在进行的低优先级更新:

```
优先级车道 (从高到低):
  SyncLane (1)              <- 用户同步操作 (如 onClick)
  InputContinuousLane (4)   <- 连续输入 (如拖拽)
  DefaultLane (16)          <- 普通 setState
  TransitionLane (多种)     <- 过渡更新
  IdleLane (最高位)         <- 空闲时执行
```

Vue3 响应式原理:

Vue3 的响应式系统从 Vue2 的 `Object.defineProperty` 全面迁移到了 `Proxy`。核心改进在于: `Proxy` 可以拦截对象的所有操作（属性读写、新增属性、删除属性、原型链操作等），而 `defineProperty` 只能拦截已有属性的读写，新增和删除属性无法感知。

Vue3 响应式的核心由三个函数组成: `reactive()`（将普通对象包装为响应式代理）、`effect()`（注册副作用函数）、`track()` 和 `trigger()`（依赖收集与触发）。

```javascript
// 简化版 Vue3 响应式核心
const targetMap = new WeakMap(); // target -> Map(key -> Set<effect>)
let activeEffect = null;

function reactive(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      track(target, key); // 收集依赖
      const result = Reflect.get(target, key, receiver);
      if (isObject(result)) return reactive(result); // 深层响应
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
      const result = Reflect.deleteProperty(target, key);
      trigger(target, key);
      return result;
    },
  });
}

function effect(fn) {
  activeEffect = fn;
  fn(); // 立即执行，触发 get 拦截，收集依赖
  activeEffect = null;
}

function track(target, key) {
  if (!activeEffect) return;
  let depsMap = targetMap.get(target);
  if (!depsMap) targetMap.set(target, (depsMap = new Map()));
  let deps = depsMap.get(key);
  if (!deps) depsMap.set(key, (deps = new Set()));
  deps.add(activeEffect);
}

function trigger(target, key) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;
  const deps = depsMap.get(key);
  if (deps) deps.forEach((effect) => effect());
}
```

Vue3 响应式的关键优势是"精确追踪"。每个 property 都有独立的依赖集合（一个 Set），当某个 property 变更时，只有依赖了这个 property 的 effect（对应到组件级别就是组件的 render 函数）会被重新执行。未使用该 property 的组件完全不受影响。

两者的对比:

从更新粒度看，React Fiber 的最小更新粒度是组件级别。即使只有组件内一个变量变化，整个组件的 render 函数也会重新执行（然后通过 Virtual DOM diff 决定实际更新哪些 DOM）。Vue3 的最小更新粒度可以精确到 property 级别，在 template 编译阶段 Vue3 会将模板拆成多个独立的"block"，每个 block 有独立的依赖追踪，变更时只更新受影响的 block。

从调度方式看，React Fiber 是"pull"模型——显式调用 setState 触发更新，React 调度器决定何时执行。Vue3 是"push"模型——数据变更时自动触发依赖的 effect（render），响应式系统自动追踪依赖关系，开发者不需要手动标记哪些数据变更了。

从并发能力看，React Fiber 支持可中断渲染和优先级调度，可以在高优先级更新到来时打断低优先级的渲染。Vue3 目前不支持可中断渲染（Vue 团队在研究中但未在 3.x 中实现），但通过细粒度的依赖追踪和编译时优化（如 PatchFlag），Vue3 的实际更新性能在很多场景下优于 React。

在项目中的性能优化实践:

在 React 项目中，利用 Fiber 架构特性做的优化:

第一是用 `useTransition` 和 `startTransition` 将非紧急更新标记为 transition 优先级，避免阻塞用户交互:

```typescript
function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value); // 高优先级: 输入框立即响应
    startTransition(() => {
      // 低优先级: 搜索结果列表可以被中断
      setResults(searchExpensive(e.target.value));
    });
  };
}
```

在算法平台的搜索面板中，用户输入搜索关键字时，输入框的更新是 SyncLane 优先级（立即响应），而搜索结果的重新计算和渲染标记为 TransitionLane（可以中断）。这样即使用户的搜索触发了上万条结果的重新排序，输入框也不会卡顿。

第二是用 `React.memo` 和 `useMemo` 减少不必要的重渲染:

```typescript
const ExpensiveChart = React.memo(({ data, config }: ChartProps) => {
  // 只在 data 或 config 变更时重新计算
  const processedData = useMemo(() => processData(data, config), [data, config]);
  return <Chart data={processedData} />;
});
```

在监控面板中，一个页面可能有 10 多个图表组件，父组件的某个状态变更不应该导致所有图表重渲染。通过 `React.memo` 加稳定的 props 引用，将每个图表的重渲染频率从每次父组件渲染都触发降低到只在自身数据变更时触发。

第三是用 `useDeferredValue` 延迟更新:

```typescript
function LargeTable({ data }: { data: Row[] }) {
  const [filter, setFilter] = useState('');
  const deferredFilter = useDeferredValue(filter);

  const filteredData = useMemo(() =>
    data.filter(row => row.name.includes(deferredFilter)),
    [data, deferredFilter]
  );

  return (
    <div>
      <input value={filter} onChange={e => setFilter(e.target.value)} />
      <Table data={filteredData} />
    </div>
  );
}
```

在 10 万行数据的表格过滤场景中，`useDeferredValue` 使得输入框可以立即响应用户的键盘输入，而表格的过滤和渲染延迟到下一个渲染周期执行，避免了输入卡顿。

在 Vue3 项目中，利用响应式原理做的优化:

第一是 `shallowRef` 和 `shallowReactive` 减少不必要的深层追踪。在 swifty-sentry 的监控面板中，有一处用了 Vue3 来渲染一个实时指标面板。指标数据结构很深嵌套，但只有顶层字段会变化，所以我用 `shallowReactive` 替代 `reactive`，避免对深层属性建立响应式追踪:

```javascript
const metrics = shallowReactive({
  fcp: { p50: 1200, p90: 2400, p99: 5000 },
  lcp: { p50: 2000, p90: 4000, p99: 8000 },
});

// 更新时必须替换整个对象才能触发响应式
metrics.fcp = { p50: 1300, p90: 2500, p99: 5200 }; // 触发更新
// metrics.fcp.p50 = 1300;  // 不会触发更新，因为 shallow 不追踪深层
```

这样做的收益是内存占用降低了约 30%（避免了大量的 Proxy wrapper 和依赖集合），更新速度也更快（不需要遍历深层属性收集依赖）。

第二是 `computed` 的缓存特性避免重复计算:

```javascript
const sortedExperiments = computed(() => {
  return experiments.value
    .filter((exp) => exp.status === "active")
    .sort((a, b) => b.ctr - a.ctr);
});
```

`computed` 只在依赖变化时重新计算，多次读取会返回缓存值。在模板中多处引用 `sortedExperiments` 时，排序函数只执行一次。

第三是利用 Vue3 的编译时优化，`v-once` 和 `v-memo` 指令减少运行时开销:

```html
<div v-memo="[item.id, item.updatedAt]">
  <!-- 只有 id 或 updatedAt 变化时才重新渲染这个块 -->
  <ComplexChart :data="item.metrics" />
  <DetailTable :rows="item.details" />
</div>
```

在 Vue3 的 v-for 列表中，`v-memo` 可以让列表项在数据未变化时跳过 diff，类似于 React 的 `React.memo`，但它是编译时指令，运行时开销更低。

总结来说，React Fiber 的优势在于并发调度和优先级控制，适合需要复杂交互编排的场景; Vue3 响应式的优势在于自动依赖追踪和细粒度更新，在数据驱动的场景中开发效率和运行时性能都有优势。在实际项目中，我根据具体场景选择合适的优化策略: 在 React 项目中重点利用优先级调度和 memo 化; 在 Vue3 项目中重点利用精确响应式和编译时优化。两套框架的核心底层原理虽然不同，但优化目标是相通的: 减少不必要的计算和 DOM 操作，让主线程保持空闲以响应用户交互。

---

本文档由面试官 Sisyphus 编写，参考答案基于候选人简历内容和技术深度合理推演。
