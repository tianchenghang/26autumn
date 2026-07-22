# 前端高级工程师面试全集：JavaScript / DOM / BOM / 浏览器与网络

> 本文档分两部分：
>
> - 第一部分：基于 `src/js` 目录下 33 个源码文件 逐文件编排的算法/手写题（每题含源码解读、考点深挖、进阶追问）。
> - 第二部分：前端高级工程师面试 Q/A，覆盖 JavaScript 核心、DOM、BOM、浏览器原理与网络，要求知识点深入。

---

## 总目录

### 第一部分：逐文件算法题（33 题）

| #   | 题目                                | 对应文件               | 核心考点                       |
| --- | ----------------------------------- | ---------------------- | ------------------------------ |
| 1   | 手写 call / apply / bind            | `apply-call-bind.js`   | this 绑定、Symbol、new.target  |
| 2   | 循环闭包输出与修复                  | `closure.js`           | 闭包、IIFE、let 块级作用域     |
| 3   | 累加式柯里化                        | `curry.js`             | 柯里化、参数聚合、空参触发     |
| 4   | 防抖与四种节流                      | `debounce-throttle.js` | 定时器、leading/trailing       |
| 5   | 装饰器求值顺序                      | `decorator.ts`         | TS 装饰器四类、求值时序        |
| 6   | 深拷贝（循环引用）                  | `deep-clone.js`        | WeakMap、类型分支              |
| 7   | 寄生组合式继承                      | `extends.js`           | 原型链、静态继承               |
| 8   | 手写 Array.prototype.flat           | `flat.js`              | 递归/DFS、稀疏数组             |
| 9   | 手写 instanceof                     | `instanceof.js`        | 原型链遍历、Symbol.hasInstance |
| 10  | 让普通对象可迭代                    | `iterator.js`          | Symbol.iterator、生成器        |
| 11  | 手写 map / reduce + 串行 Promise 链 | `map-reduce.js`        | 稀疏数组、reduce 链式 then     |
| 12  | 类字段初始化顺序（米哈游题）        | `miHoYo.js`            | 字段初始化时序、方法重写陷阱   |
| 13  | 手写 new 操作符                     | `new.js`               | 构造函数返回值规则             |
| 14  | 手写 Promise（A+ 规范）             | `promise.js`           | 状态机、回调队列、链式         |
| 15  | 用 rAF 实现 setTimeout/setInterval  | `timer.js`             | 渲染帧、时间戳比对             |
| 16  | 手写 requestAnimationFrame polyfill | `polyfill/index.js`    | 60fps 对齐、批量回调、取消     |
| 17  | JSON 深比较                         | `lc/lc2628.ts`         | 递归、键序无关比较             |
| 18  | 基于 fn.length 的柯里化             | `lc/lc2632.js`         | 函数 length 属性               |
| 19  | 手写 JSON.stringify                 | `lc/lc2633.js`         | 递归序列化                     |
| 20  | Promise 并发池（4 种实现）          | `lc/lc2636.js`         | 并发控制、迭代器共享           |
| 21  | 对齐语义的节流                      | `lc/lc2676.js`         | nextCallTime 调度              |
| 22  | Proxy 无限对象                      | `lc/lc2690.js`         | Proxy get 陷阱                 |
| 23  | 手写 Immer produce                  | `lc/lc2691.js`         | 写时复制、草稿代理             |
| 24  | 深度不可变对象                      | `lc/lc2692.js`         | Proxy set/apply 拦截           |
| 25  | 对象 Diff                           | `lc/lc2700.js`         | 递归差分                       |
| 26  | 深合并 deepMerge                    | `lc/lc2755.js`         | 键并集递归                     |
| 27  | 查询批处理器                        | `lc/lc2756.ts`         | 批量合并、节流窗口             |
| 28  | 循环生成器                          | `lc/lc2757.js`         | generator 双向通信、负数取模   |
| 29  | Date.prototype.nextDay              | `lc/lc2758.js`         | 日期进位、padStart             |
| 30  | promisify                           | `lc/lc2776.ts`         | 回调转 Promise                 |
| 31  | 手写 Promise.allSettled（找 Bug）   | `lc/lc2795.js`         | 计数器、缺陷分析               |
| 32  | delayAll                            | `lc/lc2821.js`         | 高阶函数包装                   |
| 33  | JSON 转矩阵                         | `lc/lc3675.js`         | 路径展开、列对齐               |

### 第二部分：面试 Q/A

一、JavaScript 核心（Q1–Q14）

1. 详细介绍 TypeScript 转为 JS 的每一个过程（必考）
2. 事件循环：宏任务、微任务与渲染帧的精确时序
3. 作用域、闭包与变量提升的底层机制
4. this 绑定四条规则与优先级
5. 原型链与继承的所有方式对比
6. 隐式类型转换与 `==` 的完整规则
7. Promise/A+ 规范细节与 async/await 的编译产物
8. Proxy 与 Reflect 的设计动机与全部陷阱（trap）
9. 迭代器、生成器与异步迭代协议
10. V8 内存管理与垃圾回收（分代、写屏障、WeakRef）
11. V8 性能优化：隐藏类、内联缓存、逃逸分析
12. ESM 与 CJS 的本质差异与循环引用行为
13. 尾调用优化、bigint、Record/Tuple 提案等新特性
14. 正则引擎与灾难性回溯

二、DOM（Q15–Q20）

15. DOM 事件流：捕获、冒泡、委托与 passive 监听器
16. 渲染流水线：重排、重绘与合成
17. MutationObserver / IntersectionObserver / ResizeObserver
18. 虚拟 DOM 与 Diff 算法的真实开销
19. Shadow DOM 与样式隔离
20. 大型列表渲染优化（虚拟滚动 / 时间切片）

三、BOM（Q21–Q25）

21. History API 与前端路由实现（hash vs history）
22. 浏览器存储全家族对比（Cookie / Storage / IndexedDB / Cache API）
23. 跨窗口与跨标签通信（postMessage / BroadcastChannel / SharedWorker）
24. requestAnimationFrame 与 requestIdleCallback
25. location / navigator / screen 的高频考点

四、浏览器原理（Q26–Q33）

26. 从输入 URL 到页面展示的完整过程（深度版）
27. Chrome 多进程架构与站点隔离
28. 关键渲染路径与合成层提升
29. 浏览器缓存体系：强缓存、协商缓存与启发式缓存
30. 跨域与 CORS 预检的完整细节（含 COEP/COOP/CORB）
31. 前端安全：XSS / CSRF / CSP / 点击劫持
32. Web Worker / Service Worker / PWA 离线方案
33. Web 性能指标（LCP / INP / CLS）与优化手段

五、网络（Q34–Q42）

34. TCP 三次握手与四次挥手的每一个"为什么"
35. TLS 握手全过程（1.2 vs 1.3）
36. HTTP/1.1 → HTTP/2 → HTTP/3(QUIC) 演进
37. HTTPS 证书链校验与中间人攻击
38. DNS 解析全过程与优化
39. WebSocket / SSE / WebTransport 选型
40. HTTP 状态码与方法语义深挖
41. 队头阻塞在每一层的表现与解法
42. fetch 与 XHR 的细节：超时、取消、进度、流式

---

# 第一部分：逐文件算法题

---

## 题目 1｜手写 call / apply / bind（对应 `apply-call-bind.js`）

源码解读：用 `Symbol()` 生成唯一键把函数挂到上下文对象上再调用，从而改变 `this`；`bind2` 返回的 Bound 函数通过 `new.target` 判断是否被 `new` 调用——若是则改为构造 `fn` 的实例（`new.target` 在普通调用中为 `undefined`，在 `new` 调用中指向构造函数本身）。

题目描述：在不使用原生 `call/apply/bind` 的前提下实现三者，要求：

1. `call2(ctx, ...args)` / `apply2(ctx, args)` 正确绑定 this 并返回结果；
2. `bind2(ctx, ...presetArgs)` 支持参数柯里化（预设参数 + 后传参数拼接）；
3. 绑定后的函数被 `new` 调用时，this 绑定必须失效并正确构造实例（原生行为）；
4. 不能污染传入的上下文对象（不可覆盖已有属性、用后清理）。

考点深挖：

- 为什么用 `Symbol()` 而不是固定字符串键？——避免与 ctx 已有属性冲突，且 `delete ctx[prop]` 后不留痕迹。
- `ctx` 为 `null/undefined` 时原生行为是绑定到全局对象（非严格模式）或保持 undefined（严格模式），如何兼容？传入原始值（如数字）时原生会装箱为包装对象。
- `new.target` 是 ES6 元属性（meta property），它让函数感知自己的调用方式；`bind2` 中利用它区分构造调用与普通调用，这是手写 bind 最容易丢分的一步。
- 原生 bind 产生的函数没有 `prototype`，且其 `length`/`name` 会被重写（`bound xxx`）。

参考实现：

```js
Function.prototype.bind2 = function (ctx, ...args) {
  const fn = this;
  return function Bound(...rest) {
    if (new.target) return new fn(...args, ...rest); // new 绑定优先
    const prop = Symbol();
    ctx[prop] = fn;
    const ret = ctx[prop](...args, ...rest);
    delete ctx[prop];
    return ret;
  };
};
```

进阶追问：① `bind` 链式调用 `fn.bind(a).bind(b)` 的 this 是什么？（永远是最先绑定的 a）② 如何让 Bound 函数继承原函数的 `prototype`（`Bound.prototype = Object.create(fn.prototype)`），与 `new.target` 方案有何差异？③ 软绑定（softBind）是什么场景？

---

## 题目 2｜循环闭包输出与修复（对应 `closure.js`）

源码解读：第一个循环中 5 个 `setTimeout` 回调共享同一个 `var i`，宏任务执行时循环已结束，输出 `6 6 6 6 6`；第二个循环用 IIFE 把每轮的 `j` 捕获进独立函数作用域，输出 `1 2 3 4 5`。

题目描述：写出两段代码的输出与执行时间线，并给出 至少四种 让第一段代码输出 `1 2 3 4 5` 的方案。

考点深挖：

- `var` 声明提升 + 函数作用域 → 所有回调闭包引用同一词法环境记录（Environment Record）。
- 四种修复的本质差异：
  1. IIFE：每轮创建新函数作用域；
  2. `let`：ES6 为 `for` 循环体每次迭代创建新的词法环境（per-iteration binding），这是规范 13.7.4.8 节的特殊处理；
  3. `setTimeout` 第三参：`setTimeout(cb, t, arg)` 会把 `arg` 作为回调入参传入；
  4. `bind` 预设参数：`setTimeout(console.log.bind(null, i), ...)`。
- 计时并不精确：宏任务排队 + 最小延迟（浏览器对嵌套 ≥5 层的定时器强制 ≥4ms）。

进阶追问：① 为什么 `for (let i...)` 中 `i++` 修改的是哪一份绑定？（每次迭代末尾把上一迭代的绑定值复制到新环境再执行迭代表达式）② 换成 `Promise.resolve().then` 输出顺序如何变化？（微任务先于宏任务）③ 如果要求回调里还能拿到循环结束后的最终值，怎么设计？

---

## 题目 3｜累加式柯里化（对应 `curry.js`）

源码解读：`curry` 内部维护 `aggregatedArgs` 数组，每次调用把参数推入并返回自身；以空参调用作为求值信号，触发 `fn.apply(this, aggregatedArgs)`。`curriedSum(1)(2)(3, 4)` 后 `curriedSum()` 得 `10`。

题目描述：实现 `curry(fn)` 使得 `curriedSum(1)(2)(3,4)()` === 10；再改造为不需要空参触发、而是通过 `valueOf/toString` 隐式转换求值的版本：`curriedSum(1)(2)(3) == 6` 为 true。

考点深挖：

- 两种柯里化范式：固定元数（依赖 `fn.length`，见题目 18）与可变参数（依赖终止信号或隐式转换）。
- 隐式转换版本的关键：给返回函数挂载 `valueOf`，返回聚合结果；注意 `===` 不会触发转换，只有 `==` 或数学运算/`String()` 才会。
- 共享 `aggregatedArgs` 的副作用：求值后数组未清空，再次调用会累计旧值——生产实现需考虑是否可复用。
- `fn.apply(this, ...)` 保留 this，柯里化函数作为方法调用时不丢上下文。

参考实现（隐式转换版）：

```js
function curry(fn) {
  const all = [];
  const curried = (...args) => {
    all.push(...args);
    return curried;
  };
  curried.valueOf = () => fn(...all);
  curried.toString = () => String(fn(...all));
  return curried;
}
```

进阶追问：① 如何支持占位符（如 `curry(fn)(1, _, 3)(2)`）？② 柯里化与偏函数（partial）的区别？③ 柯里化对 `fn.length` 的依赖在默认参数/剩余参数下为什么会失效？（length 只统计第一个默认值/剩余参数之前的形参个数）

---

## 题目 4｜防抖与四种节流（对应 `debounce-throttle.js`）

源码解读：

- `debounce`：每次调用清掉旧定时器重排，只有停止触发 delay 后才执行（trailing）。
- `throttle`（时间戳版）：比较 `Date.now()` 与上次执行时间，立即执行（leading），但停止触发后不会补最后一次（无 trailing）。
- `throttle2`（定时器版）：timer 存在期间直接丢弃调用（leading，无 trailing 补偿）。
- `throttle3`：维护 `nextCallTime`，用 `Math.max(0, nextCallTime - now)` 计算延迟，每次调用都会重排定时器（`clearTimeout` + 新 `setTimeout`），保证最后一次调用一定在节流窗口结束时执行（trailing 语义，对齐 LC 2676 标准答案）。

题目描述：实现 `debounce` 与 `throttle`，要求：① 支持 leading / trailing 两个独立开关；② 支持 `cancel()` 与 `flush()`（立即执行挂起的调用）；③ 保留 this 与参数。

考点深挖：

- 时间戳版 vs 定时器版的经典缺陷对比：前者边界时刻停止触发会丢尾，后者首次触发有延迟。
- `throttle3` 的 `nextCallTime = Date.now() + t` 在回调执行时更新，形成"下一个允许执行时刻"的单调时间轴。
- 高阶 API：`cancel`（清 timer + 重置状态）、`flush`（有挂起调用则立即执行并返回结果）。
- 防抖在输入联想、resize 的场景；节流在 scroll、鼠标轨迹上报的场景。

进阶追问：① React 18 并发渲染下事件回调里的 `event` 还能异步读取吗（合成事件池已移除，但可以读，为什么）？② 如何用 `requestAnimationFrame` 实现"帧节流"？③ 防抖函数如果返回值（如联想结果）该怎么设计（返回 Promise）？

---

## 题目 5｜装饰器求值顺序（对应 `decorator.ts`）

源码解读：文件演示了 TS 实验性装饰器的四种形态——类装饰器（target 是构造函数）、属性装饰器（target 是原型，无 descriptor）、方法装饰器（多一个 `PropertyDescriptor`）、参数装饰器（多一个 `paramIndex`）；末尾用方法装饰器工厂 `Get({url})` 在声明时劫持方法、发起 fetch 并把响应回填为方法入参，模拟 NestJS 风格的控制器。

题目描述：

1. 一个类中同时存在实例属性装饰器、静态属性装饰器、方法装饰器、访问器装饰器、参数装饰器、类装饰器，写出它们的求值（decorator 调用）顺序；
2. 手写 `Get({url})` 方法装饰器：声明时不执行原方法，而是发起请求并把 `{data, code, msg}` 作为参数调用原方法；
3. 用 TS 5.0 标准装饰器（TC39 Stage 3）重写一个 `@logged` 方法装饰器。

考点深挖：

- 旧版（experimentalDecorators）求值顺序：参数装饰器 → 方法/访问器/属性装饰器（按声明顺序）→ 静态成员先于实例成员 → 类装饰器最后。装饰器表达式自上而下求值，调用自下而上（洋葱模型，与 compose 一致）。
- 属性装饰器拿不到 `PropertyDescriptor`（因为实例属性不在原型上），所以无法拦截赋值——这是为什么属性装饰器常配合 `Object.defineProperty` 返回值使用。
- TS 5.0 标准装饰器签名完全不同：`(value, context)`，context 含 `kind/name/access/addInitializer`，不再有 target/descriptor 三元组；字段装饰器返回初始化函数而非描述符。
- 装饰器叠加 `emitDecoratorMetadata` 会生成 `design:type / design:paramtypes / design:returntype` 元数据（reflect-metadata），这是 Angular/NestJS 依赖注入的根基。

进阶追问：① 为什么参数装饰器不能改变参数值？（它的返回值被忽略，只能登记元数据）② 用装饰器实现 `@memoize`、`@readonly`、`@deprecate`；③ 标准装饰器如何实现依赖注入（`addInitializer` + 元数据）？

---

## 题目 6｜深拷贝（对应 `deep-clone.js`）

