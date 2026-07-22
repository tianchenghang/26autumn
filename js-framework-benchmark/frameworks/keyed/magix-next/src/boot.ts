import { Framework, registerViewClass } from "swifty-next";
import MainView from "./main";

registerViewClass("main", MainView);

Framework.boot({
  rootId: "main",
  defaultView: "main",
  vdom: false,
});
