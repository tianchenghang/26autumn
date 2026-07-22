---
title: TypeScript Support
description: Using Swifty MVC with TypeScript — type declarations, generics, and best practices.
---

# TypeScript Support {#typescript-support}

Swifty MVC is written in TypeScript and ships with complete type declarations. This page covers how to configure TypeScript for Swifty MVC projects and how to use generics effectively.

## Configuration {#configuration}

### tsconfig.json {#tsconfig}

Add the client type declarations to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["@swifty.js/mvc/client"]
  }
}
```

The `@swifty.js/mvc/client` entry provides ambient module declarations for:

- `*.html` template imports
- `v-swifty` attribute in HTML
- DOM event extensions

### Template imports {#template-imports}

With the client types, TypeScript recognizes `.html` imports:

```ts
import template from "./view.html";
// TypeScript knows: template is (data: Record<string, unknown>) => string
```

## Generic types {#generics}

### useState {#use-state-generic}

`useState` is fully generic:

```ts
interface User {
  id: number;
  name: string;
  email: string;
}

const [getUser, setUser] = useState<User>("user", {
  id: 0,
  name: "",
  email: "",
});

// getUser() returns User
// setUser(user: User) is type-checked
```

### useStore {#use-store-generic}

`useStore` infers the store type from the StoreApi:

```ts
interface CartState {
  items: CartItem[];
  total: number;
}

const cartStore = createStore<CartState>("cart", (set, get) => ({
  items: [],
  total: 0,
  addItem(item: CartItem) {
    set({
      items: [...get().items, item],
      total: get().total + item.price,
    });
  },
}));

// In a view:
const getStore = useStore(cartStore);
// getStore() returns CartState
```

### createCache {#create-cache-generic}

```ts
interface ApiResult {
  data: unknown;
  timestamp: number;
}

const cache = createCache<ApiResult>({
  maxSize: 100,
  onRemove: (key, value) => {
    // value is ApiResult
    console.log("Evicted:", key, value.timestamp);
  },
});
```

### createEmitter {#create-emitter-generic}

```ts
interface AppEvents {
  login: { userId: string };
  logout: undefined;
  error: Error;
}

const bus = createEmitter<AppEvents>();

bus.on("login", (data) => {
  // data is { userId: string }
});

bus.fire("login", { userId: "123" }); // type-checked
bus.fire("logout"); // type-checked
bus.fire("error", new Error("oops")); // type-checked
```

## Type-safe views {#type-safe-views}

### ViewSetup typing {#view-setup-typing}

```ts
import type { ViewSetup, ViewCtx } from "@swifty.js/mvc";

interface HomeParams {
  id: string;
  tab?: string;
}

const HomeView: ViewSetup = (ctx, params) => {
  // params is unknown — cast to your expected type
  const homeParams = params as HomeParams | undefined;
  const id = homeParams?.id;

  return {
    template: homeTemplate,
  };
};

export default defineView(HomeView);
```

### ViewCtx typing {#view-ctx-typing}

```ts
import type { ViewCtx } from "@swifty.js/mvc";

export default defineView((ctx: ViewCtx) => {
  // ctx.id: string
  // ctx.owner: FrameObj
  // ctx.updater: UpdaterApi
  // ...
});
```

## Type-safe routing {#type-safe-routing}

### Location typing {#location-typing}

```ts
import type { Location } from "@swifty.js/mvc";

const loc = Router.parse();
// loc.path: string
// loc.query: Record<string, string>
// loc.hash: Record<string, string>
// loc.params: Record<string, string>
// loc.get(key: string, defaultValue?: string): string
```

### Route view config {#route-view-config-typing}

```ts
import type { RouteViewConfig } from "@swifty.js/mvc";

Framework.boot({
  routes: {
    "/dashboard": {
      view: "dashboard",
      title: "Dashboard",
    } as RouteViewConfig,
  },
});
```

## Type-safe State {#type-safe-state}

```ts
interface AppState {
  user: User | null;
  theme: "light" | "dark";
  locale: string;
}

// Type assertion when reading:
const user = State.get<User>("user");
const theme = State.get<"light" | "dark">("theme");

// Type-safe writing:
State.set({
  user: currentUser,
  theme: "dark",
} as Partial<AppState>);
```

## Type-safe Store {#type-safe-store}

### Store with interfaces {#store-interfaces}

```ts
interface TodoState {
  items: Todo[];
  filter: "all" | "active" | "completed";
  addItem(text: string): void;
  toggleItem(id: number): void;
}

const todoStore = createStore<TodoState>("todos", (set, get) => ({
  items: [],
  filter: "all",

  addItem(text) {
    set({
      items: [
        ...get().items,
        {
          id: Date.now(),
          text,
          done: false,
        },
      ],
    });
  },

  toggleItem(id) {
    set({
      items: get().items.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    });
  },
}));
```

## Type-safe events {#type-safe-events}

### Event handler typing {#event-handler-typing}

DOM event handlers bound via `@event` receive the native DOM event extended with `eventTarget` (the original hit element) and `params` (parsed from the `@event` parameter string):

```ts
export default defineView((ctx) => {
  return {
    events: {
      "$btn<click>"(
        event: MouseEvent & {
          eventTarget?: EventTarget | null;
          params?: Record<string, string>;
        },
      ) {
        // event.eventTarget: EventTarget | null — the element that was actually clicked
        // event.params: Record<string, string> — parsed from the @event parameter string
        // event.preventDefault(): void — inherited from the native MouseEvent
      },

      "input<input>"(event: InputEvent & { eventTarget?: EventTarget | null }) {
        const value = (event.eventTarget as HTMLInputElement).value;
      },
    },
  };
});
```

Note: the `ViewEvent` type exported from `@swifty.js/mvc` describes events fired via `ctx.fire()` / `ctx.on()` (it carries `type`, `id`, and `keys` from `ChangeEvent`). DOM event handlers receive the extended DOM event shown above, not `ViewEvent`.

## Best practices {#best-practices}

### Avoid any {#avoid-any}

```ts
// Bad:
const [getData, setData] = useState("data", null as any);

// Good:
interface ApiData {
  /* ... */
}
const [getData, setData] = useState<ApiData | null>("data", null);
```

### Use type guards {#use-type-guards}

```ts
function isUser(value: unknown): value is User {
  return typeof value === "object" && value !== null && "id" in value;
}

const user = State.get("user");
if (isUser(user)) {
  // TypeScript knows user is User
}
```

### Type template data {#type-template-data}

```ts
// Create an interface for template data
interface HomeTemplateData {
  title: string;
  items: Item[];
  isLoading: boolean;
}

// Type the updater
ctx.updater.set({
  title: "Home",
  items: [],
  isLoading: false,
} as HomeTemplateData);
```

## Next steps {#next-steps}

- [API Reference](/docs/en/swifty-mvc/api-reference/framework) — complete type definitions
- [Views and Templates](/docs/en/swifty-mvc/guide/essentials/views) — view authoring with types
- [Store Deep Dive](/docs/en/swifty-mvc/guide/advanced/store) — advanced typed store patterns