源码解读：`deepClone` 用 `WeakMap` 记录"原对象 → 克隆对象"映射解决循环引用；特判 `Date`（`new Date(obj)`）与 `RegExp`（拷贝 source/flags/lastIndex）；用 `for...in + hasOwnProperty` 只拷贝自身可枚举属性。

题目描述：实现生产级 `deepClone`，在源码基础上补全：① `Map/Set`；② `ArrayBuffer` 与 TypedArray；③ `Symbol` 作为键；④ 保持原型链；⑤ 函数、DOM 节点的处理策略说明。

考点深挖：

- 用 `WeakMap` 而非 `Map`：键弱引用，拷贝结束后原对象可被 GC，且天然支持对象键。
- 必须在递归之前 `seen.set(obj, clone)`，否则循环引用死循环。
- 源码的盲区：`for...in` 会遍历原型链（靠 hasOwnProperty 过滤）但漏掉 Symbol 键与不可枚举属性；不处理 `Map/Set/Promise/Function/BigInt 包装对象`；数组用 `{}` 初始化会丢 `length`（源码中 `Array.isArray ? [] : {}` 已处理）。
- 对比方案：`structuredClone`（原生，支持 Map/Set/ArrayBuffer/循环引用，但不支持函数、DOM、原型上的 getter/setter）；`JSON.parse(JSON.stringify())`（丢 undefined/函数/Symbol/循环引用直接抛错、Date 变字符串）。
- 拷贝 getter/setter 会触发求值变成数据属性——`Object.getOwnPropertyDescriptors` + `Object.defineProperties` 可保留。

进阶追问：① 克隆对象很大时如何避免爆栈（改迭代 + 显式栈）？② 如何克隆到指定深度？③ `structuredClone` 的 Transferable 是什么场景（Worker 间零拷贝转移 ArrayBuffer）？

---

## 题目 7｜寄生组合式继承（对应 `extends.js`）

源码解读：`extendsImpl` 用 `Object.create(Parent.prototype)` 创造干净的中间对象作为 `Child.prototype`（避免 `new Parent()` 带来的多余实例属性），修正 `constructor` 指针，并用 `Object.setPrototypeOf(Child, Parent)` 继承静态成员；配合构造函数内 `Parent.call(this, name)` 继承实例属性——这就是 ES5 时代最优的寄生组合式继承。

题目描述：手写 ES5 寄生组合式继承，验证：① 两个子实例的引用类型属性（hobbies）互不干扰；② 子类能调用父类原型方法；③ 子类能访问父类静态属性；④ `child instanceof Parent` 为 true。

考点深挖：

- 六种继承演进：原型链继承（共享引用属性）→ 构造函数继承（方法不入原型、无法复用）→ 组合继承（父构造函数调两次）→ 原型式（`Object.create`）→ 寄生式 → 寄生组合式（只调一次父构造函数、原型链干净）。
- `Object.setPrototypeOf(Child, Parent)` 对应 ES6 `class extends` 中 `Child.__proto__ === Parent` 这一双重原型链：实例链走 `Child.prototype.__proto__ === Parent.prototype`，构造器链走 `Child.__proto__ === Parent`。
- ES6 class 转译后大致就是寄生组合式 + 静态继承 + `super` 的 `[[HomeObject]]` 语义。
- 直接改 `__proto__`/`setPrototypeOf` 会让 V8 隐藏类失效，性能劣化——只在定义时用，运行期别改。

进阶追问：① 为什么不直接 `Child.prototype = Parent.prototype`？（改子类原型会污染父类）② `super` 在对象字面量方法里也能用吗（可以，`[[HomeObject]]` 在方法定义时绑定）？③ 多继承如何用 Mixin 模式模拟？

---

## 题目 8｜手写 Array.prototype.flat（对应 `flat.js`）

源码解读：`flat2` 基于 `reduce + concat + 原生 flat(depth-1)` 递归降维；`flat3` 用显式 DFS 收集到结果数组。两者都没有处理稀疏数组空位（holes）。

题目描述：实现 `flat2(depth)`，要求：① 不调用原生 `flat`；② 支持 `depth = Infinity`；③ 与原生一致地跳过空位；④ 再给一个迭代版（显式栈）避免深层数组爆栈。

考点深挖：

- 原生 `flat` 对空位的处理：`[1, , 2].flat()` → `[1, 2]`，空位被丢弃；`concat` 同样跳过空位。
- `for...of`/`for` 循环会把 hole 读成 `undefined`，必须用 `i in arr` 或 `hasOwnProperty` 判空位。
- 递归版爆栈深度约 1 万层（V8 默认栈约 1MB）；迭代版用栈 `[{arr, depth}]` 展开。
- 复杂度：O(n)，n 为展开后元素总数。

参考实现（迭代版）：

```js
function flat(arr, depth = 1) {
  const stack = arr.map((item) => [item, depth]);
  const res = [];
  while (stack.length) {
    const [item, d] = stack.pop();
    if (Array.isArray(item) && d > 0) {
      stack.push(...item.map((sub) => [sub, d - 1]));
    } else if (item !== undefined || /* hole 检查省略 */ true) {
      res.push(item);
    }
  }
  return res.reverse();
}
```

进阶追问：① `flatMap` 为什么是"先 map 再 flat(1)"且不等价于链式调用（中间数组语义）？② 源码 `flat2` 内部混用原生 `val.flat(depth-1)` 有什么隐患（若原生被改写/环境不存在则退化）？③ `depth` 传负数/小数的原生行为？（ToInteger，负数按 0 处理返回浅拷贝）

---

## 题目 9｜手写 instanceof（对应 `instanceof.js`）

源码解读：`instanceofV2` 沿 `Object.getPrototypeOf` 一路向上找 `right.prototype`；找到返回 true，到达 `null` 返回 false。源码还打印了 `Cat[Symbol.hasInstance]`——原生 `instanceof` 实际先查 `right[Symbol.hasInstance]`。

题目描述：实现 `instanceofV2(left, right)`，要求：① 完整模拟原型链查找；② 支持 `Symbol.hasInstance` 自定义钩子；③ 处理 right 是 bound 函数（无 prototype）的情况；④ 说明 `left` 为原始值时的行为。

考点深挖：

- 规范算法（`OrdinaryHasInstance`）：若 `right` 有 `[Symbol.hasInstance]` 方法，调用它；若 `right` 不可调用抛 TypeError；bound 函数则对目标函数递归 `instanceof`。
- `typeof left !== "object"` 的判空在源码里把函数也排除了——但 `fn instanceof Function` 应为 true，严谨实现要允许函数。
- 跨 realm（iframe）问题：不同全局环境的 `Array` 不相等，`[] instanceof Array` 跨窗口为 false——所以大型库用 `Array.isArray`（基于内部槽）。
- `Object.create(null)` 的对象 `instanceof Object` 为 false（原型链无 `Object.prototype`）。

进阶追问：① `Symbol.hasInstance` 实现"鸭子类型 instanceof"（如 `x instanceof Iterable`）；② `instanceof` 与 `constructor` 判断的可靠性对比（constructor 可被改写）；③ `isPrototypeOf` 与 `instanceof` 的关系。

---

## 题目 10｜让普通对象可迭代（对应 `iterator.js`）

源码解读：方式一给 `obj` 挂生成器方法 `[Symbol.iterator]`，`for...of` 自动消费 `yield` 的值；方式二用 `Object.defineProperty` 定义不可枚举、不可写、不可配置的迭代器属性，手写返回 `{ next() }` 的迭代器对象。

题目描述：让一个普通对象 `{name, age, job}` 支持 `for...of`（输出值序列）、展开运算符与 `Array.from`，要求：① 迭代器属性不可被 `for...in` 枚举到；② 手写迭代器协议（不用生成器）与生成器两种实现；③ 实现"键值对迭代"版本，使 `[...obj]` 得到 `[['name','swifty'],...]`。

考点深挖：

- 迭代协议三件套：可迭代协议（`[Symbol.iterator]()` 返回迭代器）、迭代器协议（`next()` 返回 `{value, done}`）、生成器是两者的语法糖。
- `for...of` 只找 `Symbol.iterator`，与 `for...in`（枚举字符串键、含原型链）完全正交。
- 生成器方法 `* [Symbol.iterator]() {}` 的 this 指向调用时的接收者；用 `for...in` 内部 yield 时注意闭包捕获。
- 源码中 `done` 与 `value` 的计算顺序：先算 `done: index >= keys.length`，再 `value: ctx[keys[index++]]`——done 为 true 时 value 是 undefined，符合协议但 index 会越界自增（无实际危害，因为 for...of 已停止）。
- 消费方式盘点：`for...of`、扩展运算符、解构、`Array.from`、`Promise.all`、`yield*`、`Map/Set` 构造器。

进阶追问：① 实现 `Range` 类使 `for (const x of new Range(1, 5, 2))` 输出 1,3,5；② 生成器的 `return()/throw()` 如何触发 `finally`（for...of 提前 break 会调 `iterator.return()`）；③ 异步迭代器 `Symbol.asyncIterator` 与 `for await...of` 的应用（分页拉取、流读取）。

---

## 题目 11｜手写 map / reduce 与 Promise 串行链（对应 `map-reduce.js`）

源码解读：`map2` 用 `new Array(len)` 预分配 + `i in this` 跳过空位；`map3` 基于 reduce 实现但初始值 `[]` 是稠密数组，空位会被写成真实元素——与原生行为产生差异；`reduce2` 处理 initialValue 缺省（首元素当累加器）；末尾 `bootstrap` 用 `reduce((p, t) => p.then(t), Promise.resolve(val))` 把异步任务数组串成顺序链，输出 `((1+1)*2)*3 = 12`。

题目描述：

1. 手写符合规范的 `map` / `reduce`（处理空位、无 initialValue 时数组为空抛 TypeError、callback 的 thisArg）；
2. 用 `reduce` 实现异步任务顺序执行器 `bootstrap(tasks, initVal)`；
3. 改造为收集每步结果的版本：`[1, 2, 6, 18]`。

考点深挖：

- 原生 `map` 保留稀疏性：`[1, , 2].map(x => x*2)` 结果仍有空位（`1, empty, 4`）；`map3` 的 reduce 版本把空位写成 `undefined` 实值，`in` 运算结果不同——这是面试官最爱的坑。
- `reduce` 无初始值时，首个存在的元素为累加器，从第二个元素开始迭代；空数组无初始值抛 `TypeError: Reduce of empty array with no initial value`。
- `p.then(curTask)` 串行原理：每个 then 返回新 Promise，注册时机保证任务按序排队；与 `for...of + await` 等价但性能略差（每步多一层微任务）。
- 注意 `callback.call(this, ...)` 中 this 的传递（map 第二参 thisArg 在源码中用了 `callback.call(this)`，严格说应是 `callback.call(thisArg)`）。

进阶追问：① 用 reduce 实现 `compose` 与 `pipe`；② 串行链中某个任务 reject 如何跳过/重试/降级；③ 改成并发限制执行器（衔接题目 20）。

---

## 题目 12｜类字段初始化顺序（米哈游面试题，对应 `miHoYo.js`）

源码解读：这是著名的输出顺序陷阱题。`new Child()` 的执行序列：

1. `super()` 进入 Parent：先初始化 Parent 的实例字段 → 打印 `Parent init`；
2. 执行 Parent 构造体：打印 `Parent constructor`；
3. `this.run()` 调用的是子类原型上的重写方法 → 打印 `Child run`，并给 `this.initialValue` 赋 3；
4. `this.runA()` → 打印 `Child runA`；
5. `super()` 返回后，初始化 Child 自己的实例字段：打印 `Child init`，且 `initialValue = undefined` 覆盖了第 3 步赋的 3；
6. 打印 `Child constructor`。

最终输出：`Parent init → Parent constructor → Child run → Child runA → Child init → Child constructor → undefined`。

题目描述：预测上述代码的完整输出并解释；再回答：把 `run()` 中对 `initialValue` 的赋值挪到 Child 构造函数里 `super()` 之后，输出变不变？为什么？

考点深挖：

- 字段初始化时机（`[[Define]]` 语义）：基类在构造体开头初始化；派生类在 `super()` 返回后立即初始化——所以派生类字段必然覆盖父类构造期间对同名属性的写入。
- 父类构造函数中调用 `this.run()` 触发动态派发到子类方法，此时子类字段尚未初始化——在子类方法里读子类字段会得到 `undefined`（字段已定义但值未初始化？不——字段根本还没 Define 上），这是 Java/C# 中都存在的"构造器调用虚方法"反模式。
- class fields 使用 `[[Define]]`（定义在实例自身），而构造体内 `this.x = ...` 是 `[[Set]]`——同名场景下行为差异（如原型上有 setter 时，field 不触发 setter，赋值会触发）。
- `super()` 之前不能访问 `this`（TDZ for this），因为派生类的 `this` 由基类构造"发放"。

进阶追问：① 把字段 `a` 改成 `static a`，初始化时机如何变化（类定义求值时）？② `super.run()` 与 `this.run()` 区别（`[[HomeObject]]`）；③ 为什么规范选择字段先初始化再执行构造体（与 TS 旧版 `useDefineForClassFields: false` 的赋值语义冲突史）？

---

## 题目 13｜手写 new 操作符（对应 `new.js`）

源码解读：`newV2` 三步：`Object.create(Constructor.prototype)` 建实例 → `Constructor.apply(obj, args)` 执行构造体 → 若返回对象则用返回值否则用新建对象。

题目描述：实现 `newV2(Constructor, ...args)`，要求覆盖规范全部细节：① 构造函数显式返回函数也要作为返回值（源码的 `isObject` 漏了 `typeof === 'function'`）；② 支持 `new.target` 正确传递；③ 说明箭头函数/生成器函数为何不能 new；④ 实现 `Object.create` 的 polyfill。

考点深挖：

- `new` 的完整语义（`Construct` 内部方法）：创建 `[[Prototype]]` 为 `F.prototype` 的对象 → 以 `new.target = F` 调用 → 返回值若是 Object（含函数）则取之，否则取新建对象。
- `new.target` 依赖 `new` 调用的上下文建立，手写版无法真正转发——这是手写 new 的理论上限（可用 `Reflect.construct(Constructor, args, newTarget)` 解决）。
- `F.prototype` 为 null 时，实例原型回退到 `Object.prototype`；箭头函数没有 `prototype` 也没有 `[[Construct]]`，new 抛 TypeError。
- `Object.create(null)` 与 `{}` 的差异：无原型，无 `hasOwnProperty` 等方法——适合做纯净字典。

参考实现：

```js
function newV2(Ctor, ...args) {
  const obj = Object.create(Ctor.prototype ?? Object.prototype);
  const res = Reflect.apply(Ctor, obj, args);
  return (typeof res === "object" && res !== null) || typeof res === "function"
    ? res
    : obj;
}
```

进阶追问：① `new Proxy(fn, { construct })` 拦截构造调用；② ES6 class 与 function 构造的 `[[Construct]]` 差异（class 必须 new，普通函数可省略）；③ `Symbol.species` 在内建类型派生（如 `Array#map` 创建新数组）中的作用。

---

## 题目 14｜手写 Promise（对应 `promise.js`）

源码解读：`PromiseV2` 实现状态机（pending/resolved/rejected）+ 双回调队列 + `then` 返回新 Promise 的链式；处理回调返回值是 Promise 时的"解包"（`value.then(resolve, reject)`）；提供 `catch/finally/resolve/reject`。但它与规范有若干偏差（见考点）。

题目描述：实现一个能通过 `promises-aplus-tests` 872 个用例的 Promise，要求：① 回调必须异步执行（微任务）；② 完整的 thenable 解包（`[[Resolve]](thenable)` 递归）；③ 解决"循环 thenable"检测；④ 值穿透（`then()` 不传回调时透传值/异常）。

考点深挖（对照源码找偏差）：

- 异步执行缺失：规范 2.2.4 要求 `onFulfilled/onRejected` 必须在执行栈仅含平台代码时调用；源码在 RESOLVED 状态下同步执行回调，已 resolve 的 Promise 行为与原生不一致。
- executor 抛错分支的 bug：`catch (e) { this.reject(e) }`——实例上根本没有 `reject` 方法，应调用闭包内的 `reject(e)`。这是典型的"测试驱动审查"考点。
- thenable 解包不完整：只判断 `instanceof PromiseV2`，而规范要求对任何含 `then` 方法的对象递归解包，且 `then` 的 getter 抛错要 reject、多次调用要忽略（`called` 标志）。
- resolve 一个自身（`const p = new Promise(r => r(p))`）必须抛 `TypeError: Chaining cycle detected`。
- `finally` 的语义细节：回调返回 Promise 时会等待它；回调内抛错/返回 rejected Promise 会覆盖原结果。
- 微任务调度：浏览器用 `queueMicrotask`/`MutationObserver`，Node 用 `process.nextTick`（比 Promise 微任务更早）——setTimeout 降级是宏任务，语义不等价。

参考骨架（关键片段）：

