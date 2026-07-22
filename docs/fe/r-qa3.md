# 前端/全栈工程师面试 Q&A 文档

## 目录

- [二、工作经历深挖](#二工作经历深挖)
  - [Q14: 字节 TikTok Kafka+ClickHouse 数据管道架构](#q14-字节-tiktok-performance-团队的-kafkaclickhouse-数据管道架构是怎样的)
  - [Q15: 字节 TikTok 多层缓存设计](#q15-你在字节-tiktok-做的多层缓存是怎么设计的)
  - [Q16: 字节 TikTok 虚拟滚动列表](#q16-你在字节-tiktok-实现的虚拟滚动列表是怎么做的)
  - [Q17: Thrift IDL 和 Kitex RPC 配合](#q17-thrift-idl-和-kitex-rpc-是怎么配合的)
  - [Q18: 腾讯 IEG React 类组件迁移](#q18-腾讯-ieg-的-react-类组件迁移到函数组件是怎么做的遇到了哪些坑)
  - [Q19: 腾讯 IEG 闭包陷阱排查](#q19-腾讯-ieg-排查的闭包陷阱具体是什么场景怎么解决的)
  - [Q20: 腾讯 IEG 数据竞争排查](#q20-腾讯-ieg-排查的数据竞争问题具体是什么怎么定位的)
  - [Q21: 腾讯 IEG TCP 连接池](#q21-腾讯-ieg-的-tcp-连接池是怎么设计的)
  - [Q22: 腾讯 IEG 调用 C++ .so](#q22-腾讯-ieg-调用-c-so-动态链接库是怎么做的遇到了什么问题)
  - [Q23: 腾讯 IEG valgrind 排查内存泄漏](#q23-腾讯-ieg-用-valgrind-排查内存泄漏的过程是怎样的)
  - [Q24: 腾讯 IEG v8 隐藏类和对象池](#q24-腾讯-ieg-的-v8-隐藏类和对象池优化是怎么做的)
  - [Q25: 字节 Data JSError LLM 自动修复](#q25-字节-data-部门的-jserror-llm-自动修复是怎么做的收益是什么)
  - [Q26: 字节 Data SWR 性能优化](#q26-字节-data-部门的-swr-前端性能优化具体做了什么)
  - [Q27: A2UI 框架接入](#q27-a2ui-是什么框架你是怎么接入的)
  - [Q28: 阿里妈妈 Server&Schema-Driven UI](#q28-阿里妈妈广告技术部的-serverschema-driven-ui-是怎么做的)
  - [Q29: 模块联邦与 @module-federation/vite](#q29-模块联邦是什么你是怎么接入的module-federationvite-你贡献了什么)
- [三、技能基础](#三技能基础)
  - [Q30: React Fiber 架构](#q30-react-fiber-架构原理是什么解决了什么问题)
  - [Q31: Vue3 响应式原理](#q31-vue3-响应式原理是什么proxy-和-defineproperty-的区别)
  - [Q32: Event Loop 微任务与宏任务](#q32-event-loop-中微任务和宏任务的区别是什么)
  - [Q33: TypeScript + Zod 校验](#q33-typescript-严格类型和-zod-校验怎么配合使用)
  - [Q34: Go goroutine 和 channel](#q34-go-的-goroutine-和-channel-并发模型原理是什么)
  - [Q35: Vite vs Webpack](#q35-vite-和-webpack-的核心区别是什么vite-为什么快)
  - [Q36: CSS 模块化方案](#q36-css-模块化方案有哪些各有什么优缺点)
  - [Q37: 前端性能优化](#q37-前端性能优化有哪些维度你在实际项目中做了哪些优化)

---

候选人: 杭天铖
背景: 硕士, 前端/全栈工程师
经历: 字节跳动 TikTok、腾讯 IEG、字节跳动 Data、阿里妈妈广告技术部

---

## 二、工作经历深挖

### Q14: 字节 TikTok Performance 团队的 Kafka+ClickHouse 数据管道架构是怎样的？

A: TikTok Performance 团队负责收集和分析全球 CDN 节点的性能数据，日均处理 50 亿+ 条日志。我参与设计了基于 Kafka + ClickHouse 的实时数据管道。

架构概览：

```
CDN Logs → Kafka Producer → Kafka Cluster (3 brokers, 12 partitions)
  → Kitex Consumer (Golang) → Data Transformation → ClickHouse
  → Grafana Dashboard (React + ECharts)
```

Kafka 配置：12 个 partition（按 region hash 路由），replication factor = 3，retention 7 天。Producer 使用 async 模式，batch size 1000 条，compression = lz4。Consumer Group 包含 6 个实例，每个实例处理 2 个 partition。

Kitex Consumer：基于 CloudWeGo Kitex 框架，使用 Thrift IDL 定义服务接口。Consumer 从 Kafka 拉取消息后，进行数据清洗（字段校验、时间戳转换、IP 解析）和聚合（5 分钟窗口内的 P50/P90/P99 延迟），然后批量写入 ClickHouse。

```go
func (h *Handler) ProcessMessages(ctx context.Context, messages []kafka.Message) error {
    var batch []ClickHouseRow
    for _, msg := range messages {
        row := transformMessage(msg)
        batch = append(batch, row)

        if len(batch) >= 10000 {
            if err := h.chClient.BatchInsert(ctx, batch); err != nil {
                return err
            }
            batch = batch[:0]
        }
    }
    // 刷入剩余数据
    if len(batch) > 0 {
        return h.chClient.BatchInsert(ctx, batch)
    }
    return nil
}
```

ClickHouse Schema：使用 MergeTree 引擎，按 `(date, region)` 分区，`(timestamp, node_id)` 排序。关键优化：使用 `LowCardinality(String)` 压缩枚举字段，使用 `AggregateFunction` 预聚合指标。查询性能：单表 10 亿行，P99 查询延迟 < 500ms。

监控告警：Consumer lag 超过 10 万条时触发告警，ClickHouse 查询延迟超过 2s 时自动扩容。整体系统可用性 99.95%，数据处理延迟 < 30 秒。

---

### Q15: 你在字节 TikTok 做的多层缓存是怎么设计的？

A: 多层缓存是为了平衡性能和数据一致性，TikTok Performance 平台使用了 L1（内存）+ L2（Redis）+ L3（MySQL）的三层架构。

L1: 进程内缓存（Go map + LRU）。容量 1000 条，TTL 5 分钟。适用于热点数据（如当前活跃 CDN 节点列表）。使用 `sync.RWMutex` 保证并发安全：

```go
type L1Cache struct {
    data  map[string]*CacheEntry
    lru   *list.List
    mutex sync.RWMutex
}

func (c *L1Cache) Get(key string) (interface{}, bool) {
    c.mutex.RLock()
    defer c.mutex.RUnlock()

    entry, ok := c.data[key]
    if !ok || time.Now().After(entry.ExpireAt) {
        return nil, false
    }
    c.lru.MoveToFront(entry.Element)
    return entry.Value, true
}
```

L2: Redis Cluster。6 节点，3 主 3 从。容量无限制，TTL 1 小时。适用于用户配置、查询结果缓存。使用 Hash Tag 确保相关 key 落在同一 slot：

```go
// 使用 {user_id} 作为 hash tag
key := fmt.Sprintf("{%d}:dashboard:config", userID)
config, err := redisClient.Get(ctx, key).Result()
```

L3: MySQL。持久化存储，作为最终数据源。当 L1/L2 都 miss 时，查询 MySQL 并回填缓存。

缓存更新策略：采用 Cache-Aside 模式。写操作先更新 MySQL，再删除 L1/L2 缓存（而非更新），避免并发写导致的数据不一致。读操作先查 L1，miss 则查 L2，再 miss 则查 L3 并回填。

防击穿/穿透/雪崩：

- 击穿：使用 `singleflight` 确保同一 key 的并发查询只穿透一次
- 穿透：对空值也缓存（TTL 1 分钟），使用布隆过滤器预检
- 雪崩：TTL 加随机抖动（±10%），避免同时过期

```go
func (s *Service) GetDashboardConfig(ctx context.Context, userID int64) (*Config, error) {
    key := fmt.Sprintf("%d:config", userID)

    // L1
    if val, ok := s.l1Cache.Get(key); ok {
        return val.(*Config), nil
    }

    // L2 + singleflight
    val, err, _ := s.sf.Do(key, func() (interface{}, error) {
        // L2
        config, err := s.redis.Get(ctx, key).Result()
        if err == nil {
            return config, nil
        }

        // L3
        config, err = s.mysql.GetConfig(ctx, userID)
        if err != nil {
            return nil, err
        }

        // 回填 L2
        s.redis.Set(ctx, key, config, time.Hour)
        return config, nil
    })

    if err != nil {
        return nil, err
    }

    config := val.(*Config)
    s.l1Cache.Set(key, config, 5*time.Minute)
    return config, nil
}
```

实际效果：缓存命中率 L1 35%、L2 50%、L3 15%，平均查询延迟从 120ms 降至 8ms。

---

### Q16: 你在字节 TikTok 实现的虚拟滚动列表是怎么做的？

A: TikTok Performance 平台的日志列表包含 10 万+ 条数据，直接渲染会导致页面卡顿。我实现了一个高性能虚拟滚动组件，只渲染可视区域内的元素。

核心原理：根据滚动位置动态计算可视区域内的元素索引，只渲染这些元素，其他元素用空白占位。

```typescript
interface VirtualScrollConfig {
  itemCount: number;
  itemHeight: number; // 固定高度 or 估算高度
  containerHeight: number;
  overscan?: number; // 额外渲染行数，防止快速滚动白屏
}

function useVirtualScroll(config: VirtualScrollConfig) {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.floor(scrollTop / config.itemHeight);
  const endIndex = Math.min(
    config.itemCount,
    startIndex +
      Math.ceil(config.containerHeight / config.itemHeight) +
      (config.overscan || 5),
  );

  const offsetY = startIndex * config.itemHeight;
  const visibleItems = items.slice(startIndex, endIndex);

  return { startIndex, endIndex, visibleItems, offsetY };
}
```

动态高度支持：实际场景中列表项高度不固定（如日志详情展开/收起）。我使用预估高度 + 实测修正的策略：

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

function getOffset(index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i++) {
    offset += getItemHeight(i);
  }
  return offset;
}

// 渲染后更新实际高度
function measureItem(index: number, height: number) {
  heightCache.set(index, height);
  forceUpdate();
}
```

性能优化：

1. 二分查找：动态高度场景下，使用二分查找快速定位 scrollTop 对应的 startIndex，时间复杂度 O(log n)
2. 节流滚动：使用 `requestAnimationFrame` 节流 scroll 事件，避免频繁更新
3. 复用 DOM：使用 `key={index}` 而非 `key={item.id}`，让 React 复用 DOM 节点
4. Web Worker 计算：将高度计算和索引查找放到 Worker 线程，避免阻塞主线程

效果：10 万条数据，首屏渲染从 8 秒降至 200ms，滚动 FPS 从 15 提升至 58，内存占用从 800MB 降至 50MB。

---

### Q17: Thrift IDL 和 Kitex RPC 是怎么配合的？

A: Kitex 是字节开源的高性能 RPC 框架，与 Thrift IDL 深度集成。Thrift 用于定义服务接口和数据结构，Kitex 负责代码生成和运行时通信。

Thrift IDL 定义：

```thrift
// performance.thrift
namespace go tiktok.performance

struct LogQuery {
  1: required i64 start_time,
  2: required i64 end_time,
  3: optional string region,
  4: optional list<string> node_ids
}

struct LogEntry {
  1: required i64 timestamp,
  2: required string node_id,
  3: required double latency_ms,
  4: optional string error_message
}

struct LogResponse {
  1: required list<LogEntry> logs,
  2: required i64 total_count,
  3: optional string next_page_token
}

service PerformanceService {
  LogResponse QueryLogs(1: LogQuery query) (api.get="/api/v1/logs"),
  void ReportMetrics(1: list<LogEntry> metrics) (api.post="/api/v1/metrics")
}
```

代码生成：使用 Kitex 命令行工具生成 Go 代码：

```bash
kitex -module github.com/tiktok/performance -service performance performance.thrift
```

生成的代码包括：

- `kitex_gen/`：Thrift 数据结构的 Go 类型定义和序列化/反序列化逻辑
- `handler.go`：服务端需要实现的接口
- `client.go`：客户端调用桩

服务端实现：

```go
type PerformanceServiceImpl struct{}

func (s *PerformanceServiceImpl) QueryLogs(ctx context.Context, query *performance.LogQuery) (*performance.LogResponse, error) {
    // 查询 ClickHouse
    logs, err := s.chClient.Query(ctx, query.StartTime, query.EndTime, query.Region)
    if err != nil {
        return nil, err
    }

    return &performance.LogResponse{
        Logs:       logs,
        TotalCount: int64(len(logs)),
    }, nil
}

func main() {
    svr := performance.NewServer(new(PerformanceServiceImpl))
    svr.Run()
}
```

客户端调用：

```go
client, err := performance.NewClient("performance", client.WithHostPorts("127.0.0.1:8888"))
resp, err := client.QueryLogs(ctx, &performance.LogQuery{
    StartTime: time.Now().Add(-time.Hour).Unix(),
    EndTime:   time.Now().Unix(),
    Region:    "us-east",
})
```

性能优势：Kitex 使用自研的 Netpoll 网络库（基于 epoll），相比标准库 net 性能提升 30%+。Thrift 二进制协议比 JSON 序列化快 5-10 倍，体积小 50%+。实测 QPS 达到 10 万+，P99 延迟 < 5ms。

---

### Q18: 腾讯 IEG 的 React 类组件迁移到函数组件是怎么做的？遇到了哪些坑？

A: 腾讯 IEG 的 NoSQL 数据库管理系统是一个 5 年历史的大型 React 项目，包含 200+ 类组件。我负责核心模块（数据浏览、查询构建器）的迁移工作。

迁移策略：采用渐进式迁移，按模块逐步替换，而非一次性重写。优先级排序：高频修改组件 > 性能瓶颈组件 > 其他组件。

迁移示例：

```typescript
// Before: Class Component
class DataBrowser extends React.Component<Props, State> {
  state = { data: [], loading: false };

  componentDidMount() {
    this.fetchData();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.tableId !== this.props.tableId) {
      this.fetchData();
    }
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
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [tableId]);

  return <Table data={data} loading={loading} />;
}
```

踩坑 1: 闭包陷阱。useEffect 中引用的外部变量如果没有加入依赖数组，会导致闭包捕获旧值：

```typescript
// Bug: count 永远是 0
const [count, setCount] = useState(0);
useEffect(() => {
  const timer = setInterval(() => {
    console.log(count); // 闭包捕获初始值 0
    setCount(count + 1); // 永远设为 1
  }, 1000);
  return () => clearInterval(timer);
}, []); // 缺少 count 依赖

// Fix: 使用函数式更新
setCount((prev) => prev + 1);
```

踩坑 2: this 绑定丢失。类组件中 `this` 指向实例，函数组件没有 `this`。迁移时需要将所有 `this.xxx` 改为 state/ref/props，并确保回调函数正确捕获变量。

踩坑 3: 生命周期语义变化。componentDidUpdate 会在每次更新后执行，useEffect 默认也是如此。但如果依赖数组配置不当，可能导致无限循环或漏执行。

迁移效果：代码量减少 30%，Bundle Size 减少 15%（React 团队优化了函数组件的编译），性能提升 10-20%（避免了类组件的 this 绑定和继承开销）。

---

### Q19: 腾讯 IEG 排查的闭包陷阱具体是什么场景？怎么解决的？

A: 闭包陷阱在 React Hooks 中非常常见，我在腾讯 IEG 遇到了几个典型场景。

场景 1: 事件处理器捕获旧 state。一个表单组件，用户输入后点击提交，但提交的数据是旧值：

```typescript
function Form() {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    console.log('Submitting:', value); // Bug: 永远是初始值 ''
    api.submit(value);
  }, []); // 缺少 value 依赖

  return (
    <div>
      <input value={value} onChange={e => setValue(e.target.value)} />
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}
```

原因：useCallback 的依赖数组为空，handleSubmit 在组件首次渲染时创建，捕获的 value 是初始值 ''。后续 value 更新，handleSubmit 不会重新创建，闭包中的 value 仍然是 ''。

解决：将 value 加入依赖数组，或使用 useRef 保存最新值：

```typescript
const valueRef = useRef(value);
valueRef.current = value;

const handleSubmit = useCallback(() => {
  api.submit(valueRef.current); // 总是最新值
}, []);
```

场景 2: setTimeout 中的旧 state。一个倒计时组件，显示的数字不更新：

```typescript
function Countdown({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const timer = setInterval(() => {
      setCount(count - 1); // Bug: count 永远是 initialCount
    }, 1000);
    return () => clearInterval(timer);
  }, []); // 缺少 count 依赖

  return <div>{count}</div>;
}
```

解决：使用函数式更新，不依赖外部变量：

```typescript
setCount((prev) => prev - 1);
```

场景 3: 异步操作中的旧 props。一个列表组件，props.id 变化后重新请求数据，但回调中使用的还是旧 id：

```typescript
useEffect(() => {
  api.getData(id).then((data) => {
    setData(data); // Bug: 如果 id 快速变化，可能用旧 id 的数据覆盖新数据
  });
}, [id]);
```

解决：使用 cleanup 函数取消旧请求，或使用 AbortController：

```typescript
useEffect(() => {
  const controller = new AbortController();

  api
    .getData(id, { signal: controller.signal })
    .then((data) => setData(data))
    .catch((err) => {
      if (err.name !== "AbortError") throw err;
    });

  return () => controller.abort();
}, [id]);
```

排查方法：使用 React DevTools 的 "Highlight updates" 功能观察组件重渲染，使用 ESLint 插件 `eslint-plugin-react-hooks` 检查依赖数组，使用 `console.log` 打印闭包捕获的变量值。

---

### Q20: 腾讯 IEG 排查的数据竞争问题具体是什么？怎么定位的？

A: 数据竞争（Race Condition）在异步操作中很常见，我在腾讯 IEG 遇到了几个典型场景。

场景 1: 快速切换 Tab 导致数据错乱。用户快速点击不同 Tab，每个 Tab 触发数据请求。由于网络延迟不确定，后发的请求可能先返回，导致显示错误的数据：

```typescript
// Bug: Tab A -> Tab B，Tab A 的请求慢，返回后覆盖了 Tab B 的数据
function TabPanel() {
  const [activeTab, setActiveTab] = useState("tab1");
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getData(activeTab).then((result) => {
      setData(result); // 可能用旧 Tab 的数据覆盖新 Tab
    });
  }, [activeTab]);
}
```

定位方法：在控制台打印请求和响应的时间戳，发现响应顺序与请求顺序不一致。使用 Chrome DevTools 的 Network 面板观察请求时序。

解决：使用 cleanup 函数标记过期请求，或使用 AbortController 取消请求：

```typescript
useEffect(() => {
  let cancelled = false;

  api.getData(activeTab).then((result) => {
    if (!cancelled) {
      setData(result);
    }
  });

  return () => {
    cancelled = true;
  };
}, [activeTab]);
```

场景 2: 并发写入导致状态不一致。一个表格组件，用户可以同时编辑多行。每行的保存操作是独立的，但并发提交时可能互相覆盖：

```typescript
// Bug: 用户同时保存 Row A 和 Row B，Row B 的更新可能覆盖 Row A
async function saveRow(rowId, newData) {
  const currentData = await api.getRow(rowId);
  const merged = { ...currentData, ...newData };
  await api.updateRow(rowId, merged);
}
```

解决：使用乐观锁（版本号）或悲观锁（数据库行锁）：

```typescript
async function saveRow(rowId, newData, version) {
  try {
    await api.updateRow(rowId, { ...newData, version });
  } catch (err) {
    if (err.code === "VERSION_CONFLICT") {
      // 提示用户刷新后重试
      alert("数据已被其他用户修改，请刷新后重试");
    }
  }
}
```

场景 3: 全局状态并发更新。多个组件同时更新 Zustand store 中的同一字段：

```typescript
// Bug: 两个组件同时读取 count=0，各自 +1 后写入，结果是 1 而非 2
const useStore = create((set, get) => ({
  count: 0,
  increment: () => set({ count: get().count + 1 }),
}));
```

解决：使用函数式更新，Zustand 会自动处理并发：

```typescript
const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

排查工具：Chrome DevTools 的 Performance 面板（观察长任务和阻塞）、React DevTools 的 Profiler（观察组件更新时序）、自定义日志中间件（记录所有状态变更的时间和值）。

---

### Q21: 腾讯 IEG 的 TCP 连接池是怎么设计的？

A: 腾讯 IEG 的 NoSQL 管理系统需要与多个后端服务（MySQL、Redis、自研 NoSQL）建立 TCP 连接。为避免频繁创建/销毁连接的开销，我设计了一个通用的 TCP 连接池。

核心设计：

```go
type ConnectionPool struct {
    minIdle     int           // 最小空闲连接数
    maxOpen     int           // 最大打开连接数
    maxLifetime time.Duration // 连接最大生命周期
    idleTimeout time.Duration // 空闲连接超时时间

    connections chan net.Conn // 连接队列
    semaphore   chan struct{} // 并发控制

    mu       sync.Mutex
    stats    PoolStats
}

type PoolStats struct {
    OpenCount   int64 // 当前打开的连接数
    IdleCount   int64 // 当前空闲连接数
    WaitCount   int64 // 等待获取连接的请求数
    HitCount    int64 // 命中缓存的次数
    MissCount   int64 // 未命中的次数
}
```

获取连接：

```go
func (p *ConnectionPool) Acquire(ctx context.Context) (net.Conn, error) {
    // 尝试从空闲队列获取
    select {
    case conn := <-p.connections:
        p.stats.HitCount++
        return conn, nil
    default:
    }

    // 尝试创建新连接
    select {
    case p.semaphore <- struct{}{}:
        conn, err := p.dial(ctx)
        if err != nil {
            <-p.semaphore
            return nil, err
        }
        p.stats.OpenCount++
        p.stats.MissCount++
        return conn, nil
    default:
        // 达到上限，等待
        p.stats.WaitCount++
        select {
        case conn := <-p.connections:
            return conn, nil
        case <-ctx.Done():
            return nil, ctx.Err()
        }
    }
}
```

释放连接：

```go
func (p *ConnectionPool) Release(conn net.Conn) {
    // 检查连接是否有效
    if !p.isValid(conn) {
        conn.Close()
        <-p.semaphore
        p.stats.OpenCount--
        return
    }

    // 放回空闲队列
    select {
    case p.connections <- conn:
    default:
        // 队列已满，关闭连接
        conn.Close()
        <-p.semaphore
        p.stats.OpenCount--
    }
}
```

健康检查：后台 goroutine 定期检测空闲连接的有效性（发送心跳包），剔除失效连接。同时维护最小空闲连接数，避免突发流量导致连接不足。

配置参数：

- minIdle: 5（根据平均 QPS 估算）
- maxOpen: 50（根据后端承载能力设置）
- maxLifetime: 30 分钟（避免长时间持有连接导致后端状态不一致）
- idleTimeout: 5 分钟（及时释放空闲连接，避免资源浪费）

监控指标：连接池命中率、等待队列长度、连接创建/销毁速率。通过 Prometheus + Grafana 可视化，及时发现连接泄漏或不足问题。

---

### Q22: 腾讯 IEG 调用 C++ .so 动态链接库是怎么做的？遇到了什么问题？

A: 腾讯 IEG 的 NoSQL 管理系统需要调用 C++ 编写的高性能计算模块（如数据压缩、索引构建），这些模块以 `.so` 动态链接库形式提供。我使用 Node.js 的 FFI（Foreign Function Interface）能力调用这些库。

技术选型：对比了 `ffi-napi`、`node-addon-api`、`koffi` 三个库。最终选择 `koffi`，因为它 API 简洁、性能好、支持异步调用。

调用示例：

```javascript
const koffi = require("koffi");

// 加载 .so 文件
const lib = koffi.load("./libcompress.so");

// 声明函数签名
const compress = lib.func(
  "int compress_data(const char* input, int input_len, char* output, int* output_len)",
);

// 调用
const input = Buffer.from("Hello, World!".repeat(1000));
const output = Buffer.alloc(input.length);
const outputLen = Buffer.alloc(4);

compress.async(input, input.length, output, outputLen, (err, result) => {
  if (err) throw err;
  const compressed = output.slice(0, outputLen.readUInt32LE(0));
  console.log("Compression ratio:", compressed.length / input.length);
});
```

进程池架构：C++ 模块是 CPU 密集型，会阻塞 Node.js 事件循环。我设计了一个进程池，将计算任务分发到多个 Worker 进程：

```javascript
const { Worker } = require("worker_threads");

class WorkerPool {
  constructor(size) {
    this.workers = [];
    this.queue = [];

    for (let i = 0; i < size; i++) {
      const worker = new Worker("./worker.js");
      worker.on("message", (result) => {
        const task = this.queue.shift();
        task.resolve(result);
      });
      this.workers.push({ worker, busy: false });
    }
  }

  execute(task) {
    return new Promise((resolve, reject) => {
      const worker = this.workers.find((w) => !w.busy);
      if (worker) {
        worker.busy = true;
        worker.worker.postMessage(task);
        worker.worker.once("message", (result) => {
          worker.busy = false;
          resolve(result);
        });
      } else {
        this.queue.push({ task, resolve, reject });
      }
    });
  }
}
```

遇到的问题：

1. 内存泄漏：C++ 模块内部分配了内存但未释放。使用 valgrind 定位到问题，修复 C++ 代码。
2. 段错误：传递了无效的 Buffer 指针，导致 C++ 模块访问非法内存。增加了参数校验和空指针检查。
3. ABI 不兼容：Node.js 和 C++ 模块使用了不同的 C++ 标准库版本。统一使用 libstdc++ 并设置 `-fPIC` 编译选项。
4. 并发安全：C++ 模块不是线程安全的，多个 Worker 同时调用导致数据竞争。在 C++ 层加锁，或在 Node.js 层使用队列串行化。

性能优化：使用共享内存（`SharedArrayBuffer`）减少数据拷贝，使用异步调用避免阻塞事件循环，使用进程池充分利用多核 CPU。最终性能：单次压缩 10MB 数据耗时 50ms（C++）vs 800ms（纯 JS），提升 16 倍。

---

### Q23: 腾讯 IEG 用 valgrind 排查内存泄漏的过程是怎样的？

A: Valgrind 是 Linux 下的内存调试工具，我在腾讯 IEG 用它排查 C++ 模块的内存泄漏问题。

问题现象：NoSQL 管理系统运行 24 小时后，内存占用从 2GB 增长到 8GB，且不会回落。初步判断存在内存泄漏。

排查步骤：

Step 1: 使用 valgrind 运行程序

```bash
valgrind --leak-check=full \
         --show-leak-kinds=all \
         --track-origins=yes \
         --log-file=valgrind.log \
         node server.js
```

参数说明：

- `--leak-check=full`：详细报告每个泄漏的分配位置
- `--show-leak-kinds=all`：显示所有类型的泄漏（definite、indirect、possible、reachable）
- `--track-origins=yes`：追踪未初始化变量的来源

Step 2: 分析 valgrind 日志

```
==12345== 1,048,576 bytes in 1 blocks are definitely lost in loss record 5 of 5
==12345==    at 0x4C2AB80: malloc (in /usr/lib/valgrind/vgpreload_memcheck-amd64-linux.so)
==12345==    by 0x5A3F2E1: compress_data (compress.cpp:42)
==12345==    by 0x5A3F4A9: batch_compress (compress.cpp:87)
==12345==    by 0x10B8F2: Napi::Function::Call(...) (napi-inl.h:1234)
```

日志显示 `compress.cpp:42` 行分配了 1MB 内存但未释放。

Step 3: 定位代码

```cpp
// compress.cpp:42
int compress_data(const char* input, int input_len, char* output, int* output_len) {
    char* temp_buffer = (char*)malloc(1024 * 1024); // 泄漏点
    // ... 压缩逻辑 ...
    *output_len = compressed_len;
    // 忘记 free(temp_buffer);
    return 0;
}
```

Step 4: 修复

```cpp
int compress_data(const char* input, int input_len, char* output, int* output_len) {
    char* temp_buffer = (char*)malloc(1024 * 1024);
    // ... 压缩逻辑 ...
    *output_len = compressed_len;

    free(temp_buffer); // 添加释放
    return 0;
}
```

优化方案：使用 RAII（Resource Acquisition Is Initialization）模式，用智能指针自动管理内存：

```cpp
int compress_data(const char* input, int input_len, char* output, int* output_len) {
    std::unique_ptr<char[]> temp_buffer(new char[1024 * 1024]);
    // ... 压缩逻辑 ...
    // temp_buffer 自动释放
    return 0;
}
```

其他泄漏场景：

- 未关闭的文件描述符：使用 `lsof` 检查
- 未清理的定时器：使用 `clearInterval` / `clearTimeout`
- 事件监听器未移除：使用 `removeListener`

预防措施：

- 代码审查时重点关注资源分配和释放
- 使用 AddressSanitizer（ASan）在 CI 中检测内存问题
- 定期运行 valgrind 做回归测试

---

### Q24: 腾讯 IEG 的 v8 隐藏类和对象池优化是怎么做的？

A: V8 引擎通过隐藏类（Hidden Class）和内联缓存（Inline Cache）优化对象属性访问。我利用这些机制优化了 NoSQL 管理系统的性能。

隐藏类原理：V8 为每个对象创建隐藏类（也叫 Shape 或 Map），记录对象的属性布局。当多个对象具有相同的属性添加顺序时，它们共享同一个隐藏类，V8 可以生成高效的机器码访问属性。

```javascript
// 好的实践：一致的属性顺序
function createPoint(x, y) {
  return { x, y }; // 所有 Point 对象共享隐藏类
}

const p1 = createPoint(1, 2);
const p2 = createPoint(3, 4);
// p1 和 p2 共享隐藏类，属性访问被优化

// 坏的实践：动态添加属性
const p3 = { x: 1, y: 2 };
p3.z = 3; // 创建新的隐藏类，导致去优化
```

优化策略 1: 构造函数初始化所有属性

```javascript
// Before: 动态添加属性
class DataRecord {
  constructor(id) {
    this.id = id;
    // value 和 timestamp 后续动态添加
  }
}

const record = new DataRecord(1);
record.value = 100; // 触发隐藏类转换
record.timestamp = Date.now(); // 再次触发

// After: 构造函数中初始化所有属性
class DataRecord {
  constructor(id, value, timestamp) {
    this.id = id;
    this.value = value;
    this.timestamp = timestamp;
  }
}

const record = new DataRecord(1, 100, Date.now());
// 所有实例共享隐藏类
```

优化策略 2: 避免删除属性

```javascript
// Bad: delete 会导致隐藏类退化为字典模式
delete record.value;

// Good: 设为 undefined 或 null
record.value = undefined;
```

对象池优化：对于频繁创建/销毁的对象（如网络请求上下文、日志条目），使用对象池复用实例，降低 GC 压力。

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

// 使用示例
const requestContextPool = new ObjectPool(
  () => ({ requestId: "", headers: {}, body: null, timestamp: 0 }),
  (ctx) => {
    ctx.requestId = "";
    ctx.headers = {};
    ctx.body = null;
    ctx.timestamp = 0;
  },
);

// 处理请求
const ctx = requestContextPool.acquire();
ctx.requestId = generateId();
ctx.headers = parseHeaders(req);
// ... 处理逻辑 ...
requestContextPool.release(ctx);
```

性能效果：

- 隐藏类优化：属性访问速度提升 2-3 倍
- 对象池优化：GC 暂停时间从 50ms 降至 10ms，吞吐量提升 30%
- 综合效果：API 响应时间 P99 从 120ms 降至 80ms

验证方法：使用 V8 的 `--trace-ic` 和 `--trace-opt` 标志观察内联缓存和 JIT 编译情况，使用 Chrome DevTools 的 Memory 面板观察 GC 频率和暂停时间。

---

### Q25: 字节 Data 部门的 JSError LLM 自动修复是怎么做的？收益是什么？

A: 字节 Data 部门的搜索推荐算法平台日均产生 5000+ 条 JSError，人工修复成本高。我设计了一套 LLM 自动修复系统，将修复效率提升 80%。

系统架构：

```
JSError Report → Error Parser → Context Collector → LLM Fix Generator
  → Code Validator → Human Review → Auto Commit
```

Step 1: Error Parser。解析 JSError 堆栈，提取关键信息：

```javascript
function parseError(errorReport) {
  return {
    message: errorReport.message,
    stack: errorReport.stack,
    sourceFile: extractSourceFile(errorReport.stack),
    lineNumber: extractLineNumber(errorReport.stack),
    componentStack: errorReport.componentStack, // React 组件栈
    userAgent: errorReport.userAgent,
    timestamp: errorReport.timestamp,
  };
}
```

Step 2: Context Collector。收集相关代码上下文：

```javascript
async function collectContext(parsedError) {
  const sourceCode = await getSourceCode(parsedError.sourceFile);
  const relatedFiles = await findRelatedFiles(parsedError.sourceFile);
  const recentCommits = await getRecentCommits(parsedError.sourceFile, 7); // 最近 7 天的提交
  const similarErrors = await findSimilarErrors(parsedError.message, 10);

  return {
    sourceCode,
    relatedFiles,
    recentCommits,
    similarErrors,
  };
}
```

Step 3: LLM Fix Generator。构建 Prompt，调用 LLM 生成修复代码：

```javascript
const prompt = `You are a senior frontend engineer. Fix the following JavaScript error.

Error: ${parsedError.message}
Stack: ${parsedError.stack}

Source Code (file: ${parsedError.sourceFile}):
\`\`\`javascript
${context.sourceCode}
\`\`\`

Recent Commits (last 7 days):
${context.recentCommits.map((c) => `- ${c.message}`).join("\n")}

Similar Errors and Fixes:
${context.similarErrors.map((e) => `- ${e.message} -> ${e.fix}`).join("\n")}

Provide:
1. Root cause analysis
2. Fixed code (only the changed lines)
3. Test case to verify the fix
`;

const response = await llm.chat([{ role: "user", content: prompt }]);
const fix = parseFixFromResponse(response);
```

Step 4: Code Validator。验证修复代码的正确性：

```javascript
async function validateFix(fix, context) {
  // 语法检查
  if (!isValidJavaScript(fix.code)) {
    return { valid: false, reason: "Invalid JavaScript syntax" };
  }

  // 类型检查
  const typeErrors = await runTypeCheck(fix.code, context.relatedFiles);
  if (typeErrors.length > 0) {
    return { valid: false, reason: "Type errors", details: typeErrors };
  }

  // 单元测试
  const testResult = await runTests(fix.testCase);
  if (!testResult.passed) {
    return { valid: false, reason: "Test failed", details: testResult.output };
  }

  return { valid: true, fix };
}
```

Step 5: Human Review。将验证通过的修复方案提交给人工审核，审核通过后自动创建 PR。

收益：

- 修复效率：从平均 2 小时/条降至 20 分钟/条（含人工审核）
- 自动修复率：65%（3250/5000 条/日）
- 准确率：92%（验证通过的修复方案中，人工审核通过率）
- 节省人力：约 3 人/天

常见修复类型：

- 空值检查缺失（35%）：添加 `if (obj?.prop)` 或默认值
- 异步竞态（25%）：添加 cleanup 函数或 AbortController
- 类型错误（20%）：修正类型转换或添加类型守卫
- 依赖缺失（15%）：添加 useEffect 依赖项
- 其他（5%）：边界条件、兼容性等

---

### Q26: 字节 Data 部门的 SWR 前端性能优化具体做了什么？

A: SWR（stale-while-revalidate）是 Vercel 提出的数据请求策略，我在字节 Data 部门的搜索推荐算法平台中应用，显著提升了用户体验。

SWR 原理：先返回缓存数据（stale），同时后台重新请求（revalidate），请求完成后更新缓存并触发重渲染。用户感知到的是"瞬间加载"。

基础用法：

```typescript
import useSWR from 'swr';

function UserProfile({ userId }: { userId: string }) {
  const { data, error, isLoading, isValidating } = useSWR(
    `/api/user/${userId}`,
    fetcher,
    {
      revalidateOnFocus: true,  // 窗口获得焦点时重新请求
      revalidateOnReconnect: true, // 网络恢复时重新请求
      dedupingInterval: 2000,   // 2 秒内去重
    }
  );

  if (error) return <ErrorView error={error} />;
  if (isLoading) return <Skeleton />;

  return (
    <div>
      {isValidating && <LoadingIndicator />}
      <UserCard user={data} />
    </div>
  );
}
```

优化 1: 预请求（Preload）。用户 hover 列表项时，预请求详情页数据：

```typescript
function AlgorithmList({ algorithms }: { algorithms: Algorithm[] }) {
  const preload = (id: string) => {
    const key = `/api/algorithm/${id}`;
    if (!cache.has(key)) {
      mutate(key, fetcher(key), false); // 预请求但不触发重渲染
    }
  };

  return (
    <ul>
      {algorithms.map(algo => (
        <li
          key={algo.id}
          onMouseEnter={() => preload(algo.id)}
        >
          <Link to={`/algorithm/${algo.id}`}>{algo.name}</Link>
        </li>
      ))}
    </ul>
  );
}
```

优化 2: 乐观更新（Optimistic Update）。用户操作后立即更新 UI，请求失败时回滚：

```typescript
function ToggleFavorite({ algorithmId, isFavorite }: Props) {
  const { mutate } = useSWRConfig();

  const toggle = async () => {
    // 乐观更新
    mutate(`/api/algorithm/${algorithmId}`, (current) => ({
      ...current,
      isFavorite: !isFavorite
    }), false);

    try {
      await api.toggleFavorite(algorithmId);
    } catch (err) {
      // 失败回滚
      mutate(`/api/algorithm/${algorithmId}`);
      toast.error('操作失败，请重试');
    }
  };

  return <Button onClick={toggle}>{isFavorite ? '取消收藏' : '收藏'}</Button>;
}
```

优化 3: 分页 + 无限滚动。使用 SWR Infinite 实现无限滚动列表：

```typescript
function AlgorithmFeed() {
  const { data, size, setSize, isLoadingMore } = useSWRInfinite(
    (index) => `/api/algorithms?page=${index}&limit=20`,
    fetcher
  );

  const algorithms = data ? [].concat(...data.map(page => page.items)) : [];
  const isLoadingMore = isLoadingMore || (size > 0 && data && typeof data[size - 1] === 'undefined');
  const isReachingEnd = data && data[data.length - 1]?.items.length < 20;

  return (
    <div>
      {algorithms.map(algo => <AlgorithmCard key={algo.id} algorithm={algo} />)}
      {!isReachingEnd && (
        <Button
          onClick={() => setSize(size + 1)}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? '加载中...' : '加载更多'}
        </Button>
      )}
    </div>
  );
}
```

性能效果：

- 首屏加载时间：从 2.5s 降至 0.8s（缓存命中）
- 页面切换延迟：从 800ms 降至 100ms（预请求）
- 用户操作响应：从 500ms 降至 50ms（乐观更新）
- 网络请求数：减少 40%（去重 + 缓存）

---

### Q27: A2UI 是什么框架？你是怎么接入的？

A: A2UI（AI to UI）是字节内部开发的 AI 驱动 UI 生成框架，核心理念是通过自然语言描述生成 React 组件。我在字节 Data 部门和阿里妈妈广告技术部都参与了 A2UI 的接入工作。

A2UI 架构：

```
Natural Language Description → LLM → Component Schema → React Component
                                         ↓
                                   Component Registry
                                   (预定义组件库)
```

工作原理：

1. 用户输入自然语言描述（如"创建一个表格，显示算法名称、准确率和调用次数"）
2. LLM 解析描述，生成 Component Schema（JSON 格式）
3. Schema 渲染器根据 Schema 从 Component Registry 中选择组件并组合
4. 输出可交互的 React 组件

Schema 示例：

```json
{
  "type": "Table",
  "props": {
    "dataSource": "{{api.getAlgorithms()}}",
    "columns": [
      { "title": "算法名称", "dataIndex": "name" },
      { "title": "准确率", "dataIndex": "accuracy", "render": "percentage" },
      { "title": "调用次数", "dataIndex": "callCount", "render": "number" }
    ]
  }
}
```

接入步骤：

Step 1: 安装依赖

```bash
npm install @bytedance/a2ui-core @bytedance/a2ui-components
```

Step 2: 注册组件

```typescript
import { registerComponent } from "@bytedance/a2ui-core";
import { Table, Chart, Form, Card } from "@bytedance/a2ui-components";

registerComponent("Table", Table);
registerComponent("Chart", Chart);
registerComponent("Form", Form);
registerComponent("Card", Card);
```

Step 3: 创建渲染器

```typescript
import { SchemaRenderer } from '@bytedance/a2ui-core';

function A2UIPage({ description }: { description: string }) {
  const [schema, setSchema] = useState(null);

  useEffect(() => {
    // 调用 LLM 生成 Schema
    generateSchema(description).then(setSchema);
  }, [description]);

  if (!schema) return <Loading />;

  return <SchemaRenderer schema={schema} />;
}
```

Step 4: 集成到现有系统

```typescript
function AlgorithmDashboard() {
  const [mode, setMode] = useState<'traditional' | 'a2ui'>('traditional');

  return (
    <div>
      <Switch
        checked={mode === 'a2ui'}
        onChange={(checked) => setMode(checked ? 'a2ui' : 'traditional')}
      />

      {mode === 'a2ui' ? (
        <A2UIPage description="显示算法性能对比表格和趋势图" />
      ) : (
        <TraditionalDashboard />
      )}
    </div>
  );
}
```

挑战与解决：

1. LLM 生成不稳定：同一描述可能生成不同 Schema。通过 Few-shot Prompt 和 Schema 校验解决。
2. 组件能力有限：复杂交互（如拖拽排序）难以用 Schema 描述。扩展了 Schema 语法，支持自定义事件和状态。
3. 性能问题：大型 Schema 渲染慢。实现了虚拟滚动和懒加载。

收益：

- 开发效率：简单页面从 2 天降至 10 分钟
- 非技术人员参与：产品经理可以直接描述需求，减少沟通成本
- 迭代速度：UI 调整只需修改描述，无需改代码

---

### Q28: 阿里妈妈广告技术部的 Server&Schema-Driven UI 是怎么做的？

A: Server&Schema-Driven UI 是一种服务端驱动 UI 渲染的架构，服务端返回 Schema（数据结构 + 布局描述），前端根据 Schema 动态渲染组件。我在阿里妈妈广告技术部负责广告配置平台的 Server-Driven UI 实现。

架构设计：

```
Admin Console → API Server → Schema Generator → JSON Schema
                                                      ↓
Frontend ← Schema Renderer ← Component Registry ← JSON Schema
```

Schema 设计：

```json
{
  "version": "1.0",
  "layout": {
    "type": "Page",
    "children": [
      {
        "type": "Header",
        "props": { "title": "广告投放配置" }
      },
      {
        "type": "Form",
        "props": {
          "api": "/api/ad/config",
          "fields": [
            {
              "name": "budget",
              "label": "日预算",
              "type": "NumberInput",
              "rules": [{ "required": true, "message": "请输入日预算" }]
            },
            {
              "name": "targetAudience",
              "label": "目标人群",
              "type": "Select",
              "options": "{{api.getAudiences()}}"
            }
          ]
        }
      },
      {
        "type": "Table",
        "props": {
          "api": "/api/ad/list",
          "columns": [
            { "title": "广告ID", "dataIndex": "id" },
            { "title": "状态", "dataIndex": "status", "render": "statusTag" }
          ],
          "actions": [
            { "label": "编辑", "type": "link", "href": "/ad/edit/{{id}}" }
          ]
        }
      }
    ]
  }
}
```

前端渲染器：

```typescript
function SchemaRenderer({ schema }: { schema: Schema }) {
  const Component = componentRegistry.get(schema.type);

  if (!Component) {
    return <div>Unknown component: {schema.type}</div>;
  }

  // 解析动态数据源
  const resolvedProps = useResolveProps(schema.props);

  // 递归渲染子组件
  const children = schema.children?.map((child, index) => (
    <SchemaRenderer key={index} schema={child} />
  ));

  return <Component {...resolvedProps}>{children}</Component>;
}

// 动态数据源解析
function useResolveProps(props: any) {
  const [resolved, setResolved] = useState({});

  useEffect(() => {
    const promises = Object.entries(props)
      .filter(([_, value]) => typeof value === 'string' && value.startsWith('{{api.'))
      .map(async ([key, value]) => {
        const apiCall = value.match(/\{\{api\.(.+?)\(\)\}\}/)?.[1];
        if (apiCall) {
          const data = await api[apiCall]();
          return [key, data];
        }
        return [key, value];
      });

    Promise.all(promises).then(results => {
      setResolved(Object.fromEntries(results));
    });
  }, [props]);

  return { ...props, ...resolved };
}
```

优势：

1. 快速迭代：UI 调整只需修改服务端 Schema，无需前端发版
2. A/B 测试：不同用户返回不同 Schema，轻松实现 UI 实验
3. 权限控制：根据用户角色过滤 Schema 中的字段和按钮
4. 多端适配：同一 Schema 可渲染 Web、移动端、小程序

挑战：

1. 复杂交互：拖拽、动画等难以用 Schema 描述。解决方案：扩展 Schema 支持自定义事件和状态管理。
2. 性能：大型 Schema 解析和渲染慢。解决方案：Schema 缓存、虚拟滚动、懒加载。
3. 类型安全：Schema 是 JSON，缺少类型检查。解决方案：使用 JSON Schema 校验 + TypeScript 类型生成。

实际效果：

- 配置页面开发时间：从 3 天降至 2 小时
- 线上 Bug 率：降低 60%（服务端统一校验）
- A/B 测试效率：从 1 周降至 1 天

---

### Q29: 模块联邦是什么？你是怎么接入的？@module-federation/vite 你贡献了什么？

A: Module Federation（模块联邦）是 Webpack 5 引入的特性，允许多个独立构建的应用共享模块。我在阿里妈妈广告技术部负责接入模块联邦，并为 `@module-federation/vite` 开源项目贡献了代码。

模块联邦原理：

```
App A (Host)                    App B (Remote)
    ↓                               ↓
加载 Remote Entry ←──────────── 暴露 Remote Entry
    ↓                               ↓
运行时导入共享模块 ←──────────→ 运行时导入共享模块
```

Webpack 配置：

```javascript
// webpack.config.js (Host App)
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "host",
      remotes: {
        adPlatform: "adPlatform@https://ad.example.com/remoteEntry.js",
      },
      shared: {
        react: { singleton: true, requiredVersion: "^18.0.0" },
        "react-dom": { singleton: true, requiredVersion: "^18.0.0" },
      },
    }),
  ],
};

// webpack.config.js (Remote App)
module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "adPlatform",
      filename: "remoteEntry.js",
      exposes: {
        "./AdEditor": "./src/components/AdEditor",
        "./AnalyticsChart": "./src/components/AnalyticsChart",
      },
      shared: {
        react: { singleton: true },
        "react-dom": { singleton: true },
      },
    }),
  ],
};
```

使用方式：

```typescript
// Host App
import React, { lazy, Suspense } from 'react';

const AdEditor = lazy(() => import('adPlatform/AdEditor'));

function CampaignPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdEditor campaignId={123} />
    </Suspense>
  );
}
```

Vite 接入：Vite 原生不支持模块联邦，需要使用 `@module-federation/vite` 插件：

```typescript
// vite.config.ts
import { federation } from "@module-federation/vite";

export default defineConfig({
  plugins: [
    federation({
      name: "adPlatform",
      filename: "remoteEntry.js",
      exposes: {
        "./AdEditor": "./src/components/AdEditor.tsx",
      },
      remotes: {
        analytics: "http://analytics.example.com/remoteEntry.js",
      },
      shared: {
        react: { singleton: true },
        "react-dom": { singleton: true },
      },
    }),
  ],
});
```

我的贡献：

1. 修复 HMR 兼容性问题：Vite 的 HMR 在模块联邦场景下会失效。我分析了原因（模块 ID 映射错误），提交了 PR 修复。
2. 优化共享模块加载：原始实现会重复加载共享模块，导致 Bundle Size 增加。我实现了依赖图分析，确保共享模块只加载一次。
3. 添加 TypeScript 类型生成：为 exposed 模块自动生成 `.d.ts` 文件，提升开发体验。

```typescript
// 我添加的功能：自动生成类型声明
function generateTypeDeclarations(exposes: Record<string, string>) {
  const declarations = Object.entries(exposes).map(([name, path]) => {
    const types = extractTypes(path);
    return `declare module '${name}' {\n${types}\n}`;
  });

  fs.writeFileSync("module-federation.d.ts", declarations.join("\n\n"));
}
```

收益：

- 构建时间：从 5 分钟降至 1 分钟（Vite 比 Webpack 快 5 倍）
- 首屏加载：减少 30%（共享依赖去重）
- 团队协作：各团队独立开发和部署，通过模块联邦集成

---

## 三、技能基础

### Q30: React Fiber 架构原理是什么？解决了什么问题？

A: React Fiber 是 React 16 引入的新协调引擎，解决了 React 15 的"大组件树渲染卡顿"问题。

React 15 的问题：协调过程是同步递归的，一旦开始就无法中断。如果组件树很大（如 1000+ 节点），递归会长时间占用主线程，导致动画、用户输入等高优先级任务被阻塞，页面出现卡顿。

Fiber 的核心思想：将渲染工作拆分为可中断的Fiber 单元，每个 Fiber 对应一个组件实例。协调过程变为可中断的循环，而非不可中断的递归。

Fiber 节点结构：

```typescript
interface Fiber {
  // 节点类型和 key
  tag: WorkTag;
  key: null | string;
  type: any;

  // 树结构
  return: Fiber | null; // 父节点
  child: Fiber | null; // 第一个子节点
  sibling: Fiber | null; // 兄弟节点

  // 工作状态
  pendingProps: any; // 新的 props
  memoizedProps: any; // 上次渲染的 props
  memoizedState: any; // 上次渲染的 state
  updateQueue: any; // 更新队列

  // 副作用
  flags: Flags; // 副作用标记（增删改）
  subtreeFlags: Flags; // 子树的副作用

  // 双缓冲
  alternate: Fiber | null; // 指向另一棵树的对应节点
}
```

双缓冲机制：React 维护两棵 Fiber 树：current（当前显示）和 workInProgress（正在构建）。更新时在 workInProgress 上计算，完成后交换指针（commit），实现无缝切换。

可中断渲染：

```typescript
function workLoopConcurrent() {
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}

function shouldYield() {
  // 检查是否有高优先级任务（如用户输入）
  // 或者当前帧时间已用完（16.6ms）
  return getCurrentTime() >= frameDeadline;
}

function performUnitOfWork(unitOfWork: Fiber) {
  const next = beginWork(unitOfWork);

  if (next === null) {
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }
}
```

优先级调度：Fiber 将更新分为多个优先级（Sync、Input、Default、Transition、Idle），高优先级更新可以打断低优先级更新：

```typescript
// 用户点击（高优先级）
<button onClick={() => setState('clicked')}>

// 数据预取（低优先级）
startTransition(() => {
  fetchData().then(data => setState(data));
});
```

解决的问题：

1. 动画卡顿：动画更新（高优先级）可以打断数据渲染（低优先级）
2. 用户输入延迟：输入事件可以中断长列表渲染
3. Offscreen 渲染：预渲染不在视口的组件，不阻塞当前页面

实际效果：React 16+ 的交互响应时间比 React 15 快 2-3 倍，长任务被拆分为多个小任务，主线程不会被长时间占用。

---

### Q31: Vue3 响应式原理是什么？Proxy 和 defineProperty 的区别？

A: Vue3 使用 Proxy 实现响应式，替代了 Vue2 的 `Object.defineProperty`，解决了多个痛点问题。

Vue2 的 defineProperty 方案：

```javascript
function defineReactive(obj, key) {
  let value = obj[key];

  Object.defineProperty(obj, key, {
    get() {
      track(obj, key); // 收集依赖
      return value;
    },
    set(newValue) {
      if (newValue === value) return;
      value = newValue;
      trigger(obj, key); // 触发更新
    },
  });
}
```

问题：

1. 无法检测属性添加/删除：需要 `Vue.set` / `Vue.delete`
2. 无法检测数组索引修改：需要 `Vue.set(arr, index, value)`
3. 无法检测数组长度变化：需要重写数组方法（push、pop 等）
4. 嵌套对象需要递归初始化：性能开销大

Vue3 的 Proxy 方案：

```javascript
function reactive(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      const result = Reflect.get(target, key, receiver);
      track(target, key); // 收集依赖

      // 嵌套对象惰性代理
      if (isObject(result)) {
        return reactive(result);
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
      const hadKey = hasOwn(target, key);
      const result = Reflect.deleteProperty(target, key);

      if (hadKey && result) {
        trigger(target, key);
      }
      return result;
    },
  });
}
```

Proxy 的优势：

1. 拦截整个对象：可以检测属性添加、删除、枚举等所有操作
2. 支持数组：数组索引修改、长度变化都能正确触发更新
3. 惰性代理：嵌套对象在访问时才代理，而非初始化时递归代理，性能更好
4. 13 种拦截方法：get、set、deleteProperty、has、ownKeys 等，能力更强

依赖收集与触发：

```javascript
const targetMap = new WeakMap();
let activeEffect = null;

function track(target, key) {
  if (!activeEffect) return;

  let depsMap = targetMap.get(target);
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()));
  }

  let dep = depsMap.get(key);
  if (!dep) {
    depsMap.set(key, (dep = new Set()));
  }

  dep.add(activeEffect);
}

function trigger(target, key) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;

  const effects = new Set();
  const dep = depsMap.get(key);

  if (dep) {
    dep.forEach((effect) => effects.add(effect));
  }

  effects.forEach((effect) => {
    if (effect.scheduler) {
      effect.scheduler(effect);
    } else {
      effect();
    }
  });
}
```

实际使用：

```javascript
const state = reactive({
  count: 0,
  user: { name: "Alice" },
});

effect(() => {
  console.log(state.count); // 自动收集依赖
});

state.count++; // 触发 effect 重新执行
state.user.name = "Bob"; // 嵌套属性也能触发
delete state.count; // 删除属性也能触发
```

性能对比：Vue3 的响应式系统比 Vue2 快 2-3 倍，内存占用减少 50%，主要得益于惰性代理和 WeakMap 的使用。

---

### Q32: Event Loop 中微任务和宏任务的区别是什么？

A: Event Loop 是 JavaScript 并发模型的核心，理解微任务和宏任务的区别对于编写高性能异步代码至关重要。

基本概念：

- 宏任务（Macro Task）：setTimeout、setInterval、I/O、UI Rendering、setImmediate（Node.js）
- 微任务（Micro Task）：Promise.then、MutationObserver、queueMicrotask、process.nextTick（Node.js）

执行顺序：

```javascript
console.log("1. Sync");

setTimeout(() => {
  console.log("2. Macro Task (setTimeout)");
}, 0);

Promise.resolve().then(() => {
  console.log("3. Micro Task (Promise)");
});

console.log("4. Sync");

// 输出顺序：
// 1. Sync
// 4. Sync
// 3. Micro Task (Promise)
// 2. Macro Task (setTimeout)
```

Event Loop 流程：

```
1. 执行同步代码（调用栈清空）
2. 检查微任务队列，依次执行所有微任务
3. 执行一个宏任务
4. 重复步骤 2-3
```

关键区别：

| 特性     | 微任务                               | 宏任务                       |
| -------- | ------------------------------------ | ---------------------------- |
| 执行时机 | 当前宏任务结束后，下一个宏任务开始前 | 下一个 Event Loop 迭代       |
| 优先级   | 高                                   | 低                           |
| 队列数量 | 单队列                               | 多队列（每种宏任务一个队列） |
| 典型场景 | Promise、DOM 变化监听                | 定时器、网络请求、用户事件   |

实际场景：

场景 1: Promise 链

```javascript
Promise.resolve()
  .then(() => console.log("1"))
  .then(() => console.log("2"));

Promise.resolve().then(() => console.log("3"));

// 输出：1, 3, 2
// 解释：第一轮微任务执行 1 和 3，第二轮执行 2
```

场景 2: MutationObserver vs setTimeout

```javascript
const observer = new MutationObserver(() => {
  console.log("1. MutationObserver (Micro)");
});
observer.observe(document.body, { childList: true });

setTimeout(() => {
  console.log("2. setTimeout (Macro)");
}, 0);

document.body.appendChild(document.createElement("div"));

// 输出：1, 2
// 解释：DOM 变化触发微任务，先于 setTimeout 执行
```

场景 3: Vue 的 nextTick

```javascript
// Vue 2: 使用 Promise.then / MutationObserver / setImmediate / setTimeout
// Vue 3: 统一使用 Promise.then

Vue.nextTick(() => {
  console.log("DOM 已更新");
});

// 原理：将回调放入微任务队列，确保在当前宏任务的同步代码和微任务都执行完后，
// 再执行 DOM 更新和回调
```

性能优化：

1. 避免微任务堆积：大量微任务会阻塞渲染，应该分批执行或使用宏任务让出主线程
2. 合理使用 Promise：Promise.then 是微任务，会立即执行，不适合延迟操作
3. 长任务拆分：使用 setTimeout 将长任务拆分为多个宏任务，避免阻塞 UI

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

---

### Q33: TypeScript 严格类型和 Zod 校验怎么配合使用？

A: TypeScript 提供编译时类型检查，Zod 提供运行时数据校验，两者结合可以实现端到端的类型安全。

基础用法：

```typescript
import { z } from "zod";

// 定义 Schema
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(50),
  email: z.string().email(),
  age: z.number().int().min(0).max(150).optional(),
  role: z.enum(["admin", "user", "guest"]),
});

// 从 Schema 推导类型
type User = z.infer<typeof UserSchema>;

// 编译时类型安全
function createUser(user: User) {
  console.log(user.name); // TypeScript 知道 user.name 是 string
}

// 运行时校验
function parseUser(data: unknown): User {
  return UserSchema.parse(data); // 校验失败会抛出 ZodError
}
```

API 请求校验：

```typescript
const CreateUserRequestSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

// Express 中间件
function validateRequest(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: "Validation failed",
          details: err.errors,
        });
      } else {
        next(err);
      }
    }
  };
}

