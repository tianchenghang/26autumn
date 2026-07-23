// 高度数组 blocks, 代表 0 ~ n-1 的方块
// 两只青蛙初始站在同一个方块上, 只能向高处或水平跳跃
// 两只青蛙要相互远离

// 确定最优的初始位置, 保证远离的距离最远

function solution(blocks: number[]) {
  const n = blocks.length;
  const l2r = Array.from({ length: n }, () => 0);
  const r2l = Array.from({ length: n }, () => 0);

  for (let i = 1; i < n; i++) {
    l2r[i] = blocks[i - 1] >= blocks[i] ? l2r[i - 1] : i;
  }

  r2l[n - 1] = n - 1;
  for (let j = n - 2; j >= 0; j--) {
    r2l[j] = blocks[j + 1] >= blocks[j] ? r2l[j + 1] : j;
  }

  let ans = 0;
  for (let i = 0; i < n; i++) {
    ans = Math.max(ans, r2l[i] - l2r[i] + 1);
  }
  return ans;
}