```js
const resolvePromise = (p2, x, resolve, reject) => {
  if (p2 === x) return reject(new TypeError("Chaining cycle"));
  if (x instanceof MyPromise)
    return x.then((y) => resolvePromise(p2, y, resolve, reject), reject);
  if (x !== null && (typeof x === "object" || typeof x === "function")) {
    let called = false;
    try {
      const then = x.then;
      if (typeof then === "function") {
        then.call(
          x,
          (y) => {
            if (called) return;
            called = true;
            resolvePromise(p2, y, resolve, reject);
          },
          (r) => {
            if (called) return;
            called = true;
            reject(r);
          },
        );
      } else resolve(x);
    } catch (e) {
      if (!called) reject(e);
    }
  } else resolve(x);
};
```

进阶追问：① 为什么 then 回调要异步（保证回调注册顺序与执行顺序解耦、避免 Zalgo）？② 实现 `Promise.all/race/any/allSettled`（注意 all 的"快速失败"与 any 的 `AggregateError`）；③ async 函数返回的 Promise 与内部 return 的 Promise 之间多几层 tick（ES2019 优化后从 3 层降到 1 层）？

---

## 题目 15｜用 requestAnimationFrame 实现 setTimeout/setInterval（对应 `timer.js`）

源码解读：`useSetTimeout` 在 rAF 回调里比对 `Date.now() - startTime >= timeout`，到点执行并 `cancelAnimationFrame` 自清理；`useSetInterval` 到点后重置 `startTime = currentTime`（对齐到触发时刻而非计划时刻）并循环，返回的清理函数置 `requestId = null`。

题目描述：基于 rAF 实现 `setTimeout2 / setInterval2 / clearInterval2`，要求：① 误差分析——rAF 与原生定时器谁更准、为什么；② 页面隐藏时两者行为差异；③ 把漂移修正做出来（按计划时刻 `startTime + k*interval` 而非触发时刻对齐）。

考点深挖：

- rAF 与垂直同步（VSYNC）对齐（通常 60Hz ≈ 16.7ms，高刷屏 120Hz），回调在渲染帧的开始执行，适合做视觉相关节流；后台标签页 rAF 完全暂停（省电），而 setTimeout 被节流到 ≥1s（Chrome 对后台页 intensive throttling 可到 1 分钟）。
- 源码 `setInterval2` 的漂移：`startTime = currentTime` 把回调执行耗时计入下一周期，长期运行会累积漂移；修正方案是 `startTime += interval`（按计划网格对齐），偏差过大时再补偿。
- rAF 回调里再注册 rAF 形成自递归循环，是"帧驱动定时器"的标准写法。
- `cancelAnimationFrame` 只能取消未执行的回调；源码用闭包 `requestId` 覆盖保存最新 id，注意多实例并存时需要按 id 管理。

进阶追问：① 用 `setTimeout` 反向 polyfill rAF（衔接题目 16）；② `requestIdleCallback` 的 deadline 参数与超时兜底；③ 高精度计时为什么用 `performance.now()` 而非 `Date.now()`（单调时钟 vs 系统时钟可被校时改动）。

---

## 题目 16｜手写 requestAnimationFrame polyfill（对应 `polyfill/index.js`）

源码解读：以 `frameDuration = 1000/60` 为帧长，用"上一次帧回调计划时刻"算 `nextCallDelay = max(0, 16.7 - elapsed)` 对齐帧边界；所有本帧注册的回调先入队 `taskQueues`，到点后克隆队列统一执行（本帧内新注册的回调进入下一帧）；`cancelAnimationFrame` 打 `cancelled` 标记惰性删除；回调抛错用 `setTimeout(() => { throw e })` 异步上抛，不中断同帧其他回调。

题目描述：在不支持 rAF 的环境用 `setTimeout` polyfill 出 `requestAnimationFrame/cancelAnimationFrame`，要求：① 同一事件循环内注册的多个回调同一帧执行；② 回调执行期间注册的新回调必须排到下一帧（规范要求）；③ 支持取消；④ 回调能收到高精度时间戳参数。

考点深挖：

- "克隆队列 + 清空原队列"是规范行为：防止回调里递归注册导致同帧无限循环。
- 首帧延迟计算：`latestCallTimestamp` 记录的是计划触发时刻而非真实触发时刻，保证连续调用的帧间隔均匀（与题目 15 的漂移问题呼应）。
- 源码 bug 彩蛋：`setTimeout(function () { throw e; }, e)` 把错误对象当成了 delay 参数——应改为 `setTimeout(() => { throw e; })`，面试中可作为 code review 素材。
- 真实浏览器 rAF 回调参数是 `DOMHighResTimeStamp`（该帧的 VSYNC 时刻），polyfill 传 `performance.now()`。
- 取消用标记位而非从数组 splice：O(1) 且避免遍历中修改数组。

进阶追问：① 为什么 polyfill 用 `Math.round(nextCallDelay)` 而真实实现按 VSYNC 硬件信号？② rAF 与 `setTimeout(16)` 在动画上的视觉差异（丢帧、抖动 jank）；③ `document.visibilityState` 与 rAF 暂停对动画状态机的影响（恢复后时间戳跳变怎么处理）。

---

## 题目 17｜JSON 深比较（对应 `lc/lc2628.ts`）

源码解读：`areDeeplyEqual` 分三种情况：非对象用 `===`；双数组按索引递归；双对象比较键集合（排序后逐键递归）；一数组一对象直接 false。键排序使得比较与键的插入顺序无关。

题目描述：实现 `areDeeplyEqual(o1, o2)`（LeetCode 2628），输入限定为合法 JSON；再扩展到支持 `Date / RegExp / Map / Set / NaN / +0 vs -0` 的通用 `deepEqual`。

考点深挖：

- 源码只对"键排序后按下标对齐"比较——这是 JSON 对象键无序语义的正确处理；换成"用 Set 判键集合相等再逐键递归"可避免排序的 O(k log k)。
- JSON 类型闭包（null/boolean/number/string/array/object）使得 `===` 足以处理叶子值；通用版需特判 `NaN`（`Number.isNaN`）与 `Object.is` 差异。
- 通用版循环引用防护：用 `WeakMap<o1, o2>` 记忆已比对的对象对。
- 复杂度：O(n) 节点数；键排序引入 O(k log k)。

进阶追问：① 与 `React` 的 `shallowEqual` 对比（只比一层 + `Object.is`）；② 大对象比较如何短路优化（先比长度/键数）；③ 如何输出"第一处不等的路径"用于调试（衔接题目 25 diff）。

---

## 题目 18｜基于 fn.length 的柯里化（对应 `lc/lc2632.js`）

源码解读：与题目 3 的"空参触发"不同，这里用 `fn.length`（形参个数）作为聚合目标：累计参数达到 `argsCnt` 即执行。`curry(sum)(1)(2)` → 3。

题目描述：实现 `curry(fn)`（LeetCode 2632），使 `curriedSum(1)(2)(3) === 6`、`curriedSum(1,2)(3) === 6`、`curriedSum()(1)(2,3)` 也能工作（或说明为何不能）。

考点深挖：

- `fn.length` 统计第一个默认值参数或剩余参数之前的形参数：`function f(a, b=1, ...rest){}` 的 length 是 1——默认参数/剩余参数下柯里化会提前或永不触发。
- 源码用 `aggregatedArgs.length === argsCnt`：严格相等意味着一次传超量参数（`curriedSum(1,2,3)` 当 length 为 2 时）永不触发——应改为 `>=` 更健壮，这是 code review 高频点。
- 空参调用 `curriedSum()`：`push()` 后长度不变，直接返回自身——可以"续传"，符合预期。
- `fn.apply(this, ...)` 保留方法调用场景的 this。

进阶追问：① 支持占位符 `_` 的柯里化（ramda 风格）；② 柯里化与箭头函数 length 的表现；③ 实现反柯里化 `uncurry`，把 `a => b => c` 变回 `(a, b) => c`。

---

## 题目 19｜手写 JSON.stringify（对应 `lc/lc2633.js`）

源码解读：字符串加双引号；非对象原始值 `String(obj)`；数组递归 map+join；对象用 `Object.entries` 拼 `"key": value`。注意源码对象分支的 `"${k}": ${...}` 在冒号后多了空格，与原生输出有细微差异。

题目描述：实现 `jsonStringify`（LeetCode 2633），再逐步对齐原生 `JSON.stringify` 的完整语义：① `undefined / function / Symbol` 值在对象中跳过、在数组中变 `null`；② `toJSON()` 优先调用；③ 循环引用抛 TypeError；④ `NaN / Infinity` 序列化为 `null`；⑤ 字符串转义（引号、控制字符）。

考点深挖：

- 原生序列化规则清单是高频口述题：顶层 `undefined/function/Symbol` → 返回 `undefined`（不是字符串）；`Date` 走 `toJSON`（toISOString）；`BigInt` 抛 TypeError。
- 循环引用检测：递归栈上维护 `Set`，进入对象 add、离开 delete（注意不能全局缓存，否则重复引用误判）。
- 第二参 replacer（函数/数组白名单）与第三参 space（缩进）的实现方式。
- 安全性：`JSON.stringify` 大对象阻塞主线程；超大对象可流式序列化。

进阶追问：① 实现 `JSON.parse` 的 reviver 参数；② 手写一个支持 `undefined/Date/Map` 的 "superjson" 序列化协议；③ 为什么 `JSON.stringify({a: undefined})` 是 `"{}"` 而 `[undefined]` 是 `"[null]"`（规范对对象属性与数组元素的不同分支）。

---

## 题目 20｜Promise 并发池（对应 `lc/lc2636.js`）

源码解读：四种实现四种思路——

1. `promisePool`：先启动前 n 个，每个完成后从 `pendingQueue` 取下一个（链式接力），但不收集结果；
2. `promisePool2`：共享同一个数组迭代器，n 个 worker 各自 `for (const [i, task] of iter)` 争抢任务——迭代器状态天然互斥（JS 单线程同步段内 `next()` 原子），结果按下标回填；
3. `promisePool3`：共享游标 `idx++`，worker 循环取任务；
4. `promisePool4`：维护 `workQueue: Set`，任务完成即 `delete`，集合满 n 时 `await Promise.race` 腾出位置，最后 `allSettled` 收尾。

题目描述：实现 `promisePool(functions, n)`（LeetCode 2636）：并发执行返回 Promise 的函数数组，任意时刻最多 n 个在执行，全部完成后按原始下标返回结果数组。要求给出至少两种实现并分析优劣。

考点深挖：

- 方案 2/3 的精髓：利用单线程同步段的不可分割性——`iter.next()`/`idx++` 在 await 之间不会被其他 worker 抢占，无需锁。
- 方案 1 的缺陷：结果未收集；`pendingQueue` 用 `let` 声明在 `mapFn` 之后，靠"函数先定义、调用时变量已初始化"避开 TDZ——可读性差。
- 方案 4 的 `Promise.race(workQueue)` 等待"任一完成"，race 注册在每个 Promise 上的回调随 GC 清理，语义正确但每轮新建 race 有额外开销。
- 错误处理是分水岭：题目假设全部成功；生产版需定义"单个失败是否中断整体"（参考 `Promise.all` 快速失败 vs `allSettled` 全部跑完）。
- 这就是 p-limit / 前端图片批量上传 / 接口并发限制的标准模型。

参考实现（游标法）：

```js
async function promisePool(funcs, n) {
  const res = new Array(funcs.length);
  let idx = 0;
  const worker = async () => {
    while (idx < funcs.length) {
      const cur = idx++;
      res[cur] = await funcs[cur]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, funcs.length) }, worker));
  return res;
}
```

进阶追问：① 支持"失败重试 k 次 + 退避"；② 支持动态追加任务（队列不关闭）；③ 实现带优先级的并发池（小顶堆取任务）；④ 为什么 `new Array(n).fill(iter).map(work)` 里共享同一个 iter 是安全的而共享 Promise 会踩坑？

---

## 题目 21｜对齐语义的节流（对应 `lc/lc2676.js`）

源码解读：维护 `nextCallTime`，每次调用按 `max(0, nextCallTime - now)` 延迟执行，执行后把 `nextCallTime` 推到 `now + t`；因为每次都 `clearTimeout` 重排，最后一次调用一定执行（trailing），且执行间隔不小于 t——正是 LeetCode 2676 要求的标准节流。

题目描述：实现该节流，并回答：① 高频连续触发时实际执行节奏（第一个立即？最后一个何时）？② 与题目 4 中 `throttle`（leading）/`throttle2`（丢弃式）的行为差异表；③ 改成 leading + trailing 双端版本。

考点深挖：

- 首次调用 `nextCallTime = 0` → delay 为 0 立即执行，天然带 leading。
- 连续触发下，每次新调用都 `clearTimeout(timer)` 并重排：只有当前窗口内"最新一次"调用会在窗口结束时执行——即 trailing 语义 + 窗口内合并。
- 与 debounce 的本质区别：debounce 每次重置完整 delay；本节流以 `nextCallTime` 为锚，窗口不随新调用无限后移。
- `Date.now()` 精度与系统时钟回拨问题（可用 `performance.now()`）。

进阶追问：① 用时间轴模拟 t=50ms、在 0/20/40/70/200ms 触发的执行序列；② 取消与 flush API；③ 在 React 中节流 setState 为何仍可能失效（批处理与并发特性）。

---

## 题目 22｜Proxy 无限对象（对应 `lc/lc2690.js`）

源码解读：`createInfiniteObject` 返回一个 `get` 陷阱永远返回 `() => p` 的 Proxy——任意属性访问都得到"返回该属性名字符串"的函数：`obj.abc123()` → `"abc123"`。

题目描述：实现 `createInfiniteObject()`（LeetCode 2690）；再扩展：① 支持链式路径累积——`obj.a.b.c()` 返回 `"a.b.c"`；② `obj.a` 不调用时返回嵌套代理而非函数；③ 实现 `obj.count` 返回被访问次数。

考点深挖：

- `get(target, p, receiver)` 中 `p` 是 `string | symbol`；注意 `Symbol.toPrimitive / Symbol.toStringTag / then` 等特殊键会被语言内部访问（如把代理放进模板字符串、`await` 时会读 `then`）——健壮的实现要特判 symbol 键。
- 链式累积路径的实现技巧：get 返回一个"闭包携带 path"的新 Proxy + `apply` 陷阱终结（`apply` 时返回 path.join('.')）。
- Proxy 不可 polyfill（需要引擎级拦截），这是它改写响应式系统设计（Vue3）的原因。
- `receiver` 参数与 `Reflect.get(target, p, receiver)` 转发——getter 内 this 指向 receiver。

参考实现（路径累积）：

```js
function createInfiniteObject(path = []) {
  return new Proxy(function () {}, {
    get: (_, p) => createInfiniteObject([...path, String(p)]),
    apply: () => path.join("."),
  });
}
```

进阶追问：① 为什么 target 用函数对象（要支持 `apply` 拦截，target 必须可调）；② 用该模式实现"类型安全的 API 路径构造器"（`api.user.list()` → `GET /user/list`）；③ Proxy 的性能开销与 V8 对代理的内联缓存限制。

---

## 题目 23｜手写 Immer produce（对应 `lc/lc2691.js`）

源码解读：`ImmutableHelper.produce(recipe)` 是 Immer 核心机制的精简实现：`createDraft` 用 Proxy 包装对象，`get` 时懒创建子草稿（`drafts` Map 缓存）、`set` 时写时复制（首次修改 `state.copy = [...base]` 浅拷贝，之后写入 copy）；`finalize` 递归收尾：子草稿有变化则回填到父 copy，整棵子树无修改则返回 `state.base` 保持引用不变。

题目描述：实现 `produce(base, recipe)`（LeetCode 2691）：`recipe(draft)` 内可随意"原地修改" draft，返回一个最小变更的新对象——未修改的分支保持原引用（`next.obj === base.obj`），修改路径上的祖先节点全部换新。

考点深挖：

- 结构共享（structural sharing）：引用相等性 = 变化检测信号，这是 React/Redux 纯函数状态更新的基石：`next.todos === prev.todos` 即可跳过重渲染。
- 写时复制时机：第一次 `set` 才浅拷贝 base；`drafts.delete(prop)` 处理"先改子草稿、后整体赋值覆盖该 key"的冲突。
- `finalize` 中 `hasChildChange` 的判定：子草稿定稿结果与源值不同 → 父需要 copy 并回填。
- 源码用 `state.copy ?? state.base` 取当前有效源；`DRAFT_STATE` Symbol 让 finalize 能识别"传入的是草稿还是普通值"。
- 局限性（对照真 Immer）：未处理 Map/Set、数组长度缩短、`delete` 操作（需 `deleteProperty` 陷阱）、冻结产物（autoFreeze）。

进阶追问：① 实现 `deleteProperty` 陷阱与"已删除标记"；② 如何支持数组 `push/pop`（会触发 length 的多次 set，如何合并）；③ Immer 的 `original(draft)` / `current(draft)` 如何借助 DRAFT_STATE 实现；④ 为什么 `recipe` 不允许 return 新值的同时又修改 draft。

