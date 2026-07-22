# Quick Start {#quick-start}

Get up and running with swifty-mvc in under 10 minutes. This guide walks you through setting up a new project, creating your first view, and running the development server.

## Prerequisites {#prerequisites}

Before you begin, make sure you have the following installed:

- Node.js 18 or higher
- A terminal for running commands
- A code editor with TypeScript support (VS Code recommended)

You should also have basic familiarity with:

- HTML, CSS, and JavaScript/TypeScript
- The command line
- Package managers (npm, pnpm, or yarn)

## Project Setup {#project-setup}

swifty-mvc works with three major bundlers: Vite, Webpack, and Rspack. Choose the one that fits your workflow.

### Installation {#installation}

Create a new directory for your project and initialize it with your preferred package manager:

::: code-group

```bash [npm]
npm init -y
npm install swifty-mvc
```

```bash [pnpm]
pnpm init
pnpm add swifty-mvc
```

```bash [yarn]
yarn init -y
yarn add swifty-mvc
```

:::

### Bundler Configuration {#bundler-configuration}

Install and configure the bundler plugin for your chosen build tool.

#### Vite {#vite}

Install Vite as a development dependency:

::: code-group

```bash [npm]
npm install -D vite
```

```bash [pnpm]
pnpm add -D vite
```

```bash [yarn]
yarn add -D vite
```

:::

Create a `vite.config.ts` file in your project root:

```typescript
import { defineConfig } from "vite";
import { swiftyMvcPlugin } from "swifty-mvc/vite";

export default defineConfig({
  plugins: [
    swiftyMvcPlugin({
      debug: false,
      vdom: false,
    }),
  ],
});
```

#### Webpack {#webpack}

Install Webpack and related dependencies:

::: code-group

```bash [npm]
npm install -D webpack webpack-cli webpack-dev-server html-webpack-plugin ts-loader
```

```bash [pnpm]
pnpm add -D webpack webpack-cli webpack-dev-server html-webpack-plugin ts-loader
```

```bash [yarn]
yarn add -D webpack webpack-cli webpack-dev-server html-webpack-plugin ts-loader
```

:::

Create a `webpack.config.js` file:

```javascript
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { SwiftyMvcPlugin } = require("swifty-mvc/webpack");

module.exports = {
  entry: "./src/main.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  module: {
    rules: [
      {
        test: /\.html$/,
        use: [
          {
            loader: "swifty-mvc/webpack",
            options: {
              debug: false,
              vdom: false,
            },
          },
        ],
      },
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new SwiftyMvcPlugin({
      debug: false,
      vdom: false,
    }),
    new HtmlWebpackPlugin({
      template: "./index.html",
    }),
  ],
  resolve: {
    extensions: [".ts", ".js"],
  },
};
```

#### Rspack {#rspack}

Install Rspack:

::: code-group

```bash [npm]
npm install -D @rspack/cli @rspack/core html-rspack-plugin
```

```bash [pnpm]
pnpm add -D @rspack/cli @rspack/core html-rspack-plugin
```

```bash [yarn]
yarn add -D @rspack/cli @rspack/core html-rspack-plugin
```

:::

Create a `rspack.config.js` file:

```javascript
const path = require("path");
const { HtmlRspackPlugin } = require("@rspack/core");
const { SwiftyMvcPlugin } = require("swifty-mvc/rspack");

module.exports = {
  entry: "./src/main.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  module: {
    rules: [
      {
        test: /\.html$/,
        use: [
          {
            loader: "swifty-mvc/rspack",
            options: {
              debug: false,
              vdom: false,
            },
          },
        ],
      },
      {
        test: /\.ts$/,
        use: {
          loader: "builtin:swc-loader",
          options: {
            jsc: {
              parser: {
                syntax: "typescript",
              },
            },
          },
        },
      },
    ],
  },
  plugins: [
    new SwiftyMvcPlugin({
      debug: false,
      vdom: false,
    }),
    new HtmlRspackPlugin({
      template: "./index.html",
    }),
  ],
  resolve: {
    extensions: [".ts", ".js"],
  },
};
```

## Project Structure {#project-structure}

Your project should have the following structure:

```
my-swifty-app/
├─ src/
│  ├─ views/
│  │  ├─ home.html
│  │  └─ home.ts
│  └─ main.ts
├─ index.html
├─ vite.config.ts (or webpack.config.js / rspack.config.js)
└─ package.json
```

The `src/` directory contains your application code:

- `main.ts` is the entry point where you boot the framework
- `views/` contains your view modules, each consisting of a TypeScript file and an HTML template

## Creating Your First View {#creating-your-first-view}

Let's create a simple view that displays a greeting and a counter.

Create `src/views/home.html`:

```html
<div class="home">
  <h1>Welcome to swifty-mvc</h1>
  <p>Count: {{=count}}</p>
  <button @click="increment()">Increment</button>
</div>
```

