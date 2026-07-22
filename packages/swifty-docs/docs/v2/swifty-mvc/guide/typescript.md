# TypeScript Support {#typescript-support}

swifty-mvc is written in TypeScript and provides comprehensive type definitions out of the box. The framework ships with built-in types for all public APIs, ambient declarations for DOM extensions and module imports, and type-safe patterns for functional views, hooks, and state management.

## Built-in Types {#built-in-types}

swifty-mvc exports a complete set of type definitions from the `swifty-mvc` package. These types cover the entire framework API surface, including view context, router, state management, service layer, and frame system.

### Core Interface Types {#core-interfaces}

The framework defines several core interfaces that describe the shape of its runtime objects:

```typescript
import type {
  ViewCtx, // View context passed to setup functions
  FrameObj, // Frame object managing view lifecycle
  RouterApi, // Router interface for navigation and URL parsing
  StateApi, // Global state singleton for cross-view data
  FrameworkApi, // Framework entry point and utilities
  UpdaterApi, // Per-view data binding and change detection
  EmitterApi, // Event emitter for custom events
  CacheApi, // LFU cache with frequency-based eviction
  PayloadApi, // Service response wrapper
} from "swifty-mvc";
```

### View Context {#view-context}

`ViewCtx` is the primary interface passed to every view setup function. It provides access to all framework APIs without relying on `this` binding:

```typescript
import type { ViewCtx } from "swifty-mvc";

export default defineView((ctx: ViewCtx, params?: unknown) => {
  // ctx.id - View ID (same as owner frame ID)
  // ctx.owner - Owner frame reference
  // ctx.updater - UpdaterApi for data binding
  // ctx.render() - Trigger re-render
  // ctx.observeLocation() - Listen to URL changes
  // ctx.observeState() - Listen to global state changes

  return {
    template,
    events: {
      /* ... */
    },
  };
});
```

### Router Types {#router-types}

The router provides typed interfaces for URL parsing, navigation, and route change events:

```typescript
import type {
  RouterApi, // Main router interface
  Location, // Parsed URL with query and hash sections
  ParsedUri, // Path and params from a URL
  LocationDiff, // Changes between two routing states
  ParamDiff, // Single parameter transition {from, to}
  RouteChangeEvent, // Pre-change event (can reject/prevent)
  RouteChangedEvent, // Post-change event with diff info
} from "swifty-mvc";

// Two-phase route confirmation
Router.on("change", (e: RouteChangeEvent) => {
  if (!canNavigate()) {
    e.reject(); // Revert to previous URL
  }
});

Router.on("changed", (e: RouteChangedEvent) => {
  console.log("Path changed:", e.path?.from, "->", e.path?.to);
});
```

### State and Store Types {#state-store-types}

swifty-mvc provides two state management approaches with full type support:

```typescript
import type { StateApi, StoreApi } from "swifty-mvc";

// Global state for simple cross-view data
State.set({ user: currentUser, theme: "dark" });
const user = State.get<User>("user");

// Zustand-aligned store for complex reactive state
interface CounterState {
  count: number;
  doubled: number;
}

const useCounter = createStore<CounterState>("counter", (set, get) => ({
  count: 0,
  doubled: computed(["count"], () => get().count * 2),
}));

// Typed store access
const state = useCounter.getState(); // CounterState
useCounter.setState({ count: state.count + 1 });
```

### Service Types {#service-types}

The service layer provides typed interfaces for API request management:

```typescript
import type {
  ServiceApi, // Service factory API
  ServiceInstance, // Service instance with all/one/save methods
  PayloadApi, // Response data wrapper
  ServiceMetaEntry, // Endpoint metadata configuration
  ServiceEvent, // Service lifecycle event
} from "swifty-mvc";

interface UserResponse {
  id: number;
  name: string;
  email: string;
}

const userService = createService((payload: PayloadApi) => {
  return fetch("/api/users").then((r) => r.json());
});

userService.add({
  name: "getUser",
  url: "/api/users/:id",
  cache: 60000, // 1 minute TTL
});

userService
  .instance()
  .all({ name: "getUser", params: { id: 123 } }, (payload: PayloadApi) => {
    const user = payload.get<UserResponse>("data");
  });
```