---

## 题目 24｜深度不可变对象（对应 `lc/lc2692.js`）

源码解读：`makeImmutable` 返回深层代理：`get` 拦截把对象值递归 `proxify`；`set` 一律抛错（数组报 `Error Modifying Index: x`，对象报 `Error Modifying: x`）；数组的 7 个变更方法（pop/push/shift/unshift/splice/sort/reverse）被替换为带 `apply` 陷阱的 Proxy，调用即抛 `Error Calling Method: xxx`。

题目描述：实现 `makeImmutable(obj)`（LeetCode 2692）：任意深度的属性写入、数组下标写入、数组变更方法调用都必须抛出指定格式错误；读取行为不变。

考点深挖：

- 三类写入面都要封死：`set`（对象属性）、`set` 中数组分支（下标写入）、变更方法（push 等不经过 `set` 陷阱的对外 API）——漏掉任何一类都不完整。
- 源码的实现瑕疵：`obj[method] = new Proxy(...)` 直接改写了原对象（污染输入）；更优做法是在 `get` 陷阱里识别这 7 个方法名、动态返回被 `apply` 代理的函数。
- `throw` 字符串而非 Error 实例：LeetCode 判题按字符串比较，工程中应 `throw new TypeError(...)` 保留堆栈。
- `Object.freeze` 是浅冻结且静默失败（严格模式才抛错）——深冻结需要递归 + freeze，与本题的代理式"只读视图"是两种路线（冻结改本体 vs 代理不改本体）。
- `deleteProperty`、`defineProperty`、`setPrototypeOf` 也是写入面，完整实现应一并拦截。

进阶追问：① 如何让嵌套读取不重复包装（缓存 `WeakMap<base, proxy>`）；② 只读视图与题目 23 的 produce 组合（提交前可读不可写）；③ 实现"部分可变"白名单（允许 `$` 前缀属性写入）。

---

## 题目 25｜对象 Diff（对应 `lc/lc2700.js`）

源码解读：`objDiff` 递归对比两个对象共有键：叶子值不等返回 `[oldVal, newVal]`，数组与对象类型不匹配整体返回 `[obj1, obj2]`；只在 obj2 中存在的键被忽略、只在 obj1 中存在的键也被忽略——产出"变更集"。`objDiff2` 是 `for...in` 版本。

题目描述：实现 `objDiff(obj1, obj2)`（LeetCode 2700）；再实现增强版：① 输出三种操作 `{type: 'add'|'remove'|'update', path, oldVal, newVal}` 的补丁数组；② 实现 `applyPatch(obj, patches)` 与 `invertPatch`（撤销）。

考点深挖：

- 源码的键处理约定：只比较共有键（新增/删除键被忽略），这与"深比较"语义不同，面试要先澄清需求。
- 数组按"键"递归（`Object.keys([])` 是下标字符串），长度变化时多余的元素键不共有 → 也被忽略——想感知长度变化需特判。
- 空 diff 用 `Object.keys(subDiff).length > 0` 判定后才挂到父级，保证结果最小化。
- `for...in` vs `Object.keys`：`for...in` 含原型链可枚举键——`objDiff2` 里配合 `key in obj2` 也有原型链误判风险（如 `constructor`），生产应加 `hasOwnProperty`。
- 这就是 React 状态 diff、JSON Patch（RFC 6902）、协作编辑 OT/CRDT 的入门模型。

进阶追问：① 数组的"最小移动"diff（LCS / Myers 算法，虚拟 DOM 列表 diff 同源）；② 大对象 diff 的性能（键集合预计算、提前短路）；③ 用 Proxy 记录变更轨迹自动生成 patch（与题目 23 的 drafts 结合）。

---

## 题目 26｜深合并 deepMerge（对应 `lc/lc2755.js`）

源码解读：`deepMerge(obj1, obj2)`：任一非对象或"一数组一对象"时取 `obj2`（`undefined` 则取 `obj1`）；否则对两对象键的并集递归合并，数组对数组按下标合并（结果长度取较长者）。

题目描述：实现 `deepMerge`（LeetCode 2755），并回答边界：① `{a: 1}` 与 `{a: undefined}` 合并结果（键是否保留）；② 数组长度不一致时的结果；③ 改为"数组合并策略可配置"（按下标合并 / 整体替换 / 拼接）。

考点深挖：

- `new Set([...keys1, ...keys2])` 求并集保持插入序；`key in obj` 区分"键不存在"与"键存在值为 undefined"。
- 数组按下标递归：短数组多出来的下标位由长数组的 `undefined` 触发"取 obj1"分支，结果保留长数组元素。
- 与 `Object.assign` / 展开运算符（浅合并，后者覆盖前者整支替换）的本质差异。
- 与 lodash `merge` 的策略对比（lodash 数组也是按下标合并）。
- 合并结果永远是新对象/新数组（不修改输入），符合不可变更新范式。

进阶追问：① 增加循环引用防护；② 实现 `deepMergeWith(customizer)` 允许自定义冲突解决（如数字相加、字符串拼接）；③ 配置合并实战：webpack 配置合并 / 默认参数深合并时数组为什么通常要"整体替换"。

---

## 题目 27｜查询批处理器 QueryBatcher（对应 `lc/lc2756.ts`）

源码解读：`getValue(key)` 把 `[resolve, key]` 推入队列并触发 `consume`；`consume` 在非节流窗口且队列非空时执行 `batchQuery`——把当前队列整体取出（keys 与 resolves 一一对应），调用批量接口 `queryMultiple(keys)`，再按下标把结果分发给各 Promise；随后进入 t 毫秒的节流窗口，窗口结束递归 `consume` 处理积压。

题目描述：实现 `QueryBatcher`（LeetCode 2756）：将短时间内大量 `getValue(key)` 单点查询合并为批量查询，且任意两次批量调用的间隔不小于 t。

考点深挖：

- "队列快照"技巧：`const queries = this.queries; this.queries = []`——先换引用再异步处理，期间新进的 key 进入下一轮。
- 节流窗口内的积压由窗口末尾的递归 `consume` 兜底，保证不丢。
- resolves 与 keys 按下标配对——前提是 `queryMultiple` 保序返回，这是契约的一部分。
- 失败处理缺失：真实实现需 catch 后 `reject` 各 Promise，否则调用方永远 pending（内存泄漏）。
- 同 key 去重优化：窗口内相同 key 只查一次，结果广播给多个 resolve。
- 这就是 GraphQL DataLoader 的核心思想（DataLoader 用微任务/帧合并 + 缓存）。

进阶追问：① 与"防抖合并"的差异（DataLoader 按帧合并且无最小间隔，本题按最小间隔滚动批处理）；② 增加最大批量 `maxBatchSize`（超出立即拆批）；③ 如何配合 HTTP/2 多路复用重新评估"合批"的收益边界。

---

## 题目 28｜循环生成器（对应 `lc/lc2757.js`）

源码解读：`cycleGenerator(arr, startIndex)` 无限循环：`yield arr[idx]` 的返回值是下次 `next(v)` 传入的 `v`，步进 `idx = ((idx + v) % len + len) % len`——双重取模兼容负数步进。

题目描述：实现 `cycleGenerator`（LeetCode 2757）：`next()` 产出当前元素；`next(x)` 传入跳跃步数（可为负），产出跳跃后的元素。再回答：首个 `next(v)` 传入的值去哪了？

考点深挖：

- 生成器的双向通信：`yield expr` 整体是表达式，求值结果是下一次 `next(arg)` 的实参；第一次 `next(arg)` 的实参被丢弃（生成器体尚未执行到任何 yield，无表达式可接收）——经典陷阱题。
- 负数取模修正：`-1 % 5 === -1`（JS 取余保留被除数符号），`(x % n + n) % n` 归一到 `[0, n)`。
- `while (true)` 生成器是安全的惰性无限序列（每次 next 才推进一步），不会死循环主线程。
- `for...of` 消费无限生成器必须配合 break/take(n)，且 break 会调用生成器的 `return()` 触发其 `finally`。

进阶追问：① 用闭包手写等价迭代器（不用 function\*）；② 实现 `take(gen, n)` / `map(gen, fn)` 等生成器工具；③ 生成器 + Promise = 协程（`co` 库 / redux-saga）的原理，`async/await` 本质就是"Promise 驱动的生成器执行器"。

---

## 题目 29｜Date.prototype.nextDay（对应 `lc/lc2758.js`）

源码解读：`nextDay` 以当前日期新建 `Date`，`setDate(getDate() + 1)` 依赖 Date 的自动进位（1 月 32 日 → 2 月 1 日），再手工拼 `YYYY-MM-DD`（月日 `padStart(2, '0')` 补零）。

题目描述：给 `Date.prototype` 添加 `nextDay()`（LeetCode 2758），返回次日 `YYYY-MM-DD`；再实现 `addDays(n)`（支持负数）、`isSameDay(a, b)`、`diffInDays(a, b)`，并说明时区陷阱。

考点深挖：

- `setDate` 溢出进位是规范行为（MakeDay），比手写"每月天数表 + 闰年"可靠得多。
- 月份 `getMonth()` 从 0 起——补零前 +1，经典踩坑点。
- `new Date(this)` 克隆避免污染原对象；`this.getDate()` 用本地时区——跨时区/夏令时切换日，"加一天"与"加 24h"不等价（`setDate(+1)` 是日历日，`+86400000` 是物理时长）。
- 扩展原生原型的争议（污染全局、与库冲突）——生产应封装工具函数或使用 `Temporal` 提案 API（`Temporal.PlainDate` 根治时区/可变性问题）。

进阶追问：① 实现"本月最后一天 / 下周五"等日历计算；② `Date.now()` 与 `performance.now()` 的差异（系统时钟 vs 单调时钟）；③ 时间戳比较为什么不要直接 `new Date(str)` 解析非 ISO 字符串（实现相关行为）。

---

## 题目 30｜promisify（对应 `lc/lc2776.ts`）

源码解读：`promisify(fn)` 把"回调在前"（`fn(callback, ...args)`，`callback(data, err)`）的函数包装为返回 Promise 的版本：err 非空 reject，否则 resolve data。

题目描述：实现 `promisify`（LeetCode 2776）适配"回调在首参"风格；再实现 Node 风格（回调在尾参、`callback(err, data)`）的 `promisifyNode`，并处理：① 多成功值（`callback(null, a, b)`）的聚合开关；② this 绑定保留。

考点深挖：

- 两种回调约定差异：LC 风格 `(data, err)` vs Node 风格 error-first `(err, data)`——分支条件相反，面试必考细节。
- `util.promisify` 的行为：依赖被转换函数的 `this`，包装函数内要 `fn.call(this, ...)`；还支持 `fn[util.promisify.custom]` 自定义符号。
- 只 resolve 第一个值的取舍：Node 提供 `promisify` 的多值需 `custom` 实现聚合为对象/数组。
- 回调被调用多次的防护（`called` 标志）——Promise 自身已幂等（settled 后忽略后续调用），天然免疫。
- 反向操作：把 Promise API 包回回调（`callbackify`）。

进阶追问：① promisify 一个 `setTimeout` 得到 `delay(ms)`；② 处理函数同时支持回调与 Promise 的"双模 API"设计；③ 源码里 `resolve(data)` 在 `reject(err)` 之后为什么仍然安全（Promise 状态不可逆，但顺序书写仍是坏味道）。

---

## 题目 31｜手写 Promise.allSettled（找 Bug 题，对应 `lc/lc2795.js`）

源码解读：`promiseAllSettled2` 是正确范式：计数器 + 每个任务 then/catch 写入对应下标、`finally` 里计数达到总数即 resolve。而 `promiseAllSettled`（第一版）藏了两个 bug：

1. `functions.map((fn, i) => { fn[i](); ... })`——回调形参 `fn` 就是函数本身，`fn[i]` 是 `undefined`，调用立即抛 `TypeError`（应为 `fn()` 或 `functions[i]()`）；
2. map 回调没有 `return` 那个 Promise，得到的 `promises` 数组全是 `undefined`，`Promise.all([undefined...])` 立即 resolve（非 Promise 值按值透传），不会等任务完成。

题目描述：指出第一版的全部 bug 并修复；再独立实现 `Promise.all / race / any / allSettled` 四件套（全部不许用原生静态方法）。

考点深挖：

- 四类静态方法的语义差异是必考口述：all（快速失败）、allSettled（永不 reject，等待全部）、race（第一个 settled 者胜出，不论成败）、any（第一个 fulfilled 胜出，全败抛 `AggregateError`）。
- 计数器法 vs `Promise.all(map)` 法：前者手动 resolve 一次，注意空数组边界（空数组应立即 resolve `[]`，计数器法不处理会永远 pending）。
- `then/catch` 收集结果后 finally 统一计数——`finally` 在链中不改变已写下的结果，但会等待回调返回的 Promise。
- `AggregateError` 的 `errors` 属性与 `Error#cause` 的传递。
- race 的实现陷阱：对每个 Promise 直接 `p.then(resolve, reject)` 即可，race 只是"谁先到谁赢"，输家的回调会被忽略（settled 幂等）。

进阶追问：① 实现 `Promise.all` 的"并发限制版"（与题目 20 组合）；② 实现带超时的 `promiseTimeout(p, ms)`（race + AbortController）；③ `Promise.try`（新提案）解决什么问题（同步异常与异步结果统一进 Promise 管道）。

---

## 题目 32｜delayAll（对应 `lc/lc2821.js`）

源码解读：`delayAll(functions, ms)` 返回新函数数组：每个新函数调用时先 `setTimeout(ms)`，再执行原函数并把结果（可能是 Promise）通过 `resolve(fn())` 交给外层 Promise——利用了 Promise 对 thenable 的自动解包。

题目描述：实现 `delayAll`（LeetCode 2821）；再实现其组合应用：① `delayAll(tasks, 100)` 后按序串行执行，总耗时是否 100×n；② 实现"每个函数延迟递增"的 `stagger(functions, baseMs)`。

考点深挖：

- `resolve(fn())` 的解包语义：`fn()` 返回 Promise 时，外层 Promise 吸收其状态（跟随 thenable），返回 rejects 也正确传播。
- 延迟在"调用时"开始而非"创建时"——高阶函数返回的是惰性包装。
- 与 `delay(ms)` 工具组合成 `pipe(delay(100), task)` 的函数式写法。
- 若 `fn()` 同步抛错，发生在 setTimeout 回调内——错误不会进 Promise 链，会炸到全局：严谨实现应 `try { resolve(fn()) } catch (e) { reject(e) }`，这是 code review 点。

进阶追问：① 给延迟函数加"取消"能力（返回 `{promise, cancel}`）；② 用 `AbortSignal` 统一取消模型；③ delayAll + promisePool 组合出"限速上传队列"。

---

## 题目 33｜JSON 转矩阵（对应 `lc/lc3675.js`）

源码解读：`jsonToMatrix` 把 JSON 对象数组展平成表：DFS 遍历每个对象，叶子值记录到 `路径 → 值`（数组下标也并入路径，如 `a.0.b`）；收集全部路径去重、字典序排序作为列头；每个对象一行，缺列补 `""`，首行是列头数组。

题目描述：实现 `jsonToMatrix(arr)`（LeetCode 2675）；再回答：① 为什么数组下标 `10` 会排在 `2` 前面（字典序排序）以及如何修正为数值感知排序；② 实现逆运算 `matrixToJson(matrix)`；③ 空对象 `{}` 与空数组 `[]` 行该如何占位（源码行为是什么）。

考点深挖：

- 路径生成技巧：`dfs(path, el)` 递归拼 `.key`，顶层切片去掉前导点；叶子判定用 `typeof el !== 'object' || el === null`。
- 字典序排序的坑：`"a.10" < "a.2"`（按字符比较），正确做法是自定义 comparator 把数值段转数字比较（`localeCompare` 的 `numeric: true` 选项可直接解决）。
- 空对象/空数组没有叶子 → 该对象贡献零列；整行全 `""`——与原生 `JSON` 展开语义一致，是判题边界。
- 列收集用 Set 去重 + 排序，行构建用"列名 → 下标"映射填洞——稀疏行转稠密行的标准手法。
- 应用：JSON 数据导出 Excel/CSV、低代码表格列推导、日志结构化展开。

进阶追问：① 嵌套数组的对象数组展开时性能瓶颈在哪（每行重复 Set 构造，可提列索引 Map）；② 增加"列顺序稳定"选项（按首次出现顺序而非字典序）；③ 与 `JSON flatten/unflatten`（如 `flat` 库）的互转实现。

---

# 第二部分：面试 Q/A

---

## 一、JavaScript 核心

### Q1：详细介绍 TypeScript 转为 JS 的每一个过程

TypeScript 编译器（`tsc`）本质是一个"带类型擦除的转译器"，从源码到 JS 产物经历 6 个阶段：

