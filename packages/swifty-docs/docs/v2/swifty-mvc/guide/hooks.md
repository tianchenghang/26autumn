# Hooks

## Overview {#overview}

Swifty hooks are functions that let you manage state and side effects inside a view's setup function. They provide a declarative way to work with view lifecycle, reactive data, and external resources without managing cleanup manually.

Unlike React hooks, Swifty hooks run inside a setup function that executes exactly once when the view mounts. This fundamental difference eliminates the need for dependency arrays, memoization, and many of the complexities associated with React's rendering model.

```ts
import { defineView } from "swifty-mvc";
import { useState, useEffect } from "swifty-mvc";
import template from "./index.html";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCount(getCount() + 1);
    }, 1000);

    return () => clearInterval(timer);
  });

  return {
    template,
    events: {
      "increment<click>"() {
        setCount(getCount() + 1);
      },
    },
  };
});
```

The setup function runs once, hooks register themselves with the view context, and the returned event handlers can reference the getter functions without worrying about stale closures.

## The Current Context Mechanism {#current-context}

Hooks rely on a module-level variable called `currentCtx` that is set before the setup function runs and cleared immediately after. This mechanism allows hooks to access the view's context without explicitly passing it as an argument.

When `mountCtx` is called to mount a view, it performs these steps in order:

1. Creates a new `ViewCtx` via `createCtx(frame)`
2. Calls `setCurrentCtx(ctx)` to establish the current context
3. Executes the setup function
4. Calls `setCurrentCtx(null)` to clear the context

Inside any hook, calling `getCtx()` retrieves the current context. If hooks are called outside a setup function, an error is thrown to prevent misuse.

```ts
let currentCtx: ViewCtx | null = null;

export function setCurrentCtx(ctx: ViewCtx | null): void {
  currentCtx = ctx;
}

function getCtx(): ViewCtx {
  if (!currentCtx) {
    throw new Error("Hooks can only be called inside a view setup function");
  }
  return currentCtx;
}
```

This pattern is similar to React's dispatcher mechanism but simpler because the context only needs to be available during the initial setup, not across multiple render passes.

## Available Hooks {#available-hooks}

### useState {#usestate}

`useState` declares view-local state backed by the view's `updater.data` store. It returns a getter-setter pair that always reads from and writes to the current updater data, avoiding stale closure issues.

```ts
export function useState<T>(key: string, initial: T): [() => T, (v: T) => void];
```

Parameters:

- `key`: The property name in `updater.data` where the value is stored
- `initial`: The initial value, set only if the key does not already exist

Returns a tuple containing:

- A getter function that returns the current value from `updater.data`
- A setter function that updates the value and triggers a digest cycle

Example usage:

```ts
import { useState } from "swifty-mvc";

export default defineView((ctx) => {
  const [getName, setName] = useState("name", "");
  const [getAge, setAge] = useState("age", 18);

  return {
    template,
    events: {
      "updateName<click>"() {
        setName("Alice");
      },
      "incrementAge<click>"() {
        setAge(getAge() + 1);
      },
    },
  };
});
```

The getter always reads from `ctx.updater.data[key]`, so event handlers that call `getName()` or `getAge()` always see the latest value even if the setup function ran long ago. The setter calls `ctx.updater.set({ [key]: v }).digest()` to update the data and trigger a re-render.

Because state lives in `updater.data`, it is also accessible directly in templates:

```html
<div>{{=name}} is {{=age}} years old</div>
<button @click="updateName()">Update Name</button>
<button @click="incrementAge()">Increment Age</button>
```

### useEffect {#useeffect}

`useEffect` registers a side effect that runs immediately during setup and optionally returns a cleanup function. The cleanup is called when the view is destroyed or during hot module reloading.

```ts
export function useEffect(
  fn: () => (() => void) | void,
  _deps?: unknown[],
): void;
```

Parameters:

- `fn`: A function that performs the side effect and optionally returns a cleanup function
- `_deps`: Optional dependency array (ignored in Swifty since setup runs only once)

Unlike React's `useEffect`, this hook runs synchronously during setup and does not re-run when dependencies change. The dependency array parameter exists for API compatibility but has no effect.

Example: managing a timer

```ts
import { useEffect } from "swifty-mvc";

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

Example: subscribing to an external event emitter

```ts
import { useEffect } from "swifty-mvc";
import { globalEmitter } from "./global-emitter";