app.post("/users", validateRequest(CreateUserRequestSchema), (req, res) => {
  const user: CreateUserRequest = req.body; // 类型安全
  // ...
});
```

环境变量校验：

```typescript
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
});

type Env = z.infer<typeof EnvSchema>;

// 启动时校验环境变量
const env = EnvSchema.parse(process.env);
// 后续使用 env.PORT 等，类型安全且有默认值
```

复杂场景：表单校验：

```typescript
const LoginFormSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(8, '密码至少 8 位'),
  rememberMe: z.boolean().optional()
}).refine(
  (data) => data.password !== '12345678',
  { message: '密码过于简单', path: ['password'] }
);

type LoginForm = z.infer<typeof LoginFormSchema>;

function LoginForm({ onSubmit }: { onSubmit: (data: LoginForm) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);

    const result = LoginFormSchema.safeParse(data);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        const path = err.path.join('.');
        fieldErrors[path] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    onSubmit(result.data);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" />
      {errors.email && <span>{errors.email}</span>}

      <input name="password" type="password" />
      {errors.password && <span>{errors.password}</span>}

      <button type="submit">登录</button>
    </form>
  );
}
```

TypeScript + Zod 的最佳实践：

1. Schema 单一数据源：用 Zod Schema 作为唯一数据源，通过 `z.infer` 推导类型，避免手动维护类型和校验逻辑的同步
2. safeParse vs parse：生产环境使用 `safeParse`（返回 Result 类型），避免未捕获的异常
3. 自定义校验：使用 `.refine()` 和 `.superRefine()` 实现跨字段校验
4. 序列化/反序列化：使用 `z.preprocess()` 处理 JSON 序列化导致的类型变化（如 Date → string）

```typescript
const EventSchema = z.object({
  name: z.string(),
  date: z.preprocess(
    (val) => (typeof val === "string" ? new Date(val) : val),
    z.date(),
  ),
});
```

---

### Q34: Go 的 goroutine 和 channel 并发模型原理是什么？

A: Go 的并发模型基于 CSP（Communicating Sequential Processes），核心是 goroutine（轻量级线程）和 channel（通信管道）。

Goroutine 原理：

Goroutine 是 Go 运行时管理的用户态线程，由 GMP 调度器调度：

- G（Goroutine）：用户态线程，包含栈、任务队列等
- M（Machine）：操作系统线程，由 OS 调度
- P（Processor）：逻辑处理器，维护一个本地 Goroutine 队列

```
P0 (本地队列: G1, G2, G3)  ───  M0 (执行 G1)
P1 (本地队列: G4, G5, G6)  ───  M1 (执行 G4)
P2 (本地队列: G7, G8, G9)  ───  M2 (执行 G7)
         ↑
    全局队列 (G10, G11, G12...)
