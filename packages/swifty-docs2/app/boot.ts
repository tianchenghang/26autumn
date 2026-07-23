import { initDocsState, initRouter, initLayout } from "@swifty.js/docs/theme";

import {
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@swifty-docs/generated";

import "./main.css";

initDocsState({ config: docsConfig, loadContent, getSearchIndex });
initRouter();
initLayout("#app");
