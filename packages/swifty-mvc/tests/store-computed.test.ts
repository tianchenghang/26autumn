import { describe, it, expect } from "vitest";
import { createStore, computed } from "../src/store";
import type { StoreApi } from "../src/store";

interface CountState {
  count: number;
  doubled: number;
  countPlusTen: number;
  increment: () => void;
}

let storeCounter = 0;
function nextName(): string {
  return `computed-test-${++storeCounter}`;
}

function makeCountStore(name: string): StoreApi<CountState> {
  return createStore<CountState>(name, (set, get) => ({
    count: 1,
    doubled: computed(["count"], () => get().count * 2),
    countPlusTen: computed(["count"], () => get().count + 10),
    increment() {
      set({ count: get().count + 1 });
    },
  }));
}

describe("createStore - computed", () => {
  it("computes an initial value from its deps", () => {
    const store = makeCountStore(nextName());
    const state = store.getState();
    expect(state.count).toBe(1);
    expect(state.doubled).toBe(2);
    expect(state.countPlusTen).toBe(11);
    store.destroy();
  });

  it("recomputes when a dep changes via setState", () => {
    const store = makeCountStore(nextName());
    store.setState({ count: 5 });
    expect(store.getState().doubled).toBe(10);
    expect(store.getState().countPlusTen).toBe(15);
    store.destroy();
  });

  it("recomputes when a dep changes via action", () => {
    const store = makeCountStore(nextName());
    store.getState().increment();
    expect(store.getState().count).toBe(2);
    expect(store.getState().doubled).toBe(4);
    expect(store.getState().countPlusTen).toBe(12);
    store.destroy();
  });

  it("writes to a computed key via setState are ignored", () => {
    const store = makeCountStore(nextName());
    store.setState({ doubled: 999 } as Partial<CountState>);
    expect(store.getState().doubled).toBe(2);
    store.destroy();
  });

  it("multiple computeds with the same dep all update together", () => {
    const store = makeCountStore(nextName());
    store.getState().increment();
    store.getState().increment();
    expect(store.getState().count).toBe(3);
    expect(store.getState().doubled).toBe(6);
    expect(store.getState().countPlusTen).toBe(13);
    store.destroy();
  });

  it("standalone computed() factory returns a marker object", () => {
    const marker = computed(["x"], () => 42);
    expect(typeof marker).toBe("object");
  });
});