### Framework Configuration {#framework-config}

`FrameworkConfig` defines all options for `Framework.boot()`:

```typescript
import type { FrameworkConfig } from "swifty-mvc";

const config: FrameworkConfig = {
  rootId: "app",
  routeMode: "history",
  defaultView: "app/views/home",
  routes: {
    "/": "app/views/home",
    "/users": { view: "app/views/users", title: "Users" },
  },
  rewrite: (path, params, routes) => {
    return routes[path] || "app/views/404";
  },
  error: (err) => console.error("Framework error:", err),
  vdom: false,
};

Framework.boot(config);
```

## Key Type Exports {#key-type-exports}

swifty-mvc re-exports all public types from the main entry point. You can import types directly without knowing the internal module structure:

```typescript
// All types available from main package
import type {
  // Function types
  AnyFunc,
  VoidFunc,

  // View system
  ViewCtx,
  ViewSetup,
  ViewTemplate,
  VDomTemplate,
  ViewObserveLocation,
  ViewLocationObserved,

  // Router
  RouterApi,
  Location,
  ParsedUri,
  LocationDiff,
  ParamDiff,
  RouteChangeEvent,
  RouteChangedEvent,

  // State management
  StateApi,
  StoreApi,

  // Service
  ServiceApi,
  ServiceInstance,
  PayloadApi,
  ServiceMetaEntry,
  ServiceEvent,
  ServiceCacheInfo,

  // Frame system
  FrameObj,
  FrameInvokeEntry,

  // Utilities
  EmitterApi,
  CacheApi,
  UpdaterApi,
  Ref,

  // DOM and VDOM
  DomRef,
  DomOp,
  VDomNode,
  VDomRef,
  VDomCreateFn,

  // Configuration
  FrameworkConfig,
  RouteViewConfig,
  CompileOptions,

  // Events
  ChangeEvent,
  ViewEvent,
  FrameStaticEvent,
} from "swifty-mvc";
```

### Type-Only Imports {#type-only-imports}

Use the `type` keyword to import types without runtime overhead. This is especially important for bundlers that perform type erasure:

```typescript
// Type-only import (removed at compile time)
import type { ViewCtx, RouterApi } from "swifty-mvc";

// Value import (included in bundle)
import { defineView, Router } from "swifty-mvc";
```

## Ambient Declarations {#ambient-declarations}

swifty-mvc ships with ambient type declarations in the `swifty-mvc/client` declaration file (`client.d.ts`) that extend the global DOM interfaces and declare module types for HTML and CSS imports. These declarations are essential for template type safety and enable TypeScript to recognize framework-specific DOM metadata and non-JavaScript asset imports.

To use these ambient declarations, add `"swifty-mvc/client"` to the `types` array in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["swifty-mvc/client"]
  }
}
```

### DOM Extensions {#dom-extensions}

The framework attaches metadata to DOM elements for frame binding, view rendering, and event delegation. The ambient declarations allow TypeScript to recognize these properties:

```typescript
// swifty-mvc/client extends HTMLElement
declare global {
  interface HTMLElement {
    frame?: FrameApi | undefined;
    frameBound?: number;
    autoId?: number;
    viewRendered?: number;
    rangeFrameId?: string;
    rangeElementGuid?: number;
  }

  interface Element {
    compareKeyCached?: number | undefined;
    cachedCompareKey?: string | undefined;
    "v-swifty"?: string | undefined;
  }
}
```

This means you can access framework metadata on DOM elements without type errors:

```typescript
const element = document.getElementById("my-view");
if (element?.frame) {
  console.log("Frame ID:", element.frame.id);
  console.log("View path:", element.frame.getViewPath());
}
```

### Module Declarations {#module-declarations}

swifty-mvc declares module types for HTML templates and CSS imports, enabling TypeScript to understand these non-JavaScript assets:

```typescript
// HTML template modules
declare module "*.html" {
  const template: ViewTemplate | VDomTemplate;
  export default template;
}

