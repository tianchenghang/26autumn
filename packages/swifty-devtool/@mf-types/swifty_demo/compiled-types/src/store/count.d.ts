export interface CountStore {
    count: number;
    step: number;
    history: string[];
    increment: () => void;
    decrement: () => void;
    reset: () => void;
    setStep: (val: number) => void;
    clearHistory: () => void;
}
declare const useCountStore: import("@swifty.js/mvc").StoreApi<CountStore>;
export default useCountStore;
