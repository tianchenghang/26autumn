import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";

export default function Cdn() {
  const navigate = useNavigate();
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  let mountEl!: HTMLDivElement;
  let unmount: (() => void) | undefined;

  onMount(() => {
    import("swifty_devtool/cdn-manager")
      .then((mod) => {
        const mount = mod.mountCdnManager ?? mod.default;
        unmount = mount(mountEl);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "Make sure swifty-devtool is running on port 5173.",
        );
        setLoading(false);
      });
  });

  onCleanup(() => unmount?.());

  return (
    <div class="flex h-screen flex-col bg-sky-50/30">
      <div class="flex items-center justify-between border-b border-sky-100 bg-white px-6 py-3">
        <div class="flex items-center gap-3">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sm text-sky-600">
            CDN
          </span>
          <div>
            <h1 class="text-sm font-medium text-sky-800">CDN Manager</h1>
            <p class="text-[10px] text-sky-400">
              Remote component via Module Federation
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate("/home")}
          class="rounded-md border border-sky-200 px-4 py-1.5 text-xs text-sky-600 transition-colors hover:bg-sky-50"
        >
          Back to Home
        </button>
      </div>

      <div class="relative flex-1 overflow-hidden">
        <div ref={mountEl} style={{ height: "100%", width: "100%" }} />

        <Show when={loading()}>
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-sky-50/80">
            <div class="h-6 w-6 animate-spin rounded-full border-2 border-sky-200 border-t-sky-500" />
            <span class="text-xs text-sky-400">Loading CDN Manager...</span>
          </div>
        </Show>

        <Show when={error()}>
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-sky-50/80">
            <span class="text-sm font-medium text-red-500">
              Failed to load
            </span>
            <span class="max-w-xs text-center text-xs text-red-400">
              {error()}
            </span>
          </div>
        </Show>
      </div>
    </div>
  );
}
