import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import HtmlWebpackPlugin from "html-webpack-plugin";

// Resolve webpack from webpack-cli's location to ensure both use the same
// webpack instance. In pnpm's strict node_modules, `import "webpack"` here
// and webpack-cli's internal `require("webpack")` can resolve to different
// virtual store entries (different peer dependency hashes), causing
// "The 'compilation' argument must be an instance of Compilation".
const __require = createRequire(import.meta.resolve("webpack-cli"));
const webpack = __require("webpack");

const { ModuleFederationPlugin } = webpack.container;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  entry: "./src/remoteEntry.ts",

  output: {
    clean: true,
    filename: "js/[name].[contenthash:8].js",
    // Async chunks from dynamic import() use this naming pattern
    chunkFilename: "js/[name].[contenthash:8].js",
    path: path.resolve(__dirname, "./dist-webpack"),
    publicPath: "auto",
  },

  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.module\.css$/,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              importLoaders: 1,
              modules: {
                namedExport: false,
                exportLocalsConvention: "asIs",
                localIdentName: "[name]__[local]--[hash:base64:5]",
              },
            },
          },
          "postcss-loader",
        ],
      },
      {
        test: /\.css$/,
        exclude: /\.module\.css$/,
        use: ["style-loader", "css-loader", "postcss-loader"],
      },
      // Swifty template processing - compiles .html to template functions
      {
        test: /\.html$/,
        use: [
          {
            loader: "@swifty.js/mvc/webpack",
            options: {
              vdom: true,
            },
          },
        ],
        exclude: /index\.html$/,
      },
    ],
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: "./webpack-index.html",
      inject: "body",
      minify: false,
    }),

    // ── Module Federation (Remote) ──
    // Exposes Swifty views so that other apps can consume them at runtime.
    // Host apps load these via: import('swifty-demo/counter-view')
    new ModuleFederationPlugin({
      name: "swifty_demo",
      filename: "remoteEntry.js",
      exposes: {
        "./counter-view": "./src/exposed/counter-view.ts",
      },
      remotes: {
        swifty_devtool: "swifty_devtool@http://localhost:5173/remoteEntry.js",
      },
      shared: {
        "@swifty.js/mvc": {
          singleton: true,
          requiredVersion: "*",
          // eager: true places @swifty.js/mvc directly in the initial chunk
          // (no async shared-scope loader). Without this, MF generates a
          // shared-scope init in the main chunk; on every .html/.ts HMR,
          // webpack marks main as needing a hot-update. The main hot-update
          // file IS emitted (HTTP 200) but contains only runtime module
          // updates (__webpack_require__.u / .h) — executing these corrupts
          // the HMR runtime's `modules` registry. Subsequent view/template
          // hot-update.js files then crash with:
          //   TypeError: Cannot set properties of undefined
          //     (setting './src/components/counter-updater.html')
          // because `modules` is now undefined. eager avoids the async
          // shared-scope path entirely, so HMR only touches the changed
          // view/template chunk and main is never flagged.
          eager: true,
        },
        // react / react-dom intentionally not shared — see swifty-devtool/vite.config.ts
        // for the full explanation. Short version: swifty-demo is a Swifty MVC app,
        // not a React app. The remote (swifty-devtool) bundles its own React and
        // the render tree is self-contained. Sharing React across MF in Vite
        // dev mode causes duplicate module instances → "Invalid hook call".
      },
    }),
  ],
  devServer: {
    port: 3000,
    open: true,
    hot: true,
    compress: true,
    historyApiFallback: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
  },

  optimization: {
    // ────────────────────────────────────────────────────────────────────────────────────
    // splitChunks.chunks: "initial" | "async" | "all"
    //   "initial" – process entry chunks only; ignore async (dynamic-import) chunks
    //   "async"   – process async chunks only; leave entry chunks untouched
    //   "all"     – process both entry and async chunks
    //
    // Why "async" instead of "all":
    //
    //   Module Federation shared modules (@swifty.js/mvc, singleton: true) must be
    //   synchronously available in the initial chunk so that the shared scope can be
    //   correctly initialized when remoteEntry.js executes.
    //
    //   Failure chain with "all":
    //     1. Host (swifty-devtool) calls import("swifty-demo/counter-view")
    //     2. Host's MF runtime injects <script src="remoteEntry.js">
    //     3. remoteEntry.js initializes the shared scope — requires @swifty.js/mvc
    //        synchronously
    //     4. "all" has already extracted @swifty.js/mvc into a separate async vendor chunk
    //     5. Shared scope initialization fails — chunk not yet loaded
    //     6. window.__swifty_DemoMF is never set
    //     7. Throws: ScriptExternalLoadError: Loading script failed. (missing)
    //
    //   Fix: use "async" so @swifty.js/mvc stays in the initial chunk, remains
    //   synchronously available, and shared scope initialization succeeds.
    // ────────────────────────────────────────────────────────────────────────────────────

    // Split view modules into separate chunks
    splitChunks: {
      chunks: "async",
      minSize: 0,
      cacheGroups: {
        // ── View chunks (async, loaded by Framework.use → require) ──
        "view-home": {
          test: /src[\\/]views[\\/]home/,
          name: "view-home",
          chunks: "async",
          enforce: true,
        },
        "view-about": {
          test: /src[\\/]views[\\/]about/,
          name: "view-about",
          chunks: "async",
          enforce: true,
        },
        "view-counter": {
          test: /src[\\/]views[\\/]counter/,
          name: "view-counter",
          chunks: "async",
          enforce: true,
        },
        "view-404": {
          test: /src[\\/]views[\\/]404/,
          name: "view-404",
          chunks: "async",
          enforce: true,
        },
        "comp-counter-store": {
          test: /src[\\/]components[\\/]counter-store/,
          name: "comp-counter-store",
          chunks: "async",
          enforce: true,
        },
        "comp-counter-updater": {
          test: /src[\\/]components[\\/]counter-updater/,
          name: "comp-counter-updater",
          chunks: "async",
          enforce: true,
        },

        // // ── MF shared dependency chunks ──
        // // @swifty.js/mvc singleton shared dependency
        // "vendor-swifty-mvc": {
        //   test: /swifty[\\/]dist[\\/]index\.js$/,
        //   name: "vendor-swifty-mvc",
        //   chunks: "async",
        //   enforce: true,
        // },

        // NOTE: "vendor-swifty-mvc" cacheGroup removed — with eager: true in
        // the shared config above, @swifty.js/mvc is already in the initial
        // chunk. This cacheGroup previously fought MF over @swifty.js/mvc
        // placement (splitChunks wanted it in an async "vendor-swifty-mvc"
        // chunk; MF singleton wanted it in main), causing the main chunk
        // (shared-scope initializer) to be flagged for hot-update on every
        // view/template change → ChunkLoadError. Letting MF fully own
        // @swifty.js/mvc resolves the HMR failure.
        // CSS-related loaders (style-loader, css-loader, postcss-loader)
        "vendor-css-loaders": {
          test: /[\\/]node_modules[\\/].*?[\\/]style-loader|css-loader|postcss-loader/,
          name: "vendor-css-loaders",
          chunks: "async",
          enforce: true,
        },
        // @babel/parser (used by swifty template compiler)
        "vendor-babel-parser": {
          test: /[\\/]node_modules[\\/].*?[\\/]@babel[\\/]parser/,
          name: "vendor-babel-parser",
          chunks: "async",
          enforce: true,
        },
      },
    },
  },

  devtool: "source-map",
};
