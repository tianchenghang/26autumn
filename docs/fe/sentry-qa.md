# @swifty.js/sentry 前端监控 SDK — 高级前端工程师面试 Q/A

> 本文档基于 `sentry/` 目录源码编写，覆盖高级前端工程师面试中针对本项目可能出现的深度问题与标准解答。
> 所有回答均以真实实现为依据，并标注关键源码位置（`文件:行号`），便于对照查证。

---

## 一、架构与设计思想

### Q1: 请介绍这个 SDK 的整体架构，为什么要这样分层？

SDK 采用经典的 集 → 分发 → 处理 → 上报」四层管道架构，层之间通过发布-订阅事件总线（pub/sub）解耦：

```
浏览器原生事件 (error / click / fetch / XHR / popstate / hashchange / unhandledrejection)
        │
        ▼
┌─ 装饰层 (Capture Layer) ─────────────────────────────┐
│ core/decorates.ts        — 事件监听编排入口           │
│ core/decorate-http.ts    — XHR / Fetch monkey-patch  │
│ core/decorate-route.ts   — pushState/replaceState/   │
│                            popstate 劫持             │
└──────────────────────┬───────────────────────────────┘
                       │ pub(EventType, payload)
                       ▼
┌─ 事件总线 (Event Bus) ───────────────────────────────┐
│ core/bus.ts — Map<EventType, Set<handler>>           │
└──────────────────────┬───────────────────────────────┘
                       │ 分发给所有订阅者
                       ▼
┌─ 处理层 (Handler Layer) ─────────────────────────────┐
│ handle-error.ts       — 错误分类分发                  │
│ handle-code-error.ts  — 代码错误批量聚合              │
│ handle-http.ts        — HTTP 数据转换                 │
│ handle-events.ts      — click / rejection / 白屏      │
│ handle-route.ts       — 路由 → breadcrumb + PV        │
└──────────────────────┬───────────────────────────────┘
                       │ reporter.send(payload)
                       ▼
┌─ 上报层 (Reporter Layer) ────────────────────────────┐
│ reporter/index.ts — DataReporter 单例                 │
│ 采样 / hook / 批量 / 三级传输降级 / 离线缓存 / 恢复   │
└──────────────────────────────────────────────────────┘
```

这样分层的原因：

1. 单一：装只负责「把浏览器事件变成标准化事件对象」，不关心后续如何处理；处理层只负责「事件 → 上报数据的转换与治理（去重、聚合）」；上报层只负责「可靠地送达」。任何一层替换实现不影响其他层。
2. 试性：b 是同步、无状态的纯函数模块（`core/bus.ts:7-33`），handler 是独立函数，reporter 通过 Proxy 延迟实例化（`reporter/index.ts:176-182`），每层都可以脱离浏览器环境单测。
3. 展性：新类监控（比如新增一种事件源）只需要「新增一个 decorate 函数 + 在 bus 上订阅」，符合开闭原则。
4. 隔离：性曝光、录屏等重型能力作为插件挂在核心之外（`plugins/`），核心包保持轻量，插件通过 `SentryPlugin` 基类统一生命周期。

---

### Q2: 为什么核心选择「发布-订阅事件总线」而不是直接调用？同步派发会不会有性能问题？

么用 pub/sub：

1. 采集与处理：装（如 `pubClick`、`pubError`）只调用 `pub(EventType.Click, data)`，它不知道也不应该知道有多少个 handler 关心这个事件。同一个 click 事件可能同时驱动「声明式点击上报」和「breadcrumb 记录」两个订阅者，pub/sub 让这种一对多关系自然成立。
2. 循环依赖：如decorate 层直接 import handler，而 handler 又依赖 reporter、reporter 依赖全局状态，模块图容易成环。bus 作为中间层切断了直接引用。
3. 关系可动态建立/销毁：`b()` 返回 cleanup 函数（`core/bus.ts:21-33`），`destroy()` 时可以精确退订，避免内存泄漏。

同步派发的性能：

bus 的 `pub` 是遍历 Set 执行（`re/bus.ts:12-18`），这带来两个设计后果，SDK 都有对应处理：

- ndler 不能抛异常拖垮采集：`b` 内部对每个 handler 包了 `try/catch`，单个 handler 异常只会 `sentryLogger.error`，不会中断其他 handler，更不会冒泡回装饰层影响业务代码（监控 SDK 的第一原则是绝不能影主应用）。
- ndler 必须轻量：重如批量聚合的计时、白屏采样）都放到 `setTimeout` / `setInterval` / `requestIdleCallback` 中异步执行，事件派发的同步路径上只做数据归一化和入队。click 事件还可以通过 `clickThrottleDelay` 节流（`core/decorates.ts:43`）。

这套取舍是合理的：监控事件的频率（点击、路由、请求）远低于渲染帧率，同步派发的开销可忽略，换来的是事件顺序的确定性和实现的简洁。

---

### Q3: SDK 的全局状态是如何管理的？为什么用单例 + `globalThis.__sentry__`？

全局状态收敛在 `Sentry` 单例类中（`utils/sentry.ts:73-118`），持有四样东西：

| 状态                                      | 说明                                                             |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `options`                                 | 合并默认值后的完整配置                                           |
| `deviceInfo`                              | 构造时一次性采集的设备信息（UA 解析、Canvas 指纹、语言、分辨率） |
| `codeErrors`                              | `BoundedSet<string>(1000)`，错误指纹集合，用于去重               |
| `whiteScreenTimer` / `shouldScreenRecord` | 白屏采样定时器、录屏触发标志                                     |

同时把实例挂到 `globalThis.__sentry__`（`utils/sentry.ts:79`）。这样做的原因：

1. 本去重：当项目因依赖版本问题意外打包了两份 SDK 时，第二份可以通过 `globalThis.__sentry__` 检测到已有实例，避免重复劫持 `fetch`/`XHR`/`history`——monkey-patch 叠加会导致事件重复上报甚至栈溢出。这是 Sentry 官方 SDK 也采用的惯例（`window.__Sentry__`）。
2. 块共享：`tions` 被几乎所有模块读取，通过单例 getter 访问比层层传参或 React Context 更适合框架无关的底层 SDK。
3. viceInfo 只采集一次：U解析和 Canvas 指纹计算有成本，放在构造函数里惰性执行一次，之后所有上报数据直接引用。

代价是单例带来的隐式耦合，SDK 用 `DataReporter.reset()`、`destroy()` 等显式清理 API 来对冲（见 Q52）。

---

### Q4: `DataReporter` 的导出方式很特殊——一个 Proxy 包着懒加载单例，为什么要这么设计？

`reporter/index.ts:162-182` 的导出分三层：

```ts
let _reporter: DataReporter | null = null; // 模块级缓存
function getReporter() {
  // 懒实例化
  if (!_reporter) _reporter = DataReporter.instance;
  return _reporter;
}
export default new Proxy({} as DataReporter, {
  // 透明代理
  get(_target, prop) {
    const instance = getReporter();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
```

设计动机：

1. 初始化：`taReporter` 构造函数会注册 `online/offline` 网络监听（`reporter/index.ts:25-31`）。如果模块加载时就 `new DataReporter()`，那么即使用户从未调用 `init()`，副作用也已发生；Proxy 把实例化推迟到第一次真问属性时（通常是第一`reporter.send()`），保证 `import` 无副作用。
2. 自动绑定：Pxy 的 `get` 里对函数值做了 `.bind(instance)`，使得 `const { send } = reporter` 这样的解构调用不会丢失 `this`。这是用 Proxy 而不是直接导出实例的关键收益。
3. 置：`setReporter()` 销毁单例并清空缓存，配合 `destroy()` 让 SDK 可以完整卸载、在测试中可以反复 init/destroy 而不受模块缓存污染。

代价是 Proxy 每次属性访问都走一次 `getReporter()`，但这是纳秒级开销，相对网络 I/O 可忽略。

---

### Q5: SDK 如何保证「监控代码本身的异常绝不影响宿主应用」？这是监控 SDK 的第一原则。

源码中至少五层防御：

1. s 派发隔离：`b()` 对每个 handler 独立 `try/catch`（`core/bus.ts:13-17`），handler 抛错只记日志。
2. nkey-patch 必调原函数且保持返回值：所`decorateProp` 包装里，无论采集逻辑发生什么，最后都 `return oldPropVal.call(this, ...)`；fetch 包装中即使采集失败也重新 `throw err` 保持原始 Promise 行为（`decorate-http.ts:99-107`）。
3. nsole.error 防递归：`bError` 中用 `isPublishingConsoleError` 标志位 + `try/finally`（`decorates.ts:66-83`）——如果 `pub` 过程中（比如 logger）又调用了 `console.error`，标志位会拦住二次进入，避免无限递归把页面打挂；`finally` 保证标志位一定复位。
4. 初始化防御：如startWebVitals`整体包`try/catch`（`plugins/performance/index.ts:48-55`），`web-vitals` 库在不支持的环境抛错时静默降级。
5. 检测而非假定：`questIdleCallback`、`PerformanceObserver entryTypes`、`measureUserAgentSpecificMemory` 等 API 全部先做 `in` 检测或 support 探测（如 `performance-observer-support.ts`），不支持的浏览器静默跳过，绝不抛错。

此外 `ErrorBoundary`（React/Preact）在捕获错误后重新渲染 fallback 或 children，不为上报逻辑阻塞 React 的错误处理流程。

---

### Q6: 配置管理是怎么做的？为什么引入 Zod 做运行时校验？

配置链路：`init(options)` → `optionsSchema.parse({ ...DEFAULT_OPTIONS, ...options })`（`sdk-lifecycle.ts:27`）→ `sentry.setOptions(parsed)`。

要点：

1. 值集中：3 配置项的默认值全部定义在 `constants/index.ts:17-60`（`DEFAULT_OPTIONS`），用户只需传差异项。
2. 时校验：S 是对外分发的 npm 包，使用者可能是 JS 项目、可能传错类型（比如 `tracesSampleRate: "0.5"`）。TS 类型只在编译期有效，Zod 在运行时把配置挡`init` 阶段并给出可读错误，避免配置错误潜伏到上报链路才爆发。上报数据同样有 schema 校验（`reporter/report-data-schema.ts`），离线缓存从 localStorage 读出后也要过 schema——凡是跨越信任边界据（用户传入、外部存储读出）都做运行时校验，这是 SDK 级代业务代码的重要区别。
3. 变流向：配旦 parse 完成就固化在单例里，各模块只读不写（唯一例外是 `setUserId`/`setVisitorId` 这类显式 API）。

成本是 Zod 带来一定的包体积，但对于「配置 + 上报数据」双重校验需求，这是可接受的 trade-off；若追求极致体积可以后续用 `zod/mini`。

---

### Q7: 这个 SDK 与 Sentry 官方 SDK 在架构上有什么异同？（考察对领域标杆的理解）

相同的设计语言：

- N 驱动：都DSN 作为数据上报终点和项目标识。
- eadcrumb：都一条用户行为面包屑轨迹，错误发生时携带现场。
- nkey-patch 采集：对fetch`/`XHR`/`history`/`console` 的劫持方式一致，这是浏览器端唯一可行的无侵入采集手段。
- 降级：`ndBeacon` 优先、`fetch keepalive` 兜底的策略一致。

差异与简化：

| 维度      | 官方 Sentry                                      | 本项目                                                             |
| --------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| 事件协议  | 完整的 Envelope/Event 协议，服务端是 Sentry 后端 | 扁平的 `IReportData`（id/type/name/message/payload），对接自建后端 |
| 作用域    | Hub/Scope/IsolationScope 三层模型，支持并发隔离  | 单全局作用域（单例 options + deviceInfo），面向单页应用足够        |
| 集成方式  | Integration 接口（`setupOnce`）                  | `SentryPlugin` 基类 + `enablePlugin`，更轻                         |
| Sourcemap | 上传 artifact + Release 关联                     | 依赖上报 `filename/lineno/colno`，由服务端或离线工具还原           |
| 重型能力  | Session Replay（自研 rrweb 分叉）                | 直接基于 `@rrweb/record` + pako 压缩，错误触发式短录屏             |

本质上是「 Sentry 的核心机制在自建后端场景下的精简重实现」，了 Hub/Scope 这种为多实例/服务端渲染设计的复杂度，保留了错误聚合、去重、breadcrumb、批量传输这些真正产生价值的核心。

---

### Q8: 如果让你给这个架构挑一个最大的结构性风险，你会挑什么？

nkey-patch 的全局污染与竞争。装直接改写 `XMLHttpRequest.prototype.open`、`globalThis.fetch`、`history.pushState`、`console.error` 这些全局共享对象（`decorate-http.ts`、`decorate-route.ts`），风险在于：

1. 他 SDK/ polyfill 的叠加顺序：如务页面上还有另一个 APM（或老版本埋点 SDK）也 patch 了 `fetch`，后 patch 者包装先 patch 者，形成调用链。卸载时若顺序不当（后装先卸），cleanup 恢复的 `oldPropVal` 其实是别家的包装函数，会造成 cha 断裂——别家的采辑被永久摘除，或者本 SDK 的 cleanup 失效。
2. 上下文丢失：mkey-patch 是同步切面，无法天然携带「这个请求属于哪个路由页/哪个用户操作」的上下文，目前 SDK 通过 `getBaseData()` 取当前 URL 近似归因（`getBaseData` 在 patch 触发时读取 `location.href`），在请求跨路由存活的场景会归因到错误的页面。
3. 性与调试：业在 DevTools 里看到的 `fetch` 是包装函数，stack trace 会穿过 SDK 代码。

缓解手段：cleanup 函数严格逆序执行（如 `PerformancePlugin.destroy()` 中 `cleanups.toReversed()`，`plugins/performance/index.ts:37-41`）；`globalThis.__sentry__` 实例标记防止自我叠加；文档中声明与同类 APM 的兼容性边界。更根本的解法（如基于 `PerformanceObserver` 的 resource timing 替代 XHR/fetch patch）受限于「拿不到请求体/响应体」而无法完全替代 patch，这是浏览器平台能力决定的，不是设计失误。

---

### Q9: 事件总线用 `Map<EventType, Set<handler>>` 实现，为什么 handler 容器选 Set 而不是数组？

`core/bus.ts:5` 选择 `Set` 的考量：

1. 语义免费：同handler 被重复 `sub` 两次（比如 React 严格模式下 effect 执行两遍、或插件重复 enable），Set 天然只存一份，避免同一事件被处理两次导致重复上报。数组则需要手动 `includes` 检查。
2. O(1)：`b` 返回的 cleanup 是 `handlers.delete(handler)`（`bus.ts:26/31`），Set 删除是 O(1)；数组的 `splice(indexOf)` 是 O(n) 且迭代中删除要小心索引偏移。
3. 安全：`b` 在 `for...of` 迭代 Set 时，如果 handler 内部同步调用了 `unsub` 自己（一次性订阅场景），Set 的迭代器能正确处理「迭代中删除当前项」；数组在迭代中 `splice` 会跳项。

事件类型用 `EventType` 字符串枚举做 Map 的 key，相比 `Record<EventType, ...>` 不用预初始化所有 key，也天然支持稀疏订阅。

---

### Q10: SDK 的模块导入路径大量使用 `.js` 后缀（如 `from "./bus.js"`），但源码是 `.ts`，为什么？

这是 deNext / ESM 规范的显式扩展名要求。`ckage.json` 声明 `"type": "module"`，SDK 以纯 ESM 分发；ECMAScript 模块规范要求相对导入必须带完整扩展名，且运行时没有 TS 的扩展名解析魔术——`./bus.ts` 编译后产物是 `bus.js`，所以源码中必须写目标扩展名 `.js`。

