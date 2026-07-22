import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

// Module Federation requires an absolute publicPath in dev mode so that this
// app's exposed chunks (cdn-manager) resolve against its own dev server when
// consumed by a host (swifty-demo:3000).
//
// See swifty-demo/rsbuild.config.ts for the full explanation. Short version:
// rspack's MF runtime stores `output.publicPath` into `manifest.metaData.publicPath`
// at compile time. When it's "auto", the runtime `inferAutoPublicPath(version)`
// branch requires a `version` argument (the manifest URL) that the runtime fails
// to pass in dev mode → publicPath stays as the literal string "auto" → the
// browser resolves chunk URLs against the host page's origin → host dev server
// returns index.html → "Unexpected token '<'".
const MF_DEV_ORIGIN = "http://localhost:5173/";

export default defineConfig(({ command }) => {
  const isDev = command === "dev";
  return {
    plugins: [pluginReact()],

    source: {
      entry: {
        index: "./src/remoteEntry.tsx",
      },
    },

    output: {
      distPath: {
        root: "./dist",
      },
      filename: {
        js: "[name].[contenthash:8].js",
      },
      assetPrefix: "auto",
      copy: [{ from: "./public", to: "." }],
    },

    html: {
      template: "./webpack-index.html",
      inject: "body",
    },

    tools: {
      postcss(_, { addPlugins }) {
        addPlugins([tailwindcss]);
      },

      rspack(config, { rspack }) {
        // Force absolute publicPath in dev so MF chunks load from this remote's
        // own dev server when consumed by a host. `assetPrefix: "auto"` alone is
        // insufficient — see the module-level comment above.
        config.output = config.output ?? {};
        config.output.publicPath = isDev ? MF_DEV_ORIGIN : "/";

        // Module Federation (Host / Consumer)
        config.plugins = config.plugins ?? [];
        config.plugins.push(
          new rspack.container.ModuleFederationPlugin({
            name: "swifty_devtool",
            filename: "remoteEntry.js",
            remotes: {
              // swifty_demo: "swifty_demo@http://localhost:3000/varRemoteEntry.js",
              // swifty_demo: "swifty_demo@http://localhost:3300/cdn/swifty-demo/varRemoteEntry.js",
              swifty_demo: "swifty_demo@http://localhost:3000/remoteEntry.js",
            },
            exposes: {
              "./cdn-manager": "./src/exposed/cdn-manager.ts",
            },
            shared: {
              "@swifty.js/mvc": {
                singleton: true,
                requiredVersion: "*",
                eager: true,
              },
            },
          }),
        );

        // splitChunks: vendor cache group for node_modules
        config.optimization = config.optimization ?? {};
        config.optimization.splitChunks = {
          chunks: "all",
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: "vendor",
              chunks: "all",
            },
          },
        };
      },
    },

    server: {
      port: 5173,
      open: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },

    dev: {
      hmr: true,
      // lazyCompilation: false,
      client: {
        host: "localhost",
        port: 5173,
      },
    },
  };
});
