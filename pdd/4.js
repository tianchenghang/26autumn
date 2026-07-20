/** @deprecated */
function deepClone_(obj, seen = new Set()) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (seen.has(obj)) { // 循环引用
    return obj; // 指向原对象
  }

  seen.add(obj);

  if (obj instanceof Date) {
    return new Date(obj);
  }

  if (obj instanceof RegExp) {
    return new RegExp(obj)
  }

  const clone = Array.isArray(obj) ? [] : {};

  for (const key in obj) { // 遍历所有可枚举属性
    clone[key] = deepClone_(obj[key], seen);
  }

  return clone;
}


/**
 *
 * @param {any} obj
 * @param {WeakMap} seen 保存原对象到克隆对象的映射
 * @returns {any}
 */
function deepClone(obj, seen = new WeakMap()) {
  // 基础类型
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // 循环引用
  if (seen.has(obj)) {
    return seen.get(obj);
  }

  let clone;

  if (obj instanceof Date) {
    clone = new Date(obj);
    seen.set(obj, clone);
    return clone;
  }

  if (obj instanceof RegExp) {
    clone = new RegExp(obj.source, obj.flags);
    clone.lastIndex = obj.lastIndex;
    seen.set(obj, clone);
    return clone;
  }

  clone = Array.isArray(obj) ? [] : {}
  seen.set(obj, clone);
  
  for (const key in obj) {
    // 过滤原型链属性
    if (obj.hasOwnProperty(key)) {
      clone[key] = deepClone(obj[key], seen);
    }
  }

  return clone;
}

export default deepClone;
