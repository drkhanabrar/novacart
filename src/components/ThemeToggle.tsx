"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "novacart-theme";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const next: Theme = saved === "dark" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    setMounted(true);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={
        mounted
          ? `Switch to ${theme === "dark" ? "light" : "dark"} theme`
          : "Toggle dark mode"
      }
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="theme-toggle"
    >
      {theme === "dark" ? (
        <Sun className="h-[17px] w-[17px]" strokeWidth={1.8} />
      ) : (
        <Moon className="h-[17px] w-[17px]" strokeWidth={1.8} />
      )}
    </button>
  );
}
