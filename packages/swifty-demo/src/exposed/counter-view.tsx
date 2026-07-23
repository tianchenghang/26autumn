import { render } from "solid-js/web";
import CounterPanel from "../components/CounterPanel";
import "../index.css";

export function mountCounter(container: HTMLElement): () => void {
  return render(
    () => (
      <CounterPanel
        onBack={() => window.history.pushState({}, "", "/home")}
      />
    ),
    container,
  );
}

export default mountCounter;
