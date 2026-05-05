/**
 * <ThemeProvider> — Manages dark/light theme.
 *
 * Sets `data-theme` on <html>. Default is "system" (no attribute, lets media
 * query take over). Manual toggle persists to localStorage and overrides.
 *
 * Mount once in app/layout.tsx (client boundary required).
 */
"use client";

import * as React from "react";

type Theme = "system" | "dark" | "light";
type Resolved = "dark" | "light";

interface Ctx {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeCtx = React.createContext<Ctx | null>(null);
const STORAGE_KEY = "kh-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("system");
  const [systemPref, setSystemPref] = React.useState<Resolved>("dark");

  // hydrate from storage + system pref
  React.useEffect(() => {
    const stored = (typeof window !== "undefined" &&
      (localStorage.getItem(STORAGE_KEY) as Theme)) || "system";
    setThemeState(stored);

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const upd = () => setSystemPref(mq.matches ? "light" : "dark");
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);

  const resolved: Resolved = theme === "system" ? systemPref : theme;

  // reflect to <html data-theme>
  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    if (t === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, t);
  }, []);

  const toggle = React.useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return (
    <ThemeCtx.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