```

调度流程：

1. M 必须绑定 P 才能执行 G
2. P 的数量由 `GOMAXPROCS` 决定（默认等于 CPU 核数）
3. M 执行完当前 G 后，从绑定的 P 的本地队列取下一个 G
4. 本地队列为空时，从全局队列或其他 P 偷取（work stealing）

Goroutine 的轻量级体现在：

- 初始栈仅 2KB（可动态扩容）
- 创建/销毁开销 < 1μs（OS 线程 ~1ms）
- 切换只涉及少量寄存器（OS 线程需要保存完整上下文）
- 可以轻松创建 100 万个 goroutine

```go
// 启动 100 万个 goroutine
for i := 0; i < 1000000; i++ {
    go func(n int) {
        fmt.Println(n)
    }(i)
}
```

Channel 原理：

Channel 是 goroutine 之间通信的管道，底层是一个带锁的环形队列：

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

有缓冲 vs 无缓冲：

```go
// 有缓冲：发送不阻塞（直到缓冲区满）
ch := make(chan int, 100)
go func() { ch <- 1 }() // 立即返回
go func() { ch <- 2 }() // 立即返回

// 无缓冲：发送和接收必须配对，否则阻塞
ch := make(chan int)
go func() { ch <- 1 }() // 阻塞，直到有人接收
val := <-ch             // 接收，发送方解除阻塞
```

经典并发模式：

Worker Pool：

```go
func workerPool(jobs []Job, workerCount int) []Result {
    jobCh := make(chan Job, len(jobs))
    resultCh := make(chan Result, len(jobs))

    // 启动 worker
    for i := 0; i < workerCount; i++ {
        go func() {
            for job := range jobCh {
                resultCh <- processJob(job)
            }
        }()
    }

    // 发送任务
    for _, job := range jobs {
        jobCh <- job
    }
    close(jobCh)

    // 收集结果
    results := make([]Result, 0, len(jobs))
    for i := 0; i < len(jobs); i++ {
        results = append(results, <-resultCh)
    }
    return results
}
```

Fan-out / Fan-in：

```go
func fanOut(input <-chan Data, workerCount int) []<-chan Result {
    channels := make([]<-chan Result, workerCount)
    for i := 0; i < workerCount; i++ {
        channels[i] = worker(input)
    }
    return channels
}

