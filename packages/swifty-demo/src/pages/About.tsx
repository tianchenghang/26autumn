import { useNavigate, useSearchParams } from "@solidjs/router";
import { countStore } from "../store/count";

export default function About() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = countStore;

  const author = () => searchParams.author ?? "Anonymous";
  const version = () => searchParams.version ?? "1.0";

  return (
    <div class="animate-fade-in min-h-screen bg-emerald-50/30 p-6">
      <div class="mx-auto max-w-2xl">
        <h1 class="mb-1 text-2xl font-normal tracking-tight text-emerald-800">
          About
        </h1>
        <p class="mb-8 text-xs text-emerald-500">
          Route params & shared store
        </p>

        <div class="mb-6 rounded-lg border border-emerald-100 bg-white p-5 shadow-sm">
          <h2 class="mb-3 text-sm font-medium text-emerald-700">
            Shared Store State
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

        <div class="mb-6 rounded-lg border border-emerald-100 bg-white p-5 shadow-sm">
          <h2 class="mb-3 text-sm font-medium text-emerald-700">
            Route Parameters
          </h2>
          <div class="space-y-2">
            <div class="flex items-center justify-between rounded bg-emerald-50/50 px-3 py-2">
              <span class="text-xs text-emerald-500">author</span>
              <span class="text-xs font-medium text-emerald-700">
                {author()}
              </span>
            </div>
            <div class="flex items-center justify-between rounded bg-emerald-50/50 px-3 py-2">
              <span class="text-xs text-emerald-500">version</span>
              <span class="text-xs font-medium text-emerald-700">
                {version()}
              </span>
            </div>
          </div>
          <p class="mt-3 text-[10px] text-emerald-300">
            Try: /about?author=Hang&version=2.0
          </p>
        </div>

        <button
          onClick={() => navigate("/home")}
          class="rounded-md bg-emerald-500 px-5 py-2 text-xs text-white transition-colors hover:bg-emerald-600"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
