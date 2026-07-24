import { render } from "preact";
import { LocationProvider, Router, Route } from "preact-iso";
import { DocsProvider, DocsLayout, createContentGuard } from "@swifty.js/docs";
import {
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@swifty-docs/generated";
import "./main.css";

// Built-in password guard: pages compiled with docsGuardPlugin()
// (frontmatter `protected: true` + DOCS_PASSWORD env) prompt for a
// password; everything else passes through untouched.
const guard = createContentGuard(loadContent);

function App() {
  return (
    <>
      <guard.ContentGuard />
      <DocsProvider
        config={docsConfig}
        loadContent={guard.loadContent}
        getSearchIndex={getSearchIndex}
      >
        <LocationProvider>
          <Router>
            <Route path="/" component={DocsLayout} />
            <Route default component={DocsLayout} />
          </Router>
        </LocationProvider>
      </DocsProvider>
    </>
  );
}

render(<App />, document.getElementById("app")!);
