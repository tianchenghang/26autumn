# Event Handling

Swifty-next provides two complementary event systems: a DOM event delegation system that captures browser events at the document level and routes them to the correct view handler, and a programmatic event emitter for custom application-level events. Both are designed for minimal memory overhead and predictable lifecycle management.

## Event System Overview

Unlike traditional frameworks that attach listeners to individual DOM elements, swifty-mvc uses a single capture-phase listener per event type on `document.body`. This approach has several advantages:

- Memory efficiency: no per-element listener objects to garbage-collect.
- Automatic lifecycle: listeners are attached when the first view needs an event type and removed when the last view releases it.
- No stale references: destroyed views cannot leak listeners because the delegator never holds direct element references.

When a DOM event fires, the delegator walks from `event.target` upward through the DOM tree, resolving view boundaries and matching registered handlers at each level. The walk stops at the first Frame whose view has a template, preventing cross-view event leaking.

## EventDelegator Singleton

The `EventDelegator` is a module-level singleton exported from `event-delegator.ts`. It manages all DOM event delegation for the application.

### Reference Counting per Event Type

The delegator maintains two counters per event type:

- `rootEvents[eventType]`: total number of views that have bound this event type.
- `selectorEvents[eventType]`: number of those bindings that use CSS-selector delegation.

When the first view calls `bind("click")`, the delegator attaches a single capture-phase listener:

```js
document.body.addEventListener("click", domEventProcessor, true);
```

When a second view also binds `"click"`, the counter increments but no additional listener is attached. Only when the counter returns to zero via `unbind` calls is the listener removed.

### Single Capture-Phase Listener

All DOM events are captured in the capture phase (`useCapture: true`), meaning the delegator sees events before they reach their target element. This allows the framework to:

1. Resolve the owning Frame before the event reaches application code.
2. Intercept events at view boundaries for range-event support.
3. Respect `stopPropagation()` across Frame boundaries.

### bind and unbind

The `bind` and `unbind` methods are called by the view system during `registerEvents` and `unregisterEvents`:

```js
EventDelegator.bind(eventType: string, hasSelector?: boolean): void
EventDelegator.unbind(eventType: string, hasSelector?: boolean): void
```

Parameters:

- `eventType`: DOM event type such as `"click"`, `"input"`, `"keydown"`.
- `hasSelector`: whether this binding uses CSS-selector delegation (e.g., `$selector<click>`).

The `hasSelector` flag enables the selector-event resolution path in `findFrameInfo`. When no views use selector events for a given type, that resolution path is skipped for performance.

### Additional Methods

The delegator exposes two utility methods:

- `clearRangeEvents(viewId)`: removes range-event entries for a destroyed view.
- `setFrameGetter(getter)`: injects the Frame lookup function during framework boot, avoiding a circular dependency between `event-delegator.ts` and `frame.ts`.
- `nextElementGuid()`: allocates a unique numeric ID for elements participating in range events.

## Event Resolution Flow

When a DOM event fires, the `domEventProcessor` function handles it. The resolution proceeds in three phases.

### Phase 1: DOM Tree Walk

Starting from `event.target`, the processor walks upward through the DOM tree:

```js
let current: HTMLElement | null = target;
while (current && current !== document.body) {
  const eventInfos = findFrameInfo(current, eventType);
  // ... process matched handlers
  current = current.parentElement;
}
```

At each element, `findFrameInfo` is called to resolve any handlers that apply to that element.

### Phase 2: findFrameInfo Resolution

`findFrameInfo(current, eventType)` checks two handler sources at each DOM level:

1. The `@event` attribute on the current element. This attribute is set by the template compiler when you declare an event handler in your template, for example `@click="handleClick(id={{itemId}})"`. The attribute value is parsed into `{ id, name, params }` where `id` is the owning Frame ID, `name` is the handler function name, and `params` is the parameter string.

2. Selector-based events registered by ancestor Frames. For each ancestor Frame that has registered selector events for this event type, the function checks whether `current.matches(selector)`. Non-empty selectors (e.g., `.btn-delete`) match child elements; the empty selector (`$<click>`) matches only at the Frame boundary itself.

The walk stops at the first Frame whose view has a template. This is the view boundary, and it prevents events from leaking into parent views that did not register the handler.

### Phase 3: Handler Dispatch

For each resolved `EventInfo`, the processor looks up the handler function in the view's event map:

```js
const eventKey = handlerName + "<" + eventType + ">";
const fn = events[eventKey];
```

If found, the function is called with an extended event object that carries:

- `eventTarget`: the original `event.target` element.
- `params`: a parsed key-value object from the `@event` parameter string.

The processor respects `stopPropagation()`. If a handler calls it, the walk stops at the current Frame boundary and does not continue to ancestor Frames.

## Handler Naming Convention

Event handlers are declared in the `events` map returned by a view's setup function. The key format is `"name<eventType>"` or `"$selector<eventType>"`.

| Syntax                     | Meaning                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `handler<click>`           | Event on the view's root element                            |
| `$selector<click>`         | Delegated to child elements matching `.selector`            |
| `$<click>`                 | Empty selector -- fires only at the Frame boundary          |
| `$window<resize>`          | Delegated to `window`                                       |
| `$document<keydown>`       | Delegated to `document`                                     |
| `handler<click,mousedown>` | Multi-event binding (same handler for multiple event types) |
| `name<click><ctrl>`        | Fires only when the Ctrl modifier is held                   |

### Examples

```js
export default function setup(ctx) {
  return {
    events: {
      // Click on the view's root element
      "handleRootClick<click>"(e) {
        console.log("root clicked", e.params);
      },

      // Click on any child element with class .btn-delete
      "handleDelete<$btn-delete>"(e) {
        const id = e.params.id;
        deleteItem(id);
      },

      // Keydown on the document
      "handleGlobalKeydown<$document<keydown>>"(e) {
        if (e.key === "Escape") closeModal();
      },

      // Multiple event types
      "handleInteraction<click,mousedown>"(e) {
        trackInteraction(e.type);
      },
    },
  };
}
```

### Modifier Keys

The optional second angle-bracket group specifies modifier keys. Supported modifiers: `ctrl`, `alt`, `shift`, `meta`. Multiple modifiers can be combined with spaces: `name<click><ctrl shift>`.

## View Events Object

The `events` object returned from a view's setup function is the central registry for that view's DOM event handlers. The framework processes it during view registration:

1. Each key is parsed using `VIEW_EVENT_METHOD_REGEXP` to extract the selector, handler name, event types, and optional modifiers.
2. For each event type, `EventDelegator.bind()` is called with the appropriate `hasSelector` flag.
3. The handler functions are stored in the view's internal event map, keyed by `"handlerName<eventType>"`.

When the view is destroyed, `unregisterEvents` calls `EventDelegator.unbind()` for each registered event type, decrementing the reference counters and potentially removing the capture-phase listener from `document.body`.

### Accessing Event Parameters

Template-declared parameters are available on `e.params`:

```html
<button @click="addToCart(productId={{item.id}}, qty={{item.qty}})">Add</button>
```

```js
"addToCart<click>"(e) {
  const { productId, qty } = e.params;
  cart.add(productId, Number(qty));
}
```

### Accessing the Original Target

The `eventTarget` property always points to the original DOM element that triggered the event, even when the handler is matched via selector delegation:

```js
"handleClick<$item-card>"(e) {
  // e.target may be a child of .item-card
  // e.eventTarget is always the element that was actually clicked
  const card = e.target.closest(".item-card");
}
```

## Event Emitter (createEmitter)

For custom application events, swifty-mvc provides `createEmitter`, a factory function that returns a multi-cast event emitter object. This replaces the former class-based `EventEmitter`.

### Basic API

```js
import { createEmitter } from "swifty-mvc";

const emitter = createEmitter();

// Subscribe
emitter.on("change", (e) => {
  console.log("changed:", e.type, e.key, e.value);
});

// Unsubscribe
emitter.off("change", handler);

// Emit
emitter.fire("change", { key: "name", value: "Alice" });
```

The `fire` method automatically sets `e.type` to the event name. Additional properties passed as the second argument are merged into the event object.

### onEventName Convention

If the emitter object has a method named `on{EventName}` (capitalized), `fire` will call it after invoking the registered listener list. This is how lifecycle callbacks work on framework objects:

```js
const view = createEmitter();

view.onDestroy = (e) => {
  console.log("view is being destroyed");
};

// Later:
view.fire("destroy");
// Calls view.onDestroy automatically
```

This convention is used by View, Frame, Router, and State objects for lifecycle events such as `created`, `destroy`, `change`, and `changed`.

### Re-entrant Safety

The emitter tracks `firingDepth` to handle re-entrant scenarios safely. If a handler calls `off()` to remove itself or another handler while `fire()` is iterating the listener list, the removal is deferred:

1. The handler reference is replaced with `noop` (a no-op function).
2. The key is added to a `pendingCompaction` set.
3. When the outermost `fire()` call completes (depth returns to zero), all marked entries are compacted from their listener arrays.

