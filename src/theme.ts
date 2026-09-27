import { useSyncExternalStore } from "react";

/**
 * Light, dark, or follow the system. The choice is per browser (like the pinned detail pane) and lands on
 * <html data-theme>; with no attribute the stylesheet follows prefers-color-scheme.
 */
export type ThemePref = "system" | "light" | "dark";

const KEY = "gtd:theme";
const listeners = new Set<() => void>();
const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function getTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePref = getTheme()) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function setTheme(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable: the choice holds for this session */
  }
  applyTheme(pref);
  listeners.forEach((l) => l());
}

/** Whether the app is showing dark right now, whatever the reason. */
export function isDark(pref: ThemePref = getTheme()) {
  return pref === "dark" || (pref === "system" && Boolean(media?.matches));
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  media?.addEventListener("change", l);
  return () => {
    listeners.delete(l);
    media?.removeEventListener("change", l);
  };
};

/** The preference and what it resolves to, re-rendering when either changes. */
export function useTheme(): { pref: ThemePref; dark: boolean } {
  const pref = useSyncExternalStore(subscribe, getTheme);
  const dark = useSyncExternalStore(subscribe, () => isDark(pref));
  return { pref, dark };
}
