# Hooks API Reference {#hooks-api-reference}

Swifty hooks provide a functional API for managing view state, side effects, and resources inside a view's setup function. They are imported from `swifty-mvc` and operate through a module-level context that is set before the setup function runs and cleared immediately after.

Unlike React hooks, Swifty hooks run inside a setup function that executes exactly once when the view mounts. This eliminates the need for dependency arrays, memoization, and the complexities associated with re-rendering.

All hooks documented here must be called inside a view setup function passed to `defineView`. Calling them outside a setup function throws an error.

---

## useState() {#usestate}

```ts
function useState<T>(key: string, initial: T): [() => T, (v: T) => void];
```

### Details {#usestate-details}

`useState` declares view-local state backed by the view's `updater.data` store. It returns a getter-setter pair that always reads from and writes to the current updater data, avoiding stale closure issues.

Parameters:

| Name      | Type     | Description                                                    |
| --------- | -------- | -------------------------------------------------------------- |
| `key`     | `string` | The property name in `updater.data` where the value is stored. |
| `initial` | `T`      | The initial value, set only if the key does not already exist. |

The getter function returns the current value from `updater.data[key]` each time it is called. The setter function writes to `updater.data` and triggers a digest cycle, which causes the template to re-render.

Because state lives in `updater.data`, it is accessible both in JavaScript via the getter and in templates via interpolation. Event handlers that call the getter always see the latest value even if the setup function ran long ago, because the getter reads from the live data store rather than a captured closure.

### Example {#usestate-example}

```ts
import { defineView } from "swifty-mvc";
import { useState } from "swifty-mvc";
import template from "./counter.html";

export default defineView((ctx) => {
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

### See Also {#usestate-see-also}

- [Hooks guide - useState](../guide/hooks#usestate)
- [useEffect](#useeffect)
- [useStore](#usestore)

---

## useEffect() {#useeffect}

```ts
function useEffect(fn: () => (() => void) | void, _deps?: unknown[]): void;
```

### Details {#useeffect-details}

`useEffect` registers a side effect that runs immediately during setup and optionally returns a cleanup function. The cleanup is called when the view is destroyed or during hot module reloading.

Parameters:

| Name    | Type                         | Description                                                                         |
| ------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `fn`    | `() => (() \> void) \| void` | A function that performs the side effect and optionally returns a cleanup function. |
| `_deps` | `unknown[]`                  | Optional dependency array. Ignored in Swifty since setup runs only once.            |

Unlike React's `useEffect`, this hook runs synchronously during setup and does not re-run when dependencies change. The dependency array parameter exists for API compatibility but has no effect.

The cleanup function returned from `fn` is pushed onto `ctx.cleanups` and invoked automatically when the view is destroyed. If no cleanup is needed, the function may return nothing.

### Example {#useeffect-example}

```ts
import { defineView } from "swifty-mvc";
import { useState, useEffect } from "swifty-mvc";
import template from "./timer.html";

export default defineView((ctx) => {
  const [getElapsed, setElapsed] = useState("elapsed", 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(getElapsed() + 1);
    }, 1000);

    return () => clearInterval(timer);
  });

  return { template, events: {} };
});
```

### See Also {#useeffect-see-also}

- [Hooks guide - useEffect](../guide/hooks#useeffect)
- [useInterval](#useinterval)
- [useTimeout](#usetimeout)
- [useEvent](#useevent)

---

## useStore() {#usestore}

```ts
function useStore<T extends Record<string, unknown>>(
  store: StoreApi<T>,
  selector?: (s: T) => Partial<T>,
): () => Partial<T>;
```

### Details {#usestore-details}

`useStore` binds a Zustand-compatible store to the view, automatically syncing store state to `updater.data` and unsubscribing when the view is destroyed.

Parameters:

| Name       | Type                   | Description                                                         |
| ---------- | ---------------------- | ------------------------------------------------------------------- |
| `store`    | `StoreApi<T>`          | A store created with `createStore` or a Zustand-compatible store.   |
| `selector` | `(s: T) => Partial<T>` | Optional function that extracts specific keys from the store state. |

Returns a getter function that reads the selected state from `updater.data`.

When no selector is provided, all non-function properties from the store are synced to `updater.data`. This makes them available in templates directly. When a selector is provided, only the returned keys are synced, providing fine-grained control over which parts of the store trigger re-renders.

The underlying `bindStore` function subscribes to store changes and calls `ctx.updater.set(selected).digest()` on each update. When the view is destroyed, the subscription is automatically removed.

### Example {#usestore-example}

```ts
import { defineView } from "swifty-mvc";
import { useStore } from "swifty-mvc";
import { useUserStore } from "../stores/user";
import template from "./profile.html";

