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
- [技能深度](#技能深度)
  - [36. React Fiber 时间切片和优先级调度?](#36-react-fiber-架构了解多少-时间切片优先级调度是如何工作的)
  - [37. Vue3 Proxy 响应式 vs Vue2?](#37-vue3-响应式原理和-vue2-的区别是什么-proxy-的优势是什么)
  - [38. Zustand vs Redux? useState vs useReducer?](#38-zustand-和-redux-相比优势是什么-usestate-和-usereducer-的区别)
  - [39. Vite 比 Webpack 快的根本原因?](#39-vite-相比-webpack-快的根本原因是什么)
  - [40. Go goroutine vs Node Event Loop?](#40-go-的-goroutine-调度和-node-的事件循环有何不同-什么场景下用-go)

---

## 字节跳动 (TikTok Performance)

### 1. Kitex 是什么? 在 TikTok Performance 团队中如何与 Thrift 配合使用?

Kitex 是字节跳动 CloudWeGo 开源的高性能 Go RPC 框架, 基于 netpoll 网络库构建, 支持多协议 (Thrift、KitexProtobuf、gRPC)。在 TikTok Performance 团队中, 后端服务使用 Go + Kitex 构建, 服务间通过 Thrift IDL 定义接口契约。具体流程: 先在 .thrift 文件中定义 service 和 struct, 然后用 kitex 命令行工具生成 Go server/client 桩代码。Kitex 内部用 thrift 编解码做序列化, 相比 JSON 体积小 30%~50%。同时通过 CodeGen 工具将同一份 Thrift IDL 生成 TypeScript 类型定义和 npm 包, 供 BFF 层 (Nest.js) 直接消费, 实现了后端到前端的类型安全传递, 消除了手写 DTO 的维护成本。Kitex 的连接池复用、多路复用 (mux) 模式让单机 QPS 稳定在 5w+ 级别。

### 2. Kafka 转发数据到 Redis/MySQL/ClickHouse 的整体数据链路如何设计? 为什么选这三种存储各承担什么职责?

整体链路: TikTok 客户端和服务端埋点数据先写入 Kafka topic, 由 Go consumer group 消费。Consumer 内部做数据清洗、字段校验后, 按数据类型路由到三个存储系统。Redis 承担实时热度数据, 用 Sorted Set 维护最近 24 小时的指标排行榜, TTL 设为 1 天, 用于实时 Dashboard 展示, 查询延迟 P99 < 2ms。MySQL 存储结构化配置数据和用户权限, 作为权威数据源, 数据量小但要求强一致。ClickHouse 作为 OLAP 引擎承接海量时序数据 (日均约 2 亿条事件), 利用 MergeTree 引擎的列式存储和稀疏索引做秒级聚合查询, 压缩比约 8:1。三者配合形成"实时查 Redis、历史分析查 ClickHouse、配置走 MySQL"的分层架构, 消费侧用批量写入 (ClickHouse batch insert 500 行/批) 和 pipeline (Redis pipeline 200 条/批) 提升吞吐。

### 3. 多层缓存设计具体是哪些层? 各级命中率如何?

四层缓存架构: 第一层是浏览器内存缓存, 前端用 SWR 的 cache provider 缓存已请求数据, 零网络开销。第二层是 BFF (Nest.js) 本地 LRU 缓存, 用 lru-cache 库, max 500 条, TTL 30s, 热门面板上命中率约 60%, 减少下游 RPC 调用。第三层是 Redis 集群缓存, 存储聚合后的热点指标数据, TTL 5min, 全局命中率约 45%。第四层是 ClickHouse 的物化视图预聚合, 将原始查询的 P99 延迟从 2 秒降到 200ms。请求穿透时逐层 fallback。缓存一致性通过 Kafka 消费成功后异步删除 Redis key (invalidate) 保证最终一致, BFF 层用 stale-while-revalidate 模式容忍短暂不一致。整体将前端面板查询的 P99 延迟控制在 300ms 以内。

### 4. Thrift 生成 npm 包给 BFF 消费, 这解决了什么问题? 跨团队协作收益如何?

解决的问题是前后端接口契约漂移。传统模式前端手写 TypeScript interface, 后端改字段不同步导致线上 bug。通过 Thrift IDL 生成 TS 类型定义并发布 npm 包 (包名如 @tiktok/perf-thrift-types), BFF 层 import 使用时获得编译期类型检查。CI 流程: Thrift 文件变更 -> CodeGen 生成新 TS types -> 自动 bump 版本 -> 发布到内部 npm registry -> BFF 项目 dependabot 自动升级 PR。收益: 接口联调时间从 2 天降到 0 (类型保证), 字段变更的线上事故归零, 前后端只需要 review Thrift IDL 的 diff 即可。跨团队 4 个前端 + 3 个后端共用一套 IDL, 每次迭代节省约 8 小时沟通成本。

### 5. 你参与的 CloudWeGo Kitex 开源项目贡献了什么?

主要贡献了两部分: 一是修复了 connection pool 在 context cancel 时未正确归还连接的 bug, 该问题在高并发下会导致连接池耗尽; 同时优化了空闲连接被复用前的健康检查逻辑 (idle connection 缺少 liveness probe)。二是补充了 Thrift generic call 的 benchmark 测试和文档。generic call 允许不生成桩代码直接发起 RPC 调用, 适合网关代理场景, 我编写了基准测试覆盖 codec 性能, PR 被合入 main 分支。

### 6. 虚拟滚动列表的具体实现原理是什么? 在什么场景下使用?

场景: 性能指标日志列表, 单页最多渲染 10 万行, 直接渲染导致 FPS 掉到个位数。实现原理: 只渲染可视区域内的 DOM 节点。核心参数: containerHeight (可视区高度), itemHeight (每行固定 48px), scrollTop。可视区间 startIndex = floor(scrollTop / itemHeight), endIndex = startIndex + ceil(containerHeight / itemHeight) + buffer (上下各缓冲 5 行)。外层容器设置 padding-top 和 padding-bottom 模拟真实滚动高度。用 transform: translateY 代替 margin 避免 reflow。数据用 useMemo 切片, scroll 事件用 requestAnimationFrame 节流。对于动态行高, 维护一个行高缓存 Map, 首次渲染后通过 ResizeObserver 更新实际高度, 查询用二分查找定位行索引。优化后 10 万行列表滚动帧率稳定接近 60fps, DOM 节点始终控制在 50 个以内。

## 腾讯 (IEG)

### 7. React 类组件迁移到函数组件的具体步骤和难点是什么?

步骤分四阶段: 第一阶段盘点, 用 AST 脚本扫描所有 extends React.Component 的类, 标记有 shouldComponentUpdate、getDerivedStateFromProps 等生命周期的复杂组件。第二阶段逐组件迁移: 将 state 拆为多个 useState, componentDidMount/componentDidUpdate 合并为 useEffect, 用 useCallback 包裹传给子组件的回调。第三阶段处理难点: 对于 getSnapshotBeforeUpdate 迁移到 useLayoutEffect; 对于 ref 操作 DOM 从 createRef 转为 useRef + useEffect; 对于 render props 模式转为自定义 hook。第四阶段回归测试, 用 React Testing Library 对每个组件写单元测试, 覆盖状态变化路径。难点在于: 类组件中 this.setState 的批量更新行为和 hooks 的 batch 行为不同, 导致某些连续 setState 的组件在迁移后出现中间状态被吞掉的问题, 需要用 flushSync 显式同步更新。整个迁移涉及 80+ 个组件, 历时约 2 个月。

### 8. 什么是"未捕获的闭包"问题? 你的项目里具体是什么场景?

"未捕获的闭包"指函数组件中 useEffect 或 useCallback 的依赖数组遗漏, 导致闭包捕获的是旧渲染周期的 state 值。项目中的具体场景: 一个数据表格组件, useEffect 内调用 fetchData 并依赖 filters state, 但 dep array 忘写 filters。用户修改筛选条件后点击"刷新", fetchData 闭包内的 filters 仍是旧值, 导致查询结果不符合预期。更隐蔽的 case: 一个定时器用 setInterval 轮询状态, 闭包捕获了初始 render 的 count 值, 导致永远显示 0。排查方式: 启用 eslint-plugin-react-hooks 的 exhaustive-deps 规则, CI 卡住 warning 即报错。修复: 要么补全 deps, 要么对需要读最新值的场景用 useRef 存值 (ref.current 不参与闭包捕获), 或者使用函数式 setState(prev => prev + 1) 避免依赖外部变量。这类问题在类组件中不存在, 因为 this.state 总是最新值。

### 9. 接口响应时间不稳定导致的数据竞争是什么问题? 如何排查和解决?

问题描述: 用户快速切换 Tab 时, Tab A 的请求 (耗时 2s) 和 Tab B 的请求 (耗时 200ms) 几乎同时发出, Tab B 先返回渲染完毕后, Tab A 的响应回来覆盖了 Tab B 的数据, 造成展示错乱。这是经典的竞态条件 (race condition)。排查方式: 在 Network 面板按 waterfall 排序观察请求时序, 配合 React DevTools 查看 state 更新顺序确认是旧响应覆盖新数据。解决方案有三种: (1) AbortController -- 切换 Tab 时 abort 上一个请求, 在 useEffect cleanup 中调用 controller.abort(), fetch 会自动取消并抛 AbortError。 (2) 请求序号 -- 用 useRef 记录最新请求 ID, 响应回来后比对 ID, 不一致则丢弃。 (3) SWR 内置的 deduplication 和 revalidateOnFocus 机制自动处理。最终采用 AbortController 方案, 因为它真正取消网络请求, 减少服务端资源浪费, 并在 catch 中过滤 AbortError 避免误报。

### 10. TCP 连接池的实现要考虑哪些问题? 你实现的池化策略是什么?

TCP 连接池需要考虑: 连接复用与生命周期管理、空闲超时回收、连接健康检查、并发安全、背压控制。我的实现策略 (Node.js/TypeScript): 池结构维护 idle 数组和 active 集合, 最大连接数 20, 最小空闲 4。请求到来时优先从 idle 取连接, 取不到且未达上限再新建。连接封装为 PooledConn, 内含 net.Socket 和 lastUsedAt 时间戳。健康检查: 后台定时器每 10s 对空闲连接发送轻量 ping 帧探测存活, 死亡连接直接 destroy 不入池。空闲回收: 超过 idleTimeout (30s) 的连接关闭并从池中移除。背压: 达到 maxOpen 时新请求进入等待队列, 配合 acquire 超时 (3s) 快速失败, 避免请求无限堆积。协议适配: 针对 NoSQL 存储引擎的自定义 TCP 协议实现了帧解析器区分请求边界, 处理握手、鉴权等逻辑。实际效果: 将 TCP 三次握手开销从每次请求约 5ms 摊薄到接近 0, 吞吐量提升约 40%。

### 11. 进程池调用 C++ .so 动态链接库的具体方式是什么? 为什么不用 N-API?

具体方式: Node.js 通过 child_process.fork 创建 worker 进程池 (大小与 CPU 核心数一致, 默认 4 个), 每个 worker 进程内通过轻量的 N-API 绑定层加载 C++ .so (加解密、表文件解析库) 并调用导出函数。C++ 侧用 extern "C" 暴露 ABI 稳定的 C 接口。主进程按最少挂起任务数分发任务, worker 崩溃后由主进程监听 exit 事件自动重启补充。为什么不在主进程内直接 N-API 调用: 一是加解密和表文件解析是 CPU 密集任务, 在主进程内同步调用会阻塞 V8 event loop, 高负载下严重影响并发能力, 进程池天然将计算卸载到独立进程; 二是 .so 内部 segfault 会直接拖垮所在进程, 进程池隔离下 worker 崩溃不影响主服务。代价是 IPC 序列化开销约 1ms/次, 相比计算耗时 (加密 1MB 约 5ms, 解析大表文件几十 ms) 可接受, 且可以通过批量合并小任务进一步摊薄。

### 12. valgrind 排查 Node + C++ .so 内存泄漏的具体流程是什么? 发现了哪些泄漏点?

流程: 问题现象是 Node 进程 RSS 从启动时的 200MB 在 24 小时内涨到 800MB 以上, 但 heapdump 对比显示 JS 堆稳定, 判断泄漏在 C++ 层。首先编写 C++ 侧的单元测试, 模拟 Node 调用路径 (init -> parse -> cleanup), 用 valgrind --leak-check=full --show-leak-kinds=all ./test_binary 运行。valgrind 的 Memcheck 工具追踪每次 malloc/new 和 free/delete 的配对, 结束时报告 definitely lost (确认泄漏)、indirectly lost、possibly lost; 同时用 --tool=massif 跟踪堆分配趋势, 发现 C++ 层上下文对象的分配次数明显多于释放次数。定位到的泄漏点: 表文件解析函数在解密失败 (文件损坏、密钥错误) 时走了 early return 路径, 跳过了临时 buffer 的 free, 该分支在特定损坏表文件下会被频繁命中。修复方案是将裸指针改为 RAII 智能指针 (std::unique_ptr 配自定义 deleter), 保证任何返回路径都自动释放。辅助手段: 用 Node.js 官方的 valgrind suppressions 文件过滤 V8 的已知误报, 用 process.memoryUsage() 做进程级内存监控和告警。修复后 Memcheck 的 definitely lost 归零, 运行 24 小时后 RSS 增长不超过 20MB。

### 13. 对象池、v8 隐藏类在 Node 中如何优化 GC? 优化后 GC 停顿降低了多少?

对象池: 对高频创建的临时对象 (如表示数据行的 Row 对象), 维护一个预分配数组, 需要时从池中取、用完后重置字段归还, 避免 new 触发 GC。实现为 ObjectPool 类, 内部 Array 预分配 1000 个实例, getInstance/returnInstance 用 index 指针管理。V8 隐藏类 (Hidden Class / Map) 优化: V8 对结构相同的对象分配相同的隐藏类, 使属性访问走固定偏移而非 hash 查找。为保持隐藏类稳定, 确保所有对象在构造函数中以相同顺序赋值属性, 避免运行时动态 add/delete 属性 (会触发 hidden class transition, 退化为字典模式)。具体做法: Row 类构造函数预声明所有字段并赋默认值, 复用对象时只赋值不改变 shape。效果: 加解密和解析高频场景下, GC 暂停时间从平均 15ms 降低到 5ms, 吞吐量提升约 20%。通过 --prof 和 v8-profiler 验证了对象分配速率显著下降。

## 字节跳动 (Data-架构部门)

### 14. JSError 大模型自动修复的整体架构是什么? LLM 是如何获取上下文进行修复的?

架构分四层: 采集层、上下文组装层、LLM 推理层、审核发布层。采集层从 Sentry 风格的错误监控平台获取线上 JSError, 包含 stack trace、用户操作路径、浏览器环境信息。上下文组装层: 根据 stack trace 中的文件名和行号, 从 Git 仓库提取对应源码文件 (前后 50 行), 同时检索最近 3 次该文件的 git log diff, 再拉取该错误的聚合堆 (相同 stack 归为一组, 取出现频次最高的)。组装后的 prompt 包含: 错误信息、堆栈、源码上下文、git diff、修复建议模板。LLM 推理层: 调用大模型 API (temperature=0.1 减少随机性), 输出 JSON 格式的 patch (文件路径 + unified diff)。审核发布层: patch 自动在沙箱分支 apply, 跑单元测试和类型检查, 通过后提交 CR 到代码平台, 人工 review 后合入。准确率: 对高频错误, 自动 patch 通过验证 (编译 + 单测) 的比率约 65%, 经人工 review 后合入率约 47%。衡量收益以"错误 MTTR (平均修复时间)"为指标, 从人工的 4.2 天降到 0.8 天。

### 15. 自动修复的准确率是多少? 如何衡量收益?

评测方式: 从监控平台取 200 个历史已修复的 JSError, 用系统重新生成 patch, 与人工修复的 commit diff 做比对。准确率定义分三层: (1) 编译通过 (apply diff 后 tsc + build 成功) -- 78%。 (2) 验证通过 (修复后跑该模块所有单测) -- 65%。 (3) 语义等价 (与人工修复 diff 的 AST 差异 < 5 个节点, 用 ast-diff 工具比对) -- 47%。分析失败原因: 40% 是因为上下文不足 (跨文件依赖未注入), 30% 是修复方向错误 (如本应修改调用方却修改了被调方), 30% 是格式/lint 问题 (可自动 fix)。衡量业务收益: (1) MTTR 从 4.2 天降到 0.8 天。 (2) 每周节省 on-call 人力约 6 小时。 (3) 长尾错误覆盖率提升 -- 人工只修 P0/P1 错误, 自动修复可覆盖 P2/P3 级别的低频报错。

### 16. SWR 前端性能优化具体做了什么?

SWR (stale-while-revalidate) 是一种缓存优先的数据请求策略。项目中三个关键优化: (1) 首屏请求: 用 SWR 的 useSWR hook, 首次渲染直接返回 localStorage 中的 cached data (stale), 同时后台发起 revalidate 请求, 用户无感知获取最新数据, 首屏加载时间从 3.2s 降到 1.4s。 (2) 预取 (prefetch): 路由切换前, 在 onMouseEnter 事件中调用 mutate(key, fetcher, { revalidate: false }) 预加载下一页数据, 切换后 SWR 直接命中缓存。 (3) 分页列表的 optimistic update: 删除行时, 先乐观更新本地缓存 (从数组中移除), 再异步发请求, 失败时 rollback。SWR 内部用 Map 做全局 cache, 相同 key 的请求自动去重 (deduplication), 避免多组件同 key 重复请求。此外, 利用 SWR 的 refreshInterval 对监控面板数据做定时轮询, 配合 focusThrottleInterval 防止 Tab 切回时的重复请求风暴。

### 17. A2UI 是什么框架? 接入过程有什么难点?

A2UI (Agent to UI) 是字节内部的 AI 驱动 UI 渲染框架, 核心理念是 LLM 输出结构化 UI 描述 (JSON Schema), 前端渲染引擎将 Schema 转为 React 组件树。架构: Agent 后端通过 SSE 流式输出 UI Schema, 前端用流式解析器逐 chunk 组装完整 Schema, 渲染器递归渲染组件。接入难点: (1) 流式渲染的中间态处理 -- Schema 不完整时组件树不能崩, 需要对每个组件实现 fallback/skeleton 状态, 用 ErrorBoundary 兜底。 (2) Schema 版本兼容 -- 旧版 Schema 中某些字段在新版被重命名, 做了 Schema migration 中间层, 自动转换字段。 (3) 交互回调 -- LLM 生成的 UI 中按钮点击需要回调 Agent 继续推理, 实现了 action bridge, 将用户操作封装为 message 发回 SSE 通道。 (4) 性能 -- 流式渲染每秒产生 10-20 次 partial render, 用 React.memo + immutable diff 避免不必要的 re-render, 保证帧率。

## 阿里巴巴 (阿里妈妈)

### 18. Server&Schema-Driven UI 的理念是什么? 如何实现?

Server&Schema-Driven UI 的核心理念: 页面结构、组件配置、数据绑定全部由服务端下发的 JSON Schema 描述, 前端渲染引擎是"哑"的, 只负责将 Schema 具象化为 DOM。实现分三层: (1) Schema 协议层 -- 定义了一套 JSON Schema 规范, 包含 layout (栅格、Flex)、component (组件类型、props 映射)、data (数据源绑定表达式, 支持 JSONPath)、action (事件绑定、副作用链)。 (2) 服务端 Schema 引擎 -- 运营在后台可视化编辑 Schema, 发布后存储在 CDN。前端请求 Schema 时按版本灰度下发。 (3) 前端渲染层 -- 递归遍历 Schema 树, switch(componentType) 渲染对应 React 组件, props 从 data 绑定表达式求值 (用 safe-eval 引擎)。优势: 营销页面 (618、双 11) 的搭建从前端开发 3 天降到运营自助配置 2 小时。前端不需要发版即可上线新页面。Schema 可版本化管理、A/B 测试、灰度发布。代价是灵活性受限于预定义组件库, 复杂交互仍需开发自定义组件。

### 19. 模块联邦是什么? 在你的项目中解决了什么问题?

Module Federation 是 Webpack 5 引入的运行时模块共享方案, 允许多个独立构建的应用在运行时动态加载彼此的模块, 就像它们是同一应用的一部分。在阿里妈妈项目中, 广告投放平台由 5 个独立微前端应用组成 (投放管理、效果分析、人群管理、创意中心、财务结算), 之前用 qiankun 做沙箱隔离, 但每个应用打包时都要重复打包 lodash、moment、antd 等公共依赖, 总包体积 12MB。引入模块联邦后: 将公共组件库 (@alimama/shared-ui) 和工具库暴露为 federated module, 各子应用作为 consumer 运行时加载, 实现了 (1) 公共依赖只加载一份 (shared scope 配置 singleton: true), 包体积从 12MB 降到 5MB。 (2) 子应用独立部署, shared 模块更新后子应用自动获取最新版, 无需重新构建。 (3) 组件热更新 -- shared-ui 发布新版本后, 子应用刷新即生效, 不需要逐个发布。

### 20. @module-federation/vite 相比 webpack 的模块联邦有什么差异? 你贡献了什么?

差异: Webpack 的模块联邦基于 runtime chunk 注入, 在 entry 阶段插入 federation runtime, 依赖 Webpack 的 chunk graph 做模块解析。Vite 在 dev 模式用 ESM 原生加载, build 用 Rollup, 架构完全不同, 无法复用 Webpack 的 runtime 机制。@module-federation/vite 的实现方式是: (1) dev 模式: 用 Vite plugin 拦截模块请求, 对 remote 模块生成虚拟模块 (virtual module), 内部动态创建 script 标签加载远端 entry, 用 ESM import 解析导出的模块。 (2) build 模式: 用 Rollup plugin 在 generateBundle 阶段注入 federation runtime, 将 exposes 的模块单独打包为 chunk, shared 依赖走 Rollup 的 manualChunks。我贡献的部分: 修复了 dev 模式下 HMR 不生效的问题 -- remote 模块变更后, consumer 端的虚拟模块没有被 invalidate, 需要在 Vite plugin 的 handleHotUpdate 钩子中手动触发远程 module map 的刷新, 并向依赖图注入 invalidate 信号。PR 包含测试用例覆盖 remote + HMR 场景。

### 21. Webpack 模块联邦和 Vite 模块联邦的接入有什么区别和难点?

Webpack 接入: 在 webpack.config.js 的 plugins 中配置 new ModuleFederationPlugin({ name, remotes, exposes, shared }), 构建产物自动生成 remoteEntry.js。配置 shared 时需注意版本对齐, 用 requiredVersion 指定 semver range, 否则可能出现 React 双实例。Vite 接入: 通过 @module-federation/vite 的 Vite plugin 配置, 语法类似但底层不同。难点差异: (1) dev server -- Webpack dev-server 天然支持 remoteEntry.js serve, Vite dev server 需要额外配置 middleware 处理 federated 模块请求。 (2) 共享依赖处理 -- Webpack 用 shared scope 在运行时协商版本 (singleton + eager), Vite 的 ESM 模式下无法延迟解析, dev 时必须明确 remote URL。 (3) 类型支持 -- Webpack 方案配合 @module-federation/typescript 可在构建时生成共享类型, Vite 方案目前类型支持较弱, 需要手动维护 d.ts。 (4) 生态兼容 -- 部分 Webpack 生态的 loader (css-loader, less-loader) 在 Vite 中需替换为对应 plugin, federated 模块中的 CSS 隔离策略不同。整体迁移工作量: 纯 Webpack 项目 2 天, Vite 项目 3-4 天 (需处理兼容层)。

## 技能深度

### 36. React Fiber 架构了解多少? 时间切片、优先级调度是如何工作的?

React Fiber 是 React 16 引入的协调引擎, 将传统的递归式 reconciliation 改为链表遍历的可中断工作单元模型。每个 React 元素对应一个 Fiber node (JS 对象), 包含 type、stateNode、child、sibling、return (父节点) 指针, 构成一棵链表树。时间切片 (Time Slicing): Coordinator 阶段 (render phase) 被拆分为多个工作单元, 每个单元处理一个 Fiber node。Scheduler 用 MessageChannel (降级为 setTimeout) 模拟时间片, 每个时间片约 5ms (一帧 16.6ms 留给渲染)。当前时间片用完, 协调器保存当前 Fiber 指针 (workInProgress), yield 控制权给浏览器, 下一个时间片继续。优先级调度: 用 Lane 模型 (32 位 bitmask), 从 SyncLane (最高, 阻塞优先) 到 IdleLane (最低) 划分优先级。用户交互触发的更新 (click) 标记为 InputContinuousLane, setTimeout 回调标记为 DefaultLane。高优先级更新可以"打断"当前正在进行的低优先级渲染 (interrupt), 先完成高优先级任务, 之后恢复低优先级。Concurrent Mode 下, 多个不同优先级的更新可以 batch 和 reorder, 实现 transition 等延迟渲染能力。

### 37. Vue3 响应式原理和 Vue2 的区别是什么? Proxy 的优势是什么?

Vue2 响应式: 在 init 时递归遍历 data 对象, 对每个属性用 Object.defineProperty 定义 getter/setter。getter 中收集依赖 (Dep.target, 当前 Watcher), setter 中触发依赖通知更新。局限: (1) 无法检测属性新增和删除 (需 Vue.set/Vue.delete)。 (2) 数组需重写 push/pop 等 7 个变异方法。 (3) 嵌套对象要递归 defineProperty, 初始化时全量递归, 大数据量下性能差。Vue3 响应式: 用 ES6 Proxy 替代 defineProperty, reactive(obj) 返回 Proxy 包装后的对象。getter 中调用 track(obj, key) 收集 effect, setter 中调用 trigger(obj, key) 触发 effect。优势: (1) 可拦截任意操作 (get/set/has/deleteProperty/ownKeys), 新增和删除属性无需 API 介入。 (2) 懒代理 -- 只在 get 访问到嵌套对象时才对该对象 reactive, 不需要初始化时全量递归, 大对象场景性能好。 (3) 支持 Map/Set/WeakMap 等集合类型 (通过 collectionHandlers)。 (4) Proxy 可以拦截 has 操作, 支持 in 操作符的响应式。代价: Proxy 无法 polyfill, 不支持 IE11, 这是 Vue3 放弃 IE 的根本原因。

### 38. Zustand 和 Redux 相比优势是什么? useState 和 useReducer 的区别?

Zustand vs Redux: Zustand 是极简状态管理 (1KB), 核心理念是 store 就是 JS 对象 + set/get 函数, 没有 action/reducer/dispatch 的概念。优势: (1) 零 boilerplate -- 不需要写 action type、action creator、reducer switch、connect/useSelector。 (2) store 可在组件外使用 (直接 import store.getState()), Redux 必须在 Provider 包裹范围内。 (3) selector 内置, 用 useStore(state => state.count) 订阅局部状态, 不触发无关 re-render, Redux 需要 reselect/memo 优化。 (4) 中间件轻量 -- persist (localStorage 持久化)、devtools (接入 Redux DevTools) 都是一行代码。劣势: 没有 Redux Toolkit 的 createAsyncThunk 等异步方案、没有内置的 RTK Query 数据获取, 大型项目缺乏结构约束。useState vs useReducer: useState 适合独立、简单的状态 (boolean、string、number); useReducer 适合多个状态有关联的更新 (如表单有 10 个字段, dispatch({type: 'SET_FIELD', field, value}) 比 10 个 setState 更清晰)。useReducer 的 reducer 是纯函数, 方便测试; dispatch 的 identity 稳定, 作为 prop 传递不会触发子组件 re-render; 复杂状态逻辑集中在 reducer 中, 避免分散在组件各处。

### 39. Vite 相比 Webpack 快的根本原因是什么?

核心原因有两方面: 开发阶段和构建阶段策略不同。开发阶段: Webpack 在 dev-server 启动时对所有模块做全量打包、转译、依赖图构建, 项目越大启动越慢 (O(n) 模块数)。Vite 利用浏览器原生 ES Module 支持, 启动时不做任何打包, 只在浏览器请求某个模块时, 用 esbuild (Go 编写, 比 babel/swc 快 10-100x) 实时转译该模块返回。这样冷启动是 O(1) -- 只处理入口文件, 其他模块按需转译, 配合 HTTP 304 缓存, 二次启动几乎零等待。构建阶段: Vite 用 Rollup 做 production build (Tree-shaking 更彻底, 输出 ESM), 但 esbuild 也参与了 CSS/TS 转译 (比 Rollup 自带 plugin 快)。其他加速因素: (1) 依赖预构建 -- 用 esbuild 一次性将 node_modules 中的 CJS 依赖转为 ESM (缓存在 node_modules/.vite), 后续不再处理。 (2) HMR 基于 ESM -- 修改一个模块, 只需 re-fetch 该模块的 ESM 请求, 不需要重新计算依赖图 (Webpack HMR 需要遍历 affected modules)。 (3) esbuild 用 Go 编写, 利用多核并行转译, 而 babel 是单线程 JS。综合效果: 千模块项目 Vite cold start < 1s, Webpack 10-30s。

### 40. Go 的 goroutine 调度和 Node 的事件循环有何不同? 什么场景下用 Go?

Node 事件循环: 单线程, 基于 libuv 的事件队列驱动。所有 I/O 操作 (网络、文件、timer) 通过 callback/Promise 异步执行, 主线程只负责调度。CPU 密集型任务会阻塞事件循环 (如 JSON.parse 大文件), 必须用 worker_threads 或 child_process 卸载。优点是编程模型简单 (无锁、无竞态), 缺点是单核利用率有限, 水平扩展靠 cluster 多进程。Go 调度器 (GMP 模型): G = goroutine (用户态协程, 初始栈 2KB, 可动态伸缩), M = OS thread, P = logical processor (默认等于 CPU 核心数)。goroutine 遇到阻塞 (channel、syscall、sleep) 时, M 会解绑当前 G 并绑定新 G 继续执行, P 永远忙碌。goroutine 间通过 channel 通信, 避免共享内存加锁。多核并行 -- 多个 P 各自拥有 goroutine 队列, 可并行在不同 CPU 核心执行。优势: goroutine 启动成本极低 (2KB stack, 对比 OS thread 1MB), 单机可跑百万 goroutine, 天然利用多核。使用 Go 的场景: (1) 高并发网络服务 (RPC、网关), 每请求一 goroutine 模型简洁高效。 (2) CPU 密集型计算 (编解码、压缩), 多核并行。 (3) 需要强类型 + 高性能的 CLI 工具、基础设施组件。在 TikTok Performance 团队选 Go 是因为 Kafka consumer + Redis/ClickHouse 写入场景, goroutine 轻松管理数千并发连接, 比 Node cluster 方案少了很多 IPC 开销和进程管理复杂度。
