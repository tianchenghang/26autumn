import { useNavigate } from "@solidjs/router";
import { countStore } from "../store/count";

export default function Home() {
  const navigate = useNavigate();
  const { state } = countStore;

  return (
    <div class="animate-fade-in min-h-screen bg-emerald-50/30 p-6">
      <div class="mx-auto max-w-2xl">
        <h1 class="mb-1 text-2xl font-normal tracking-tight text-emerald-800">
          Swifty Demo
        </h1>
        <p class="mb-8 text-xs text-emerald-500">
          SolidJS + Module Federation
        </p>

        <div class="mb-8 grid grid-cols-3 gap-3">
          <button
            onClick={() => navigate("/about")}
            class="rounded-lg border border-emerald-100 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
          >
            <span class="block text-sm font-medium text-emerald-700">
              About
            </span>
            <span class="mt-1 block text-[10px] text-emerald-400">
              Route params & store
            </span>
          </button>
          <button
            onClick={() => navigate("/counter")}
            class="rounded-lg border border-emerald-100 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
          >
            <span class="block text-sm font-medium text-emerald-700">
              Counter
            </span>
            <span class="mt-1 block text-[10px] text-emerald-400">
              Nested components
            </span>
          </button>
          <button
            onClick={() => navigate("/cdn")}
            class="rounded-lg border border-emerald-100 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
          >
            <span class="block text-sm font-medium text-emerald-700">CDN</span>
            <span class="mt-1 block text-[10px] text-emerald-400">
              Remote component
            </span>
          </button>
        </div>

        <div class="animate-slide-up rounded-lg border border-emerald-100 bg-white p-5 shadow-sm">
          <h2 class="mb-3 text-sm font-medium text-emerald-700">
            Store State
          </h2>
          <div class="grid grid-cols-2 gap-4">
            <div class="rounded bg-emerald-50/50 p-3 text-center">
              <span class="block text-2xl font-light text-emerald-600">
                {state.count}
              </span>
              <span class="text-[10px] text-emerald-400">count</span>
            </div>
            <div class="rounded bg-emerald-50/50 p-3 text-center">
              <span class="block text-2xl font-light text-emerald-600">
                {state.step}
              </span>
              <span class="text-[10px] text-emerald-400">step</span>
            </div>
          </div>
        </div>

        <div class="mt-6">
          <button
            onClick={() => alert("Notice\n\nYou clicked the button!")}
            class="rounded-md border border-emerald-200 px-5 py-2 text-xs text-emerald-600 transition-colors hover:bg-emerald-50"
          >
            Show Alert
          </button>
        </div>

        <p class="mt-8 text-[10px] text-emerald-300">
          Swifty Demo — SolidJS rewrite
        </p>
      </div>
    </div>
  );
}