// CSS modules
declare module "*.css" {
  const content: string;
  export default content;
}
```

This allows you to import templates and stylesheets with full type safety:

```typescript
import template from "./index.html"; // ViewTemplate | VDomTemplate
import styles from "./index.css"; // string

export default defineView((ctx) => {
  return { template };
});
```

### ImportMeta Extensions {#importmeta-extensions}

The framework extends `ImportMeta` to support HMR (Hot Module Replacement) context provided by Vite and webpack:

```typescript
interface ImportMeta {
  hot?: {
    accept(cb?: (mod: { default?: unknown } | undefined) => void): void;
    dispose(cb: (data: unknown) => void): void;
    invalidate(): void;
  };
}
```

This enables type-safe HMR integration in development:

```typescript
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    // Handle hot update
  });
}
```

## TypeScript Configuration {#typescript-config}

For optimal type checking and developer experience, configure your `tsconfig.json` with these recommendations:

### Recommended Settings {#recommended-settings}

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["swifty-mvc/client"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Key Configuration Options {#key-options}

The `types` array must include `"swifty-mvc/client"` to load the ambient declarations:

```json
{
  "compilerOptions": {
    "types": ["swifty-mvc/client"]
  }
}
```

This ensures that DOM extensions, HTML template modules, and CSS modules are recognized by TypeScript.

Enable `strict` mode to catch common errors early:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

Use `moduleResolution: "bundler"` to align with modern bundlers like Vite, webpack, and Rspack:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

## Type-Safe Patterns {#type-safe-patterns}

swifty-mvc's functional API is designed with TypeScript in mind. Here are patterns that leverage the type system for safer code.

### Typed View Setup {#typed-view-setup}

Explicitly type the setup function parameters and return value:

```typescript
import { defineView } from "swifty-mvc";
import type { ViewCtx, ViewSetup } from "swifty-mvc";
import template from "./index.html";

interface HomeParams {
  userId: string;
}

const HomeView: ViewSetup = (ctx: ViewCtx, params?: unknown) => {
  const typedParams = params as HomeParams | undefined;

  return {
    template,
    events: {
      "loadUser<click>"() {
        if (typedParams?.userId) {
          loadUser(typedParams.userId);
        }
      },
    },
  };
};

export default defineView(HomeView);
```

### Generic State Access {#generic-state-access}

Use generics to constrain state types when reading from global state or payload:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

interface AppState {
  user: User | null;
  theme: "light" | "dark";
}

// Typed state access
const user = State.get<User>("user");
const theme = State.get<"light" | "dark">("theme");

// Typed payload access
service.instance().all({ name: "getUser" }, (payload: PayloadApi) => {
  const user = payload.get<User>("data");
  const list = payload.get<User[]>("list");
});
```

### Type-Safe Store Definitions {#type-safe-stores}

Define explicit interfaces for store state to get full type inference:

```typescript
import { createStore, computed } from "swifty-mvc";

interface TodoState {
  items: Array<{ id: number; text: string; done: boolean }>;
  filter: "all" | "active" | "completed";
}

const useTodos = createStore<TodoState>("todos", (set, get) => ({
  items: [],
  filter: "all",

  // Computed properties are type-checked
  filtered: computed(["items", "filter"], () => {
    const { items, filter } = get();
    if (filter === "all") return items;
    return items.filter((item) =>
      filter === "active" ? !item.done : item.done,
    );
  }),
}));

// Type-safe mutations
useTodos.setState({ filter: "active" });
useTodos.setState((prev) => ({
  items: [...prev.items, { id: Date.now(), text: "New task", done: false }],
}));

// Type-safe subscriptions
useTodos.subscribe((state, prevState) => {
  console.log("Items changed:", state.items.length !== prevState.items.length);
});
```

