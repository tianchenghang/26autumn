import { useLocation, useNavigate } from "@solidjs/router";

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div class="animate-fade-in flex min-h-screen flex-col items-center justify-center bg-emerald-50/30 p-6">
      <span class="mb-4 text-6xl font-light text-emerald-200">404</span>
      <h1 class="mb-2 text-lg font-normal text-emerald-700">
        Page Not Found
      </h1>
      <p class="mb-6 text-xs text-emerald-400">
        The path{" "}
        <code class="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-600">
          {location.pathname}
        </code>{" "}
        does not match any route.
      </p>
      <button
        onClick={() => navigate("/home")}
        class="rounded-md bg-emerald-500 px-5 py-2 text-xs text-white transition-colors hover:bg-emerald-600"
      >
        Back to Home
      </button>
    </div>
  );
}
