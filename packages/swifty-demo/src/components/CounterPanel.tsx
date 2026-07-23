import { createSignal } from "solid-js";
import CounterStore from "./CounterStore";
import CounterUpdater from "./CounterUpdater";

export default function CounterPanel(props: { onBack?: () => void }) {
  const [count, setCount] = createSignal(0);
  const [step, setStep] = createSignal(1);
  const [history, setHistory] = createSignal<string[]>([]);

  const increment = () => {
    const next = count() + step();
    setCount(next);
    setHistory([`+${step()} → ${next}`, ...history()]);
  };

  const decrement = () => {
    const next = count() - step();
    setCount(next);
    setHistory([`-${step()} → ${next}`, ...history()]);
  };

  const reset = () => {
    setCount(0);
    setHistory(["Reset → 0", ...history()]);
  };

  return (
    <div class="min-h-screen bg-emerald-50/30 p-6">
      <div class="mx-auto max-w-3xl">
        <h1 class="mb-1 text-2xl font-normal tracking-tight text-emerald-800">
          Counter Example
        </h1>
        <p class="mb-6 text-xs text-emerald-500">
          Two data-flow patterns: shared store vs props + callbacks
        </p>

        <div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <CounterStore />
          <CounterUpdater
            count={count()}
            step={step()}
            history={history()}
            onIncrement={increment}
            onDecrement={decrement}
            onReset={reset}
            onStepChange={setStep}
            onClearHistory={() => setHistory([])}
          />
        </div>

        <button
          onClick={() => props.onBack?.()}
          class="rounded-md bg-emerald-500 px-5 py-2 text-xs text-white transition-colors hover:bg-emerald-600"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
