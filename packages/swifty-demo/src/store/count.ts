import { createStore } from "@swifty.js/mvc";

export interface CountStore {
  // state
  count: number;
  step: number;
  history: string[];
  // actions
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  setStep: (val: number) => void;
  clearHistory: () => void;
}

const useCountStore = createStore<CountStore>("count", (set, get) => ({
  // ── state ──
  count: 0,
  step: 1,
  history: [] as string[],

  // ── actions ──
  increment() {
    const { count, step } = get();
    set({
      count: count + step,
      history: [...get().history, `+${step} → ${count + step}`],
    });
  },
  decrement() {
    const { count, step } = get();
    set({
      count: count - step,
      history: [...get().history, `-${step} → ${count - step}`],
    });
  },
  reset() {
    set({
      count: 0,
      history: [...get().history, "Reset → 0"],
    });
  },
  setStep(val: number) {
    set({ step: val });
  },
  clearHistory() {
    set({ history: [] });
  },
}));

export default useCountStore;