这带来一个面试常考的连锁问题：TypeScript 从 4.7 起支持这种「写 `.js` 实际解析 `.ts`」的映射（`moduleResolution: "NodeNext"/"Bundler"`），目的是让源码与产物路径一致，`tsc` 输出时要重写导入路径。对式 `moduleResolution: "node"` 的无扩展名写法，产物交给 bundler 处理没问题，但裸 ESM 环境（浏览器 `<script type="module">`、Node ESM）会直接 404。对于要同时产出 ESM+CJS 双格式、且 `preserveModules` 保留目录结构的库（见 `rollup.config.ts`），显式 `.js` 后缀是最稳妥的选择。

---

## 二、错误监控

### Q11: SDK 捕获了哪几类错误？分类依据和分发逻辑是什么？

错误捕获分 个来源，经handleError`（`core/handle-error.ts:22-37`）统一分发为 4 种处径：

| 捕获来源           | 入口                                         | 分发条件                                              | 处理路径                                    |
| ------------------ | -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| JS 运行时错误      | `addEventListener("error", ..., true)`       | `isErrorEvent(err)` 且有 filename/lineno              | `handleCodeError` → 批量聚合                |
| 资源加载错误       | 同上（捕获阶段）                             | `isIExtendedErrorEvent(err)`，target 带 src/href      | `reportResourceError`                       |
| `console.error`    | console monkey-patch                         | 参数中有 `Error` 实例 → 取之；否则 join 字符串        | `reportRuntimeError` / `reportUnknownError` |
| Promise 未处理拒绝 | `unhandledrejection` 事件                    | reason 是扩展 ErrorEvent → code error；否则走通用分发 | `handle-events.ts:15-24`                    |
| 框架错误           | React/Preact ErrorBoundary、Vue errorHandler | 框架直接调用 `reportFrameworkError`                   | 带组件栈上报                                |
| 手动上报           | `traceError(error)` API                      | 用户主动调用                                          | 通用分发                                    |

分发函数 `handleError` 是一个典型的守卫链：

```ts
if (isErrorEvent(err)) {
  if (!isIgnoredError(err.message)) handleCodeError(err);
  return;
}
if (isIExtendedErrorEvent(err)) {
  reportResourceError(err, rest);
  return;
}
if (isError(err)) {
  reportRuntimeError(err, rest);
  return;
}
reportUnknownError(err, rest);
```

为什么资源错误和代码错误能在同一个 `error` 事件里区分：加载错误不冒泡但会捕获（所听器第三个参数必须是 `true` 走捕获阶段），且资源错误的 `event.target` 是具体的 `HTMLImageElement`/`HTMLScriptElement`（带 `src`/`href`/`localName`），而 JS 运行时错误的 `ErrorEvent` 有 `filename/lineno/colno`。`isIExtendedErrorEvent` 守卫正是检查 target 上这三个属性（`handle-error.ts:39-44`）。

---

### Q12: 为什么错误监听要用捕获阶段（`addEventListener("error", listener, true)`）？用 `window.onerror` 行不行？

两个原因：

1. 错误不冒泡。`mg src="404.png">` 加载失败触发的 error 事件只在捕获能被 window 收到，冒泡阶段监包括 `window.onerror = ...`）完全收不到。这是 DOM 规范：资源错误事件定义为「不冒泡（bubbles: false）」。所以要同时覆盖 JS 错误 + 资源错误，必须 `addEventListener("error", fn, true)`。
2. indow.onerror` 有覆盖竞争。`error` 是单槽赋值，业务代码或其他库后赋值就会把 SDK 的处理器顶掉；`addEventListener` 是多播的，互不干扰。

`window.onerror` 唯一的优势是古董浏览器兼容（IE8-），对本项目目标浏览器（使用了 `crypto.randomUUID`、`PerformanceObserver` 的现代浏览器）无意义。

补充细节：跨域脚本错误会被浏览器sanitize成 `Script error.`（无 filename/lineno），SDK 没有去伪造还原——这是浏览器安全限制，标准解法是业务侧给 `<script>` 加 `crossorigin="anonymous"` + CDN 返回 `Access-Control-Allow-Origin`，SDK 在 README 层面引导即可。

---

### Q13: 错误去重机制是怎么实现的？`BoundedSet` 为什么这样设计？

去重链路（以代码错误为例，`handle-code-error.ts:82-86`）：

```ts
const errorId = base64v2(
  `${EventType.Error}-${message}-${filename}-${line}-${column}`,
);
if (
  hasUnknownSource ||
  sentry.options.repeatCodeError ||
  !sentry.codeErrors.has(errorId)
) {
  sentry.codeErrors.add(errorId);
  batchErrorManager.push(codeError);
}
```