### Typed Event Handlers {#typed-event-handlers}

Event handlers receive typed event objects with framework-specific properties:

```typescript
import type { ChangeEvent, ViewEvent, ServiceEvent } from "swifty-mvc";

// Router change events
Router.on("changed", (e: RouteChangedEvent) => {
  if (e.path && e.changed) {
    console.log(`Navigated from ${e.path.from} to ${e.path.to}`);
  }
});

// State change events
State.on("changed", (e: ChangeEvent) => {
  if (e.keys?.has("user")) {
    console.log("User state changed");
  }
});

// Service events
service.on("done", (e: ServiceEvent) => {
  console.log("Request completed:", e.payload.get("data"));
});

// View events (from @event bindings)
export default defineView((ctx) => {
  return {
    template,
    events: {
      "save<click>"(e: ViewEvent) {
        console.log("Triggered by element:", e.id);
      },
    },
  };
});
```

### Async Safety with wrapAsync {#async-safety}

Use `ctx.wrapAsync` to prevent stale callbacks from executing after view destruction:

```typescript
export default defineView((ctx) => {
  const [getData, setData] = useState("data", null);

  useEffect(() => {
    // Wrap async callback to check view signature
    const safeCallback = ctx.wrapAsync((result: ApiResponse) => {
      setData(result);
    });

    fetchData().then(safeCallback);
  });

  return { template };
});
```

The wrapped callback only executes if the view's `signature` still matches, preventing updates to destroyed views.

### Type-Safe Resource Management {#resource-management}

Use `capture` and `release` with typed resources:

```typescript
export default defineView((ctx) => {
  // Capture a typed resource
  const timer = ctx.capture(
    "timer",
    setInterval(() => {
      console.log("tick");
    }, 1000),
  );

  // Resource is automatically destroyed on view unmount
  // Or manually release it
  ctx.release("timer", true); // true = destroy immediately

  return { template };
});
```

## Type Inference {#type-inference}

TypeScript infers types in many scenarios, reducing the need for explicit annotations:

```typescript
// useState infers type from initial value
const [getCount, setCount] = useState("count", 0);
// getCount: () => number
// setCount: (v: number) => void

// Store state is inferred from creator return type
const useCounter = createStore("counter", (set, get) => ({
  count: 0,
  increment: () => set({ count: get().count + 1 }),
}));
// StoreApi<{ count: number; increment: () => void }>

// Router.parse() return type is inferred
const location = Router.parse();
// Location type with typed query and hash sections
```

## Common Type Errors {#common-errors}

### Missing Ambient Declarations {#missing-ambient}

If you see errors like `Cannot find module '*.html'`, ensure `swifty-mvc/client` is in your `tsconfig.json` types array:

```json
{
  "compilerOptions": {
    "types": ["swifty-mvc/client"]
  }
}
```

### Stale Closure Warnings {#stale-closures}

swifty-mvc hooks return getter functions to avoid stale closures. Access state through getters, not captured values:

```typescript
// Correct: use getter
const [getCount, setCount] = useState("count", 0);
useEffect(() => {
  const timer = setInterval(() => {
    setCount(getCount() + 1); // Always reads latest value
  }, 1000);
  return () => clearInterval(timer);
});

// Incorrect: captured value becomes stale
const [count, setCount] = useState("count", 0);
useEffect(() => {
  const timer = setInterval(() => {
    setCount(count + 1); // 'count' is frozen at initial value
  }, 1000);
});
```

### Untyped Payload Access {#untyped-payload}

Always use generics when accessing payload data to avoid `unknown` types:

```typescript
// Correct: typed access
const user = payload.get<User>("user");

// Incorrect: returns unknown
const user = payload.get("user");
```

## Further Reading {#further-reading}

- [Views](./views.md) - Functional view system and lifecycle
- [Hooks](./hooks.md) - State management and side effects
- [State Management](./state-management.md) - Global state and store patterns
- [Service](./service.md) - API request management with caching
- [Routing](./routing.md) - Navigation and URL parsing
