---
title: Views and Templates
description: How to define views, write templates, handle events, and manage the view lifecycle in Swifty MVC.
---

# Views and Templates {#views-and-templates}

Views are the primary unit of UI composition in Swifty MVC. A view combines a setup function (controller logic), a template (declarative HTML), and an event map (user interaction handlers) into a self-contained, lifecycle-managed unit.

## Defining a view {#defining-a-view}

Use `defineView` to create a view. The setup function receives a `ViewCtx` and optional route parameters, and returns a descriptor:

```ts
import { defineView } from "@swifty.js/mvc";

export default defineView((ctx, params) => {
  return {
    template,
    events: {},
    assign: {},
  };
});
```

The setup function runs exactly once when the view is mounted. It does not re-run on subsequent renders. This is a fundamental difference from React components — think of setup as "initialization", not "render".

### The descriptor object {#descriptor}

The setup function returns an object with three optional fields:

| Field      | Type                                          | Description                                                        |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `template` | `Function`                                    | A compiled template function (imported from a `.html` file)        |
| `events`   | `Record<string, Function>`                    | Event handler map, keyed by selector-event expressions             |
| `assign`   | `(options?: unknown) => boolean \| undefined` | Function called to merge properties onto the ViewCtx for templates |

## Templates {#templates}

Templates are `.html` files compiled at build time by the bundler plugin. They use a custom expression syntax based on double curly braces.

### Importing templates {#importing-templates}

Import a `.html` file as you would any other module:

```ts
import template from "./my-view.html";

export default defineView((ctx) => {
  return { template };
});
```

With the `@swifty.js/mvc/client` type declarations, TypeScript recognizes `.html` imports as modules that export a template function.

### Expression syntax {#expression-syntax}

Templates support four output operators:

| Syntax      | Behavior                                   | Use case                                  |
| ----------- | ------------------------------------------ | ----------------------------------------- |
| `{{=expr}}` | HTML-escaped output                        | User-generated content, text nodes        |
| `{{:expr}}` | Binding output (same as `=` for rendering) | Data binding expressions                  |
| `{{!expr}}` | Raw output, no escaping                    | Trusted HTML, icon SVGs                   |
| `{{@expr}}` | Reference lookup                           | Resolving values from the `refData` table |

```html
<p>Hello, {{=user.name}}</p>
<p>Raw HTML: {{!trustedHtml}}</p>
<p>Ref value: {{@refToken}}</p>
```

### Control flow {#control-flow}

Templates provide `if/else` conditionals and three loop constructs:

#### Conditionals {#conditionals}

```html
{{if user.isAdmin}}
<span class="badge">Admin</span>
{{else if user.isEditor}}
<span class="badge">Editor</span>
{{else}}
<span class="badge">Viewer</span>
{{/if}}
```

#### forOf — array iteration {#for-of}

Iterate over arrays with access to the item and its index:

```html
<ul>
  {{forOf items as item idx}}
  <li id="item-{{=idx}}">
    {{=idx}}. {{=item.name}} {{if isFirst}}(first){{/if}} {{if
    isLast}}(last){{/if}}
  </li>
  {{/forOf}}
</ul>
```

The `isFirst` and `isLast` helpers are automatically available inside `forOf` blocks.

#### forIn — object iteration {#for-in}

Iterate over an object's enumerable properties:

```html
<dl>
  {{forIn metadata as value key}}
  <dt>{{=key}}</dt>
  <dd>{{=value}}</dd>
  {{/forIn}}
</dl>
```

#### for — generic loop {#for-generic}

A standard C-style for loop:

```html
{{for(let i = 0; i < 5; i++)}}
<span>{{=i}}</span>
{{/for}}
```

### Variable declarations {#variable-declarations}

Use `{{set}}` to declare variables within a template:

```html
{{set fullName = user.firstName + ' ' + user.lastName}}
<p>{{=fullName}}</p>
```

### Reference data {#reference-data}

The `{{@expr}}` operator resolves values from the view's `refData` table. This is useful for passing non-string values (objects, functions, arrays) into templates without serializing them:

```ts
export default defineView((ctx) => {
  ctx.updater.refData[ctx.updater.SPLITTER + "1"] = { complex: "object" };

  return {
    template: '<div>{{@"1"}}</div>',
  };
});
```

The `refData` table is keyed by SPLITTER-prefixed tokens. The `{{@expr}}` operator looks up the token in the table and returns the original JavaScript value.

## Event handling {#event-handling}

Events are declared in the `events` object returned by the setup function. The key syntax encodes the target element, event type, and optional modifiers:

### Event key syntax {#event-key-syntax}

```
[selector]<eventType[,eventType]><[modifier,modifier]>
```

| Pattern                  | Description                                   |
| ------------------------ | --------------------------------------------- |
| `handler<click>`         | Click on the view's root element              |
| `$btn<click>`            | Click on children matching `.btn` (or `#btn`) |
| `$<click>`               | Click at the Frame boundary (empty selector)  |
| `$window<resize>`        | Window resize event                           |
| `$document<keydown>`     | Document keydown event                        |
| `input<input,change>`    | Multiple events on `input` elements           |
| `btn<click><ctrl,shift>` | Click with modifier keys                      |

### Handler functions {#handler-functions}