1. 构造：`pe-message-filename-line-column` 拼接后 base64 编码作为唯一指纹。同一处代码抛出的同种错误指纹相同 → 整个会话只上报一次。资源错误和运行时错误的指纹维度略少（`type-localName-src`、`type-name-message`），因为它们没有稳定的行列号。
2. oundedSet<string>(1000)`（`ils/data-structures.ts`）：容量有界的 Set，超过 1000 条时淘汰最旧（FIFO）。为什么要有界——长会话 SPA 如果持续产生不同指纹的错误（比如 message 里带了动态 ID），无界 Set 会线性增长吃掉内存。1000 是「足够覆盖正常页面的错误多样性」与「内存可控」之间的经验值；被淘汰意味着极端情况下同一个老错误可能再报一次，代价可接受。
3. 逃生口：
   - `repeatCodeError: true` 时完全关闭去重（某些业务需要统计错误频次而非有无）；
   - 未知的错误不去重（`sUnknownSource`：filename 为空或 `"unknown"`）——因为此时指纹退化成 `type-message-unknown-undefined-undefined`，大量不相关的跨域/sanitize 错误会互相误杀，宁可重复上报也不能漏报。这是一个体现工程判断的细节：去重的前指纹可靠，指纹不可靠时保守放行。

---

### Q14: `BatchErrorManager` 的批量聚合是什么场景？2 秒窗口和 5 条阈值是怎么起作用的？

场景：风暴抑制。典一个错误发生在 `setInterval`、滚动监听、渲染循环里，一秒钟可能触发几百次——即使单条去重开了（`repeatCodeError: true` 关闭去重的场景），上报通道也会被打爆，浪费带宽且淹没真正重要的错误。

`BatchErrorManager`（`handle-code-error.ts:14-61`）的工作方式：

1. 窗口：每`push(error)` 重置一个 2000ms 的 `setTimeout`——2 秒内没有新错误才 flush。这是一个防抖（dounce）窗口，窗口会随持错误输入不断顺延，直到错误平息。
2. ：fsh 时按 `type-name-message` 分组（注意分组键比去重指纹少了 filename/line/column——分组粒度更粗，容忍同一错误在不同行列的微小差异）。
3. 决策：
   - 组内 5 条 →条原样上报（偶发错误不需要压缩）；
   - 组内 5 条 →并成一条 `IBatchErrorData`：取第一条的完整数据，附加 `batchError: true`、`batchErrorLength: 总数`、`batchErrorLastHappenTime: 最后一条时间戳`（`handle-code-error.ts:53-58`）。服务端收到一条就知道「这个错误爆发了 N 次、持续到何时」。

为什么是 5 和 2 秒：2 秒覆盖了大部分「循环体错误爆发」的自然周期（轮询间隔、动画帧序列）；5 条区分「用户偶发踩到」与「系统性爆发」——少于 5 条时逐条上报保留每条完整上下文的价值，高于聚合省流量的价值。

一个设计配合：聚生在去重之后。默认 `repeatCodeError: false` 时相同指纹根本到不了 BatchErrorManager，聚合实际只在「同组但指纹不同（行列号抖动）」或「关闭去重」时触发。这两层是互补而非冗余。

---

### Q15: `ignoreErrors` 支持 string 和 RegExp 两种模式，实现上有什么讲究？为什么在三处分发入口都检查？

`utils/is-ignored-error.ts` 的语义：string 用 `message.includes(pattern)`（子串匹配，对业务方最直观），RegExp 用 `pattern.test(message)`（精确控制）。

检查点分布在三条错误路径的端：

1. `handleError` 里 `isErrorEvent` 分支前（`handle-error.ts:25`）
2. `handleCodeError` 入口（`handle-code-error.ts:71`）
3. `reportRuntimeError` / `reportUnknownError` 入口（`handle-error.ts:68/80`）

为什么不统一在 `handleError` 顶部检查一次：因为 `handleCodeError` 也被 `unhandledrejection` 路径调用（`ndle-events.ts` 中 reason 是 ErrorEvent 时），绕过 `handleError`；防御式地在每个入口检查，保证无论事件从哪条路径进来，忽略规则都生效。这是「安全关键逻辑下沉到每个入口」与「逻辑重复」之间的取舍——忽略规则是用户明确配置的数据出口，漏检一处就着用户不想看的错误上报了，去重/聚合节省的成本被抵消。

另一个细节：错误不检查 ignoreErrors（`portResourceError` 里没有调用）。因为资源错误的 message 通常是空的或浏览器标准化文案（如 ""），真正有意义的是 `src`/`href`，而 `excludeApis` 配置承担了 URL 维度的过滤职责，规则各归其位。

---

### Q16: console.error 的劫持如何实现防递归？如果业务代码在 error handler 里又 console.error 会怎样？

`decorates.ts:66-83` 的实现：

```ts
let isPublishingConsoleError = false;
const cleanupConsoleError = decorateProp(console, "error", (oldPropVal) => {
  return function (this: Console, ...args: unknown[]) {
    if (!isPublishingConsoleError) {
      isPublishingConsoleError = true;
      try {
        pub(EventType.Error, { ... , extra: args.find(a => a instanceof Error) ?? args.join(" ") });
      } finally {
        isPublishingConsoleError = false;
      }
    }
    oldPropVal.call(this, ...args);   // 原函数始终执行
  };
});
```

递归风险点：`pub` → handler → `sentryLogger.error`（debug 模式可能调 console）→ 又回到被包装的 `console.error` → 再 `pub`……无限循环直到栈溢出。

防御机制是标志 + try/finally：

- 进入 `pub` 前置位，期间内层的 `console.error` 调用发现标志已置位， pub 只执行原始输出——能正常打印，但不会二次产生监控事件；
- `finally` 保证即使 `pub` 链路中任何环节抛异常，标志也一定复位，不会出现「标志卡住导致后续所有 console.error 都不上报」的静默故障。

对业务代码的行为：业务在 error handler 里 `console.error("处理失败", e)`，这条会正常触发一次监控事件（它不在重入窗口内），符合预期。参数处理上有个细节：`args.find(arg => arg instanceof Error)` 优先取 Error 实例（能拿到 name/stack），没有 Error 才把参数 join 成字符串走 unknown error——保证 `console.error(new Error("x"))` 和 `console.error("x")` 两种常见写法都有合理归属。

---

### Q17: Promise rejection 的处理有什么边界情况？`event.preventDefault()` 的问题怎么考虑？

捕获入口（`decorates.ts:90-102`）监听 `unhandledrejection`，reason 进入 `handle-events.ts:15-24` 分发：

- reason 是扩展 ErrorEvent（极少见，通常来自库内部转发）→ `handleCodeError`；
- 否则 → `handleError` 走类型守卫链：Error 实例提取 stack，字符串/对象走 unknown。

边界情况：

1. ejectionhandled`的迟到处理：规，先触发`unhandledrejection`、之后开发者又补 `.catch()`的 promise 会触发`rejectionhandled`。SDK 目前没有监听rejectionhandled` 做撤销——意味着「上去再说」，迟到补 catch 的 rejection 会作为一条已上报数据留存。这是合理简化：撤销语义需要服务端支持事件关联删除，成本远大于收益，且多数监控后端接受「上报后由服务端按时间窗聚合」。
2. ason 非 Error：`omise.reject("字符串")`、`reject({code: 500})` 都合法。`reportUnknownError` 对 string 直接用之，对象 `JSON.stringify`——可能丢循环引用对象（stringify 抛错）。这是可改进点（见 Q85）。
3. eventDefault：Come 会在控制台对 unhandledrejection 打红字，`event.preventDefault()` 可抑制。SDK 调它——正确选择控 SDK 的职责是观察而非改变，抑制红字会掩盖业务自身该看到的问题，属于越界。
4. ync/await 的隐性捕获：`y { await p } catch {}` 捕获的 rejection 不触发事件——符合预期，只有真正「无人处理」的 rejection 才上报。

---

### Q18: 错误数据里为什么没有 sourcemap 还原？行列号怎么用？

`handleCodeError` 提取了 `filename/lineno/colno` 原样上报（`handle-code-error.ts:70-79`），SDK 侧 sourcemap 解析，这意且正确的架构决策：

1. 与性能：srcemap 解析需要 `source-map` 库（WASM/大体积 mapping 文件），在端上加载每个 js 对应的 `.map`（可能几 MB）做还原，网络与 CPU 成本无法接受。
2. 的分层：端实记录「压缩后位置 + 原始堆栈字符串」，服务端或流水线持有 relse 对应的 `.map` 做批量还原。Sentry 官方也是这个模式（artifact 上传 + 服务端 symbolication）。
3. /安全：`ap` 文件通常不对公网暴露，端上根本拿不到。

端上要做的配套是：构建时保留 sourcemap（`hidden-source-map` 之类），release 版本与上报的 SDK 版本/项目 ID 关联。`IReportData` 里的 `sdkVersion` 字段（来自 `constants/index.ts:5` 从 package.json 注入）正是为此准备的关联键。

---

### Q19: 框架错误（React/Vue/Preact）与全局错误捕获是什么关系？会不会重复上报？

两者是而非重复的关

- `error` 事件：能错误本身和粗略位置，但拿不到组（component stack）——Reac18+ 的错误边界里 `componentDidCatch(error, info)` 的 `info.componentStack` 是框架内部维护的虚拟 DOM 调用栈，对定位「哪个组件树分支抛错」至关重要。
- 集成（`act.ts:110-117`、`vue.ts:9-23`）：`reportFrameworkError` 上报 `EventType.React/Vue`，payload 里带 componentStack。

会不会重复：且是可接受的。EorBoundary 捕获的错误同时会冒泡到 window 的 error 事件（React 会 rethrow 到全局），于是一个错误可能产生 `EventType.React` 和 `EventType.Error` 两条数据。但两者的去重指纹不同（type 不同 → 指纹前缀不同），服务端可按 `type` 维度各自聚合，也可以用 url+timestamp 做关联。相比「为了去重而丢掉 componentStack」，重复一条是更优选择。

Vue 的集成方式不同：`app.config.errorHandler` 赋值（`vue.ts`）——注意这是式的，务自己也设置了 errorHandler 会被顶掉，理想实现应链式调用旧 handler（改进点，见 Q85）。

---

### Q20: 如果页面上错误持续高频产生，SDK 有哪些层级的防护避免把服务端打挂？

四道闸门，从内到外：

1. 去重（默）：同指纹错误会话级只报一次，直接消灭循环错误的主要流量。
2. 聚合（BchErrorManager）：2 秒窗口同组 ≥5 条压缩成一条带计数的数据。
3. 率（`acesSampleRate`，`send-preflight.ts`）：配置 <1 时按比例随机丢弃，服务端压力大时运营侧可调低。
4. 上报 + 队列上限：`cheMaxLength`（10）攒批发送降低请求数；`maxQueueLength`（200）限制内存与离线缓存总量，超出淘汰最旧，形成有界队列——极端风暴多保留最近 200 条，本地永远不会 OOM，服务端收到的请求频率也被批量机制压平。

这四道闸门体现了流量治理的完整思路：去重 → 途中压缩 → 概率丢弃 → 出口限流。

---

### Q21: breadcrumb（面包屑）是怎么实现的？为什么用最小堆？

`core/breadcrumb.ts` 基于 `MinHeap`（`utils/data-structures.ts`）实现，容量 `maxBreadcrumbs`（默认 30，见 `constants/index.ts:9`）。

工作方式：每类事件（错误、点击、路由、HTTP）在各自 handler 里除了上报，还会 `breadcrumb.push({...payload, userAction: event2breadcrumb(type)})` 压入一条带时间戳的面包屑；超过 30 条时时间戳最旧的。

为什么用最小堆而不是「数组满了 shift」：

| 方案                    | push      | 淘汰最旧         | 说明                                                                   |
| ----------------------- | --------- | ---------------- | ---------------------------------------------------------------------- |
| 数组 + shift            | O(1) 均摊 | O(n)（整体搬移） | 高频事件下每次溢出都搬 29 个元素                                       |
| 循环数组（ring buffer） | O(1)      | O(1)             | 最优，但实现稍复杂，且取「按时间排序的全部」需额外处理乱序（迟到事件） |
| 堆（按 timestamp）      | (lon)     | O(l n)           | 对「迟件」鲁棒：乱序的面包屑也能正确淘汰全局最旧                       |

关键洞察是可能乱序到达：`tTimeout` 批量 flush、异步 fetch 回调、requestIdleCallback 白屏采样产生的事件时间戳不一定严格递增。循环数组假设到达顺序=时间顺序，乱序时会错误淘汰；最小堆只关心时间戳大小关系，与到达顺序无关。n=30 时 log n ≈ 5，性能差异可忽略，选堆是为正确性而能。

---

### Q22: 一个错误从抛出到进入上报队列，完整链路是什么？（考察全链路串联能力）

以 `throw new Error("支付失败")` 为例：

1. ：J引擎派发 ErrorEvent → `decorates.ts:65` 捕获阶段监听器 → `pub(EventType.Error, { ...getBaseData(), type, extra: ErrorEvent })`。
2. ：`s.ts:12-18` 遍历订阅者 → `handleError`。
3. ：`ErrorEvent` 命中 → `isIgnoredError` 检查 → `handleCodeError`。
4. ：构纹 `base64("error-支付失败-file.js-10-25")` → `BoundedSet` 查重（未见过）→ 压入 breadcrumb → `batchErrorManager.push`。
5. ：2防抖窗口内若无同组新错误 → flush → 组内 <5 条 → `reporter.send(codeError)`。
6. ：`ouldQueuePayload` 检查 DSN 非空、采样率通过、是否触发录屏标记。
7. ok：`nBeforeReportHook` 执行用户注册的 `onBeforeReportData`（可改写/丢弃），`payloadToReportData` 补齐 url/userId/projectId/sdkVersion/deviceInfo 形成完整 `IReportData`。
8. ：`ents.push(data)`；在线且队列长度 <10 → 重置 2000ms 定时器等待攒批。
9. ：定触发或队列满 → `flush()` → `takeBatch` 切出前 10 条 → `applyBeforePushHook` → `sendBatch`：≤60KB 且 `sendBeacon` 成功即完成；否则按配置走 Image（≤2KB）或 `fetch keepalive` POST。
10. 兜底：发败 → 数据回插队首（截断到 200 上限）→ 写 localStorage → 启动服务端恢复探测。

每一步都可被配置或 hook 干预，但整体不需要业务方感知。

---

## 三、性能监控

### Q23: 性能插件采集了哪些指标？各自的采集原理是什么？

`PerformancePlugin`（`plugins/performance/index.ts`）采集 类指标：

| 指标                                          | 原理                                           | 代码位置                       |
| --------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| Web Vitals（CLS/FCP/INP/LCP/TTFB）            | `web-vitals` 库封装 PerformanceObserver        | `perf.ts:26-64`                |
| 首屏渲染 FSP                                  | MutationObserver 追踪视口内新增元素            | `first-screen-paint.ts`        |
| Navigation Timing（DNS/TCP/DOM 解析等 15 项） | `PerformanceNavigationTiming` API              | `navigation-timing.ts:39-82`   |
| 初始资源列表                                  | `performance.getEntriesByType("resource")`     | `resource-timing.ts:63-82`     |
| 增量资源加载                                  | PerformanceObserver 监听 `resource`            | `resource-timing.ts:84-102`    |
| Long Task（>50ms 长任务）                     | PerformanceObserver 监听 `longtask`            | `performance/index.ts:57-74`   |
| 内存使用                                      | `performance.measureUserAgentSpecificMemory()` | `performance/index.ts:101-116` |

设计上两个值得注意的点：

1. 探测先行：`pportsPerformanceEntryType("longtask")` 先探测再 observe（`performance/index.ts:58`），`measureUserAgentSpecificMemory` 检查存在性——不支持的浏览器（Safari 全系无 longtask、Firefox 无内存 API）静默跳过而非报错。
2. 采集双保险：PformanceObserver 覆盖动态加载，但 `entryTypes: ["resource"]` 在部分场景（如 observer 注册前的早期资源）有盲区，所以 `resource-element-fallback.ts` 用 MutationObserver 监听 DOM 新增的 IMG/SCRIPT/LINK 元素做兜底——两套机制互补去重由服务端按 URL+时间窗口处理。

---

### Q24: 首屏渲染时间（FSP）的算法是怎么实现的？为什么不用 FCP/LCP 代替？

`first-screen-paint.ts` 的算法：

1. 页面初始化后用 `requestIdleCallback` 在空闲期启动 `MutationObserver`，观察 `document.body` 的子树变化（`first-screen-paint.ts:87-95`）。
2. 每次 DOM 变更，遍历新增节点：排除 `link/script/style`（它们不产生可视内容），对剩余元素做 `isInViewport` 视口检测（元素矩形与视口求交），记录当前 `performance.now()`。
3. `document.readyState === "complete"`（load 完成）时，取视口内元素的最新渲染时间戳的最大值作为SP。

直觉解释：FSP ≈ 「首屏最后一个可见元素被插入 DOM 的时刻」。

为什么还需要 FSP，已有 FCP/LCP：

- P（Fst Contentful Paint）只关心「第一个」文本/图片绘制，对现代骨架屏应用，FCP 往往是骨架屏的灰块绘制时刻，远早于真容就绪，代表性差。
- P（Lgest Contentful Paint）关注最大元素，但首屏信息密度高的页面（如电商列表）最大元素可能只是 banner，不代表整体可交互。
- P 是业务自定义口径：「内 DOM 稳定时刻」更接近用户体感的「页面加载完成」，尤其对 SSR + 客户端补水（hydration）分块渲染的页面，LCP 之后的增量渲染仍能被 MutationObserver 捕捉。

代价是启发式算法的固有误差：懒加载图片不触发 DOM 插入、无限滚动页面会持续推高 FSP，所以实现里用 `readyState === "complete"` 作为采样终点收敛。

---

### Q25: Long Task 监控的价值是什么？拿到数据后怎么用？

Long Task 指主线程连续阻塞超过 50ms 的任务（RAIL 模型定义的卡顿阈值），通过 `PerformanceObserver({ entryTypes: ["longtask"] })` 采集，entries 里包含 `startTime`、`duration`，以及 `attribution`（哪个容器/脚本导致的，需 `TaskAttributionTiming` 支持）。

价值：

1. P 的解释数据：W Vitals 的 INP 告诉你「交互慢」，但不告诉你「为什么慢」——同期上报的 Long Task 列表提供嫌疑现场（哪个时间段主线程被占）。
2. 回归监控：按维度聚合 longtask 总时长/次数，版本发布后可观测 JS 执行成本的回归。
3. 分析：上据带 `url + timestamp`，可与同期的错误、API 慢请求做时间窗关联，定位「卡顿是否由某接口响应处理引起」。

实现上的克制：只在支持 `longtask` 的 Chromium 系生效，`supportsPerformanceEntryType` 探测后不支持就返回 `noop` cleanup（`performance/index.ts:58-60`），保证 `destroy()` 统一逆序调用 cleanup 时不出错。

---

### Q26: Navigation Timing 采集了哪些阶段？如果让你计算「首字节时间 TTFB」和「DOM 解析耗时」，用哪些字段？

`navigation-timing.ts:44-61` 从 `PerformanceNavigationTiming` 派生 15 项指标：

- 阶段：rirect、dnsLookup（`domainLookupEnd - domainLookupStart`）、tcpConnection（`connectEnd - connectStart`）、tlsHandshake（`connectEnd - secureConnectionStart`）、timeToFirstByte（`responseStart - requestStart`）、contentTransfer（`responseEnd - responseStart`）
- 阶段：dProcessing（`domComplete - domInteractive`）、domInteractive、domContentLoaded、loadEvent、resourceLoad
- 端：pntTime、firstByte（TTFB：`responseStart - navigationStart`）

关键计算：

- FB =responseStart - startTime`（startTime 对 navigation 条目即 navigationStart≈0）。它反映「网络 + 服务端处理」总耗时，是后端性能的前端探头。
- M 解析耗时 =domComplete - domInteractive`（domProcessing），即 HTML 解析 + 同步脚本执行的总时间。

面试加分项：`transferSize === 0 && encodedBodySize > 0` 说明命中了缓存（disk/memory cache），`workerStart > 0` 说明经过了 Service Worker——这些字段能帮助区分「真慢」与「缓存场景下的测量失真」。

---

### Q27: 内存监控 `measureUserAgentSpecificMemory` 有什么使用限制？为什么不轮询？

限制：

1. 隔离要求：A 需要页面处于 cross-origin isolated 环境（COOP + COEP 头）才能返回精确结果，否则退化为粗略估计或不可用。
2. Chromium：标未普及，Safari/Firefox 无此 API（所以代码里做三重存在性检查，`performance/index.ts:102-106`）。
3. 的是 Promise 且含噪声：结含 breakdown（按 attribution 分类的字节数），且浏览器会故意注入噪声防指纹追踪。

SDK 的选择是加载后单次采集（`it` 时 `void this.reportMemory()`），不轮询。理由：轮询内存快照（每 N 秒）会产生持续的上报流量，而内存趋势分析对采样密度要求低；更合理的扩展点是「在 SPA 路由切换或长会话的关键节点采样」，目前留给手动 API（`tracePerformance`）补足。若要检测内存泄漏，真正有效的手段是「多时点采样 + 趋势对比」，单点快照的价值在于建立基线分布（P50/P95 内存占用），这个定位下单次采集是成本合理的。

---

### Q28: 性能数据的量级很大（资源加载可能几百条），SDK 怎么控制性能监控自身的开销？

三层控制：

1. 按需启用：性集整体封装在 `PerformancePlugin`，不启用则零开销；启用也走 `enablePlugin` 显式注册（`sdk-lifecycle.ts:49-53`）。
2. 调度：F 的 MutationObserver 启动包在 `requestIdleCallback` 里（`first-screen-paint.ts:87-95`），避免在关键渲染路径上竞争主线程；Navigation/初始资源在 `load` 后才读取（`onPageReady`，`performance/index.ts:76-88`），不干扰加载过程。
3. 复用公共管道：性据和错误数据走同一个 `reporter`，天然共享批量（10 条/2s）、采样率、离线缓存的限流能力——不需要为性能数据单独做流量治理。

自身开销的哲学：者自身不能成为被观测的性能问题。所计算（FSP 的视口检测）放在事件回调而非每帧执行，资源条目直接透传 PerformanceEntry 而不做端上聚合。

---

### Q29: Web Vitals 为什么选 INP 而不是 FID？（考察指标演进理解）

FID（First Input Delay）只测量交互入延迟，且只算「延迟」不算「处理时长」；2024 年 3 月起 Google 正式用 INP（Interaction to Next Paint）替代 FID 成为 Core Web Vitals 之一。INP 的差异：

- 命周期：统面所有交互（点击、键盘、触摸），取接近最差的 P98 值，而不是只看第一次。
- 时延：从到下一帧绘制完成，包含事件处理 + 渲染耗时。

`web-vitals` v5（`package.json` 依赖 `^5.3.0`）默认上报 INP 而非 FID，`perf.ts` 采集的五个指标（CLS/FCP/INP/LCP/TTFB）正是当前标准集合：LCP（加载）、INP（交互）、CLS（稳定性）三个核心 + FCP/TTFB 两个诊断指标。面试中能说出「FID 已废弃、INP 的 P98 统计口径、以及 `onINP` 回调默认在页面隐藏时才触发（`reportAllChanges` 未开）」属于加分细节。

---

### Q30: 为什么资源加载监控需要 MutationObserver 兜底？PerformanceObserver 不够吗？

`resource-element-fallback.ts` 的存在说明 PerformanceObserver 有两个盲区：

1. 盲区：PformanceObserver 只能收到 obsee 调用之后的 resoce entry（`buffered: true` 选项可回放缓冲区，但有 buffer 上限 150 条且类型支持不一）。插件启用晚于页面早期资源加载时，早期条目丢失——SDK 用 `getEntriesByType("resource")` 在 load 后补采初始资源（`resource-timing.ts:63-82`）解决这部分。
2. 属性盲区：rource entry 有 URL 和耗时，但没有对应DOM 元素引用（隐私限制，try.name 之外不暴露元素）。当需要「这个失败的资源是哪个组件加载的」时无从得知。MutationObserver 监听 body 子树新增的 IMG/SCRIPT/LINK，能拿到元素本身（可做 XPath 定位、读自定义属性），作为元素维度的兜底证据链。

两层分工：PerformanceObserver 管「全量、精确的计时数据」，MutationObserver 管「元素上下文」，服务端按 URL 关联。

---

### Q31: `PerformanceObserver` 的回调是同步还是异步？这对数据准确性有什么影响？

批量派发。PformanceObserver 的回调在事件循环的微任务/渲染后的空闲时机执行，一次回调携带 `entryList`（多条 entry），不是 entry 产生时同步触发。

影响：

1. 戳要用 entry 自带的：`try.startTime` 是事件真实发生时刻（高精度），回调里的 `performance.now()` 是处理时刻，两者可能差几十 ms——SDK 直接透传 entries，服务端用原始 startTime 分析，规避了这个陷阱。
2. 隐藏时数据可能丢：oerver 回调排队的任务在页面直接关闭（kill tab）时可能没机会执行——这是 `web-vitals` 库内部用 `visibilitychange` + `pagehide` 提前 flush 的原因；SDK 层面的资源 timing 条目若因此丢失属可接受损耗（资源数据量大，丢尾部的几条不影响分布分析）。
3. 特性契合上报模型：oerver 天然攒批回调，与 reporter 的批量发送对齐，不需要额外聚合。

---

### Q32: 如果业务反馈「开启性能监控后页面变卡了」，你的排查思路是什么？

按嫌疑度排序：

1. P 的 MutationObserver：`btree: true, childList: true` 观察整个 body，高频 DOM 变更场景（如虚拟列表、实时行情）回调频率高。检查 `isInViewport` 的 `getBoundingClientRect` 是否造成强制同步布局（layout thrashing）——回调里读几何属性会强制浏览器 flush 样式。缓解：回调里只做标记，几何计算挪到 `requestIdleCallback`。
2. tationObserver 兜底观察器：同且它会为每个新增 IMG/SCRIPT/LINK 挂 load/error 监听，极端场景（动态导入爆炸）监听器数量膨胀。
3. ng Task 自证：直上报的 longtask 数据里 SDK 初始化时间窗附近是否有长任务——用 SDK 自己的数据排查 SDK 自身。
4. 插件混淆排查：reb 的 MutationObserver + 序列化开销远大于性能插件，确认业务是否同时开了 screenRecord，用控制变量法逐个 `enablePlugin` 定位。
5. tch/XHR 拦截的响应体克隆：`s.clone().text()`（`decorate-http.ts:82-88`）对大响应体（如 10MB JSON）会造成内存翻倍 + 异步解析开销——这是 HTTP 监控而非性能插件的成本，但常被一起感知到。

排查方法论：先控制变量（关插件看是否恢复），再用 SDK 自身的 longtask/resource 数据佐证，最后上 Performance 面板看 Main 线程火焰图中 SDK 函数的占比。

---

### Q33: 性能插件的 `destroy()` 为什么要 `cleanups.toReversed()` 逆序执行？

`plugins/performance/index.ts:37-41`：

```ts
destroy(): void {
  this.cleanups.toReversed().forEach((cleanup) => cleanup());
  this.cleanups = [];
}
```

逆序（LIFO）是资源管理的通用原则，原因：

1. 关系反向：后的 cleanup 可能依赖先注册的资源。例如 Web Vitals 先启动、observer 后注册，销毁时若先停 Web Vitals 的底层 observer，后销毁的上层 cleanup 可能访问到已失效对象。
2. 造对称：C/RAII 传统中析构顺序与构造相反；栈式展开保证每一层清理时它的「下层地基」还在。
3. oReversed()`的选择：返数组而地 rerse，不污染`cleanups` 原数组（虽然随后即清空，但保持了纯函数习惯，也避免 forEach 迭代中被 reverse 干扰）。