func fanIn(channels ...<-chan Result) <-chan Result {
    merged := make(chan Result)
    var wg sync.WaitGroup

    for _, ch := range channels {
        wg.Add(1)
        go func(c <-chan Result) {
            defer wg.Done()
            for v := range c {
                merged <- v
            }
        }(ch)
    }

    go func() {
        wg.Wait()
        close(merged)
    }()

    return merged
}
```

与 Node.js 的对比：Go 的并发模型更适合 CPU 密集型任务（真正的多核并行），Node.js 的单线程 + 事件循环更适合 I/O 密集型任务。在 TikTok Performance 团队，我用 Go 处理数据聚合（CPU 密集），用 Node.js 做 BFF 层（I/O 密集）。

---

### Q35: Vite 和 Webpack 的核心区别是什么？Vite 为什么快？

A: Vite 和 Webpack 的核心区别在于开发模式下的打包策略：Webpack 先打包再启动服务器，Vite 先启动服务器再按需编译。

Webpack 的开发流程：

```
1. 扫描所有依赖，构建完整依赖图
2. 编译所有模块（包括未使用的）
3. 打包成 bundle
4. 启动开发服务器
5. 返回 bundle

启动时间：大型项目 30-120 秒
```

Vite 的开发流程：

```
1. 启动开发服务器（几乎即时）
2. 浏览器请求某个模块
3. Vite 按需编译该模块及其依赖
4. 返回 ESM 格式的模块

