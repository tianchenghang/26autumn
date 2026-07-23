import $ from "jquery";
import { setState } from "./state";
import { normalizePath } from "./lib/content";

type RouteListener = (path: string) => void;

let currentPath = normalizeLocation(window.location.pathname);
const listeners: RouteListener[] = [];

function normalizeLocation(raw: string): string {
  return normalizePath(raw).path;
}

function emit(path: string): void {
  for (const fn of listeners) fn(path);
}

export function navigate(to: string, opts?: { replace?: boolean }): void {
  const path = normalizeLocation(to);
  if (opts?.replace) {
    history.replaceState(null, "", to);
  } else {
    history.pushState(null, "", to);
  }
  if (path === currentPath) return;
  currentPath = path;
  setState({ currentPath: path });
  emit(path);
}

export function getPath(): string {
  return currentPath;
}

export function onRouteChange(fn: RouteListener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function initRouter(): void {
  $(document).on("click.swifty-router", "a[data-swifty-link]", (e) => {
    e.preventDefault();
    const href = $(e.currentTarget).attr("href");
    if (href) navigate(href);
  });

  window.addEventListener("popstate", () => {
    const path = normalizeLocation(window.location.pathname);
    currentPath = path;
    setState({ currentPath: path });
    emit(path);
  });

  const { redirect } = normalizePath(window.location.pathname);
  if (redirect !== null && redirect !== window.location.pathname) {
    history.replaceState(null, "", redirect);
    currentPath = redirect;
  }
}
