"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("theme") as Theme | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = stored || (prefersDark ? "dark" : "light");
    setTheme(next);
    applyTheme(next);
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      applyTheme(next);
      return next;
    });
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 transition"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M12 4a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4Zm0 15a1 1 0 0 1 1 1h0a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm8-7a1 1 0 0 1 1 1h0a1 1 0 1 1-2 0 1 1 0 0 1 1-1ZM4 12a1 1 0 0 1-1 1h0a1 1 0 1 1 0-2h1a1 1 0 0 1 0 2Zm12.95-5.536a1 1 0 0 1 1.414 0h0a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.414-1.414ZM5.343 18.657a1 1 0 0 1-1.414 0h0a1 1 0 0 1 0-1.414l.707-.707a1 1 0 0 1 1.414 1.414Zm12.02 0a1 1 0 0 1-1.414-1.414l.707-.707a1 1 0 1 1 1.414 1.414Zm-12.02-12.02a1 1 0 1 1 1.414-1.414l.707.707A1 1 0 0 1 6.05 6.344Z" />
        </svg>
      )}
    </button>
  );
}