This prevents skipped handlers and broken iteration that would otherwise occur if the array were mutated during traversal.

### Chaining

All methods return the emitter object, supporting method chaining:

```js
emitter.on("init", handleInit).on("change", handleChange).fire("init");
```

### Fire Options

The `fire` method accepts optional parameters:

```js
emitter.fire(event: string, data?: object, remove?: boolean, lastToFirst?: boolean)
```

- `remove`: if `true`, all handlers for this event are removed after firing (one-shot event).
- `lastToFirst`: if `true`, handlers are invoked in reverse registration order (last registered fires first).

## Custom Events

Custom events are application-defined events that travel through the same emitter system. They are not limited to DOM interactions and can model any publish-subscribe pattern.

### Defining Custom Events

```js
// In a shared module
export const appEvents = createEmitter();

// In a producer
appEvents.fire("user:login", { userId: 42 });

// In a consumer
appEvents.on("user:login", (e) => {
  loadUserProfile(e.userId);
});
```

### Event Namespacing

By convention, use colons to namespace custom events: `"module:action"`. This prevents collisions between unrelated modules:

```js
appEvents.fire("cart:itemAdded", { item });
appEvents.fire("cart:itemRemoved", { item });
appEvents.fire("user:preferencesChanged", { prefs });
```

### Cleanup

Always unsubscribe when a view or component is destroyed to prevent memory leaks:

```js
export default function setup(ctx) {
  const handleChange = (e) => {
    /* ... */
  };
  appEvents.on("data:changed", handleChange);

  ctx.onDestroy = () => {
    appEvents.off("data:changed", handleChange);
  };

  return {
    /* ... */
  };
}
```

### Integration with Router Events

The router exposes an emitter for navigation lifecycle events:

```js
import { Router } from "swifty-mvc";

Router.on("change", (e) => {
  // Fires before route change; call e.reject() to prevent
  if (!isAuthorized(e.to)) e.reject();
});

Router.on("changed", (e) => {
  // Fires after route change completes
  analytics.trackPageView(e.to);
});

Router.on("page_unload", (e) => {
  // Fires on beforeunload
  saveDraftState();
});
```

## Best Practices

### Prefer Event Delegation over Inline Handlers

Always use the `events` map in your view's setup function rather than attaching listeners manually in `onCreated`. The delegator handles lifecycle cleanup automatically.

### Use Selector Events for Dynamic Content

When rendering lists or dynamic child elements, use selector-based delegation instead of attaching a handler per item:

```js
// Good: one handler for all items
"deleteItem<$btn-delete<click>>"(e) {
  removeItem(e.params.id);
}

// Avoid: attaching per-item handlers in a loop
items.forEach((item) => {
  document.getElementById(`btn-${item.id}`).onclick = () => removeItem(item.id);
});
```

### Always Clean Up Custom Event Subscriptions

When subscribing to a shared emitter from within a view, always unsubscribe in `onDestroy`:

```js
const handler = (e) => {
  /* ... */
};
sharedEmitter.on("update", handler);

ctx.onDestroy = () => sharedEmitter.off("update", handler);
```

Failure to do so causes the handler to persist after the view is destroyed, leading to errors when it references deallocated state.

### Use onEventName for Lifecycle Hooks

When extending framework objects (View, Router, State), prefer the `onEventName` convention over `on("eventName", ...)` for lifecycle hooks. It is more readable and avoids the need to store handler references for later cleanup:

```js
view.onDestroy = () => {
  // cleanup
};

// Instead of:
// const destroyHandler = () => { ... };
// view.on("destroy", destroyHandler);
```

### Avoid Deep Selector Chains

Selector-based events require walking the Frame tree and calling `element.matches()` at each level. Deeply nested views with many selector events can cause performance degradation on high-frequency events like `scroll` or `mousemove`. For such events, consider attaching a direct listener in `onCreated` and cleaning it up in `onDestroy`.

### Use Re-entrant Safe Patterns with createEmitter

When a handler needs to unsubscribe itself, rely on the emitter's deferred compaction rather than working around it:

```js
emitter.on("init", function handler(e) {
  doOneTimeSetup();
  emitter.off("init", handler); // Safe: deferred until fire() completes
});
```

### Pass Structured Data via fire

Always pass event data as an object rather than positional arguments. This makes the event contract explicit and allows consumers to ignore fields they do not need:

```js
// Good
emitter.fire("item:updated", {
  id: 1,
  fields: ["name", "price"],
  source: "api",
});

// Avoid
emitter.fire("item:updated", 1, ["name", "price"], "api");
```
