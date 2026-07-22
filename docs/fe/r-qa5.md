# 面试技术问答

## 目录

- [字节跳动 (TikTok Performance)](#字节跳动-tiktok-performance)
  - [1. Kitex 是什么? 如何与 Thrift 配合使用?](#1-kitex-是什么-在-tiktok-performance-团队中如何与-thrift-配合使用)
  - [2. Kafka 转发数据到 Redis/MySQL/ClickHouse 的数据链路设计?](#2-kafka-转发数据到-redismysqlclickhouse-的整体数据链路如何设计-为什么选这三种存储各承担什么职责)
  - [3. 多层缓存设计具体是哪些层?](#3-多层缓存设计具体是哪些层-各级命中率如何)
  - [4. Thrift 生成 npm 包给 BFF 消费解决了什么问题?](#4-thrift-生成-npm-包给-bff-消费-这解决了什么问题-跨团队协作收益如何)
  - [5. CloudWeGo Kitex 开源项目贡献了什么?](#5-你参与的-cloudwego-kitex-开源项目贡献了什么)
  - [6. 虚拟滚动列表的具体实现原理?](#6-虚拟滚动列表的具体实现原理是什么-在什么场景下使用)
- [腾讯 (IEG)](#腾讯-ieg)
  - [7. React 类组件迁移到函数组件的步骤和难点?](#7-react-类组件迁移到函数组件的具体步骤和难点是什么)
  - [8. "未捕获的闭包"问题具体是什么场景?](#8-什么是未捕获的闭包问题-你的项目里具体是什么场景)
  - [9. 接口响应时间不稳定导致的数据竞争?](#9-接口响应时间不稳定导致的数据竞争是什么问题-如何排查和解决)
  - [10. TCP 连接池的实现要考虑哪些问题?](#10-tcp-连接池的实现要考虑哪些问题-你实现的池化策略是什么)
  - [11. 进程池调用 C++ .so 的具体方式?](#11-进程池调用-c-so-动态链接库的具体方式是什么-为什么不用-n-api)
  - [12. valgrind 排查内存泄漏的流程?](#12-valgrind-排查-node--c-so-内存泄漏的具体流程是什么-发现了哪些泄漏点)
  - [13. 对象池、v8 隐藏类如何优化 GC?](#13-对象池v8-隐藏类在-node-中如何优化-gc-优化后-gc-停顿降低了多少)
- [字节跳动 (Data-架构部门)](#字节跳动-data-架构部门)
  - [14. JSError 大模型自动修复的整体架构?](#14-jserror-大模型自动修复的整体架构是什么-llm-是如何获取上下文进行修复的)
  - [15. 自动修复的准确率是多少?](#15-自动修复的准确率是多少-如何衡量收益)
  - [16. SWR 前端性能优化具体做了什么?](#16-swr-前端性能优化具体做了什么)
  - [17. A2UI 是什么框架?](#17-a2ui-是什么框架-接入过程有什么难点)
- [阿里巴巴 (阿里妈妈)](#阿里巴巴-阿里妈妈)
  - [18. Server&Schema-Driven UI 的理念和实现?](#18-serverschema-driven-ui-的理念是什么-如何实现)
  - [19. 模块联邦在项目中解决了什么问题?](#19-模块联邦是什么-在你的项目中解决了什么问题)
  - [20. @module-federation/vite 与 webpack 的差异?](#20-module-federationvite-相比-webpack-的模块联邦有什么差异-你贡献了什么)
  - [21. Webpack 和 Vite 模块联邦的接入区别?](#21-webpack-模块联邦和-vite-模块联邦的接入有什么区别和难点)
- [项目: @swifty/sentry SDK](#项目-swiftysentry-sdk)
  - [22. 发布订阅架构如何设计?](#22-发布订阅架构如何设计-core-和-plugin-如何解耦)
  - [23. JSError 上报后如何通过 source map 还原?](#23-jserror-上报后如何通过-source-map-还原故障现场-整个链路如何实现)
  - [24. rrweb 全量快照 + 增量事件如何实现?](#24-rrweb-的原理是什么-全量快照--增量事件具体如何实现-对性能影响多大)
  - [25. 白屏检测关键点采样?](#25-白屏检测的关键点采样是什么-采样点如何选取)
  - [26. LCP/FCP/CLS/INP 指标如何采集?](#26-lcpfcpclsinp-这些指标是如何采集的-用了哪些-observer-api)
  - [27. 三级降级上报策略的逻辑?](#27-三级降级上报策略的具体逻辑是什么-在哪些场景下触发降级)
  - [28. SDK 包体积优化手段?](#28-sdk-包体积太大影响首屏加载怎么办-有哪些优化手段)
- [项目: @swifty/swifty CLI Agent](#项目-swiftyswifty-cli-agent)
  - [29. 5 层架构具体是哪 5 层?](#29-5-层架构具体是哪-5-层-每层职责是什么)
  - [30. ReAct Agent Loop 与 CoT 的区别?](#30-react-范式的-agent-loop-具体实现是什么-与-chain-of-thought-区别是什么)
  - [31. 5 层权限系统每一层是什么?](#31-5-层权限系统每一层是什么-为什么需要这么多层)
  - [32. 上下文压缩算法和压缩率?](#32-上下文压缩的具体算法是什么-压缩率多少)
  - [33. MCP 接入的方式和解决的问题?](#33-mcp-接入的具体方式是什么-解决了什么问题)
  - [34. 会话持久化和跨会话记忆?](#34-会话持久化和跨会话记忆提取如何设计-记忆整理的触发机制是什么)
  - [35. worktree/Subagent/Agent Teams 与 Claude Code 的异同?](#35-worktreesubagentagent-teams-的设计参考了-claude-code-有什么异同)
- [技能深度](#技能深度)
  - [36. React Fiber 时间切片和优先级调度?](#36-react-fiber-架构了解多少-时间切片优先级调度是如何工作的)
  - [37. Vue3 Proxy 响应式 vs Vue2?](#37-vue3-响应式原理和-vue2-的区别是什么-proxy-的优势是什么)
  - [38. Zustand vs Redux? useState vs useReducer?](#38-zustand-和-redux-相比优势是什么-usestate-和-usereducer-的区别)
  - [39. Vite 比 Webpack 快的根本原因?](#39-vite-相比-webpack-快的根本原因是什么)
  - [40. Go goroutine vs Node Event Loop?](#40-go-的-goroutine-调度和-node-的事件循环有何不同-什么场景下用-go)

---

## 字节跳动 (TikTok Performance)

### 1. Kitex 是什么? 在 TikTok Performance 团队中如何与 Thrift 配合使用?

Kitex 是字节跳动 CloudWeGo 开源的高性能 Go RPC 框架, 基于 netpoll 网络库构建, 支持多协议 (Thrift、KitexProtobuf、gRPC)。在 TikTok Performance 团队中, 后端服务使用 Go + Kitex 构建, 服务间通过 Thrift IDL 定义接口契约。具体流程: 先在 .thrift 文件中定义 service 和 struct, 然后用 kitex 命令行工具生成 Go server/client 桩代码。Kitex 内部用 thrift 编解码做序列化, 相比 JSON 体积小 60% 以上。同时通过 CodeGen 工具将同一份 Thrift IDL 生成 TypeScript 类型定义和 npm 包, 供 BFF 层 (Nest.js) 直接消费, 实现了后端到前端的类型安全传递, 消除了手写 DTO 的维护成本。Kitex 的连接池复用、多路复用 (mux) 模式让单机 QPS 稳定在 5w+ 级别。

### 2. Kafka 转发数据到 Redis/MySQL/ClickHouse 的整体数据链路如何设计? 为什么选这三种存储各承担什么职责?

整体链路: TikTok 客户端和服务端埋点数据先写入 Kafka topic, 由 Go consumer group 消费。Consumer 内部做数据清洗、字段校验后, 按数据类型路由到三个存储系统。Redis 承担实时热度数据, 用 Sorted Set 维护最近 24 小时的指标排行榜, TTL 设为 1 天, 用于实时 Dashboard 展示, 查询延迟 P99 < 2ms。MySQL 存储结构化配置数据和用户权限, 作为权威数据源, 数据量小但要求强一致。ClickHouse 作为 OLAP 引擎承接海量时序日志 (日均 10 亿+ 事件), 利用 MergeTree 引擎的列式存储和稀疏索引做秒级聚合查询, 压缩比约 8:1。三者配合形成"实时查 Redis、历史分析查 ClickHouse、配置走 MySQL"的分层架构, 消费侧用批量写入 (ClickHouse batch insert 500 行/批) 和 pipeline (Redis pipeline 200 条/批) 提升吞吐。

### 3. 多层缓存设计具体是哪些层? 各级命中率如何?

四层缓存架构: 第一层是浏览器内存缓存, 前端用 SWR 的 cache provider 缓存已请求数据, 命中率约 30%, 零网络开销。第二层是 BFF (Nest.js) 本地 LRU 缓存, 用 lru-cache 库, max 500 条, TTL 30s, 命中率约 25%, 减少下游 RPC 调用。第三层是 Redis 集群缓存, 存储聚合后的热点指标数据, TTL 5min, 命中率约 70%。第四层是 ClickHouse 的 query result cache, 对固定时间窗口查询结果缓存, 命中率约 40%。请求穿透时逐层 fallback。缓存一致性通过 Kafka 消费成功后异步删除 Redis key (invalidate) 保证最终一致, BFF 层用 stale-while-revalidate 模式容忍短暂不一致。整体将 P99 延迟从 800ms 降到 50ms 以内。

### 4. Thrift 生成 npm 包给 BFF 消费, 这解决了什么问题? 跨团队协作收益如何?

解决的问题是前后端接口契约漂移。传统模式前端手写 TypeScript interface, 后端改字段不同步导致线上 bug。通过 Thrift IDL 生成 TS 类型定义并发布 npm 包 (包名如 @tiktok/perf-thrift-types), BFF 层 import 使用时获得编译期类型检查。CI 流程: Thrift 文件变更 -> CodeGen 生成新 TS types -> 自动 bump 版本 -> 发布到内部 npm registry -> BFF 项目 dependabot 自动升级 PR。收益: 接口联调时间从 2 天降到 0 (类型保证), 字段变更的线上事故归零, 前后端只需要 review Thrift IDL 的 diff 即可。跨团队 4 个前端 + 3 个后端共用一套 IDL, 每次迭代节省约 8 小时沟通成本。

### 5. 你参与的 CloudWeGo Kitex 开源项目贡献了什么?

主要贡献了两部分: 一是优化了 Kitex client 侧的连接池回收逻辑。原实现中 idle connection 在极端流量下会出现 O(n) 遍历, 改为基于双向链表 + 时间轮的分层回收策略, 将连接回收从 O(n) 降到 O(1), 在高并发场景 (10w+ QPS) 下减少了约 15% 的 goroutine 调度开销。二是补充了 Thrift generic call 的 benchmark 测试和文档。generic call 允许不生成桩代码直接发起 RPC 调用, 适合网关代理场景, 我编写了基准测试覆盖 codec 性能, PR 被合入 main 分支。此外还修复了 connection pool 在 context cancel 时未正确归还连接的 bug, 该问题会导致池耗尽。

### 6. 虚拟滚动列表的具体实现原理是什么? 在什么场景下使用?

场景: 性能指标日志列表, 单页最多渲染 5w 行, 直接渲染导致 FPS 掉到个位数。实现原理: 只渲染可视区域内的 DOM 节点。核心参数: containerHeight (可视区高度), itemHeight (每行固定 48px), scrollTop。可视区间 startIndex = floor(scrollTop / itemHeight), endIndex = startIndex + ceil(containerHeight / itemHeight) + buffer (上下各缓冲 5 行)。外层容器设置 padding-top 和 padding-bottom 模拟真实滚动高度。用 transform: translateY 代替 margin 避免 reflow。数据用 useMemo 切片, scroll 事件用 requestAnimationFrame 节流。对于动态行高, 维护一个行高缓存 Map, 首次渲染后通过 ResizeObserver 更新实际高度, 查询用二分查找定位行索引。优化后 5w 行列表滚动帧率稳定 60fps, DOM 节点始终控制在 50 个以内。

## 腾讯 (IEG)

### 7. React 类组件迁移到函数组件的具体步骤和难点是什么?

步骤分四阶段: 第一阶段盘点, 用 AST 脚本扫描所有 extends React.Component 的类, 标记有 shouldComponentUpdate、getDerivedStateFromProps 等生命周期的复杂组件。第二阶段逐组件迁移: 将 state 拆为多个 useState, componentDidMount/componentDidUpdate 合并为 useEffect, 用 useCallback 包裹传给子组件的回调。第三阶段处理难点: 对于 getSnapshotBeforeProps 迁移到 useLayoutEffect; 对于 ref 操作 DOM 从 createRef 转为 useRef + useEffect; 对于 render props 模式转为自定义 hook。第四阶段回归测试, 用 React Testing Library 对每个组件写单元测试, 覆盖状态变化路径。难点在于: 类组件中 this.setState 的批量更新行为和 hooks 的 batch 行为不同, 导致某些连续 setState 的组件在迁移后出现中间状态被吞掉的问题, 需要用 flushSync 显式同步更新。整个迁移涉及 120+ 个组件, 历时 6 周。

### 8. 什么是"未捕获的闭包"问题? 你的项目里具体是什么场景?

"未捕获的闭包"指函数组件中 useEffect 或 useCallback 的依赖数组遗漏, 导致闭包捕获的是旧渲染周期的 state 值。项目中的具体场景: 一个数据表格组件, useEffect 内调用 fetchData 并依赖 filters state, 但 dep array 忘写 filters。用户修改筛选条件后点击"刷新", fetchData 闭包内的 filters 仍是旧值, 导致查询结果不符合预期。更隐蔽的 case: 一个定时器用 setInterval 轮询状态, 闭包捕获了初始 render 的 count 值, 导致永远显示 0。排查方式: 启用 eslint-plugin-react-hooks 的 exhaustive-deps 规则, CI 卡住 warning 即报错。修复: 要么补全 deps, 要么对需要读最新值的场景用 useRef 存值 (ref.current 不参与闭包捕获), 或者使用函数式 setState(prev => prev + 1) 避免依赖外部变量。这类问题在类组件中不存在, 因为 this.state 总是最新值。

### 9. 接口响应时间不稳定导致的数据竞争是什么问题? 如何排查和解决?

问题描述: 用户快速切换 Tab 时, Tab A 的请求 (耗时 2s) 和 Tab B 的请求 (耗时 200ms) 几乎同时发出, Tab B 先返回渲染完毕后, Tab A 的响应回来覆盖了 Tab B 的数据, 造成展示错乱。这是经典的竞态条件 (race condition)。排查方式: 在 Network 面板按 waterfall 排序观察请求时序, 配合 React DevTools 查看 state 更新顺序确认是旧响应覆盖新数据。解决方案有三种: (1) AbortController -- 切换 Tab 时 abort 上一个请求, 在 useEffect cleanup 中调用 controller.abort(), fetch 会自动取消并抛 AbortError。 (2) 请求序号 -- 用 useRef 记录最新请求 ID, 响应回来后比对 ID, 不一致则丢弃。 (3) SWR 内置的 deduplication 和 revalidateOnFocus 机制自动处理。最终采用 AbortController 方案, 因为它真正取消网络请求, 减少服务端资源浪费, 并在 catch 中过滤 AbortError 避免误报。

### 10. TCP 连接池的实现要考虑哪些问题? 你实现的池化策略是什么?

TCP 连接池需要考虑: 连接复用与生命周期管理、空闲超时回收、连接健康检查、并发安全、背压控制。我的实现策略: 池结构用 Go channel 做有界队列 (capacity=50), 创建连接时先尝试从 channel 取, 取不到再 new。连接封装为 PooledConn struct, 内含 net.Conn 和 lastUsedAt 时间戳。健康检查: 归还连接前调用 SetReadDeadline(1ms) + Read(1byte) 探测连接是否存活, 死亡连接直接 Close 不入池。空闲回收: 后台 goroutine 每 30s 扫描, 超过 idleTimeout (5min) 的连接 Close 并从池中移除。并发安全: channel 天然协程安全, 避免 mutex 竞争。背压: channel 满时新连接请求阻塞等待, 加 context.WithTimeout 防止永久阻塞, 超时返回 ErrPoolExhausted。实际效果: 数据库连接池将 TCP 握手 (三次握手 + TCP_NODELAY) 开销从每次请求 5ms 摊薄到接近 0, 吞吐量提升约 40%。

### 11. 进程池调用 C++ .so 动态链接库的具体方式是什么? 为什么不用 N-API?

具体方式: Node.js 通过 child_process.fork 创建 worker 进程池, 每个 worker 进程内通过 ffi-napi 加载 C++ .so 文件并调用导出函数。C++ 侧用 extern "C" 暴露 ABI 稳定的 C 接口, ffi-napi 在 JS 侧声明函数签名 (参数类型、返回类型) 即可调用。进程池大小设为 CPU 核心数, 用 cluster 模块 round-robin 分发任务, worker 崩溃由 cluster 自动重启。为什么不用 N-API: N-API 适合编写 Node addon 做同步绑定调用, 但我们的 C++ 库是独立编译的第三方数值计算引擎 (约 50w 行代码), 没有 N-API wrapper, 重新包装工作量巨大。且 N-API addon 运行在 Node 主进程内, C++ crash 会直接拖垮 Node 进程, 而进程池隔离下 worker 崩溃不影响主服务。此外 C++ 计算密集任务会阻塞 V8 event loop, 进程池 + worker 进程的方式天然将计算卸载到独立进程, 主进程 event loop 不被阻塞。代价是 IPC (JSON 序列化) 开销约 1ms/次, 相比计算耗时 (50ms+) 可接受。

### 12. valgrind 排查 Node + C++ .so 内存泄漏的具体流程是什么? 发现了哪些泄漏点?

流程: 首先编写 C++ 侧的单元测试, 模拟 Node 调用路径 (init -> compute -> cleanup), 用 valgrind --leak-check=full --show-leak-kinds=all ./test_binary 运行。valgrind 的 Memcheck 工具追踪每次 malloc/new 和 free/delete 的配对, 结束时报告 definitely lost (确认泄漏)、indirectly lost、possibly lost。同时用 heaptrack 做动态内存分配可视化, 定位增长趋势。发现的泄漏点有三处: (1) C++ 侧一个全局缓存 map<string, vector<double>> 在 update 时只 insert 不 erase, 持续膨胀, 修复为 LRU 策略限制容量。 (2) Node 与 C++ 交互时, ffi-napi 分配的 Buffer 对象在回调函数中创建但未被 GC 回收, 因为回调引用形成了闭包持有, 改为用 Buffer.alloc + manual slice 替代 Buffer.from 避免引用泄漏。 (3) C++ .so 内一个线程局部变量 (thread_local) 在 worker 退出时未析构, 修复为注册 pthread_key_create 的 destructor callback。修复后 Memcheck 报告 definitely lost 从 12MB 降到 0, 运行 24 小时后 RSS 稳定不再增长。

### 13. 对象池、v8 隐藏类在 Node 中如何优化 GC? 优化后 GC 停顿降低了多少?

对象池: 对高频创建的临时对象 (如表示数据行的 Row 对象), 维护一个预分配数组, 需要时从池中取、用完后重置字段归还, 避免 new 触发 GC。实现为 ObjectPool 类, 内部 Array 预分配 1000 个实例, getInstance/returnInstance 用 index 指针管理。V8 隐藏类 (Hidden Class / Map) 优化: V8 对结构相同的对象分配相同的隐藏类, 使属性访问走固定偏移而非 hash 查找。为保持隐藏类稳定, 确保所有对象在构造函数中以相同顺序赋值属性, 避免运行时动态 add/delete 属性 (会触发 hidden class transition, 退化为字典模式)。具体做法: Row 类构造函数预声明所有字段并赋默认值, 复用对象时只赋值不改变 shape。效果: Scavenge (minor GC) 频率从每 200ms 一次降到每 800ms 一次, 单次停顿从 8ms 降到 3ms。Old-space GC (major) 的 mark-sweep 因堆中存活对象减少, 扫描耗时降低约 50%。通过 --prof 和 v8-profiler 验证了分配速率 (allocation rate) 从 120MB/min 降到 30MB/min。

## 字节跳动 (Data-架构部门)

### 14. JSError 大模型自动修复的整体架构是什么? LLM 是如何获取上下文进行修复的?

架构分四层: 采集层、上下文组装层、LLM 推理层、审核发布层。采集层从 Sentry 风格的错误监控平台获取线上 JSError, 包含 stack trace、用户操作路径、浏览器环境信息。上下文组装层: 根据 stack trace 中的文件名和行号, 从 Git 仓库提取对应源码文件 (前后 50 行), 同时检索最近 3 次该文件的 git log diff, 再拉取该错误的聚合堆 (相同 stack 归为一组, 取出现频次最高的)。组装后的 prompt 包含: 错误信息、堆栈、源码上下文、git diff、修复建议模板。LLM 推理层: 调用大模型 API (temperature=0.1 减少随机性), 输出 JSON 格式的 patch (文件路径 + unified diff)。审核发布层: patch 自动在沙箱分支 apply, 跑单元测试和类型检查, 通过后提交 CR 到 GitLab, 人工 review 后合入。准确率: 对 Top 50 高频错误, 自动 patch 通过单测的比率约 62%, 经人工 review 后合入率约 45%。衡量收益以"错误 MTTR (平均修复时间)"为指标, 从人工的 4.2 天降到 0.8 天。

### 15. 自动修复的准确率是多少? 如何衡量收益?

评测方式: 从监控平台取 200 个历史已修复的 JSError, 用系统重新生成 patch, 与人工修复的 commit diff 做比对。准确率定义分三层: (1) 编译通过 (apply diff 后 tsc + build 成功) -- 78%。 (2) 单元测试通过 (修复后跑该模块所有单测) -- 62%。 (3) 语义等价 (与人工修复 diff 的 AST 差异 < 5 个节点, 用 ast-diff 工具比对) -- 45%。分析失败原因: 40% 是因为上下文不足 (跨文件依赖未注入), 30% 是修复方向错误 (如本应修改调用方却修改了被调方), 30% 是格式/lint 问题 (可自动 fix)。衡量业务收益: (1) MTTR 从 4.2 天降到 0.8 天。 (2) 每周节省 on-call 人力约 6 小时。 (3) 长尾错误覆盖率提升 -- 人工只修 P0/P1 错误, 自动修复可覆盖 P2/P3 级别的低频报错。

### 16. SWR 前端性能优化具体做了什么?

SWR (stale-while-revalidate) 是一种缓存优先的数据请求策略。项目中三个关键优化: (1) 首屏请求: 用 SWR 的 useSWR hook, 首次渲染直接返回 localStorage 中的 cached data (stale), 同时后台发起 revalidate 请求, 用户无感知获取最新数据, 首屏 TTI 从 2.1s 降到 0.8s。 (2) 预取 (prefetch): 路由切换前, 在 onMouseEnter 事件中调用 mutate(key, fetcher, { revalidate: false }) 预加载下一页数据, 切换后 SWR 直接命中缓存。 (3) 分页列表的 optimistic update: 删除行时, 先乐观更新本地缓存 (从数组中移除), 再异步发请求, 失败时 rollback。SWR 内部用 Map 做全局 cache, 相同 key 的请求自动去重 (deduplication), 避免多组件同 key 重复请求。此外, 利用 SWR 的 refreshInterval 对监控面板数据做定时轮询, 配合 focusThrottleInterval 防止 Tab 切回时的重复请求风暴。

### 17. A2UI 是什么框架? 接入过程有什么难点?

A2UI (Agent to UI) 是字节内部的 AI 驱动 UI 渲染框架, 核心理念是 LLM 输出结构化 UI 描述 (JSON Schema), 前端渲染引擎将 Schema 转为 React 组件树。架构: Agent 后端通过 SSE 流式输出 UI Schema, 前端用流式解析器逐 chunk 组装完整 Schema, 渲染器递归渲染组件。接入难点: (1) 流式渲染的中间态处理 -- Schema 不完整时组件树不能崩, 需要对每个组件实现 fallback/skeleton 状态, 用 ErrorBoundary 兜底。 (2) Schema 版本兼容 -- 旧版 Schema 中某些字段在新版被重命名, 做了 Schema migration 中间层, 自动转换字段。 (3) 交互回调 -- LLM 生成的 UI 中按钮点击需要回调 Agent 继续推理, 实现了 action bridge, 将用户操作封装为 message 发回 SSE 通道。 (4) 性能 -- 流式渲染每秒产生 10-20 次 partial render, 用 React.memo + immutable diff 避免不必要的 re-render, 保证帧率。

## 阿里巴巴 (阿里妈妈)

### 18. Server&Schema-Driven UI 的理念是什么? 如何实现?

Server&Schema-Driven UI 的核心理念: 页面结构、组件配置、数据绑定全部由服务端下发的 JSON Schema 描述, 前端渲染引擎是"哑"的, 只负责将 Schema 具象化为 DOM。实现分三层: (1) Schema 协议层 -- 定义了一套 JSON Schema 规范, 包含 layout (栅格、Flex)、component (组件类型、props 映射)、data (数据源绑定表达式, 支持 JSONPath)、action (事件绑定、副作用链)。 (2) 服务端 Schema 引擎 -- 运营在后台可视化编辑 Schema, 发布后存储在 CDN。前端请求 Schema 时按版本灰度下发。 (3) 前端渲染层 -- 递归遍历 Schema 树, switch(componentType) 渲染对应 React 组件, props 从 data 绑定表达式求值 (用 safe-eval 引擎)。优势: 营销页面 (618、双 11) 的搭建从前端开发 3 天降到运营自助配置 2 小时。前端不需要发版即可上线新页面。Schema 可版本化管理、A/B 测试、灰度发布。代价是灵活性受限于预定义组件库, 复杂交互仍需开发自定义组件。

### 19. 模块联邦是什么? 在你的项目中解决了什么问题?

Module Federation 是 Webpack 5 引入的运行时模块共享方案, 允许多个独立构建的应用在运行时动态加载彼此的模块, 就像它们是同一应用的一部分。在阿里妈妈项目中, 广告投放平台由 5 个独立微前端应用组成 (出价、人群、创意、报表、审核), 之前用 qiankun 做沙箱隔离, 但每个应用打包时都要重复打包 lodash、moment、antd 等公共依赖, 总包体积 12MB。引入模块联邦后: 将公共组件库 (@alimama/shared-ui) 和工具库暴露为 federated module, 各子应用作为 consumer 运行时加载, 实现了 (1) 公共依赖只加载一份 (shared scope 配置 singleton: true), 包体积从 12MB 降到 5MB。 (2) 子应用独立部署, shared 模块更新后子应用自动获取最新版, 无需重新构建。 (3) 组件热更新 -- shared-ui 发布新版本后, 子应用刷新即生效, 不需要逐个发布。

### 20. @module-federation/vite 相比 webpack 的模块联邦有什么差异? 你贡献了什么?

差异: Webpack 的模块联邦基于 runtime chunk 注入, 在 entry 阶段插入 federation runtime, 依赖 Webpack 的 chunk graph 做模块解析。Vite 在 dev 模式用 ESM 原生加载, build 用 Rollup, 架构完全不同, 无法复用 Webpack 的 runtime 机制。@module-federation/vite 的实现方式是: (1) dev 模式: 用 Vite plugin 拦截模块请求, 对 remote 模块生成虚拟模块 (virtual module), 内部动态创建 script 标签加载远端 entry, 用 ESM import 解析导出的模块。 (2) build 模式: 用 Rollup plugin 在 generateBundle 阶段注入 federation runtime, 将 exposes 的模块单独打包为 chunk, shared 依赖走 Rollup 的 manualChunks。我贡献的部分: 修复了 dev 模式下 HMR 不生效的问题 -- remote 模块变更后, consumer 端的虚拟模块没有被 invalidate, 需要在 Vite plugin 的 handleHotUpdate 钩子中手动触发远程 module map 的刷新, 并向依赖图注入 invalidate 信号。PR 包含测试用例覆盖 remote + HMR 场景。

### 21. Webpack 模块联邦和 Vite 模块联邦的接入有什么区别和难点?

Webpack 接入: 在 webpack.config.js 的 plugins 中配置 new ModuleFederationPlugin({ name, remotes, exposes, shared }), 构建产物自动生成 remoteEntry.js。配置 shared 时需注意版本对齐, 用 requiredVersion 指定 semver range, 否则可能出现 React 双实例。Vite 接入: 通过 @module-federation/vite 的 Vite plugin 配置, 语法类似但底层不同。难点差异: (1) dev server -- Webpack dev-server 天然支持 remoteEntry.js serve, Vite dev server 需要额外配置 middleware 处理 federated 模块请求。 (2) 共享依赖处理 -- Webpack 用 shared scope 在运行时协商版本 (singleton + eager), Vite 的 ESM 模式下无法延迟解析, dev 时必须明确 remote URL。 (3) 类型支持 -- Webpack 方案配合 @module-federation/typescript 可在构建时生成共享类型, Vite 方案目前类型支持较弱, 需要手动维护 d.ts。 (4) 生态兼容 -- 部分 Webpack 生态的 loader (css-loader, less-loader) 在 Vite 中需替换为对应 plugin, federated 模块中的 CSS 隔离策略不同。整体迁移工作量: 纯 Webpack 项目 2 天, Vite 项目 3-4 天 (需处理兼容层)。

## 项目: @swifty/sentry SDK

### 22. 发布订阅架构如何设计? core 和 plugin 如何解耦?

架构设计: Core 层定义 EventBus 类, 提供 on(type, handler)、emit(type, payload)、off(type, handler) 三个方法, 事件类型用 TS enum 定义 (如 EVENT_ERROR、EVENT_PERFORMANCE、EVENT_BEHAVIOR)。Core 负责 SDK 生命周期 (init、flush、destroy) 和通用的数据管道 (scope 管理、breadcrumb 记录)。Plugin 层每个功能独立包 (@swifty/sentry-plugin-error、@swifty/sentry-plugin-performance 等), 在 install(core) 方法中调用 core.on() 订阅事件、core.emit() 发布数据。Core 对 Plugin 只暴露 PluginContext 接口 (包含 emit、addBreadcrumb、setTag 等方法), 不暴露内部状态。具体解耦点: (1) Plugin 之间不直接引用, 通过事件通信。 (2) Plugin 可以声明依赖其他 Plugin (peerDependencies), 运行时 Core 检查依赖图并提示缺失。 (3) 上报逻辑抽象为 Transport 接口, Plugin 只管产出数据, 不关心如何发送。这种架构允许按需引入 plugin, tree-shaking 后核心包只有 8KB。

### 23. JSError 上报后如何通过 source map 还原故障现场? 整个链路如何实现?

链路分四步: (1) 采集端: try-catch 全局包裹或 window.onerror 捕获 JS 异常, 记录错误消息、文件名、行号、列号、堆栈字符串。同时收集页面 URL、用户标识、浏览器 UA、时间戳。错误数据通过 beacon (navigator.sendBeacon) 上报到采集网关, 保证页面 unload 时数据不丢失。 (2) 服务端: 采集网关接收后写入 Kafka, consumer 入库 ClickHouse。同时构建系统在每次 deploy 时将 source map 上传到专用 OSS bucket (路径格式: /{appId}/{version}/{filename}.map), 上传完成后从产物中删除 source map 防止源码泄露。 (3) 还原: 后台服务消费错误事件, 根据 stack frame 中的 {filename, line, column} 从 OSS 下载对应版本的 source map, 用 mozilla/source-map 库的 SourceMapConsumer.originalPositionFor({line, column}) 还原为源码中的真实位置 (原始文件名、行号、函数名)。 (4) 聚合: 还原后的 stack trace 做归一化 (替换动态路径参数、去除 query string), 按归一化后的 stack fingerprint 聚合, 相同根因的错误合并展示, 支持按影响用户数、发生频次排序。

### 24. rrweb 的原理是什么? 全量快照 + 增量事件具体如何实现? 对性能影响多大?

rrweb 录制原理: 首次录制生成全量快照 (full snapshot), 用 MutationObserver 监听 DOM 变化产生增量事件 (incremental snapshot)。全量快照: 序列化整个 DOM 树为虚拟 JSON 结构 (非 innerHTML, 而是逐节点记录 tagName、attributes、childNodes、textContent), 对 script/style 标签内容做特殊处理 (序列化 CSS rules 和内联脚本), canvas 通过 toDataURL 捕获。增量事件: MutationObserver 的 callback 中记录 mutations 类型 (childList、attributes、characterData), 每个 mutation 生成 {type, target (node id), args} 事件。节点用唯一 ID 标识 (WeakMap 缓存 node -> id 映射), 回放时根据 ID 定位节点执行变更。性能优化: MutationObserver callback 中对高频 mutation 做批量合并 (throttling 30ms), 序列化用 requestIdleCallback 在空闲期执行。全量快照生成耗时约 15-30ms (对典型页面 500 个 DOM 节点), 增量事件每秒产生 50-200 个轻量 JSON 对象 (每个 < 200 bytes), CPU 开销 < 1%。通过 gzip 压缩后每秒录制数据约 5-10KB, 10 分钟录制约 3-6MB, localStorage 存 5 条 (LRU 淘汰), 最大占用 30MB。

### 25. 白屏检测的关键点采样是什么? 采样点如何选取?

白屏检测的关键点采样: 在 viewport 中按栅格取 N 个采样点, 通过 document.elementFromPoint(x, y) 获取该坐标下的 DOM 元素, 判断是否为"有意义内容" (非 body、非空 div、非 loading skeleton)。采样点选取策略: 将 viewport 等分为 4x4 栅格 (16 个采样点), 取每个栅格的中心坐标, 同时增加 5 个业务关键位置点 (如主内容区中心、导航栏中心、CTA 按钮位置 -- 由业务方配置 selector 后计算 getBoundingClientRect 获取)。检测结果判定: 如果 16+5=21 个点中有意义的元素占比 < 阈值 (默认 30%), 则判定为白屏。触发时机: DOMContentLoaded 后 3s、5s、8s 各检测一次 (setTimeout), 避免 SPA 路由切换时的误报。误报处理: 对 loading 态页面, 配置白名单 selector (如 .skeleton-loader), 如果采样点命中白名单元素则不计入"无意义"。检测结果通过 PerformanceObserver 的 mark 打点, 配合上报链路发送到监控平台, 白屏率作为核心监控指标之一。

### 26. LCP/FCP/CLS/INP 这些指标是如何采集的? 用了哪些 Observer API?

LCP (Largest Contentful Paint): 用 PerformanceObserver 监听 'largest-contentful-paint' entry type, 取最后一个 entry 的 renderTime (或 loadTime, 取较大值)。需要注意在 beforeunload 或 visibilitychange hidden 时做最终取值, 因为 LCP 可能在页面生命周期内多次更新。FCP (First Contentful Paint): PerformanceObserver 监听 'paint' entry type, 取 name === 'first-contentful-paint' 的 entry.startTime。CLS (Cumulative Layout Shift): PerformanceObserver 监听 'layout-shift' entry, 累加 entry.value (但排除 hadRecentInput 为 true 的偏移, 即用户交互后 500ms 内的偏移不计)。INP (Interaction to Next Paint): 监听 'event' entry type (long animation frames, >= 50ms), 记录每次交互从 input 到下一个 paint 的延迟, 取所有交互中 P98 的值 (即最慢的 2% 被忽略)。采集时统一在 PerformanceObserver 的 callback 中用 buffered: true 防止 observer 注册晚于事件触发。指标数据缓存在内存中, 通过 pagehide 事件或 visibilitychange (hidden) 触发上报, 用 sendBeacon 保证可靠性。数据格式: {name, value, id, navigationType, rating}, rating 按 Google 阈值标记 good/needs-improvement/poor。

### 27. 三级降级上报策略的具体逻辑是什么? 在哪些场景下触发降级?

三级降级策略是为了应对不同网络环境和上报通道故障: 第一级 (正常模式): 使用 navigator.sendBeacon 上报到主域名采集网关, 数据格式为 JSON, 请求走 HTTPS, 延迟 < 100ms。当 sendBeacon 返回 false (队列满或浏览器限制) 或连续 3 次 fetch 上报超时 (timeout 3s), 降级到第二级。第二级 (压缩模式): 对数据做 gzip 压缩 (用 pako 库), 上报到备用域名 (采集网关的 CDN 加速节点), 数据量减少 70%, 减少带宽压力。当备用域名也不通 (DNS 解析失败、SSL 握手超时) 时, 降级到第三级。第三级 (离线模式): 数据写入 localStorage (key 按日期分桶), 设置最大容量 5MB, 超出时 LRU 淘汰最早的数据。页面下次加载时, SDK init 阶段检查 localStorage 中是否有离线数据, 有则尝试批量上报, 成功后清除。如果 localStorage 也失败 (隐私模式、容量限制), 最终 fallback 为丢弃数据并记录 metric (上报丢弃率), 让运维感知数据缺失。整个策略用有限状态机管理, 每级有独立的计数器 (失败次数、重试间隔 exponential backoff: 1s -> 2s -> 4s -> 8s, 最大 30s)。

### 28. SDK 包体积太大影响首屏加载怎么办? 有哪些优化手段?

包体积优化六个方向: (1) 按需加载 -- 将 plugin 拆为独立包 (error、performance、behavior、replay), 主包只有 core + error plugin (8KB gzip), 其他 plugin 用户按需 import。 (2) Tree-shaking 友好 -- 所有导出用 ESM 的 export function 而非 export default 对象, 确保 bundler 可以 DCE (dead code elimination)。避免 side effects, package.json 声明 "sideEffects": false。 (3) 依赖优化 -- 去掉 moment (换 dayjs, 2KB), 去掉 lodash 整体 (只 lodash-es/debounce), pako 替换为 fflate (gzip 实现, 体积小 30%)。 (4) 代码分割 -- replay plugin (含 rrweb) 单独 chunk (45KB gzip), 仅在用户触发 "记录模式" 时动态 import()。 (5) 内联关键路径 -- SDK init 的关键代码 (< 3KB) 以 inline script 形式嵌入 HTML, 非关键部分 (performance 指标采集) 延迟到 requestIdleCallback 加载。 (6) 压缩 -- 使用 terser 的 max compress 配置, 变量名混淆, 去除 console/assert, 开启 pure_getters。最终主包从 52KB gzip 降到 8KB, 全功能包从 180KB 降到 65KB gzip。

## 项目: @swifty/swifty CLI Agent

### 29. 5 层架构具体是哪 5 层? 每层职责是什么?

五层从上到下: (1) CLI 交互层 -- 负责终端 UI 渲染 (用 Ink/Terminal Renderer), 处理用户输入、Markdown 渲染、进度条、spinner、命令解析 (yargs/commander)。这一层不包含业务逻辑, 只负责 UX。 (2) Agent 编排层 -- 核心 Agent Loop 实现: 接收用户消息 -> 组装 prompt -> 调用 LLM -> 解析 tool_call -> 执行工具 -> 结果注入上下文 -> 继续循环, 直到 LLM 输出纯文本 (无 tool_call)。包含 ReAct 状态机、最大迭代次数限制 (默认 30 轮)、token 用量追踪。 (3) 工具执行层 -- Registry 模式管理所有 tools (file_read, file_write, bash_exec, web_fetch 等), 每个 tool 有 name、description (给 LLM 的函数签名)、inputSchema (JSON Schema)、execute 方法。工具执行结果做安全过滤 (如 bash 输出超长则 truncate)。 (4) LLM Provider 层 -- 抽象 Provider 接口 (chat, streaming), 适配 OpenAI、Anthropic、本地 Ollama 等不同后端。处理 API key 管理、rate limiting (leaky bucket)、请求重试 (exponential backoff)、流式 token 回调。 (5) 基础设施层 -- 配置管理 (config.yaml)、日志 (结构化 JSON log)、会话存储 (SQLite)、权限检查、MCP client/server、上下文压缩引擎。层间通过接口隔离, 上层不直接依赖下层具体实现。

### 30. ReAct 范式的 Agent Loop 具体实现是什么? 与 Chain-of-Thought 区别是什么?

ReAct (Reasoning + Acting) 实现: Agent Loop 是一个 while 循环, 每轮做四步: (1) Reasoning -- 让 LLM 输出思考过程 (thinking 块, 用 XML 标签包裹), 分析当前状态和下一步计划。 (2) Acting -- LLM 输出 tool_call (function name + arguments JSON), Agent 解析后调用对应 tool 执行。 (3) Observation -- tool 执行结果注入 conversation, 作为下一轮的 input。 (4) 循环直到 LLM 不再输出 tool_call (输出最终文本), 或达到 max_iterations (30 轮) 触发强制结束。与 Chain-of-Thought 的区别: CoT 只有 reasoning, 没有 acting -- LLM 在一次调用中完成所有思考并输出答案, 不能与外部环境交互。ReAct 是 CoT + 工具调用的交替循环, 允许 LLM 根据中间结果调整策略。例如 CoT 模式下 LLM 只能猜测文件内容, ReAct 模式下 LLM 可以先 read_file 获取实际内容再回答。代码上, ReAct loop 的关键是用 streaming parser 实时解析 LLM 输出中的 JSON tool_call, 避免等待完整响应, 减少延迟。每轮 tool 执行结果截断到 8K tokens, 防止上下文爆炸。

### 31. 5 层权限系统每一层是什么? 为什么需要这么多层?

五层权限从外到内: (1) 全局策略层 -- 配置文件定义的全局规则, 如禁止执行 rm -rf、禁止访问 /etc/shadow, 用正则匹配拦截。这是最外层的硬限制, 任何工具调用都要过。 (2) 会话权限层 -- 每次启动 Agent 时用户选择的权限级别 (safe/normal/dangerous), safe 模式禁止 bash 执行, normal 需确认, dangerous 自动放行。 (3) 工具级别权限 -- 每个 tool 声明自己的 risk_level (read/write/execute), write 和 execute 级别需要用户交互确认。 (4) 目录范围层 -- 限制 Agent 可操作的目录范围 (worktree 配置), 防止 Agent 修改项目外的文件。 (5) 实时确认层 -- 对高危操作 (如 git push --force, SQL DROP) 弹窗二次确认, 即使用户选了 dangerous 模式。需要五层是因为: Agent 有强大的文件系统操作能力, 单一层面无法覆盖所有风险场景。全局策略处理已知危险模式, 会话权限给用户主动控制, 工具级别做细粒度管控, 目录范围限制爆炸半径, 实时确认兜底未知风险。实际中 90% 的操作走 safe/normal 自动放行, 只有 10% 触发确认。

### 32. 上下文压缩的具体算法是什么? 压缩率多少?

上下文压缩解决 LLM context window 有限 (如 128K tokens) 但长对话会溢出的问题。算法分三级: (1) 工具结果摘要 -- tool_call 的返回结果 (如 bash 输出、file_read 内容) 用 summarizer LLM (小模型, 如 GPT-4o-mini) 压缩, 保留关键信息去掉冗余。一条 4K tokens 的 bash 输出压缩到 400 tokens, 压缩率 90%。 (2) 对话历史滑动窗口 -- 保留最近 N 轮 (默认 10 轮) 完整对话, 更早的对话用 summarizer 压缩为一段摘要 (500 tokens), 注入 conversation 开头。 (3) 动态裁剪 -- 当总 token 数接近 context window 上限的 85% 时, 对最大的 tool_result 块做进一步裁剪 (取首尾各 2K tokens, 中间截断标记为 [truncated])。压缩率整体约 75-85%, 即 100K tokens 的原始对话压缩到 15-25K tokens, 可支撑约 100 轮对话。压缩质量的衡量: 在 50 个 benchmark 任务中, 有压缩的 Agent 成功率 vs 无压缩 (达到上限后截断) 是 78% vs 42%, 说明压缩保留了足够的上下文信息。实现上用 tiktoken 做 token 计数, 每次 Agent loop 迭代前检查并触发压缩。

### 33. MCP 接入的具体方式是什么? 解决了什么问题?

MCP (Model Context Protocol) 是一种标准化的工具扩展协议, 允许 Agent 动态发现和调用外部工具。接入方式: (1) MCP Client 集成 -- Agent 启动时根据配置文件读取 MCP server 列表 (每个 server 有 command、args、env), 通过 stdin/stdout (stdio transport) 或 HTTP SSE 连接 MCP server。 (2) 工具发现 -- 连接建立后调用 tools/list 获取 server 暴露的工具列表 (name、description、inputSchema), 与 Agent 内置工具合并, 统一注册到 tool registry。 (3) 工具调用 -- Agent 选择 MCP 工具时, 通过 tools/call 将参数发给 MCP server, server 执行后返回结果, 结果注入 Agent 上下文。解决的问题: Agent 内置工具有限, 实际项目中可能需要查询数据库、调用内部 API、操作 CI/CD 系统等, 通过 MCP 协议, 第三方可以编写 MCP server 扩展 Agent 能力, 而无需修改 Agent 自身代码。类似 "plugin system for AI agents"。实际项目中接入了 GitHub MCP server (查询 PR/issue)、PostgreSQL MCP server (执行 SQL)、Jira MCP server (查询工单), 扩展了 Agent 的工程能力。

### 34. 会话持久化和跨会话记忆提取如何设计? 记忆整理的触发机制是什么?

会话持久化: 每次 Agent 对话存 SQLite (一张 conversations 表, id、messages JSON、created_at、updated_at), 工具执行结果和 thinking 块一并存储。用户可 resume 历史会话继续对话。跨会话记忆: 独立的 memories 表, 存储从对话中提取的结构化记忆 (category: preference/fact/decision, content, source_conversation_id, relevance_score)。提取方式: 每轮对话结束后, 用 LLM 判断当前对话是否包含值得长期记住的信息 (如 "用户偏好用 tabs 而非 spaces", "项目使用 pnpm"), 有则提取为记忆记录。提取 prompt: "Summarize any long-term relevant facts or user preferences from this conversation." 记忆使用: 新会话开始时, 根据用户首条消息做向量搜索 (用 embedding 模型将记忆 content 和 query 编码, 计算 cosine similarity), 取 top-5 相关记忆注入 system prompt。记忆整理触发机制: (1) 被动触发 -- 记忆条数超过 200 时, 启动合并任务, 用 LLM 将相似记忆合并 (如 3 条关于 "代码风格" 的记忆合并为 1 条综合记忆), 删除原始记录。 (2) 主动触发 -- 用户输入 /memories 命令手动查看和删除记忆。 (3) 定时触发 -- 每天首次启动时检查是否有过期记忆 (30 天未被引用的记忆降权, 90 天未引用删除)。

### 35. worktree、Subagent、Agent Teams 的设计参考了 Claude Code, 有什么异同?

相同点: (1) Worktree -- 都使用 git worktree 为每个并行任务创建独立工作目录, 避免文件编辑冲突。主 Agent 在 /project, Subagent 1 在 /project-wt-1, 互不干扰。 (2) Subagent -- 主 Agent 根据任务分解 spawn 子 Agent, 子 Agent 有独立上下文和工具权限, 完成后结果汇报给主 Agent。 (3) Agent Teams -- 多个 Subagent 并行工作, 主 Agent 做调度和结果综合。不同点和改进: (1) 通信机制 -- Claude Code 的 subagent 之间不能直接通信, 我的设计增加了 message broker (基于 EventBus), 允许 subagent 之间通过 publish/subscribe 交换信息, 适合需要协作的场景 (如一个 Agent 写代码, 另一个同时写测试)。 (2) 权限继承 -- Claude Code 的 subagent 权限与主 Agent 相同, 我的设计支持权限收窄 (如 subagent 只能读不能写)。 (3) Worktree 回收 -- Claude Code 需手动清理, 我的设计在 subagent 完成后自动 merge 分支、删除 worktree, 冲突时暂停并请求用户介入。 (4) 失败恢复 -- subagent 崩溃时, 主 Agent 自动 spawn replacement 并注入之前的进度状态 (从 SQLite 恢复), 而不是丢失整轮工作。

## 技能深度

### 36. React Fiber 架构了解多少? 时间切片、优先级调度是如何工作的?

React Fiber 是 React 16 引入的协调引擎, 将传统的递归式 reconciliation 改为链表遍历的可中断工作单元模型。每个 React 元素对应一个 Fiber node (JS 对象), 包含 type、stateNode、child、sibling、return (父节点) 指针, 构成一棵链表树。时间切片 (Time Slicing): Coordinator 阶段 (render phase) 被拆分为多个工作单元, 每个单元处理一个 Fiber node。Scheduler 用 MessageChannel (或 requestIdleCallback) 模拟时间片, 每个时间片约 5ms (一帧 16.6ms 留给渲染)。当前时间片用完, 协调器保存当前 Fiber 指针 (workInProgress), yield 控制权给浏览器, 下一个时间片继续。优先级调度: 用 Lane 模型 (32 位 bitmask), 从 SyncLane (最高, 阻塞优先) 到 IdleLane (最低) 划分优先级。用户交互触发的更新 (click) 标记为 InputContinuousLane, setTimeout 回调标记为 DefaultLane。高优先级更新可以"打断"当前正在进行的低优先级渲染 (interrupt), 先完成高优先级任务, 之后恢复低优先级。Concurrent Mode 下, 多个不同优先级的更新可以 batch 和 reorder, 实现 transition 等延迟渲染能力。

### 37. Vue3 响应式原理和 Vue2 的区别是什么? Proxy 的优势是什么?

Vue2 响应式: 在 init 时递归遍历 data 对象, 对每个属性用 Object.defineProperty 定义 getter/setter。getter 中收集依赖 (Dep.target, 当前 Watcher), setter 中触发依赖通知更新。局限: (1) 无法检测属性新增和删除 (需 Vue.set/Vue.delete)。 (2) 数组需重写 push/pop 等 7 个变异方法。 (3) 嵌套对象要递归 defineProperty, 初始化时全量递归, 大数据量下性能差。Vue3 响应式: 用 ES6 Proxy 替代 defineProperty, reactive(obj) 返回 Proxy 包装后的对象。getter 中调用 track(obj, key) 收集 effect, setter 中调用 trigger(obj, key) 触发 effect。优势: (1) 可拦截任意操作 (get/set/has/deleteProperty/ownKeys), 新增和删除属性无需 API 介入。 (2) 懒代理 -- 只在 get 访问到嵌套对象时才对该对象 reactive, 不需要初始化时全量递归, 大对象场景性能好。 (3) 支持 Map/Set/WeakMap 等集合类型 (通过 collectionHandlers)。 (4) Proxy 可以拦截 has 操作, 支持 in 操作符的响应式。代价: Proxy 无法 polyfill, 不支持 IE11, 这是 Vue3 放弃 IE 的根本原因。

### 38. Zustand 和 Redux 相比优势是什么? useState 和 useReducer 的区别?

Zustand vs Redux: Zustand 是极简状态管理 (1KB), 核心理念是 store 就是 JS 对象 + set/get 函数, 没有 action/reducer/dispatch 的概念。优势: (1) 零 boilerplate -- 不需要写 action type、action creator、reducer switch、connect/useSelector。 (2) store 可在组件外使用 (直接 import store.getState()), Redux 必须在 Provider 包裹范围内。 (3) selector 内置, 用 useStore(state => state.count) 订阅局部状态, 不触发无关 re-render, Redux 需要 reselect/memo 优化。 (4) 中间件轻量 -- persist (localStorage 持久化)、devtools (接入 Redux DevTools) 都是一行代码。劣势: 没有 Redux Toolkit 的 createAsyncThunk 等异步方案、没有内置的 RTK Query 数据获取, 大型项目缺乏结构约束。useState vs useReducer: useState 适合独立、简单的状态 (boolean、string、number); useReducer 适合多个状态有关联的更新 (如表单有 10 个字段, dispatch({type: 'SET_FIELD', field, value}) 比 10 个 setState 更清晰)。useReducer 的 reducer 是纯函数, 方便测试; dispatch 的 identity 稳定, 作为 prop 传递不会触发子组件 re-render; 复杂状态逻辑集中在 reducer 中, 避免分散在组件各处。

### 39. Vite 相比 Webpack 快的根本原因是什么?

核心原因有两方面: 开发阶段和构建阶段策略不同。开发阶段: Webpack 在 dev-server 启动时对所有模块做全量打包、转译、依赖图构建, 项目越大启动越慢 (O(n) 模块数)。Vite 利用浏览器原生 ES Module 支持, 启动时不做任何打包, 只在浏览器请求某个模块时, 用 esbuild (Go 编写, 比 babel/swc 快 10-100x) 实时转译该模块返回。这样冷启动是 O(1) -- 只处理入口文件, 其他模块按需转译, 配合 HTTP 304 缓存, 二次启动几乎零等待。构建阶段: Vite 用 Rollup 做 production build (Tree-shaking 更彻底, 输出 ESM), 但 esbuild 也参与了 CSS/TS 转译 (比 Rollup 自带 plugin 快)。其他加速因素: (1) 依赖预构建 -- 用 esbuild 一次性将 node_modules 中的 CJS 依赖转为 ESM (缓存在 node_modules/.vite), 后续不再处理。 (2) HMR 基于 ESM -- 修改一个模块, 只需 re-fetch 该模块的 ESM 请求, 不需要重新计算依赖图 (Webpack HMR 需要遍历 affected modules)。 (3) esbuild 用 Go 编写, 利用多核并行转译, 而 babel 是单线程 JS。综合效果: 千模块项目 Vite cold start < 1s, Webpack 10-30s。

### 40. Go 的 goroutine 调度和 Node 的事件循环有何不同? 什么场景下用 Go?

Node 事件循环: 单线程, 基于 libuv 的事件队列驱动。所有 I/O 操作 (网络、文件、timer) 通过 callback/Promise 异步执行, 主线程只负责调度。CPU 密集型任务会阻塞事件循环 (如 JSON.parse 大文件), 必须用 worker_threads 或 child_process 卸载。优点是编程模型简单 (无锁、无竞态), 缺点是单核利用率有限, 水平扩展靠 cluster 多进程。Go 调度器 (GMP 模型): G = goroutine (用户态协程, 初始栈 2KB, 可动态伸缩), M = OS thread, P = logical processor (默认等于 CPU 核心数)。goroutine 遇到阻塞 (channel、syscall、sleep) 时, M 会解绑当前 G 并绑定新 G 继续执行, P 永远忙碌。goroutine 间通过 channel 通信, 避免共享内存加锁。多核并行 -- 多个 P 各自拥有 goroutine 队列, 可并行在不同 CPU 核心执行。优势: goroutine 启动成本极低 (2KB stack, 对比 OS thread 1MB), 单机可跑百万 goroutine, 天然利用多核。使用 Go 的场景: (1) 高并发网络服务 (RPC、网关), 每请求一 goroutine 模型简洁高效。 (2) CPU 密集型计算 (编解码、压缩), 多核并行。 (3) 需要强类型 + 高性能的 CLI 工具、基础设施组件。在 TikTok Performance 团队选 Go 是因为 Kafka consumer + Redis/ClickHouse 写入场景, goroutine 轻松管理数千并发连接, 比 Node cluster 方案少了很多 IPC 开销和进程管理复杂度。
