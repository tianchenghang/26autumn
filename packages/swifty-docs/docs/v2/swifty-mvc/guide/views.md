# Views {#views}

A View in swifty-mvc is the V in MVC. It is a self-contained unit of UI that
owns its own data, template, event handlers, and lifecycle. Unlike class-based
view systems found in other frameworks, swifty-mvc views are defined with a
single setup function. There is no `class`, no `this`, no `prototype`, and no
`mixin`. Every framework API is delivered through the `ViewCtx` object that
the setup function receives as its first argument, and through the hooks that
close over it.

The setup function runs exactly once, when the view is mounted. This is the
single most important difference from component systems such as React. Hooks
like `useState` and `useEffect` register state and effects on the `ViewCtx`;
they are not re-invoked on every render. Re-renders are driven exclusively by
data changes flowing through the per-view `Updater`, not by re-executing the
setup function.

## Defining a View with defineView {#defineview}

`defineView` is the public factory for declaring a view. It accepts a setup
function and returns it unchanged. The function's purpose is primarily
documentation and type narrowing: any file that exports `defineView(...)` is
recognised by the framework and the devtools as a view module.

```ts
import { defineView, useState } from "swifty-mvc";
import template from "./counter.html";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "incr<click>": () => setCount(getCount() + 1),
      "decr<click>": () => setCount(getCount() - 1),
    },
  };
});
```

### Signature {#defineview-signature}

```ts
defineView(
  setup: (ctx: ViewCtx, params?: unknown) => {
    template?: ViewTemplate | VDomTemplate;
    events?: Record<string, Function>;
    assign?: (options?: unknown) => boolean | undefined;
  }
): ViewSetup
```

The setup function returns a descriptor with three optional fields:

| Field      | Type                                          | Purpose                                                       |
| ---------- | --------------------------------------------- | ------------------------------------------------------------- |
| `template` | `ViewTemplate \| VDomTemplate`                | Compiled template function used by the updater to render HTML |
| `events`   | `Record<string, Function>`                    | Map of declarative event bindings                             |
| `assign`   | `(options?: unknown) => boolean \| undefined` | Incremental update function applied on every re-render        |

The setup runs once on mount, not on every render. This is the fundamental
contract of the view system.

### Setup Runs Once {#setup-runs-once}

Consider a counter view. In a React-style component, the body of the component
function re-runs on every state change. In swifty-mvc, the setup body runs
once. State is stored on `ctx.updater.data`, and the getter returned by
`useState` always reads the latest value from that store, avoiding stale
closures.

```ts
export default defineView((ctx, params) => {
  // Runs once. The closure captures the ctx, not any specific value.
  const [getCount, setCount] = useState("count", 0);

  // This handler may fire thousands of times, but getCount() always
  // reads the current value from updater.data.
  const handleClick = () => setCount(getCount() + 1);

  return {
    template,
    events: { "btn<click>": handleClick },
  };
});
```

## ViewCtx {#viewctx}

`ViewCtx` is the view context object. It is created by the framework when a
view is mounted and passed to the setup function. All framework APIs are
accessed through it. Because every method is a closure, there is no `this`
binding anywhere.

The full interface is declared in `packages/swifty-mvc/src/types.ts`. The most
important members are described below.

### updater {#viewctx-updater}

The `Updater` manages per-view data binding with change detection and DOM
diffing. It is the data layer of a view.

```ts
ctx.updater.get("count"); // read a single key
ctx.updater.get(); // read the entire data object
ctx.updater.set({ count: 1 }); // merge new data
ctx.updater.digest({ count: 2 }); // merge + trigger re-render
ctx.updater.snapshot(); // record version for altered() check
ctx.updater.altered(); // did data change since snapshot?
ctx.updater.getChangedKeys(); // keys changed in current digest
ctx.updater.forceDigest(); // re-render regardless of changes
ctx.updater.refData; // reference data for template refs
```

The typical flow is: call `updater.set(...)` to merge new data, then call
`updater.digest()` to trigger a render. `useState` hides this behind a getter
and setter pair.

### signature {#viewctx-signature}

```ts
ctx.signature: Ref<number>
```

