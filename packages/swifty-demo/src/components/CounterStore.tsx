import { For, Show } from "solid-js";
import { countStore } from "../store/count";

export default function CounterStore() {
  const { state, actions } = countStore;

  return (
    <div class="animate-fade-in rounded-lg border border-emerald-100 bg-white p-5 shadow-sm">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-medium text-emerald-700">Store Pattern</h3>
        <span class="rounded bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-500">
          createStore
        </span>
      </div>

      <div class="mb-4 text-center">
        <span class="text-4xl font-light text-emerald-600">{state.count}</span>
      </div>

      <div class="mb-4 flex items-center justify-center gap-2">
        <label class="text-xs text-emerald-500">Step:</label>
        <input
          type="number"
          min={1}
          max={100}
          value={state.step}
          onChange={(e) =>
            actions.setStep(parseInt(e.currentTarget.value) || 1)
          }
          class="w-16 rounded border border-emerald-200 px-2 py-1 text-center text-xs text-emerald-700 outline-none focus:border-emerald-400"
        />
      </div>

      <div class="mb-4 flex justify-center gap-2">
        <button
          onClick={actions.increment}
          class="rounded-md bg-emerald-500 px-4 py-1.5 text-xs text-white transition-colors hover:bg-emerald-600"
        >
          +
        </button>
        <button
          onClick={actions.decrement}
          class="rounded-md bg-emerald-500 px-4 py-1.5 text-xs text-white transition-colors hover:bg-emerald-600"
        >
          -
        </button>
        <button
          onClick={actions.reset}
          class="rounded-md border border-emerald-200 px-4 py-1.5 text-xs text-emerald-600 transition-colors hover:bg-emerald-50"
        >
          Reset
        </button>
      </div>

      <div class="border-t border-emerald-50 pt-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[10px] text-emerald-400">History</span>
          <button
            onClick={actions.clearHistory}
            class="text-[10px] text-emerald-400 transition-colors hover:text-emerald-600"
          >
            Clear
          </button>
        </div>
        <Show
          when={state.history.length > 0}
          fallback={
            <p class="text-center text-[10px] text-emerald-300">
              No operations yet
            </p>
          }
        >
          <ul class="max-h-24 space-y-1 overflow-y-auto">
            <For each={state.history}>
              {(record) => (
                <li class="text-[10px] text-emerald-500">{record}</li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  );
}
