import { createModuleFederationConfig } from "@module-federation/vite";

const moduleFederationConfig = createModuleFederationConfig({
  name: "swifty_demo",
  filename: "remoteEntry.js",
  exposes: {
    "./counter-view": "./src/exposed/counter-view.ts",
  },
  shared: {
    "@swifty.js/mvc": { singleton: true, requiredVersion: "*" },
  },
});

export default moduleFederationConfig;
