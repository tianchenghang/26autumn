/**
 * Copyright (c) 2026 hangtiancheng
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const list = [
  { id: 1, pid: 0, name: "部门 A" },
  { id: 2, pid: 1, name: "组 B" },
  { id: 3, pid: 1, name: "组 C" },
  { id: 4, pid: 2, name: "员工 D" },
  { id: 5, pid: 0, name: "部门 E" },
  { id: 6, pid: 3, name: "员工 F" },
];

function arrayToTree(list) {
  const isRoot = (pid) => pid === 0 || pid === null;
  const nodeMap = new Map();
  const roots = [];
  for (const item of list) {
    const node = { ...item, children: [] };
    nodeMap.set(node.id, node);
    if (isRoot(node)) {
      roots.push(node);
    }
  }

  for (const item of list) {
    const node = nodeMap.get(item.id);
    if (!isRoot(node)) {
      const parent = nodeMap.get(node.pid);
      if (parent) {
        parent.children.push(node);
      }
    }
  }
  return roots;
}