这是个小细节，但它和 `decorates.ts` 中「先 cleanupSend 再 cleanupOpen」（`decorate-http.ts:59-62`）的逆序习惯一致—— monkey-patch 恢复都应逆序，因 patch 的包装函数闭包里持有对先 patch 状态的引用。

---

## 四、行为追踪与埋点

### Q34: 声明式点击埋点的设计是什么？为什么只追踪带 `s-swifty-*` 属性的元素？

机制（`utils/click-data.ts` + `decorates.ts:42-55`）：document 级 click 监听（冒泡阶段）→ 从 `event.composedPath()` 沿冒泡路径向上找 → 找到第一个带 `s-swifty-*` 属性的元素 → 提取属性生成 `DeclarativeClickData` 上报。普通无属性点击直接丢弃。

属性约定：

| 属性                | 作用                       |
| ------------------- | -------------------------- |
| `s-swifty-ev`       | 事件 ID（最优先）          |
| `s-swifty-msg`      | 人类可读描述               |
| `s-swifty-view`     | 视图 ID（ev 缺失时的回退） |
| 其他 `s-swifty-xxx` | 自动进入 `params` 透传     |

事件 ID 优先级：`s-swifty-ev` > 元素 `title` > `s-swifty-view` > `tagName`（`click-data.ts:66-80`）。

么不追踪全部点击（对GrowingIO 类全埋点方案）：

1. 比：全击 95% 是无分析价值的噪音（空白处、装饰元素），白白消耗批量配额和用户带宽。
2. 稳定：全用 XPath/类名做事件标识，DOM 重构即失效；声明式属性是开发者的契约——"这个元得追踪"，重构时属性随元素迁移，事件标识天然稳定。
3. 友好：只显式声明的元素，避免全量点击意外捕获敏感输入区域的行为轨迹。

代价是需要业务方手动打属性（埋点成本），配套提供了 `composedPath` 向上查找来降低打点密度——在容器上打一个 `s-swifty-view`，内部子元素的点击都能归因到该视图（属性沿路径就近取值，子元素自己的属性覆盖容器）。

---

### Q35: 点击数据里的 `elementPath`（XPath）有什么用？为什么限制 128 字符？

`elementPath` 记录被点击元素的 XPath 路径（如 `/html/body/div[2]/button[1]`），用途：

1. 级定位：同 `s-swifty-ev="submit"` 可能出现在多个页面位置，XPath 区分具体实例，支撑「点击热区」类分析。
2. 归因：当方忘了打属性、或属性值冲突时，服务端可用 XPath + URL 做后验的元素聚合。

8 字符上限是防截断：深层嵌套页面（如多层 table 布局）XPath 可能达到数百字符，且列表场景的索引（`li[137]`）让 XPath 既长又不稳定（顺序变径即变）。截断到 128 保留路径的头部（页面结构主干），牺牲叶子精度换取：上报体积可控、服务端存储索引友好。这也是工程上「数据保真度 vs 传输成本」的典型权衡——XPath 本就是辅助证据，不需要完整保真。

---

### Q36: SPA 路由追踪是怎么实现的？`pushState` 劫持和 `popstate` 各覆盖什么场景？

`decorate-route.ts` 的三管齐下：

| 机制                         | 覆盖场景                                    | 实现                                       |
| ---------------------------- | ------------------------------------------- | ------------------------------------------ |
| `history.pushState` patch    | 应用代码/router 库主动跳转（`router.push`） | `decorateProp` 包装，取 url 参数做 from/to |
| `history.replaceState` patch | 替换当前历史条目（`router.replace`）        | 同一个 `historyDecorator` 复用（行 38-56） |
| `onpopstate` 重写            | 浏览器前进/后退按钮                         | 重写 `globalThis.onpopstate`（行 20-36）   |
| `hashchange` 监听            | hash 路由（`#/page`）                       | `decorates.ts:104-116` 单独事件            |

细节与坑：

1. 么 pushState 不会有原生事件：规计上 `pushState/replaceState` 不触发任件（popste 只由用户导航动作触发），所以路由库社区的标准做法就是 monkey-patch——React Router、Vue Router 自身也依赖这个 hack 或轮询。
2. 逻辑：`om === to` 时不发布（patch 里和 popstate 里都有判断）。`to` 经过 `new URL(url, currentHref).href` 归一化（`normalizeRouteUrl`，行 12-14），把 `/about` 这类相对路径转绝对路径再比较——否则 `pushState('/about')` 与当前 `http://x.com/about` 会被误判为不同。
3. pstate 用属性赋值而非 addEventListener：`obalThis.onpopstate = function...` 并在闭包里保存 `oldOnpopstate` 链式调用（行 33-35）——因为 popstate 本身已有原生事件机制，用赋值方式并调用旧值，与 `addEventListener` 方式相比可以精确恢复（clean 直接赋回旧值，行 60），不会和路由器自己 addEventListener 的监听器纠缠。
4. atestHref` 模块级变量：作上一次 URL」的真源，pushState 与 popstate 共享——因为一次「点击链接」可能先走 pushState patch（更新 latestHref），其后的 popstate 发现 from===to 自然去重，两种导航方式不会重复上报。

---

### Q37: PV 和停留时长（PageDwell）是怎么计算的？100ms 阈值和 beforeunload 各解决什么问题？

`core/pv-lifecycle.ts` 的状态机：

1. 化：`itPageView()` 创建 `currentPage = { url, referrer, startedAt: Date.now(), name: "PageLoad" }`，立即（`immediate: true`）上报一条 PV。
2. 切换：`cordRoutePageView(to, from)` → 先给旧页面结`seDwellTime(currentPage, now - startedAt)` → 创建新 PageState（referrer 为旧 url）→ 上报新页 PV。
3. 离开：`foreunload` 时 `flushCurrentPageDwell(true)` 结算最后一页的停留（`setup.ts:82-88`）。

设计细节：

- 0ms 下限（`nimumDwellTime`，`pv-lifecycle.ts:5`）：过滤「路由瞬移」——重定向链路（`/old → /new` 程序化跳转）会产生毫秒级停留的中间页，这种数据只有噪音价值；同时规避 `Date.now()` 精度误差产生的 0ms 数据。
- foreunload 的必要性：最页没有「下一次路由切换」来触发结算，不在卸载时 flush 就永远丢失；`immediate: true` 让这条数据跳过攒批直接发送——页面正在卸载，等 2 秒攒批窗口数据就随页面销毁了（配合 sendBeacon 的异步可靠投递）。
- ：`rrentPage?.url === normalizedTo` 时 return（`pv-lifecycle.ts:77-79`），处理路由库「同 URL 重复 push」和 hash 查询参数抖动。
- sibilitychange 的缺席：当现没有按「页面切后台暂停计时」——停留在后台标签的时间会计入 dwell。这是一个已知口径选择（实现简单），若业务要求「可见停留时长」，需要叠加 `document.visibilityState` 做分段计时（改进点）。

---

### Q38: 曝光埋点（ExposurePlugin）基于 IntersectionObserver，阈值分组复用 observer 是什么考虑？

`plugins/exposure/index.ts` 的核心结构：按 `threshold` 分组——同一个阈值的所有观察目标共享一个 `IntersectionObserver` 实例（`Map<threshold, observer>`），`observe(target, threshold, params)` 时查表复用或新建。

考虑：

1. tersectionObserver 实例成本：每observer 实例在浏览器内部有独立的观察目标列表和交叉计算调度，几百个 observer（每个元素一个）会造成明显的内存与调度开销；共享实例后浏览器内部可做批量交叉计算优化。
2. 是 observer 级配置：`w IntersectionObserver(cb, { threshold })` 的阈值在构造时固定，无法按目标定制——所以按阈值分组是复用的唯一正确。
3. 时长的语义：进口记录 `showTime`，离开视口计算 `duration = showEndTime - showTime` 并上报——产出的是「有效曝光时长」而非「曝光次数」，对内容推荐场景（停留 >2s 才算有效阅读）更可用。

边界：元素被曝光一次后是否重复计（离开再进入）？实现按每次进入-离开周期各报一次，聚合去重留给服务端按 `params` 里的业务 ID 处理；`unobserve` 支持手动摘除。相比旧式 scroll 监听 + `getBoundingClientRect` 轮询方案，IntersectionObserver 由浏览器在合成线程异步计算交叉，不阻塞主线程—— 2019 年后曝光埋点的标准答案。

---

### Q39: breadcrumb 里 `event2breadcrumb` 的 userAction 映射有什么分析价值？

breadcrumb 的每条记录带 `userAction` 字段（由事件类型映射为可读动作描述），它的核心价值是现场还原：当错误上报时，服务端可以拉取同一 session/url 之前的 30 条 breadcrumb，重建用户操作轨迹：

```
[click] 点击"提交订单" → [xhr] POST /api/order 500 → [error] TypeError: Cannot read...
```

这条链路直接回答「用户做了什么导致错误」——比单纯的堆栈更快定位「是接口异常引发的连锁错误」。这是 Sentry 概念体系的本土化实现：breadcrumb 不上报为独立事件流，而是作为文证据与错联。实现上面包屑数据结构与上报数据结构同构（`breadcrumb.push({...payload, userAction})`），复用同一套类型与序列化，降低维护成本。

---

### Q40: 行为数据（点击/路由/曝光）和错误数据在上报管道里是如何区分优先级的？

答案是：优先级，但有隐式分级。所件共享同一个 `DataReporter` 队列，FIFO 攒批。隐式分级体现在三处：

1. mmediate` 参数：`porter.send(payload, immediate)`——PV 首报、beforeunload 的停留时长用 `immediate: true` 跳过攒批窗口立即 flush（`pv-lifecycle.ts:21`），因为页面生命周期不等人；普通点击/路由事件走正常攒批。
2. 淘汰 FIFO：队 `maxQueueLength`（200）时 `slice(-maxQueueLength)` 淘汰最旧数据意味暴中行为数据（高频）自然挤占错误数据（低频但重要）的位置风险存在。这是当前设计的一个可商榷点：严格的做法是分优先级队列（错误 > 行为），让错误风暴时行为数据先被丢弃。
3. 率统一：`acesSampleRate` 对所有类型一视同仁——采样主要服务性能/行为类高频数据，错误通常希望 100% 采集；当前实现把分流责任交给了服务端（按 type 过滤存储策略）。

面试中主动指出第 2 点的改进空间（优先级队列 + 按类型采样率）会显著加分。

---

## 五、HTTP 请求监控

### Q41: XHR 劫持为什么同时 patch `open` 和 `send` 两个方法？各自承担什么职责？

`decorate-http.ts:15-63` 的分工是 XHR 生命周期决定的：

- pen(method, url)`：此求元数绪（方法、UR，但请求还没发出。patch 它在 `this.**sentry**` 上初始化采集对象：baseData（含 timestamp 起点）、method、api、默认 statusCode。
- end(body)`：此求体就是真正发出机。patch 它做两件事：①记录 `requestData.body`；②注册 `loadend` 监听器——`loadend`在成功（load）、失败（error）、中断（abort）后都会触发，是「请求完结」的统一钩子。完结时回填`status`、`responseData`、`server-timing` 头、`elapsedTime = Date.now() - timestamp`，然后 `pub`。

为什么不用全局事件而要挂实例属性 `__sentry__`：同一个页面可能并发多个 XHR，每个请求的元数据必须绑定在请求实例上；挂在 `this`（XHR 实例）的 `__sentry__` 字段是最直接的实例级存储，且通过 `WithSentry<XMLHttpRequest, IHttpData>` 类型扩展保持类型安全。

为什么用 `loadend` 而不是 `readystatechange === 4`：`loadend` 语义更完整（覆盖 error/abort），且避免 readystatechange 多次触发的判断成本。

---

### Q42: fetch 劫持中为什么要 `res.clone()`？直接读 `res` 会发生什么？

`decorate-http.ts:82`：`const resClone = res.clone()`。

原因：sponse 的 body 是 ReadableStream，只能被消费一次。业码拿到响应后通常 `res.json()`——如果 SDK 先 `res.text()` 读取，流被锁定并耗尽，业务的 `json()` 会抛 `TypeError: Failed to execute 'json' on 'Response': body stream already read`。`clone()` 创建流的 tee 副本：SDK 读克隆体，原始响应原样返回给业务（`then` 里 `return res` 返回的是未克隆的原对象）。

相关设计细节：

1. 读取不阻塞业务：`sClone.text().then(...)` 是 fire-and-forget 的旁路 Promise，业务的响应处理链路在 `return res` 时已继续——监控读取与业务消费并发进行。
2. 失败兜底：`xt()` 失败（如流被外部取消）时 `catch` 里依然 `pub`（`decorate-http.ts:93-96`），此时 `responseData` 缺失但 status/耗时仍在——响应体是信息，不是必需信息。
3. 意识：大体克隆意味着内存中两份数据 + 文本化解码开销，这是 Q32 提到的性能敏感点；更保守的方案可以只读前 N KB（通过 reader 手动截断），当前实现为保完整性未截断。

---

### Q43: SDK 怎么避免「上报请求自己被监控」造成的循环上报？

`shouldIgnoreRequest`（`decorate-http.ts:112-116`）：

```ts
return (
  (method.toUpperCase() === HttpMethod.Post && api === sentry.options.dsn) ||
  isExcludedApi(api)
);
```

第一条件精确匹配：ST 到 DSN 的请求一律忽略。因报走 `fetch(dsn, {method: "POST"})`（transports.ts），若被 fetch 拦截器捕获并作为一条 HTTP 事件上报，这条上报数据的发送又会触发新的捕获——自激循环。

注意判断的精确性：只豁免 ST D（上报传输的方式），GET 到同地址（如果有）仍会被记录；且判断发生在 `pub` 之前（`loadend` 回调和 fetch 的两个分支里），避免无效数据进入总线。

`excludeApis` 配置承担业务侧的排除需求（如日志接口、心跳接口、第三方全量代理），支持 string/RegExp 匹配。两类过滤的边界：DSN 是 SDK 自卫，`excludeApis` 是用户治理。

另外 `sendBeacon` 传输天然免疫——它不经过 fetch/XHR，不会被自己的 patch 捕获；Image 传输同理。只有 fetch 兜底传输需要这个豁免逻辑。

---

### Q44: HTTP 状态码如何分级？`statusCode = 0` 是什么含义？

`transform-http-data.ts` 的分级：100–399 → `Status.OK`，400–599 → `Status.Error`。

