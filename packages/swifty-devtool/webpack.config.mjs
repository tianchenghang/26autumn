// @ts-check

import path from "path";
import { fileURLToPath } from "url";
import HtmlWebpackPlugin from "html-webpack-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";
import webpack from "webpack";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {Record<string, unknown>} env
 * @param {{ mode: "development" | "production" }} argv
 *
 */
export default (env, argv) => {
  const isProd = argv.mode === "production";

  return {
    entry: "./src/remoteEntry.tsx",

    output: {
      clean: true,
      filename: "js/[name].[contenthash:8].js",
      path: path.resolve(__dirname, "dist"),
      publicPath: "auto",
    },

    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: "ts-loader",
            options: {
              compilerOptions: {
                noEmit: false,
              },
            },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [
            "style-loader",
            "css-loader",
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  plugins: ["@tailwindcss/postcss"],
                },
              },
            },
          ],
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: "asset/resource",
        },
      ],
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: "./webpack-index.html",
        inject: "body",
        minify: false,
      }),
      new CopyWebpackPlugin({
        patterns: [{ from: "public", to: "." }],
      }),

      // ── Module Federation (Host) ──
      // Consumes remote Swifty views from swifty-demo running on port 3000.
      // At runtime: import('swifty_demo/counter-view') loads the remote module.
      new webpack.container.ModuleFederationPlugin({
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
    ],

    devServer: {
      port: 5173,
      host: "localhost",
      open: true,
      hot: true,
      compress: true,
      historyApiFallback: true,
      // CORS headers — allow CDN (swifty-cdn:3300) and other origins to load remoteEntry.js
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
      },
    },

    optimization: isProd
      ? {
          splitChunks: {
            chunks: "all",
            cacheGroups: {
              vendor: {
                test: /[\\/]node_modules[\\/]/,
                name: "vendor",
                chunks: "all",
              },
            },
          },
        }
      : undefined,

    devtool: isProd ? "hidden-source-map" : "source-map",
  };
};