Create `src/views/home.ts`:

```typescript
import { defineView, useState } from "swifty-mvc";
import template from "./home.html";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

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

This view uses `defineView` to create a functional view. The setup function runs once when the view mounts. We use `useState` to create reactive state, and define event handlers in the `events` object.

## Template Syntax Basics {#template-syntax-basics}

swifty-mvc templates use a simple syntax for dynamic content and control flow.

### Output Expressions {#output-expressions}

Use `{{=expr}}` to output HTML-escaped values:

```html
<p>Hello, {{=name}}!</p>
<p>User ID: {{=userId}}</p>
```

### Conditional Rendering {#conditional-rendering}

Use `{{if}}`, `{{else if}}`, `{{else}}`, and `{{/if}}` for conditional content:

```html
{{if user.isAdmin}}
<div class="admin-panel">Welcome, admin</div>
{{else if user.isEditor}}
<div class="editor-panel">Welcome, editor</div>
{{else}}
<div class="user-panel">Welcome, user</div>
{{/if}}
```

### Loops {#loops}

Use `{{each}}` to iterate over arrays:

```html
{{each items as item index}}
<div class="item">
  <span>{{=index}}: {{=item.name}}</span>
</div>
{{/each}}
```

You can also access `first` and `last` helpers:

```html
{{each items as item index last first}}
<div class="{{if first}}first-item{{/if}}{{if last}}last-item{{/if}}">
  {{=item.name}}
</div>
{{/each}}
```

### Event Binding {#event-binding}

Use `@event` attributes to bind event handlers:

```html
<button @click="handleClick()">Click me</button>
<input @input="validate()" @change="validate()" />
```

Each `@event` attribute binds a single event type. Modifier keys such as `<ctrl>` are declared in the `events` map of the setup function rather than in template attributes:

```typescript
events: {
  'specialAction<click><ctrl>'() {
    // Fires only when Ctrl is held during click
  }
}
```

## Adding Routing {#adding-routing}

Configure routes when booting the framework. Each route maps a URL path to a view path.

Create an additional view at `src/views/about.html`:

```html
<div class="about">
  <h1>About</h1>
  <p>This is a swifty-mvc application.</p>
  <a href="/">Back to Home</a>
</div>
```

Create `src/views/about.ts`:

```typescript
import { defineView } from "swifty-mvc";
import template from "./about.html";

export default defineView((ctx, params) => {
  return {
    template,
  };
});
```

## Booting the Framework {#booting-the-framework}

Create `src/main.ts` to boot the framework with your routes:

```typescript
import { Framework } from "swifty-mvc";

Framework.boot({
  rootId: "root",
  routeMode: "history",
  defaultView: "src/views/home",
  routes: {
    "/": "src/views/home",
    "/about": "src/views/about",
  },
});
```

This configuration:

- Mounts the application to the DOM element with ID `root`
- Uses HTML5 history mode for clean URLs
- Sets `home` as the default view
- Maps `/` to the home view and `/about` to the about view

## HTML Entry Point {#html-entry-point}

Create `index.html` in your project root:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My swifty-mvc App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

The `<div id="root">` is where your application mounts. The script tag loads your entry point.

## Running the Dev Server {#running-the-dev-server}

Add development scripts to your `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

For Webpack, use:

```json
{
  "scripts": {
    "dev": "webpack serve --mode development",
    "build": "webpack --mode production"
  }
}
```

For Rspack, use:

```json
{
  "scripts": {
    "dev": "rspack serve --mode development",
    "build": "rspack build --mode production"
  }
}
```

Start the development server:

::: code-group

```bash [npm]
npm run dev
```

```bash [pnpm]
pnpm run dev
```

```bash [yarn]
yarn dev
```

:::

The dev server will start at `http://localhost:5173` (Vite) or `http://localhost:8080` (Webpack/Rspack). Open your browser and visit the URL to see your application running.

Try clicking the increment button to see reactive state updates in action. Navigate to `/about` to see routing in action.

## Hot Module Replacement {#hot-module-replacement}

swifty-mvc includes built-in HMR support. The bundler plugins automatically inject the necessary HMR code, so you don't need to write any `import.meta.hot` or `module.hot` logic yourself.

Try editing `src/views/home.html` while the dev server is running. You'll see the changes appear instantly without losing the counter state. This is because swifty-mvc preserves view-local state during hot updates.

## What's Next {#whats-next}

You've built your first swifty-mvc application. Here's where to go from here:

- Learn about the MVC architecture and how swifty-mvc separates concerns
- Explore the view system and lifecycle in depth
- Understand the template compilation pipeline
- Set up state management for cross-view data sharing
- Configure the service layer for API requests
- Enable VDOM mode for performance-critical applications
- Set up routing guards and navigation logic
- Deploy your application to production

Check out the complete API reference for detailed documentation on every function and configuration option.
