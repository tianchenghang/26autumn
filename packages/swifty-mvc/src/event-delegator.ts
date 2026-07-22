/**
 * DOM event delegation system.
 *
 * All DOM events are delegated to `document.body` in the **capture phase**,
 * rather than attaching listeners to individual elements. When an event
 * fires, the delegator walks from `event.target` up to `document.body`,
 * resolving the owning Frame and matching registered handlers at each level.
 *
 * ## Handler naming convention
 *
 * Event methods are declared in the `events` map returned by a view's setup
 * function, keyed by `"name<eventType>"` or `"$selector<eventType>"`:
 *
 * | Syntax                     | Meaning                                            |
 * | -------------------------- | -------------------------------------------------- |
 * | `handler<click>`           | Event on the view's root element                   |
 * | `$selector<click>`         | Delegated to child elements matching `.selector`   |
 * | `$<click>`                 | Empty selector — fires only at the Frame boundary  |
 * | `$window<resize>`          | Delegated to `window`                               |
 * | `$document<keydown>`       | Delegated to `document`                             |
 * | `handler<click,mousedown>` | Multi-event binding                                |
 * | `name<click><ctrl>`        | Fires only when the Ctrl modifier is held          |
 *
 * ## Reference counting
 *
 * `bind` / `unbind` use reference counting per event type so that multiple
 * views registering the same event type on `document.body` don't attach
 * duplicate listeners, and a single `unbind` doesn't remove a listener still
 * needed by another view.
 */
import { EVENT_METHOD_REGEXP } from "./common";
import { parseUri, funcWithTry, noop, assign } from "./utils";
import { createCache } from "./cache";
import type { FrameObj, AnyFunc } from "./types";

// ============================================================
// Internal state
// ============================================================

/** Root events counter: eventType -> count */
const rootEvents: Record<string, number> = {};

/** Selector events counter: eventType -> count */
const selectorEvents: Record<string, number> = {};

/** Event info cache */
const eventInfoCache = createCache<Record<string, string>>({
  maxSize: 30,
  bufferSize: 10,
});

/** Reference to Frame.get (set during initialization) */
let frameGetter: ((id: string) => FrameObj | undefined) | undefined;

// ============================================================
// Event info parsing
// ============================================================

/** Parsed event info from @event attribute */
interface EventInfo {
  /** View/frame ID (before SPLITTER) */
  id: string;
  /** Event handler name */
  name: string;
  /** Params string */
  params: string;
  /** Raw attribute value; Handler name or selector */
  value: string;
}

/**
 * Parse event info from attribute string.
 * Format: "viewId\x1ehandlerName(params)"
 */
function parseEventInfo(eventInfo: string): EventInfo {
  const cached = eventInfoCache.get(eventInfo);
  if (cached) {
    return assign({}, cached, { value: eventInfo }) as EventInfo;
  }

  const match = eventInfo.match(EVENT_METHOD_REGEXP) || [];
  const result = {
    id: match[1] || "",
    name: match[2] || "",
    params: match[3] || "",
  };

  eventInfoCache.set(eventInfo, result);
  return assign({}, result, { value: eventInfo }) as EventInfo;
}

/**
 * Resolve event handlers for a DOM element by walking up the Frame tree.
 *
 * Handles two handler sources:
 * 1. **`@event` attribute** on the current element — parsed into
 *    `{ id, name, params }` where `id` is the owning Frame ID.
 * 2. **Selector-based events** registered by ancestor Frames — matched
 *    via `element.matches(selector)`.
 *
 * The walk stops at the first Frame whose view has a template (the view
 * boundary), preventing cross-view event leaking.
 *
 * @param current - The DOM element where the event originated
 * @param eventType - The DOM event type (e.g. `"click"`)
 * @returns Array of resolved `EventInfo` entries, ordered innermost-first
 */
function findFrameInfo(current: HTMLElement, eventType: string): EventInfo[] {
  const eventInfos: EventInfo[] = [];

  // Check @event attribute on current element
  const info = current.getAttribute(`@${eventType}`);
  const hasSelectorEvents = !!selectorEvents[eventType];

  // Early-exit: no `@event` attribute here and no view has registered any
  // selector handler for this event type → nothing to find at this level.
  if (!info && !hasSelectorEvents) {
    return eventInfos;
  }

  let begin: HTMLElement | null = current;
  let match: EventInfo | undefined;
  if (info) {
    match = parseEventInfo(info);
  }

  // If we have a match without frame ID, or there are selector events for this type
  if ((match && !match.id) || hasSelectorEvents) {
    // Find the nearest frame by walking up the DOM
    let selectorFrameId = "#";
    let backtrace = 0;

    // Walk up to find nearest frame
    while (begin && begin !== document.body) {
      const beginId = begin.id;
      if (beginId && frameGetter?.(beginId)) {
        selectorFrameId = beginId;
        break;
      }
      begin = begin.parentElement;
    }

    // If current element IS a frame root node
    const currentId = current.id;
    if (currentId && frameGetter?.(currentId)) {
      backtrace = 1;
      selectorFrameId = currentId;
    }

    // Walk up the frame tree looking for selector events
    let frameId = selectorFrameId;
    do {
      const frame = frameId ? frameGetter?.(frameId) : undefined;
      if (frame) {
        const view = frame.view;
        if (view) {
          // Stop at view boundary (view with template). When the @event
          // attribute had no frame ID, attach the nearest frame ID here so
          // the handler resolves to the correct view.
          if (view.getTemplate() && !backtrace) {
            if (match && !match.id) {
              match.id = frameId;
            }
            break;
          }
          backtrace = 0;
        }
      }
      // Move to parent frame
      if (frame) {
        frameId = frame.parentId || "";
      } else {
        break;
      }
    } while (frameId);
  }

  // Add the direct @event match
  if (match) {
    eventInfos.push({
      id: match.id,
      value: match.value,
      name: match.name,
      params: match.params,
    });
  }

  return eventInfos;
}

