import { For, Show } from "solid-js";

interface CounterUpdaterProps {
  count: number;
  step: number;
  history: string[];
  onIncrement: () => void;
  onDecrement: () => void;
  onReset: () => void;
  onStepChange: (val: number) => void;
  onClearHistory: () => void;
}

export default function CounterUpdater(props: CounterUpdaterProps) {
  return (
    <div class="animate-fade-in rounded-lg border border-sky-100 bg-white p-5 shadow-sm">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-medium text-sky-700">Props Pattern</h3>
        <span class="rounded bg-sky-50 px-2 py-0.5 text-[10px] text-sky-500">
          props + callbacks
        </span>
      </div>

      <div class="mb-4 text-center">
        <span class="text-4xl font-light text-sky-600">{props.count}</span>
      </div>

      <div class="mb-4 flex items-center justify-center gap-2">
        <label class="text-xs text-sky-500">Step:</label>
        <input
          type="number"
          min={1}
          max={100}
          value={props.step}
          onChange={(e) =>
            props.onStepChange(parseInt(e.currentTarget.value) || 1)
          }
          class="w-16 rounded border border-sky-200 px-2 py-1 text-center text-xs text-sky-700 outline-none focus:border-sky-400"
        />
      </div>

      <div class="mb-4 flex justify-center gap-2">
        <button
          onClick={props.onIncrement}
          class="rounded-md bg-sky-500 px-4 py-1.5 text-xs text-white transition-colors hover:bg-sky-600"
        >
          +
        </button>
        <button
          onClick={props.onDecrement}
          class="rounded-md bg-sky-500 px-4 py-1.5 text-xs text-white transition-colors hover:bg-sky-600"
        >
          -
        </button>
        <button
          onClick={props.onReset}
          class="rounded-md border border-sky-200 px-4 py-1.5 text-xs text-sky-600 transition-colors hover:bg-sky-50"
        >
          Reset
        </button>
      </div>

      <div class="border-t border-sky-50 pt-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[10px] text-sky-400">History</span>
          <button
            onClick={props.onClearHistory}
            class="text-[10px] text-sky-400 transition-colors hover:text-sky-600"
          >
            Clear
          </button>
        </div>
        <Show
          when={props.history.length > 0}
          fallback={
            <p class="text-center text-[10px] text-sky-300">
              No operations yet
            </p>
          }
        >
          <ul class="max-h-24 space-y-1 overflow-y-auto">
            <For each={props.history}>
              {(record) => (
                <li class="text-[10px] text-sky-500">{record}</li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  );
}