`statusCode = 0` 出现在 fetch 的 `catch` 分支（`decorate-http.ts:99-105`）：Promise reject 意味着层失败——S 解析失败、TCP 连接拒绝、CORS 阻断、请求超时，此时根本没有 HTTP 响应，status 无从谈起。用 0 作为哨兵值并把 `err.message` 放入 message 字段，让服务端可以区分：

- x/5xx：服活着但拒绝/出错（业务问题、服务端 bug）
- 请到达或响应没回来（网络环境、CORS 配置、网关挂掉）

这个区分对告警价值巨大——`statusCode = 0` 的突增通常指向基础设施故障（CDN 证书过期、跨域配置被改），而 5xx 突增指向应用层发布事故。XHR 侧不存在 0 的构造（`loadend` 里 `this.status` 网络失败时浏览器天然给 0），两个通道的语义因此一致。

---

### Q45: `Server-Timing` 头是怎么被利用的？它解决了什么前端监控的盲区？

两处采集：XHR 用 `this.getResponseHeader("server-timing")` 后 `parseServerTiming`（`decorate-http.ts:52`），fetch 用 `getServerTimingFromHeaders(res.headers)`（行 85）。

`Server-Timing` 是 W3C 规范的服务端性能透传头，格式如 `Server-Timing: db;dur=53, cache;desc="Cache Read";dur=2.3`——服务端把内部各阶段耗时（数据库查询、缓存命中、模板渲染）编码进响应头。前端 `PerformanceResourceTiming` 只能看到「请求总耗时」的黑盒，`Server-Timing` 让前端监控服务端内部耗时分解：

- 一个 API 总耗时 800ms，server-timing 显示 `db;dur=720` → 慢在数据库，前端无需背锅；
- 多端统一的链路追踪前置：配合 trace id 约定可拼接出完整调用链。

注意事项：跨域响应的 `server-timing` 头默认不可读，需要服务端在 CORS 配置中 `Access-Control-Expose-Headers: Server-Timing`；读取失败时解析函数返回空，不阻塞主流程。

---

### Q46: fetch 劫持对上传/下载进度、流式响应（SSE）友好吗？有什么已知限制？

当前实现的主要限制：

1. E/流式响应会被整体缓冲：`s.clone().text()` 对 `text/event-stream` 类型响应意味着等到流关 resolve——一个长连SSE 挂一小时，监控数据就延迟一小时，且克隆的流持续在内存累积文本。改进方向是按 `content-type` 检测跳过 body 读取，只记录 header 级信息。
2. 体序列化损耗：`questData.body` 直接存原始引用（`decorate-http.ts:73`），`FormData`/`Blob`/`ArrayBuffer` 类型的 body 在 JSON 序列化上报时会变成 `{}` 或抛出——FormData 上传场景请求体信息实际丢失。
3. 进度无感知：fch 上传进度需要 `duplex: 'half'` + ReadableStream body 的包装才能观测，当前未实现。
4. quest 对象入参：`tch(new Request(url, {...}))` 时 `options` 为 undefined，实现里 `options?.method` 取不到真实 method（会默认 GET）、也拿不到 body——对 Request 实例入参的场景元数据不全。

这些都是「监控旁路」与「能力完整」之间的取舍：完整的流式支持需要包装 ReadableStream（成本高、易出 bug），当前实现覆盖了 95% 的普通 JSON API 场景。面试中主动说出这些限制说明真正读过 patch 代码而非泛泛而谈。

---

## 六、数据上报与可靠性

### Q47: 上报传输为什么设计成 sendBeacon > Image > fetch 三级降级？各自的限制是什么？

`reporter/index.ts:120-128` 的选择逻辑：

```ts
if (!isOverBeaconSize && sendBeacon(batch)) return true; // ≤60KB
if (useImageReport && !isOver2KB) {
  reportByImage();
  return true;
} // ≤2KB
return reportByFetch(batch, onError); // 兜底
```

| 传输                   | 优势                                                                   | 限制                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `navigator.sendBeacon` | 卸载时可靠投递（浏接管，不随页面销毁取消）；不阻塞主线程；异步无返回值 | 只支持 POST；约 64 载荷上限；无法读响应法得知成败；CORS 简单请求                                       |
| `Image` GET            | 天然跨域（无 CORS）；兼容古董浏览器                                    | L 长度约 2KB 上限；数露在 URL（日志/代理可见）；只能 GET；成功率无法确认（onerror 也只能感知加载失败） |
| `fetch` POST keepalive | 完整的请求/响应语义，可感知失败并触发重试                              | 页面卸载时普通 fetch 会被中止（`keepalive: true` 放宽到 64KB 内可存活）；受 CORS 约束                  |

为什么是 beacon 优先：监控数据的典型风险时刻是关闭瞬间（最错误、最后的停留时长），beacon 是唯一为此场景设计的 API——它的语义就是「我不需要响应，请务必送达」。缺点（无响应、无失败回调）对监控场景无所谓：监控上报本来就是 fire-and-forget。

Image 传输存在的意义：极老的 WebView（企业内嵌 H5）可能没有 beacon，而 fetch 失败时作为最后手段；默认关闭（`useImageReport: false`），按需开启。

fetch 兜底的独特价值是感知——它能可靠地知道「服务端 5xx 了」，从而触发 `handleServerError` 启动恢复探测（Q49）。

---

### Q48: 批量上报的策略是什么？`cacheMaxLength` 和 `cacheWaitingTime` 如何协同？

`reporter/index.ts:140-159` 的双触发模型：

- 触发：`ents.length >= cacheMaxLength`（默认 10）→ 立即 flush；
- 触发：否置 `setTimeout(flush, cacheWaitingTime)`（默认 2000ms）——每次新事件入队都重置这个器（`clearTimeout` 再重排）。

协同逻辑：这是一个「即发 + 尾批限时」的策略。纯数量触发的问题：低频场景队列里 3 条数据永远凑不满 10 条，延迟无限大；纯时间触发的问题：高频场景产生不必要的请求数。混合策略保证：高负载时每 10 条一个请求（请求数最优），低负载时最多延迟 2 秒（延迟有界）。

细节：`send()` 里每次入队都 `clearTimeout(this.timeoutID)` 再重新 `scheduleFlush`——看似浪费，实际保证「2 秒」是从一条事件算起ebounce 语义），批量内事件的年龄分布更均匀。`flush()` 内部若队列非空会继续 `scheduleNextFlush(100ms)` 排空剩余——所以一次错误风暴产生的 100 条会以 10 条/批、间隔 100ms 的节奏发出，而非一次性 100 条超大请求，这对服务端是平滑的背压。

---

### Q49: 服务端挂掉之后 SDK 的行为是什么？恢复探测怎么设计？

失败检测：fetch 传输 reject 或响应非 OK → `sendBatch` 返回 false → 两个动作：

1. 回滚：`is.events = [...finalSendData, ...this.events].slice(-maxQueueLength)`——发送失败的批次放回队首（保持原始顺序），并截断到 200 上限；随后 `saveOfflineCache()` 持久化到 localStorage（`reporter/index.ts:96-99`）。
2. 探测：`ndleServerError` → `scheduleServerRecovery`（`server-recovery.ts`）——每 `retryIntervalMilliseconds`（默认 60s）向服务端发一个轻量 HEAD测：
   - 探测失败 → 保持 offline 状态，继续周期探测；
   - 探测成功 → `setOnline(true)` → `loadOfflineCache()` 把 localStorage 数据载入内存 → `flush()` 恢复上报。

为什么用 HEAD 探测而不是直接重发数据：①探测请求极小（无 body），服务端恢复初期不被积压的重放流量二次打垮（惊群效应的缓解）；②HEAD 的响应头即可判断存活，语义干净。

为什么 60 秒：服务端典型故障恢复时间在分钟级；过短的探测间隔在服务端彻底挂掉时是 N 个客户端 × 持续探测的 DDoS 效应，60s 是「恢复灵敏度」与「探测流量成本」的保守平衡点，且可配置。

---

### Q50: 离线缓存为什么选 localStorage 而不是 IndexedDB？读取时的 Zod 校验防的是什么？

`offline-cache.ts` 选择 localStorage 的理由：

1.  API：离存的关键写入时机是「发送失败的瞬间」和「页面即将卸载时」，IndexedDB 的异步事务在 `beforeunload` 里没有完成证——页面销毁等 IDB 事务提交。localStorage 的 `setItem` 同步落盘，在卸载路径上可靠。
2.  规模匹配：上200 条 × 每条平均 1-2KB ≈ 几百 KB，远低于 localStorage 5MB 配额，不需要 IDB 的大容量。
3.  简单：无迁移、无游标，读写即 JSON 序列化。

代价是同步 I/O 阻塞主线程（几百 KB 的 JSON.parse 约几 ms，可接受）和同域共享配额（与业务共用 5MB）。

时的 Zod schema 校验防的储数据/污染：

- localStorage 是同域共享的，业务代码或其他 SDK 版本可能改写过同一个 key；
- 上个版本 SDK 写入的字段结构在本版本可能已不兼容；
- 用户手动篡改/调试工具写入。

没有校验时，脏数据进入 `events` 队列会在序列化或发送时引发难以排查的异常；校验后损坏丢弃单条、整体损坏清空缓存，保报管道的数据 invariant（每条都是合法 `IReportData`）。这再次体现「跨越信任边界的数据必须运行时校验」的原则（Q6）。

---

### Q51: `flush()` 的 `isFlushing` 并发保护防的是什么场景？不加会怎样？

`reporter/index.ts:79-109`：`flush()` 入口检查 `isFlushing`，为 true 直接 return；整个发送过程在 `try/finally` 里持有标志。

并发来源：flush 里有两处 `await`（`takeBatch` 可能经 hook 返回 Promise、`sendBatch` 的 fetch 是异步）——ait 让出主线程期间，另触发源可能再次调用 flush：

- `cacheMaxLength` 攒满触发的 flush 与 2 秒定时器 flush 撞车；
- 网络恢复回调的 flush 与发送中途的新事件入队触发 flush 撞车。

不加保护的后果：`takeBatch` 是非原子操作（先 `slice` 取批再赋值剩余），两个并发 flush 各自执行 `events.slice(0, 10)` 会同一批数据发送两次——端收到重复批次。虽然服务端可按 `id`（每条数据的 UUID）去重，但客户端重复发送浪费带宽且污染告警计数。

`finally` 复位保证即使发送抛异常标志也释放，不会永久卡死上报通道。这是单线程 JS 里典型的「异步临界区」模式——JS 没有真并发，但 await 点之间的交错（interleaving）会产生与并发等效的数据竞争。

---

### Q52: `DataReporter` 的单例为什么要提供 `reset()`？destroy 流程完整做了什么？

`reset()`（`reporter/index.ts:42-47`）：dispose 实例（清定时器、清队列、复位 isFlushing）并丢弃单例引用。它存在的理由：

1. K 可卸载：`stroy()` 承诺完全清理——上报器持有 `timeoutID`、`retryTimer` 两个定时器和网络监听器，不销毁会在 SDK destroy 后继续空转（内存泄漏 + 幽灵请求）。
2. 隔离：测件需要反复 init/destroy，模块级单例会跨用例泄漏状态（队列里残留上一条用例的数据），reset 让每个用例拿到全新 reporter。
3. 例需求：同个项目（微前端）想各自销毁自己的上报通道时，模块级唯一单例是障碍，reset 至少提供「全部重来」的能力。

完整 `destroy()` 链路（`sdk-lifecycle.ts:18-24`）：

```ts
destroyPlugins(); // 插件逆序 cleanup（observer 断开、rrweb 停止）
cleanupSetup?.(); // 事件订阅退订 + 装饰层恢复原函数 + 定时器清理
cleanupSetup = null; // isInitialized() 归位
destroyBatchErrorManager(); // 清批量聚合的 2 秒定时器与缓存
resetReporter(); // 上报器 dispose + 单例重置
```

一层不缺：插件 → 订阅 → 劫持恢复 → 聚合器 → 上报器，每层的定时器/监听器/patch 都有对应出口。全卸载是 K 成熟度的标志——热更新场景（无刷新切换 SDK 配置）和单测都依赖它。

---

### Q53: 上报数据的完整结构是什么？为什么要有 `id` 和 `sdkVersion`？

`report-data.ts` 组装后的 `IReportData`：

| 字段                                   | 来源                                          | 作用                                                       |
| -------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| `id`                                   | `crypto.randomUUID()`                         | 键：重离线重发/重复 flush 产生的重复数据在服务端按 id 去重 |
| `type` / `name` / `message` / `status` | 事件本身                                      | 分类与检索维度                                             |
| `time` / `timestamp`                   | 事件发生时刻                                  | 时间轴分析（time 是可读格式，timestamp 是数值）            |
| `url`                                  | `location.href`                               | 页面维度归因                                               |
| `userId` / `visitorId` / `anonymousId` | 身份模块                                      | 用户维度聚合与影响面分析                                   |
| `projectId`                            | init 配置                                     | 多项目共用一个 DSN 网关时的路由键                          |
| `sdkVersion`                           | package.json 注入（`constants/index.ts:3-5`） | 契约版本管理                                               |
| `deviceInfo`                           | 单例构造时采集                                | 设备/浏览器维度分布分析                                    |
| `payload`                              | 各事件类型特有数据                            | 明细                                                       |

`id` 的价值在不可靠网络下凸显：beacon 无响应可知，客户端无法确认「是否真的送达」，重试策略下重复是常态，服务端幂等去重依赖 id。

`sdkVersion` 的两个用途：①上报结构随 SDK 版本演进，服务端按版本分流解析逻辑；②数据质量回溯——某版本 SDK 的 bug（如字段缺失）可以通过版本维度圈定受影响数据范围。从 `package.json` 构建期注入（rollup 的 json import）保证版本号永远与发布物一致，不需要人工同步。

---

### Q54: `beforeReportData` / `beforePushEventList` / `afterSendData` 三个 hook 分别解决什么诉求？设计上有什么区别？

三个 hook 对应数据生命的三个时点：

| Hook                  | 时点       | 输入/输出                         | 典型用途                                                                  |
| --------------------- | ---------- | --------------------------------- | ------------------------------------------------------------------------- |
| `beforeReportData`    | 单条数据前 | 条 payload → 改写或返回 null 丢弃 | 数据脱敏除 meage 里的手机号/token）、按内容丢弃（过滤测试流量）、字段增强 |
| `beforePushEventList` | 批次前     | 整批数组 → 改写/过滤（可 async）  | 批次级治理：按类型过滤（只发错误）、批次拆分、附加批次级元信息            |
| `afterSendData`       | 发送后     | 已发送批次（只读）                | 审计日志、与业务侧调试面板联动、自定义成功埋点                            |

设计差异：

1. 丢弃数据：前可以（返回 null/空数组），afterSend 只读——发送已完成，无丢弃语义。
2. 支持：`forePushEventList` 明确支持 Promise（`flush` 里 `isPromise(batch) ? await batch : batch`，`reporter/index.ts:88`），允许 hook 里做异步脱敏（如查映射表）；单条 hook 也做了 isPromise 兼容。
3. 成本位置：单hook 在每条事件路径上执行（高频），必须轻；批次 hook 每批一次，可以做重一点的活。用户把脱敏逻辑放错位置（比如批次 hook 里逐条正则替换大文本）会有性能差异，文档应引导。

---

### Q55: 采样率 `tracesSampleRate` 在客户端实现有什么利弊？正确的采样姿势是什么？

客户端采样（`send-preflight.ts`：`Math.random() > tracesSampleRate` 则丢弃）：

成置节约——不采集就没有后续的序列化、网络、存储成本；配置即时生效，不需要发版。

