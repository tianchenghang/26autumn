/**
 * Swifty framework utility functions.
 */

import {
  URL_QUERY_HASH_REGEXP,
  URL_PARAM_REGEXP,
  IS_URL_PARAMS,
  isRefToken,
} from "./common";
import type { AnyFunc, ParsedUri } from "./types";

// ============================================================
// Task Scheduler (time-sliced execution)
// ============================================================

/**
 * Lightweight task scheduler with cooperative time-slicing.
 *
 * Tasks are queued and processed in batches. Each batch runs for up to
 * 9ms, then yields to the browser to let it process user input, paint,
 * and handle other events before resuming.
 *
 * Uses `scheduler.yield()` when available (modern replacement for the
 * deprecated `isInputPending()` API). Falls back to `setTimeout(0)`.
 *
 * Architecture:
 * - Tasks are stored in a FIFO array
 * - StartCall processes tasks in a tight loop
 * - When time budget is exceeded, yields to the browser
 * - Each task is wrapped in try-catch to prevent cascading failures
 */

/** Time budget per batch in milliseconds */
const CALL_BREAK_TIME = 9;

/** Pending task queue */
const callQueue: Array<() => void> = [];

/** Whether a batch is currently scheduled or running */
let callScheduled = false;

/** Detect scheduler.yield() — modern replacement for isInputPending() */

// Why globalThis.scheduler.yield, not globalThis.scheduler.postTask?
//
// 1. Semantic fit — yield() pauses the current task and resumes it after the
//    browser processes higher-priority work. Our scheduler runs a single
//    long-running batch loop that needs to pause-and-resume, not schedule
//    independent tasks. postTask() creates a new task; that would fragment
//    our batch into multiple scheduler-managed tasks instead of one.
//
// 2. Queue semantics — we already manage our own FIFO queue (callQueue) with
//    a 9ms time budget. postTask() adds a redundant priority queue layer
//    (user-blocking / user-visible / background) that doesn't help — all
//    queued tasks are equal priority, processed in insertion order.
//
// 3. Overhead — postTask() validates priority, creates internal task objects,
//    and goes through the browser's task scheduling pipeline. yield() is a
//    lightweight "let the browser breathe, then give me back control".
//
// 4. Continuity — after yield() resolves, execution continues in the same
//    async function, keeping the deadline/loop local variables intact.
//    With postTask(), we would need to re-enter the processing function
//    and reconstruct the loop state on each continuation.
//
// In short: yield() = cooperative pause within a task (what we need);
//           postTask() = schedule a new task (wrong abstraction for us).

function getSchedulerYield(): (() => Promise<void>) | undefined {
  try {
    const scheduler = Reflect.get(globalThis, "scheduler");
    if (
      scheduler &&
      typeof scheduler === "object" &&
      typeof Reflect.get(scheduler, "yield") === "function"
    ) {
      const yieldFn = Reflect.get(scheduler, "yield");
      if (typeof yieldFn === "function") {
        return yieldFn.bind(scheduler);
      }
    }
  } catch {
    // scheduler API not available
  }
  return undefined;
}

const schedulerYield: (() => Promise<void>) | undefined = getSchedulerYield();

/** Process queued tasks in time-sliced batches.
 *
 * Yield strategy for mid-batch pausing:
 * 1. scheduler.yield() — modern Scheduler Priorities API (Chrome 115+)
 *    Pauses the current batch and resumes after the browser handles
 *    higher-priority work. Keeps loop state intact across the pause.
 * 2. setTimeout(0) — universal fallback. Returns from startCall and
 *    re-enters via scheduleNextChunk, processing the rest of the queue
 *    in a new batch with a fresh CALL_BREAK_TIME budget.
 *
 * Inter-batch scheduling always uses setTimeout (see scheduleNextChunk).
 */
async function startCall(): Promise<void> {
  callScheduled = false;
  const startTime = performance.now();

  while (callQueue.length > 0) {
    const task = callQueue.shift()!;
    try {
      task();
    } catch (e) {
      // Task failed — log and continue with next task
      // to prevent one bad task from blocking the queue.
      console.error("scheduler task error:", e);
    }

    // Check if we should yield to the browser
    if (
      callQueue.length > 0 &&
      performance.now() - startTime > CALL_BREAK_TIME
    ) {
      if (schedulerYield) {
        // Modern path: pause and resume in same async function
        await schedulerYield();
      } else {
        // Fallback: schedule new batch and return
        scheduleNextChunk();
        return;
      }
    }
  }
}

