import { render } from "solid-js/web";
import { Router, Route, Navigate } from "@solidjs/router";
import { lazy } from "solid-js";
import "./index.css";

const Home = lazy(() => import("./pages/Home"));
const About = lazy(() => import("./pages/About"));
const Counter = lazy(() => import("./pages/Counter"));
const Cdn = lazy(() => import("./pages/Cdn"));
const NotFound = lazy(() => import("./pages/NotFound"));

render(
  () => (
    <Router>
      <Route path="/" component={() => <Navigate href="/home" />} />
      <Route path="/home" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/counter" component={Counter} />
      <Route path="/cdn" component={Cdn} />
      <Route path="*" component={NotFound} />
    </Router>
  ),
  document.getElementById("app")!,
);
