import { useEffect, useSyncExternalStore, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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

// Update theme in database for logged-in users
async function updateThemeInDatabase(newTheme: Theme) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_settings')
        .update({ theme: newTheme })
        .eq('user_id', user.id);
    }
  } catch (error) {
    console.error('Failed to update theme in database:', error);
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem("theme", newTheme);
    // Apply immediately
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(newTheme);
    // Notify all instances
    notifyListeners();
    // Also update database for logged-in users
    updateThemeInDatabase(newTheme);
  }, []);

  return { theme, setTheme };
}