启动时间：大型项目 1-3 秒
```

Vite 快的原因：

原因 1: 原生 ESM。利用浏览器原生支持的 ES Modules，不做打包，每个模块作为独立的 HTTP 请求返回：

```javascript
// Vite 返回的模块（简化）
// /src/App.vue
import { createVNode as _createVNode } from "/@modules/vue.js";
import HelloWorld from "/src/components/HelloWorld.vue";

export function render() {
  return _createVNode("div", null, [_createVNode(HelloWorld)]);
}
```

原因 2: 预构建依赖。使用 esbuild（Go 编写，比 JS 快 10-100 倍）预构建第三方依赖，将 CommonJS/UMD 转为 ESM：

```javascript
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    include: ["vue", "vue-router", "pinia"],
    exclude: ["@internal/legacy-module"],
  },
});
```

预构建结果缓存在 `node_modules/.vite`，后续启动直接读取缓存。

原因 3: HMR 不重新打包。模块更新时，Vite 只需重新编译变更的模块，浏览器通过 ESM 动态 import 替换旧模块：

```javascript
// Vite HMR 客户端（简化）
const hotModules = new Map();

export function createHotContext(id) {
  return {
    accept(callback) {
      hotModules.set(id, callback);
    },
  };
}

// 服务端通知更新
ws.on("message", (msg) => {
  if (msg.type === "update") {
    const mod = hotModules.get(msg.path);
    import(msg.path + "?t=" + Date.now()).then(mod.callback);
  }
});
```

Webpack 为什么慢：

1. 全量打包：开发模式下也要打包所有模块，大型项目依赖图构建耗时
2. JS 性能瓶颈：Webpack 核心用 JS 编写，CPU 密集型任务（如 AST 解析）性能受限
3. Loader 链式调用：每个文件要经过多个 Loader 串行处理

生产环境对比：

Vite 生产环境使用 Rollup 打包（也支持 Webpack），两者差异不大。主要差异在开发体验。

选择建议：

| 场景         | 推荐            | 原因                       |
| ------------ | --------------- | -------------------------- |
| 新项目       | Vite            | 启动快、配置简单           |
| 大型遗留项目 | Webpack         | 生态成熟、插件丰富         |
| 微前端       | Webpack 5       | Module Federation 原生支持 |
| Library 开发 | Vite (lib mode) | 构建快、输出格式灵活       |

在阿里妈妈广告技术部，我推动团队从 Webpack 迁移到 Vite，开发服务器启动时间从 4 分钟降至 8 秒，HMR 响应时间从 2 秒降至 200ms。

---

### Q36: CSS 模块化方案有哪些？各有什么优缺点？

A: CSS 模块化是前端工程化的重要课题，主流方案有 5 种，各有适用场景。

方案 1: CSS Modules

```css
/* Button.module.css */
.button {
  padding: 8px 16px;
  border-radius: 4px;
}

