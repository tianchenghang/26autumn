---
title: Quick Start
description: Build your first Swifty MVC application in five minutes.
---

# Quick Start {#quick-start}

This guide walks you through building a minimal Swifty MVC application from scratch. By the end, you will have a working single-page application with routing, state management, and a compiled template.

## Prerequisites {#prerequisites}

- Node.js 18 or later
- A package manager (npm, pnpm, yarn, or bun)
- Familiarity with HTML, JavaScript, and TypeScript

## Project setup {#project-setup}

Create a new directory and initialize a project:

```sh
mkdir my-swifty-app
cd my-swifty-app
npm init -y
```

Install the required dependencies:

```sh
npm install @swifty.js/mvc
npm install -D vite typescript
```

## Configuration {#configuration}

Create a `vite.config.ts` with the Swifty MVC plugin:

```ts [vite.config.ts]
import { defineConfig } from "vite";
import { swiftyMvcPlugin } from "@swifty.js/mvc/vite";

export default defineConfig({
  plugins: [swiftyMvcPlugin()],
});
```

Create a `tsconfig.json`:

```json [tsconfig.json]
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["@swifty.js/mvc/client"]
  },
  "include": ["src"]
}
```

## HTML shell {#html-shell}

Create the entry HTML file:

```html [index.html]
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Swifty App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

The `<div id="app">` element is where Swifty MVC mounts the root Frame. The `id` must match the `rootId` configuration option (which defaults to `"root"` — we will set it to `"app"` below).

## First view {#first-view}

Create a view file at `src/views/home.ts`:

```ts [src/views/home.ts]
import { defineView, useState } from "@swifty.js/mvc";
import template from "./home.html";

export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "incrementBtn<click>"() {
        setCount(getCount() + 1);
      },
      "resetBtn<click>"() {
        setCount(0);
      },
    },
  };
});
```

Create the corresponding template at `src/views/home.html`:

```html [src/views/home.html]
<div class="container">
  <h1>Welcome to Swifty MVC</h1>
  <p>Count: {{=getCount()}}</p>
  <button id="incrementBtn">Increment</button>
  <button id="resetBtn">Reset</button>
</div>
```

The `{{=getCount()}}` expression is HTML-escaped output. When the view calls `setCount()`, the updater triggers a digest cycle that re-renders the template with the new value, then performs a keyed DOM diff to update only the changed nodes.

## Second view and routing {#routing}

Create a second view at `src/views/about.ts`:

```ts [src/views/about.ts]
import { defineView } from "@swifty.js/mvc";

export default defineView((ctx) => {
  return {
    template: `
      <div class="container">
        <h1>About</h1>
        <p>Built with Swifty MVC.</p>
        <a href="/" data-swifty-nav>Back to Home</a>
      </div>
    `,
  };
});
```

The `data-swifty-nav` attribute tells the Router to intercept the link click and perform client-side navigation instead of a full page reload.

## Boot the application {#boot}

Create the entry point at `src/main.ts`:

```ts [src/main.ts]
import { Framework, registerViewClass } from "@swifty.js/mvc";
import HomeView from "./views/home";
import AboutView from "./views/about";

registerViewClass("home", HomeView);
registerViewClass("about", AboutView);

Framework.boot({
  rootId: "app",
  routeMode: "history",
  routes: {
    "/": "home",
    "/about": "about",
  },
});
```

## Running the application {#running}

Start the Vite development server:

```sh
npx vite
```

Open `http://localhost:5173` in your browser. You should see:

- The home page with a counter that increments on click
- Navigation to the about page via the link (no full page reload)
- Browser back/forward buttons working correctly

## Adding state management {#adding-state}

For state that needs to be shared across views, use `State`:

```ts [src/main.ts]
import { Framework, State, registerViewClass } from "@swifty.js/mvc";

// Set initial state before booting
State.set({
  appTitle: "My Swifty App",
  theme: "light",
});

// ... register views and boot
```

In a view, observe the state keys you care about:

```ts
export default defineView((ctx) => {
  ctx.observeState("appTitle,theme");

  return {
    template: '<h1>{{=State.get("appTitle")}}</h1>',
  };
});
```

When any view calls `State.set({ theme: 'dark' })` followed by `State.digest()`, all views that observed `"theme"` will automatically re-render.

## Next steps {#next-steps}

Now that you have a working application, explore the framework in depth:

- [Architecture Overview](/docs/en/swifty-mvc/guide/essentials/architecture) — understand the Frame tree, rendering pipeline, and event system
- [Views and Templates](/docs/en/swifty-mvc/guide/essentials/views) — learn the complete template syntax and view lifecycle
- [Routing](/docs/en/swifty-mvc/guide/essentials/routing) — navigation guards, route parameters, hash mode
- [State Management](/docs/en/swifty-mvc/guide/essentials/state) — State, Store, and cross-view data flow
