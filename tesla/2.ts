// 高度数组 blocks, 代表 0 ~ n-1 的方块
// 两只青蛙初始站在同一个方块上, 只能向高处或水平跳跃
// 两只青蛙要相互远离

// 确定最优的初始位置, 保证远离的距离最远

function solution(blocks: number[]) {
  const l2r = Array.from({ length: blocks.length }, () => 0);
  const r2l = Array.from({ length: blocks.length }, () => 0);

  let l2rI = 0;
  let r2lJ = 0;
  for (
    let i = 0, j = blocks.length - 1;
    i < blocks.length && j >= 0;
    i++, j--
  ) {
    const hI = blocks[i];
    const l2rH = blocks[l2rI];
    const r2lH = blocks[r2lJ];
    if (hI <= l2rH) {
      l2r[i] = l2rI;
    } else { 
      l2r[i] = i;
      l2rI = i;
    }
    const hJ = blocks[j];
    if (hJ <= r2lH) {
      r2l[j] = r2lJ;
    } else { 
      r2l[j] = j;
      r2lJ = j;
    }
  }
  let ans = 0;
  for (let i = 0; i < blocks.length; i++) { 
    const l = i - l2r[i];
    const r = r2l[i] - i;
    ans = Math.max(ans, l + r);
  }
  return ans;
}