/**
 * Schedule the next chunk for deferred execution.
 *
 * Uses setTimeout(0) rather than requestIdleCallback because scheduler
 * tasks (DOM rendering, endUpdate, mountZone) are mandatory — they must
 * run to complete the view lifecycle. requestIdleCallback is designed for
 * opportunistic low-priority work; even with a timeout guard, the callback
 * fires with timeRemaining()≈0 when the browser is busy, causing immediate
 * yield and starvation (one task per callback, or zero tasks in degenerate
 * cases).
 *
 * setTimeout(0) reliably yields to the browser and fires within ~4ms,
 * giving a full CALL_BREAK_TIME budget for processing. Mid-batch yielding
 * is still handled by scheduler.yield() in startCall() (tier 1 of the
 * 3-tier strategy).
 */
function scheduleNextChunk(): void {
  setTimeout(() => startCall(), 0);
  callScheduled = true;
}

/**
 * Schedule a task for deferred execution.
 *
 * Tasks are processed in FIFO order within time-sliced batches (9ms budget).
 * When the budget is exceeded, the scheduler yields to the browser:
 * 1. scheduler.yield() — pause-resume within the same batch (Chrome 115+)
 * 2. setTimeout(0) — end batch, start a new one in the next event loop tick
 *
 * Use this to defer DOM operations and callbacks so that:
 * 1. Multiple view updates within the same digest cycle are batched
 * 2. The browser can process user input and paint between batches
 * 3. Very large updates are split across frames to maintain responsiveness
 *
 * @param fn - The function to execute
 * @param args - Arguments to pass to the function
 */
export function callFunction<T extends unknown[]>(
  fn: (...args: T) => void,
  args: T,
): void {
  callQueue.push(() => {
    fn(...args);
  });
  if (!callScheduled) {
    scheduleNextChunk();
  }
}

// ============================================================
// Type guards
// ============================================================

/** Check if value is a plain object (not null, not array, typeof object) */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  // Fallback for non-record values: convert arrays to objects, else empty
  if (Array.isArray(value)) {
    return Object.fromEntries(value.entries());
  }
  return {};
}

/** Check if value is primitive or function (not a complex object) */
function isPrimitiveOrFunc(value: unknown): boolean {
  return !value || (typeof value !== "object" && typeof value !== "function");
}

/** Check if value is primitive (not object, not function) */
function isPrimitive(value: unknown): boolean {
  return !value || typeof value !== "object";
}

// ============================================================
// ID generation
// ============================================================

/** Generate a unique ID with optional prefix */
let _localCounter = 0;
export function generateId(prefix?: string): string {
  return (prefix || "swifty_") + _localCounter++;
}

export function noop(): void {
  /** noop */
}

// ============================================================
// Object utilities
// ============================================================

/** Safe hasOwnProperty check */
export function hasOwnProperty<T extends object>(
  owner: T | undefined | null,
  prop: PropertyKey,
): boolean {
  return owner != null && Object.prototype.hasOwnProperty.call(owner, prop);
}

/** Get object keys (own enumerable) */
export function keys<T extends object>(obj: T): string[] {
  const result: string[] = [];
  for (const p in obj) {
    if (hasOwnProperty(obj, p)) {
      result.push(p);
    }
  }
  return result;
}

/** Assign properties from sources to target (like Object.assign but safer) */
export function assign<T extends object>(
  target: T,
  ...sources: Partial<T>[]
): T {
  for (const source of sources) {
    if (source) {
      for (const p in source) {
        if (hasOwnProperty(source, p)) {
          Reflect.set(target, p, source[p]);
        }
      }
    }
  }
  return target;
}

// ============================================================
// Try-execute utilities
// ============================================================

/**
 * Execute functions in try-catch, ignoring errors.
 * Returns the result of the last successfully executed function.
 */
export function funcWithTry(
  fns: AnyFunc | AnyFunc[],
  args: unknown[],
  context: unknown,
  configError?: (e: unknown) => void,
): unknown {
  const fnArray = Array.isArray(fns) ? fns : [fns];
  let ret: unknown;
  for (const fn of fnArray) {
    try {
      ret = fn.apply(context, args);
    } catch (e) {
      configError?.(e);
    }
  }
  return ret;
}

// ============================================================
// Data utilities
// ============================================================

/** Shared empty Set used as default value to avoid per-call allocation. */
export const EMPTY_STRING_SET: ReadonlySet<string> = new Set();

/**
 * Set newData into oldData, tracking changed keys.
 * Returns whether any value changed.
 */