export default defineView((ctx) => {
  useEffect(() => {
    const handler = (data) => {
      ctx.updater.set({ notification: data.message }).digest();
    };

    globalEmitter.on("notify", handler);

    return () => {
      globalEmitter.off("notify", handler);
    };
  });

  return { template, events: {} };
});
```

Example: performing a side effect that needs no cleanup

```ts
import { useEffect } from "swifty-mvc";

export default defineView((ctx) => {
  useEffect(() => {
    console.log("View mounted at", Date.now());
    analytics.track("view_mounted", { viewId: ctx.id });
  });

  return { template, events: {} };
});
```

### useStore {#usestore}

`useStore` binds a Zustand-style store to the view, automatically syncing store state to `updater.data` and unsubscribing when the view is destroyed.

```ts
export function useStore<T extends Record<string, unknown>>(
  store: StoreApi<T>,
  selector?: (s: T) => Partial<T>,
): () => Partial<T>;
```

Parameters:

- `store`: A store created with `createStore` or a Zustand-compatible store
- `selector`: Optional function that extracts specific keys from the store state

Returns a getter function that reads the selected state from `updater.data`.

Example: binding an entire store

```ts
import { useStore } from "swifty-mvc";
import { useUserStore } from "../stores/user";

export default defineView((ctx) => {
  const getUserState = useStore(useUserStore);

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

When no selector is provided, all non-function properties from the store are synced to `updater.data`. This makes them available in templates directly.

Example: using a selector to pick specific keys

```ts
import { useStore } from "swifty-mvc";
import { useAppStore } from "../stores/app";

export default defineView((ctx) => {
  const getTheme = useStore(useAppStore, (state) => ({
    theme: state.theme,
    language: state.language,
  }));

  return {
    template,
    events: {
      "toggleTheme<click>"() {
        const current = getTheme();
        useAppStore
          .getState()
          .setTheme(current.theme === "dark" ? "light" : "dark");
      },
    },
  };
});
```

The selector function is called whenever the store updates, and only the returned keys are synced to `updater.data`. This provides fine-grained control over which parts of the store trigger re-renders.

The underlying `bindStore` function subscribes to store changes and calls `ctx.updater.set(selected).digest()` on each update. When the view is destroyed, the subscription is automatically removed.

### useInterval {#useinterval}

`useInterval` sets up a recurring timer that is automatically cleared when the view is destroyed.

```ts
export function useInterval(fn: () => void, delay: number): void;
```

Parameters:

- `fn`: The function to call on each interval tick
- `delay`: The interval duration in milliseconds

This is a convenience wrapper around `setInterval` that handles cleanup automatically.

Example: updating a clock display

```ts
import { useInterval } from "swifty-mvc";

export default defineView((ctx) => {
  const [getTime, setTime] = useState("time", Date.now());

  useInterval(() => {
    setTime(Date.now());
  }, 1000);

  return { template, events: {} };
});
```

Example: polling for data

```ts
import { useInterval } from "swifty-mvc";
import { fetchData } from "../services/api";

export default defineView((ctx) => {
  const [getData, setData] = useState("data", null);

  useInterval(async () => {
    const result = await fetchData();
    setData(result);
  }, 5000);

  return { template, events: {} };
});
```

Internally, `useInterval` calls `setInterval` and pushes a cleanup function to `ctx.cleanups` that clears the timer when the view is destroyed.

### useTimeout {#usetimeout}

`useTimeout` sets up a one-shot timer that is automatically cleared when the view is destroyed.

```ts
export function useTimeout(fn: () => void, delay: number): void;
```

Parameters:

- `fn`: The function to call after the delay
- `delay`: The timeout duration in milliseconds

If the view is destroyed before the timeout fires, the callback is never executed.

Example: showing a delayed notification

```ts
import { useTimeout } from "swifty-mvc";

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

Example: deferring initialization

```ts
import { useTimeout } from "swifty-mvc";

export default defineView((ctx) => {
  useTimeout(() => {
    heavyInitialization();
  }, 0);

  return { template, events: {} };
});
```

A delay of 0 defers execution until after the current call stack clears, similar to `setTimeout` with no delay argument.

### useResource {#useresource}

`useResource` captures a destroyable resource and ensures it is cleaned up when the view is destroyed or, optionally, on each render.

```ts
export function useResource(
  key: string,
  resource: unknown,
  destroyOnRender?: boolean,
): void;
```

Parameters:

- `key`: A unique identifier for the resource
- `resource`: An object with a `destroy()` method
- `destroyOnRender`: If true, the resource is destroyed before each render; defaults to false

This hook is useful for managing Service instances, observers, subscriptions, or any object that requires explicit cleanup.

Example: managing a service instance

```ts
import { useResource } from "swifty-mvc";
import { createService } from "swifty-mvc";

export default defineView((ctx) => {
  const HttpService = createService((payload, callback) => {
    fetch(payload.get("url"))
      .then((r) => r.json())
      .then((json) => {
        payload.set("data", json);
        callback();
      })
      .catch((err) => callback(err));
  });

  HttpService.add({ name: "getUser", url: "/api/user" });

  const service = HttpService.instance();
  useResource("userService", service, true);

  return {
    template,
    events: {
      "refresh<click>"() {
        service.all({ name: "getUser" }, (err, payload) => {
          if (!err) ctx.updater.set({ user: payload.get("data") }).digest();
        });
      },
    },
  };
});
```

When `destroyOnRender` is true, the resource is destroyed before each re-render and should be recreated if needed. When false, the resource persists until the view is destroyed.

Example: capturing an observer

```ts
import { useResource } from "swifty-mvc";

export default defineView((ctx) => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        ctx.updater.set({ visible: true }).digest();
      }
    });
  });

  const destroyable = {
    destroy() {
      observer.disconnect();
    },
  };

  useResource("intersectionObserver", destroyable);

  return { template, events: {} };
});
```

Internally, `useResource` calls `ctx.capture(key, resource, destroyOnRender)`, which stores the resource in the view's resource map and ensures `destroy()` is called at the appropriate time.

### useEvent {#useevent}

`useEvent` registers an event handler on the view's internal emitter and automatically removes it when the view is destroyed.

```ts
export function useEvent(event: string, handler: AnyFunc): void;
```

Parameters:

- `event`: The event name, such as "destroy", "render", or a custom event
- `handler`: The function to call when the event fires

This hook is useful for reacting to view lifecycle events or custom events fired by other parts of your application.

Example: logging view destruction

```ts
import { useEvent } from "swifty-mvc";

