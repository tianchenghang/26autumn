import { createSignal } from "solid-js";
import { Button } from "./ui/button";
import { ThemeToggleIcon } from "./Logo";

const STORAGE_KEY = "swifty-docs-theme";

/**
 * Light/dark toggle. The initial `.dark` class is applied by an inline
 * script in index.html before first paint (no FOUC); this component reads
 * that state and persists subsequent toggles to localStorage.
 */
export function ThemeToggle() {
  const [dark, setDark] = createSignal(
    typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  const toggle = () => {
    const next = !dark();
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // storage unavailable (private mode) — theme still toggles for the session
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark() ? "Switch to light mode" : "Switch to dark mode"}
    >
      <ThemeToggleIcon dark={dark()} />
    </Button>
  );
}
