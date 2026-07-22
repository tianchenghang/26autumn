---
title: Hooks
description: View-local state, effects, store bindings, timers, and resource management with Swifty MVC hooks.
---

# Hooks {#hooks}

Swifty MVC provides a set of hooks that must be called inside a `defineView` setup function. Hooks give views access to local state, side effects, store bindings, timers, and resource management — all with automatic cleanup when the view is destroyed.

Unlike React hooks, Swifty MVC hooks run exactly once during setup. They do not re-run on re-renders. The values they return are live references that always reflect the current state.

## useState {#use-state}

Create a view-local state variable backed by the view's updater:

```ts
import { useState } from "@swifty.js/mvc";

export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);
  const [getName, setName] = useState("name", "Alice");

  return {
    template: "<p>{{=getName()}}: {{=getCount()}}</p>",
    events: {
      "btn<click>"() {
        setCount(getCount() + 1);
      },
    },
  };
});
```

The getter function reads directly from the updater's data on every call — there are no stale closures. The setter writes the value and triggers a digest (re-render if changed).

Parameters:

- `key` (string) — the data key in the updater
- `initial` (T) — initial value (only used on first mount, ignored on re-mounts)

Returns:

- `[getter: () => T, setter: (v: T) => void]`

## useEffect {#use-effect}

Register a side effect with optional cleanup:

```ts
import { useEffect } from "@swifty.js/mvc";

export default defineView((ctx) => {
  useEffect(() => {
    const ws = new WebSocket("wss://example.com/feed");
    ws.onmessage = (event) => {
      ctx.updater.set({ latestMessage: event.data }).digest();
    };

    // Cleanup function — runs on view destroy
    return () => ws.close();
  });

  return { template };
});
```

The effect function runs synchronously during setup. If it returns a cleanup function, that function is called when the view is destroyed. Multiple `useEffect` calls register multiple effects, and their cleanup functions run in reverse order.

Unlike React's `useEffect`, Swifty MVC's `useEffect` does not re-run based on dependency arrays. It runs once on mount and cleans up on destroy.

## useStore {#use-store}

Bind a Store to a view's updater with automatic synchronization:

```ts
import { useStore } from "@swifty.js/mvc";

export default defineView((ctx) => {
  const getStore = useStore(counterStore);

  // getStore() returns the current store state
  // Automatically re-renders when the store changes

  return {
    template: "<p>Count: {{=getStore().count}}</p>",
  };
});
```

With a selector:

```ts
const getStore = useStore(cartStore, (state) => ({
  total: state.total,
  itemCount: state.items.length,
}));
```

The hook:

1. Syncs the initial store state to the view's updater on mount
2. Subscribes to store changes and syncs updates to the updater
3. Auto-unsubscribes when the view is destroyed

Parameters:

- `store` (StoreApi) — the store to bind
- `selector` (optional function) — extract a subset of the store state

Returns:

- `getter: () => Partial<T>` — returns the current (selected) store state

## useInterval {#use-interval}

Create a `setInterval` that is automatically cleared when the view is destroyed:

```ts
import { useInterval, useState } from "@swifty.js/mvc";

export default defineView((ctx) => {
  const [getElapsed, setElapsed] = useState("elapsed", 0);

  useInterval(() => {
    setElapsed(getElapsed() + 1);
  }, 1000);

  return {
    template: "<p>Elapsed: {{=getElapsed()}}s</p>",
  };
});
```

Parameters:

- `fn` (function) — callback to invoke on each interval
- `delay` (number) — interval in milliseconds

## useTimeout {#use-timeout}

Create a `setTimeout` that is automatically cleared if the view is destroyed before it fires:

```ts
import { useTimeout, useState } from "@swifty.js/mvc";

export default defineView((ctx) => {
  const [getVisible, setVisible] = useState("visible", false);

  useTimeout(() => {
    setVisible(true);
  }, 3000);

  return {
    template: "{{if getVisible()}}<p>Now visible!</p>{{/if}}",
  };
});
```

Parameters:

- `fn` (function) — callback to invoke after the delay
- `delay` (number) — delay in milliseconds

## useResource {#use-resource}

Capture a resource that should be destroyed when the view is unmounted or re-rendered:

```ts
import { useResource } from "@swifty.js/mvc";

export default defineView((ctx) => {
  const chart = new Chart(canvas, options);
  useResource("chart", chart, true);
  // chart.destroy() will be called on view destroy or re-render

  return { template };
});
```