`signature` is a mutable reference cell. Its value is greater than zero while
the view is alive and is set to zero on destroy. It is incremented on every
render. This counter is the mechanism behind `wrapAsync` and stale-callback
prevention.

```ts
if (ctx.signature.value > 0) {
  // view is still alive
}
```

### render() {#viewctx-render}

`render()` triggers a re-render. It increments `signature`, fires the
`"render"` event, destroys all transient resources (those captured with
`destroyOnRender = true`), and calls `updater.digest()`. It is a no-op if
`signature === 0`.

```ts
ctx.render();
```

### observeLocation() {#viewctx-observelocation}

Declares which URL parameters (and optionally the path) the view observes.
When any observed key changes through `Router.to()` or browser navigation, the
framework calls `ctx.render()` automatically.

```ts
// Comma-separated string
ctx.observeLocation("page,size");

// Array
ctx.observeLocation(["page", "size"]);

// Options object with path observation
ctx.observeLocation({ params: ["page"], path: true });

// Two-argument form
ctx.observeLocation(["page"], true); // true = observe path too
```

### observeState() {#viewctx-observestate}

Declares which `State` keys the view observes. When any observed key changes
via `State.digest()`, the view re-renders.

```ts
ctx.observeState("user,theme");
// or
ctx.observeState(["user", "theme"]);
```

### capture and release {#viewctx-capture-release}

`capture` registers a destroyable resource tied to the view lifecycle. Each
resource has a unique key and an optional `destroy()` method. When the view is
destroyed, every captured resource is destroyed. Resources marked
`destroyOnRender = true` are additionally destroyed on each call to
`ctx.render()`.

```ts
// Store a resource
ctx.capture("timer", {
  destroy() {
    clearInterval(handle);
  },
});

// Retrieve a resource (returns undefined if not found)
const timer = ctx.capture("timer");

// Remove and destroy
ctx.release("timer");

// Remove without destroying
ctx.release("timer", false);
```

If `capture` is called with an existing key, the old resource's `destroy()` is
called before the new one replaces it.

### leaveTip {#viewctx-leavetip}

`leaveTip` registers an unsaved-changes guard. When `condition()` returns
`true`, route navigations are prevented and the browser `beforeunload` dialog
shows `message`. The guard is automatically cleaned up on view destroy.

```ts
ctx.leaveTip("You have unsaved changes. Leave anyway?", () => {
  return ctx.updater.get("isDirty") === true;
});
```

### wrapAsync {#viewctx-wrapasync}

`wrapAsync` captures the current `signature` and returns a wrapper function
that only executes its body if the signature still matches. This silently drops
stale callbacks that arrive after the view has re-rendered or been destroyed.

```ts
const fetchData = ctx.wrapAsync(async () => {
  const res = await api.getData();
  ctx.updater.digest({ data: res });
});

setTimeout(fetchData, 1000);
// If the view re-renders or is destroyed within that second,
// fetchData does nothing.
```

### beginUpdate and endUpdate {#viewctx-zone-management}

These two methods bracket a zone update cycle. `beginUpdate` unmounts child
frames inside a zone before new template output is diffed. `endUpdate`
re-mounts child frames via `frame.mountZone` and flushes deferred `invoke`
calls.

```ts
ctx.beginUpdate(zoneId);
// ... apply new data ...
ctx.endUpdate(zoneId);
```

Most view code does not call these directly; they are called by the framework
during the digest cycle.

### on, off, fire {#viewctx-events}

The view has its own event emitter for internal lifecycle events.

```ts
// Subscribe (returns an unsubscribe function)
const off = ctx.on("destroy", () => {
  console.log("View destroyed");
});

// Unsubscribe
off();
// or
ctx.off("destroy", handler);

// Fire an event
ctx.fire("render");
```

Built-in events: `"render"` fires at the start of every render cycle;
`"destroy"` fires when the view is being torn down; `"unload"` fires when a
view is about to be unloaded due to a route change.

## View Registration {#view-registration}

Every view module must be registered in the view setup registry before it can
be mounted. The registry maps a view path (for example `"app/views/home"`) to
the setup function returned by `defineView`.

```ts
import { registerViewClass } from "swifty-mvc";
import homeSetup from "./views/home";

registerViewClass("app/views/home", homeSetup);
```