1. 扫描（Scanner / Lexer）：源码文本 → Token 流。`const x: number = 1` 被切分为 `const`、`x`、`:`、`number`、`=`、`1` 等 token，跳过空白与注释（注释会以 trivia 形式挂在 token 上供 emitter 保留）。

2. 解析（Parser）：Token 流 → AST（抽象语法树）。TS 的 AST 节点带完整的位置信息（pos/end），且语法错误不中断解析（错误恢复机制，为 IDE 服务——你写着半截代码编辑器也能给提示）。

3. 绑定（Binder）：遍历 AST 建立符号表（Symbol Table）——每个声明生成 Symbol，记录作用域归属（Container → locals）。此阶段把"同名标识符"关联到同一个 Symbol，为类型检查提供名称解析基础。

4. 类型检查（Checker）：核心阶段——

- 类型推断：从初始化表达式、上下文（contextual typing）反推类型；
- 类型标注验证：检查赋值兼容性（结构化类型 / duck typing，而非名义类型）；
- 控制流分析（CFA）：`if (typeof x === 'string')` 分支内收窄类型，基于赋值流图（flow graph）；
- 泛型实例化、条件类型求值、协变/逆变检查（`strictFunctionTypes` 下方法参数双变、函数参数逆变）。

注意：类型错误不阻断编译（除非 `noEmitOnError`）——因为类型信息只用于检查，不影响转译结果。

5. 转换（Transformer）：AST → AST 的降级变换，按 target 决定应用哪些 transformer：

- 类型擦除：删除所有类型标注、接口、类型别名、`as` 断言、`!` 非空断言（纯删除，零运行时成本）；
- TS 独有语法展开：`enum` → IIFE 生成双向映射对象；`namespace` → IIFE 闭包；参数属性（`constructor(private x)`）→ 构造体内赋值语句；
- 装饰器（旧版）：类与方法调用改写为 `__decorate([...], target, key, descriptor)` 辅助函数调用；`emitDecoratorMetadata` 额外注入 `Reflect.metadata("design:type", ...)`；
- 语法降级：`async/await` → `__awaiter` + 生成器状态机（target ≤ ES2017）；`class` → 函数 + 原型赋值（≤ES5）；`?.`/`??` → 临时变量 + 三元表达式；展开运算符 → `__spreadArray` 辅助函数；`for...of` → 索引循环（`downlevelIteration` 关闭时，数组以外会出错）；
- 模块转换：ESM `import/export` → CJS 的 `require`/`exports.x`（`module: commonjs` 时）。

6. 发射（Emitter）：变换后 AST → 输出文本，三种产物：

- `.js`：打印 AST（printer），按 `removeComments`/`sourceMap` 等选项处理；
- `.d.ts`：从符号表+类型信息生成声明文件（只导出面可见的类型签名）；
- `.js.map`：VLQ 编码的 sourcemap，建立产物位置 ↔ 源码位置的映射。

补充深挖点：

- `tsc` vs `transpileModule` vs `swc/esbuild/babel`：`transpileModule` 走"单文件、无类型检查"快速通道（无法处理 `const enum` 等需跨文件信息的特性）；swc/esbuild 只做扫描/解析/降级/发射（Rust/Go 实现快 10-100 倍），不做类型检查——所以现代工程链路是"esbuild/swc 负责转译 + `tsc --noEmit` 负责类型检查"。
- 增量编译：`incremental: true` 生成 `.tsbuildinfo`（签名哈希 + 依赖图），二次编译跳过未变化文件。
- Language Service：同一套编译器 API 驱动 VS Code 的跳转/补全/重构——binder/checker 结果常驻内存，编辑时增量重解析。
- 构建时序面试口径："parse → bind → check → transform → emit，类型信息在 transform 阶段被整体擦除，运行时代码与无类型 JS 完全同构"。

---

### Q2：事件循环——宏任务、微任务与渲染帧的精确时序

模型：浏览器每个"代理"（类似 realm）有一个事件循环，维护多个宏任务源队列（定时器、I/O、UI 事件各成队列，不是单一队列）与一个微任务队列。

单轮循环（HTML 规范 processing model）：

1. 从某个宏任务队列取一个任务执行（不是全部）；
2. 执行完后清空整个微任务队列（执行期间新入队的微任务也在本轮执行——`Promise.then` 链可以"饿死"宏任务）；
3. 若到渲染时机（`requestAnimationFrame` 前）：执行 rAF 回调 → 样式计算 → 布局 → 绘制 → 合成；
4. 渲染间隙可能执行 `requestIdleCallback`。

关键细节：

- `setTimeout(fn, 0)` 不是 0ms：有最小钳制（嵌套 ≥5 层后 ≥4ms，后台标签页 ≥1000ms）。
- Node 的差异：Node 事件循环分阶段（timers → pending → poll → check → close），`process.nextTick` 优先于 Promise 微任务；Node 11+ 每个宏任务后清微任务队列（与浏览器对齐），之前是每个阶段后清空。
- `queueMicrotask` 与 `Promise.then` 同队；`MutationObserver` 回调也是微任务。
- `await` 的 tick 数：`await promise` ≈ `Promise.prototype.then` 一次微任务；ES2019 优化后 `async` 函数返回已 resolve 的 Promise 不再多两个 tick。
- 渲染帧预算 16.7ms：JS 执行 + rAF + 渲染流水线必须塞进去，否则掉帧。

经典输出题口径：同步代码 → 微任务（全部）→（可能渲染）→ 一个宏任务 → 微任务（全部）→ …

---

### Q3：作用域、闭包与变量提升的底层机制

执行上下文：每次函数调用创建执行上下文，含 `VariableEnvironment`（var/function 声明）与 `LexicalEnvironment`（let/const/class、块级绑定），外加 `[[OuterEnv]]` 外层引用形成作用域链。

提升的精确语义：

- `var`：声明在环境实例化时创建并初始化为 `undefined`；
- `let/const`：声明被创建但不初始化——从块首到声明语句之间是 TDZ（暂时性死区），访问抛 `ReferenceError`；
- `function` 声明：创建 + 初始化 + 赋值一步到位（所以函数声明可前置调用）；
- `class`：同 let，有 TDZ。

闭包：函数对象携带 `[[Environment]]` 内部槽，指向其定义时的词法环境。闭包捕获的是变量绑定本身而非值——所以循环中 var 共享绑定、let 每轮新建绑定。

V8 的闭包优化：作用域分析（scope analysis）后，未被内层引用的变量留在栈上；被捕获的变量提升到 Context 对象（堆分配）。多层嵌套只捕获用到的变量链节。调试器里看到 `[[Scopes]]` 即此结构。

内存角度：闭包让词法环境无法被 GC——模块级大对象被事件回调闭包间接引用是常见泄漏源；解除引用或弱引用（WeakRef）兜底。

---

### Q4：this 绑定四条规则与优先级

规则（优先级从高到低）：

1. new 绑定：`new F()` → this = 新建对象（构造函数返回对象则覆盖）；
2. 显式绑定：`call/apply/bind`（bind 后 new 会触发规则 1 覆盖——见题目 1 的 `new.target` 处理）；
3. 隐式绑定：`obj.fn()` → this = obj（只看调用点最后一个对象：`a.b.c.fn()` this 是 `c`）；
4. 默认绑定：独立调用 → 非严格模式全局对象，严格模式 `undefined`。

例外与陷阱：

- 隐式丢失：`const f = obj.fn; f()` → 默认绑定；回调传参 `setTimeout(obj.fn)` 同理。
- 箭头函数：无自己的 this，词法捕获外层 this，且 call/apply 无法改写（参数照常传，this 忽略）。
- DOM 事件监听器的 this 是触发元素；React 类组件事件回调需手动 bind 的历史原因即隐式丢失。
- `with`/`eval` 的间接调用 `(0, obj.fn)()`（逗号表达式取引用值）丢失绑定。
- `Function.prototype` 上 `call/apply/bind` 的 thisArg 传原始值会被装箱（非严格模式），null/undefined 替换为全局对象（非严格）。

---

### Q5：原型链与继承的所有方式对比

原型链模型：每个对象有 `[[Prototype]]` 内部槽（`__proto__` 访问器）；属性查找沿链向上直到 null。`Object.prototype.__proto__ === null` 是链终点。

关键等式：`F.prototype`（构造函数的原型对象，new 时成为实例的 `[[Prototype]]`）≠ `F.__proto__`（F 自身作为函数对象的原型，是 `Function.prototype`）。class 的双重原型链：`Child.__proto__ === Parent`（静态继承）+ `Child.prototype.__proto__ === Parent.prototype`（实例继承）。

继承方式对比（详见题目 7）：原型链继承 / 盗用构造函数 / 组合继承 / 原型式 / 寄生式 / 寄生组合式 / ES6 class extends。

深挖点：

- `class` 是语法糖但有差异：class 声明有 TDZ、类体默认严格模式、class 不可无 new 调用、`super` 依赖 `[[HomeObject]]` 静态绑定。
- 属性遮蔽（shadowing）：`obj.x = v` 时若原型链上有同名 setter 会触发 setter 而非遮蔽；有同名只读数据属性（writable: false）在非严格模式静默失败——`Object.defineProperty` 的[[Define]] 与赋值的 [[Set]] 语义差异。
- `Object.getOwnPropertyNames` vs `Object.keys` vs `for...in`：自身全部字符串键 / 自身可枚举 / 含链上可枚举。
- 性能：V8 为对象形状建隐藏类，运行期改原型（`setPrototypeOf`）会使相关隐藏类失效退化为字典模式——慢。

---

### Q6：隐式类型转换与 `==` 的完整规则

ToPrimitive：对象转原始值先按 hint（number/string/default）尝试：`[Symbol.toPrimitive]` → `valueOf` → `toString`（hint=string 时顺序相反）。`Date` 是唯一 hint=default 时按 string 处理的内建类型。

`==` 核心规则：

- 同类型直接比；`null == undefined`（且仅彼此相等）；
- number vs string：string 转 number；
- boolean 先转 number：`true → 1`；
- 对象 vs 原始值：对象 ToPrimitive 后再比；
- `NaN` 不等于任何值包括自身。

经典题口径：`[] == ![]` → `[] == false` → `[] == 0` → `'' == 0` → `0 == 0` → true（`![]` 先算布尔取反：空数组是 truthy → false）。

`+` 运算符：任一为 string（或 ToPrimitive 后为 string）→ 字符串拼接；否则都转 number 相加。`{} + []` 在语句开头时 `{}` 被解析为代码块（得到 `+[]` → 0），括号包裹才是对象字面量。

`===` 与 `Object.is`：`Object.is(NaN, NaN)` 为 true，`Object.is(+0, -0)` 为 false——React 的依赖比较用 `Object.is`。

深挖：`Symbol.toPrimitive` 自定义转换；`valueOf/toString` 改写实现的"自增对象"（`a == 1 && a == 2 && a == 3` 为 true）；Proxy 无法拦截 `==` 的 ToPrimitive 之外的相等判定。

---

### Q7：Promise/A+ 规范细节与 async/await 编译产物

A+ 规范要点（手写 Promise 的评分标准，见题目 14）：

- 三态不可逆；then 返回新 Promise；
- `[[Resolve]](thenable)`：返回值是 thenable 要递归解包，取 `then` 属性的过程抛错要 reject，resolve/reject 多次调用只认首次（`called` 锁）；
- 回调异步执行（平台代码栈清空后）；回调抛错 → 新 Promise reject；回调缺省 → 值穿透。

组合方法语义：见题目 31（all/allSettled/race/any）。

async/await 编译（target ES5 时）：

- async 函数 → 普通函数返回 `__awaiter(this, ..., function* () {...})`；
- 函数体转生成器，每个 `await` 变 `yield`；`__awaiter` 是执行器：递归 `step((result) => result.done ? resolve : adopt.then(step))`——即"Promise 驱动的生成器协程"（与题目 28 呼应）；
- 异常通过 `gen.throw(e)` 送回 yield 点，被 try/catch 捕获。

深挖：

- `async` 函数抛同步异常 → 返回 rejected Promise（不抛出同步错误）；
- `for await...of` 消费异步迭代器（`Symbol.asyncIterator`）；
- 顶层 await（ES2022，仅 ESM）使模块求值异步化——依赖它的模块会等其完成；
- 微任务数量优化史：ES2019 把 `await v` 从 3 个 tick 降到 1 个（移除多余的 Promise 包装）。

---

### Q8：Proxy 与 Reflect 的设计动机与全部陷阱（trap）

Proxy 三要素：`new Proxy(target, handler)`——target 是被代理对象，handler 定义拦截行为；proxy 本身没有自己的语义，未拦截的操作全部转发到 target。

13 个陷阱全表：`get / set / has / deleteProperty / ownKeys / getOwnPropertyDescriptor / defineProperty / getPrototypeOf / setPrototypeOf / isExtensible / preventExtensions / apply（函数调用）/ construct（new）`。

不变量（invariants）：代理不能违反目标对象的不可配置/不可写约束——如 target 有不可配置不可写的数据属性，get 必须返回原值，否则抛 TypeError。这是引擎保证对象完整性的底线。

Reflect 的意义：

- 把对象内部方法（`[[Get]]`、`[[Set]]` 等）暴露为一一对应的函数 API；
- 返回值是布尔而非抛错（`Object.defineProperty` 失败抛错，`Reflect.defineProperty` 返回 false——更适合函数式处理）；
- `Reflect.get(target, key, receiver)` 的 receiver 保证 getter 内 this 正确——Proxy 转发的正确姿势是 `return Reflect.get(target, key, receiver)`，直接 `target[key]` 会让 getter 里的 this 指向 target 而非代理，导致响应式系统丢依赖（Vue3 的核心细节）。

应用：Vue3 响应式（get 收集依赖 / set 触发更新）；Immer 草稿（题目 23）；只读视图（题目 24）；数据绑定与校验；`Proxy.revocable()` 可撤销代理（内存安全沙箱）。

局限：无法 polyfill；不能被 `JSON.stringify` 之外的内部槽操作透明化（如代理的 Date 调 `getTime` 会抛错——内部槽 `[[DateValue]]` 不在代理上）；性能比直接属性访问慢（拦截破坏内联缓存）。

---

### Q9：迭代器、生成器与异步迭代协议

协议层：可迭代对象实现 `[Symbol.iterator]()` 返回迭代器；迭代器实现 `next()` 返回 `{value, done}`，可选 `return()`（提前终止清理）与 `throw()`。

内建可迭代：Array / String / Map / Set / TypedArray / arguments / NodeList——所以都能 `for...of` 与展开。

生成器的本质：可暂停的函数——状态机 + 保存的栈帧。`function*` 调用返回生成器对象（同时是迭代器与可迭代对象），`next(v)` 恢复执行并把 v 作为上一个 yield 表达式的值。`yield*` 委托：把 next/return/throw 转发给子生成器。

高级用法：

- 双向通信：`next(v)` 注入值（题目 28）；`gen.throw(e)` 在 yield 点注入异常（协程式错误处理）；
- 惰性无限序列：斐波那契、ID 生成器、分页拉取器；
- 协程：生成器 + Promise 执行器 = async/await 前身（`co` 库）；redux-saga 用生成器让副作用可测试（yield 描述符而非直接执行）。

异步迭代：`[Symbol.asyncIterator]()` 返回的迭代器 `next()` 返回 Promise；`for await...of` 自动 await 每个值。应用：流式读取（fetch response body 的 reader 包装、Node Stream 的 asyncIterator）、SSE 消息消费、分页 API 全量遍历。

深挖：`for...of` 提前退出会调用迭代器 `return()`（生成器的 finally 得以执行）；手动用 `iter.next()` 则不会自动清理——需显式 `iter.return()`。

---

### Q10：V8 内存管理与垃圾回收

内存布局：栈（调用帧、原始值）→ 指针进堆；堆分新生代（ young generation，又分 semispace from/to 两个半区）与老生代（old space，含大对象区 large object space、代码区 code space）。

新生代：Scavenge（副垃圾回收）：

- Cheney 算法：from 区满 → 把存活对象复制到 to 区（BFS 遍历引用图）→ 交换 from/to；
- 复制即压缩，无碎片；空间换时间（只用一半）；
- 两次 scavenge 存活（或复制时 to 区占用 >25%）→ 晋升老生代。

老生代：Mark-Sweep-Compact（主垃圾回收）：

- 标记：从 GC Roots（全局对象、当前栈、活动句柄）三色标记（白/灰/黑）；
- 清除：回收白色对象，维护空闲列表；
- 整理：内存碎片多时移动存活对象压缩；
- 写屏障（write barrier）：老生代对象引用新生代对象时记录到"记忆集"（remembered set），scavenge 时不必扫整个老生代；
- 优化：增量标记（拆成小步穿插执行）、惰性清理、并发标记（后台线程标记，主线程只处理写屏障变化）、并行 scavenge——目标是压缩 STW（stop-the-world）停顿。