export default defineView((ctx) => {
  useEvent("destroy", () => {
    console.log("View destroyed:", ctx.id);
  });

  return { template, events: {} };
});
```

Example: reacting to render events

```ts
import { useEvent } from "swifty-mvc";

export default defineView((ctx) => {
  const [getRenderCount, setRenderCount] = useState("renderCount", 0);

  useEvent("render", () => {
    setRenderCount(getRenderCount() + 1);
  });

  return { template, events: {} };
});
```

Example: listening to custom events

```ts
import { useEvent } from "swifty-mvc";

export default defineView((ctx) => {
  useEvent("data-loaded", (payload) => {
    ctx.updater.set({ data: payload.data }).digest();
  });

  return {
    template,
    events: {
      "loadData<click>"() {
        ctx.fire("data-loaded", { data: [1, 2, 3] });
      },
    },
  };
});
```

The handler is registered via `ctx.on(event, handler)` and the returned unsubscribe function is pushed to `ctx.cleanups` for automatic cleanup.

### useUrlState {#useurlstate}

`useUrlState` synchronizes view state with URL query parameters. It reads initial values from the URL, provides defaults for missing parameters, and writes changes back to the URL via the router.

```ts
export function useUrlState<S extends Record<string, string>>(
  view: ViewCtx,
  initialState?: S,
): [Readonly<S>, (patch: Partial<S> | ((prev: S) => Partial<S>)) => void];
```

Parameters:

- `view`: The view context (required, unlike other hooks)
- `initialState`: Default values for URL parameters; keys not in the URL use these defaults

Returns a tuple containing:

- A readonly state object with current parameter values
- A setState function that updates the URL

Example: pagination with URL state

```ts
import { useUrlState } from "swifty-mvc";

export default defineView((ctx) => {
  const [state, setState] = useUrlState(ctx, { page: "1", size: "20" });

  ctx.updater
    .set({
      currentPage: state.page,
      pageSize: state.size,
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
      "changeSize<change>"(e) {
        setState({ size: e.target.value });
      },
    },
  };
});
```

When `setState` is called, it merges the provided patch with the current state and calls `Router.to(resolved)` to update the URL. Other URL parameters not managed by `useUrlState` are preserved.

The hook automatically calls `view.observeLocation(keys)` so the view re-renders when the URL changes via browser navigation or direct `Router.to()` calls.

Example: filtering and sorting

```ts
import { useUrlState } from "swifty-mvc";