`registerViewClass` parses the path via `parseUri`, stripping any query
parameters, and stores the setup in the internal `viewSetupRegistry`. When a
frame calls `mountView("app/views/home")`, the framework looks up the
setup function in this registry.

If the view is not yet registered, the framework falls back to the configured
`require` function to load the module asynchronously. After loading, the
module is registered automatically via `registerViewClass`.

```ts
// In boot config
Framework.boot({
  rootId: "root",
  require(names, params) {
    // Dynamic import via bundler or Module Federation
    return Promise.all(names.map((n) => import(/* @vite-ignore */ n)));
  },
});
```

To invalidate a registered view (used by HMR to force a module reload):

```ts
import { invalidateViewClass } from "swifty-mvc";
invalidateViewClass("app/views/home");
```

## View Lifecycle {#view-lifecycle}

A view passes through three lifecycle phases: mount, render, and unmount.
Each phase has a precise sequence of steps.

### Mount Phase {#mount-phase}

The mount phase is orchestrated by `mountCtx(frame, setup, params)`. The
sequence is:

1. `createCtx(frame)` creates a fresh `ViewCtx` with all framework APIs
   initialised. The `signature` is set to `0`, the `updater` is created with
   `{ vId: frame.id }` as initial data, and empty collections are allocated
   for resources, cleanups, and events.

2. `setCurrentCtx(ctx)` sets the module-level `currentCtx` so that hooks
   called during setup can find the context without it being passed explicitly.

3. `setup(ctx, params)` runs the user-provided setup function. Inside setup,
   hooks like `useState`, `useEffect`, `useStore`, `useInterval`, `useEvent`,
   and `useResource` register state, effects, and subscriptions on the ctx.
   Setup returns `{ template, events, assign? }`.

4. `setCurrentCtx(null)` resets the module-level context. After this point,
   calling hooks throws.

5. The returned `template`, `events`, and `assign` are wired onto the ctx via
   `ctx.setTemplate(...)`, `ctx.setEvents(...)`, and `ctx.setAssign(...)`.

6. `ctx.signature.value = 1` activates the view.

7. `frame.view = ctx` wires the ctx to the owning frame. This must happen
   before render, because the updater's digest function reads `frame.view` to
   locate the template.

8. `registerEvents(ctx)` parses the `events` map and binds DOM event
   listeners. Events declared with a CSS selector are delegated through
   `document.body`. Events declared with `$window` or `$document` attach
   listeners directly to those globals.

9. If a template exists, `ctx.render()` is called, which triggers the first
   render cycle. If no template is present, `ctx.endUpdate()` is called
   instead to mount child frames.

```ts
// Pseudocode of mountCtx
function mountCtx(frame, setup, params) {
  const ctx = createCtx(frame);
  setCurrentCtx(ctx);
  try {
    const descriptor = setup(ctx, params);
    ctx.setTemplate(descriptor.template);
    ctx.setEvents(descriptor.events);
    ctx.setAssign(descriptor.assign);
  } finally {
    setCurrentCtx(null);
  }
  ctx.signature.value = 1;
  frame.view = ctx;
  registerEvents(ctx);
  if (ctx.getTemplate()) {
    ctx.render();
  } else {
    ctx.endUpdate();
  }
  return ctx;
}
```

### Render Phase {#render-phase}

The render phase is triggered by `ctx.render()`, by `updater.digest()` when
data changes, or by the framework when an observed URL or State key changes.

The sequence is:

1. `signature` is checked. If `signature === 0`, the view is destroyed and
   render is a no-op.

2. `signature` is incremented. This invalidates any `wrapAsync` wrappers
   captured under the previous signature.

3. `fire("render")` emits the render event. Subscribers registered via
   `ctx.on("render", ...)` or `useEvent("render", ...)` are notified.

4. `destroyAllResources(ctx, false)` destroys all resources captured with
   `destroyOnRender = true`. Permanent resources (the default) are left
   untouched.

5. If `ctx.renderMethod` is set, it is called. Otherwise `updater.digest()`
   runs. Inside `digest()`, the template function is called with the current
   data, producing either an HTML string or a VDOM tree. The result is diffed
   against the current DOM, and minimal mutations are applied.

6. After the DOM is patched, `endUpdate()` is called if anything changed,
   which re-mounts child frames for any `v-swifty` elements in the new output.