前端相关：

- 闭包/DOM 引用/detached DOM 树/定时器未清理/Map 无限增长是四大泄漏源；
- WeakMap/WeakSet：键弱引用，键对象无其他引用时可被 GC（题目 6 深拷贝用 WeakMap 的原因之一）；
- `WeakRef` + `FinalizationRegistry`：缓存场景，注册回收回调（但不保证时机，不能用于关键逻辑）；
- `performance.memory` / Chrome DevTools Heap Snapshot / Allocation timeline 排查手段。

---

### Q11：V8 性能优化：隐藏类、内联缓存、逃逸分析

隐藏类（Hidden Class / Map / Shape）：

- 对象属性按添加顺序形成转换链：`{} → {x} → {x, y}` 每一步生成新 Map，记录属性名 → 偏移量；
- 同形状对象共享 Map → 属性访问编译为固定偏移的机器码；
- 优化守则：构造函数里按固定顺序初始化全部属性；避免 `delete`（退化为字典模式 dictionary mode）；避免运行期增删属性/改原型；不同形状的对象别混进同一个数组/多态调用点。

内联缓存（Inline Cache, IC）：

- 属性访问字节码处记录"上次对象的 Map + 命中偏移"；
- 单态（monomorphic）：总是同 Map → 直接比较 Map 后按偏移取值，极快；
- 多态（polymorphic，2-4 种 Map）：小跳转表；
- 超态（megamorphic）：退化哈希查表——热点代码要避免；
- TurboFan 基于 IC 反馈做推测优化：假设类型不变直接生成机器码 + 去优化（deopt） 检查点（假设失败回退字节码）。

逃逸分析（Escape Analysis）：JIT 证明对象不逃逸出函数（不外传、不存堆）→ 标量替换：对象不分配，字段拆成局部变量（栈上寄存器分配），省掉堆分配与 GC。

其他：

- 函数内联（inlining）：小函数直接展开；
- 数组 ElementsKind：`PACKED_SMI → PACKED_DOUBLE → PACKED_ELEMENTS` 单向迁移，稀疏数组变 `HOLEY_*` 甚至字典——保持数组紧凑、同类型；
- 数字：31 位内整数走 SMI（指针 tagged）不开箱，超出变 HeapNumber；
- 字符串：cons string（拼接先存切片树）、sliced string、intern 化。

面试口径：写"JIT 友好"代码 = 形状稳定 + 类型稳定 + 热点函数小而纯。

---

### Q12：ESM 与 CJS 的本质差异与循环引用行为

| 维度         | ESM                                  | CJS                                      |
| ------------ | ------------------------------------ | ---------------------------------------- |
| 加载         | 静态（编译期建依赖图）               | 动态（运行期 require）                   |
| 绑定         | 活绑定（live binding，导出值的引用） | 值快照（module.exports 的拷贝/对象引用） |
| 求值         | 异步（顶层 await 支持）              | 同步                                     |
| this         | 模块顶层 `undefined`                 | `module.exports`                         |
| tree-shaking | 可静态分析                           | 困难                                     |
| 缓存         | URL 为键                             | 解析后路径为键                           |

ESM 三阶段（规范级）：解析（建模块记录与依赖图）→ 实例化（为所有导出分配绑定槽，函数声明提升初始化）→ 求值（深度优先后序执行模块体）。

循环引用行为差异（必考）：

- CJS：require 时若模块在缓存中（正在加载）→ 返回已执行部分的 exports——拿到"半成品"；
- ESM：活绑定 + 提升——导入方访问时若绑定已初始化则正常，若在 TDZ（let/class 导出尚未执行到）则抛 ReferenceError；函数声明导出总是可用。

互操作：CJS `require(esm)` Node 20+ 有限支持（同步 ESM 图）；ESM `import cjs` 走 cjs-module-lexer 静态猜测命名导出，猜测失败只有 default（整个 module.exports）。

深挖：`import()` 动态导入返回 Promise（代码分割基础）；`import.meta.url`；package.json 的 `exports` 字段条件导出（`import`/`require`/`browser`）；双包风险（dual package hazard：同一库 ESM/CJS 两份实例，instanceof 失效）。

---

### Q13：ES 新特性高频考点（尾调用、BigInt、Record & Tuple 等）

尾调用优化（PTC, ES6 规范）：严格模式下 `return f(...)` 复用当前栈帧——理论上递归阶乘可 O(1) 栈。现实：只有 Safari/JSC 实现，V8 曾实现后移除——面试要会说"规范有、引擎没普及，别依赖"。

BigInt：任意精度整数（`123n`）；不能与 Number 混算（显式转换）；`typeof 1n === 'bigint'`；JSON 序列化抛错；`BigInt.asIntN(64, x)` 固定位宽截断。应用：雪花 ID、时间戳纳秒、区块链数值。

其他常考：

- `?.` / `??`：`??` 只判 null/undefined（`0/''/false` 有效），与 `||` 的本质差异；`?.()`、`?.[]`、可选链短路返回 undefined；`a?.b.c` 中 a 为 nullish 时整个链短路（c 不求值）；
- 逻辑赋值 `??= / &&= / ||=`；
- `Array.prototype.at(-1)`、findLast；
- `Object.hasOwn`（替代 hasOwnProperty.call）；
- 顶层 await（ES2022）；类私有字段 `#x`（真私有，运行时不可访问，与 TS `private` 的"类型层私有"本质不同）；
- `Array.prototype.group` / `Object.groupBy`；`Promise.withResolvers`；`structuredClone`；
- 正则 `d` 标志（indices，捕获组起止下标）、命名捕获组、后行断言；
- 在途提案：Temporal（取代 Date）、Record & Tuple（`#{...}` 深不可变 + 值相等 `===`）、Decorator（已落地 TS 5）、Iterator Helpers（`iter.map/filter/take`）、Pattern Matching。

---

### Q14：正则引擎与灾难性回溯

NFA 回溯模型：JS 正则是回溯式 NFA——贪婪量词先尽量多吃，匹配失败按"后进先出"回溯让位。

灾难性回溯（ReDoS）成因：嵌套量词 + 可重叠匹配——`/(a+)+$/` 对 `"aaaaaaaaaaaaaaaaaaaaX"` 的划分方案数是指数级（2ⁿ 种分组），引擎全试一遍才宣告失败。Node 层曾有著名 CVE（如 `moment`、ua-parser 的正则）。

识别与防御：

- 危险信号：`(x+)+`、`(x|y)*` 内部分支可匹配相同前缀、`.*.*.*` 连续贪婪；
- 防御：改写为原子化结构（`a+` 外不再套量词）、限定长度 `{1,64}`、用 possessive 思路拆匹配、输入长度校验、worker 中执行 + 超时杀掉（JS 正则无超时参数）；
- 工具：safe-regex、recheck 静态分析。

其他深挖：

- `lastIndex` 与 `g/y` 标志：全局正则在 `exec/test` 间共享 lastIndex（同一个正则对象连续 test 结果交替的坑）；
- 命名捕获组 `(?<year>\d{4})` 与 `matchAll`（返回迭代器，避免 exec 循环）；
- Unicode：`u` 标志下 `.` 匹配码点（含代理对）、`\p{Script=Han}` 属性类；
- `v` 标志（ES2024）：字符集运算 `[\p{ASCII}--[aeiou]]`；
- 性能：编译正则缓存（字面量只编译一次）、避免不必要捕获组（用 `(?:...)`）。

---

## 二、DOM

### Q15：DOM 事件流——捕获、冒泡、委托与 passive

事件流三阶段：捕获（window → 目标）→ 目标阶段（目标上捕获/冒泡监听器按注册顺序执行）→ 冒泡（目标 → window）。`addEventListener(type, fn, {capture: true})` 注册捕获监听。

关键 API：

- `stopPropagation()`：阻止继续传播（同元素其他监听器仍执行）；`stopImmediatePropagation()`：连同元素剩余监听器一并阻止；
- `preventDefault()`：阻止默认行为（不阻止传播）——`<a>` 跳转、表单提交、右键菜单；
- `event.target`（触发源）vs `event.currentTarget`（监听绑定元素）vs `event.composedPath()`（穿透 shadow DOM 的完整路径）。

不冒泡的事件：`focus/blur`（用 `focusin/focusout` 替代做委托）、`mouseenter/mouseleave`（与 mouseover/out 的差异是高频题）、`load/error`（资源类，需捕获阶段监听）。

事件委托：利用冒泡把监听器挂在祖先上 + `e.target.closest(selector)` 匹配——优点：动态子元素免绑定、内存省；注意 `closest` 要限制在委托根内（防止匹配到根外）。

passive 监听器：`{passive: true}` 声明"不会调 preventDefault"——浏览器可不等 JS 执行直接滚动（touchstart/touchmove/wheel 在移动端 root 上默认 passive）；这是滚动性能优化的标准答案之一。

深挖：自定义事件 `new CustomEvent('x', {detail, bubbles: true})`；事件复用（合成事件池在 React 17 已废弃）；`once: true` 自动移除；`AbortSignal` 批量解绑（`addEventListener(..., {signal})`）。

---

### Q16：渲染流水线——重排、重绘与合成

像素流水线（像素管道）：`JS → Style → Layout（重排）→ Paint（重绘）→ Composite（合成）`。

- Layout/Reflow：计算几何（盒模型、位置、尺寸）。触发：改几何属性（width/height/margin/字体）、窗口 resize、读取布局信息（`offsetTop/getBoundingClientRect`——强制同步布局）。
- Paint：填充像素（颜色、阴影、边框、文字），按绘制记录（display list）在图层上栅格化。触发：改非几何外观（background、box-shadow）。
- Composite：把各图层位图交给合成线程变换（transform/opacity）后拼合——不触发布局与绘制。

性能优化三连：

1. 动画只用 `transform` 和 `opacity`（合成层属性，走 GPU 合成线程，主线程被阻塞也能动）；
2. 批量读写：先读后写，避免"读-写-读-写"交替导致的布局抖动（layout thrashing）；用 FastDOM 或 rAF 统一调度；
3. `contain: layout/paint` 限定重排重绘范围；`content-visibility: auto` 跳过屏外渲染。

合成层提升：`will-change: transform`、`translateZ(0)`、video、canvas 会创建独立合成层——层爆炸（过多层）反而耗内存与合成时间，需权衡。

深挖：`getBoundingClientRect` 在布局脏时会强制同步 reflow（读前 flush）；`document.fonts.ready`、滚动监听用 `IntersectionObserver` 替代（免布局读取 + 浏览器原生节流）；虚拟列表减少布局对象数量。

---

### Q17：MutationObserver / IntersectionObserver / ResizeObserver 三件套

MutationObserver：监听 DOM 子树变化（attributes/childList/characterData），回调是微任务（同批变化合并为一条记录数组）。应用：水印防篡改、嵌入第三方脚本后的 DOM 守卫、旧代码 hook 点。注意监听自身改动造成的死循环。

IntersectionObserver：异步计算目标与视口（或指定根）的交叉比例，回调是宏任务级（不交主线程布局强制同步）。应用：懒加载、无限滚动、曝光埋点、吸顶。`threshold` 数组可在多个比例点触发；`rootMargin` 预加载扩展区。比 scroll 监听 + getBoundingClientRect 优：无强制同步布局、浏览器内部节流。

ResizeObserver：元素盒尺寸变化回调（`contentRect` + `borderBoxSize`），在布局后绘制前触发。应用：响应式组件（容器查询出现前的方案）、canvas 尺寸跟随、文本溢出检测。回调内修改尺寸可能循环——浏览器报 "ResizeObserver loop completed with undelivered notifications"（降级非致命错误，React 事件里常见）。

对比记忆：DOM 结构变化 → Mutation；视口交叉 → Intersection；尺寸变化 → Resize。三者都替代了"轮询/scroll 监听"的老方案，是声明式 + 浏览器统一调度的范式。

---

### Q18：虚拟 DOM 与 Diff 算法的真实开销

VDOM 是什么：UI = f(state) 的轻量 JS 对象表示 + reconciliation（协调）+ 批量提交真实 DOM。

经典 Diff 三假设（React）：

1. 不同类型的元素 → 整棵子树替换（不复用）；
2. 同类型元素 → 保留 DOM 节点，只更新变化的属性；
3. 列表靠 key 匹配——索引当 key 在"中间插入/删除"时会导致错位复用（状态串位 + 多余移动）。

双端 Diff（Vue2）vs 两棵纤维树（React Fiber）：

- 双端：头头/尾尾/头尾/尾头四指针比较，未命中用 keyMap 找，常见移动场景比简单左到右更少 DOM 操作；
- Vue3 编译时优化：静态提升（hoist 静态节点跳过 diff）、PatchFlag（只 diff 标记的动态绑定）、Block Tree（按动态节点块 diff）——编译时信息把运行时 diff 成本压到最低；
- React Fiber：把递归 diff 拆成可中断的时间切片单元（requestIdleCallback 思想），配合优先级调度（并发特性）。

真实开销与反思：VDOM 不是"快"而是"够快 + 可维护 + 跨平台"；Svelte/SolidJS 证明编译时定位更新可以零运行时 diff；信号（signals）细粒度更新正在侵蚀 VDOM 的领地。

深挖：批量更新（`flushSync` 之外的自动批处理）；`key` 只影响兄弟间匹配；Fragment 的 key；SSR hydrate 时 diff 的首屏特殊路径。

---

### Q19：Shadow DOM 与样式隔离

核心概念：`el.attachShadow({mode: 'open'|'closed'})` 创建独立的 DOM 子树（shadow tree），挂载点是 shadow host；内部样式/ID 不外泄，外部样式不渗入（除 CSS 自定义属性与 `::part`）。

关键机制：

- 插槽（slot）：`<slot name="x">` 把 light DOM 子节点投影到 shadow 树指定位置——分布（distribution）不改变真实 DOM 结构，`slot.assignedNodes()` 可拿到投影节点；
- 事件重定向（retargeting）：事件穿过 shadow 边界时 `target` 被改写为 host（外部看事件来自组件整体）；`composed: true` 的事件才能穿透 shadow 边界冒泡出去；`e.composedPath()` 拿完整路径；
- 样式互通白名单：CSS 变量穿透、`:host` / `:host(.active)` 选择器、`::slotted()` 选中插槽内容（只能选直接子节点）、`::part()` 显式导出内部部件；
- closed 模式：`el.shadowRoot` 返回 null——只是"藏起来"不是真安全（可劫持 attachShadow）。

应用与权衡：Web Components 三件套（customElements + shadow DOM + template）；微前端样式隔离方案之一；缺点：SSR 困难（Declarative Shadow DOM 解决）、表单关联需 `ElementInternals`、跨根选择器失效使主题系统复杂化。

---

### Q20：大型列表渲染优化

问题：10 万行数据全量渲染 → DOM 节点爆炸（内存 + 布局/绘制成本 O(n)），首屏卡死。

方案矩阵：

1. 虚拟滚动（windowing）：只渲染视口 ± overscan 的行；固定行高用数学换算（`scrollTop / rowHeight` 求起始下标），动态行高需测量缓存 + 预估回填（react-virtuoso）；关键点：用 `transform: translateY` 定位窗口容器而非 padding（减少布局计算），滚动事件用 rAF 节流；
2. 时间切片：分帧创建节点（rAF/requestIdleCallback 每帧插入一批）——治标不治本（最终仍是 10 万节点）；
3. 分页/无限滚动：IntersectionObserver 哨兵元素触发加载（Q17）；
4. content-visibility: auto + `contain-intrinsic-size`：浏览器级跳过屏外渲染，零 JS；
5. Canvas/DOM 混合：超大数据网格（如 luckysheet）用 canvas 绘制 + 只保留一个编辑态 input。

深挖：虚拟滚动的焦点/选中状态必须存数据层而非 DOM（节点会被回收）；反向无限滚动（聊天记录）的锚定（scroll anchoring）；行高突变时的滚动跳动修正。

---

## 三、BOM

### Q21：History API 与前端路由

hash 路由：`location.hash` 变化不触发请求，`hashchange` 事件监听——兼容性好、服务端零配置；缺点：SEO 差（`#` 后内容不发送给服务端）、锚点语义冲突。

history 路由：

- `history.pushState(state, '', url)` / `replaceState`：改变 URL 不发请求、不触发 `popstate`（主动调用不触发！）；
- `popstate` 只在前进/后退/hash 变化时触发——所以前端路由要拦截 `<a>` 点击 + 监听 popstate 双管齐下；
- state 对象随历史条目存取（`history.state`），大小有限（640KB 级）；
- 服务端必须配回退：任意深层路径都返回 index.html，否则刷新 404。

深挖：`history.length`、导航 API（Navigation API，`navigation.navigate()`，统一拦截所有导航的新提案）；单页应用内存泄漏（路由切换未清理监听器/定时器）；`scrollRestoration = 'manual'` 自定义滚动恢复。

---

### Q22：浏览器存储全家族对比

