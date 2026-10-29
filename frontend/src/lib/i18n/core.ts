import persian from "./fa.json";

export type Locale = "en" | "fa";
export type Preferences = { locale: Locale; calendar: "gregory" | "persian"; numbering_system: "latn" | "arabext" };
export const defaults: Preferences = { locale: "en", calendar: "gregory", numbering_system: "latn" };
export function savedPreferencesMatch(saved: { [Key in keyof Preferences]?: Preferences[Key] | null }, requested: Partial<Preferences>): boolean {
  return Object.entries(requested).every(([key, value]) => saved[key as keyof Preferences] === value);
}
export function accountPreferences(user: { locale?: unknown; calendar?: unknown; numbering_system?: unknown }): Partial<Preferences> {
  const result: Partial<Preferences> = {};
  if (user.locale === "en" || user.locale === "fa") result.locale = user.locale;
  if (user.calendar === "gregory" || user.calendar === "persian") result.calendar = user.calendar;
  if (user.numbering_system === "latn" || user.numbering_system === "arabext") result.numbering_system = user.numbering_system;
  return result;
}
export function preferencesFromCookies(cookies: Record<string, string | undefined>, fallback: Preferences = defaults): Preferences {
  const locale = cookies["pmp.locale"];
  const calendar = cookies["pmp.calendar"];
  const numbering = cookies["pmp.numbering_system"];
  return {
    locale: locale === "en" || locale === "fa" ? locale : fallback.locale,
    calendar: calendar === "gregory" || calendar === "persian" ? calendar : fallback.calendar,
    numbering_system: numbering === "latn" || numbering === "arabext" ? numbering : fallback.numbering_system,
  };
}
export const messages: Record<string, string> = persian;
const folded = Object.fromEntries(Object.entries(messages).map(([key, value]) => [key.toLowerCase(), value]));
export function translate(locale: Locale, message: string, values: Record<string, string | number> = {}): string {
  const translated = locale === "fa" ? messages[message] ?? folded[message.toLowerCase()] ?? message : message;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => key in values ? String(values[key]) : match);
}
export function intlLocale(prefs: Preferences): string {
  return `${prefs.locale === "fa" ? "fa-IR" : "en-US"}-u-ca-${prefs.calendar}-nu-${prefs.numbering_system}`;
}
export function formatDate(value: string | Date, prefs: Preferences, options: Intl.DateTimeFormatOptions = {}): string {
  const date = value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const fields: Intl.DateTimeFormatOptions = options.dateStyle || options.timeStyle ? {} : { year: "numeric", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat(intlLocale(prefs), { ...fields, ...options }).format(date);
}
export function formatNumber(value: number, prefs: Preferences, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(intlLocale(prefs), options).format(value);
}
export function translateWithPreferences(prefs: Preferences, message: string, values: Record<string, string | number> = {}): string {
  const formatted = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === "number" ? formatNumber(value, prefs) : value]));
  return translate(prefs.locale, message, formatted);
}
export function relativeDate(value: string | null | undefined, prefs: Preferences, now = Date.now()): string {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  const seconds = (new Date(value).getTime() - now) / 1000;
  const formatter = new Intl.RelativeTimeFormat(intlLocale(prefs), { numeric: "auto" });
  for (const [unit, duration] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(seconds) >= duration) return formatter.format(Math.round(seconds / duration), unit);
  }
  return formatter.format(0, "second");
}
export function plural(locale: Locale, one: string, other: string, count: number): string {
  return translate(locale, new Intl.PluralRules(locale).select(count) === "one" ? one : other, { count: new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(count) });
}

const problemMessages: Record<string, string> = {
  unauthorized: "Authentication is required or the credentials are invalid.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "The requested item was not found.",
  validation_error: "Please check the highlighted fields.",
  conflict: "This change conflicts with existing data.",
  business_rule_violation: "This action cannot be completed with the current data.",
  internal_error: "An unexpected error occurred. Please try again.",
};
/** Preserve the original problem payload and any actionable server detail. */
export function localizeProblem(locale: Locale, type: string, title: string): string {
  if (locale === "en") return title;
  const translated = translate(locale, title);
  if (translated !== title) return translated;
  const summary = problemMessages[type];
  return summary ? `${translate(locale, summary)} (${title})` : title;
}