Parameters:

- `key` (string) — resource identifier
- `resource` (object with `destroy()` method) — the resource to manage
- `destroyOnRender` (boolean, optional) — if true, destroy on each re-render; if false, destroy only on view unmount

Resources are stored in the view context's `resources` map. The `destroyAllResources` function is called during cleanup, iterating over all captured resources and calling their `destroy` methods.

## useEvent {#use-event}

Register a handler on the view's event emitter with automatic cleanup:

```ts
import { useEvent } from "@swifty.js/mvc";

export default defineView((ctx) => {
  useEvent("dataLoaded", (payload) => {
    ctx.updater.set({ data: payload }).digest();
  });

  return {
    template: "<p>Data: {{=data}}</p>",
    events: {
      "loadBtn<click>"() {
        ctx.fire("dataLoaded", { items: [1, 2, 3] });
      },
    },
  };
});
```

Parameters:

- `event` (string) — event name
- `handler` (function) — event handler

The handler is automatically removed from the emitter when the view is destroyed.

## useUrlState {#use-url-state}

Synchronize view state with URL query parameters:

```ts
import { useUrlState } from "@swifty.js/mvc";

export default defineView((ctx) => {
  const [state, setState] = useUrlState(ctx, {
    page: "1",
    sort: "name",
  });

  // state.page and state.sort reflect the current URL
  // setState({ page: '2' }) updates the URL and re-renders

  return {
    template: "<p>Page {{=state.page}}, sorted by {{=state.sort}}</p>",
    events: {
      "nextBtn<click>"() {
        setState({ page: String(Number(state.page) + 1) });
      },
    },
  };
});
```

Parameters:

- `view` (ViewCtx) — the view context
- `initialState` (object, optional) — default values

Returns:

- `[Readonly<S>, (patch: Partial<S>) => void]` — current state and updater

The hook observes the URL keys that match the initial state keys. When `setState` is called, it calls `Router.to` with the updated parameters, which triggers a navigation cycle. Views that called `observeLocation` for those keys will re-render.

## Hook composition patterns {#composition-patterns}

### Custom hooks {#custom-hooks}

You can compose hooks into reusable functions:

```ts
function usePolling(url, interval) {
  const [getData, setData] = useState("pollData", null);
  const [getLoading, setLoading] = useState("loading", true);

  useEffect(() => {
    let active = true;

    async function poll() {
      while (active) {
        const res = await fetch(url);
        const data = await res.json();
        if (active) {
          setData(data);
          setLoading(false);
        }
        await new Promise((r) => setTimeout(r, interval));
      }
    }

    poll();
    return () => {
      active = false;
    };
  });

  return { getData, getLoading };
}

export default defineView((ctx) => {
  const { getData, getLoading } = usePolling("/api/status", 5000);

  return {
    template: `
      {{if getLoading()}}
        <p>Loading...</p>
      {{else}}
        <p>Status: {{=getData().status}}</p>
      {{/if}}
    `,
  };
});
```

### Form state with validation {#form-state}

```ts
function useForm(initialValues, validate) {
  const [getValues, setValues] = useState("formValues", initialValues);
  const [getErrors, setErrors] = useState("formErrors", {});
  const [getDirty, setDirty] = useState("formDirty", false);

  function updateField(key, value) {
    const newValues = { ...getValues(), [key]: value };
    setValues(newValues);
    setDirty(true);
    const errors = validate(newValues);
    setErrors(errors);
  }

  return { getValues, getErrors, getDirty, updateField };
}
```

## Hook execution order {#execution-order}

Hooks are executed in the order they are called during setup. Their cleanup functions run in reverse order during view destruction:

```ts
defineView((ctx) => {
  useEffect(() => {
    /* effect A */ return () => {
      /* cleanup A */
    };
  });
  useEffect(() => {
    /* effect B */ return () => {
      /* cleanup B */
    };
  });
  useInterval(() => {}, 1000); // effect C
});

// Setup order: A, B, C
// Destroy order: C, B, A
```

## Next steps {#next-steps}

- [Event System](/docs/en/swifty-mvc/guide/essentials/events) — emitter, delegation, and view events
- [Service](/docs/en/swifty-mvc/guide/essentials/service) — API request management
- [Store deep dive](/docs/en/swifty-mvc/guide/advanced/store) — advanced patterns with createStore and computed