Event handlers receive an extended event object with `eventTarget` (the matched DOM element) and `params` (parsed from encoded attributes):

```ts
export default defineView((ctx) => {
  return {
    template: '<button class="delete-btn" data-id="42">Delete</button>',
    events: {
      "$deleteBtn<click>"(event) {
        const id = event.eventTarget.dataset.id;
        // Handle deletion
      },
    },
  };
});
```

### How event delegation works {#event-delegation-internals}

All DOM events are delegated to `document.body` in the capture phase. When an event fires:

1. The `EventDelegator` walks from `event.target` upward through the DOM
2. At each element, it checks for encoded event attributes (`@click`, `@input`, etc.)
3. It parses the attribute value to extract the handler name and parameters
4. It walks the Frame tree to find the view that registered the handler
5. It invokes the handler with the extended event object

This means event handlers work correctly even for dynamically added elements — no re-binding is needed when the DOM changes.

## View context (ViewCtx) {#view-context}

The `ViewCtx` is the central object passed to every setup function. It provides access to all framework APIs:

| Property/Method             | Description                               |
| --------------------------- | ----------------------------------------- |
| `ctx.id`                    | Unique view identifier                    |
| `ctx.owner`                 | The Frame that owns this view             |
| `ctx.updater`               | Per-view data binding and digest engine   |
| `ctx.on(name, fn)`          | Subscribe to view lifecycle events        |
| `ctx.fire(name, data)`      | Emit a view event                         |
| `ctx.render()`              | Trigger a manual re-render                |
| `ctx.wrapAsync(fn)`         | Create a signature-guarded async callback |
| `ctx.observeLocation(keys)` | React to URL parameter changes            |
| `ctx.observeState(keys)`    | React to State changes                    |
| `ctx.leaveTip(msg, cond)`   | Register unsaved-changes navigation guard |
| `ctx.beginUpdate(zoneId?)`  | Tear down child zone before re-render     |
| `ctx.endUpdate(zoneId?)`    | Re-mount child zone after re-render       |

### Async safety with wrapAsync {#wrap-async}

When making asynchronous calls (API requests, timers), wrap callbacks with `ctx.wrapAsync` to ensure they only execute if the view is still mounted:

```ts
export default defineView((ctx) => {
  const safeCallback = ctx.wrapAsync((data) => {
    // This only runs if the view is still alive
    ctx.updater.set({ data }).digest();
  });

  fetch("/api/data")
    .then((res) => res.json())
    .then(safeCallback);
  // If the view was unmounted before the fetch completes,
  // safeCallback silently returns undefined — no error, no stale update

  return { template };
});
```

The `wrapAsync` mechanism captures the view's `signature.value` at wrap time. When the callback fires, it checks whether the signature still matches. If the view was unmounted (signature reset to 0) or re-rendered (signature incremented), the callback is silently dropped.

## View lifecycle events {#lifecycle-events}

Views emit lifecycle events that you can subscribe to:

| Event     | When it fires                              |
| --------- | ------------------------------------------ |
| `render`  | Before each render cycle                   |
| `destroy` | When the view is unmounted (cleanup phase) |

```ts
export default defineView((ctx) => {
  ctx.on("render", () => {
    console.log("About to render");
  });

  ctx.on("destroy", () => {
    console.log("View is being destroyed");
  });

  return { template };
});
```

## Updater and data binding {#updater}

Each view has its own `UpdaterApi` instance, accessible via `ctx.updater`. The updater holds the view's local data and manages the digest cycle.

### Setting data {#setting-data}

```ts
ctx.updater.set({ name: "Alice", count: 42 });
ctx.updater.digest();
```

The `set` method performs a shallow merge. The `digest` method triggers a re-render if any data actually changed. You can chain them:

```ts
ctx.updater.set({ count: 43 }).digest();
```

### Reading data {#reading-data}

```ts
const allData = ctx.updater.get(); // entire data object
const name = ctx.updater.get("name"); // single key
```

### Excludes {#excludes}

Both `set` and `digest` accept an `excludes` parameter — a set of keys to skip when detecting changes:

```ts
ctx.updater.set({ a: 1, b: 2 }, new Set(["b"]));
ctx.updater.digest();
// Only 'a' is checked for changes; 'b' is excluded
```

## Registration {#registration}

Before a view can be mounted, it must be registered with a path:

```ts
import { registerViewClass } from "@swifty.js/mvc";
import HomeView from "./views/home";

registerViewClass("home", HomeView);
```

The path string is used in route definitions and `frame.mountView()` calls. The framework looks up the setup function by path when mounting a view.

## Inline templates {#inline-templates}

For simple views, you can use inline HTML strings instead of `.html` files:

```ts
export default defineView((ctx) => {
  return {
    template: "<p>Hello, {{=name}}</p>",
  };
});
```

Note: inline templates are not compiled by the bundler plugin. They are processed at runtime, which means the full template syntax is available but without the build-time optimizations (variable extraction, event encoding).

## Next steps {#next-steps}

- [Hooks](/docs/en/swifty-mvc/guide/essentials/hooks) — useState, useEffect, useStore, and more
- [The Frame Tree](/docs/en/swifty-mvc/guide/essentials/frame) — parent-child composition and zones
- [Event System](/docs/en/swifty-mvc/guide/essentials/events) — deep dive into delegation, emitter, and event patterns
