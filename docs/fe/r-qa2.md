# 杭天cheng - 面试回答

## 目录

- [工作经历相关](#工作经历相关)
  - [字节跳动 - TikTok Performance 团队](#字节跳动---tiktok-performance-团队)
  - [腾讯 - NoSQL 数据库管理系统](#腾讯---nosql-数据库管理系统)
  - [字节跳动 - 搜索推荐算法平台](#字节跳动---搜索推荐算法平台)
  - [阿里巴巴 - 广告技术部](#阿里巴巴---广告技术部)

---

## 工作经历相关

### 字节跳动 - TikTok Performance 团队

1. 你提到使用 Kafka 转发终端设备性能数据到 Redis、MySQL、ClickHouse，这三层存储分别承担什么角色？为什么不只用一个存储？数据从终端到前端展示的完整链路是怎样的？

终端设备（TikTok 客户端）上报的性能数据量级非常大，属于典型的高吞吐写入场景。Kafka 在这里充当消息队列，做流量削峰和数据解耦，避免上游突发流量直接打垮下游存储。三层存储各司其职：Redis 作为热数据缓存层，存放最新的聚合指标和实时告警阈值，读取延迟在毫秒级，供前端实时看板使用；MySQL 作为元数据存储，存放设备信息、用户配置、告警规则等结构化业务数据，数据量相对较小但需要强一致性；ClickHouse 作为 OLAP 分析引擎，承担海量性能数据的时序分析和多维聚合查询，它的列式存储和向量化执行引擎非常适合大规模聚合场景。如果只用一个存储，要么 MySQL 扛不住高吞吐写入，要么 ClickHouse 不擅长小量高频的点查，要么 Redis 无法持久化和做复杂分析。完整链路是：终端 SDK 采集 -> Kafka topic -> 消费者服务（Golang + Kitex）做数据清洗和聚合 -> 分别写入 Redis（实时聚合结果）、MySQL（元数据和配置）、ClickHouse（明细数据）-> BFF 层（Nest.js）调用后端 RPC 接口查询数据 -> 前端 React 应用通过 Echarts 可视化渲染。

2. 你提到设计多层缓存减轻数据库压力，具体是哪几层缓存？缓存一致性怎么保证的？缓存穿透、缓存击穿、缓存雪崩这些问题有遇到吗？

多层缓存设计分为三级：第一级是前端内存缓存，使用 Zustand 的 selector + shallow compare 做组件级别的状态缓存，避免重复请求相同数据；第二级是 BFF 层的 Node 进程内缓存，使用 LRU cache 缓存热点查询结果，TTL 设置为秒级，覆盖高频轮询的实时看板场景；第三级是 Redis 缓存层，存放后端服务聚合后的结果，TTL 根据数据时效性分级设置。缓存一致性方面，写操作采用 cache-aside 模式，先更新数据库再删除缓存；对于实时性要求极高的指标，使用 Redis pub/sub 通知 BFF 层失效本地缓存。缓存穿透通过布隆过滤器拦截非法的设备 ID 查询，对空结果也做短时间缓存；缓存击穿通过互斥锁（Redis SETNX）保证同一个 key 只有一个请求回源；缓存雪崩通过给 TTL 加随机偏移量（基础值 +/- 20% 随机抖动）来打散过期时间，实际线上确实遇到过一次大面积缓存同时过期导致的 ClickHouse 查询超时，加上 TTL 抖动后问题消失。

3. Thrift IDL 生成的 npm 包在 BFF 层消费时，Thrift 序列化/反序列化的性能如何？有没有遇到序列化兼容性问题？IDL 变更时前后端如何协同？

Thrift 生成的 JS/TS npm 包包含类型定义和序列化/反序列化方法。性能方面，Thrift 的二进制协议比 JSON 序列化体积小 30%-50%，反序列化速度也更快，因为直接按 schema 解析不需要做 JSON.parse 的通用解析。但在 BFF 层（Node.js）实际使用中，Thrift JS 代码的执行效率不如 Golang 原生，对于特别大的响应体（比如返回上万条设备性能记录），反序列化耗时可达数百毫秒，需要在 BFF 层做分页和流式处理。序列化兼容性方面遇到过问题：后端新增字段时如果前端 npm 包没更新，旧版本会忽略新字段（Thrift 的 optional 字段机制），但如果后端修改了字段类型或删除了字段，就会导致反序列化失败。IDL 变更的协同流程是：后端修改 IDL -> CI 自动重新生成 npm 包并发布到内部 registry -> BFF 层升级依赖版本 -> 前端同步更新类型引用。实际中我们加了 CI 检查，IDL 变更时自动跑兼容性检测脚本，对比新旧版本的 diff，标记 breaking change。

4. 你编写的虚拟滚动列表是怎么实现的？和 react-window、react-virtualized 这类库对比有什么差异？定高和不定高列表分别怎么处理？

虚拟滚动的核心思路是只渲染可视区域内的元素。实现上，外层是一个固定高度的滚动容器，内层用一个占位 div 撑起总高度的滚动条，实际渲染的元素通过 absolute 定位或 transform 偏移到正确位置。监听 scroll 事件，根据 scrollTop 和每个 item 的高度计算出 startIndex 和 endIndex，只渲染这个范围内的元素，并在上下各预渲染一屏的 buffer 区域防止快速滚动时白屏。和 react-window 对比，主要差异在于：react-window 对不定高列表的支持依赖于预估高度 + 渲染后修正，我的实现针对业务场景（性能数据列表，行高基本固定但有展开/折叠态）做了专门优化，使用 ResizeObserver 监听每个渲染项的实际高度变化并更新高度缓存表，比 react-window 的 itemSize 回调更精确。定高列表直接用 index \* itemHeight 计算偏移，非常简单；不定高列表维护一个高度缓存 Map，首次渲染用预估高度，渲染完成后用 ResizeObserver 拿到真实高度更新缓存，后续滚动直接用缓存值计算偏移。关键踩坑点是滚动锚定：当上方元素高度变化时，需要动态调整 scrollTop 保持用户视角不变，否则会跳动。

5. 参与 CloudWeGo Kitex 开源项目具体做了什么贡献？Kitex 的 RPC 框架和你之前用过的 gRPC 有什么区别？

在 Kitex 开源项目的贡献主要是：修复了 Thrift 编解码在特定边界条件下的 panic 问题（当 Thrift message 的 field ID 超过 int16 范围时的异常处理），以及优化了连接池中连接健康检查的逻辑（idle connection 在被复用前没有做 liveness probe）。Kitex 和 gRPC 的核心区别在于：gRPC 基于 HTTP/2 + Protobuf，是语言无关的通用 RPC 框架；Kitex 是字节开源的高性能 Go RPC 框架，深度优化了 Go 场景下的性能，比如使用 netpoll 做网络 I/O（基于 epoll/kqueue 的高性能网络库，比 Go 标准库的 net 包在高并发下性能更好），自研的 Thrift 编解码器比 Apache Thrift 官方实现快数倍。Kitex 还支持服务发现、负载均衡、熔断限流等微服务治理能力，和字节的内部基础设施（如服务注册中心）深度集成。在我们项目中选择 Kitex 是因为团队后端技术栈统一用 Go，且需要和字节内部的服务治理体系打通。

### 腾讯 - NoSQL 数据库管理系统

6. React 类组件迁移到函数组件的过程中，最大的挑战是什么？有没有遇到过 state 提升后逻辑拆分困难的情况？迁移策略是怎样的？

最大挑战是生命周期逻辑的拆分和重组。类组件中 componentDidMount、componentDidUpdate、componentWillUnmount 中经常混入多个不相关的副作用逻辑（比如同时做数据请求和事件监听），迁移到 hooks 时需要按功能维度拆分成多个 useEffect，每个 effect 管理自己的 setup 和 cleanup。另一个挑战是 this 上下文的消除，类组件中大量使用 this.state、this.props、this.xxx，迁移后需要改为闭包引用，需要特别注意闭包陷阱（stale closure）。state 提升确实遇到了困难：一个大的类组件管理了十几个 state 字段，拆分函数组件时如果把所有 state 提到顶层组件，props drilling 会很严重；如果在子组件各自管理，又破坏了原有的状态共享逻辑。最终方案是使用 useReducer 替代多个 useState，将相关的 state 合并到一个 reducer 中，配合 useContext 做状态分发，这样既避免了 props drilling，又保持了状态的集中管理。迁移策略是渐进式的：先对新功能要求必须用函数组件，然后按模块逐步迁移旧代码，每次迁移一个页面级组件，跑完 E2E 测试确认无回归后合入主干。

7. 你提到排查闭包和接口响应时间不稳定导致的数据竞争，能详细描述一下这个问题的现象、定位过程和解决方案吗？useCallback/useMemo 在这里起到了什么作用？

现象是数据库管理界面中，用户快速切换不同的数据库实例时，表格数据偶尔会显示错乱——A 实例的配置项出现在 B 实例的详情页面中。定位过程：首先通过 React DevTools 的 Profiler 发现组件存在不必要的重渲染，然后在 useEffect 的回调中加日志，发现当用户从 A 切换到 B 时，A 的请求因为接口响应慢（后端在不同实例间负载不均导致延迟波动大）后返回，覆盖了已经更新的 B 的数据。本质是一个竞态条件（race condition）：后发请求先返回，先发请求后返回覆盖了正确数据。解决方案分两层：第一层在请求层用 AbortController，当组件 re-render 导致依赖变化时，自动 abort 上一次未完成的请求；第二层在数据层加请求序号，每次发起请求时递增序号，响应回来时检查序号是否是最新的，不是最新则丢弃。useCallback 在这里的作用是稳定请求函数的引用，避免每次渲染都创建新的函数引用导致 useEffect 的依赖数组频繁变化触发不必要的重新请求。useMemo 用于缓存计算开销大的派生数据（比如表格的排序和过滤结果），避免每次渲染都重新计算。

8. Node 端编写 TCP 连接池，连接池的设计是怎样的？连接复用、心跳检测、超时重连、最大连接数这些参数怎么配置的？和直接用数据库驱动的连接池有什么区别？

TCP 连接池的设计参考了经典的对象池模式。核心数据结构是一个空闲连接队列和一个活跃连接集合。配置参数包括：minSize（最小空闲连接数，启动时预热创建）、maxSize（最大连接总数）、idleTimeout（空闲连接回收时间）、connectTimeout（建连超时）、heartbeatInterval（心跳探测间隔）。连接复用：请求到来时优先从空闲队列取连接，没有空闲连接且未达 maxSize 则创建新连接，达到 maxSize 则进入等待队列。心跳检测：对空闲连接每隔 heartbeatInterval 发送一个轻量级 ping 包，如果超时未响应则标记连接为 dead 并从池中移除。超时重连：连接异常断开时，如果当前活跃连接数低于 minSize，自动触发重连补充池子。和数据库驱动自带连接池的区别在于：我们的连接池是为腾讯 NoSQL 数据库的自定义 TCP 协议专门设计的，需要处理协议层面的握手、鉴权、数据帧分割等逻辑，通用数据库驱动的连接池无法覆盖这些定制化需求。另外我们在连接级别做了负载均衡，根据每个连接的 pending 请求数做 least-connections 分配，而不是简单的 round-robin。

9. 使用 valgrind 排查 Node 和 C++ .so 动态链接库的内存泄漏，具体泄漏点在哪里？valgrind 的哪些报告帮你定位了问题？修复方案是什么？

内存泄漏的具体位置在 C++ 动态链接库中负责解析 NoSQL 表文件的模块。解析过程中会为每个表的 schema 信息分配堆内存（std::vector 和自定义的 buffer），在正常路径下会释放，但在解析异常（文件格式损坏或字段类型不匹配）时，早期 return 跳过了释放逻辑，导致泄漏。随着 Node 进程长时间运行，泄漏累积最终触发 OOM。valgrind 的帮助主要体现在：使用 --leak-check=full 参数运行 Node 进程，valgrind 的 "definitely lost" 报告精确指向了 .so 中 malloc 分配但未释放的调用栈，包括具体的源码行号。"still reachable" 的报告帮助区分了真正的泄漏和进程退出时的残留。关键信息是调用栈中显示的 alloc 位置在 parse_table_schema 函数中，而对应的 free 在 cleanup 函数中，通过对比两个函数的调用路径发现异常分支缺少了 cleanup 调用。修复方案是将裸指针改为智能指针（std::unique_ptr），利用 RAII 机制确保无论正常路径还是异常路径都能正确释放内存。同时在 Node 侧增加了进程级别的内存监控，定期通过 process.memoryUsage() 上报 RSS 和 heapUsed，设置告警阈值。

10. 你提到维护对象池、利用 v8 隐藏类降低 GC 压力，具体怎么做的？对象池的生命周期怎么管理？v8 隐藏类在什么场景下会被破坏？

在 Node 端频繁创建和销毁大量临时对象（比如从 C++ .so 返回的解析结果需要转成 JS 对象），这些短生命周期对象会给 V8 的 GC（特别是 Young Generation 的 Scavenge GC）带来很大压力。解决方案分两部分：对象池方面，对高频使用的对象类型（如查询结果行对象）实现了一个对象池，使用完毕后不丢弃引用，而是 reset 对象属性后放回池中，下次需要时从池中取出复用。对象池的生命周期绑定在连接池的连接上——每个连接维护自己的对象池，连接关闭时清空池中所有对象。V8 隐藏类（Hidden Class / Shape）的利用方式是：确保从池中取出的对象始终以相同的顺序、相同的 key 名设置属性。V8 会根据对象的属性布局（property layout）分配隐藏类，相同布局的对象共享同一个隐藏类，使得属性访问可以被优化为直接内存偏移（inline cache）。隐藏类被破坏的场景包括：对对象动态添加新属性（导致 V8 创建新的隐藏类分支，形成 transition chain，过长后回退到 dictionary mode）；以不同顺序设置属性（导致生成不同的隐藏类）；使用 delete 操作符删除属性（直接将对象转为 dictionary mode）。所以在 reset 对象时，我们是将属性值设为 null 而不是 delete 属性，并且始终按固定顺序赋值。实际效果是 Young GC 频率降低了约 40%。

### 字节跳动 - 搜索推荐算法平台

11. JSError 大模型自动修复的具体流程是怎样的？模型输入是什么（错误堆栈、源码、上下文）？修复准确率如何？有没有引入误修复的风险？

JSError LLM 自动修复的流程分为四步：第一步，错误捕获与聚合——前端 SDK 捕获到 JSError 后上报到服务端，服务端按错误指纹（stack trace 的 hash）聚合去重，筛选出高频错误；第二步，上下文收集——根据错误堆栈中的文件名和行号，从代码仓库拉取对应源文件的相关代码段（错误行前后各 50 行），同时收集错误发生时的用户行为轨迹（路由、点击事件）、设备信息、以及通过 source map 还原后的原始代码位置；第三步，构建 Prompt——将错误信息、原始代码上下文、相关的类型定义文件组装成结构化 Prompt，指导 LLM 分析错误原因并生成修复 patch；第四步，自动验证——LLM 生成的 patch 在沙箱环境中自动 apply 并跑相关的单元测试和 lint 检查，通过后生成 Code Review 请求供人工确认。模型输入主要包括：错误堆栈（source map 还原后）、错误行附近的源码、相关的 TypeScript 类型定义、错误发生时的运行时上下文（如变量的序列化值）。修复准确率在常见错误类型（如 null/undefined 访问、类型不匹配、API 参数错误）上可以达到 60%-70% 的一次通过率。误修复的风险控制主要靠沙箱验证 + 人工 Review 的双重保障，LLM 生成的 patch 不会直接合入主干，而是以 PR 形式提交，必须经过人工确认。

12. SWR 前端性能优化具体做了什么？和传统的数据请求方案相比，SWR 的 stale-while-revalidate 策略在什么场景下收益最大？有没有遇到缓存过期策略不合理的情况？

SWR 性能优化主要做了三方面：一是全局配置 dedupingInterval，在搜索推荐算法平台的多面板布局中，多个组件可能同时请求相同的数据（如算法模型的元信息），SWR 的自动去重避免了重复请求；二是使用 useSWR 的 revalidateOnFocus 和 revalidateOnReconnect 策略，用户从其他标签页切回时自动刷新数据，保证数据时效性；三是实现了乐观更新（optimistic update），在用户修改算法配置时，先更新本地缓存让 UI 立即响应，再等后端确认，如果后端返回错误则回滚。SWR 的 stale-while-revalidate 策略收益最大的场景是数据更新频率中等（秒级到分钟级）且用户频繁访问的页面，比如算法模型的实时指标看板——用户首次访问时从缓存立即展示上次的数据（stale），同时后台发起 revalidate 请求获取最新数据，用户感知到的是"立即有内容 + 短暂延迟后数据刷新"，体验远好于 loading 态。遇到的问题是：对于变化非常频繁的数据（如每秒更新的 QPS 指标），默认的 revalidate 频率会导致请求风暴，我们通过设置 refreshInterval 精确控制轮询间隔，并在非可视区域的面板暂停 revalidate（使用 isVisible 判断），避免了不必要的请求。

13. A2UI (AI to UI) React 框架接入是怎么做的？LLM 输出如何映射到 React 组件？组件渲染的流式更新怎么处理的？

A2UI 的核心思路是让 LLM 的输出直接驱动 UI 渲染，而不是传统的"LLM 输出纯文本 -> 前端硬编码解析"模式。具体实现是：定义一套组件 Schema，LLM 的输出格式是结构化 JSON，每个节点包含 componentType（对应 React 组件名）、props（组件属性）、children（子节点）。前端维护一个组件注册表（component registry），将 componentType 映射到实际的 React 组件。渲染引擎递归遍历 Schema 树，动态创建 React 元素。流式更新的处理是关键难点：LLM 通过 SSE 流式输出 JSON，但流式 JSON 在传输过程中是不完整的，不能直接 parse。我们的方案是使用增量 JSON parser（类似 @streamparser/json），在流式传输过程中逐 token 解析，每解析出一个完整的组件节点就立即推送到渲染队列。渲染侧使用 React 的 Concurrent Mode 特性，通过 startTransition 包裹增量渲染更新，避免流式渲染阻塞用户交互。同时做了组件级别的 memo 优化，已经渲染完成的节点不会因为后续节点的增量输出而重渲染。

### 阿里巴巴 - 广告技术部

14. Server&Schema-Driven UI 的架构是怎样的？服务端下发 JSON Schema，前端如何动态渲染？和传统的硬编码页面相比有什么优劣势？

Server&Schema-Driven UI 的架构分为三层：Schema 管理层（服务端）负责定义、存储和版本管理页面的 Schema 配置；渲染引擎层（前端）负责解析 Schema 并动态生成 React 组件树；数据层通过 Schema 中定义的数据绑定规则，自动从 API 获取数据并注入到对应组件。服务端下发的 Schema 是一个树形 JSON 结构，每个节点定义了：组件类型（如 Form、Table、Chart）、布局信息（如 Grid 的 span、间距）、数据绑定（如 table 的 dataSource 绑定到某个 API 的 response.data）、交互行为（如按钮点击触发某个 API 调用）。前端的渲染引擎递归解析这个树，通过组件注册表查找对应的 React 组件，用 React.createElement 动态创建组件实例并注入 props。优势是：业务页面的变更（如新增广告创意模板的编辑字段、调整广告报表的列）不需要前端发版，运营或后端直接修改 Schema 即可生效，大幅缩短了广告业务快速迭代的交付周期。劣势是：Schema 的表达力有限，复杂的交互逻辑（如拖拽排序、复杂的表单联动）难以用声明式 Schema 描述，最终还是需要写自定义组件；另外 Schema 的调试体验不如直接写代码，错误定位也比较困难。

15. 模块联邦（Module Federation）在 Webpack 和 Vite 下的接入有什么区别？你贡献 @module-federation/vite 时解决了什么问题？远程模块加载失败怎么做降级？

Webpack 下的 Module Federation 是 webpack 5 的原生特性，通过 plugins 配置 shared dependencies、exposes、remotes 即可，webpack 的 runtime 会自动处理远程模块的加载、依赖共享和版本协商。Vite 下的接入要复杂得多，因为 Vite 的开发模式基于原生 ESM（不做 bundle），而 Module Federation 的核心机制（remote entry、chunk sharing）依赖打包产物的 runtime 逻辑。@module-federation/vite 的方案是在 Vite 的 plugin 体系中注入自定义的模块解析和转换逻辑，在开发模式下通过 Vite 的 middleware 拦截远程模块请求并代理到远端 dev server，在生产模式下通过 Rollup plugin 在构建时生成 federation runtime。我贡献的主要是修复了开发模式下远程模块热更新不生效的问题：当远程模块的代码变更时，Vite 的 HMR 无法感知远端的变化，需要在 federation plugin 层监听远程 dev server 的 HMR WebSocket 事件并转发给本地 HMR 客户端。远程模块加载失败的降级方案是：每个远程模块都配置一个 fallback 组件（通常是一个静态的占位 UI 或功能降级版本），通过 React 的 ErrorBoundary 包裹远程模块的加载点，捕获加载异常后渲染 fallback。同时在监控平台埋点上报加载失败事件，便于排查网络和部署问题。

16. 模块联邦场景下，远程模块和宿主应用的依赖版本冲突怎么解决？共享依赖的 singleton 配置踩过什么坑？

Module Federation 通过 shared 配置声明共享依赖，webpack/vite 的 runtime 会在运行时做版本协商。核心配置项包括：requiredVersion 指定兼容的版本范围、singleton 标记是否全局只允许一个实例、eager 控制是否在初始加载时就引入共享模块。对于 React 这类必须保持单例的库（多个 React 实例会导致 hooks 报错），必须设置 singleton: true，这样无论宿主和远程模块各自依赖什么版本的 React，运行时只会加载满足版本约束的一个实例。踩过的坑主要有三个：第一，singleton 和版本范围冲突——宿主用 React 18.2，远程模块用 React 17.x，singleton: true 下只会保留一个版本，如果远程模块的 API 调用在 React 18 中不兼容就会运行时报错，解决方案是统一升级到相同大版本；第二，CSS 样式冲突——远程模块带了自己的 CSS（如 Tailwind 的 utility class），和宿主的 CSS 产生优先级冲突，解决方案是远程模块使用 CSS Modules 或 Shadow DOM 做样式隔离；第三，eager: true 的陷阱——为了减少请求数把共享模块设为 eager，导致宿主打包体积膨胀（因为 eager 模块会被打进宿主的 initial chunk），后来改为 eager: false 配合 preload 策略在空闲时预加载共享模块。