.button.primary {
  background-color: #1890ff;
  color: white;
}
```

```typescript
import styles from './Button.module.css';

function Button({ type = 'default' }) {
  return (
    <button className={`${styles.button} ${styles[type] || ''}`}>
      Click me
    </button>
  );
}
```

原理：构建时将类名哈希化（如 `.button` → `._button_1a2b3`），确保全局唯一。

优点：零运行时、类型安全（配合 typed-css-modules）、学习成本低
缺点：不支持动态样式、组合语法受限、调试时类名不可读

方案 2: CSS-in-JS（styled-components / Emotion）

```typescript
import styled from '@emotion/styled';

const Button = styled.button<{ primary?: boolean }>`
  padding: 8px 16px;
  border-radius: 4px;
  background-color: ${props => props.primary ? '#1890ff' : '#f0f0f0'};
  color: ${props => props.primary ? 'white' : '#333'};

  &:hover {
    opacity: 0.8;
  }
`;

function App() {
  return <Button primary>Click me</Button>;
}
```

优点：动态样式、主题系统、自动前缀、关键 CSS 内联
缺点：运行时开销（~10KB）、SSR 需要额外配置、调试困难

方案 3: Tailwind CSS（原子化）

```html
<button class="rounded bg-blue-500 px-4 py-2 text-white hover:opacity-80">
  Click me