| 维度     | Cookie                          | localStorage   | sessionStorage | IndexedDB         | Cache Storage            |
| -------- | ------------------------------- | -------------- | -------------- | ----------------- | ------------------------ |
| 容量     | ~4KB                            | 5-10MB         | 5-10MB         | 数百 MB（受配额） | 受配额                   |
| 发送     | 每次请求自动携带（受 SameSite） | 手动           | 手动           | 手动              | 手动                     |
| 生命周期 | expires/Max-Age                 | 永久（手动清） | 标签页会话     | 永久              | 永久                     |
| 作用域   | 域名+路径                       | 源             | 源 + 标签页    | 源                | 源                       |
| API      | 字符串拼接                      | 同步 KV        | 同步 KV        | 异步事务型        | 异步（Request→Response） |
| 线程     | 主线程                          | 主线程         | 主线程         | Worker 可用       | Worker/SW 可用           |

深挖点：

- Cookie 属性：`HttpOnly`（防 XSS 偷取）、`Secure`、`SameSite=Lax/Strict/None`（CSRF 防线，None 必须 Secure）、`Domain/Path` 作用域（子域共享）、`Partitioned`（CHIPS，第三方 Cookie 替代品）；
- localStorage 同步阻塞主线程、只能存字符串（大对象序列化开销）、无过期机制（自己包一层 `{value, expires}`）；
- sessionStorage 复制标签页时会拷贝一份后独立演化；
- IndexedDB：事务（readonly/readwrite）、索引（index）、游标、keyPath；封装库 localForage/idb；存储配额 `navigator.storage.estimate()`、`persist()` 申请持久化；
- 隐私模式/用户清数据时各存储的降级策略；存储事件 `storage`（其他标签页变更时触发——跨标签页同步状态的手段）。

---

### Q23：跨窗口与跨标签通信

1. `postMessage`：`targetWindow.postMessage(data, targetOrigin, [transfer])`——跨源窗口/iframe 通信的标准方式；接收端必须校验 `event.origin` 与 `event.source`；数据走结构化克隆（可 Transferable 零拷贝转移 ArrayBuffer/MessagePort）；`MessageChannel` 建立双向管道。
2. BroadcastChannel：同源下所有上下文（标签页/iframe/worker）的发布订阅频道，`bc.postMessage` 广播——简单但无持久、无对方存活确认。
3. localStorage + storage 事件：写值即广播（其他标签页收到事件）——可做"跨页状态同步 + 领导者选举"。
4. SharedWorker：同源共享的 worker，页面通过 `port` 连入，天然共享内存态（需自己管理连接生命周期）。
5. ServiceWorker：作为同源页面间的消息中枢 + 离线缓存代理。
6. Web Locks API：跨标签页互斥锁（`navigator.locks.request`）。

应用场景：多标签页单点登录态同步（A 页登录 → 广播 token 失效/刷新）、编辑冲突检测（同一文档只能一页编辑）、跨窗口拖拽。

---

### Q24：requestAnimationFrame 与 requestIdleCallback

rAF（详见题目 15/16）：

- 回调在下一帧渲染前执行，与 VSYNC 对齐；回调参数是该帧时间戳（同一帧内所有回调共享同一值）；
- 视觉更新（动画/滚动驱动效果）的标准入口：在 rAF 里改样式，当帧生效；
- 后台标签页暂停 → 动画计时要用时间戳差值而非帧计数；
- rAF 内注册的 rAF 排入下一帧（防同帧递归）。

rIC（requestIdleCallback）：

- 在帧的空闲时间（渲染完成后到下一帧开始前的剩余）执行；回调参数 `deadline.timeRemaining()`（本帧剩余毫秒）与 `deadline.didTimeout`；
- 必须传 `{timeout}` 兜底（空闲可能永远不来）——到点强制执行；
- 用途：日志上报、预加载、低优先级计算、React 时间切片的灵感来源（React 后来自实现 scheduler，因 rIC 频率不可控）；
- Safari 长期不支持（需 setTimeout polyfill）。

帧内时序总结：`rAF 回调 → JS 微任务 → Style/Layout/Paint → Composite → （空闲）rIC`。

---

### Q25：location / navigator / screen 高频考点

location：`href/protocol/host(hostname:port)/pathname/search/hash`；`assign`（产生历史记录）vs `replace`（不产生）vs `reload`；`URL`/`URLSearchParams` 现代解析 API（`new URL(url, base)`、参数增删改、批量解析 query）；`location.search` 解析的手写题（注意 `+` 与 `%20`、重复键、无值键）。

navigator：`userAgent`（客户端检测的不可靠性——UA 可伪造，特性检测优先，UA Client Hints 是新方向）；`onLine` + `online/offline` 事件（只判断有网卡连接，不代表能通外网）；`connection`（effectiveType/saveData，弱网降级）；`sendBeacon(url, data)`——页面卸载时可靠上报（fetch 在 beforeunload 里会被取消，beacon 由浏览器代理发送，POST + 小数据量）；`clipboard`（需 HTTPS + 用户手势）；`geolocation`、`mediaDevices`、`serviceWorker`、`hardwareConcurrency`（worker 池大小参考）、`deviceMemory`。

screen/window 度量：`innerWidth/Height`（含滚动条的视口）、`outerWidth`、`screen.width`（物理屏）、`devicePixelRatio`（高清适配、`matchMedia('(resolution: 2dppx)')`）、`visualViewport`（移动端 pinch zoom 后的可视区域）、`screen.orientation`。

深挖：`window.open` 的 noopener（新页拿到 `window.opener` 可跳转源页——tabnabbing 钓鱼）；`name` 属性的跨页持久（安全漏洞史）；`getComputedStyle` 与 BOM 的交叉。

---

## 四、浏览器原理

### Q26：从输入 URL 到页面展示的完整过程

1. 导航准备：输入解析（搜索词 vs URL）→ HSTS 预加载列表检查（强制 https）→ Service Worker 拦截检查（`navigation preload`）。

2. 网络阶段：

- DNS 解析：浏览器缓存 → 系统缓存（hosts）→ 本地 DNS 服务器（递归）→ 根/顶级域/权威 DNS（迭代）；`dns-prefetch` 提前解析；
- TCP 连接：三次握手（Q34）；HTTPS 加 TLS 握手（Q35）；连接复用（HTTP/1.1 keep-alive、HTTP/2 多路复用同一连接）；
- 发送请求：携带 Cookie/缓存校验头 → 服务端处理 → 返回响应；
- 缓存判定（Q29）在发请求前先查强缓存。

3. 响应处理：浏览器进程的网络线程接收 → MIME 嗅探判定渲染还是下载 → 渲染进程接管（提交导航 commit）；`X-Content-Type-Options: nosniff`、CSP 校验。

4. 渲染进程解析：

- DOM 构建：HTML 字节 → 字符 → Token → Node → DOM 树（增量解析，边下边解析）；
- 阻塞点：同步 `<script>` 阻塞解析（JS 可读 DOM/写 document.write）→ `defer`（解析完按序执行，DOMContentLoaded 前）/ `async`（下载完立即执行，顺序不定）/ `type=module`（默认 defer 语义）；
- CSS 是渲染阻塞资源：CSSOM 不完备不渲染（防 FOUC）；但 CSS 不阻塞 DOM 解析，只阻塞渲染与后续脚本执行（脚本可能读样式）；
- `preload/prefetch/preconnect` 资源优先级干预。

5. 渲染流水线：DOM + CSSOM → Render Tree（不可见节点剔除）→ Layout → 分层（Layer）→ Paint（绘制记录）→ 栅格化（GPU/瓦片）→ Composite 合成上屏。

6. 首屏时机事件：`DOMContentLoaded`（DOM 解析完，不等问题资源）→ `load`（全部资源完）；FP/FCP/LCP 指标（Q33）。

---

### Q27：Chrome 多进程架构与站点隔离

进程模型：

- 浏览器进程：UI、地址栏、书签、网络栈调度；
- 渲染进程（Blink + V8）：默认"每站点实例"一个进程——主线程（JS/渲染）、合成线程、栅格线程、worker 线程；
- GPU 进程：统一处理 GPU 指令（多渲染进程共享）；
- 网络服务进程、存储进程、音频进程等（服务化架构 Servicification）；
- 插件进程。

站点隔离（Site Isolation）：跨站 iframe 放入不同渲染进程——Spectre 漏洞的根治方案（不同站点数据不在同一进程地址空间，侧信道读不到）；代价是内存占用上涨 ~10%。

线程协作（渲染进程内）：

- 主线程：JS、样式、布局、绘制记录；
- 合成线程（compositor）：接收输入事件（滚动/触摸）——命中"非快速滚动区域"才转发主线程（这就是 passive listener 的意义）；维护图层树、提交栅格任务；
- 栅格线程池：把图层分瓦片栅格化为位图（GPU 光栅化）。

输入事件到上屏：合成线程命中测试 → 需要主线程则派发事件 → JS 执行 → 渲染流水线 → 合成新帧。主线程卡顿 = 输入无响应（INP 指标的来源）。

深挖：iframe 与 top 的跨进程通信（postMessage 序列化成本）；`process-per-tab` 旧模型 vs site-per-process；Android WebView 的进程模型差异。

---

### Q28：关键渲染路径与合成层提升

CRP（Critical Rendering Path）优化清单：

- 关键资源数 ↓：内联首屏 CSS（critical CSS）、异步/延迟非关键 CSS（`media` 属性 hack、`rel=preload` + onload 切 stylesheet）；
- 关键路径长度 ↓：JS 加 `defer`，HTTP/2 Server Push（已废弃）→ 103 Early Hints 替代；
- 关键字节数 ↓：压缩（brotli）、tree-shaking、代码分割。

合成层（GraphicsLayer）判定：

- 3D transform（`translateZ(0)`）、`will-change: transform/opacity`、`<video>/<canvas>/<iframe>`、`position: fixed`（部分场景）、`filter`、有合成层后代重叠 + `z-index` 等；
- 提升收益：该层独立位图，transform/opacity 动画只动合成（主线程空闲也能跑）；
- 代价：每层占内存（位图 = 宽×高×4 字节），层间重叠重绘（层爆炸）——只在确定会动的元素上提升。

深挖：`overflow: scroll` 与滚动容器层的栅格；`contain` 与 `content-visibility` 对布局树剪枝；`will-change` 用完即删（动态添加/移除）。

---

### Q29：浏览器缓存体系——强缓存、协商缓存与启发式缓存

判定流程：请求前先查强缓存 → 未命中发请求带协商缓存校验头 → 304 复用 / 200 更新。

强缓存（不发请求）：

- `Cache-Control: max-age=3600`（HTTP/1.1，优先级高）；`Expires`（HTTP/1.0 绝对时间，受本地时钟影响）；
- 关键指令：`no-cache`（不是不缓存——是每次必须协商）、`no-store`（真不缓存）、`public/private`、`immutable`（内容永不变，刷新也不重验证）、`must-revalidate`、`s-maxage`（共享缓存/CDN 专用）；
- 命中来源：memory cache（当前会话，最快）→ disk cache → Service Worker（优先级可被 fetch 事件接管）。

协商缓存（发请求带条件）：

- `If-Modified-Since` / `Last-Modified`：秒级精度——文件内容变了但秒级时间戳未变会误判，且服务器可能只是 touch 了文件；
- `If-None-Match` / `ETag`：内容哈希（强 ETag）或边界语义（弱 ETag `W/`），优先级更高；
- 命中返回 `304 Not Modified`（无 body）。

启发式缓存：响应无任何缓存头时，浏览器按 `(Date - Last-Modified) × 10%` 估算新鲜期。

工程实践：

- HTML：`no-cache`（每次协商，保证拿到最新引用清单）；静态资源：内容哈希文件名 + `max-age=31536000, immutable`；
- 更新策略：改 HTML 引用的 hash 文件名 → 缓存雪崩问题（一次发布全部失效 → 用稳定 hash + 分包）；
- `Stale-While-Revalidate`：先用旧缓存渲染，后台更新；
- 浏览器回退/前进缓存（bfcache）：页面整体冻结进内存——`Cache-Control: no-store`、未处理的 `pagehide` 会破坏 bfcache。

---

### Q30：跨域与 CORS 预检的完整细节

同源策略：协议 + 域名 + 端口三者一致；限制的是"读取响应"（请求多数能发出，响应被浏览器拦截）与 DOM 跨窗访问、存储隔离。

CORS 两类请求：

- 简单请求（GET/HEAD/POST + 限定头部 + `Content-Type` 仅限 `text/plain` / `multipart/form-data` / `application/x-www-form-urlencoded` 三种）：直接发出，响应带 `Access-Control-Allow-Origin` 匹配则放行；
- 非简单请求（PUT/DELETE、自定义头、`application/json`）：先发 OPTIONS 预检——询问 `Access-Control-Request-Method/Headers`，服务端应答 `Allow-Origin/Allow-Methods/Allow-Headers/Max-Age`（预检结果可缓存 `Max-Age` 秒）；预检通过才发真实请求。

凭证（Cookie）跨域：`fetch(url, {credentials: 'include'})` / XHR `withCredentials = true` 时：

- 服务端 `Allow-Origin` 不能是 `*`，必须是具体源；
- 还需 `Access-Control-Allow-Credentials: true`；
- Cookie 本身要 `SameSite=None; Secure`（Chrome 80+ 默认 Lax）。

其他跨域手段（历史与现状）：

- JSONP（`<script>` 无跨域限制，只支持 GET，CSP 下受限，安全隐患）；
- `document.domain` 降域（已废弃）；`window.name`；`postMessage`（合法跨窗通信，Q23）；
- Nginx/网关反向代理（同源化）；CORS Anywhere 类代理。

安全边界新头：`Cross-Origin-Embedder-Policy: require-corp`（COEP，配合 COOP 达成 crossOriginIsolated → 解锁 SharedArrayBuffer/高精度计时）；`Cross-Origin-Opener-Policy`（切断 window.opener）；`Cross-Origin-Resource-Policy`（CORP，声明资源可被哪些源加载）；CORB（浏览器自动拦截敏感 MIME 的跨源读取）。

---

### Q31：前端安全——XSS / CSRF / CSP / 点击劫持

XSS（跨站脚本）：

- 类型：存储型（入库后人人中招）、反射型（URL 参数回显）、DOM 型（纯前端注入，`innerHTML = location.hash` 之类）；
- 攻击载荷：`<script>`、事件属性 `onerror=`、`<svg onload>`、javascript: 伪协议、模板表达式注入；
- 防御：输出编码（HTML 实体/JS 转义/URL 编码，按上下文区分）、`textContent` 替代 `innerHTML`、富文本用 DOMPurify 白名单过滤、Cookie `HttpOnly`（抬高窃取门槛）、CSP（纵深防御）。

CSP（内容安全策略）：`Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-xxx'`——

- 禁内联脚本/样式（nonce 或 hash 白名单例外）、禁 `eval`（`'unsafe-eval'` 才放行）；
- `report-uri / report-to` 上报违规（先 `Content-Security-Policy-Report-Only` 灰度）；
- 指令速查：`script-src/style-src/img-src/connect-src/frame-ancestors/base-uri/form-action`。

CSRF（跨站请求伪造）：利用浏览器自动带 Cookie → 防御组合拳：`SameSite` Cookie（Lax 默认已挡大部分跨站 POST）、CSRF Token（服务端签发，表单/头携带，攻击者读不到）、`Origin/Referer` 校验、关键操作二次验证（密码/验证码）；注意 GET 不应有副作用。

点击劫持：透明 iframe 覆盖诱导点击 → `X-Frame-Options: DENY/SAMEORIGIN`（老）或 CSP `frame-ancestors`（新）；前端 `frame busting`（`top.location !== self.location` 则跳出——但可被 `sandbox` 反制）。

其他：`subresource integrity`（SRI，CDN 资源哈希校验）；`Trusted Types`（强制 DOM sink 过类型化过滤，治 DOM XSS 的新 API）；中间人/运营商劫持（全站 HTTPS + HSTS）；`target="_blank"` 必须 `rel="noopener noreferrer"`。

---

### Q32：Web Worker / Service Worker / PWA 离线方案

Web Worker：

- 独立线程（无 DOM/BOM 访问，有 `self/importScripts/fetch/IndexedDB`）；
- 通信：`postMessage` 结构化克隆（拷贝成本 ~ms/MB），Transferable（`[buffer]` 转移所有权，零拷贝但原侧失效）；`SharedArrayBuffer` + `Atomics` 真共享内存（需 crossOriginIsolated）；
- 场景：大数据计算（解析/加密/压缩）、Canvas 离屏渲染（`OffscreenCanvas`）、WebAssembly 计算核；
- 生命周期：`terminate()` 或 `self.close()`；注意脚本错误静默——监听 `error/messageerror`。

Service Worker（PWA 核心）：

