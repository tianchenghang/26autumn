const list = [
  { id: 1, pid: 0, name: "部门 A" },
  { id: 2, pid: 1, name: "组 B" },
  { id: 3, pid: 1, name: "组 C" },
  { id: 4, pid: 2, name: "员工 D" },
  { id: 5, pid: 0, name: "部门 E" },
  { id: 6, pid: 3, name: "员工 F" },
];

/** @deprecated */
function arrayToTree_(list) {
  const isRoot = (pid) => pid === 0 || pid === null;
  const build = (id) => {
    return list
      .filter((item) => item.pid === id)
      .map((item) => ({
        ...item,
        children: build(item.id),
      }));
  };

  return list
    .filter((item) => isRoot(item))
    .map((item) => ({ ...item, children: build(item.id) }));
}