</button>
```

优点：零运行时、高度可定制、响应式设计内置、JIT 编译体积小
缺点：HTML 类名冗长、学习曲线（需记忆类名）、不适合复杂动画

方案 4: CSS 预处理器（Sass/Less）

```scss
$primary-color: #1890ff;

.button {
  padding: 8px 16px;
  border-radius: 4px;

  &.primary {
    background-color: $primary-color;
    color: white;
  }

  @mixin hover-effect {
    &:hover {
      opacity: 0.8;
    }
  }

  @include hover-effect;
}
```

优点：变量、嵌套、Mixin 等强大特性、生态成熟
缺点：需要编译、全局作用域（需配合 BEM 等命名规范）、不支持运行时动态样式

方案 5: Vanilla Extract（零运行时 CSS-in-TS）

```typescript
// Button.css.ts
import { style, globalStyle } from "@vanilla-extract/css";

export const button = style({
  padding: "8px 16px",
  borderRadius: 4,
});

export const primary = style({
  backgroundColor: "#1890ff",
  color: "white",
});
```

优点：TypeScript 类型安全、零运行时、构建时提取 CSS
缺点：配置复杂、生态较小、不支持动态样式

对比总结：

| 方案            | 运行时 | 类型安全 | 动态样式 | Bundle Size | 学习曲线 |
| --------------- | ------ | -------- | -------- | ----------- | -------- |
| CSS Modules     | 无     | 可选     | 受限     | 最小        | 低       |
| CSS-in-JS       | 有     | 完全     | 完全     | +10KB       | 中       |
| Tailwind        | 无     | 无       | 受限     | 最小        | 中       |
| Sass/Less       | 无     | 无       | 无       | 中等        | 低       |
| Vanilla Extract | 无     | 完全     | 受限     | 最小        | 高       |

我的选择：在腾讯 IEG 的项目中，我使用 CSS Modules + Sass，兼顾性能和开发体验。在字节跳动的项目中，使用 Semi Design 内置的 CSS-in-JS。在个人项目中，偏好 Tailwind CSS 的快速开发体验。

---

### Q37: 前端性能优化有哪些维度？你在实际项目中做了哪些优化？

A: 前端性能优化是一个系统工程，我将其分为 6 个维度，并在多个项目中实践。

维度 1: 网络优化

- 资源压缩：Gzip/Brotli 压缩，文本资源体积减少 70-80%
- CDN 加速：静态资源分发到边缘节点，TTFB 从 200ms 降至 20ms
- 预加载/预连接：`<link rel="preload">` 提前加载关键资源，`<link rel="preconnect">` 提前建立连接
- HTTP/2 多路复用：减少 TCP 连接数，避免队头阻塞

```html
<link rel="preconnect" href="https://api.example.com" />
<link rel="preload" href="/fonts/main.woff2" as="font" crossorigin />
<link rel="prefetch" href="/next-page.js" />
```

维度 2: 渲染优化

- 代码分割：React.lazy + Suspense 按需加载，首屏 JS 从 500KB 降至 120KB
- Tree Shaking：移除未使用代码，Bundle Size 减少 30-50%
- 虚拟滚动：10 万条列表渲染从 8 秒降至 200ms（TikTok Performance 项目）
- 骨架屏：FCP 时间从 2.5s 降至 0.3s（感知性能提升）

维度 3: 缓存优化

- Service Worker：离线缓存、资源预缓存
- HTTP 缓存：`Cache-Control: max-age=31536000, immutable`（带 hash 的静态资源）
- SWR 策略：先返回缓存，后台更新（字节 Data 项目，首屏 2.5s → 0.8s）
- 多层缓存：L1 内存 + L2 Redis + L3 MySQL（TikTok 项目，查询延迟 120ms → 8ms）

维度 4: 运行时优化

- Web Worker：CPU 密集计算移到 Worker 线程，主线程 FPS 从 30 提升至 58
- requestIdleCallback：低优先级任务在浏览器空闲时执行
- 防抖/节流：减少高频事件（scroll、resize）的处理频率
- 对象池：复用频繁创建/销毁的对象，GC 暂停从 50ms 降至 10ms（腾讯 IEG 项目）

维度 5: 构建优化

- Vite 迁移：开发启动从 4 分钟降至 8 秒（阿里妈妈项目）
- esbuild 预构建：依赖预构建使用 esbuild（Go），比 JS 快 100 倍
- 增量编译：Webpack 的 `cache: { type: 'filesystem' }`，二次构建快 5 倍
- 模块联邦：共享依赖去重，首屏减少 30%

维度 6: 监控与分析

- Web Vitals：LCP、FCP、CLS、INP 实时监控
- Performance API：`performance.measure()` 标记关键路径
- Lighthouse CI：每次 PR 自动跑分，低于阈值阻止合并
- RUM（Real User Monitoring）：swifty-sentry 采集真实用户数据

实际案例：TikTok Performance 平台优化

| 指标 | 优化前 | 优化后 | 优化手段                     |
| ---- | ------ | ------ | ---------------------------- |
| FCP  | 3.2s   | 0.8s   | 代码分割 + CDN + 预加载      |
| LCP  | 5.1s   | 1.2s   | 虚拟滚动 + 图片懒加载        |
| TTI  | 8.5s   | 2.1s   | Tree Shaking + 延迟非关键 JS |
| CLS  | 0.35   | 0.05   | 图片尺寸预留 + 字体预加载    |
| 内存 | 800MB  | 50MB   | 虚拟滚动 + 对象池            |

优化方法论：

1. 度量先行：没有数据就没有优化，先建立性能基线
2. 抓大放小：优先优化影响最大的瓶颈（Performance 面板的火焰图）
3. 持续监控：性能优化不是一次性的，需要持续监控和回归测试
4. 权衡取舍：性能 vs 开发效率 vs 可维护性，需要根据业务场景做决策

---

_文档结束。共覆盖 37 个问题，涵盖项目经历、工作经历和技能基础三大板块。_
