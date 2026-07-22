/**
 * Multi-cast event emitter (functional factory).
 *
 * Supports: on/off/fire with re-entrant safety. While `fire()` is iterating
 * a listener list, `off()` calls schedule a deferred removal that is applied
 * once the outermost `fire()` completes — so handlers can detach themselves
 * (or each other) without skipping siblings or breaking iteration.
 *
 * Also supports the `onEventName` convention: if the emitter object has a
 * method named `on{EventName}` (e.g. `onDestroy`, `onCreated`), `fire()`
 * will automatically call it after the registered listener list. This is
 * how Swifty View/Frame/Router/State lifecycle callbacks work.
 *
 * Replaces the former `EventEmitter` class with a `createEmitter()` factory.
 * No `class`, no `this`, no `prototype`.
 */
import { SPLITTER } from "./common";
import { noop, funcWithTry } from "./utils";
import type {
  AnyFunc,
  ChangeEvent,
  EmitterApi,
  EventListenerEntry,
} from "./types";

/**
 * Internal emitter shape — the public `EmitterApi` plus the `listeners` Map
 * exposed for white-box testing (the old class exposed `listeners` as a
 * public instance field).
 */
interface EmitterInternal<T> extends EmitterApi<T> {
  listeners: Map<string, EventListenerEntry[]>;
  [key: string]: unknown;
}

/**
 * Create a multi-cast event emitter.
 *
 * @returns An emitter API object with `on`, `off`, `fire` methods.
 *   The object also supports the `on{EventName}` convention: setting
 *   `emitter.onDestroy = fn` causes `fire("destroy", ...)` to call `fn`.
 *
 * @example
 * const emitter = createEmitter();
 * emitter.on('change', (data) => console.log(data));
 * emitter.fire('change', { key: 'value' });
 */
export function createEmitter<T = unknown>(): EmitterApi<T> {
  /** Event listeners: prefixed key -> listener array */
  const listeners = new Map<string, EventListenerEntry[]>();

  /** Number of `fire()` calls currently on the stack (re-entrancy depth). */
  let firingDepth = 0;

  /** Keys whose listener list needs compaction after firing settles. */
  let pendingCompaction: Set<string> | undefined;

  function on(event: string, handler: (e: ChangeEvent) => void): EmitterApi<T> {
    const key = SPLITTER + event.toLowerCase();
    let list = listeners.get(key);
    if (!list) {
      list = [];
      listeners.set(key, list);
    }
    list.push({ handler: handler as AnyFunc, executing: 0 });
    return api;
  }

  function off(event: string, handler?: AnyFunc): EmitterApi<T> {
    const key = SPLITTER + event.toLowerCase();
    if (handler) {
      const list = listeners.get(key);
      if (!list) return api;
      if (firingDepth > 0) {
        // Re-entrant remove during fire(): mark with noop and defer compaction.
        for (const listener of list) {
          if (listener.handler === handler) {
            listener.handler = noop;
            (pendingCompaction ??= new Set()).add(key);
            break;
          }
        }
      } else {
        for (let i = 0; i < list.length; i++) {
          if (list[i].handler === handler) {
            list.splice(i, 1);
            break;
          }
        }
        if (list.length === 0) listeners.delete(key);
      }
    } else {
      // Remove all handlers for this event.
      listeners.delete(key);
      // Also delete the onEventName method if it exists (matches old class behavior).
      Reflect.deleteProperty(internal, onMethodName(event));
    }
    return api;
  }

  function fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): EmitterApi<T> {
    // Case-insensitive event matching: HTML attribute names are lowercased
    // by the parser, so e-swifty-clearHistory becomes e-swifty-clearhistory.
    // Lowercasing the key lets fire("clearHistory") match on("clearhistory").
    const key = SPLITTER + event.toLowerCase();
    const list = listeners.get(key);

    const eventData: Record<string, unknown> = data ?? {};
    eventData["type"] = event; // preserve original case in event data

    firingDepth++;
    try {
      if (list) {
        const len = list.length;
        for (let i = 0; i < len; i++) {
          const idx = lastToFirst ? len - 1 - i : i;
          const listener = list[idx];
          if (!listener) continue;
          if (listener.handler === noop) continue;
          listener.executing = 1;
          funcWithTry([listener.handler], [eventData], null, noop);
          listener.executing = "";
        }
      }

      // Call onEventName method if it exists on the emitter object.
      // This is how View/Frame/Router/State lifecycle callbacks (onDestroy,
      // onCreated, onChange, etc.) are invoked.
      const onMethod = internal[onMethodName(event)] as unknown;
      if (typeof onMethod === "function") {
        funcWithTry([onMethod as AnyFunc], [eventData], null, noop);
      }

      if (remove) {
        off(event);
      }
    } finally {
      firingDepth--;
      if (firingDepth === 0 && pendingCompaction) {
        for (const k of pendingCompaction) {
          const l = listeners.get(k);
          if (!l) continue;
          for (let i = l.length - 1; i >= 0; i--) {
            if (l[i].handler === noop) l.splice(i, 1);
          }
          if (l.length === 0) listeners.delete(k);
        }
        pendingCompaction = undefined;
      }
    }

    return api;
  }

  /** Build the `onEventName` key from an event name (e.g. "destroy" -> "onDestroy"). */
  function onMethodName(event: string): string {
    return "on" + event[0].toUpperCase() + event.slice(1);
  }

  // The internal object carries `listeners` (for white-box testing) and
  // supports arbitrary `onEventName` properties set by consumers.
  const internal: EmitterInternal<T> = {
    on,
    off,
    fire,
    listeners,
  };

  // `api` is the same reference as `internal` — cast to the public type.
  const api: EmitterApi<T> = internal;
  return api;
}
