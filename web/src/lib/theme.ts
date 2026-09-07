import { useSyncExternalStore } from "react";

/**
 * Theme preference: "system" follows the OS (prefers-color-scheme), "light"/"dark"
 * force it. Applied by toggling `data-theme` on <html>; the CSS tokens in
 * index.css resolve the rest. Persisted to localStorage and applied on boot
 * (main.tsx) before first paint to avoid a flash.
 */
export type Theme = "system" | "light" | "dark";

const KEY = "sleepbot_theme";

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark" || t === "system") return t;
  } catch {
    /* ignore */
  }
  return "system";
}

let current: Theme = read();
const listeners = new Set<() => void>();

/** Reflect the given (or current) theme onto <html data-theme>. */
export function applyTheme(theme: Theme = current): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme): void {
  current = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
  listeners.forEach((l) => l());
}

/** Cycle System → Light → Dark → System. */
export function cycleTheme(): void {
  setTheme(current === "system" ? "light" : current === "light" ? "dark" : "system");
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => current,
    () => current,
  );
}
