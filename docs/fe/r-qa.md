# 面试回答 - 杭天铖

## 目录

- 一、技能相关问题
  - [1.1 React Fiber 架构](#11-react-fiber-架构)
  - [1.2 React 性能优化 Hooks](#12-react-性能优化-hooks)
  - [1.3 虚拟滚动](#13-虚拟滚动)
  - [1.4 SWR 数据请求策略](#14-swr-数据请求策略)
  - [1.5 Zod 类型校验](#15-zod-类型校验)
  - [1.6 Vue3 响应式原理](#16-vue3-响应式原理)
  - [1.7 Go 后端开发](#17-go-后端开发)
  - [1.8 模块联邦](#18-模块联邦)
  - [1.9 Agent 开发](#19-agent-开发)
  - [1.10 Node.js 性能调优](#110-nodejs-性能调优)
- 二、工作经历相关问题
  - [2.1 字节 TikTok Performance - 数据架构](#21-字节-tiktok-performance---数据架构)
  - [2.2 字节 TikTok Performance - BFF 层设计](#22-字节-tiktok-performance---bff-层设计)
  - [2.3 腾讯 IEG - React 组件迁移](#23-腾讯-ieg---react-组件迁移)
  - [2.4 腾讯 IEG - 数据竞争排查](#24-腾讯-ieg---数据竞争排查)
  - [2.5 腾讯 IEG - TCP 连接池与 ffi-napi 调用 C++ .so](#25-腾讯-ieg---tcp-连接池与-ffi-napi-调用-c-so)
  - [2.6 腾讯 IEG - Node.js 与 C++ 互操作](#26-腾讯-ieg---nodejs-与-c-互操作)
  - [2.7 字节 Data-架构 - JSError LLM 自动修复](#27-字节-data-架构---jserror-llm-自动修复)
  - [2.8 字节 Data-架构 - A2UI React 框架](#28-字节-data-架构---a2ui-react-框架)
  - [2.9 阿里巴巴 - Server & Schema-Driven UI](#29-阿里巴巴---server--schema-driven-ui)
  - [2.10 阿里巴巴 - 模块联邦开源贡献](#210-阿里巴巴---模块联邦开源贡献)

---

## 一、技能相关问题

### 1.1 React Fiber 架构

Fiber 的设计动机源于 React 15 的 Stack Reconciler 的致命缺陷: 递归的 diff 过程是同步且不可中断的，当组件树非常深时，reconciliation 会长时间占用主线程，导致动画卡顿、用户输入无响应。

Fiber 的核心思想是将渲染工作拆分为可暂停、可恢复的小单元 (即 Fiber 节点)。每个 Fiber 节点本质上是一个 JavaScript 对象，包含以下关键字段:

- type: 组件类型 (函数组件、类组件或原生标签)
- stateNode: 对应的 DOM 节点或类组件实例
- child / sibling / return: 构成链表的三个指针，替代了原来的递归调用栈
- pendingProps / memoizedProps / memoizedState: 新旧 props 和 state
- effectTag / effects: 标记需要执行的 DOM 操作 (插入、更新、删除)
- lanes: 优先级标记，用于调度

Fiber 链表结构使得 reconciliation 可以像协程一样工作: 处理完一个 Fiber 节点后，检查是否还有剩余时间 (通过 requestIdleCallback 的思路，实际用 Scheduler 包的 MessageChannel 实现)，如果有就继续处理下一个节点，没有就让出主线程。这就是可中断渲染的实现。

任务优先级调度通过 Lane 模型实现，不同优先级 (如用户输入 > 动画 > 数据请求) 被编码为不同的 lane bit，高优先级任务可以打断低优先级任务的渲染。React 18 的 Concurrent Features (useTransition, useDeferredValue) 就是基于这个调度模型实现的。

需要注意的是，Fiber 架构分为两个阶段: render 阶段 (可中断，纯计算，无副作用) 和 commit 阶段 (不可中断，执行 DOM 操作)。这也是为什么 render 阶段的生命周期 (如 componentWillMount) 会被多次调用，所以 React 16 引入了 getDerivedStateFromProps 等静态方法来替代。

### 1.2 React 性能优化 Hooks

useMemo、useCallback、React.memo 三者的核心区别:

- useMemo: 缓存计算结果值。当依赖不变时，直接返回缓存值，避免重复计算。适用于复杂的过滤、排序、聚合等操作。
- useCallback: 缓存函数引用。当依赖不变时，返回同一个函数引用。主要用于避免子组件因为父组件每次渲染都创建新函数引用而导致的不必要重渲染。
- React.memo: 对组件进行浅比较 memoization。当 props 没有变化时，跳过组件的重新渲染。相当于类组件中的 PureComponent。

使用这些优化反而会导致性能下降的场景:

1. 简单计算加 useMemo: 比较开销 > 重新计算开销。比如 useMemo(() => a + b, [a, b]) 完全是浪费，因为加法比浅比较还快。
2. useCallback 包裹不传给子组件的函数: 如果函数只在当前组件内使用 (如事件处理器直接绑在 JSX 上)，useCallback 没有任何收益。
3. React.memo 包裹频繁变化的组件: 如果 props 几乎每次都变，memo 的浅比较就是额外开销。
4. 大量使用 useCallback/useMemo 导致闭包过多: 可能影响 GC，增加内存占用。

在腾讯 IEG 项目中，我的判断策略是: 先不优化，用 React DevTools Profiler 找到实际的重渲染瓶颈，再针对性地添加 memo 优化。比如一个数据表格组件，每次筛选条件变化导致整个表格重渲染，这时才对表格组件加 React.memo，对筛选回调加 useCallback。

### 1.3 虚拟滚动

虚拟滚动的核心原理是: 只渲染可视区域内的列表项，而非全部列表项。实现上需要维护一个外层容器 (高度等于总列表高度，用于产生滚动条) 和一个内层容器 (通过 transform: translateY 定位到正确位置)，只渲染 startIndex 到 endIndex 之间的元素。

关键计算:

1. 根据 scrollTop 和 itemHeight 计算 startIndex = Math.floor(scrollTop / itemHeight)
2. endIndex = startIndex + Math.ceil(viewportHeight / itemHeight)
3. 通常前后各预留 buffer 数量的元素，防止快速滚动白屏

动态高度处理方案:

- 预估高度 + 实际测量: 给每个 item 一个预估高度，渲染后通过 ResizeObserver 或 getBoundingClientRect 获取真实高度，更新缓存的位置映射表。
- 维护一个 heights 数组或 Map，记录每个 index 对应的实际高度和累计偏移量。
- 滚动时根据缓存的实际高度计算 startIndex，而不是简单除以固定高度。

快速滚动白屏的解决:

1. 增大 buffer 区域 (前后多渲染一些元素)
2. 使用 requestAnimationFrame 节流滚动事件处理
3. 使用 will-change: transform 开启 GPU 加速
4. 对列表项做 content-visibility: auto 优化

我的实现和 react-window 的区别: react-window 为了极致的包体积做了很多简化 (如不支持动态高度的便捷 API)，我的实现更贴合业务需求，支持了动态高度、横向滚动、无限加载等特性。react-virtualized 功能更全但包体积大 (约 40KB gzip)，我的实现控制在 5KB 以内。

### 1.4 SWR 数据请求策略

SWR 的 stale-while-revalidate 策略源自 HTTP 缓存规范，核心思想是: 优先使用缓存数据 (stale)，同时发起后台请求验证 (revalidate)，如果数据有更新则重新渲染。

工作流程:

1. 组件挂载时，先检查缓存。如果有缓存，立即返回缓存数据 (用户无感知延迟)
2. 同时发起 fetcher 请求，获取最新数据
3. 请求完成后，对比新旧数据，如果有变化则更新缓存并触发重渲染
4. 后续组件再次挂载时 (如路由来回切换)，直接命中缓存

SWR vs React Query 的区别:

- SWR 更轻量 (约 4KB gzip vs React Query 约 15KB)，API 更简洁
- React Query 功能更丰富: 内置 infinite query、mutation、queryClient 管理等
- SWR 更专注于数据获取和缓存，React Query 是完整的服务端状态管理方案
- 在字节的项目中，团队选择了 SWR 主要是因为项目本身数据请求模式相对简单，不需要 React Query 的 mutation 和复杂缓存管理

我在字节 Data-架构部门的使用方式:

- 缓存: 利用 SWR 的 deduplication 特性，多个组件请求同一 key 时只发一次请求
- 轮询: refreshInterval 配置定时刷新，用于 Debug 平台的实时数据展示
- 条件请求: 利用 key 函数的返回值 (null 表示不请求) 实现依赖请求 (如先获取用户 ID 再请求用户详情)
- focus revalidation: 用户切回页面时自动刷新数据
- 乐观更新: mutate(key, data, false) 实现乐观 UI，失败时回滚

### 1.5 Zod 类型校验

Zod 和 TypeScript 类型系统是互补的关系: TypeScript 提供编译时类型检查，但在运行时类型信息会被擦除; Zod 在运行时提供 schema 校验，同时通过 TypeScript 的泛型和条件类型推导出对应的静态类型。

运行时校验和类型推导统一的实现原理:

```typescript
const UserSchema = z.object({
  name: z.string(),
  age: z.number().min(0),
  email: z.string().email(),
});

// 自动推导出 TypeScript 类型
type User = z.infer<typeof UserSchema>;
// 等价于: { name: string; age: number; email: string }

// 运行时校验
const result = UserSchema.safeParse(unknownData);
if (result.success) {
  // result.data 的类型自动收窄为 User
}
```

Zod 通过链式 API 构建 schema，每个 Zod 类型 (ZodString, ZodNumber 等) 都携带了对应的 TypeScript 类型信息。z.infer 利用 infer 关键字从 ZodType 的泛型参数中提取出类型。

在项目中的实际使用:

1. API 数据校验: 后端返回的 JSON 数据在 BFF 层或前端入口用 Zod schema 校验，防止后端接口变更导致前端静默出错
2. 表单校验: Zod schema 直接用于表单校验逻辑，结合 react-hook-form 的 zodResolver
3. 环境变量校验: 用 Zod 校验 process.env，确保运行环境配置正确
4. 配置文件校验: 项目配置文件 (如 Agent 的工具参数定义) 用 Zod 做 schema 校验

### 1.6 Vue3 响应式原理

Vue3 的 Proxy 响应式相比 Vue2 的 Object.defineProperty 的改进:

1. 拦截能力更强: Proxy 可以拦截属性的新增、删除、数组索引修改、length 变化等操作，而 defineProperty 只能拦截已有属性的 get/set。这就是为什么 Vue2 需要 Vue.set/Vue.delete 而 Vue3 不需要。
2. 惰性代理: Vue3 只在属性被访问时才递归地将子对象转为响应式 (通过 get 拦截器中的 reactive 调用)，而 Vue2 在初始化时就递归遍历所有属性，对于大型对象性能更好。
3. 支持 Map、Set、WeakMap、WeakSet 等集合类型。

reactive 和 ref 的区别:

- reactive: 接收一个对象，返回该对象的深层响应式代理。不能用于基本类型 (因为 Proxy 只能代理对象)。解构会丢失响应性。
- ref: 可以包装任意类型的值，返回一个 { value: T } 对象。在模板中使用时自动解包。适用于基本类型和需要整体替换的场景。

依赖收集流程 (effect、track、trigger):

1. effect 函数: 创建一个响应式副作用。调用 effect(fn) 时，会先设置 activeEffect = fn，然后执行 fn。fn 执行过程中会触发响应式对象的 get 拦截器。

2. track (依赖收集): 在 get 拦截器中，如果当前存在 activeEffect，就将这个 effect 添加到 target -> key -> deps 的映射中 (一个 WeakMap 结构)。这就完成了 "这个 effect 依赖了 target 的 key 属性" 的记录。

3. trigger (触发更新): 在 set 拦截器中，根据 target 和 key 找到所有依赖的 effects，遍历执行它们。如果 effect 是组件的渲染函数，就触发组件重渲染; 如果是 computed，就标记为 dirty。

Vue3 还引入了 effectScope 来统一管理 effect 的生命周期，组件卸载时可以一次性清理所有关联的 effect。

### 1.7 Go 后端开发

GMP 调度模型:

- G (Goroutine): 用户态的轻量级线程，初始栈仅 2KB (可动态扩缩)。一个 goroutine 的创建和销毁开销远小于 OS 线程。
- M (Machine): 对应一个操作系统线程，由操作系统调度。
- P (Processor): 逻辑处理器，数量默认等于 CPU 核心数 (GOMAXPROCS)。每个 P 维护一个本地 goroutine 队列 (Local Run Queue)。

调度流程: M 必须绑定一个 P 才能执行 G。M 从绑定的 P 的本地队列取出 G 执行; 本地队列为空时从全局队列 (Global Run Queue) 或其他 P 的本地队列偷取 (work stealing)。这种设计避免了全局锁竞争，实现了高效的 M:N 调度。

channel 在底层维护了一个带锁的环形缓冲区和两个等待队列 (发送者队列、接收者队列)。当 channel 满时发送者阻塞，当 channel 空时接收者阻塞，由 runtime 负责在数据到达时唤醒对应的 goroutine。

Kitex 是字节开源的高性能 RPC 框架，支持 Thrift 和 gRPC 协议。Thrift 协议序列化原理: 基于 IDL (Interface Definition Language) 定义数据结构和服务接口，Thrift 编译器生成对应的序列化/反序列化代码。序列化格式有 Binary (紧凑二进制)、Compact (更紧凑) 等。Kitex 在 Go 侧用 kitex-gen 生成 Go 代码，我同时在字节的工作中编写脚本将 Thrift IDL 编译为 TypeScript 类型定义，生成 npm 包供 BFF 层 (Nest.js) 使用，实现了前后端类型共享。

具体工作流: Thrift IDL 文件 -> thrift-typescript 工具生成 TS 类型 -> 发布到内部 npm registry -> BFF 层 import 使用。当 IDL 变更时通过 CI 自动触发重新生成和发布。

### 1.8 模块联邦

Module Federation 核心概念:

- host (宿主): 消费远程模块的应用，在运行时加载并执行远程暴露的模块
- remote (远程): 暴露模块的应用，构建时生成 remoteEntry.js 作为模块入口
- shared (共享依赖): host 和 remote 之间共享的依赖 (如 React、lodash)，避免重复加载。通过版本范围 (semver) 协商使用哪个版本的共享依赖

Webpack 模块联邦 vs Vite 模块联邦的核心差异:

1. 构建产物: Webpack 将远程模块打包成 chunk 文件; Vite 基于 ESM，远程模块可以直接以 ES Module 形式暴露
2. 加载方式: Webpack 通过 script 标签加载 remoteEntry.js，内部用 webpack runtime 解析依赖; Vite 通过 dynamic import() 加载 ES Module
3. 共享依赖处理: Webpack 在运行时通过 shared scope 做版本协商; Vite 利用 ESM 的 import map 或 runtime 注入来实现
4. 开发体验: Vite 的模块联邦在 dev server 下也能工作 (不需要构建)，而 Webpack 需要完整的构建流程

共享依赖版本冲突处理: 通过 shared 配置中的 requiredVersion 和 singleton 选项。singleton: true 强制只加载一份 (通常用于 React，因为多实例会导致 hooks 报错)。版本不兼容时在控制台输出警告并降级加载。

远程模块加载失败处理: 给 remote 加载加 error boundary，加载失败时展示 fallback UI。可以配合 retry 机制 (加载失败后重试一次或切换到备用 remote URL)。

我在阿里巴巴的具体贡献是给 @module-federation/vite 提 PR，处理 Vite 环境下 ESM 模块联邦的一些 edge case，比如 CSS 资源的加载路径问题和 dev 模式下的 HMR 兼容性。

### 1.9 Agent 开发

ReAct (Reasoning and Acting) 范式:

ReAct 的核心是让 LLM 交替进行推理 (Thought) 和行动 (Action)，而不是直接生成最终答案。一次循环:

1. Thought: LLM 分析当前状态，思考下一步该做什么
2. Action: LLM 决定调用哪个工具，传入什么参数
3. Observation: 工具执行结果反馈给 LLM
4. 重复直到 LLM 认为任务完成，输出最终结果

Agent Loop 和简单 LLM 调用链的本质区别:

- 调用链是预定义的: A -> B -> C，每一步做什么、调用什么工具是硬编码的
- Agent Loop 是 LLM 自主决策的: 每一步调用什么工具、传什么参数由 LLM 根据上下文动态决定，循环次数也不确定
- Agent Loop 有错误恢复能力: 工具调用失败后，LLM 能看到错误信息并尝试其他方案
- Agent Loop 有条件终止: 由 LLM 判断任务是否完成，而不是固定步骤数

MCP (Model Context Protocol) 解决的问题:

- 标准化: MCP 定义了 LLM 与外部工具/数据源之间的标准通信协议，解决了工具接入碎片化的问题
- 动态发现: MCP server 在连接时声明自己提供的工具列表 (tools)、资源 (resources) 和提示模板 (prompts)，client 可以动态发现并注册
- 解耦: Agent 不需要硬编码工具实现，只需要作为 MCP client 连接到任意 MCP server 就能获得新能力
- 安全隔离: MCP server 运行在独立进程中，与 Agent 通过 JSON-RPC 通信，天然隔离了权限

我的 swifty-cli 实现了完整的 MCP client，通过 stdio 或 SSE 与 MCP server 通信，支持工具发现、调用、结果处理。

### 1.10 Node.js 性能调优

v8 隐藏类 (Hidden Class / Map) 原理:

v8 为每个 JavaScript 对象维护一个隐藏的 "形状" 描述 (内部叫 Map)。当多个对象具有相同的属性添加顺序和类型时，它们共享同一个隐藏类。v8 的 JIT 编译器 (TurboFan) 基于隐藏类生成优化的机器码: 如果知道对象的隐藏类，就可以直接通过固定偏移量访问属性，而不需要哈希查找。

利用隐藏类的关键点:

1. 属性添加顺序必须一致: 始终按相同顺序初始化属性
2. 不要在运行时动态添加或删除属性 (会触发隐藏类转换或创建新的隐藏类)
3. 使用构造函数或 class 确保所有实例具有相同的初始化路径

在腾讯 IEG 项目中，我通过以下方式利用隐藏类:

- 所有数据对象在构造时一次性分配所有属性 (即使初始值为 null)
- 避免 delete 操作 (改用赋值 null)
- 对象池中的对象复用相同的隐藏类路径

对象池的作用: 频繁创建和销毁对象会导致 GC 压力。通过对象池，用完后归还对象 (重置属性值)，下次使用时从池中取出，减少了新生代 GC (Scavenge) 的频率。

内存泄漏排查:

- 使用 valgrind 排查 C++ .so 层的内存泄漏 (malloc 没有 free)
- Node.js 层使用 --inspect 配合 Chrome DevTools 的 Heap Snapshot 对比
- 常见泄漏场景: 未清理的事件监听器、闭包持有大对象引用、全局变量累积、定时器未清除
- 定位方法: 对比两次 Heap Snapshot 的 retained size 增长，找到增长最多的对象类型，追溯其引用链

---

## 二、工作经历相关问题

### 2.1 字节 TikTok Performance - 数据架构

选择 ClickHouse 的原因:

终端设备性能数据是典型的时序分析场景，特点是: 写入量大 (大量设备持续上报)、查询以聚合分析为主 (如 P50/P99 延迟、按设备型号/地区/时间段分组统计)。

ClickHouse vs MySQL 的适用场景区别:

- ClickHouse: 列式存储，适合 OLAP (分析型查询)，单表查询性能极高，支持向量化执行，压缩率高。但不支持事务、JOIN 性能较差、更新删除代价高。
- MySQL: 行式存储，适合 OLTP (事务型操作)，支持复杂查询、JOIN、事务。但在大规模聚合分析上性能远不如 ClickHouse。

在我们的场景中，性能数据一旦写入基本不修改，查询主要是时间范围聚合，非常适合 ClickHouse。

多层缓存设计:

1. L1: 前端本地缓存 (Zustand store + 过期时间)，避免切换页面重新请求
2. L2: BFF 层内存缓存 (Node.js 进程内的 LRU cache)，热点数据命中率高
3. L3: Redis 分布式缓存，BFF 多实例之间共享
4. 穿透到 ClickHouse / MySQL

缓存一致性保证:

- 性能数据是历史数据，基本不会变化，所以一致性问题不严重
- 对于可能更新的聚合数据，采用 cache-aside 模式: 数据变更时删除缓存而非更新缓存
- Redis 缓存设置合理的 TTL (如 5 分钟)，到期自动失效
- BFF 内存缓存 TTL 更短 (如 30 秒)，保证快速更新

### 2.2 字节 TikTok Performance - BFF 层设计

BFF 层数据清洗具体做的事情:

1. 数据聚合: 后端 RPC 返回的是原始设备数据，BFF 将其聚合为前端图表需要的格式 (如按时间维度聚合为折线图数据点)
2. 字段裁剪: 后端返回的字段可能很多，BFF 只保留前端需要的字段，减少传输体积
3. 格式转换: 将 Thrift 格式的数据转为前端友好的 JSON 格式，包括枚举值转可读文本、时间戳格式化等
4. 数据补全: 某些场景需要调用多个 RPC 方法，将结果合并后返回给前端

为什么需要独立 BFF 层:

1. 协议转换: 前端通过 HTTP/JSON 通信，后端使用 Thrift RPC (二进制协议)，BFF 承担协议转换的角色
2. 数据适配: 后端 API 是通用的，不同前端 (Web/App) 需要的数据格式不同，BFF 做定制化适配
3. 聚合请求: 一个前端页面可能需要调用多个后端接口，BFF 将多次调用合并为一次 HTTP 请求，减少前端请求数
4. 安全隔离: 前端不直接暴露后端接口地址和协议细节

优缺点:

- 优点: 前后端解耦、前端请求数减少、可以做 BFF 层缓存和限流、团队独立迭代
- 缺点: 增加一层网络跳转 (延迟增加)、BFF 维护成本、数据一致性问题、需要 BFF 层的监控和告警

### 2.3 腾讯 IEG - React 组件迁移

迁移过程中的主要挑战:

1. 生命周期映射:
   - componentDidMount / componentDidUpdate -> useEffect (需要注意依赖数组的精确控制)
   - componentWillUnmount -> useEffect 的 cleanup 函数
   - getDerivedStateFromProps -> 直接用 state 计算或在 render 中计算 (大部分场景不需要 state)
   - shouldComponentUpdate -> React.memo + useMemo/useCallback

2. 状态管理重构:
   - 类组件的 this.state / this.setState 替换为 useState，需要注意的是 setState 是合并更新而 useState 的 setter 是替换更新
   - 复杂的关联状态考虑 useReducer 替代多个 useState
   - 实例变量 (this.xxx) 迁移到 useRef

3. 事件处理和 this 绑定:
   - 类组件中需要 bind 或箭头函数，函数组件中不存在 this 问题，代码更简洁
   - 但需要注意闭包陷阱: 函数组件中 useCallback/useEffect 可能捕获到过期的 state

4. HOC 和 ref 转发:
   - 类组件的 HOC 可能依赖实例方法 (如 this.getData())，迁移后需要改用 forwardRef + useImperativeHandle

向后兼容性保证:

- 渐进式迁移: 先迁移低风险、独立的组件，再迁移核心组件
- 功能测试: 每个组件迁移后做完整的功能回归测试
- 灰度发布: 迁移后的组件先在内部测试环境验证，再逐步放量
- 回滚机制: 保留旧组件代码，通过 feature flag 控制使用新组件还是旧组件

### 2.4 腾讯 IEG - 数据竞争排查

问题现象: 腾讯 NoSQL 数据库管理系统的某个数据表格页面，当用户在筛选条件之间快速切换时，表格展示的数据与当前选中的筛选条件不匹配。比如用户先选择了条件 A，又快速切换到条件 B，但表格最终展示的是条件 A 的数据。

定位过程:

1. 首先怀疑是后端问题，但通过抓包发现请求参数是正确的 (条件 B)，响应数据也是条件 B 的，说明问题在前端
2. 排查 React 组件代码，发现问题出在 useEffect 中:
   - useEffect 根据筛选条件发起异步请求
   - 条件 A 的请求因为网络波动响应慢，条件 B 的请求响应快
   - 条件 A 的响应后到，覆盖了条件 B 的数据
3. 另一个闭包问题: useEffect 的依赖数组中漏掉了某个条件变量，导致 effect 使用了过期的闭包值

解决方案:

1. 请求竞态处理: 在 useEffect 中维护一个 abort flag
   - 请求发起前 isCancelled = false
   - cleanup 函数中 isCancelled = true
   - 响应回调中检查 isCancelled，如果为 true 则忽略响应
   - 也可以使用 AbortController 直接取消请求

2. 闭包陷阱修复: 仔细审查 useEffect 的依赖数组，确保所有外部变量都被正确声明为依赖。配合 eslint-plugin-react-hooks 的 exhaustive-deps 规则做静态检查。

3. 长期方案: 引入 SWR 或 React Query，它们内置了请求竞态处理 (只使用最新请求的结果)。

### 2.5 腾讯 IEG - TCP 连接池与 ffi-napi 调用 C++ .so

TCP 连接池设计要点:

1. 最大连接数: 根据下游服务的承载能力设置上限，避免连接数过多压垮下游。通过配置化管理。
2. 最小空闲连接: 保持一定数量的空闲连接，减少连接建立的延迟 (TCP 三次握手 + TLS 握手)
3. 空闲回收: 超过一定时间 (如 60s) 没有使用的连接自动关闭，释放资源
4. 心跳检测: 定期对空闲连接发送心跳包，检测连接是否还活着，及时清理死连接
5. 连接复用: 长连接复用，避免频繁创建和销毁连接
6. 健康检查: 连接失败时自动重试，如果连续失败则将连接标记为不可用

ffi-napi 调用 C++ .so 的架构:

- 通过 ffi-napi 库在 Node.js 进程内直接加载 C++ .so 动态链接库
- 使用 ffi.Library() 声明 .so 中导出的 C 函数签名 (参数类型、返回类型)
- Node.js 直接调用这些函数进行加解密和表文件解析，无需进程间通信
- 数据传递通过 Buffer (ffi-napi 可以将 Node.js Buffer 映射为 C 的指针)

为什么选择 ffi-napi 而不是 N-API addon:

1. 无源码: .so 是第三方提供的预编译二进制库，没有源码，无法编写 N-API addon 的 C++ 包装层。ffi-napi 只需要知道函数签名即可调用，不需要修改 .so 的任何代码。
2. 开发效率: 不需要编写和编译 C++ addon，纯 JavaScript 即可完成对接。
3. 灵活性: 函数签名在运行时声明，可以动态加载不同的 .so 文件，适合需要对接多个第三方库的场景。

ffi-napi 的风险与应对:

1. 稳定性: .so 内部 segfault 会导致 Node.js 进程直接崩溃。应对方式是对调用加 try-catch (捕获可恢复的错误)，对不可恢复的 segfault 通过进程管理器 (PM2 / systemd) 自动重启。
2. 内存管理: ffi-napi 分配的 Buffer 需要手动管理生命周期，防止内存泄漏。配合对象池复用 Buffer，减少频繁分配和释放。
3. 类型安全: ffi-napi 的类型声明是运行时字符串，没有编译期检查。通过封装 TypeScript 类型层，在上层提供类型安全的调用接口。

### 2.6 腾讯 IEG - Node.js 与 C++ 互操作

Node.js 调用 C++ .so 动态链接库有几种方式:

1. N-API (Node-API): 编写 C++ addon，需要 .so 的源码或编写包装层。性能最好 (直接函数调用，零序列化开销)，但 .so 崩溃会导致 Node.js 崩溃。需要 C++ 编译环境。
2. FFI (ffi-napi): 在 JavaScript 中声明 C 函数签名，运行时动态加载 .so 并调用。不需要 .so 源码，不需要编译 C++ addon，但有 FFI 调用开销 (参数 marshalling / unmarshalling)。
3. child_process: 启动 C++ 子进程，通过 IPC 通信。稳定性最好 (进程隔离)，但有 IPC 序列化开销和架构复杂度。

我们选择 ffi-napi 的原因:

1. .so 是第三方预编译的二进制库，没有源码，无法编写 N-API addon
2. 加解密和表文件解析的调用频率高，child_process 的 IPC 序列化开销不可接受
3. ffi-napi 开发效率高，纯 JavaScript 对接，不需要维护 C++ 编译工具链

ffi-napi 的使用细节:

```typescript
import ffi from "ffi-napi";
import ref from "ref-napi";

const libcrypto = ffi.Library("./libcrypto.so", {
  encrypt: ["int", ["pointer", "int", "pointer", "int", "pointer"]],
  decrypt: ["int", ["pointer", "int", "pointer", "int", "pointer"]],
  parse_table: ["int", ["string", "pointer", "int"]],
});

// Node.js Buffer 作为 C 指针传递
const inputBuf = Buffer.from(plaintext);
const outputBuf = Buffer.alloc(outputSize);
const ret = libcrypto.encrypt(
  inputBuf,
  inputBuf.length,
  outputBuf,
  outputBuf.length,
  keyBuf,
);
```

踩过的坑:

1. 内存泄漏: ffi-napi 通过 ref-napi 分配的 Buffer 不会被 V8 GC 自动回收 (因为引用关系对 GC 不可见)，需要手动管理。我们维护了对象池复用 Buffer，避免频繁分配。
2. 类型对齐: C 结构体的内存布局需要考虑对齐 (alignment)，ref-struct-napi 可以处理，但嵌套结构体容易出错。
3. 回调函数: .so 中有异步接口需要传入 C 函数指针作为回调。ffi-napi 支持通过 ffi.Callback 创建，但回调函数在 C 侧被调用时如果抛出异常会导致进程崩溃，必须在回调内部做完整的错误处理。
4. valgrind 排查: Node.js 进程加载 .so 后，用 valgrind --tool=massif 分析堆内存使用，用 valgrind --leak-check=full 检测 .so 层的 malloc/free 不匹配。

### 2.7 字节 Data-架构 - JSError LLM 自动修复

系统工作流程:

1. JSError 采集: 前端监控 SDK 捕获 JSError，上报错误信息 (错误消息、堆栈、用户行为、页面 URL、浏览器信息)

2. 上下文信息提取:
   - 通过 Source Map 还原压缩后的堆栈，定位到源码文件和行号
   - 拉取出错位置的源码上下文 (前后各 20 行)
   - 提取出错组件的 React 组件树信息
   - 收集用户行为 trace (最近 10 次点击、路由跳转)
   - 获取相关的 TypeScript 类型定义

3. Prompt 构造:
   - System Prompt: 描述角色 (高级前端工程师)、任务 (修复 JSError)、约束 (最小改动、不改变业务逻辑)
   - 错误信息: 错误类型、消息、还原后的堆栈
   - 源码上下文: 出错文件的相关代码
   - 类型信息: 相关的接口和类型定义
   - 修复要求: 输出格式 (仅输出修改后的代码片段 + 修改说明)

4. LLM 修复: 调用大模型 (如豆包) 生成修复方案

5. 修复验证:
   - 静态检查: 修复后的代码通过 TypeScript 编译检查
   - 单元测试: 运行相关的单元测试
   - Code Review: 生成修复 PR，由开发者 review 后合并

实际收益:

- 自动修复率在简单场景 (如空值访问、类型不匹配) 下较高，复杂业务逻辑错误仍需人工处理
- 减少了 oncall 同学的低级 bug 修复时间，让开发者更专注于复杂问题
- 形成了错误模式知识库，相似的错误可以复用修复策略

### 2.8 字节 Data-架构 - A2UI React 框架

A2UI (Agent to UI) 的核心概念: 让 AI Agent 能够动态生成和操控 UI 组件。传统的 Server-Driven UI 是后端返回 JSON Schema，前端根据 Schema 渲染固定的 UI 结构。A2UI 在此基础上引入了 Agent 的能力:

1. Agent 可以根据用户的自然语言指令动态生成 UI 结构
2. Agent 可以调用预定义的 UI 组件作为 "工具"，组合出复杂的界面
3. Agent 可以根据运行时数据动态调整 UI 布局和交互方式

和传统 Server-Driven UI 的区别:

- Server-Driven UI: 后端静态配置 -> 前端固定渲染，变化需要改后端配置
- A2UI: Agent 动态决策 -> 前端渲染，可以响应用户意图和实时数据

在搜索推荐算法平台的应用: 算法工程师可以通过自然语言描述需要的调试界面，Agent 自动生成对应的参数配置面板、结果展示图表等组件。

在抖音 Debug 平台的应用: 开发者描述需要调试的场景，Agent 自动生成包含相关日志、指标、链路追踪信息的 Debug 面板。

### 2.9 阿里巴巴 - Server & Schema-Driven UI

Schema-Driven UI 的定义: 前端 UI 的结构和行为由服务端下发的 Schema (通常是 JSON) 驱动，前端不需要硬编码页面布局，而是实现一个 Schema 解析引擎。

Schema 的定义和解析:

- Schema 通常包含: 组件类型 (type)、属性 (props)、子节点 (children)、数据绑定 (dataBinding)、事件处理 (events)、条件渲染 (condition) 等字段
- 前端实现一个 Schema Renderer，递归解析 Schema 树，将每个节点映射为对应的 React 组件
- 数据绑定通过 JSONPath 或类似语法关联后端数据

在广告投放场景的优势:

1. 快速迭代: 运营可以通过修改 Schema 调整广告展示样式，不需要前端发版
2. A/B 测试: 不同的 Schema 对应不同的 UI 方案，方便做实验
3. 多端复用: 同一份 Schema 可以被 Web、App、小程序各自的 Renderer 解析
4. 个性化: 根据用户画像下发不同的 Schema，实现千人千面

处理复杂交互和自定义组件:

- Schema 中支持声明式的事件绑定 (如 onClick -> action)，action 包括: 跳转、弹窗、API 调用等预定义动作
- 对于 Schema 无法表达的复杂交互，支持自定义组件注册: 开发者在 Renderer 中注册自定义组件，Schema 中通过 type 引用
- 极端复杂场景下支持 "逃生舱" (escape hatch): Schema 中嵌入自定义代码片段

### 2.10 阿里巴巴 - 模块联邦开源贡献

我的具体贡献:

- 给 @module-federation/vite 提交了多个 PR，主要涉及:
  1. Vite dev server 模式下远程模块的 HMR (Hot Module Replacement) 兼容性修复
  2. CSS 资源在 ESM 模块联邦场景下的加载路径处理
  3. shared 依赖的版本协商在 Vite 环境下的边界情况修复

Webpack 和 Vite 模块联邦的核心差异:

1. 模块系统: Webpack 基于自己的模块运行时 (webpack_require)，模块联邦在其之上扩展; Vite 基于浏览器原生 ESM，模块联邦需要利用 ESM 的 dynamic import

2. 构建产物: Webpack 输出经过 bundle 的 JS chunk; Vite 的 dev 模式不做 bundle，直接输出单个 ES Module 文件。模块联邦在 Vite dev 模式下需要处理大量小模块的加载问题

3. 共享依赖: Webpack 通过 runtime 的 shared scope 实现; Vite 需要通过 import map 或手动构建 shared bundle

4. 开发体验: Vite 的优势在于 dev 模式下不需要构建就能使用模块联邦，但这也带来了 ESM 特有的一些问题 (如循环依赖、模块解析顺序)

技术挑战:

- Vite 的 ESM 模式下，模块的加载是异步且并行的，shared 依赖的版本协商时序比 Webpack 复杂
- CSS 在 ESM 中没有标准的导入方式 (import css 不是 ESM 规范的一部分)，需要特殊处理
- Vite 的 optimizeDeps (预构建) 和模块联邦的 shared 机制需要协调

---