export default defineView((ctx) => {
  const [state, setState] = useUrlState(ctx, {
    filter: "",
    sort: "name",
    order: "asc",
  });

  ctx.updater
    .set({
      filter: state.filter,
      sortField: state.sort,
      sortOrder: state.order,
    })
    .digest();

  return {
    template,
    events: {
      "applyFilter<change>"(e) {
        setState({ filter: e.target.value });
      },
      "sortBy<click>"(e) {
        const field = e.params.field;
        setState((prev) => ({
          sort: field,
          order: prev.sort === field && prev.order === "asc" ? "desc" : "asc",
        }));
      },
    },
  };
});
```

All URL parameter values are strings. If you need to work with numbers or booleans, convert them in your event handlers as shown in the pagination example.

## Differences from React Hooks {#differences-from-react}

Swifty hooks and React hooks share similar names but operate under fundamentally different models. Understanding these differences is essential for developers coming from React.

Setup runs once, not on every render. In React, component functions run on every render, and hooks must be called in the same order each time. In Swifty, the setup function runs exactly once when the view mounts. Hooks register themselves with the view context during this single execution.

No dependency arrays. React's `useEffect` requires dependency arrays to control when effects re-run. Swifty's `useEffect` runs once during setup and never re-runs. The cleanup function handles teardown when the view is destroyed. The dependency array parameter exists for compatibility but is ignored.

Getters instead of values. React's `useState` returns `[value, setter]` where `value` is the current state at render time. Swifty returns `[getter, setter]` where the getter is a function that always reads from `updater.data`. This eliminates stale closure problems because event handlers always see the latest value when they call the getter.

No memoization needed. React requires `useMemo` and `useCallback` to prevent unnecessary re-renders and maintain referential equality. Swifty does not re-run setup, so there is no need to memoize values or callbacks. Event handlers defined in setup are stable for the lifetime of the view.

No rules of hooks violations. React's rules forbid calling hooks conditionally or in loops because the order must be consistent across renders. Swifty hooks can be called in any pattern during setup because setup runs only once. However, hooks still cannot be called outside setup or after setup completes.

State lives in updater.data. React state is opaque and managed by the framework. Swifty state is stored in `ctx.updater.data`, which is also the data source for templates. This makes state accessible both in JavaScript (via getters) and in templates (via interpolation).

Explicit cleanup. React effects return cleanup functions that run before the next effect or on unmount. Swifty effects return cleanup functions that run only on view destruction or HMR re-setup. There is no concept of "running cleanup before the next effect" because effects do not re-run.

Context via module variable. React uses a dispatcher mechanism that tracks which component is currently rendering. Swifty uses a simpler module-level `currentCtx` that is set before setup and cleared after. This works because setup is synchronous and runs once.

## Custom Hooks {#custom-hooks}

Custom hooks are functions that compose built-in hooks to encapsulate reusable logic. They follow the same rules as built-in hooks: they must be called during setup and can access the current context.

Example: a custom hook for window size

```ts
import { useState, useEffect } from "swifty-mvc";

export function useWindowSize() {
  const [getWidth, setWidth] = useState("windowWidth", window.innerWidth);
  const [getHeight, setHeight] = useState("windowHeight", window.innerHeight);

  useEffect(() => {
    const handler = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };

    window.addEventListener("resize", handler);

    return () => {
      window.removeEventListener("resize", handler);
    };
  });

  return { getWidth, getHeight };
}
```

Using the custom hook in a view:

```ts
import { useWindowSize } from "../hooks/useWindowSize";

export default defineView((ctx) => {
  const { getWidth, getHeight } = useWindowSize();

  ctx.updater
    .set({
      width: getWidth(),
      height: getHeight(),
    })
    .digest();

  return { template, events: {} };
});
```

Example: a custom hook for form validation

```ts
import { useState } from "swifty-mvc";

