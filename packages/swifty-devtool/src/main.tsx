import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { RouterProvider } from "@tanstack/react-router";
import "./index.css";
import { router } from "./router";

// Initialize the Sentry React SDK.
//
// Set a real DSN here (or wire it up via an environment variable such as
// `import.meta.env.VITE_SENTRY_DSN` once Rsbuild's `envPrefix` is configured)
// to enable error reporting to sentry.io. When the DSN is empty the SDK stays
// inert — no network calls — but `Sentry.ErrorBoundary` still catches render
// errors and renders the fallback UI.
Sentry.init({
  dsn: "",
  tracesSampleRate: 1.0,
});

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<RouterProvider router={router} />);
}