```ts
// Inside ctx.render()
function render() {
  if (signature.value > 0) {
    signature.value++;
    fire("render");
    destroyAllResources(ctx, false);
    updater.digest();
  }
}
```

### Unmount Phase {#unmount-phase}

The unmount phase is orchestrated by `unmountCtx(ctx)`, called by
`frame.unmountView()`. The sequence is:

1. `useEffect` cleanups run in reverse registration order. Each cleanup
   function that was returned from a `useEffect` call is invoked. This clears
   intervals, removes subscriptions, and releases external resources.

2. `unregisterEvents(ctx)` removes all DOM event listeners registered during
   mount, including global listeners on `window` and `document`.

3. `destroyAllResources(ctx, true)` destroys every captured resource, both
   transient and permanent.

4. `fire("destroy", ...)` emits the destroy event with `remove = true` and
   `lastToFirst = true`, so handlers are invoked in reverse order and then
   removed.

5. `EventDelegator.clearRangeEvents(ctx.id)` clears delegated DOM events
   scoped to this frame.

6. `ctx.signature.value = 0` marks the view as destroyed. After this point,
   `render()` and `wrapAsync` wrappers are no-ops.

```ts
// Pseudocode of unmountCtx
function unmountCtx(ctx) {
  for (let i = ctx.cleanups.length - 1; i >= 0; i--) {
    ctx.cleanups[i]();
  }
  unregisterEvents(ctx);
  destroyAllResources(ctx, true);
  if (ctx.signature.value > 0) {
    ctx.fire("destroy", undefined, true, true);
  }
  EventDelegator.clearRangeEvents(ctx.id);
  ctx.signature.value = 0;
}
```

## Embedded Views {#embedded-views}

Views can be nested. A parent view's template can declare child view mount
points using the `v-swifty` attribute on any HTML element. The framework
automatically creates a child frame for each `v-swifty` element and mounts
the specified view inside it.

### v-swifty Attribute {#v-swifty-attribute}

```html
<div v-swifty="app/views/sidebar?section=nav"></div>
<div v-swifty="app/views/detail?id=42"></div>
```

The attribute value is a view path optionally followed by query parameters.
Parameters are parsed via `parseUri` and passed to the child view's setup
function as `params`. Any `{{expression}}` references in the attribute value
are resolved against the parent view's `refData` before parsing.

### mountZone and mountFrame {#mountzone-and-mountframe}

When a parent view renders, the framework scans the new DOM output for
`v-swifty` elements that are not yet bound to a frame. Each such element
receives an auto-generated `id` (if it does not already have one), is marked
as bound, and a child frame is created via `frame.mountFrame(frameId,
viewPath)`. This scan-and-mount process is performed by `frame.mountZone()`,
which is called at the end of every successful digest cycle.

```ts
// Inside frame.mountZone(zoneId?)
const rootEl = document.getElementById(zoneId ?? frame.id);
const viewElements = rootEl.querySelectorAll("[v-swifty]");

for (const el of viewElements) {
  if (el is already bound) continue;
  const elId = ensureElementId(el, "frame_");
  const viewPath = el.getAttribute("v-swifty");
  frame.mountFrame(elId, viewPath);
}
```

`mountFrame` creates a child frame, registers it in the parent's
`childrenMap`, and calls `childFrame.mountView(viewPath)`. The child view's
lifecycle is independent of the parent's, but the child is automatically
unmounted when the parent is destroyed or when the parent's template output
no longer contains the child's mount element.

```ts
// Programmatic mounting from a parent view
export default defineView((ctx) => {
  const mountDetail = (id) => {
    ctx.owner.mountFrame("detail-frame", `app/views/detail?id=${id}`);
  };

  return {
    template,
    events: {
      "showDetail<click>": (e) => mountDetail(e.params.id),
    },
  };
});
```

`unmountZone(zoneId?)` tears down all child frames inside a zone. It is
called automatically before the parent re-renders so that stale child views
do not persist.

## Cross-view Communication {#cross-view-communication}

Views in swifty-mvc are deliberately isolated. They do not share state by
default. Three mechanisms exist for cross-view communication, each suited
to a different scale of data sharing.

### Frame.invoke {#frame-invoke}

