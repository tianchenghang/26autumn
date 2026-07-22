---
title: View Lifecycle
description: Deep dive into view creation, mounting, rendering, and destruction internals.
---

# View Lifecycle {#view-lifecycle}

Understanding the view lifecycle is essential for debugging, performance optimization, and building advanced patterns. This page traces every step from `frame.mountView` to `unmountCtx`.

## Mount sequence {#mount-sequence}

When `frame.mountView(viewPath, params)` is called:

### Step 1: Unmount previous view {#unmount-previous}

If the Frame already has a mounted view, it is unmounted first. This ensures only one view exists per Frame at any time.

### Step 2: Resolve setup function {#resolve-setup}

The framework looks up the `ViewSetup` function by `viewPath` from the global view registry:

```ts
const setup = viewRegistry.get(viewPath);
```

If the setup is not registered locally (micro-frontend scenario), the framework loads it asynchronously via `Framework.use([viewPath])`.

### Step 3: Create context {#create-context}

`createCtx(frame)` creates a fresh `ViewCtx` object:

```ts
{
  id: frame.id,
  owner: frame,
  updater: createUpdater(frame.id),
  signature: { value: 0 },     // 0 = not yet active
  rendered: { value: false },   // has the first render completed?
  resources: {},
  emitter: createEmitter(),
  cleanups: [],
  // ... getter/setter functions for template, events, assign, etc.
}
```

### Step 4: Run setup {#run-setup}

The framework sets the current context (enabling hooks to access it) and calls the setup function:

```ts
setCurrentCtx(ctx);
const descriptor = setup(ctx, params);
setCurrentCtx(null);
```

During setup, hooks like `useState`, `useEffect`, and `useStore` register their state and subscriptions on the context.

### Step 5: Wire descriptor {#wire-descriptor}

The `template`, `events`, and `assign` from the descriptor are wired onto the context:

```ts
ctx.setTemplate(descriptor.template);
ctx.setEvents(descriptor.events);
ctx.setAssign(descriptor.assign);
```

### Step 6: Activate {#activate}

The signature is set to 1, marking the view as alive:

```ts
ctx.signature.value = 1;
```

### Step 7: Wire to frame {#wire-to-frame}

The view is attached to the frame BEFORE rendering. This ordering prevents a blank-page bug where async-loaded views would render into a detached context:

```ts
frame.view = ctx;
```

### Step 8: Register events {#register-events}

Event handlers from the `events` descriptor are registered with the `EventDelegator`:

```ts
registerEvents(ctx);
```

Each event key is parsed (selector, event type, modifiers) and the delegator's refcount is incremented.

### Step 9: First render {#first-render}

If the view has a template:

```ts
ctx.render();
// -> updater.digest()
// -> template(updater.data) returns HTML/VDOM
// -> DOM diff and reconciliation
// -> ctx.endUpdate()
// -> frame.mountZone() creates child frames
```

If the view has no template (pure controller view):

```ts
ctx.endUpdate();
// -> frame.mountZone() creates child frames
```

## Render cycle {#render-cycle}

After the initial mount, re-renders are triggered by:

1. Updater digest — `ctx.updater.digest()` after `set()` calls
2. State changes — `State.digest()` fires `CHANGED`, dispatcher finds observing views
3. Route changes — `Router.CHANGED` fires, dispatcher finds views observing changed params
4. Store changes — store subscribers call `updater.set() + digest()`
5. Manual render — `ctx.render()`

### ctx.render() {#ctx-render}

```ts
function render() {
  if (ctx.signature.value === 0) return; // destroyed, skip
  ctx.signature.value++; // increment signature
  ctx.fire("render"); // notify listeners
  destroyAllResources(ctx, false); // destroy destroyOnRender resources
  ctx.renderMethod(); // run updater.digest() or custom method
}
```

The signature increment is the mechanism behind `wrapAsync` — any async callbacks wrapped before the render will have a stale signature and silently no-op.

### beginUpdate / endUpdate {#begin-end-update}

These methods bracket the DOM reconciliation phase:

