export const THEME_STYLES = [
  { id: "classic", name: "Classic", mode: "light", accent: "blue" },
  { id: "frosted", name: "Frosted Glass", mode: "light", accent: "purple" },
  { id: "clinical", name: "Evergreen", mode: "light", accent: "emerald" },
  { id: "sprint", name: "Midnight", mode: "dark", accent: "purple" },
  { id: "study", name: "Warm Glass", mode: "dark", accent: "blue" },
  { id: "minimal", name: "Minimal", mode: "light", accent: "emerald" },
] as const;
export const ACCENT_COLORS = [
  { id: "blue", name: "Blue", color: "#1D4ED8" },
  { id: "purple", name: "Purple", color: "#6D28D9" },
  { id: "emerald", name: "Emerald", color: "#047857" },
  { id: "teal", name: "Teal", color: "#0F766E" },
  { id: "rose", name: "Rose", color: "#BE123C" },
  { id: "amber", name: "Amber", color: "#92400E" },
] as const;
export type Theme = "dark" | "light" | "system";
export type ThemeVariant = typeof THEME_STYLES[number]["id"];
export type AccentColor = typeof ACCENT_COLORS[number]["id"];
export type Appearance = { theme: Theme; theme_variant: ThemeVariant; accent_color: AccentColor };
export const DEFAULT_APPEARANCE: Appearance = { theme: "light", theme_variant: "classic", accent_color: "blue" };
const KEY = "pmp.appearance";

export function normalizeAppearance(value: { theme?: unknown; theme_variant?: unknown; accent_color?: unknown } | null | undefined, fallback = DEFAULT_APPEARANCE): Appearance {
  return {
    theme: value?.theme === "light" || value?.theme === "dark" || value?.theme === "system" ? value.theme : fallback.theme,
    theme_variant: THEME_STYLES.some(item => item.id === value?.theme_variant) ? value!.theme_variant as ThemeVariant : fallback.theme_variant,
    accent_color: ACCENT_COLORS.some(item => item.id === value?.accent_color) ? value!.accent_color as AccentColor : fallback.accent_color,
  };
}
export function resolvedTheme(theme: Theme, darkSystem: boolean): "dark" | "light" {
  return theme === "system" ? darkSystem ? "dark" : "light" : theme;
}
export function getStoredTheme(): Theme {
  try { const mode = window.localStorage.getItem("pmp.theme"); return mode === "dark" || mode === "system" ? mode : "light"; } catch { return "light"; }
}
export function getStoredAppearance(userId?: string): Appearance {
  const fallback = { ...DEFAULT_APPEARANCE, theme: getStoredTheme() };
  try { return normalizeAppearance(JSON.parse(window.localStorage.getItem(userId ? `${KEY}:${userId}` : KEY) ?? "null"), fallback); } catch { return fallback; }
}
export function applyAppearance(value: Appearance, userId?: string): void {
  const appearance = normalizeAppearance(value);
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(appearance.theme, window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.themeStyle = appearance.theme_variant;
  root.dataset.accent = appearance.accent_color;
  root.style.colorScheme = root.dataset.theme;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(appearance));
    window.localStorage.setItem("pmp.theme", appearance.theme);
    if (userId) window.localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(appearance));
  } catch { /* Account persistence and the visible theme still work. */ }
}
export function applyTheme(theme: Theme): void { applyAppearance({ ...getStoredAppearance(), theme }); }

/** Validate cached values before first paint; account settings sync after login. */
export const THEME_INIT_SCRIPT = `(()=>{try{var a=JSON.parse(localStorage.getItem("${KEY}")||"null")||{};var t=a.theme||localStorage.getItem("pmp.theme");var r=document.documentElement;r.dataset.theme=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';r.dataset.themeStyle=${JSON.stringify(THEME_STYLES.map(item => item.id))}.includes(a.theme_variant)?a.theme_variant:'classic';r.dataset.accent=${JSON.stringify(ACCENT_COLORS.map(item => item.id))}.includes(a.accent_color)?a.accent_color:'blue';r.style.colorScheme=r.dataset.theme;}catch{document.documentElement.dataset.theme='light';}})();`;