// ============================================================
// DOMEventProcessor: main event handler
// ============================================================

/**
 * Main capture-phase handler for all delegated DOM events.
 *
 * Attached to `document.body` via `addEventListener(type, handler, true)`.
 * When an event fires, walks from `event.target` up to `document.body`,
 * calling `findFrameInfo` at each level to resolve handlers. Respects
 * `stopPropagation()` and Frame-boundary range events.
 *
 * The extended event object carries `eventTarget` (the original hit element)
 * and `params` (parsed from the `@event` parameter string) for consumer
 * access.
 */
function domEventProcessor(domEvent: Event): void {
  const target = domEvent.target as HTMLElement;
  const eventType = domEvent.type;

  let lastFrameId = "";

  let current: HTMLElement | null = target;
  while (current && current !== document.body) {
    const eventInfos = findFrameInfo(current, eventType);
    if (eventInfos.length) {
      for (const info of eventInfos) {
        const { id: frameId, name: handlerName, params: params } = info;

        if (lastFrameId !== frameId) {
          if (
            lastFrameId &&
            (
              domEvent as Event & { isPropagationStopped?: () => boolean }
            ).isPropagationStopped?.()
          ) {
            break;
          }
          lastFrameId = frameId;
        }

        const frame = frameId ? frameGetter?.(frameId) : undefined;
        const view = frame?.view;
        if (view) {
          // Functional API: events are stored in ctx.getEvents() map,
          // keyed by the original "name<eventType>" format (e.g. "navigateTo<click>").
          // Old class API used Reflect.get(view, name + SPLITTER + type) which
          // looked up $evtObjMap on the prototype — that no longer exists.
          const eventKey = handlerName + "<" + eventType + ">";
          const events =
            typeof (
              view as { getEvents?: () => Record<string, AnyFunc> | undefined }
            ).getEvents === "function"
              ? (
                  view as {
                    getEvents: () => Record<string, AnyFunc> | undefined;
                  }
                ).getEvents()
              : undefined;
          const fn = events?.[eventKey];
          if (fn) {
            // Attach event metadata
            const extendedEvent = domEvent as Event & {
              eventTarget?: EventTarget | null;
              params?: Record<string, string>;
            };
            extendedEvent.eventTarget = target;
            extendedEvent.params = params ? parseUri(params).params : {};
            funcWithTry(fn, [extendedEvent], view, noop);
          }
        }
      }
    }

    if (
      (
        domEvent as Event & { isPropagationStopped?: () => boolean }
      ).isPropagationStopped?.()
    ) {
      break;
    }

    current = current.parentElement;
  }
}

// ============================================================
// EventDelegator object
// ============================================================

/**
 * DOM event delegation singleton.
 *
 * Manages capture-phase listeners on `document.body` via reference counting.
 * Called by the view system during `registerEvents` / `unregisterEvents`.
 */
export const EventDelegator = {
  /**
   * Register interest in an event type on `document.body`.
   *
   * Uses reference counting — the first registration attaches the capture-phase
   * listener; subsequent registrations just increment the counter. The
   * listener is only removed when the counter returns to zero via `unbind`.
   *
   * @param eventType - DOM event type (e.g. `"click"`, `"input"`)
   * @param hasSelector - Whether this binding uses CSS-selector delegation
   */
  bind(eventType: string, hasSelector = false): void {
    const counter = rootEvents[eventType] || 0;

    if (counter === 0) {
      // First binding, attach to document body
      document.body.addEventListener(eventType, domEventProcessor, true);
    }

    rootEvents[eventType] = counter + 1;

    if (hasSelector) {
      selectorEvents[eventType] = (selectorEvents[eventType] || 0) + 1;
    }
  },

  /**
   * Deregister interest in an event type from `document.body`.
   *
   * Decrements the reference counter; the capture-phase listener is only
   * removed when the counter reaches zero.
   *
   * @param eventType - DOM event type
   * @param hasSelector - Whether this binding used CSS-selector delegation
   */
  unbind(eventType: string, hasSelector = false): void {
    const counter = rootEvents[eventType] || 0;

    if (counter <= 1) {
      // Last unbinding, remove from document body
      document.body.removeEventListener(eventType, domEventProcessor, true);
      Reflect.deleteProperty(rootEvents, eventType);
    } else {
      rootEvents[eventType] = counter - 1;
    }

    if (hasSelector) {
      const selectorCounter = selectorEvents[eventType] || 0;
      if (selectorCounter <= 1) {
        Reflect.deleteProperty(selectorEvents, eventType);
      } else {
        selectorEvents[eventType] = selectorCounter - 1;
      }
    }
  },

  /**
   * Inject the Frame lookup function.
   *
   * Called by `Framework.boot` so the delegator can resolve DOM element IDs
   * to `FrameObj` instances without importing `frame.ts` directly (avoiding
   * a circular dependency).
   */
  setFrameGetter(getter: (id: string) => FrameObj | undefined): void {
    frameGetter = getter;
  },
};