1. 失真风险：随样对「量大均匀」的数据（PV、性能）无害，但对「稀少关键」的数据（特定错误）可能恰好采丢唯一样本。所以业内惯例是错误不采交易类强相关事件不采样，采样只应用频行为/性能数据（当前实现是全局采样，按类型区分采样率是改进点）。
2. 级不一致：按独立随机意味着同一会话的数据七零八落（这个点击采了、那个没采），无法做会话级漏斗。正确姿势是采样决策化：会话开始时次骰子存入 session，整会话一致采或不采（`Math.random()` 结果缓存），保证会话内数据完整。
3. 务端采样重复时的复合偏差：客 50% + 服务端 50% = 实际 25%，要在文档中明确采样率的叠加关系。

实现细节的暗坑：`Math.random()` 在 `send-preflight.ts` 是每事件调用——面试可主动指出粘性会话采样的改进方向。

---

### Q56: 如果上报接口返回 200 但响应体里是业务错误码（如 `{code: 50001}`），SDK 能感知吗？

，且这是当前传输层的设计边界。`portByFetch` 的成败判断基于 HTTP 层（网络成功 + 状态码 2xx）；beacon 和 Image 更是连响应都读不到。服务端「HTTP 200 + body 错误码」的场景（如网关鉴权失败但返回 200 包装）在 SDK 视角是发送成功，数据就此丢弃。

解法讨论：

1. 优先：与约定上报接口的失败必须用非 2xx 表达——这是最干净的方案，fetch 的 ok 判断天然生效，重试/离线缓存链路零改动。
2. 体解析：fch 路径可以读响应 JSON 判 code，但代价是每次响应的解析开销 + 与 beacon 路径（无法读响应）语义不一致——两条传输路径行为分叉是维护陷阱。
3. ：fch 路径做可选的响应校验 hook（配置开关），beacon 路径维持 fire-and-forget，文档说明差异。

这个问题本身没有标准答案，面试官想听的是「意识到 HTTP 语义与业务语义的鸿沟，以及不同传输方式能力不一致带来的设计约束」。

---

### Q57: `crypto.randomUUID()` 的兼容性怎么处理？如果环境不支持会怎样？

`crypto.randomUUID()` 需要上下文（HPS 或 localhost）+ 较新浏览器（Chrome 92+/Safari 15.4+）。SDK 中两处使用：

1. `DataReporter.id`（实例标识，`reporter/index.ts:15`）
2. 指纹兜底 `getFallbackFingerprint`（`utils/sentry.ts:55-59`）

兜底链写得严谨：

```ts
if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
  return globalThis.crypto.randomUUID();
}
return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
```

先查 `crypto` 存在（老浏览器/非安全上下文 crypto 可能存在但无 randomUUID），再查方法存在，最后退化为「时间戳 + 随机数」组合——碰撞概率在单会话场景可忽略，作为指纹兜底足够。

但注意 `reporter/index.ts:15` 的 `id = crypto.randomUUID()` 没有兜底——在不支持的环境实例化 DataReporter 会直接抛错。鉴于 SDK 目标浏览器整体较现代（大量依赖 PerformanceObserver 等），这是可接受的隐含假设；若要严格，应与指纹兜底共用同一工具函数。面试中这是个展示「代码审查时发现不一致性」能力的好例子。

---

### Q58: 从「数据可靠性」角度总结，这个 SDK 做了哪些事情保证数据不丢？

全链路的可靠性设计清单：

1. 时刻：boreunload 触发 `flushCurrentPageDwell(immediate)` + sendBeacon 传输（浏览器接管投递，页面销毁不影响）。
2. 重试：发败 → 批次回滚队首 → 立即持久化 localStorage → 网络/服务端恢复后重放。
3. 感知：`line/offline` 事件驱动状态机，离线期间数据落盘而非内存堆积，恢复后 `loadOfflineCache + flush`。
4. 端宕机：HD 探测 + 60s 退避，避免重放风暴压垮刚恢复的服务。
5. 有界：内列 + 离线缓存都受 `maxQueueLength`（200）约束，FIFO 淘汰——「不丢」的前提是不无限膨胀，极端场景丢最旧保最新。
6. 友好：每据带 UUID，重复投递在服务端可去重。
7. 完整性：入 hook 可拦截、离线读回时 schema 校验、序列化有大小检查（60KB/2KB 上限）。

坦白的边界：beacon/Image 路径的「送达确认」不可得；`maxQueueLength` 之外的淘汰意味着极端离线时长下旧数据必丢——可靠性是在「用户设备资源有限」约束下的最大化，不是绝对保证。面试里把这个 trade-off 讲清楚比宣称「100% 不丢」更专业。

---

## 七、白屏检测

### Q59: 白屏检测的算法是什么？18 个采样点怎么分布，为什么全空才判定？

`core/white-screen.ts` 的网格采样法：

1. 时机：`cument.readyState === "complete"` 后开始（或等 `load` 事件），`setInterval` 每 1000ms 采样一次，最多 10 次（`MAX_WHITE_SCREEN_SAMPLE_COUNT`）。
2. 点分布：视高的 9 等分网格的十字交叉—横向中线 个点（`(innerWidth * i / 10, innerHeight / 2)`，i=1..9），纵向中线 9 个点（`(innerWidth / 2, innerHeight * i / 10)`），共 18 个（`white-screen.ts:46-57`）。
3. ：对点 `document.elementFromPoint(x, y)` 取最上层元素——元素不存在或元素是根容器（`html/body/#app/#root`，`rootCssSelectors` 可配）则该点计为「空点」。18 个空 → 白屏。
4. 即上报并停样；非白屏（有任何内容点）也停止——它是「首次加载是否白屏」的一次性检测，不是持续巡检。

为什么十字线而不是满 9×9=81 点：`elementFromPoint` 是同步布局查询，有成本；十字线以 18 次查询覆盖了「屏幕中央 + 上下左右」的典型内容区——真实白屏（整个 #app 为空）在任何网格密度下表现一致，而稀疏采样可能漏掉的「只有角落有内容」场景本身已属严重异常，不必精确区分。

为什么必须为空：电可能首屏只渲染了顶部 banner（中下区域未就绪），部分点为空属正常；全空才是「页面骨架都没渲染」的确定性信号。宁可漏报可误报——白屏误报告警失去公信力。

---

### Q60: 骨架屏（Skeleton）模式为什么要特殊处理？它的判定逻辑是什么？

问题：带骨架屏的页面在数据返回前，视口里容（灰架块）——网格采样点全部命中骨架 div，标准模式会判定为「非白屏」。但如果接口挂了一直停在骨架屏，用户体验等同于白屏。

骨架屏模式（`hasSkeleton: true`）的对比逻辑（`white-screen.ts:71-85`）：

1. 1 次采样：不，只记录 18 个点命中的元素选择器集合到 `initialSelectors`（即骨架屏的「指纹」）。
2. 每次采样：重集选择器到 `currentSelectors`，与初始集合排序后 in 比对。
3. 完全一致 →面内容从骨架屏开始就没有演化过 → 判定「困在骨架屏」→ 上报。

这个设计的巧妙之处：它不关心骨架屏长什么样（无需业务方提供骨架选择器），而是检测「停滞」—常页面骨架会在数据到达后被真实内容替换（选择器集合变化），异常页面选择器集合冻结。选择器由 `getCssSelectors` 生成（id > class > 标签名的三级），用集合比较而非逐点比较，容忍采样点命中顺序的抖动。

局限：骨架与真实内容选择器恰好相同的极端设计（骨架复用真实 class）会漏报；采样窗口最长 10 秒，超过 10 秒才渲染的慢页面会误报为骨架停滞——所以 10 次 × 1s 的上限需要在业务 P95 加载时长之上调整。

---

### Q61: 采样为什么包在 `requestIdleCallback` 里？`deadline.timeRemaining() > 0 || deadline.didTimeout` 的判断是什么意思？

`white-screen.ts:113-122`：

```ts
sentry.whiteScreenTimer = setInterval(() => {
  if ("requestIdleCallback" in globalThis) {
    requestIdleCallback((deadline) => {
      if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
        sample();
      }
    });
  } else {
    sample(); // Safari 等无 rIC 的环境直接采样
  }
}, WHITE_SCREEN_SAMPLE_INTERVAL);
```

两层含义：

1. 么 rIC：`ementFromPoint` 会强制同步布局（若样式脏了要 reflow），18 次连续调用在主线程忙时会加剧卡顿。rIC 把采样推迟到浏览器空——监控绝不成为白屏的诱因（观察者效应）。
2. 条件的含义：`meRemaining() > 0` 表示这一帧还有空闲预算（正常执行）；`didTimeout` 表示 rIC 等待超时（默认无 timeout 参数时不会触发，但保留这个判断是为了兜底：即使浏览器长期繁忙、回调被超时强制调度，也执行采样——白屏检测因为页面忙而永远跳过，恰是最卡的最需要检测）。这是一个「平时让路、兜底必达」的策略。

降级路径：无 rIC 的环境（Safari 老版本）直接同步采样——白屏检测的覆盖率优先于性能洁癖。

---

### Q62: 白屏检测有哪些已知的误报/漏报场景？你会怎么迭代这个方案？

当前方案的盲区：

| 场景                          | 表现                                                                | 性质                                 |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------------------ |
| 全屏弹窗/蒙层覆盖             | elementFromPoint 命中蒙层（非根元素）→ 判非白屏，但底下内容可能已白 | 漏报                                 |
| 页面有内容但整屏纯白图片/占位 | 命中 img 元素 → 非白屏，视觉上是白屏                                | 漏报（视觉白屏 vs DOM 白屏的语义差） |
| SPA 路由跳转后的白屏          | 只在首次 load 后检测，路由级白屏不覆盖                              | 漏报                                 |
| 加载极慢（>10s）的页面        | 采样窗口耗尽前内容未到 → 骨架模式误判停滞                           | 误报                                 |
| iframe 内容白屏               | elementFromPoint 命中 iframe 元素本身，不穿透                       | 漏报                                 |

迭代方向：

1. 级检测：`ml2canvas` 截图分析纯白像素占比——真正对齐「视觉白屏」，但成本高（截图库体积 + 渲染开销），适合按需（如 DOM 检测可疑时二次确认）。
2. 级白屏：把挂到路由事件后（复用 `handle-route` 的链路），每次跳转重新采样。
3. 号融合：D 采样 + 「关键资源加载失败事件」+ 「JS 错误爆发」做加权判定——白屏很少孤立发生，通常伴随资源/JS 错误，多信号可以大幅降低误报率。
4. 点自适应：按布局热力（历史数据训练的高频内容区）动态调整采样权重。

---

## 八、身份与上下文

### Q63: SDK 的身份体系有哪几层 ID？各自的生命周期和用途是什么？

四层身份，生命周期从短到长（`core/identity.ts`、`utils/session.ts`）：

| ID                     | 存储            | 生命周期                 | 用途                                                                                    |
| ---------------------- | --------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `sessionId`            | sessionStorage  | 标签页会话（关页即焚）   | 会话级数据串联（会话回放、单会话漏斗）                                                  |
| `deviceId`             | localStorage    | 持久（同浏览器同域）     | 设备维度去重（DAU/UV 统计）                                                             |
| `anonymousId`          | localStorage    | 持久，FingerprintJS 生成 | 录用户的稳定标识——器指纹（字体、canvas、WebGL 等 60+ 信号哈希），跨清除 cookie 仍较稳定 |
| `userId` / `visitorId` | 内存（options） | 业务设置后有效           | 登录用户的业务身份，用于「影响哪些用户」的精准分析                                      |

关键设计：

- ngerprintJS 默认关闭（`ableFingerprint: false`，`constants/index.ts:32`）——指纹采集有隐私合规敏感性（GDPR 下指纹属个人数据），做成显式开启；
- 链：urId 缺失时用 visitorId，再缺用 anonymousId，最后 "unknown"——任何事件都有身份可挂，分析侧按可用性逐级下钻；
- 与存储的边界：urId 刻意只存内存不持久化——登录身份是业务动态状态，SDK 不做跨会话缓存，避免「换账号后旧身份残留」的数据污染。

---

### Q64: Canvas 指纹的实现原理是什么？CRC32 会不会碰撞？

`utils/sentry.ts:32-53` 的实现：

1. 创建离屏 canvas，绘制特定组合：固定字体（`14px Arial`）+ 两层不同颜色/透明度的文本 + 一个填充矩形；
2. `canvas.toDataURL()` 导出 PNG base64——的绘制指令在不同设备上产生不同的像素结果（差源：GPU 渲染、字体抗锯齿、子像素渲染、OS 字体库、浏览器引擎）；
3. 对 base64 解码后的二进制做 CRC32，取 hex 作为指纹。

CRC32 碰撞问题：32 位哈希的碰撞空间按生日悖论约 7.7 万个指纹就有 50% 碰撞概率——全网唯一 ID 不够，但这里的定位是 deviceInfo 里的一个弱指纹维度，配UA/分辨率/语言等字段联合判重，实际区分度足够。真正的强身份由 FingerprintJS（多信号加权 + 更长哈希）承担，Canvas 指纹是零依赖的轻量兜底。

隐私视角：Canvas 指纹是「被动指纹」的代表，也是浏览器反指纹的重点（Brave/Firefox 会随机化 canvas 输出）——指纹在反追踪浏览器下不稳定，这正是 SDK 把它定位为辅助维度而非主键的原因。

---

### Q65: `getIPs` 通过 WebRTC 采集内网 IP 的原理是什么？这个能力有什么争议？

原理：WebRTC 的 ICE 协商过程会枚举本机网络接口——创建 `RTCPeerConnection`，建立 data channel，调用 `createOffer` 后 SDP 和 `icecandidate` 事件里会包含本机 IP（如 `192.168.x.x`、公网候选地址）。正则提取 SDP 里的 `c=IN IP4 x.x.x.x` 或 candidate 字符串中的地址，去重后返回。

用途：风控与内网环境识别（企业用户是否在内网访问、NAT 后的真实出口）。

争议与现状：

1. 争议：WRTC IP 泄露是知名 VPN 穿透手段，浏览器厂商持续收紧——Chrome 要求 getUserMedia 权限才暴露非 mDNS 地址，现代版本默认把主机候选混淆为 `xxx.local`（mDNS），直接 I采集在新浏览器上大多已失效，只能拿到 NS 名；
2. 意义打折：所`getIPs` 是「尽力而为」API——返回空数组是常见结果，SDK 把它做成独立异步 API（`getIPs(timeout?) => Promise<readonly string[]>`）而非自动上报字段，正是承认其不稳定性；
3. 加分点：知mDNS 混淆（RFC 8445 的隐私化演进）说明跟踪过 WebRTC 规范的隐私演进。

---

## 九、插件系统

### Q66: 插件系统的设计是什么？`SentryPlugin` 基类约定了什么契约？

`types/plugin.ts` 的 `SentryPlugin` 基类契约：

- 构造时绑定插件监听的 `EventType`（如 `PerformancePlugin` 绑定 `EventType.Performance`）；
- `init()`：插件启动逻辑（注册 observer、开始采集）；
- `destroy()`：完全清理（所有副作用可逆）。

生命周期由核心管理：`enablePlugin(plugin)` → `plugin.init()` + `registerPlugin` 登记（`sdk-lifecycle.ts:49-53`）；`destroy()` 时 `destroyPlugins()` 统一销毁（先插件后核心，保证插件销毁时核心的 reporter 还活着，可以把最后的数据发出去——顺序是有讲究的，Q）。

三个内建插件的分工恰好覆盖「性能、行为、现场」：Performance（慢在哪）、Exposure（看到了什么）、ScreenRecord（错误发生时什么样）。插件化的收益：核心包不含 rrweb（~50KB gz）这样的重依赖，按需引入；业务可仿照基类写自定义插件（如红屏检测、特定业务指标）挂在同一生命周期上。