```ts
ctx.beginUpdate(zoneId?)
// -> frame.unmountZone(zoneId)
// Tears down stale child frames before the parent re-renders

ctx.endUpdate(zoneId?)
// -> frame.mountZone(zoneId)
// Creates new child frames after the parent has re-rendered
// On first call, marks rendered.value = true
// Flushes deferred invoke queue via setTimeout
```

## Unmount sequence {#unmount-sequence}

When `unmountCtx(ctx)` is called (via `frame.unmountView()` or Frame destruction):

### Step 1: Effect cleanup {#effect-cleanup}

All `useEffect` cleanup functions run in reverse order:

```ts
for (let i = cleanups.length - 1; i >= 0; i--) {
  cleanups[i]();
}
```

### Step 2: Unregister events {#unregister-events}

All event handlers are removed from the `EventDelegator`:

```ts
unregisterEvents(ctx);
// Decrements delegator refcounts for each event type
```

### Step 3: Destroy resources {#destroy-resources}

All captured resources are destroyed:

```ts
destroyAllResources(ctx, true);
// Iterates ctx.resources, calls .destroy() on each
```

### Step 4: Fire destroy event {#fire-destroy}

```ts
ctx.fire("destroy", undefined, true, true);
// remove=true: all destroy listeners are removed after firing
// lastToFirst=true: listeners fire in reverse registration order
```

### Step 5: Clear range events {#clear-range-events}

```ts
EventDelegator.clearRangeEvents(ctx.id);
// Removes range event markers from the DOM
```

### Step 6: Invalidate signature {#invalidate-signature}

```ts
ctx.signature.value = 0;
// All pending wrapAsync callbacks will silently no-op
```

## Signature mechanism {#signature-mechanism}

The `signature` object is the core of Swifty MVC's async safety:

```ts
ctx.wrapAsync(fn) {
  const captured = ctx.signature.value
  return (...args) => {
    if (ctx.signature.value > 0 && ctx.signature.value === captured) {
      return fn(...args)
    }
    return undefined
  }
}
```

Scenarios:

- View is alive and no re-render happened: `signature === captured`, callback fires
- View re-rendered (signature incremented): `signature !== captured`, callback silently dropped
- View destroyed (signature = 0): `signature === 0`, callback silently dropped

This prevents the class of bugs where async callbacks update unmounted views, cause errors, or produce stale UI.

## The invoke queue {#invoke-queue}

When `frame.invoke(name, args)` is called but the child view has not yet rendered (method is not available), the invocation is queued:

```ts
frame.invokeList.push({ key: name, args });
```

After the child view's first render completes, `endUpdate` flushes the queue:

```ts
setTimeout(() => {
  for (const item of invokeList) {
    view[item.key](item.args);
  }
}, 0);
```

The `setTimeout` ensures the child view is fully mounted and its DOM is stable before invocations fire.

## Dispatcher {#dispatcher}

The framework's dispatcher connects State and Router changes to view re-renders:

```ts
// On State CHANGED:
function dispatcherNotifyStateChange(stateKeys) {
  Frame.getAll().forEach((frame) => {
    const view = frame.view;
    if (view && stateIsObserveChanged(view, stateKeys)) {
      view.render();
    }
  });
}

// On Router CHANGED:
function dispatcherNotifyRouteChange(locationDiff) {
  Frame.getAll().forEach((frame) => {
    const view = frame.view;
    if (view && viewIsObserveChanged(view, locationDiff.changed)) {
      view.render();
    }
  });
}
```

The dispatcher walks the entire Frame registry. Only views that declared `observeState` or `observeLocation` for the changed keys are re-rendered.

## Next steps {#next-steps}

- [Rendering Engine](/docs/en/swifty-mvc/guide/advanced/rendering-engine) — DOM diff and VDOM reconciliation
- [Store Deep Dive](/docs/en/swifty-mvc/guide/advanced/store) — advanced store patterns
- [Performance](/docs/en/swifty-mvc/guide/advanced/performance) — optimization techniques
