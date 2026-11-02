"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { defaults, normalizePreferences, preferencesFromCookies, translateWithPreferences, formatDate, formatNumber, relativeDate, type Preferences } from "./core";

type Context = Preferences & { setPreferences: (prefs: Partial<Preferences>) => void; t: (message: string, values?: Record<string, string | number>) => string; date: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string; number: (value: number, options?: Intl.NumberFormatOptions) => string };
const I18nContext = createContext<Context | null>(null);

export function I18nProvider({ initial = defaults, children }: { initial?: Preferences; children: ReactNode }) {
  const [prefs, setPrefs] = useState(() => normalizePreferences(initial));
  const [restored, setRestored] = useState(false);
  const setPreferences = useCallback((updates: Partial<Preferences>) => setPrefs(previous => {
    const next = normalizePreferences({ ...previous, ...updates });
    return Object.keys(next).every(key => next[key as keyof Preferences] === previous[key as keyof Preferences]) ? previous : next;
  }), []);
  useLayoutEffect(() => {
    // Read before writing so static exports never overwrite the browser's choice.
    try {
      const cookies = Object.fromEntries(document.cookie.split(";").map(part => part.trim().split("=")));
      setPreferences(preferencesFromCookies(cookies, initial));
    } catch { /* Use the server default if browser cookie access is unavailable. */ }
    finally { setRestored(true); }
  }, [initial.locale, initial.calendar, initial.numbering_system, setPreferences]);
  useLayoutEffect(() => {
    if (!restored) return;
    try {
      for (const [name, value] of Object.entries(prefs)) document.cookie = `pmp.${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    } catch { /* Rendering still works when the browser blocks preference cookies. */ }
    document.documentElement.lang = prefs.locale;
    document.documentElement.dir = prefs.locale === "fa" ? "rtl" : "ltr";
    delete document.documentElement.dataset.localePending;
  }, [prefs, restored]);
  const value = useMemo(() => ({ ...prefs, setPreferences, t: (message: string, values?: Record<string, string | number>) => translateWithPreferences(prefs, message, values), date: (value: string | Date, options?: Intl.DateTimeFormatOptions) => formatDate(value, prefs, options), number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, prefs, options) }), [prefs, setPreferences]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n requires I18nProvider");
  return context;
}
export function LocalizedText({ message, values }: { message: string; values?: Record<string, string | number> }) {
  return <>{useI18n().t(message, values)}</>;
}
export function LocalizedDate({ value, options }: { value?: string | Date | null; options?: Intl.DateTimeFormatOptions }) {
  const intl = useI18n();
  return <bdi>{value ? intl.date(value, options) : "—"}</bdi>;
}
export function LocalizedRelativeTime({ value }: { value?: string | null }) {
  const intl = useI18n();
  return <bdi>{relativeDate(value, intl)}</bdi>;
}