export default defineView((ctx) => {
  const getUserState = useStore(useUserStore, (s) => ({
    name: s.name,
    avatar: s.avatar,
  }));

  return {
    template,
    events: {
      "login<click>"() {
        useUserStore.getState().login("alice");
      },
      "logout<click>"() {
        useUserStore.getState().logout();
      },
    },
  };
});
```

### See Also {#usestore-see-also}

- [Hooks guide - useStore](../guide/hooks#usestore)
- [createStore](../api/store#createstore)
- [bindStore](../api/store#bindstore)

---

## useInterval() {#useinterval}

```ts
function useInterval(fn: () => void, delay: number): void;
```

### Details {#useinterval-details}

`useInterval` sets up a recurring timer that is automatically cleared when the view is destroyed.

Parameters:

| Name    | Type         | Description                                 |
| ------- | ------------ | ------------------------------------------- |
| `fn`    | `() => void` | The function to call on each interval tick. |
| `delay` | `number`     | The interval duration in milliseconds.      |

This is a convenience wrapper around `setInterval` that handles cleanup automatically. The timer ID is captured and a cleanup function that calls `clearInterval` is pushed onto `ctx.cleanups`.

### Example {#useinterval-example}

```ts
import { defineView } from "swifty-mvc";
import { useState, useInterval } from "swifty-mvc";
import template from "./clock.html";

export default defineView((ctx) => {
  const [getTime, setTime] = useState("time", Date.now());

  useInterval(() => {
    setTime(Date.now());
  }, 1000);

  return { template, events: {} };
});
```

### See Also {#useinterval-see-also}

- [Hooks guide - useInterval](../guide/hooks#useinterval)
- [useTimeout](#usetimeout)
- [useEffect](#useeffect)

---

## useTimeout() {#usetimeout}

```ts
function useTimeout(fn: () => void, delay: number): void;
```

### Details {#usetimeout-details}

`useTimeout` sets up a one-shot timer that is automatically cleared when the view is destroyed.

Parameters:

| Name    | Type         | Description                           |
| ------- | ------------ | ------------------------------------- |
| `fn`    | `() => void` | The function to call after the delay. |
| `delay` | `number`     | The timeout duration in milliseconds. |

If the view is destroyed before the timeout fires, the callback is never executed. A delay of 0 defers execution until after the current call stack clears, similar to `setTimeout` with no delay argument.

### Example {#usetimeout-example}

```ts
import { defineView } from "swifty-mvc";
import { useState, useTimeout } from "swifty-mvc";
import template from "./notification.html";

export default defineView((ctx) => {
  const [getShowTip, setShowTip] = useState("showTip", false);

  useTimeout(() => {
    setShowTip(true);
  }, 3000);

  return {
    template,
    events: {
      "dismiss<click>"() {
        setShowTip(false);
      },
    },
  };
});
```

### See Also {#usetimeout-see-also}

- [Hooks guide - useTimeout](../guide/hooks#usetimeout)
- [useInterval](#useinterval)
- [useEffect](#useeffect)

---

## useResource() {#useresource}

```ts
function useResource(
  key: string,
  resource: unknown,
  destroyOnRender?: boolean,
): void;
```

### Details {#useresource-details}

`useResource` captures a destroyable resource and ensures it is cleaned up when the view is destroyed or, optionally, on each render.

Parameters:

| Name              | Type      | Description                                                               |
| ----------------- | --------- | ------------------------------------------------------------------------- |
| `key`             | `string`  | A unique identifier for the resource within the view.                     |
| `resource`        | `unknown` | An object with a `destroy()` method.                                      |
| `destroyOnRender` | `boolean` | If true, the resource is destroyed before each render. Defaults to false. |

This hook is useful for managing Service instances, observers, subscriptions, or any object that requires explicit cleanup.

When `destroyOnRender` is true, the resource is destroyed before each re-render and should be recreated if needed. When false, the resource persists until the view is destroyed.

Internally, `useResource` calls `ctx.capture(key, resource, destroyOnRender)`, which stores the resource in the view's resource map and ensures `destroy()` is called at the appropriate time.

### Example {#useresource-example}

```ts
import { defineView } from "swifty-mvc";
import { useResource } from "swifty-mvc";
import { createService } from "swifty-mvc";
import template from "./data-view.html";

