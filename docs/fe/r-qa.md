# 面试回答 - 杭天铖

## 目录

- 一、技能相关问题
  - [1.1 React Fiber 架构](#_1-1-react-fiber-架构)
  - [1.2 React 性能优化 Hooks](#_1-2-react-性能优化-hooks)
  - [1.3 虚拟滚动](#_1-3-虚拟滚动)
  - [1.4 SWR 数据请求策略](#_1-4-swr-数据请求策略)
  - [1.5 Zod 类型校验](#_1-5-zod-类型校验)
  - [1.6 Vue3 响应式原理](#_1-6-vue3-响应式原理)
  - [1.7 Go 后端开发](#_1-7-go-后端开发)
  - [1.8 模块联邦](#_1-8-模块联邦)
  - [1.9 Agent 开发](#_1-9-agent-开发)
  - [1.10 Node.js 性能调优](#_1-10-node-js-性能调优)
  - [1.11 Event Loop 微任务与宏任务](#_1-11-event-loop-微任务与宏任务)
  - [1.12 Vite vs Webpack](#_1-12-vite-vs-webpack)
  - [1.13 CSS 模块化方案](#_1-13-css-模块化方案)
  - [1.14 前端性能优化](#_1-14-前端性能优化)
  - [1.15 Zustand vs Redux](#_1-15-zustand-vs-redux)
  - [1.16 Go goroutine vs Node Event Loop](#_1-16-go-goroutine-vs-node-event-loop)
- 二、工作经历相关问题
  - [2.1 字节 TikTok Performance - 数据架构](#_2-1-字节-tiktok-performance-数据架构)
  - [2.2 字节 TikTok Performance - BFF 层设计](#_2-2-字节-tiktok-performance-bff-层设计)
  - [2.3 腾讯 IEG - React 组件迁移](#_2-3-腾讯-ieg-react-组件迁移)
  - [2.4 腾讯 IEG - 数据竞争排查](#_2-4-腾讯-ieg-数据竞争排查)
  - [2.5 腾讯 IEG - TCP 连接池与进程池调用 C++ .so](#_2-5-腾讯-ieg-tcp-连接池与进程池调用-c-so)
  - [2.6 腾讯 IEG - Node.js 与 C++ 互操作](#_2-6-腾讯-ieg-node-js-与-c-互操作)
  - [2.7 字节 Data-架构 - JSError LLM 自动修复](#_2-7-字节-data-架构-jserror-llm-自动修复)
  - [2.8 字节 Data-架构 - A2UI React 框架](#_2-8-字节-data-架构-a2ui-react-框架)
  - [2.9 阿里巴巴 - Server & Schema-Driven UI](#_2-9-阿里巴巴-server-schema-driven-ui)
  - [2.10 阿里巴巴 - 模块联邦开源贡献](#_2-10-阿里巴巴-模块联邦开源贡献)
- 三、项目深挖 - Sentry SDK
  - [3.1 JSError 还原故障现场](#_3-1-jserror-还原故障现场)
  - [3.2 rrweb 屏幕录制原理与性能代价](#_3-2-rrweb-屏幕录制原理与性能代价)
  - [3.3 白屏检测关键点采样](#_3-3-白屏检测关键点采样)
  - [3.4 三级降级上报策略](#_3-4-三级降级上报策略)
- 四、项目深挖 - CLI Coding Agent
  - [4.1 ReAct 范式实现](#_4-1-react-范式实现)
  - [4.2 上下文压缩与会话持久化](#_4-2-上下文压缩与会话持久化)
- 五、系统设计题
  - [5.1 设计一个大规模前端灰度发布系统](#_5-1-设计一个大规模前端灰度发布系统)
  - [5.2 设计一个高性能实时数据大屏](#_5-2-设计一个高性能实时数据大屏)
  - [5.3 设计一个 Agent 开发平台的前端架构](#_5-3-设计一个-agent-开发平台的前端架构)

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

Fiber 节点完整数据结构:

```typescript
interface FiberNode {
  // 节点类型与标识
  tag: WorkTag; // FunctionComponent=0, ClassComponent=1, HostComponent=5
  key: null | string;
  elementType: any;
  type: any;
  stateNode: any; // 类组件实例 / DOM 节点 / FiberRoot

  // 树结构 (链表)
  return: Fiber | null; // 父节点
  child: Fiber | null; // 第一个子节点
  sibling: Fiber | null; // 下一个兄弟节点
  index: number;

  // 双缓冲
  alternate: Fiber | null; // 指向另一棵 Fiber 树上对应的节点

  // 工作单元状态
  pendingProps: any;
  memoizedProps: any;
  memoizedState: any; // 函数组件中是 hooks 链表
  updateQueue: any;

  // 副作用
  flags: Flags; // Placement, Update, Deletion, Ref
  subtreeFlags: Flags;
  deletions: Fiber[] | null;

  // 调度优先级
  lanes: Lanes;
  childLanes: Lanes;

  ref: mixed;
  refCleanup: mixed;
}
```

Fiber 链表结构使得 reconciliation 可以像协程一样工作: 处理完一个 Fiber 节点后，检查是否还有剩余时间 (通过 Scheduler 包的 MessageChannel 实现)，如果有就继续处理下一个节点，没有就让出主线程。这就是可中断渲染的实现。

双缓冲机制: React 维护两棵 Fiber 树: current (当前显示) 和 workInProgress (正在构建)。更新时在 workInProgress 上计算，完成后交换指针 (commit)，实现无缝切换。

Render 阶段与 Commit 阶段:

Render 阶段 (可中断):

- beginWork: 从根节点开始深度优先遍历，对比新旧 props (Diff)，计算副作用标记
- completeWork: 从叶子节点向上回溯，创建/更新 DOM 节点 (但不实际挂载)，收集副作用

Commit 阶段 (不可中断):

1. Before Mutation: 执行 getSnapshotBeforeUpdate
2. Mutation: 执行 DOM 操作 (增删改)、调用 useInsertionEffect
3. Layout: 执行 useLayoutEffect、更新 ref、调用 componentDidMount/componentDidUpdate

Render 可中断是因为只做纯计算无副作用; Commit 不可中断是因为操作真实 DOM，中断会导致 UI 不一致。

任务优先级调度通过 Lane 模型实现:

```
优先级车道 (从高到低):
  SyncLane (1)              <- 用户同步操作 (如 onClick)
  InputContinuousLane (4)   <- 连续输入 (如拖拽)
  DefaultLane (16)          <- 普通 setState
  TransitionLane (多种)     <- 过渡更新 (useTransition)
  IdleLane (最高位)         <- 空闲时执行
```

高优先级更新可以打断低优先级任务的渲染。React 18 的 Concurrent Features (useTransition, useDeferredValue) 就是基于这个调度模型实现的。

时间切片调度器实现: React 不依赖 requestIdleCallback (Safari 不支持、触发频率不稳定)，而是自己实现了 scheduler 包:

- 使用 MessageChannel (降级为 setTimeout) 实现宏任务调度
- 维护一个最小堆 (按过期时间排序的任务队列)
- 使用 performance.now() 跟踪已用时间，每执行完一个任务检查是否超过时间片 (默认 5ms)
- 超过则将控制权让给浏览器，保证稳定的 5ms 时间切片

Concurrent Mode 下 setState 的打断与恢复:

1. 用户调用 setState，React 创建 Update 对象加入 Fiber 节点的 updateQueue
2. 开始 Render 阶段，从根节点 beginWork 向下遍历
3. 遍历到一半时，更高优先级的更新到来
4. React 放弃当前正在构建的 workInProgress 树，不提交任何副作用
5. 优先处理高优先级更新，完整执行 Render + Commit
6. 高优先级更新完成后，重新开始低优先级的 Render (从头 beginWork，但可复用未变化的 Fiber 节点)

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

项目中的性能优化实践:

```typescript
// useTransition: 将非紧急更新标记为 transition 优先级
function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value); // 高优先级: 输入框立即响应
    startTransition(() => {
      setResults(searchExpensive(e.target.value)); // 低优先级: 可被中断
    });
  };
}

// useDeferredValue: 延迟更新
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

### 1.3 虚拟滚动

虚拟滚动的核心原理是: 只渲染可视区域内的列表项，而非全部列表项。实现上需要维护一个外层容器 (高度等于总列表高度，用于产生滚动条) 和一个内层容器 (通过 transform: translateY 定位到正确位置)，只渲染 startIndex 到 endIndex 之间的元素。

关键计算:

1. 根据 scrollTop 和 itemHeight 计算 startIndex = Math.floor(scrollTop / itemHeight)
2. endIndex = startIndex + Math.ceil(viewportHeight / itemHeight)
3. 通常前后各预留 buffer 数量的元素，防止快速滚动白屏

```typescript
interface VirtualScrollConfig {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

function useVirtualScroll(config: VirtualScrollConfig) {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.floor(scrollTop / config.itemHeight);
  const endIndex = Math.min(
    config.itemCount,
    startIndex + Math.ceil(config.containerHeight / config.itemHeight) + (config.overscan || 5),
  );

  const offsetY = startIndex * config.itemHeight;
  const visibleItems = items.slice(startIndex, endIndex);

  return { startIndex, endIndex, visibleItems, offsetY };
}
```

动态高度处理方案:

```typescript
const heightCache = new Map<number, number>();

function getItemHeight(index: number): number {
  return heightCache.get(index) || ESTIMATED_HEIGHT;
}

function getTotalHeight(): number {
  let total = 0;
  for (let i = 0; i < itemCount; i++) {
    total += getItemHeight(i);
  }
  return total;
}

// 渲染后更新实际高度
function measureItem(index: number, height: number) {
  heightCache.set(index, height);
  forceUpdate();
}
```

- 预估高度 + 实际测量: 给每个 item 一个预估高度，渲染后通过 ResizeObserver 或 getBoundingClientRect 获取真实高度，更新缓存的位置映射表。
- 维护一个 heights 数组或 Map，记录每个 index 对应的实际高度和累计偏移量。
- 滚动时根据缓存的实际高度计算 startIndex，而不是简单除以固定高度。

快速滚动白屏的解决:

1. 增大 buffer 区域 (前后多渲染一些元素)
2. 使用 requestAnimationFrame 节流滚动事件处理
3. 使用 will-change: transform 开启 GPU 加速
4. 对列表项做 content-visibility: auto 优化

性能优化:

1. 二分查找: 动态高度场景下，使用二分查找快速定位 scrollTop 对应的 startIndex，时间复杂度 O(log n)
2. 稳定 key: key 使用数据的唯一 ID 而非数组索引，保证滚动复用时组件状态不错乱
3. Web Worker 计算: 将高度计算和索引查找放到 Worker 线程，避免阻塞主线程

我的实现和 react-window 的区别: react-window 为了极致的包体积做了很多简化 (如不支持动态高度的便捷 API)，我的实现更贴合业务需求，支持了动态高度、横向滚动、无限加载等特性。react-virtualized 功能更全但包体积大 (约 40KB gzip)，我的实现控制在 5KB 以内。

实测性能: 10 万条数据，首屏渲染从 8 秒降至 200ms，滚动 FPS 从 15 提升至 58，内存占用从 800MB 降至 50MB。

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

```typescript
// 预请求 (Preload): 用户 hover 列表项时预请求详情页数据
function AlgorithmList({ algorithms }: { algorithms: Algorithm[] }) {
  const preload = (id: string) => {
    const key = `/api/algorithm/${id}`;
    if (!cache.has(key)) {
      mutate(key, fetcher(key), false);
    }
  };

  return (
    <ul>
      {algorithms.map(algo => (
        <li key={algo.id} onMouseEnter={() => preload(algo.id)}>
          <Link to={`/algorithm/${algo.id}`}>{algo.name}</Link>
        </li>
      ))}
    </ul>
  );
}

// 乐观更新 (Optimistic Update)
function ToggleFavorite({ algorithmId, isFavorite }: Props) {
  const { mutate } = useSWRConfig();

  const toggle = async () => {
    mutate(`/api/algorithm/${algorithmId}`, (current) => ({
      ...current,
      isFavorite: !isFavorite
    }), false);

    try {
      await api.toggleFavorite(algorithmId);
    } catch (err) {
      mutate(`/api/algorithm/${algorithmId}`); // 失败回滚
      toast.error('操作失败，请重试');
    }
  };

  return <Button onClick={toggle}>{isFavorite ? '取消收藏' : '收藏'}</Button>;
}
```

性能效果:

- 首屏加载时间: 从 3.2s 降至 1.4s (缓存命中)
- 页面切换延迟: 从 800ms 降至 100ms (预请求)
- 用户操作响应: 从 500ms 降至 50ms (乐观更新)
- 网络请求数: 减少约 60% (去重 + 缓存)

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

```typescript
// 环境变量校验
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
});

const env = EnvSchema.parse(process.env);

// 自定义校验: 跨字段校验
const LoginFormSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
  })
  .refine((data) => data.password !== "12345678", { message: "密码过于简单", path: ["password"] });

// 序列化处理
const EventSchema = z.object({
  name: z.string(),
  date: z.preprocess((val) => (typeof val === "string" ? new Date(val) : val), z.date()),
});
```

最佳实践:

1. Schema 单一数据源: 用 Zod Schema 作为唯一数据源，通过 z.infer 推导类型，避免手动维护类型和校验逻辑的同步
2. safeParse vs parse: 生产环境使用 safeParse (返回 Result 类型)，避免未捕获的异常
3. 自定义校验: 使用 .refine() 和 .superRefine() 实现跨字段校验
4. 序列化/反序列化: 使用 z.preprocess() 处理 JSON 序列化导致的类型变化

### 1.6 Vue3 响应式原理

Vue3 的 Proxy 响应式相比 Vue2 的 Object.defineProperty 的改进:

1. 拦截能力更强: Proxy 可以拦截属性的新增、删除、数组索引修改、length 变化等操作，而 defineProperty 只能拦截已有属性的 get/set。这就是为什么 Vue2 需要 Vue.set/Vue.delete 而 Vue3 不需要。
2. 惰性代理: Vue3 只在属性被访问时才递归地将子对象转为响应式 (通过 get 拦截器中的 reactive 调用)，而 Vue2 在初始化时就递归遍历所有属性，对于大型对象性能更好。
3. 支持 Map、Set、WeakMap、WeakSet 等集合类型。

reactive 和 ref 的区别:

- reactive: 接收一个对象，返回该对象的深层响应式代理。不能用于基本类型 (因为 Proxy 只能代理对象)。解构会丢失响应性。
- ref: 可以包装任意类型的值，返回一个 { value: T } 对象。在模板中使用时自动解包。适用于基本类型和需要整体替换的场景。

ref 需要 .value 的原因: 原始类型 (如 number) 不是对象，无法使用 Proxy。.value 的 getter/setter 是唯一能拦截读写操作的方式。

依赖收集流程 (effect、track、trigger):

```javascript
const targetMap = new WeakMap(); // target -> Map(key -> Set<effect>)
let activeEffect = null;

function reactive(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      track(target, key);
      const result = Reflect.get(target, key, receiver);
      if (isObject(result)) return reactive(result); // 惰性深度代理
      return result;
    },
    set(target, key, value, receiver) {
      const oldValue = target[key];
      const result = Reflect.set(target, key, value, receiver);
      if (oldValue !== value) trigger(target, key);
      return result;
    },
    deleteProperty(target, key) {
      const result = Reflect.deleteProperty(target, key);
      trigger(target, key);
      return result;
    },
  });
}

function track(target, key) {
  if (!activeEffect) return;
  let depsMap = targetMap.get(target);
  if (!depsMap) targetMap.set(target, (depsMap = new Map()));
  let dep = depsMap.get(key);
  if (!dep) depsMap.set(key, (dep = new Set()));
  dep.add(activeEffect);
}

function trigger(target, key) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;
  const dep = depsMap.get(key);
  if (dep) {
    const effects = new Set(dep);
    effects.forEach((effect) => {
      if (effect.scheduler) effect.scheduler(effect);
      else effect();
    });
  }
}
```

effect、computed、watch 三者关系:

- effect: 最基础的响应式副作用。effect(fn) 会立即执行 fn，执行过程中访问的响应式数据会自动收集依赖。
- computed: 基于 effect 的惰性求值实现。内部创建一个 effect 标记为 dirty，只有读取 .value 时才执行计算，依赖没变化则返回缓存值。
- watch: 基于 effect 的变化监听实现。依赖变化时执行回调函数 (而非重新执行 getter)。

shallowRef 与 shallowReactive:

- shallowRef: 只有 .value 的赋值是响应式的，内部属性变化不触发更新。适用于大对象 (如 Echarts 配置项)。
- shallowReactive: 只有第一层属性是响应式的。适用于列表数据，只需检测增删不需检测每条数据内部变化。

循环引用处理: Vue3 内部维护 reactiveMap: WeakMap<object, Proxy> 缓存已代理的对象，访问时发现已缓存则直接返回，不会无限递归。

Vue3 还引入了 effectScope 来统一管理 effect 的生命周期，组件卸载时可以一次性清理所有关联的 effect。

### 1.7 Go 后端开发

GMP 调度模型:

- G (Goroutine): 用户态的轻量级线程，初始栈仅 2KB (可动态扩缩)。一个 goroutine 的创建和销毁开销远小于 OS 线程。
- M (Machine): 对应一个操作系统线程，由操作系统调度。
- P (Processor): 逻辑处理器，数量默认等于 CPU 核心数 (GOMAXPROCS)。每个 P 维护一个本地 goroutine 队列 (Local Run Queue)。

调度流程: M 必须绑定一个 P 才能执行 G。M 从绑定的 P 的本地队列取出 G 执行; 本地队列为空时从全局队列 (Global Run Queue) 或其他 P 的本地队列偷取 (work stealing)。goroutine 遇到阻塞 (channel、syscall、sleep) 时，M 会解绑当前 G 并绑定新 G 继续执行，P 永远忙碌。

Goroutine 的轻量级体现在:

- 初始栈仅 2KB (可动态扩容)
- 创建/销毁开销 < 1us (OS 线程 ~1ms)
- 切换只涉及少量寄存器 (OS 线程需要保存完整上下文)
- 可以轻松创建 100 万个 goroutine

channel 在底层维护了一个带锁的环形缓冲区和两个等待队列 (发送者队列、接收者队列):

```go
type hchan struct {
    qcount   uint           // 队列中元素数量
    dataqsiz uint           // 环形队列容量
    buf      unsafe.Pointer // 环形队列缓冲区
    elemsize uint16         // 元素大小
    closed   uint32         // 是否关闭
    sendx    uint           // 发送索引
    recvx    uint           // 接收索引
    sendq    waitq          // 阻塞的发送者队列
    recvq    waitq          // 阻塞的接收者队列
    lock     mutex          // 互斥锁
}
```

当 channel 满时发送者阻塞，当 channel 空时接收者阻塞，由 runtime 负责在数据到达时唤醒对应的 goroutine。

Kitex 是字节开源的高性能 RPC 框架，支持 Thrift 和 gRPC 协议。Thrift 协议序列化原理: 基于 IDL (Interface Definition Language) 定义数据结构和服务接口，Thrift 编译器生成对应的序列化/反序列化代码。序列化格式有 Binary (紧凑二进制)、Compact (更紧凑) 等。Kitex 在 Go 侧用 kitex-gen 生成 Go 代码，我同时在字节的工作中编写脚本将 Thrift IDL 编译为 TypeScript 类型定义，生成 npm 包供 BFF 层 (Nest.js) 使用，实现了前后端类型共享。

具体工作流: Thrift IDL 文件 -> thrift-typescript 工具生成 TS 类型 -> 发布到内部 npm registry -> BFF 层 import 使用。当 IDL 变更时通过 CI 自动触发重新生成和发布。

Kitex 使用自研的 Netpoll 网络库 (基于 epoll)，相比标准库 net 性能提升 30%+。Thrift 二进制协议比 JSON 序列化更快，体积小 30%~50%。实测单机 QPS 稳定在 5 万+，P99 延迟 < 5ms。

### 1.8 模块联邦

Module Federation 核心概念:

- host (宿主): 消费远程模块的应用，在运行时加载并执行远程暴露的模块
- remote (远程): 暴露模块的应用，构建时生成 remoteEntry.js 作为模块入口
- shared (共享依赖): host 和 remote 之间共享的依赖 (如 React、lodash)，避免重复加载。通过版本范围 (semver) 协商使用哪个版本的共享依赖

Webpack 模块联邦的编译产物与运行时加载:

Remote 端构建时生成 remoteEntry.js:

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
};

globalThis["myRemote"] = { get, init };
```

Host 端运行时加载流程:

```javascript
// 1. 动态加载 remoteEntry.js
await loadScript("https://cdn.example.com/remoteEntry.js");
// 2. 初始化共享依赖
await __webpack_init_sharing__("default");
// 3. 获取 remote 容器
const container = globalThis["myRemote"];
// 4. 初始化容器
await container.init(__webpack_share_scopes__.default);
// 5. 获取具体模块
const factory = await container.get("./Button");
const Button = factory();
```

Webpack 模块联邦 vs Vite 模块联邦的核心差异:

| 维度        | Webpack MF                        | Vite MF (@module-federation/vite) |
| ----------- | --------------------------------- | --------------------------------- |
| 构建模式    | 编译时将模块打包为 chunk          | 利用 ESM 原生模块，开发时不打包   |
| remoteEntry | 编译生成的 JS 文件                | 运行时动态生成的 ESM 入口         |
| 模块加载    | Webpack runtime 的 chunk 加载机制 | 原生 import() 动态导入            |
| Shared 依赖 | Webpack 的 sharing scope 机制     | 需要额外的运行时协调层            |
| 开发体验    | 需要完整构建                      | 即时 HMR，开发效率高              |

Vite 模块联邦不能复用 Webpack 实现的原因:

1. 无 Webpack Runtime: Vite 没有 Webpack 的 runtime (chunk loading、module registry)
2. ESM vs Bundle: Vite dev 模式使用原生 ESM，没有 "chunk" 概念
3. 依赖预构建: Vite 使用 esbuild 对 node_modules 进行预构建，shared 依赖的版本协商需要在预构建阶段介入
4. HMR 差异: Vite 的 HMR 基于 ESM 热更新，Webpack 基于 chunk 级别热更新

共享依赖版本冲突处理: 通过 shared 配置中的 requiredVersion 和 singleton 选项。singleton: true 强制只加载一份 (通常用于 React，因为多实例会导致 hooks 报错)。版本不兼容时在控制台输出警告并降级加载。

远程模块加载失败处理: 给 remote 加载加 error boundary，加载失败时展示 fallback UI。可以配合 retry 机制 (加载失败后重试一次或切换到备用 remote URL)。

我在阿里巴巴的具体贡献是给 @module-federation/vite 提 PR，核心是修复 dev 模式下远程模块 HMR 失效的问题，并优化了 shared 依赖的预构建逻辑 (合并 optimizeDeps 调用)，以及补充 runtime plugin 机制。

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

JS 对象的属性存储有两种模式:

1. 快属性 (Fast Properties): 属性存储在连续的线性数组中，通过隐藏类记录的偏移量直接访问，O(1)
2. 字典模式 (Dictionary Mode): 属性存储在哈希表中，适用于属性频繁增删的场景，访问速度较慢

Inline Cache 与隐藏类的配合:

1. 第一次访问 obj.x: 在隐藏类中查找属性 x 的偏移量，缓存 (隐藏类 -> 偏移量) 的映射
2. 后续访问: 直接检查对象的隐藏类是否匹配缓存，如果匹配则直接按偏移量读取 (monomorphic IC)
3. 如果 2-4 个隐藏类 (polymorphic IC): 依次检查每个隐藏类
4. 如果超过 4 个 (megamorphic IC): 退化为哈希表查找

利用隐藏类的关键点:

1. 属性添加顺序必须一致: 始终按相同顺序初始化属性
2. 不要在运行时动态添加或删除属性 (会触发隐藏类转换或创建新的隐藏类)
3. 使用构造函数或 class 确保所有实例具有相同的初始化路径

GC 分代与对象晋升:

Young Generation (新生代):

- 使用 Scavenge 算法 (Cheney 复制)，将存活对象从 From Space 复制到 To Space
- 容量小 (约 1-8MB)，GC 频繁但速度快
- 晋升条件: 存活两次 Scavenge; 或 To Space 使用率超过 25%

Old Generation (老生代):

- Mark-Sweep (标记清除) + Mark-Compact (标记整理)
- GC 频率低但耗时较长
- V8 使用 Incremental Marking 和 Concurrent Scavenging 减少 GC 停顿

在腾讯 IEG 项目中，我通过以下方式利用隐藏类:

- 所有数据对象在构造时一次性分配所有属性 (即使初始值为 null)
- 避免 delete 操作 (改用赋值 null)
- 对象池中的对象复用相同的隐藏类路径

对象池的作用: 频繁创建和销毁对象会导致 GC 压力。通过对象池，用完后归还对象 (重置属性值)，下次使用时从池中取出，减少了新生代 GC (Scavenge) 的频率。

```javascript
class ObjectPool {
  constructor(factory, reset, initialSize = 100) {
    this.factory = factory;
    this.reset = reset;
    this.pool = [];
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire() {
    return this.pool.length > 0 ? this.pool.pop() : this.factory();
  }

  release(obj) {
    this.reset(obj);
    this.pool.push(obj);
  }
}
```

性能效果: GC 暂停时间从平均 15ms 降低到 5ms，吞吐量提升约 20%。

验证方法: 使用 V8 的 --trace-ic 和 --trace-opt 标志观察内联缓存和 JIT 编译情况，使用 %HasFastProperties(obj) 验证对象是否具有快属性。

内存泄漏排查:

- 使用 valgrind 排查 C++ .so 层的内存泄漏 (malloc 没有 free)
- Node.js 层使用 --inspect 配合 Chrome DevTools 的 Heap Snapshot 对比
- 常见泄漏场景: 未清理的事件监听器、闭包持有大对象引用、全局变量累积、定时器未清除
- 定位方法: 对比两次 Heap Snapshot 的 retained size 增长，找到增长最多的对象类型，追溯其引用链

### 1.11 Event Loop 微任务与宏任务

Event Loop 是 JavaScript 并发模型的核心。

基本概念:

- 宏任务 (Macro Task): setTimeout、setInterval、I/O、UI Rendering、setImmediate (Node.js)
- 微任务 (Micro Task): Promise.then、MutationObserver、queueMicrotask、process.nextTick (Node.js)

执行顺序:

```javascript
console.log("1. Sync");

setTimeout(() => {
  console.log("2. Macro Task (setTimeout)");
}, 0);

Promise.resolve().then(() => {
  console.log("3. Micro Task (Promise)");
});

console.log("4. Sync");

// 输出顺序: 1, 4, 3, 2
```

Event Loop 流程:

1. 执行同步代码 (调用栈清空)
2. 检查微任务队列，依次执行所有微任务
3. 执行一个宏任务
4. 重复步骤 2-3

关键区别:

| 特性     | 微任务                               | 宏任务                      |
| -------- | ------------------------------------ | --------------------------- |
| 执行时机 | 当前宏任务结束后，下一个宏任务开始前 | 下一个 Event Loop 迭代      |
| 优先级   | 高                                   | 低                          |
| 队列数量 | 单队列                               | 多队列 (每种宏任务一个队列) |
| 典型场景 | Promise、DOM 变化监听                | 定时器、网络请求、用户事件  |

性能优化:

1. 避免微任务堆积: 大量微任务会阻塞渲染，应该分批执行或使用宏任务让出主线程
2. 长任务拆分: 使用 setTimeout 将长任务拆分为多个宏任务，避免阻塞 UI

```javascript
// Bad: 大量微任务阻塞渲染
for (let i = 0; i < 10000; i++) {
  Promise.resolve().then(() => heavyWork(i));
}

// Good: 使用宏任务分批执行
function processBatch(items, batchSize = 100) {
  const batch = items.splice(0, batchSize);
  batch.forEach((item) => heavyWork(item));
  if (items.length > 0) {
    setTimeout(() => processBatch(items, batchSize), 0);
  }
}
```

### 1.12 Vite vs Webpack

核心区别在于开发模式下的打包策略: Webpack 先打包再启动服务器，Vite 先启动服务器再按需编译。

Vite 快的原因:

1. 原生 ESM: 利用浏览器原生支持的 ES Modules，不做打包，每个模块作为独立的 HTTP 请求返回。冷启动是 O(1) -- 只处理入口文件，其他模块按需转译。

2. 预构建依赖: 使用 esbuild (Go 编写，比 JS 快 10-100 倍) 预构建第三方依赖，将 CommonJS/UMD 转为 ESM。预构建结果缓存在 node_modules/.vite，后续启动直接读取缓存。

3. HMR 不重新打包: 模块更新时，Vite 只需重新编译变更的模块，浏览器通过 ESM 动态 import 替换旧模块。Webpack HMR 需要遍历 affected modules。

Webpack 为什么慢:

1. 全量打包: 开发模式下也要打包所有模块，大型项目依赖图构建耗时
2. JS 性能瓶颈: Webpack 核心用 JS 编写，CPU 密集型任务性能受限
3. Loader 链式调用: 每个文件要经过多个 Loader 串行处理

生产环境对比: Vite 生产环境使用 Rollup 打包，两者差异不大。主要差异在开发体验。

选择建议:

| 场景         | 推荐            | 原因                       |
| ------------ | --------------- | -------------------------- |
| 新项目       | Vite            | 启动快、配置简单           |
| 大型遗留项目 | Webpack         | 生态成熟、插件丰富         |
| 微前端       | Webpack 5       | Module Federation 原生支持 |
| Library 开发 | Vite (lib mode) | 构建快、输出格式灵活       |

在阿里妈妈广告技术部，我推动团队从 Webpack 迁移到 Vite，开发服务器启动时间从 4 分钟降至 8 秒，HMR 响应时间从 2 秒降至 200ms。

### 1.13 CSS 模块化方案

主流方案有 5 种，各有适用场景:

1. CSS Modules: 构建时将类名哈希化，确保全局唯一。零运行时、类型安全、学习成本低。不支持动态样式。

2. CSS-in-JS (styled-components / Emotion): 动态样式、主题系统、自动前缀。有运行时开销 (~10KB)、SSR 需要额外配置。

3. Tailwind CSS (原子化): 零运行时、高度可定制、响应式设计内置。HTML 类名冗长、学习曲线。

4. CSS 预处理器 (Sass/Less): 变量、嵌套、Mixin 等强大特性。需要编译、全局作用域。

5. Vanilla Extract (零运行时 CSS-in-TS): TypeScript 类型安全、零运行时、构建时提取 CSS。配置复杂、生态较小。

对比总结:

| 方案            | 运行时 | 类型安全 | 动态样式 | Bundle Size | 学习曲线 |
| --------------- | ------ | -------- | -------- | ----------- | -------- |
| CSS Modules     | 无     | 可选     | 受限     | 最小        | 低       |
| CSS-in-JS       | 有     | 完全     | 完全     | +10KB       | 中       |
| Tailwind        | 无     | 无       | 受限     | 最小        | 中       |
| Sass/Less       | 无     | 无       | 无       | 中等        | 低       |
| Vanilla Extract | 无     | 完全     | 受限     | 最小        | 高       |

我的选择: 在腾讯 IEG 的项目中使用 CSS Modules + Sass; 在字节跳动的项目中使用 Semi Design 内置的 CSS-in-JS; 在个人项目中偏好 Tailwind CSS。

### 1.14 前端性能优化

前端性能优化分为 6 个维度:

维度 1: 网络优化

- 资源压缩: Gzip/Brotli 压缩，文本资源体积减少 70-80%
- CDN 加速: 静态资源分发到边缘节点，TTFB 从 200ms 降至 20ms
- 预加载/预连接: `<link rel="preload">` 提前加载关键资源
- HTTP/2 多路复用: 减少 TCP 连接数，避免队头阻塞

维度 2: 渲染优化

- 代码分割: React.lazy + Suspense 按需加载，首屏 JS 从 500KB 降至 120KB
- Tree Shaking: 移除未使用代码，Bundle Size 减少 30-50%
- 虚拟滚动: 10 万条列表渲染从 8 秒降至 200ms
- 骨架屏: FCP 时间从 2.5s 降至 0.3s

维度 3: 缓存优化

- Service Worker: 离线缓存、资源预缓存
- HTTP 缓存: Cache-Control: max-age=31536000, immutable (带 hash 的静态资源)
- SWR 策略: 先返回缓存，后台更新 (首屏 3.2s -> 1.4s)
- 多层缓存: L1 BFF 内存 + L2 Redis + L3 ClickHouse/MySQL

维度 4: 运行时优化

- Web Worker: CPU 密集计算移到 Worker 线程
- requestIdleCallback: 低优先级任务在浏览器空闲时执行
- 防抖/节流: 减少高频事件的处理频率
- 对象池: 复用频繁创建/销毁的对象，GC 暂停从 15ms 降至 5ms

维度 5: 构建优化

- Vite 迁移: 开发启动从 4 分钟降至 8 秒
- esbuild 预构建: 比 JS 快 100 倍
- 增量编译: Webpack 的 cache: { type: 'filesystem' }，二次构建快 5 倍
- 模块联邦: 共享依赖去重，首屏减少 30%

维度 6: 监控与分析

- Web Vitals: LCP、FCP、CLS、INP 实时监控
- Performance API: performance.measure() 标记关键路径
- Lighthouse CI: 每次 PR 自动跑分，低于阈值阻止合并

实际案例 (TikTok Performance 平台):

| 指标 | 优化前 | 优化后 | 优化手段                     |
| ---- | ------ | ------ | ---------------------------- |
| FCP  | 3.2s   | 0.8s   | 代码分割 + CDN + 预加载      |
| LCP  | 5.1s   | 1.2s   | 虚拟滚动 + 图片懒加载        |
| TTI  | 8.5s   | 2.1s   | Tree Shaking + 延迟非关键 JS |
| CLS  | 0.35   | 0.05   | 图片尺寸预留 + 字体预加载    |
| 内存 | 800MB  | 50MB   | 虚拟滚动 + 对象池            |

优化方法论:

1. 度量先行: 没有数据就没有优化，先建立性能基线
2. 抓大放小: 优先优化影响最大的瓶颈
3. 持续监控: 性能优化不是一次性的，需要持续监控和回归测试
4. 权衡取舍: 性能 vs 开发效率 vs 可维护性

### 1.15 Zustand vs Redux

Zustand vs Redux: Zustand 是极简状态管理 (1KB)，核心理念是 store 就是 JS 对象 + set/get 函数，没有 action/reducer/dispatch 的概念。

优势:

1. 零 boilerplate: 不需要写 action type、action creator、reducer switch、connect/useSelector
2. store 可在组件外使用: 直接 import store.getState()，Redux 必须在 Provider 包裹范围内
3. selector 内置: 用 useStore(state => state.count) 订阅局部状态，不触发无关 re-render
4. 中间件轻量: persist、devtools 都是一行代码

劣势: 没有 Redux Toolkit 的 createAsyncThunk 等异步方案、没有内置的 RTK Query 数据获取，大型项目缺乏结构约束。

useState vs useReducer:

- useState 适合独立、简单的状态 (boolean、string、number)
- useReducer 适合多个状态有关联的更新 (如表单有 10 个字段)
- useReducer 的 reducer 是纯函数，方便测试; dispatch 的 identity 稳定，作为 prop 传递不会触发子组件 re-render

### 1.16 Go goroutine vs Node Event Loop

Node 事件循环: 单线程，基于 libuv 的事件队列驱动。所有 I/O 操作通过 callback/Promise 异步执行，主线程只负责调度。CPU 密集型任务会阻塞事件循环，必须用 worker_threads 或 child_process 卸载。优点是编程模型简单 (无锁、无竞态)，缺点是单核利用率有限，水平扩展靠 cluster 多进程。

Go 调度器 (GMP 模型): goroutine 遇到阻塞时 M 会解绑当前 G 并绑定新 G 继续执行，P 永远忙碌。多核并行 -- 多个 P 各自拥有 goroutine 队列，可并行在不同 CPU 核心执行。

使用 Go 的场景:

1. 高并发网络服务 (RPC、网关)，每请求一 goroutine 模型简洁高效
2. CPU 密集型计算 (编解码、压缩)，多核并行
3. 需要强类型 + 高性能的 CLI 工具、基础设施组件

在 TikTok Performance 团队选 Go 是因为 Kafka consumer + Redis/ClickHouse 写入场景，goroutine 轻松管理数千并发连接，比 Node cluster 方案少了很多 IPC 开销和进程管理复杂度。

---

## 二、工作经历相关问题

### 2.1 字节 TikTok Performance - 数据架构

选择 ClickHouse 的原因:

终端设备性能数据是典型的时序分析场景，特点是: 写入量大 (大量设备持续上报)、查询以聚合分析为主 (如 P50/P99 延迟、按设备型号/地区/时间段分组统计)。日均处理约 2 亿条事件，峰值 QPS 约 5000。

Kafka 作为数据入口和缓冲层: 削峰 (前端流量有波峰波谷)、解耦 (生产者不关心下游有多少消费者)、持久化 (Kafka 自身有副本机制)。Kafka 配置: 12 个 partition (按 region hash 路由)，replication factor = 3，retention 7 天。Producer 使用 async 模式，batch size 1000 条，compression = lz4。

三层存储各司其职:

- Redis: 热数据缓存层，存放最新的聚合指标和实时告警阈值，读取延迟在毫秒级，供前端实时看板使用
- MySQL: 元数据存储，存放设备信息、用户配置、告警规则等结构化业务数据，数据量相对较小但需要强一致性
- ClickHouse: OLAP 分析引擎，承担海量性能数据的时序分析和多维聚合查询。使用 MergeTree 引擎，按 (date, region) 分区，(timestamp, node_id) 排序。关键优化: 使用 LowCardinality(String) 压缩枚举字段，使用 AggregateFunction 预聚合指标。查询性能: 单表 10 亿行，P99 查询延迟 < 500ms。

ClickHouse vs MySQL 的适用场景区别:

- ClickHouse: 列式存储，适合 OLAP，单表查询性能极高，支持向量化执行，压缩率高。但不支持事务、JOIN 性能较差、更新删除代价高。
- MySQL: 行式存储，适合 OLTP，支持复杂查询、JOIN、事务。但在大规模聚合分析上性能远不如 ClickHouse。

多层缓存设计:

1. L1: 前端本地缓存 (Zustand store + 过期时间) / BFF 进程内 LRU 缓存 (lru-cache, max 500 条, TTL 30s)，热门面板命中率约 60%
2. L2: Redis 分布式缓存 (TTL 5min)，全局命中率约 45%
3. L3: ClickHouse 物化视图预聚合，将原始查询的 P99 延迟从 2 秒降到 200ms
4. 穿透到 ClickHouse / MySQL

缓存一致性保证:

- 性能数据是历史数据，基本不会变化，一致性问题不严重
- 写操作采用 cache-aside 模式: 先更新数据库再删除缓存
- Redis 缓存设置合理的 TTL，到期自动失效
- 防击穿: 使用 singleflight 确保同一 key 的并发查询只穿透一次
- 防穿透: 对空值也缓存 (TTL 1 分钟)，使用布隆过滤器预检
- 防雪崩: TTL 加随机抖动 (+/-10%)，避免同时过期

监控告警: Consumer lag 超过 10 万条时触发告警，ClickHouse 查询延迟超过 2s 时自动扩容。整体系统可用性 99.95%，数据处理延迟 < 30 秒。

### 2.2 字节 TikTok Performance - BFF 层设计

BFF 层数据清洗具体做的事情:

1. 数据聚合: 后端 RPC 返回的是原始设备数据，BFF 将其聚合为前端图表需要的格式 (如按时间维度聚合为折线图数据点)
2. 字段裁剪: 后端返回的字段可能很多，BFF 只保留前端需要的字段，减少传输体积
3. 格式转换: 将 Thrift 格式的数据转为前端友好的 JSON 格式，包括枚举值转可读文本、时间戳格式化等
4. 数据补全: 某些场景需要调用多个 RPC 方法，将结果合并后返回给前端

Thrift IDL 生成 npm 包:

Thrift 生成的 JS/TS npm 包包含类型定义和序列化/反序列化方法。性能方面，Thrift 的二进制协议比 JSON 序列化体积小 30%-50%，反序列化速度也更快。IDL 变更的协同流程: 后端修改 IDL -> CI 自动重新生成 npm 包并发布到内部 registry -> BFF 层升级依赖版本 -> 前端同步更新类型引用。

为什么需要独立 BFF 层:

1. 协议转换: 前端通过 HTTP/JSON 通信，后端使用 Thrift RPC (二进制协议)
2. 数据适配: 后端 API 是通用的，不同前端需要的数据格式不同
3. 聚合请求: 一个前端页面可能需要调用多个后端接口，BFF 将多次调用合并为一次 HTTP 请求
4. 安全隔离: 前端不直接暴露后端接口地址和协议细节

优缺点:

- 优点: 前后端解耦、前端请求数减少、可以做 BFF 层缓存和限流、团队独立迭代
- 缺点: 增加一层网络跳转 (延迟增加)、BFF 维护成本、数据一致性问题、需要 BFF 层的监控和告警

### 2.3 腾讯 IEG - React 组件迁移

迁移过程中的主要挑战:

1. 生命周期映射:
   - componentDidMount / componentDidUpdate -> useEffect (需要注意依赖数组的精确控制)
   - componentWillUnmount -> useEffect 的 cleanup 函数
   - getDerivedStateFromProps -> 直接用 state 计算或在 render 中计算
   - shouldComponentUpdate -> React.memo + useMemo/useCallback

2. 状态管理重构:
   - 类组件的 this.state / this.setState 替换为 useState，注意 setState 是合并更新而 useState 的 setter 是替换更新
   - 复杂的关联状态考虑 useReducer 替代多个 useState
   - 实例变量 (this.xxx) 迁移到 useRef

3. 事件处理和 this 绑定:
   - 类组件中需要 bind 或箭头函数，函数组件中不存在 this 问题
   - 需要注意闭包陷阱: 函数组件中 useCallback/useEffect 可能捕获到过期的 state

4. HOC 和 ref 转发:
   - 类组件的 HOC 可能依赖实例方法，迁移后需要改用 forwardRef + useImperativeHandle

迁移示例:

```typescript
// Before: Class Component
class DataBrowser extends React.Component<Props, State> {
  state = { data: [], loading: false };

  componentDidMount() { this.fetchData(); }

  componentDidUpdate(prevProps) {
    if (prevProps.tableId !== this.props.tableId) { this.fetchData(); }
  }

  fetchData = async () => {
    this.setState({ loading: true });
    const data = await api.getData(this.props.tableId);
    this.setState({ data, loading: false });
  };

  render() {
    return <Table data={this.state.data} loading={this.state.loading} />;
  }
}

// After: Function Component
function DataBrowser({ tableId }: Props) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getData(tableId).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [tableId]);

  return <Table data={data} loading={loading} />;
}
```

向后兼容性保证:

- 渐进式迁移: 先迁移低风险、独立的组件，再迁移核心组件
- 功能测试: 每个组件迁移后做完整的功能回归测试
- 灰度发布: 迁移后的组件先在内部测试环境验证，再逐步放量
- 回滚机制: 保留旧组件代码，通过 feature flag 控制使用新组件还是旧组件

迁移效果: 代码量减少约 25%，单元测试覆盖率从 30% 提升到 75%，与状态相关的 bug 报告数量从每月 12 个下降到每月 2 个。

### 2.4 腾讯 IEG - 数据竞争排查

问题现象: 腾讯 NoSQL 数据库管理系统的某个数据表格页面，当用户在筛选条件之间快速切换时，表格展示的数据与当前选中的筛选条件不匹配。

定位过程:

1. 首先怀疑是后端问题，但通过抓包发现请求参数是正确的，响应数据也是正确的，说明问题在前端
2. 排查 React 组件代码，发现问题出在 useEffect 中: 条件 A 的请求因为网络波动响应慢，条件 B 的请求响应快，条件 A 的响应后到覆盖了条件 B 的数据
3. 另一个闭包问题: useEffect 的依赖数组中漏掉了某个条件变量，导致 effect 使用了过期的闭包值

解决方案:

1. 请求竞态处理: 在 useEffect 中维护一个 abort flag 或使用 AbortController

```typescript
useEffect(() => {
  let cancelled = false;
  api.getData(activeTab).then((result) => {
    if (!cancelled) setData(result);
  });
  return () => {
    cancelled = true;
  };
}, [activeTab]);
```

2. 闭包陷阱修复: 仔细审查 useEffect 的依赖数组，配合 eslint-plugin-react-hooks 的 exhaustive-deps 规则做静态检查。

3. 封装通用 Hook:

```typescript
function useAsyncWithRace<T>(asyncFn: () => Promise<T>, deps: any[]) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const requestId = useRef(0);

  useEffect(() => {
    const currentId = ++requestId.current;
    setState((prev) => ({ ...prev, loading: true }));

    asyncFn()
      .then((data) => {
        if (currentId === requestId.current) {
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

4. 长期方案: 引入 SWR 或 React Query，它们内置了请求竞态处理。

### 2.5 腾讯 IEG - TCP 连接池与进程池调用 C++ .so

TCP 连接池设计要点:

```typescript
interface PoolOptions {
  minIdle: number; // 最小空闲连接数
  maxOpen: number; // 最大打开连接数
  maxLifetime: number; // 连接最大生命周期
  idleTimeout: number; // 空闲连接超时时间
  healthCheckInterval: number;
}

class ConnectionPool {
  private idle: net.Socket[] = [];
  private active = new Set<net.Socket>();
  private waitQueue: Array<{ resolve: Function; reject: Function; timer: NodeJS.Timeout }> = [];

  async acquire(timeoutMs = 3000): Promise<net.Socket> {
    // 1. 优先复用空闲连接
    const conn = this.idle.pop();
    if (conn && this.isAlive(conn)) {
      this.active.add(conn);
      return conn;
    }
    // 2. 未达上限则新建连接
    if (this.active.size + this.idle.length < this.options.maxOpen) {
      const created = this.createConnection();
      this.active.add(created);
      return created;
    }
    // 3. 达到上限, 排队等待并设置超时
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("acquire timeout")), timeoutMs);
      this.waitQueue.push({ resolve, reject, timer });
    });
  }

  release(conn: net.Socket): void {
    this.active.delete(conn);
    if (!this.isAlive(conn)) {
      conn.destroy();
      return;
    }
    const waiter = this.waitQueue.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      this.active.add(conn);
      waiter.resolve(conn);
    } else {
      this.idle.push(conn);
    }
  }
}
```

配置参数: minIdle: 4, maxOpen: 20, maxLifetime: 30 分钟, idleTimeout: 30 秒, healthCheckInterval: 10 秒。

进程池调用 C++ .so 的架构:

- Node.js 主进程维护一个子进程池 (child_process fork)，池大小与 CPU 核心数一致 (默认 4 个)
- 每个子进程通过团队编写的轻量 N-API 绑定层加载 C++ .so，暴露加解密和表文件解析函数
- 主进程将任务通过 IPC 分发给最空闲的子进程，子进程执行完毕后通过 IPC 返回结果
- 二进制数据通过 Buffer 传递，单次 IPC 开销约 1ms

为什么用进程池而不是在主进程内直接调用:

1. 事件循环阻塞: 加解密和表文件解析是 CPU 密集操作，在主进程内同步调用会阻塞事件循环
2. 崩溃隔离: .so 内部 segfault 会拖垮所在进程。放在子进程中执行，崩溃只影响单个 worker
3. 并行计算: 多个子进程可以并行处理加解密请求，吞吐量提升约 3.5 倍

### 2.6 腾讯 IEG - Node.js 与 C++ 互操作

Node.js 调用 C++ .so 动态链接库有几种方式:

1. N-API (Node-API) 主进程内调用: 性能最好但 CPU 密集计算会阻塞事件循环，且 .so 崩溃会导致主进程崩溃
2. FFI (ffi-napi): 不需要编译 C++ addon，但有 FFI 调用开销，稳定性和类型安全较差
3. child_process 进程池 + 子进程内 N-API: 兼顾调用性能、崩溃隔离和事件循环不阻塞

我们选择方案 3。

valgrind 排查内存泄漏:

问题现象: Node 进程运行 24 小时后，内存从 200MB 增长到 800MB 以上。通过 heapdump 对比确认 JS 堆稳定，判断泄漏在 C++ 层。

```bash
valgrind --leak-check=full \
         --show-leak-kinds=all \
         --track-origins=yes \
         --log-file=valgrind.log \
         node server.js
```

定位到的泄漏点: 表文件解析函数在解密失败时走了 early return 路径，跳过了临时 buffer 的 free。

修复: 将裸指针改为 RAII 智能指针 (std::unique_ptr)，保证任何返回路径都自动释放:

```cpp
int parse_table(const char* input, int input_len, char* output, int* output_len) {
    std::unique_ptr<char[]> temp_buffer(new char[1024 * 1024]);
    if (decrypt(input, input_len, temp_buffer.get()) != 0) {
        return -1; // unique_ptr 析构时自动释放
    }
    // ... 解析逻辑 ...
    return 0;
}
```

修复后 24 小时内 RSS 增长不超过 20MB。

辅助排查手段: Node.js 官方 valgrind suppressions 文件过滤 V8 误报; process.memoryUsage() 做进程级内存监控; AddressSanitizer 在 CI 中检测内存问题。

### 2.7 字节 Data-架构 - JSError LLM 自动修复

系统工作流程:

1. JSError 采集: 前端监控 SDK 捕获 JSError，上报错误信息 (错误消息、堆栈、用户行为、页面 URL、浏览器信息)

2. 上下文信息提取:
   - 通过 Source Map 还原压缩后的堆栈，定位到源码文件和行号
   - 拉取出错位置的源码上下文 (前后各 50 行)
   - 提取出错组件的 React 组件树信息
   - 收集用户行为 trace (最近 10 次点击、路由跳转)
   - 获取相关的 TypeScript 类型定义
   - 检索最近 3 次该文件的 git log diff
   - 从知识库中检索历史相似错误的修复案例

3. Prompt 构造:
   - System Prompt: 描述角色、任务、约束 (最小改动、不改变业务逻辑)
   - 错误信息: 错误类型、消息、还原后的堆栈
   - 源码上下文: 出错文件的相关代码
   - 类型信息: 相关的接口和类型定义
   - 修复要求: 输出格式 (仅输出修改后的代码片段 + 修改说明)

4. LLM 修复: 调用大模型 (temperature=0.1 减少随机性) 生成修复方案

5. 修复验证:
   - 静态检查: TypeScript 编译检查
   - 单元测试: 运行相关的单元测试
   - Diff 审查规则: 修复 patch 不能超过 20 行改动、不能删除 try-catch 块、不能修改导出函数签名
   - Code Review: 生成修复 PR，由开发者 review 后合并

实际收益:

- 自动修复 patch 的验证通过率 (编译 + 单测) 约 65%
- 通过验证的 patch 经人工 review 后合入率约 47%
- 高频模式化错误 (如空值访问) 自动修复成功率可达 70% 以上
- 错误 MTTR 从约 4.2 天降到 0.8 天，每周节省 on-call 人力约 6 小时

常见修复类型:

- 空值/未定义访问 (45%): 添加可选链 ?.、空值兜底 ?? []
- 类型错误 (25%): 添加类型守卫、修正类型转换
- API 返回值变更 (15%): 适配新的数据结构
- 边界条件缺失 (15%): 添加数组长度检查、条件判断

误修处理与快速回滚:

- 人工 Review 是最后防线，CR 中高亮 "AI Generated Fix"
- 修复上线后先在 1% 流量灰度，监控错误复发率
- 每个自动修复的 CR 都创建对应的 revert commit，回滚速度 < 5 分钟

### 2.8 字节 Data-架构 - A2UI React 框架

A2UI (Agent to UI) 的核心概念: 让 AI Agent 能够动态生成和操控 UI 组件。

工作原理:

1. 用户输入自然语言描述
2. LLM 解析描述，生成 Component Schema (JSON 格式)
3. Schema 渲染器根据 Schema 从 Component Registry 中选择组件并组合
4. 输出可交互的 React 组件

流式更新的处理: LLM 通过 SSE 流式输出 JSON，使用增量 JSON parser 逐 token 解析，每解析出一个完整的组件节点就立即推送到渲染队列。渲染侧使用 React Concurrent Mode 的 startTransition 包裹增量渲染更新，避免流式渲染阻塞用户交互。已渲染完成的节点通过 React.memo 不会因为后续节点的增量输出而重渲染。

接入难点:

1. 流式渲染的中间态处理: Schema 不完整时组件树不能崩，需要对每个组件实现 fallback/skeleton 状态
2. Schema 版本兼容: 旧版 Schema 中某些字段在新版被重命名，做了 Schema migration 中间层
3. 交互回调: LLM 生成的 UI 中按钮点击需要回调 Agent 继续推理，实现了 action bridge
4. 性能: 流式渲染每秒产生 10-20 次 partial render，用 React.memo + immutable diff 避免不必要的 re-render

在搜索推荐算法平台的应用: 算法工程师可以通过自然语言描述需要的调试界面，Agent 自动生成对应的参数配置面板、结果展示图表等组件。接入后减少了约 40% 的定制化 UI 开发需求。

### 2.9 阿里巴巴 - Server & Schema-Driven UI

Schema-Driven UI 的定义: 前端 UI 的结构和行为由服务端下发的 Schema (通常是 JSON) 驱动，前端不需要硬编码页面布局，而是实现一个 Schema 解析引擎。

Schema 的定义和解析:

- Schema 通常包含: 组件类型 (type)、属性 (props)、子节点 (children)、数据绑定 (dataBinding)、事件处理 (events)、条件渲染 (condition)
- 前端实现一个 Schema Renderer，递归解析 Schema 树，将每个节点映射为对应的 React 组件
- 数据绑定通过 JSONPath 或类似语法关联后端数据

```typescript
function SchemaRenderer({ schema }: { schema: Schema }) {
  const Component = componentRegistry.get(schema.type);
  if (!Component) return <div>Unknown component: {schema.type}</div>;

  const resolvedProps = useResolveProps(schema.props);
  const children = schema.children?.map((child, index) => (
    <SchemaRenderer key={index} schema={child} />
  ));

  return <Component {...resolvedProps}>{children}</Component>;
}
```

在广告投放场景的优势:

1. 快速迭代: 运营可以通过修改 Schema 调整广告展示样式，不需要前端发版
2. A/B 测试: 不同的 Schema 对应不同的 UI 方案
3. 多端复用: 同一份 Schema 可以被 Web、App、小程序各自的 Renderer 解析
4. 个性化: 根据用户画像下发不同的 Schema

处理复杂交互和自定义组件:

- Schema 中支持声明式的事件绑定
- 对于 Schema 无法表达的复杂交互，支持自定义组件注册
- 极端复杂场景下支持 "逃生舱" (escape hatch)

实际效果: 配置页面开发时间从 3 天降至 2 小时，线上 Bug 率降低 60%，A/B 测试效率从 1 周降至 1 天。

### 2.10 阿里巴巴 - 模块联邦开源贡献

我的具体贡献:

- 给 @module-federation/vite 提交了多个 PR，主要涉及:
  1. Vite dev server 模式下远程模块的 HMR 失效修复: 远程模块变更后 consumer 端虚拟模块没有被 invalidate，在 handleHotUpdate 钩子中手动触发远程 module map 的刷新
  2. shared 依赖预构建逻辑优化: 将多个 shared 依赖合并为一次 optimizeDeps 调用，预构建时间从约 12 秒降到 3 秒
  3. runtime plugin 机制: 允许运行时动态修改远程模块的加载行为 (鉴权 header、切换 CDN 源等)

总共提交了 4 个 PR，其中 3 个被合并，1 个还在 review 中。

技术挑战:

- Vite 的 ESM 模式下，模块的加载是异步且并行的，shared 依赖的版本协商时序比 Webpack 复杂
- CSS 在 ESM 中没有标准的导入方式，需要特殊处理
- Vite 的 optimizeDeps (预构建) 和模块联邦的 shared 机制需要协调

收益:

- 构建时间: 从 5 分钟降至 1 分钟 (Vite 比 Webpack 快 5 倍)
- 首屏加载: 减少 30% (共享依赖去重)
- 团队协作: 各团队独立开发和部署，通过模块联邦集成

---

## 三、项目深挖 - Sentry SDK

### 3.1 JSError 还原故障现场

SDK 错误数据采集字段结构:

@swifty/sentry 的错误捕获采用发布订阅架构，core 模块定义错误事件的 schema，plugin 子模块负责具体采集。一条完整的 JSError 数据包含:

```typescript
interface ErrorEvent {
  type: "error";
  subtype: "js_error" | "resource_error" | "promise_rejection" | "http_error";
  timestamp: number;
  url: string;
  referrer: string;

  error: {
    message: string;
    name: string; // TypeError, ReferenceError 等
    stack: string;
    filename?: string;
    lineno?: number;
    colno?: number;
  };

  environment: {
    ua: string;
    viewport: { width: number; height: number };
    language: string;
    platform: string;
  };

  breadcrumbs: Array<{
    type: "click" | "route" | "http" | "console";
    data: any;
    timestamp: number;
  }>;

  sessionId: string;
  eventId: string;
}
```

采集入口通过 window.onerror 和 window.addEventListener('unhandledrejection') 全局监听，再配合 Proxy 包装 XMLHttpRequest 和 fetch 捕获网络请求错误。错误数据经过 LRU 缓存去重 (基于 message + stack 的 hash)，再进入上报队列。

服务端 source map 还原流程:

1. 解析堆栈字符串: 正则匹配每一帧的 filename:line:column
2. 定位 source map 文件: 根据压缩文件 URL 查找对应的 .map 文件 (通过 sourceMappingURL 注释或 HTTP SourceMap 响应头)
3. 使用 source-map 库映射: 调用 SourceMapConsumer.originalPositionFor({ line, column })，返回原始文件名、行号、列号

Source map 上传/匹配机制: CI/CD 阶段构建产物输出后立即将 .map 文件上传到服务端，携带 release version 和 file path。SDK 上报错误时携带 version，服务端通过 version + filename 精确匹配。即使多版本同时运行 (灰度场景) 也能正确匹配。

去重和限流设计:

- 客户端: LRU 去重 (容量 100)、采样率控制、滑动窗口限流 (每秒最多 10 条)、批量上报
- 服务端: 指纹聚合 (相同指纹只保留一条完整记录)、令牌桶限流、告警收敛

### 3.2 rrweb 屏幕录制原理与性能代价

rrweb 的 DOM 序列化机制:

- 全量快照 (Full Snapshot): 录制开始时生成一次，将整个 DOM 树序列化为树形 JSON。每个节点映射为 SerializedNode，包含 type、tagName、attributes、textContent、唯一数字 ID。
- 增量快照 (Incremental Snapshot): 通过 MutationObserver 监听 DOM 变化，仅记录变更部分。增量事件类型: Mutation、MouseMove、ViewportResize、Input、Scroll、TouchMove、MediaInteraction、StyleSheetRule。

控制 MutationObserver 的序列化开销:

1. 批量合并: 使用 requestAnimationFrame 或固定时间窗口 (50ms) 将多批 mutation record 合并
2. 节点过滤: 忽略 script、style、广告 iframe 等不需要录制的节点
3. 属性精简: 对 style 属性做 diff，只记录变化的属性
4. 采样降频: MouseMove 事件每 50ms 最多记录一次

gzip 压缩在 Web Worker 中执行: 主线程通过 postMessage 发送数据给 Worker，Worker 使用 pako 压缩后回传。典型数据: 一帧全量快照约 200KB 原始 -> 30KB 压缩后，Worker 内压缩耗时约 10-30ms，主线程阻塞 < 1ms。

录制数据分片上报: 时间分片 (每 10 秒一个数据包)、大小分片 (超过 64KB 则拆分)、优先使用 sendBeacon。

Canvas 和 iframe 的局限:

- Canvas: 无法直接序列化像素内容，需定时调用 canvas.toDataURL() 捕获当前帧
- 跨域 iframe: 受同源策略限制，只能记录 iframe 元素本身的位置和大小

### 3.3 白屏检测关键点采样

关键点选择:

1. document.body 的直接子节点 (排除 script、style、noscript)
2. 可视区域内的关键语义标签: h1~h6、p、img、video、canvas、[role="button"]、input、button、a
3. 自定义关键选择器: 业务方可通过 SDK 配置传入 keySelectors

判断逻辑:

1. 获取视口大小
2. 对每个关键节点调用 getBoundingClientRect()
3. 判断节点是否在可视区域内
4. 检查: offsetWidth > 0 && offsetHeight > 0、visibility !== 'hidden'、display !== 'none'、包含非空文本或可见背景
5. 统计 "有效可见节点数"，如果为 0 或低于阈值，判定为白屏

区分 "真实白屏" 和 "加载中":

1. 多轮采样: DOMContentLoaded 后 1s、2s、4s 采样，连续 3 轮都检测到白屏才判定
2. 加载状态检测: 检查 document.readyState、是否有未完成的 XHR/fetch 请求
3. 白屏持续时间阈值: 超过 5 秒无论是否有请求在进行都上报为异常白屏

骨架屏误判处理:

1. 骨架屏特征识别: 大量 div 无文本内容，使用 background: linear-gradient 做 shimmer 动画
2. 内容有效性判定: 骨架屏节点不计为 "有效可见节点"
3. 业务方配置: 提供 skeletonSelectors 配置项

采样性能控制:

- 使用 IntersectionObserver 替代轮询式 getBoundingClientRect
- 每轮采样的 DOM 查询控制在 20 个节点以内
- 采用指数退避策略 (1s -> 2s -> 4s)，最多 5 轮
- requestIdleCallback 将采样逻辑放在浏览器空闲时段执行

### 3.4 三级降级上报策略

三者的兼容性差异与降级场景:

| 方案                    | 兼容性                    | 特点                          | 降级触发场景                  |
| ----------------------- | ------------------------- | ----------------------------- | ----------------------------- |
| navigator.sendBeacon    | IE 不支持，现代浏览器支持 | 页面卸载时仍可发送，异步      | 默认首选                      |
| Image Beacon            | 全浏览器兼容              | GET 请求，URL 长度受限 (~2KB) | sendBeacon 不可用或返回 false |
| fetch + keepalive: true | 现代浏览器                | 页面卸载后可存活，支持 POST   | 前两者均失败时                |

降级链: trySendBeacon -> tryImageBeacon -> tryFetchKeepAlive -> storeInLocalStorage

sendBeacon 数据大小限制: Chrome/Firefox 64KB。超过限制时: gzip 预压缩 -> 分片拆分 (每个 chunk <= 60KB) -> 字段裁剪。

离线数据存储与网络恢复刷盘:

- 顺序保证: localStorage 中按时间戳排序
- 幂等性: 每条数据携带全局唯一 eventId，服务端对 eventId 做去重 (Redis SET + TTL 24h)
- 上报确认: 收到 200 响应后才从 localStorage 删除
- 淘汰策略: 已用空间超过 4MB 时按 LRU 淘汰，优先淘汰低优先级数据

批量上报防冲击 (2000 条离线数据):

- 分批: 每批 50 条，共 40 批
- 间隔递增: 100ms -> 200ms -> 500ms -> 1s -> 封顶 2s
- 并发控制: 同时最多 3 个上报请求
- 服务端限流感知: 429 响应时读取 Retry-After header
- 指数退避: 连续失败 3 次后退避时间翻倍，最大 30 秒

---

## 四、项目深挖 - CLI Coding Agent

### 4.1 ReAct 范式实现

ReAct 的 Thought -> Action -> Observation 循环编排:

我的 CLI Coding Agent (@swifty/swifty) 基于 ReAct 范式。每一轮循环中，LLM 先输出 Thought (推理过程)，然后输出 Action (工具调用请求)，Agent 执行工具后将 Observation (执行结果) 回注到上下文中。

Action 解析与工具路由:

```json
{
  "type": "tool_use",
  "id": "toolu_xxx",
  "name": "ReadFile",
  "input": { "file_path": "/path/to/file" }
}
```

工具路由机制:

1. 工具注册表: Agent 初始化时所有工具在 Registry 中注册，每个工具定义 name、description、input schema (JSON Schema)
2. 名称匹配: 解析 LLM 返回的 name 字段，在 Registry 中查找对应工具实例
3. 参数校验: 使用 Zod 对 input 做 schema 校验
4. 分发执行: 调用工具的 execute(input) 方法

工具执行失败的错误回注与自我纠错:

1. 捕获异常，生成 tool_result 消息 (is_error: true)
2. 将 tool_result 追加到 messages 中
3. LLM 在下一轮读取到错误信息，根据错误内容调整策略

Agent Loop 最大迭代次数与防死循环:

- 最大迭代次数: 默认 200 轮
- 重复动作检测: 连续 5 轮调用相同工具且参数完全相同，插入 system 提示
- token 预算: 累计 token 使用量超过预算时终止
- 用户中断: 用户随时可以按 Ctrl+C 中断

Subagent vs Agent Team:

- Subagent: 主 Agent fork 子 Agent，独立上下文，单向通信，任务完成后销毁。适用于可独立完成的子任务。
- Agent Team: 多个 Agent 平等运行，双向通信 (SendMessage)，长期运行。适用于需要多角色协作的复杂任务。

### 4.2 上下文压缩与会话持久化

上下文压缩策略 (摘要式压缩 + 选择性截断):

1. 消息分类:
   - 高优先级: 当前任务描述、最近 3 轮的工具调用和结果、用户最新指令
   - 中优先级: 较早的工具调用结果
   - 低优先级: 系统消息、已完成的子任务结果

2. 摘要式压缩: 对中优先级消息调用轻量 LLM 生成摘要 (文件内容保留关键函数签名和行号，命令输出保留 exit code 和关键行)

3. 选择性截断: 低优先级消息直接截断丢弃

4. 关键信息锚定 (永远不会被压缩): 当前工作目录、用户最后一条消息、最近一次失败的错误信息、当前打开/编辑的文件路径

LLM 记忆提取:

- 触发时机: 会话结束时、每 50 轮对话、用户 /memory 命令
- 提取信息: 事实类 (技术栈偏好)、意图类 (长期目标)、代码状态类 (项目约定)
- 持久化到 ~/.swifty/memory/ 目录，下次会话启动时加载到 System Prompt

会话持久化数据结构:

```json
{
  "sessionId": "uuid",
  "workingDirectory": "/path/to/project",
  "messages": [...],
  "agentState": {
    "openFiles": ["/path/to/file1"],
    "currentTask": "正在重构 auth 模块",
    "completedSteps": ["读取了 auth.ts", "分析了依赖关系"],
    "pendingActions": ["修改 login 函数", "更新测试"]
  },
  "contextSummary": "用户在重构 auth 模块，已完成依赖分析..."
}
```

跨会话恢复: 用户通过 swifty --resume 恢复，Agent 加载持久化的 messages 数组，agentState 中的 openFiles 用于恢复文件上下文，contextSummary 注入 System Prompt。

压缩对推理质量的影响: 摘要式压缩的信息损失约 10-20%，但节省的 token 成本约 60-70%，是合理的 trade-off。评估方式: 重复操作率、任务完成率对比、人工审查 Context Summary。

---

## 五、系统设计题

### 5.1 设计一个大规模前端灰度发布系统

灰度策略的配置和分发机制:

采用服务端下发策略 + 客户端执行判断的混合模式。灰度配置中心支持的规则类型:

- 按用户 ID 取模 (userId % 100 < 10 即 10% 灰度)
- 按地域 (region === "cn-east")
- 按用户标签 (userTag.includes("beta"))
- 按流量比例 (random 0-100 < 5)

灰度 API: GET /api/feature-flags?userId=xxx，返回 { features: { newDashboard: { enabled: true, variant: "B" } } }。

SDK 本地缓存灰度结果 (localStorage + 5 分钟 TTL)，灰度状态变化时通过 WebSocket 推送。

前端代码层面的灰度切换:

```typescript
const flags = await getFeatureFlags(userId);

// 路由层灰度 (动态 import)
const Dashboard = lazy(() =>
  flags.newDashboard.enabled ? import("./DashboardV2") : import("./DashboardV1"),
);
```

不用编译时多版本打包的原因: 构建时间翻倍、产物体积增大、无法灵活调整灰度比例。

灰度期间的数据隔离和指标对比: 每个用户行为事件携带灰度标记，按灰度标记分组聚合对比性能指标 (LCP, FCP, CLS)、业务指标 (转化率)、错误率。

会话一致性保证:

1. 灰度分桶持久化: 首次命中灰度时写入 cookie
2. 服务端一致性: Redis 记录 (userId, feature, variant) 映射
3. Session 级缓存: sessionStorage 中缓存灰度结果

全量回滚方案:

- 触发条件: 灰度版错误率 > 对照组 \* 2、P0 告警、人工决策
- 操作: 配置中心设 enabled: false，WebSocket 推送 (< 1 秒生效)
- 速度: 在线用户 < 3 秒，全量生效 < 5 分钟，无需重新部署代码

前后端灰度版本不一致的处理:

1. API 版本兼容: 新增字段而不删除旧字段
2. BFF 层适配: 根据灰度标记对 API 响应做适配转换
3. 降级兜底: 缺少新字段时自动降级到对照版渲染逻辑

### 5.2 设计一个高性能实时数据大屏

数据层: WebSocket 管理

```typescript
class RealtimeDataManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  connect() {
    this.ws = new WebSocket("wss://api.example.com/realtime");

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      // 序号校验: 防止乱序
      if (msg.seq <= this.lastProcessedSeq) return;
      this.lastProcessedSeq = msg.seq;
      // 去重: 基于消息 ID
      if (this.processedIds.has(msg.id)) return;
      this.processedIds.add(msg.id);
      // 分发到对应图表的 handler
      const handler = this.messageHandlers.get(msg.chartId);
      if (handler) handler(msg.data);
    };

    this.ws.onclose = () => {
      this.reconnect();
    };
  }

  // 心跳: 每 30 秒 ping，60 秒未收到 pong 则断开重连
  // 指数退避重连: delay = min(1000 * 2^attempts, 30000)
}
```

消息积压处理: 客户端 Ring Buffer (容量 1000)、服务端流控 (背压)、重连后通过 lastProcessedSeq 增量同步。

渲染层: 避免主线程阻塞

1. 数据预处理在 Web Worker 中完成，只将处理好的图表配置传回主线程
2. 分帧渲染: 10 个图表分散到不同帧 (每帧更新 2-3 个)
3. Echarts 增量更新: chart.setOption(newData, { notMerge: false, lazyUpdate: true })
4. Canvas 渲染器 (而非 SVG)

状态管理: Zustand Store 按图表 ID 分离状态，每个图表组件只订阅自己的数据:

```typescript
function ChartA() {
  const data = useDashboardStore((state) => state.chartData["chartA"]);
  // 只有 chartA 的数据变化时才 re-render
}
```

性能保障: 帧率监控与降级

- Level 1: 降低刷新频率 (1s -> 3s)
- Level 2: 简化图表配置 (关闭动画、LTTB 降采样 1000 -> 200 点)
- Level 3: 减少图表数量 (隐藏非核心图表)
- Level 4: 切换到静态截图模式

消息乱序和重复处理:

- 乱序: 单调递增序号，小于 lastProcessedSeq 的消息丢弃
- 重复: 唯一 ID + Set 去重 (容量 10000，FIFO 淘汰)
- 缺失: seq 跳号时向服务端请求缺失消息

### 5.3 设计一个 Agent 开发平台的前端架构

路由结构:

- / -> 首页/仪表盘 (Agent 列表、运行统计)
- /agents/:id/config -> Agent 配置编辑器
- /agents/:id/debug -> Agent 调试面板 (运行日志流 + 工具调用链)
- /agents/:id/sessions -> 历史会话列表
- /agents/:id/sessions/:sid -> 会话回放

状态管理分层:

- Server State (React Query / SWR): Agent 配置数据、历史会话列表
- Realtime State (Zustand): SSE 日志流数据、工具调用链实时状态
- UI State (Zustand / useReducer): 编辑器光标位置、折叠状态、面板布局

SSE 长连接可靠性设计:

- Last-Event-ID 恢复: 断线重连时携带 Last-Event-ID，服务端从该 ID 之后继续推送
- 消息缓冲: 服务端为每个 Agent 会话维护最近 1000 条消息 (Redis Stream)
- 序号校验: 按 eventId 单调递增校验，跳号则通过 HTTP 请求缺失消息
- 降级轮询: SSE 连续失败 5 次时降级为每 2 秒轮询

工具调用链可视化: 使用 DAG (有向无环图)，基于 react-flow + dagre 布局算法。每个节点代表一次工具调用 (工具名、耗时、状态)，边代表调用关系。节点颜色: 绿色=成功，红色=失败，黄色=执行中。

大数据量渲染优化: 虚拟渲染 (只渲染视口内节点)、折叠/展开 (Subagent 默认折叠)、LOD (缩小时只显示名称)、增量更新。

会话回放功能: 类似视频播放器，支持倍速 (0.5x~8x)、拖拽跳转、进度条。不同事件类型用不同颜色标记。

多 Agent 并发状态展示:

- 顶部 Team 标题区
- 中部卡片网格展示每个 teammate (运行状态 + 当前动作摘要)
- 底部消息流区域 (Agent 间通信记录)
- 每个 Agent 独立 SSE 流，前端维护 Map<string, AgentState>

---