- 可编程网络代理：注册（需 HTTPS）→ install（预缓存）→ activate（清理旧缓存 + `clients.claim()`）→ 拦截同源 fetch 事件；
- 生命周期陷阱：SW 更新需等旧版控制页面全关闭（`skipWaiting` 强制）；页面首次加载不受 SW 控制（除非 claim）；
- 缓存策略：Cache First（静态资源）、Network First（API + 超时回退）、Stale-While-Revalidate（体验最优）、Network Only（支付等）；
- 与页面通信：`postMessage` / BroadcastChannel；后台同步（Background Sync）与推送（Push API）。

PWA 清单：manifest（`display: standalone`）+ SW 离线壳 + 安装提示（`beforeinstallprompt`）；iOS 的诸多限制（无 push、存储驱逐）。

深挖：Workbox 的策略模块化；SW 中无法访问 DOM/localStorage（异步 API 为主）；`navigator.serviceWorker.controller` 判定受控状态；版本灰度与强制刷新协议（页面收到新 SW → toast 用户刷新）。

---

### Q33：Web 性能指标体系与优化手段

Core Web Vitals（Google 排名因子）：

| 指标                          | 含义                 | 良好线 | 测量/优化                                                                                                      |
| ----------------------------- | -------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| LCP（最大内容绘制）           | 视口最大元素渲染完成 | ≤2.5s  | 预加载 LCP 图、CDN、brotli、去渲染阻塞、图片尺寸/优先级（`fetchpriority=high`）                                |
| INP（交互到下一帧，取代 FID） | 全交互的 P98 延迟    | ≤200ms | 长任务拆分（`scheduler.yield`）、事件回调瘦身、输入与渲染分离、Web Worker                                      |
| CLS（累计布局偏移）           | 意外位移量           | ≤0.1   | 图片/视频写死宽高（`aspect-ratio`）、字体 `font-display: swap` + size-adjust、广告位预留、不在已有内容上方插入 |

其他指标：FP/FCP（首次绘制/内容）、TTFB（首字节，受 DNS/TCP/TLS/服务端影响）、TTI（可交互）、TBT（总阻塞时间，实验室版 INP 代理）、Speed Index。

测量工具：Lab（Lighthouse/WebPageTest/Chrome DevTools Performance 面板——火焰图读长任务、布局抖动紫色块）vs Field（CrUX、`web-vitals` 库上报 RUM）。

优化方法论：

1. 加载：分包 + 路由级懒加载、tree-shaking、压缩、HTTP/2 或 /3、preload 关键资源、SSR/SSG/Streaming SSR；
2. 渲染：骨架屏、虚拟列表、CSS containment、合成层动画；
3. 运行时：防抖节流、memo、Web Worker 卸载重计算、避免强制同步布局；
4. 网络：HTTP 缓存策略、SWR、CDN 边缘、Early Hints；
5. 度量闭环：RUM 上报 → 分位数（P75/P95）看板 → 回归告警。

深挖：Long Tasks API / `PerformanceObserver('longtask')`；`LargestContentfulPaint` 元素判定规则（background-image 也算）；INP 的三段拆解（输入延迟 + 处理时长 + 呈现延迟）。

---

## 五、网络

### Q34：TCP 三次握手与四次挥手的每一个"为什么"

三次握手：`SYN(x) → SYN+ACK(y, x+1) → ACK(y+1)`。

- 为什么不是两次：要确认双方的"收发能力"——第二次证明服务端能收+发，第三次让服务端确认客户端能收；两次时服务端无法确认客户端收到了自己的 SYN（历史连接请求滞留会让服务端空等，浪费资源）；
- 为什么不是四次：SYN 与 ACK 可合并（第二次）；
- 序列号随机化：防历史连接的旧报文混淆 + 防伪造。

四次挥手：`FIN → ACK → FIN → ACK`（被动方 ACK 与 FIN 分开发，因为可能还有数据没发完——半关闭）。

- TIME_WAIT（2MSL）：主动关闭方等待 2 倍最大报文寿命——① 确保最后一个 ACK 丢失时能重传（被动方超时重发 FIN）；② 让本连接的旧报文在网络中消亡，避免串到下一个同四元组连接；
- 挥手为什么是四次而握手三次：TCP 全双工，两个方向需各自关闭；被动方收到 FIN 先回 ACK（还能继续发数据），应用层关闭后才发自己的 FIN。

高频补充：SYN Flood 攻击与 `syn_cookies` 防御；`tcp_tw_reuse`、高并发短连接下 TIME_WAIT 耗尽端口；TCP 可靠性的四大件：序列号+ACK、超时重传、流量控制（滑动窗口 rwnd）、拥塞控制（慢启动/拥塞避免/快重传/快恢复，cwnd）；Nagle 与延迟 ACK 的交互（`TCP_NODELAY` 对实时性业务的意义）。

---

### Q35：TLS 握手全过程（1.2 vs 1.3）

TLS 1.2（2-RTT）：

1. `ClientHello`：支持的 TLS 版本、加密套件列表、客户端随机数、SNI（虚拟主机证书选择）；
2. `ServerHello`：选定套件、服务端随机数 + 证书链；
3. 客户端验证证书（Q37）→ 生成 Pre-Master Secret，用证书公钥（RSA）或服务端 DH 参数（ECDHE）加密/协商 → `ChangeCipherSpec`；
4. 双方用 `client_random + server_random + pre_master` 派生会话密钥（对称）→ `Finished` 互验握手完整性。

TLS 1.3（1-RTT）：

- ClientHello 直接携带密钥共享（key_share，猜服务端会选的 ECDHE 曲线）→ 服务端一次往返即完成密钥协商；
- 废弃 RSA 密钥交换（前向保密强制 DHE/ECDHE）、废弃弱套件（RC4/3DES/SHA1）；
- 0-RTT（会话恢复 + early data）：重复访问时首个请求即可带数据——但有重放攻击风险（只放幂等请求）。

要点：证书只用于身份认证，密钥靠非对称/DH 协商出对称密钥（性能）；ECDHE 提供前向保密（长期私钥泄露不影响历史会话）；SNI/ESNI/ECH（加密 ClientHello 演进）。

---

### Q36：HTTP/1.1 → HTTP/2 → HTTP/3 的演进逻辑

HTTP/1.1：

- keep-alive 长连接复用、pipelining（队头阻塞严重，实际被禁用）；
- 浏览器对单域名 6-8 个并发 TCP → 催生域名分片、雪碧图、资源内联等" workaround 优化"。

HTTP/2：

- 二进制分帧：请求/响应拆成带流 ID 的帧，多路复用单连接（应用层解决队头阻塞）；
- HPACK 头部压缩（静态表 + 动态表 + Huffman）；
- 流优先级（weight/依赖树）、Server Push（推送缓存外的资源——实践鸡肋，Chrome 已移除）；
- 遗留问题：TCP 层队头阻塞依旧（一个丢包卡住所有流）、连接迁移差（IP 变则断）。

HTTP/3（基于 QUIC，跑在 UDP 上）：

- QUIC 把"可靠传输 + 多路复用 + TLS1.3"下沉到传输层：流独立——丢包只阻塞对应流；
- 连接迁移：Connection ID 标识连接（而非四元组），Wi-Fi 切 4G 不断连；
- 0-RTT/1-RTT 建连（TLS 内嵌）；
- 用户态实现 → 迭代快（不依赖内核）；QPACK 解决 HPACK 在丢包下的死锁。

面试口径：应用层队头阻塞（H1）→ 帧多路复用（H2）→ 传输层流独立（H3）；识别方式：DevTools Protocol 列 `h2/h3`、服务端 `Alt-Svc` 头通告 H3。

---

### Q37：HTTPS 证书链校验与中间人攻击

证书体系：服务器证书 ← 中间 CA 签发 ← 根 CA 签发（根证书预置在 OS/浏览器信任库）。校验链：① 逐层验证签名（用上级公钥验下级证书签名）直到受信根；② 域名匹配（CN/SAN，通配符只匹配一级）；③ 有效期；④ 吊销状态（CRL/OCSP/OCSP Stapling）；⑤ 证书透明度（CT Log，防误签发）。

中间人攻击（MITM）为何失败：攻击者没有受信 CA 私钥 → 无法伪造能通过链式验证的证书；自签证书触发浏览器强警告（HSTS 站点甚至无法跳过）。

真实攻击面：用户无视警告继续访问；企业代理/抓包工具（Fiddler/Charles）通过向系统信任库安装自签根证书合法 MITM；早期 SSLStrip（降级到 HTTP）→ HSTS（`Strict-Transport-Security`，含 preload 列表内置于浏览器）根治。

证书 pinning：App 内固化服务端证书/公钥指纹，绕开系统信任库防代理——代价是换证书必须发版。

---

### Q38：DNS 解析全过程与优化

解析链：浏览器 DNS 缓存 → OS 缓存（`getaddrinfo`，hosts 文件优先）→ 本地递归解析器（运营商/公共 DNS，递归：它替你问到底）→ 根服务器（`.`, 返回顶级域 NS）→ 顶级域（`.com` NS）→ 权威 NS（返回 A/AAAA 记录）（后三步是迭代）。

记录类型：A / AAAA / CNAME（别名，链式解析）/ MX / TXT（SPF、域名所有权验证）/ NS / SRV / CAA（限定可签发 CA）。

TTL 与缓存：每级缓存遵守 TTL；TTL 短利于故障切换，长利于解析速度。

前端优化：

- `dns-prefetch`（提前解析第三方域）、`preconnect`（解析 + TCP + TLS 全做完）；
- HTTPDNS：App 内绕过运营商 LocalDNS 防劫持/防跨网调度（返回最优 IP）；
- 域名收敛（减少第三方域数量，与 H1 时代的域名分片相反——H2 多路复用下分片反而有害）；
- CDN 的智能调度本质：权威 DNS 按来源 IP/运营商返回最近边缘节点。

深挖：DNS over HTTPS/TLS（DoH/DoT 防窃听劫持）；ECS（EDNS Client Subnet 让权威端拿到用户子网做精准调度）；DNS 负载均衡与故障转移的局限（TTL 期内切不动）。

---

### Q39：WebSocket / SSE / WebTransport 选型

| 维度     | WebSocket                   | SSE（EventSource）               | WebTransport                 |
| -------- | --------------------------- | -------------------------------- | ---------------------------- |
| 方向     | 全双工                      | 服务端 → 客户端单向              | 全双工 + 多流                |
| 协议     | ws/wss，独立握手（Upgrade） | HTTP 长连接（text/event-stream） | HTTP/3（QUIC）               |
| 数据     | 文本/二进制帧               | 纯文本（UTF-8）                  | 数据报（不可靠）+ 流（可靠） |
| 断线重连 | 需自实现                    | 自带（retry + Last-Event-ID）    | 会话级恢复                   |
| 连接数   | H1.1 下受 6 连接限制小      | 同域 6 连接占满（H1.1 下致命）   | 单 QUIC 连接多流             |
| 代理穿透 | 部分企业代理掐 Upgrade      | 天然过 HTTP 代理                 | UDP 可能被 QoS/封禁          |

WebSocket 深挖：握手（`Upgrade: websocket` + `Sec-WebSocket-Key/Accept` 的 SHA-1 魔数校验）、帧格式（FIN/opcode/mask——客户端帧必须掩码）、ping/pong 心跳（NAT 超时保活）、子协议（`Sec-WebSocket-Protocol`，如 STOMP/MQTT）、背压（`bufferedAmount`）。

SSE 深挖：格式（`data:/event:/id:/retry:` 字段）、`Last-Event-ID` 续传、文本换行拆条；适合通知/行情/日志流——别拿它传二进制。

选型口径：聊天/协作 → WS；股票推送/通知 → SSE（简单可靠）；游戏/音视频会议低延迟 → WebTransport（QUIC 数据报）。

---

### Q40：HTTP 状态码与方法语义深挖

方法语义三属性：

- 安全（safe，不改资源）：GET/HEAD/OPTIONS；
- 幂等（重复执行效果相同）：GET/PUT/DELETE/HEAD——POST 不幂等（重复下单！前端防重：提交后禁用按钮 + 幂等键 `Idempotency-Key`）；
- 可缓存：GET/HEAD。

PUT vs PATCH vs POST：PUT 整体替换（幂等）；PATCH 部分更新（RFC 5789，未必幂等）；POST 创建/动作。

状态码深挖：

- 301 vs 302 vs 307 vs 308：301 永久（浏览器缓存跳转！改不回来要清缓存）、302 临时（POST 可能变 GET 的历史歧义）→ 307/308 明确保持方法不变；
- 304：协商缓存命中；
- 401 vs 403 vs 407：未认证（带 WWW-Authenticate）vs 已认证但无权 vs 代理认证；
- 409（资源冲突，版本控制）、410（永久删除）、412（前置条件失败，If-Match）；
- 413/414/431（body/URI/头太大）；
- 418（彩蛋）；422（语义错误，REST 参数校验常用）；
- 429（限流，配合 `Retry-After`）；
- 502/503/504：网关收到无效响应 / 服务不可用（可 `Retry-After`）/ 网关超时——三者排查路径不同；
- 103 Early Hints：最终响应前先发 Link 头让浏览器预加载（取代 Server Push）。

深挖：`Content-Disposition`（下载文件名 filename\*=UTF-8''）；`Range` 请求（断点续传 206 + `Accept-Ranges`）；`Vary` 头对缓存键的影响（`Vary: Accept-Encoding`）。

---

### Q41：队头阻塞在每一层的表现与解法

1. HTTP/1.1 应用层：同一连接请求必须串行应答 → pipelining 废弃 → 浏览器开 6 连接 + 域名分片（治标）；
2. HTTP/2：帧多路复用解决应用层 → 但 TCP 层队头阻塞暴露：一个 segment 丢失，其后的所有流（即使属于别的请求）都得等重传（TCP 按序交付）；
3. HTTP/3 + QUIC：流级独立可靠传输——丢包只阻塞对应流；
4. TCP 内部的拥塞控制：慢启动使新连接吞吐爬坡慢 → 连接复用/`preconnect`/QUIC 0-RTT；
5. 服务端：PHP-FPM worker 池、Node 单线程被 CPU 任务卡住的"事件循环阻塞"（本质也是队头阻塞）→ cluster/Worker threads；
6. 浏览器渲染层：同步脚本阻塞解析（另一种队头阻塞）→ defer/async/模块。

统一视角：串行依赖 + 共享队列 = 队头阻塞；解法永远是分流（多连接/多流）、乱序交付（QUIC）、或提前（preload/preconnect）。

---

### Q42：fetch 与 XHR 的细节对比

fetch 的坑（高频）：

- HTTP 错误状态不 reject：404/500 照常 resolve，要检查 `response.ok` 或 `status`——只有网络故障/CORS/DNS 失败才 reject；
- 凭证策略：fetch 默认 `credentials: 'same-origin'`（同源请求带 Cookie，跨源不带），跨源要带 Cookie 需显式 `credentials: 'include'`；早期规范默认值是 `omit`，"fetch 默认完全不带 Cookie"是过时说法；
- 无原生超时：用 `AbortController` + setTimeout 自实现；
- 无上传进度（`ReadableStream` 只有下载进度；上传进度要用 XHR 或 `duplex: 'half'` 流式 body）；
- 响应体只能读一次（`bodyUsed`，`clone()` 备份）。

AbortController（现代取消模型）：

```js
const ctrl = new AbortController();
fetch(url, { signal: ctrl.signal });
ctrl.abort(); // fetch reject: AbortError；同时中止 TCP 读取
```

同一 signal 可传给多个 fetch/addEventListener——统一取消域；`AbortSignal.timeout(5000)`、`AbortSignal.any([...])` 组合信号。

流式能力：`response.body.getReader()` 逐块读取（SSE 客户端、大文件边下边处理、`for await` 消费）；`request body` 传 `ReadableStream` 需 `duplex: 'half'`。

XHR 尚存的场景：上传进度事件（`xhr.upload.onprogress`）、同步请求（`async: false`，已废弃勿用）、老环境兼容。

深挖：`keepalive: true`（页面卸载时小数据上报，beacon 的 fetch 版）；`redirect: 'manual'` 观察重定向；`referrerPolicy` 控制 Referer 泄漏；`cache` 选项与 HTTP 缓存的互动；Node 18+ 全局 fetch（undici）与浏览器实现的差异（无 CORS、有连接池配置）。

---

## 附录：学习路径建议

1. 手写优先：第一部分的 33 题务必脱离答案手写一遍，重点题目 1/4/6/7/13/14/20/23/31——这些是"手写八股"出现率最高的；
2. 规范意识：回答时引用 Promise/A+、HTML 事件循环、TC39 提案阶段，显著加分；
3. 连成网络：闭包 → 事件循环 → Promise → async 编译产物；原型链 → class 字段时序 → V8 隐藏类；缓存 → 渲染 → 性能指标——面试官追问的正是这些连接线。

> 本文档基于 `src/js` 全部 33 个源码文件编排，建议结合源码逐题实践。