export default defineView((ctx) => {
  const userService = createService(() => fetch("/api/user"));

  useResource("userService", userService.instance(), true);

  return {
    template,
    events: {
      "refresh<click>"() {
        userService.fetch();
      },
    },
  };
});
```

### See Also {#useresource-see-also}

- [Hooks guide - useResource](../guide/hooks#useresource)
- [createService](../api/service#createservice)
- [useEffect](#useeffect)

---

## useEvent() {#useevent}

```ts
function useEvent(event: string, handler: AnyFunc): void;
```

### Details {#useevent-details}

`useEvent` registers an event handler on the view's internal emitter and automatically removes it when the view is destroyed.

Parameters:

| Name      | Type      | Description                                                     |
| --------- | --------- | --------------------------------------------------------------- |
| `event`   | `string`  | The event name, such as "destroy", "render", or a custom event. |
| `handler` | `AnyFunc` | The function to call when the event fires.                      |

This hook is useful for reacting to view lifecycle events or custom events fired by other parts of your application. The handler is registered via `ctx.on(event, handler)` and the returned unsubscribe function is pushed to `ctx.cleanups` for automatic cleanup.

Built-in events include "destroy" (fired when the view is destroyed) and "render" (fired after each template render).

### Example {#useevent-example}

```ts
import { defineView } from "swifty-mvc";
import { useState, useEvent } from "swifty-mvc";
import template from "./lifecycle.html";

export default defineView((ctx) => {
  const [getRenderCount, setRenderCount] = useState("renderCount", 0);

  useEvent("render", () => {
    setRenderCount(getRenderCount() + 1);
  });

  useEvent("destroy", () => {
    console.log("View destroyed:", ctx.id);
  });

  return { template, events: {} };
});
```

### See Also {#useevent-see-also}

- [Hooks guide - useEvent](../guide/hooks#useevent)
- [useEffect](#useeffect)
- [ViewCtx.on](../api/view#viewctx-on)

---

## useUrlState() {#useurlstate}

```ts
function useUrlState<S extends Record<string, string>>(
  view: ViewCtx,
  initialState?: S,
): [Readonly<S>, (patch: Partial<S> | ((prev: S) => Partial<S>)) => void];
```

### Details {#useurlstate-details}

`useUrlState` synchronizes view state with URL query parameters. It reads initial values from the URL, provides defaults for missing parameters, and writes changes back to the URL via the router.

Parameters:

| Name           | Type      | Description                                                                |
| -------------- | --------- | -------------------------------------------------------------------------- |
| `view`         | `ViewCtx` | The view context. Required, unlike other hooks.                            |
| `initialState` | `S`       | Default values for URL parameters. Keys not in the URL use these defaults. |

Returns a tuple containing a readonly state object with current parameter values and a `setState` function that updates the URL.

When `setState` is called, it merges the provided patch with the current state and calls `Router.to(resolved)` to update the URL. Other URL parameters not managed by `useUrlState` are preserved. The hook automatically calls `view.observeLocation(keys)` so the view re-renders when the URL changes via browser navigation or direct `Router.to()` calls.

All URL parameter values are strings. If you need to work with numbers or booleans, convert them in your event handlers.

### Example {#useurlstate-example}

```ts
import { defineView } from "swifty-mvc";
import { useUrlState } from "swifty-mvc";
import template from "./list.html";

export default defineView((ctx) => {
  const [state, setState] = useUrlState(ctx, { page: "1", size: "20" });

  ctx.updater
    .set({
      currentPage: Number(state.page),
      pageSize: Number(state.size),
    })
    .digest();

  return {
    template,
    events: {
      "nextPage<click>"() {
        setState((prev) => ({
          page: String(Number(prev.page) + 1),
        }));
      },
      "prevPage<click>"() {
        setState((prev) => ({
          page: String(Math.max(1, Number(prev.page) - 1)),
        }));
      },
    },
  };
});
```

### See Also {#useurlstate-see-also}

- [Hooks guide - useUrlState](../guide/hooks#useurlstate)
- [Router](../api/router#router)
- [ViewCtx.observeLocation](../api/view#viewctx-observelocation)