---

### Q67: 录屏插件是怎么工作的？「错误触发式」录屏如何平衡性能与现场还原？

`plugins/screen-record/recorder.ts` 基于 `@rrweb/record` + `pako`（gzip）：

1. 录制、环形缓冲：reb 从页面加载就记录 DOM 快照 + 增量变更（mutation），事件流保存在内存环形缓冲，只保留最近 `screenRecordDurationMs`（默认 3000ms）的数据；
2. 上报：`reenRecordEventTypes`（默认 Error/Xhr/Fetch/Resource/UnhandledRejection）类型的异常事件发生时，把缓冲内最近 3 秒的事件流用 pako 压缩后作为录屏 payload 上报；
3. 侧：服/平台用 rrweb-player 按事件流重建 DOM 演化，看到「错误发生前 3 秒用户界面什么样」。

性能平衡的设计精髓：

- 录屏不可行：reb 全量会话录制的带宽/存储成本是监控数据的几个数量级，且 99% 的会话没有分析价值；
- 式 = 成本与价值的帕累托点：只误上下文保留 3 秒现场，数据量可控（3 秒事件流压缩后通常几十 KB），但对「这个报错用户到底看到了什么」给出直接答案；
- 是必要的：reb 事件流是冗长 JSON（每个鼠标移动一条），pako gzip 通常压到 1/5 以下；
- 边界：reb 的 `maskAllInputs` 类配置用于脱敏输入框内容——录屏类能力的合规风险（密码、个人信息入镜）必须默认遮罩。

与 Sentry Session Replay 对比：官方 Replay 也是「缓冲 + 错误触发」模式（另有采样全量模式），说明该设计是行业共识解。

---

### Q68: 如果让你设计一个「自定义插件」接入这个系统，需要哪些步骤？有什么注意事项？

以「红屏/ANR 检测插件」（主线程长时间无响应）为例：

```ts
import { SentryPlugin, EventType } from "@swifty.js/sentry/plugins";

class AnrPlugin extends SentryPlugin {
  private timer?: number;
  constructor() {
    super(EventType.Performance);
  } // 复用性能类型或扩展枚举

  init(): void {
    let lastBeat = performance.now();
    const loop = () => {
      const now = performance.now();
      if (now - lastBeat > 5000) {
        /* 主线程被卡死 5s+，上报 ANR */
      }
      lastBeat = now;
      this.timer = setTimeout(loop, 1000) as unknown as number;
    };
    loop();
  }

  destroy(): void {
    clearTimeout(this.timer);
  }
}
```

接入：`enablePlugin(new AnrPlugin())`。

注意事项：

1. 遵守：`stroy` 必须清理全部副作用（定时器/observer/DOM 监听），否则破坏 SDK 的可卸载性（Q52）；
2. entType 复用或扩展：上据必须有合法 type，自定义事件可复用 `Custom`/`Performance` 或通过 `traceCustomEvent` 语义对齐；
3. 在 init 里抛异常：插init 失败会影响 `enablePlugin` 调用方，内部应自行 try/catch 降级（参考 `startWebVitals` 的防御写法）；
4. 出口走 reporter：不 fetch——复用批量/离线/采样管道，插件只生产数据不操心运输；
5. 意识：主高频检测（如每帧）要考虑自身开销，rIC/setTimeout 让路。

---

## 十、框架集成与构建工具

### Q69: React 集成用 ErrorBoundary 而不是全局 error 事件，为什么？`componentDidCatch` 拿到的额外信息是什么？

React 16+ 的错误边界机制：`componentDidCatch(error, info)` 的 `info.componentStack` 提供树调用栈（如at Button in at OrderForm in at CheckoutPage`）——这是框架渲染层的信息，全局 `error` 事件的 ErrorEvent 里没有（它 J执行栈，经过 React 调度器后已看不出组件归属）。

`react.ts` 导出的 `ReactErrorBoundary` 是 class 组件（因为 ErrorBoundary 至今只能用 class 实现，hooks 无对应能力——这是 React API 的历史约束，面试常考点），`componentDidCatch` 里调 `reportFrameworkError({ type: EventType.React, ... })` 上报带组件栈的错误，然后按 props 渲染 fallback。

为什么不只靠 ErrorBoundary：它只捕获期、生命周期、构造函数的错事件处理器、异步代码（setTimeout、fetch 回调）、SSR 的错误不经过错界——这些仍由 `error`/`unhandledrejection` 兜底。两层捕获的覆盖矩阵：

| 错误来源               | ErrorBoundary  | 全局监听            |
| ---------------------- | -------------- | ------------------- |
| 渲染/生命周期          | ✅（带组件栈） | ✅（冒泡到 window） |
| 事件处理器             | ❌             | ✅                  |
| 异步回调               | ❌             | ✅                  |
| ErrorBoundary 自身抛错 | ❌             | ✅                  |

所以 SDK 双管齐下，重复上报由指纹去重在 type 维度消化（Q19）。

---

### Q70: Vite/Webpack 插件给开发环境提供了什么能力？为什么不能直接连生产 DSN？

`vite.ts` 和 `webpack.ts` 导出的是服务器中间件：在 dev server 上 mock 一个上报端点（接收 SDK 的 POST，打印到终端/返回 200），让开发者在本地联调时：

1. 埋点接入：点钮有没有产生预期数据、字段对不对，直接在终端看到；
2. 染生产数据：开境的调试事件（热更新引发的错误、假数据）打到生产 DSN 会污染告警与统计基线——dev 插件让 DSN 指向 localhost；
3. 调试：不公司内网/VPN 就能完整走通上报链路。

Vite 版用 `configureServer` 钩子挂中间件，Webpack 版用 `devServer.setupMiddlewares`（或旧版 before）——两者都是各自 dev server 的标准扩展点。`sentryPlugin7` 的命名暗示对 Vite 大版本（7/8，见 peerDependencies `vite ^7||^8`）的 API 兼容。

生产/开发 DSN 分离是监控体系的基础实践：本项目通过配置（init 传不同 dsn）+ dev 插件（本地 mock）双保险实现。

---

## 十一、工程化与代码质量

### Q71: 构建为什么选 Rollup 且 `preserveModules`？ESM+CJS 双格式各自服务谁？

`rollup.config.ts` 的关键决策：

1. reserveModules: true`：保码的目录结构输出（`dist/core/_.js`、`dist/plugins/_.js`），而非打成一个 bundle。对 SDK 的核心收益是极致 te-shaking：业务方 `port { init } from "@swifty.js/sentry"` 时，bundler 可以精确丢弃未用到的模块（如整个录屏插件目录）；单文件 bundle 的 tree-shaking 依赖 bundler 对副作用的分析精度，效果打折。
2. 个入口（iex/react/vue/preact/vite/webpack/plugins）：对应 package.json 的 7 个子路径导出——框架集成代码（React/Vue/Preact）与核心物理隔离，不用 React 的用户永远不会把 React 相关代码打进自己的包。
3. 式：E（`.js`，`module` 字段）给现代 bundler（tree-shaking、scope hoisting）；CJS（`.cjs`，`main` 字段）给 Node 环境（SSR、测试、老工具链）。`.cjs` 显式扩展名是因为包声明了 `"type": "module"`，CJS 产物必须用 `.cjs` 才不会被 Node 当 ESM 解析。
4. ternal 策略：框react/vue/preact）与运行时依赖（rrweb、pako 等）全部 external，不打进产物——避免 SDK 与业务方各自打包一份 React 造成双实例灾难；依赖版本交给业务 lockfile 统一解析。
5. ollup-plugin-dts` 生成类型：T声明文件随产物分发，类型与实现始终同步。

---

### Q72: peerDependencies 全部声明为 optional，这个设计的意图是什么？

`package.json` 中 react ^19 / vue ^3 / preact ^10 / vite ^7||^8 / webpack ^4||^5 全部放在 `peerDependencies` 且标记 `optional: true`。意图：

- 安装：用ue 的项目不应该被 npm 强制安装 React；peer + optional 的语义是「你用哪个子路径导出，就自己装哪个框架」——npm 不会因缺失 optional peer 报警。
- 主权归业务方：框本必须由业务项目锁定（React 双实例会导致 hooks 失效等经典事故），SDK 只做版本范围声明（兼容 ^19 等），不携带具体版本。
- dependencies：真行时必需的 6 个库（ua-parser-js、web-vitals、zod、@fingerprintjs、pako、@rrweb/record）放在 dependencies——它们与业务无共享实例的需求，重复打包也无副作用。

这是 SDK 类包的标准实践：环境提供的（框架）用 optional peer，私有实现细节用 dependencies。

---

### Q73: 测试策略是什么？70% 覆盖率阈值意味着什么？

Vitest + jsdom，13 个测试文件按模块边界组织（reporter、性能插件、生命周期、捕获层、手动 API、框架集成、离线缓存等）。值得注意的测试设计：

1. 场景专项：`porter-concurrency.test.ts` 专门验证 `isFlushing` 临界区——异步交错是 reporter 最难测的行为，独立成文件说明作者意识到这是高危区；
2. 面守护：`port-surface.test.ts` 断言公开 API 完整——防止重构时意外破坏公共契约（SDK 的 API 兼容性事故是发版大忌）；
3. ck 策略：jom 环境 + `test/setup.ts` 统一 mock（sendBeacon、matchMedia 等 jsdom 缺失的 API），保持用例聚焦逻辑而非环境差异。

70% 阈值的解读：对监控 SDK，率的价值分布极不均匀——porter 的批量/重试/降级逻辑值得 90%+，而装饰层的 patch 代码（大量浏览器 API 交互）在 jsdom 里很难真实覆盖，强行追数字会逼出「为覆盖率而写」的无效测试。70% 是「核心逻辑高覆盖 + 不为边缘环境代码凑数」的务实水位；配合 `typecheck`（`tsc --noEmit`）与构建作为质量门禁，形成「类型 → 单测 → 构建产物」的三层防线。

---

### Q74: SDK 的版本号怎么注入到代码里？为什么这么做？

`constants/index.ts:3`：`import packageJson from "../../package.json" with { type: "json" }`——期从 package.json 读取，`K_NAME`/`SDK_VERSION` 成为编译时常量。

对比备选方案：

| 方案                              | 问题                               |
| --------------------------------- | ---------------------------------- |
| 手写 `const VERSION = "0.0.2"`    | 发版时人工同步，必然漂移（忘记改） |
| 运行时读 package.json             | 浏览器环境读不到；打包体积增加     |
| 构建期注入（rollup replace 插件） | 等价方案，import attributes 更原生 |

构建期注入保证号 single source of truth 在 package.json——pm version patch` 一条命令自动体现在产物里。上报数据携带 sdkVersion 后，服务端可按版本做数据兼容性分流与 bug 影响面圈定（Q53）。

`with { type: "json" }` 是 import attributes 语法（原 import assertions），Node 20.10+ / 现代 bundler 支持——使用标准语法而非 rollup 插件私货，降低构建工具迁移成本。

---

### Q75: `utils/data-structures.ts` 里手写了 MinHeap / BoundedSet / CallbackQueue，为什么不用现成库？

三个数据结构的共性：专、零依赖。

- undedSet(1000)：S + FIFO 淘汰，30 行实现；
- nHeap：badcrumb 的时间堆，标准堆实现 60 行；
- llbackQueue：Ige 传输的回调注册表（`reportByImage(data, cbQueue)`），特定于传输场景。

不引库的理由：

1. 洁癖：S 对业务包体积有直接税负，为三个玩具级结构引入 `mnemonist` 之类（几十 KB）得不偿失；
2. 定制：BndedSet 的「淘汰最旧」、CallbackQueue 的「传输完成回调」都是特定语义，现成库反而需要适配层；
3. 赖降低供应链面：每赖都是 audit/升级/兼容的负担，核心路径上的数据结构自研可控。

反面也应承认：手写数据结构需要配套单测保证正确性（堆的 sift-up/down 边界），这是「自建 vs 引库」永恒的成本交换。判断标准：逻辑且语义简单 → 自建；算法复杂或与业务无关（如 pako 压缩）→ 引库。

---

### Q76: 代码里大量使用 `globalThis` 而不是 `window`，为什么？`"document" in globalThis` 这类检查防的是什么？

`globalThis` 是 ES2020 的统一全局对象引用，抹平 `window`（浏览器）/`global`（Node）/`self`（Worker）差异。SDK 用它而非 window 的理由：

1. 环境兼容：Vest/jsdom 环境的全局对象语义与浏览器有微妙差异，`globalThis` 写法在两边行为一致；
2. R/预渲染容错：Nt.js 等服务端渲染场景下 `window` 不存在，直接引用 `window` 会 ReferenceError；`"document" in globalThis`（如 `decorate-route.ts:9`）先探测再访问，让 SDK 在 SSR 阶段 import 不炸（init 本就不该在服务端调，但 import 时必须安全）；
3. b Worker 前瞻性：未支持 Worker 内监控，`globalThis` 代码无需改造。

这是库代码与应用代码的风格分野：应用可以假定运行环境，须防御一切环境。

---

### Q77: 装饰器工具 `decorateProp` 的实现要点是什么？直接赋值覆盖有什么坑？

`utils/decorate-prop.ts` 的抽象（签名推测）：`decorateProp(obj, prop, decorator)` 接收对象、属性名、包装函数（oldVal → newVal），返回 cleanup。

要点：

1. 原引用：包把 `oldPropVal` 存入闭包，cleanup 时精确恢复——多次 patch/cleanup 形成栈式结构；
2. 调用语义：包数内 `oldPropVal.call(this, ...)` 转发原始 this 与全部参数，返回值原样返回——对 XHR.open 这类有返回值的方法尤其重要；
3. 符问题：直`obj.prop = fn` 对 accessor（getter/setter）属性会触发 setter 而非替换，严格实现应用 `Object.getOwnPropertyDescriptor` 处理数据/访问器两种情况；原型链上的属性 patch 在实例上会创建 own property 遮蔽，cleanup 时要 `delete` 而非赋回原值——这些细节决定 patch 是否可逆。

直接赋值的典型坑（本 SDK 已规避的）：

- 不保存原函数 → 无法卸载；
- 箭头函数包装丢失 this → 方法调用崩溃；
- 恢复时把别的库后来的 patch 一并覆盖 → 链式 patch 被截断（Q8 的叠加竞争）。

---

### Q78: 如果让你为这个项目设计 CI/CD 质量门禁，会包含哪些环节？

基于项目现有 scripts 推导的完整门禁：

1. 层：`c --noEmit` 类型检查（strict）、ESLint（若有配置）、`attw`（are-the-types-wrong，验证双格式产物的类型解析正确性）、`publint`（包发布健全性检查）；
2. 层：`test run --coverage`，70% 阈值卡点，核心模块（reporter/decorates）单独设更高阈值；
3. 层：`llup -c` 产物构建 + 产物体积（bundlize/size-limit：核心包 gzip 后超阈值报警，防止依赖意外膨胀）；
4. 验证：`blint` + 在 fixture 项目（Vite/Webpack 各一）中实际安装构建产物并跑 smoke test——防止「构建成功但 exports 映射错误」的发布事故；
5. 层：cngesets 管理版本与 changelog、npm provenance（供应链溯源）、tag 触发自动发布。

现有项目已有 1-3 的基础，4-5 是成熟度进阶方向。

---

## 十二、安全与隐私

### Q79: 监控 SDK 可能采集到哪些敏感数据？这个项目提供了哪些脱敏机制？

敏感面盘点：

