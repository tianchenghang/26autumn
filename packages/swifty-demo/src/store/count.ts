import { createStore } from "solid-js/store";

export interface CountState {
  count: number;
  step: number;
  history: string[];
}

function createCountStore() {
  const [state, setState] = createStore<CountState>({
    count: 0,
    step: 1,
    history: [],
  });

  const actions = {
    increment() {
      const next = state.count + state.step;
      setState({
        count: next,
        history: [...state.history, `+${state.step} → ${next}`],
      });
    },
    decrement() {
      const next = state.count - state.step;
      setState({
        count: next,
        history: [...state.history, `-${state.step} → ${next}`],
      });
    },
    reset() {
      setState({ count: 0, history: [...state.history, "Reset → 0"] });
    },
    setStep(val: number) {
      setState("step", val);
    },
    clearHistory() {
      setState("history", []);
    },
  };

  return { state, actions };
}

export const countStore = createCountStore();
