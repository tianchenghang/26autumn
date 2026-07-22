type OrderStatus = "pending" | "success" | "failure";

declare function fetchStatus(orderId: string): Promise<OrderStatus>;

// 状态变为 "success" 或 "failure" 时, resolve 对应值
// 首次立刻发送请求, 每次请求完成后, 等待 interval ms 后发送下一次请求
// 任何时刻最多只有一个在途请求
// 某次 fetchStatus 异常 (reject) 视为无结果的探测, 继续轮询
// 超时使用「软截止」: 如果超时 timeout ms, 并且状态是 "pending", 则 `reject(new Error("timeout"))

function pollOrderStatus(
  orderId: string,
  {
    interval,
    timeout,
  }: {
    interval: number;
    timeout: number;
  },
) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const startTime = Date.now();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = (cb: (value?: unknown) => void) => {
      if (!settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      cb();
    };

    const poll = async () => {
      try {
        if (settled) {
          return;
        }
        const status = await fetchStatus(orderId);
        if (status !== "pending") {
          settle(() => resolve(status));
          return;
        }
      } catch (err) {
        if (settled) {
          return;
        }
      }

      // status === "pending" || err !== undefined
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        settle(() => reject(new Error("timeout")));
        return;
      }

      timer = setTimeout(poll, interval);
    };

    poll();
  });
}
