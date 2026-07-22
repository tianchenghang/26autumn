---
title: Event API
description: Complete API reference for createEmitter and EventDelegator.
---

# Event API {#event-api}

Swifty MVC provides two event systems: `createEmitter` for application-level events and `EventDelegator` for DOM event delegation.

## createEmitter {#create-emitter}

```ts
createEmitter<T = unknown>(): EmitterApi<T>
```

Create a multi-cast event emitter with re-entrant safety.

**Returns:**

- `EmitterApi<T>` — the emitter instance

**Example:**

```ts
const bus = createEmitter();

bus.on("message", (data) => {
  console.log("Received:", data);
});

bus.fire("message", { text: "Hello" });
```

## EmitterApi {#emitter-api}

### emitter.on {#on}

```ts
emitter.on(name: string, handler: Function): void
```

Subscribe to an event.

**Shorthand:**
Assign a function to `onEventName` to auto-subscribe:

```ts
emitter.onDestroy = () => {
  console.log("Destroyed");
};
// Equivalent to: emitter.on('destroy', () => { ... })
```

### emitter.off {#off}

```ts
emitter.off(name: string, handler?: Function): void
```

Remove a specific handler or all handlers for an event.

**Parameters:**

- `name` — event name
- `handler` — specific handler to remove (omit to remove all)

**Example:**

```ts
emitter.off("message", handler); // remove specific handler
emitter.off("message"); // remove all 'message' handlers
```

### emitter.fire {#fire}

```ts
emitter.fire(
  name: string,
  data?: unknown,
  remove?: boolean,
  lastToFirst?: boolean
): void
```

Emit an event.

**Parameters:**

- `name` — event name
- `data` — payload to pass to handlers
- `remove` — remove all handlers after firing (one-shot)
- `lastToFirst` — fire handlers in reverse order

**Example:**

```ts
emitter.fire("message", { text: "Hello" });
emitter.fire("initialized", data, true); // one-shot
emitter.fire("destroy", undefined, true, true); // reverse order, then remove
```

**Re-entrant safety:**
If `off()` is called during `fire()`, the removal is deferred until the outermost `fire()` completes.

## EventDelegator {#event-delegator}

The `EventDelegator` singleton manages DOM event delegation with capture-phase listeners on `document.body`.

### EventDelegator.bind {#bind}

```ts
EventDelegator.bind(eventType: string, hasSelector?: boolean): void
```

Increment refcount for an event type. Attaches the capture-phase listener on first bind.

**Parameters:**

- `eventType` — DOM event type (e.g., `'click'`, `'input'`)
- `hasSelector` — whether the event uses selector delegation

**Example:**

```ts
EventDelegator.bind("click");
// refcount: 0 -> 1, attaches listener on first bind
```

### EventDelegator.unbind {#unbind}

```ts
EventDelegator.unbind(eventType: string, hasSelector?: boolean): void
```

Decrement refcount. Removes the listener when refcount reaches zero.

### EventDelegator.clearRangeEvents {#clear-range-events}

```ts
EventDelegator.clearRangeEvents(viewId: string): void
```

Remove range event markers from the DOM. Called during view unmount.

### EventDelegator.setFrameGetter {#set-frame-getter}

```ts
EventDelegator.setFrameGetter(getter: (id: string) => FrameObj | undefined): void
```

Inject `Frame.get` to avoid circular imports. Called internally by the framework.

### EventDelegator.nextElementGuid {#next-element-guid}

```ts
EventDelegator.nextElementGuid(): number
```

Allocate a unique element GUID for range event markers.

## Types {#types}

### EmitterApi {#emitter-api-type}

```ts
interface EmitterApi<T = unknown> {
  on(name: string, handler: (data: T) => void): void;
  off(name: string, handler?: (data: T) => void): void;
  fire(name: string, data?: T, remove?: boolean, lastToFirst?: boolean): void;
}
```

### ViewEvent {#view-event-type}

```ts
interface ViewEvent extends ChangeEvent {
  readonly id: string;
}
```

Extended DOM event passed to view event handlers. At runtime, the event object also carries `eventTarget` (the matched DOM element) and `params` (parsed parameters from encoded attributes), but these are not part of the TypeScript type definition.

## Next steps {#next-steps}

- [Event System guide](/docs/en/swifty-mvc/guide/essentials/events) — patterns and examples
- [View API](/docs/en/swifty-mvc/api-reference/view) — view events and lifecycle
- [Bundler Integration](/docs/en/swifty-mvc/guide/advanced/bundler-integration) — event encoding