`Frame.invoke` is a direct method-call mechanism between a parent and its
child views. A parent can invoke a named method on a child frame, and the
child can respond by updating its own data.

```ts
// Parent view
const childFrame = ctx.owner.mountFrame("child-1", "app/views/child");
childFrame.invoke("refreshData", [{ id: 42 }]);

// Child view declares the method in its events or via ctx.on
ctx.on("invoke:refreshData", (args) => {
  ctx.updater.digest({ detail: fetchDetail(args[0].id) });
});
```

Invocations that arrive before the child view has finished mounting are
queued in `frame.invokeList` and flushed after the child's first
`endUpdate()`.

### State {#state}

`State` is a global singleton for lightweight cross-view data. It is
appropriate for simple shared values such as the current user, a theme
preference, or a page title. For complex reactive state with derived values
and fine-grained subscriptions, `createStore` is preferred.

```ts
import { State } from "swifty-mvc";

// View A writes
State.set({ currentUser: "alice" });
State.digest();

// View B reads and observes
export default defineView((ctx) => {
  ctx.observeState("currentUser");
  ctx.updater.set({ user: State.get("currentUser") });
  return { template };
});
```

When `State.digest()` fires, every view that has called `observeState` with a
matching key is re-rendered automatically.

### Events {#events-cross-view}

The `Router` and `State` objects both expose `on`/`off`/`fire` for custom
event subscription. Views can listen for route changes, state changes, or
application-defined events.

```ts
// Listen for route changes
Router.on("changed", (e) => {
  console.log("navigated to", e.path?.to);
});

// Listen for state changes
State.on("changed", (e) => {
  if (e.keys?.has("theme")) {
    applyTheme(State.get("theme"));
  }
});

// Custom events via createEmitter
import { createEmitter } from "swifty-mvc";
const bus = createEmitter();
bus.on("notification", showNotification);
bus.fire("notification", { msg: "Saved" });
```

Always clean up event listeners on view destroy. The `useEffect` and
`useEvent` hooks automate this:

```ts
export default defineView((ctx) => {
  useEvent("destroy", () => {
    Router.off("changed", myHandler);
  });

  // or with useEffect
  useEffect(() => {
    Router.on("changed", myHandler);
    return () => Router.off("changed", myHandler);
  });

  return { template };
});
```

## Complete Example {#complete-example}

The following view demonstrates the full API surface in a single file.

```ts
import {
  defineView,
  useState,
  useEffect,
  useEvent,
  useInterval,
  useResource,
  State,
  Router,
} from "swifty-mvc";
import template from "./dashboard.html";

export default defineView((ctx, params) => {
  // -- State --
  const [getCount, setCount] = useState("count", 0);
  const [getItems, setItems] = useState("items", []);

  // -- Observe URL and global state --
  ctx.observeLocation(["page", "filter"]);
  ctx.observeState("currentUser");

  // -- Resource: auto-refresh timer --
  const timer = setInterval(() => {
    setCount(getCount() + 1);
  }, 5000);
  useResource("autoRefresh", {
    destroy() {
      clearInterval(timer);
    },
  });

  // -- Side effect: log lifecycle --
  useEffect(() => {
    console.log("Dashboard mounted:", ctx.id);
    return () => console.log("Dashboard unmounted:", ctx.id);
  });

  // -- Unsaved-changes guard --
  ctx.leaveTip("Discard unsaved changes?", () => {
    return ctx.updater.get("isDirty") === true;
  });

  // -- Async data fetch with stale-callback protection --
  const loadData = ctx.wrapAsync(async () => {
    const loc = Router.parse();
    const res = await fetch(`/api/items?page=${loc.get("page")}`);
    const data = await res.json();
    ctx.updater.digest({ items: data });
  });

  loadData();

  // -- assign: incremental update hook --
  const assign = (_options) => {
    ctx.updater.snapshot();
    ctx.updater.set({ user: State.get("currentUser") });
    return ctx.updater.altered();
  };

  // -- Events --
  return {
    template,
    events: {
      "refresh<click>": () => loadData(),
      "nav<click>": (e) => Router.to("/detail", { id: e.params.id }),
      "$window<resize>": () => ctx.render(),
    },
    assign,
  };
});
```