export function useFormValidation(fields) {
  const [getErrors, setErrors] = useState("errors", {});
  const [getValues, setValues] = useState("values", {});

  const validate = () => {
    const errors = {};
    const values = getValues();

    for (const [field, rules] of Object.entries(fields)) {
      const value = values[field];
      for (const rule of rules) {
        const error = rule(value);
        if (error) {
          errors[field] = error;
          break;
        }
      }
    }

    setErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const setValue = (field, value) => {
    setValues({ ...getValues(), [field]: value });
  };

  return { getErrors, getValues, setValue, validate };
}
```

Using the validation hook:

```ts
import { useFormValidation } from "../hooks/useFormValidation";

const required = (value) => (value ? null : "Required");
const email = (value) => (/\S+@\S+/.test(value) ? null : "Invalid email");

export default defineView((ctx) => {
  const { getErrors, getValues, setValue, validate } = useFormValidation({
    username: [required],
    email: [required, email],
  });

  return {
    template,
    events: {
      "username<change>"(e) {
        setValue("username", e.target.value);
      },
      "email<change>"(e) {
        setValue("email", e.target.value);
      },
      "submit<click>"() {
        if (validate()) {
          submitForm(getValues());
        }
      },
    },
  };
});
```

Example: a custom hook for async operations

```ts
import { useState, useResource } from "swifty-mvc";
import { createService } from "swifty-mvc";

export function useAsync(endpointName) {
  const [getData, setData] = useState("data", null);
  const [getError, setError] = useState("error", null);
  const [getLoading, setLoading] = useState("loading", false);

  const HttpService = createService((payload, callback) => {
    fetch(payload.get("url"))
      .then((r) => r.json())
      .then((json) => {
        payload.set("data", json);
        callback();
      })
      .catch((err) => callback(err));
  });

  const service = HttpService.instance();
  useResource("asyncService", service, true);

  const execute = (attrs) => {
    setLoading(true);
    setError(null);

    service.all(attrs, (errors, payload) => {
      if (errors && errors.length) {
        setError(errors[0].message);
      } else {
        setData(payload.get("data"));
      }
      setLoading(false);
    });
  };

  return { getData, getError, getLoading, execute };
}
```

Using the async hook:

```ts
import { useAsync } from "../hooks/useAsync";

export default defineView((ctx) => {
  const { getData, getError, getLoading, execute } = useAsync(() =>
    fetch("/api/users").then((r) => r.json()),
  );

  return {
    template,
    events: {
      "loadUsers<click>"() {
        execute();
      },
    },
  };
});
```

Custom hooks can call other custom hooks, enabling composition of complex behaviors from simpler building blocks.

## Complete Examples {#complete-examples}

### Counter with persistence {#counter-persistence}

A counter that persists its value to localStorage and syncs across tabs.

```ts
import { defineView } from "swifty-mvc";
import { useState, useEffect, useInterval } from "swifty-mvc";
import template from "./counter.html";

export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);

  useEffect(() => {
    const stored = localStorage.getItem("counter");
    if (stored) {
      setCount(Number(stored));
    }

    const handler = (e) => {
      if (e.key === "counter") {
        setCount(Number(e.newValue));
      }
    };

    window.addEventListener("storage", handler);

    return () => {
      window.removeEventListener("storage", handler);
    };
  });

  useInterval(() => {
    localStorage.setItem("counter", String(getCount()));
  }, 1000);

  return {
    template,
    events: {
      "increment<click>"() {
        setCount(getCount() + 1);
      },
      "decrement<click>"() {
        setCount(getCount() - 1);
      },
      "reset<click>"() {
        setCount(0);
      },
    },
  };
});
```

Template:

```html
<div class="counter">
  <p>Count: {{=count}}</p>
  <button @click="increment()">+</button>
  <button @click="decrement()">-</button>
  <button @click="reset()">Reset</button>
</div>
```

### Real-time data dashboard {#real-time-dashboard}

A dashboard that fetches metrics and updates them periodically.

```ts
import { defineView } from "swifty-mvc";
import { useState, useEffect, useInterval, useStore } from "swifty-mvc";
import { useMetricsStore } from "../stores/metrics";
import template from "./dashboard.html";

export default defineView((ctx) => {
  const [getMetrics, setMetrics] = useState("metrics", []);
  const [getLastUpdate, setLastUpdate] = useState("lastUpdate", null);
  const getStoreState = useStore(useMetricsStore);

  useEffect(() => {
    async function loadInitial() {
      const data = await fetchMetrics();
      setMetrics(data);
      setLastUpdate(new Date());
    }

    loadInitial();
  });

  useInterval(async () => {
    const data = await fetchMetrics();
    setMetrics(data);
    setLastUpdate(new Date());
  }, 30000);

  return {
    template,
    events: {
      "refresh<click>"() {
        fetchMetrics().then((data) => {
          setMetrics(data);
          setLastUpdate(new Date());
        });
      },
      "toggleAlert<click>"(e) {
        const id = e.params.id;
        useMetricsStore.getState().toggleAlert(id);
      },
    },
  };
});