export function setData(
  newData: Record<string, unknown>,
  oldData: Record<string, unknown>,
  changedKeys: Set<string>,
  excludes: ReadonlySet<string>,
): boolean {
  let changed = false;
  for (const p in newData) {
    if (hasOwnProperty(newData, p)) {
      const now = newData[p];
      const old = oldData[p];
      if ((!isPrimitiveOrFunc(now) || old !== now) && !excludes.has(p)) {
        changedKeys.add(p);
        changed = true;
      }
      oldData[p] = now;
    }
  }
  return changed;
}

/**
 * Translate compiled refData references back to their original values.
 *
 * A reference token has the exact shape `SPLITTER + ascii decimal digits`
 * (as emitted by `refFn`). This shape check ensures user data that
 * merely happens to begin with the SPLITTER character is never mistaken
 * for a ref.
 */

export function translateData(data: object, value: unknown): unknown {
  if (isPrimitive(value)) {
    const prop = String(value);
    if (isRefToken(prop) && hasOwnProperty(data, prop)) {
      return Reflect.get(data, prop);
    }
    return value;
  }
  if (isPlainObject(value) || Array.isArray(value)) {
    for (const p in value) {
      if (hasOwnProperty(value, p)) {
        const val = Reflect.get(value, p);
        const newVal = translateData(data, val);
        Reflect.set(value, p, newVal);
      }
    }
    return value;
  }
  return value;
}

// ============================================================
// DOM utilities
// ============================================================

/** Get element by ID, or return the element itself if already an element */
export function getById(id: string | Element | null): Element | null {
  if (!id) return null;
  if (typeof id === "object") return id;
  return document.getElementById(id);
}

/** Get attribute from element safely */
export function getAttribute(element: Element, attr: string): string {
  return Element.prototype.getAttribute.call(element, attr) ?? "";
}

/** Ensure element has an ID, generating one if missing. Returns the ID. */
export function ensureElementId(element: HTMLElement, prefix?: string): string {
  const id = element.getAttribute("id");
  if (id) return id;
  element.autoId = 1;
  const newId = generateId(prefix);
  element.id = newId;
  return newId;
}

/**
 * Check if node A is inside node B (or is the same node).
 * Uses compareDocumentPosition for efficiency.
 */
export function nodeInside(
  a: string | HTMLElement,
  b: string | HTMLElement,
): boolean {
  const aNode = typeof a === "string" ? document.getElementById(a) : a;
  const bNode = typeof b === "string" ? document.getElementById(b) : b;
  if (!aNode || !bNode) return false;
  if (aNode === bNode) return true;
  try {
    return (bNode.compareDocumentPosition(aNode) & 16) === 16;
  } catch {
    return false;
  }
}

// ============================================================
// URI utilities
// ============================================================

/**
 * Parse URI string into path and params object.
 * e.g. "/xxx/?a=b&c=d" => { path: "/xxx/", params: { a: "b", c: "d" } }
 *
 * The accumulator is function-local, so nested / re-entrant calls
 * (e.g. invoking `parseUri` again inside a replace callback) are safe.
 */
export function parseUri(uri: string): ParsedUri {
  const params: Record<string, string> = {};
  const path = uri.replace(URL_QUERY_HASH_REGEXP, "");
  const pathname = path;
  // Check if the original URI looks like it has params (e.g. YT3O0sPH1No= base64)
  const actualPath =
    uri === pathname && IS_URL_PARAMS.test(pathname) ? "" : pathname;
  uri
    .replace(actualPath, "")
    .replace(URL_PARAM_REGEXP, (_match, name: string, value: string) => {
      try {
        params[name] = decodeURIComponent(value || "");
      } catch {
        params[name] = value || "";
      }
      return "";
    });
  return { path: actualPath, params };
}

/**
 * Convert path and params to URI string.
 * e.g. toUri("/xxx/", { a: "b", c: "d" }) => "/xxx/?a=b&c=d"
 */
export function toUri(
  path: string,
  params: Record<string, unknown>,
  keepEmpty?: ReadonlySet<string>,
): string {
  const pairs: string[] = [];
  let hasParams = false;

  for (const p in params) {
    if (hasOwnProperty(params, p)) {
      const v = String(params[p] ?? "");
      if (!keepEmpty || v || keepEmpty.has(p)) {
        pairs.push(`${p}=${encodeURIComponent(v)}`);
        hasParams = true;
      }
    }
  }

  if (hasParams) {
    path += (path && (~path.indexOf("?") ? "&" : "?")) + pairs.join("&");
  }
  return path;
}
