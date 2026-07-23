import { useState } from "preact/hooks";
import { Button } from "./ui/button";
import { ThemeToggleIcon } from "./logo";

const STORAGE_KEY = "swifty-docs-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(
    typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // storage unavailable
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <ThemeToggleIcon dark={dark} />
    </Button>
  );
}
