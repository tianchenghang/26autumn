---
title: Event System
description: Multi-cast event emitters, DOM event delegation, and view event patterns in Swifty MVC.
---

# Event System {#event-system}

Swifty MVC has three layers of event handling, each designed for a specific purpose:

1. EmitterApi — general-purpose multi-cast event emitters for application-level communication
2. EventDelegator — DOM event delegation with capture-phase listeners on `document.body`
3. View events — declarative event maps in the view descriptor

## EmitterApi {#emitter}

`createEmitter` creates a multi-cast event emitter with re-entrant safety:

```ts
import { createEmitter } from "@swifty.js/mvc";

const bus = createEmitter();

// Subscribe
bus.on("message", (data) => {
  console.log("Received:", data);
});

// Emit
bus.fire("message", { text: "Hello" });

// Unsubscribe a specific handler
bus.off("message", handler);

// Remove all handlers for an event
bus.off("message");
```

### Re-entrant safety {#reentrant-safety}

The emitter is safe to modify during iteration. If you call `off()` while `fire()` is executing, the removal is deferred until the outermost `fire()` completes:

```ts
const emitter = createEmitter();

emitter.on("event", function handlerA() {
  emitter.off("event", handlerB);
  // handlerB is marked as noop but NOT removed yet
});

emitter.on("event", function handlerB() {
  // This still runs because removal is deferred
});

emitter.fire("event");
// After fire completes, handlerB is actually removed
```

This prevents the classic bug where modifying an array during iteration causes skipped or duplicate invocations.

### One-shot events {#one-shot}

Pass `remove: true` to `fire()` to automatically remove all handlers after firing:

```ts
emitter.fire("initialized", data, true);
// All 'initialized' handlers are removed after this call
```

### Reverse iteration {#reverse-iteration}

Pass `lastToFirst: true` to fire handlers in reverse order:

```ts
emitter.fire("destroy", undefined, true, true);
// Handlers run in reverse registration order, then are removed
```

This is used internally during view cleanup to ensure effects are cleaned up in reverse order.

### onEventName convention {#on-event-convention}

The emitter supports a shorthand convention: assigning a function to `onEventName` automatically subscribes it to the `eventName` event:

```ts
const emitter = createEmitter();
emitter.onDestroy = () => {
  console.log("Destroyed!");
};
// Equivalent to: emitter.on('destroy', () => { ... })
```

### Built-in emitters {#built-in-emitters}

Several framework singletons use the emitter pattern:

- `Router.on/off/fire` — navigation events
- `State.on/off/fire` — state change events
- `Frame.on/off/fire` — frame lifecycle events
- `frame.on/off/fire` — per-frame instance events
- `ctx.on/off/fire` — per-view events

## EventDelegator {#event-delegator}

The `EventDelegator` is a singleton that manages all DOM event handling in Swifty MVC. Instead of attaching event listeners to individual elements, it attaches a single capture-phase listener per event type to `document.body`.

### How delegation works {#delegation-mechanism}

When a DOM event fires:

```
1. Event bubbles up from the target element
2. Capture-phase listener on document.body intercepts it
3. EventDelegator walks from event.target up through the DOM tree
4. At each element, checks for encoded @event attributes
5. Parses the attribute to extract handler name and parameters
6. Walks the Frame tree to find the view that registered the handler
7. Invokes the handler with an extended event object
```

### Reference counting {#reference-counting}

Event types are reference-counted. The first view to register a `click` handler attaches the body listener. The last view to unregister it removes the listener:

```ts
EventDelegator.bind("click"); // refcount: 0 -> 1, attaches listener
EventDelegator.bind("click"); // refcount: 1 -> 2, no-op
EventDelegator.unbind("click"); // refcount: 2 -> 1, no-op
EventDelegator.unbind("click"); // refcount: 1 -> 0, removes listener
```

This is managed automatically by the framework when views register and unregister events.

### Event attribute encoding {#event-encoding}

The compiler encodes event attributes in the template HTML. A template like:

```html
<button @click="handleClick">Click me</button>
```

Is compiled to:

```html
<button @click="\x1fviewId\x1ehandleClick">Click me</button>
```

The `\x1f` and `\x1e` characters encode the view ID and handler name, allowing the EventDelegator to route events to the correct view without per-element listeners.

### Range events {#range-events}

Range events prevent event propagation across view boundaries. When a view declares a range event, the delegator inserts `data-range-fid` and `data-range-guid` attributes to mark the boundary:

```ts
export default defineView((ctx) => {
  return {
    events: {
      "$document<keydown>"(event) {
        // Only fires for keydowns within this view's DOM subtree
      },
    },
  };
});
```

The `$document` and `$window` selectors create range events that stop propagation at the view boundary, preventing events from leaking into parent views.

## View events {#view-events}

Views declare event handlers in the `events` object returned by the setup function. The key syntax encodes the target element and event type.

### Selector syntax {#selector-syntax}

| Pattern              | Target                          |
| -------------------- | ------------------------------- |
| `handler<click>`     | View root element               |
| `$selector<click>`   | Children matching CSS selector  |
| `$<click>`           | Frame boundary (empty selector) |
| `$window<resize>`    | Window object                   |
| `$document<keydown>` | Document object                 |

### Multiple events {#multiple-events}

Bind a single handler to multiple event types:

```ts
events: {
  'input<input,change,paste>'(event) {
    // Fires on input, change, and paste
  }
}
```

### Modifier keys {#modifier-keys}

Require modifier keys for the handler to fire:

```ts
events: {
  'btn<click><ctrl>'(event) {
    // Only fires on Ctrl+Click
  },
  'btn<click><ctrl,shift>'(event) {
    // Fires on Ctrl+Click or Shift+Click
  }
}
```

### Event handler arguments {#handler-arguments}

Event handlers receive an extended DOM event object:

````ts
### ViewEvent type {#view-event-type}

The TypeScript type definition for view events is:

```ts
interface ViewEvent extends ChangeEvent {
  readonly id: string;
}
````

At runtime, the event object also carries `eventTarget` (the matched DOM element) and `params` (parsed parameters from encoded attributes), but these properties are not part of the TypeScript type. Use type assertions or `unknown` casts when accessing them:

```ts
events: {
  '$deleteBtn<click>'(event) {
    event.preventDefault()          // standard DOM event method
    event.id                        // the view/frame ID (typed)
    (event as any).eventTarget      // the matched element (runtime only)
    (event as any).params           // parsed parameters (runtime only)
    event.type                      // 'click', 'input', etc. (from ChangeEvent)
  }
}
```

The `eventTarget` property points to the element that matched the selector, which may differ from `event.target` (the actual element that was clicked). This is particularly useful with delegated events where the click might have occurred on a child element.

### Dynamic event parameters {#dynamic-params}

Templates can encode dynamic parameters into event attributes:

```html
{{forOf items as item}}
<button @click="deleteItem({{=item.id}})">Delete {{=item.name}}</button>
{{/forOf}}
```

The compiler encodes the `item.id` value into the event attribute. When the handler fires, the value is available via `event.params`.

```ts
events: {
  'deleteItem<click>'(event) {
    const itemId = event.params   // the item.id value
  }
}
```

## Practical patterns {#patterns}

### Cross-view communication {#cross-view-communication}

Use a shared emitter for decoupled cross-view communication:

```ts
// shared-bus.ts
import { createEmitter } from "@swifty.js/mvc";
export const bus = createEmitter();

// view-a.ts
import { bus } from "./shared-bus";
export default defineView((ctx) => {
  return {
    events: {
      "btn<click>"() {
        bus.fire("notification", { message: "Hello from View A" });
      },
    },
  };
});

// view-b.ts
import { bus } from "./shared-bus";
export default defineView((ctx) => {
  useEffect(() => {
    const handler = (data) => {
      ctx.updater.set({ message: data.message }).digest();
    };
    bus.on("notification", handler);
    return () => bus.off("notification", handler);
  });

  return { template };
});
```

### Keyboard shortcuts {#keyboard-shortcuts}

```ts
export default defineView((ctx) => {
  return {
    events: {
      "$document<keydown>"(event) {
        if (event.key === "Escape") {
          ctx.updater.set({ modalOpen: false }).digest();
        }
        if (event.key === "s" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          save();
        }
      },
    },
  };
});
```

### Scroll tracking {#scroll-tracking}

```ts
export default defineView((ctx) => {
  const [getScrollY, setScrollY] = useState("scrollY", 0);

  return {
    events: {
      "$window<scroll>"() {
        setScrollY(window.scrollY);
      },
    },
  };
});
```

## Next steps {#next-steps}

- [Service](/docs/en/swifty-mvc/guide/essentials/service) — API request management with caching
- [Template Syntax](/docs/en/swifty-mvc/guide/essentials/template-syntax) — complete template reference
- [View Lifecycle](/docs/en/swifty-mvc/guide/advanced/view-lifecycle) — deep dive into mount/unmount/render
