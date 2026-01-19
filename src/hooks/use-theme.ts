import { useState, useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

// Shared theme store that syncs across all hook instances
const listeners = new Set<() => void>();

function getTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme") as Theme | null;
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  
  // Listen for storage changes from other tabs/components
  const handleStorage = (e: StorageEvent) => {
    if (e.key === "theme") callback();
  };
  window.addEventListener("storage", handleStorage);
  
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", handleStorage);
  };
}

function notifyListeners() {
  listeners.forEach(listener => listener());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem("theme", newTheme);
    // Apply immediately
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(newTheme);
    // Notify all instances
    notifyListeners();
  };

  return { theme, setTheme };
}