async function fetchMetrics() {
  const response = await fetch("/api/metrics");
  return response.json();
}
```

### Form with validation and URL state {#form-validation-url}

A search form with validation that syncs to the URL.

```ts
import { defineView } from "swifty-mvc";
import { useState, useUrlState } from "swifty-mvc";
import template from "./search.html";

export default defineView((ctx) => {
  const [state, setState] = useUrlState(ctx, {
    q: "",
    category: "all",
    page: "1",
  });

  const [getErrors, setErrors] = useState("errors", {});

  ctx.updater
    .set({
      query: state.q,
      category: state.category,
      currentPage: Number(state.page),
      errors: getErrors(),
    })
    .digest();

  const validate = () => {
    const errors = {};

    if (!state.q.trim()) {
      errors.q = "Search query is required";
    } else if (state.q.length < 3) {
      errors.q = "Query must be at least 3 characters";
    }

    setErrors(errors);
    return Object.keys(errors).length === 0;
  };

  return {
    template,
    events: {
      "query<change>"(e) {
        setState({ q: e.target.value });
      },
      "category<change>"(e) {
        setState({ category: e.target.value, page: "1" });
      },
      "search<click>"() {
        if (validate()) {
          performSearch(state);
        }
      },
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

async function performSearch(params) {
  const response = await fetch(
    `/api/search?q=${params.q}&category=${params.category}&page=${params.page}`,
  );
  return response.json();
}
```

### Resource management with cleanup {#resource-management}

A view that manages multiple resources with different lifecycles.

```ts
import { defineView } from "swifty-mvc";
import { useState, useEffect, useResource, useEvent } from "swifty-mvc";
import { createService } from "swifty-mvc";
import template from "./resource-view.html";

export default defineView((ctx) => {
  const [getData, setData] = useState("data", null);
  const [getStatus, setStatus] = useState("status", "idle");

  const DataService = createService((payload, callback) => {
    fetch(payload.get("url"))
      .then((r) => r.json())
      .then((json) => {
        payload.set("data", json);
        callback();
      })
      .catch((err) => callback(err));
  });

  DataService.add({ name: "getData", url: "/api/data" });

  const dataService = DataService.instance();
  useResource("dataService", dataService, true);

  const websocket = new WebSocket("wss://example.com/ws");

  useResource("websocket", {
    destroy() {
      websocket.close();
    },
  });

  useEffect(() => {
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "update") {
        setData(message.data);
      }
    };

    websocket.onopen = () => {
      setStatus("connected");
    };

    websocket.onclose = () => {
      setStatus("disconnected");
    };
  });

  useEvent("destroy", () => {
    console.log("Cleaning up resource view");
  });

  return {
    template,
    events: {
      "refresh<click>"() {
        dataService.all({ name: "getData" }, (err, payload) => {
          if (!err) setData(payload.get("data"));
        });
      },
      "send<click>"(e) {
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send(
            JSON.stringify({
              type: "action",
              payload: e.params,
            }),
          );
        }
      },
    },
  };
});
```

## Summary {#summary}

Swifty hooks provide a functional API for managing view state and side effects. The key principles are:

Setup runs once. Hooks register themselves during the single execution of the setup function. There is no re-rendering of setup, no dependency tracking, and no memoization required.

Getters avoid stale closures. By returning getter functions instead of values, event handlers always read the latest state from `updater.data`.

Cleanup is automatic. Hooks like `useEffect`, `useInterval`, `useTimeout`, and `useResource` handle cleanup when the view is destroyed.

State is transparent. State lives in `updater.data` and is accessible both in JavaScript via getters and in templates via interpolation.

Custom hooks compose. Reusable logic can be extracted into custom hooks that call built-in hooks and other custom hooks.

This model is simpler than React's hooks system while providing the same declarative benefits. The tradeoff is that views cannot dynamically change which hooks they use after setup completes, but this constraint eliminates entire categories of bugs related to hook ordering and dependency management.
