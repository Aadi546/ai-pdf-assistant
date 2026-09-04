"use client";

import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "ai-pdf:theme";
type Theme = "light" | "dark";

/**
 * The `dark` class is already applied before paint by the inline script in
 * layout.tsx (avoids a flash of the wrong theme) — this hook just reads
 * that class back into React state and keeps it in sync with toggles.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}