| 数据                  | 敏感风险                           |
| --------------------- | ---------------------------------- |
| URL（`url`/api 字段） | query 里的 token、订单号、手机号   |
| 请求/响应体           | 登录接口的密码、接口返回的个人信息 |
| 错误 message/stack    | 可能包含用户输入内容               |
| 录屏数据              | 页面上的一切，含输入框             |
| 指纹/IP               | 合规上的个人数据                   |

SDK 提供的机制：

1. eforeReportData` hook：单据入队前用户可改写——官方脱敏出口（正则擦除手机号/身份证/token）；
2. gnoreErrors`/`excludeApis`：源断——敏感接口（登录/支付）整体不采集；
3. nableFingerprint: false` 默认：指集显式开启；
4. seImageReport: false` 默认：Ige GET 会把数据暴露在 URL（代理/网关日志可见），默认关闭；
5. erId 不落盘：避久化身份被第三方脚本读取。

录屏的输入遮罩（rrweb mask 配置）是文档层面应强调的必选项。整体而言，「采集端最小化 + hook 可擦除 + 敏感能力默认关」三层都有了，但内置自动脱敏规则（如识别手机号格式擦除），依赖业务方自觉——这是可迭代点。

---

### Q80: 上报通道本身会被攻击或滥用吗？（DSN 泄露、伪造数据、刷量）

DSN 是明文嵌在前端代码里的，天然公开，攻击面：

1. 数据：任拿到 DSN 可 POST 任意构造的数据——污染统计、伪造错误淹没告警。缓解：服务端按 IP/UA/速率做异常检测，projectId + 签名（HMAC 按时间窗签名）提高伪造门槛；前端可加请求签名 hook（`beforePushEventList` 里注入签名头），但密钥在前端也是公开的，只能防脚本小子不防定向攻击。
2. /DoS 放大：恶本用 DSN 高频刷请求消耗服务端资源。服务端必须有限流（按 IP + projectId 维度），客户端 `cacheMaxLength` 批量机制天然限制了单客户端请求频率上限。
3. 缓存投毒：lalStorage 可被 XSS 写入伪造数据——读取时的 Zod schema 校验（Q50）挡住了结构非法的部分，语义伪造（结构合法的假错误）依赖服务端风控。

核心认知：监控的数据天然不可信，S 负责结构完整性，语义真实性必须服务端交叉验证（如 PV 与会话日志对账）。

---

### Q81: `console.error` 劫持和 response 克隆是否存在信息泄露到 SDK 自身的风险？

两个向内泄露的角度：

1. K debug 日志：`ntryLogger`（debug 模式彩色调试日志）会把上报数据打到控制台——生产环境若误开 `debug: true`，敏感数据（请求体、错误详情）暴露在控制台，被其他调试工具/录屏软件捕获。好在默认 `debug: false` 且该选项面向开发期。
2. 体进上报数据：`sponseData` 原样存储接口返回——若接口返回包含用户信息，错误时的 HTTP 事件就携带了这些信息。这是「监控可见性」与「数据最小化」的固有张力，当前依赖 `excludeApis` + hook 治理，没有字段级自动脱敏。

另外 `res.clone().text()` 把响应体读进内存增加了敏感数据在内存中的驻留时间与副本数——对极高安全场景（金融），可考虑配置「不采集响应体」开关（当前需在 hook 里删除字段）。

---

### Q82: 如果业务方在欧洲有用户（GDPR），接入这个 SDK 要注意什么？

合规检查清单：

1. ：`ableFingerprint` 默认关——保持关闭，除非已有合法依据（consent）；
2. ：`tIPs` 是可选 API，不自动调用——被动收集的客户端 IP（服务端天然可见）与主动采集的 WebRTC IP 在 GDPR 下都属个人数据，需在隐私政策披露；
3. viceId/anonymousId 持久化：lalStorage 写入属「设备存储访问」，ePrivacy 指令要求非必要存储需用户同意——严格场景下应在 consent 之后再 init SDK；
4. ：默罩输入框，且评估是否构成「系统性监控」；
5. 出境：D 指向的服务器位置、是否 SCC 合规；
6. 权：上据带 userId 后具备可识别性，需支持按 userId 删除的服务端流程。

SDK 侧已做的合规友好设计：指纹默认关、身份不落盘、hook 可擦除——但「consent 前不 init」的时序责任在业务方，文档应明确指引。

---

## 十三、开放设计与演进题

### Q83: 如果要求你为这个 SDK 设计「会话级错误关联」（把同一会话的所有事件串成一条轨迹），你会怎么改？

方案要点：

1. ssionId 贯通：`ils/session.ts` 已有 sessionStorage 级 sessionId——把它加入每条 `IReportData` 的公共字段（当前可能只在 baseData 部分路径），保证所有事件（错误/点击/请求/PV）携带同一会话键；
2. 序号：会维护单调递增序号（localStorage 计数或内存计数 + 会话起点时间戳），服务端按 `(sessionId, seq)` 排序还原精确时序——客户端时钟在多 tab 间不可靠，序号比 timestamp 更稳；
3. 边界定义：3分钟无活动切新会话（分析惯例），sessionStorage 的天然生命周期（标签页关闭）作为硬边界；
4. 端聚合：按essionId 做流式聚合（Flink/ClickHouse session window），产出「会话时间轴」视图：PV → 点击 → API 500 → 错误 → 路由离开；
5. 一致性：会采样决策粘性化（Q55），保证被采会话的数据完整——否则轨迹断章。

改动集中在 `get-base-data.ts`（加字段）+ 会话管理模块（序号/边界），对现有管道零侵入——这正是「分层架构」的红利。

---

### Q84: 前端监控的「黄金指标」你会选哪些？这个项目的数据能支撑吗？

参照 Google SRE 四黄金信号在前端的映射：

| 黄金信号             | 前端指标                                   | 本项目支撑                                       |
| -------------------- | ------------------------------------------ | ------------------------------------------------ |
| 延迟（Latency）      | LCP、FSP、API elapsedTime P95、TTFB        | ✅ perf.ts / first-screen-paint.ts / handle-http |
| 流量（Traffic）      | PV、会话数、API 调用量                     | ✅ pv-lifecycle / HTTP 监控                      |
| 错误（Errors）       | JS 错误率（错误数/PV）、API 5xx 率、白屏率 | ✅ 全部内置                                      |
| 饱和度（Saturation） | Long Task 总时长、内存占用、INP            | ✅ performance 插件                              |

能支撑，缺的是聚合——原始事件全量上报，指标计算在服务端。这符合主流架构（端上算力贵、口径变更难），但需要服务端有对应的流式聚合能力。若要在端上加一层（如「本页 API 错误率超阈值时主动上报告警事件」），可用 `traceCustomEvent` 实现端侧自告警——适合对告警延迟敏感的场景（服务端聚合有分钟级延迟）。

---

### Q85: 通读代码后，你认为最值得改进的三个技术点是什么？

1. 队列缺优先级（Q）：错误风暴时高频行为数据会挤占 `maxQueueLength` 名额，低频发高价值错误可能被 FIFO 淘汰。改进：分双队列（错误/其他）或按 type 加权淘汰，错误永远最后被淘汰。

2. e errorHandler 覆盖式赋值（Q）：`app.config.errorHandler = ...` 直接替换业务已有 handler。改进：保存旧 handler 链式调用（同 `onpopstate` 的 `oldOnpopstate` 模式），保持「只增强、不截断」的集成伦理。

3. 无会话粘性 + 无类型分流（Q）：`Math.random()` 按事件独立采样，会话数据七零八落；错误与性能数据同率采样不合理。改进：会话初始化时按 `tracesSampleRate` 掷一次骰子存入 session，全会话一致；配置升级为 `{ error: 1, performance: 0.1, behavior: 0.5 }` 的类型分级。

次级提名：fetch 对 Request 实例入参的元数据缺失（Q46-4）、`crypto.randomUUID` 在 reporter 里无兜底（Q57）、SSE 响应整体缓冲（Q46-1）。

---

### Q86: 微前端（qiankun/Module Federation）场景下，这个 SDK 会面临什么挑战？

1. 例冲突：主用各自打包 SDK → 两份 monkey-patch 叠加（fetch 被包两层），事件重复上报。`globalThis.__sentry__` 单例检测（Q3）是现成防线——前提是主子应用共享同一个 window（qiankun 默认沙箱是 proxy window，`globalThis` 可能被代理隔离，需验证快照沙箱/legacy 沙箱下的行为）。
2. 归属：主统一管理 history，子应用路由变化触发的是主应用的 pushState——PV 数据需要 `projectId` 区分子应用视角，或在子应用沙箱内各自 init 不同 projectId。
3. 归因：子的错误冒泡到主应用 window，filename 指向子应用 bundle——按 URL 前缀（子应用资源路径）可归因，配合 sourcemap 分应用还原。
4. 隔离：子卸载时其 SDK 实例必须 destroy（微前端生命周期钩子 `unmount` 里调用），否则 observer/timer 泄漏——这正是 `destroy()` 完整性的价值场景（Q52）。

---

### Q87: 如果上报数据量翻 10 倍（接入全公司项目），SDK 侧要做什么准备？

客户端侧的扩容准备（服务端扩容另说）：

1. 体系升级：按/项目的分级采样（Q85-3），支持服务端下发采样配置（动态调整，不发版）——需要 SDK 增加「配置拉取」通道；
2. 压缩：批JSON 的 gzip（pako 已在依赖里，录屏在用）——body 超 10KB 时 `Content-Encoding: gzip`，文本 JSON 压缩率通常 70%+；
3. 瘦身：diceInfo 等不变字段从每条数据剥离，改为「会话首条携带 + 服务端按 sessionId 关联」，单条数据减重 30-50%；
4. 时机优化：批口按负载自适应（闲时短窗口保实时性，忙时长窗口降请求数）；
5. DSN 分片：客按 projectId 哈希分片到多个上报端点，水平分摊接入层压力。

原则：端是流量的第一调节阀——端扩容是被动的，客户端的采样/压缩/批量策略决定流量的形状。

---

### Q88: 设计一个「错误智能聚合」功能（服务端视角），客户端需要提供哪些数据支撑？

服务端把「同根错误」聚合成 issue（Sentry 的 grouping），客户端需保证：

1. 指纹字段：当`type-name-message-filename-line-col` 中，message 含动态内容（`"用户12345余额不足"`）会导致同错不同指纹。客户端可提供归一化 ssage（数字/UU/URL 占位符替换）作为独立字段，保留原文同时给出聚合键；
2. 的结构化：当stack 是原字符串。结构化 frames（`[{function, file, line, column, inApp}]`）让服务端按「Top N 应用帧」聚合（比 message 稳健得多）——需要端上解析 stack 字符串（各浏览器格式不同，tracekit 式解析）；
3. ntext 标签：rease 版本（sdkVersion 已有雏形）、路由、环境——聚合后按维度下钻；
4. /breadcrumb 关联键：事id + sessionId，聚合 issue 后可取代表样本的现场。

分工哲学：端上做「轻归一化」（正则占位替换、stack 分行），重聚合逻辑（相似度、聚类）必须在服务端——口径迭代不需要端上发版。

---

### Q89: 面试官：「你说用了 pub/sub 解耦，那如果我要在 handler 里做异步操作（比如上报前先查 IndexedDB），这个架构怎么支持？」

当前 bus 是派发——ub` 的 for 循环不等待 handler 的 Promise（`bus.ts:12-18` 无 await）。handler 里做异步操作有三种合规姿势：

1. re-and-forget：hdler 同步返回，异步在内部自行展开（`void (async () => { ... })()`）——`handleCodeError` 的 `batchErrorManager.push` 就是变相的异步化（setTimeout 延迟 flush）。适合「异步结果不阻塞事件流」的场景。
2. 暂存 + 二次上报：hdler 同步把事件暂存，异步操作（查 IDB）完成后直接调 `reporter.send(enrichedData)`——不经过 bus 回程，因为 reporter 才是数据终点，bus 的职责（分发）在同步阶段已完成。
3. porter 层的 Promise 兼容：`taReporter.send` 对 hook 返回值做了 `isPromise` 处理（`reporter/index.ts:143-144`）——异步性是reporter 层被显式建模的，这是设计者意分层：事件分发（bus）保持同步确定性，数据加工（hook/reporter）支持异步。

如果真要 bus 级异步（等待所有 handler 完成再继续），代价是 `pub` 变成 async 会让装饰层（如 fetch patch 的同步返回路径）被迫等待——破坏「采集不影响业务」的原则。所以 bus + 异步 reporter 是正确的能力分配，面讲清「为什么 bus 不该支持 await」比给出 await 方案更显功力。

---

### Q90: 最后用一分钟向面试官推销这个项目，你会怎么总结技术亮点？

「这是一个生产级前端监控 SDK 的完整实现，三个层面体现工程深度：

性工程——传输降级（sendBeacon/Image/fetch）+ localStorage 离线缓存 + 服务端恢复探测 + 并发临界区保护，数据在弱网、断网、服务端宕机、页面卸载四类极端场景下都有明确的兜底路径；

自觉——者自身不能成为性能问题：白屏采样走 requestIdleCallback、FSP 观察器空闲启动、批量聚合抑制错误风暴、行为数据全链路限流，每个采集点都考虑过自身开销；

成熟度——b/sub 解耦采集与处理、插件系统隔离重能力（rrweb 不进核心包）、7 个子路径导出实现框架按需引入、Zod 在所有信任边界做运行时校验、destroy 可完整卸载。同时我清楚它的边界：队列无优先级、采样无会话粘性、Vue handler 覆盖问题——改进方向已在规划中。」

---

## 附录：速查表

### 核心文件索引

| 主题      | 文件                                    |
| --------- | --------------------------------------- |
| 生命周期  | `src/core/sdk-lifecycle.ts`             |
| 事件编排  | `src/core/setup.ts`                     |
| 事件总线  | `src/core/bus.ts`                       |
| HTTP 劫持 | `src/core/decorate-http.ts`             |
| 路由劫持  | `src/core/decorate-route.ts`            |
| 错误分发  | `src/core/handle-error.ts`              |
| 错误聚合  | `src/core/handle-code-error.ts`         |
| 白屏检测  | `src/core/white-screen.ts`              |
| PV/停留   | `src/core/pv-lifecycle.ts`              |
| 上报器    | `src/reporter/index.ts`                 |
| 传输层    | `src/reporter/transports.ts`            |
| 离线缓存  | `src/reporter/offline-cache.ts`         |
| 恢复探测  | `src/reporter/server-recovery.ts`       |
| 全局单例  | `src/utils/sentry.ts`                   |
| 默认配置  | `src/constants/index.ts`                |
| 性能插件  | `src/plugins/performance/index.ts`      |
| 曝光插件  | `src/plugins/exposure/index.ts`         |
| 录屏插件  | `src/plugins/screen-record/recorder.ts` |

### 关键默认参数速查

| 参数                        | 默认值                  | 含义               |
| --------------------------- | ----------------------- | ------------------ |
| `cacheMaxLength`            | 10                      | 批量条数阈值       |
| `cacheWaitingTime`          | 2000ms                  | 批量时间窗口       |
| `maxQueueLength`            | 200                     | 队列/离线缓存上限  |
| `retryIntervalMilliseconds` | 60000ms                 | 服务端恢复探测间隔 |
| `tracesSampleRate`          | 1                       | 采样率             |
| `maxBreadcrumbs`            | 30                      | 面包屑容量         |
| `screenRecordDurationMs`    | 3000ms                  | 录屏回溯窗口       |
| 白屏采样                    | 18 点 / 1s / 最多 10 次 | 网格十字线         |
| 错误聚合                    | 2s 防抖 / 组内 ≥5 合并  | BatchErrorManager  |
| 停留时长下限                | 100ms                   | PageDwell 过滤     |
| beacon / image 上限         | 60KB / 2KB              | 传输选择阈值       |
