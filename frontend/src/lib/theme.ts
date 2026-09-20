/* Theme helper: persists the user's choice and stamps <html data-theme>. */

export type Theme = "dark" | "light";

const KEY = "pmp.theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(KEY) === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(KEY, theme);
}

/** Inline script (runs before paint) to avoid a theme flash. */
export const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem(${JSON.stringify(KEY)});
  document.documentElement.dataset.theme = t === "dark" ? "dark" : "light";
} catch (e) {}
`;
