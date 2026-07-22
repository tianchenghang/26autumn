import { describe, it, expect, vi } from "vitest";
import { createStore, bindStore } from "../src/store";
import { createUpdater } from "../src/updater";

function fakeView(id: string) {
  const destroyListeners: Array<() => void> = [];
  return {
    updater: createUpdater(id),
    destroyListeners,
    on(event: string, cb: () => void) {
      if (event === "destroy") destroyListeners.push(cb);
    },
    triggerDestroy() {
      for (const cb of destroyListeners) cb();
    },
  };
}

interface CountState {
  count: number;
  step: number;
  increment: () => void;
}

let storeCounter = 0;
function nextName(): string {
  return `subscribe-test-${++storeCounter}`;
}

function makeStore(name: string) {
  return createStore<CountState>(name, (set, get) => ({
    count: 0,
    step: 1,
    increment() {
      set({ count: get().count + get().step });
    },
  }));
}

describe("createStore - subscribe", () => {
  it("subscribe fires on setState", () => {
    const store = makeStore(nextName());
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState({ count: 5 });

    expect(listener).toHaveBeenCalledTimes(1);
    const [newState, prevState] = listener.mock.calls[0];
    expect(newState.count).toBe(5);
    expect(prevState.count).toBe(0);

    store.destroy();
  });

  it("subscribe fires on action call", () => {
    const store = makeStore(nextName());
    const listener = vi.fn();
    store.subscribe(listener);

    store.getState().increment();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().count).toBe(1);

    store.destroy();
  });

  it("unsubscribe stops notifications", () => {
    const store = makeStore(nextName());
    const listener = vi.fn();
    const off = store.subscribe(listener);

    off();
    store.setState({ count: 10 });

    expect(listener).not.toHaveBeenCalled();
    store.destroy();
  });

  it("setState with no actual change does not notify", () => {
    const store = makeStore(nextName());
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState({ count: 0 }); // same as initial

    expect(listener).not.toHaveBeenCalled();
    store.destroy();
  });

  it("setState with updater function", () => {
    const store = makeStore(nextName());
    store.setState((prev) => ({ count: prev.count + 10 }));
    expect(store.getState().count).toBe(10);
    store.destroy();
  });

  it("destroy clears listeners", () => {
    const store = makeStore(nextName());
    const listener = vi.fn();
    store.subscribe(listener);

    store.destroy();
    // setState after destroy is a no-op
    store.setState({ count: 99 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("bindStore", () => {
  it("syncs initial state to view updater", () => {
    const store = makeStore(nextName());
    const view = fakeView("bind-test-1");
    const setSpy = vi.spyOn(view.updater, "set");
    const digestSpy = vi.spyOn(view.updater, "digest");

    bindStore(view, store);

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ count: 0, step: 1 }),
    );
    expect(digestSpy).toHaveBeenCalled();

    store.destroy();
  });

  it("updates view on state change", () => {
    const store = makeStore(nextName());
    const view = fakeView("bind-test-2");
    const digestSpy = vi.spyOn(view.updater, "digest");

    bindStore(view, store);
    digestSpy.mockClear();

    store.setState({ count: 42 });

    expect(digestSpy).toHaveBeenCalled();

    store.destroy();
  });

  it("selector limits which state is forwarded", () => {
    const store = makeStore(nextName());
    const view = fakeView("bind-test-3");
    const setSpy = vi.spyOn(view.updater, "set");

    bindStore(view, store, (s) => ({ count: s.count }));

    // Initial set should only contain count
    const lastCall = setSpy.mock.calls[setSpy.mock.calls.length - 1][0];
    expect(lastCall).toEqual({ count: 0 });
    expect(lastCall).not.toHaveProperty("step");

    store.destroy();
  });

  it("auto-unsubscribes on view destroy", () => {
    const store = makeStore(nextName());
    const view = fakeView("bind-test-4");
    const digestSpy = vi.spyOn(view.updater, "digest");

    bindStore(view, store);
    digestSpy.mockClear();

    view.triggerDestroy();
    store.setState({ count: 99 });

    expect(digestSpy).not.toHaveBeenCalled();

    store.destroy();
  });

  it("returns unsubscribe function", () => {
    const store = makeStore(nextName());
    const view = fakeView("bind-test-5");
    const digestSpy = vi.spyOn(view.updater, "digest");

    const off = bindStore(view, store);
    digestSpy.mockClear();

    off();
    store.setState({ count: 77 });

    expect(digestSpy).not.toHaveBeenCalled();

    store.destroy();
  });
});
