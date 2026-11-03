import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, formatDate, formatNumber, relativeDate, translate, translateWithPreferences, messages, preferencesFromCookies, accountPreferences, savedPreferencesMatch, localizeProblem, plural } from "./core";

test("English remains unchanged and Persian falls back to the original message", () => {
  assert.equal(translate("en", "Projects"), "Projects");
  assert.equal(translate("fa", "Projects"), "پروژه‌ها");
  assert.equal(translate("fa", "Uncatalogued message"), "Uncatalogued message");
});
test("catalog placeholders match their English message IDs", () => {
  for (const [source, translated] of Object.entries(messages)) assert.deepEqual([...source.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(), [...translated.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(), source);
});
test("calendar and digits are explicit formatting choices, not stored-date mutations", () => {
  const date = "2026-03-21";
  const fa = { ...defaults, locale: "fa" as const, calendar: "persian" as const, numbering_system: "arabext" as const };
  assert.match(formatDate(date, fa, { year: "numeric" }), /۱۴۰۵/);
  assert.match(formatNumber(123, fa), /۱۲۳/);
  assert.match(formatDate(date, { ...fa, calendar: "gregory" }), /۱۴۰۵/);
  assert.equal(date, "2026-03-21");
});
test("invalid dates fail safely and relative time is localized", () => {
  assert.equal(formatDate("bad-date", defaults), "—");
  assert.match(relativeDate("2026-01-01", { ...defaults, locale: "fa" }, new Date("2026-01-02").getTime()), /دیروز/);
});
test("valid browser choices override defaults in both directions and invalid cookies are ignored", () => {
  const previous = { locale: "fa", calendar: "persian", numbering_system: "arabext" } as const;
  assert.deepEqual(preferencesFromCookies({ "pmp.locale": "en", "pmp.calendar": "gregory", "pmp.numbering_system": "latn" }, previous), defaults);
  assert.deepEqual(preferencesFromCookies({ "pmp.locale": "ar", "pmp.calendar": "bad" }), defaults);
});
test("plural forms and substitution preserve values supplied by the caller", () => {
  assert.equal(plural("en", "{count} item", "{count} items", 1), "1 item");
  assert.equal(plural("en", "{count} item", "{count} items", 2), "2 items");
  assert.equal(translate("fa", "Complete {item}", { item: "PMP / API v2" }), "تکمیل PMP / API v2");
});
test("problem localization preserves unknown details and English behavior", () => {
  assert.equal(localizeProblem("en", "forbidden", "Private project"), "Private project");
  assert.match(localizeProblem("fa", "forbidden", "Private project"), /Private project/);
  assert.notEqual(localizeProblem("fa", "forbidden", "Private project"), "Private project");
  assert.equal(localizeProblem("fa", "vendor_error", "Vendor explanation"), "Vendor explanation");
});
test("interpolated counts follow digit preferences while string identifiers remain unchanged", () => {
  const prefs = { ...defaults, locale: "fa" as const, numbering_system: "arabext" as const };
  assert.equal(translateWithPreferences(prefs, "{completed} of {total} completed", { completed: 2, total: 3 }), "۲ مورد از ۳ مورد تکمیل شده");
  assert.equal(translateWithPreferences(prefs, "Complete {item}", { item: "PMP 123" }), "تکمیل PMP 123");
});
test("an older API that omits locale cannot confirm a saved preference", () => {
  assert.equal(savedPreferencesMatch({}, { locale: "fa" }), false);
  assert.equal(savedPreferencesMatch({ locale: null }, { locale: "fa" }), false);
  assert.equal(savedPreferencesMatch({ locale: "en" }, { locale: "fa" }), false);
  assert.equal(savedPreferencesMatch({ locale: "fa", calendar: "gregory" }, { locale: "fa" }), true);
});
test("date and time style presets do not conflict with default date fields", () => {
  assert.match(formatDate("2026-03-21", defaults, { dateStyle: "long" }), /2026/);
  assert.doesNotThrow(() => formatDate("2026-03-21T10:00:00Z", defaults, { timeStyle: "short" }));
});
test("calendar and digit preferences restore independently when account language is unset", () => {
  const restored = accountPreferences({ locale: null, calendar: "persian", numbering_system: "arabext" });
  assert.deepEqual(restored, { calendar: "persian", numbering_system: "arabext" });
  assert.equal({ ...defaults, ...restored }.locale, "en");
});
test("absent or invalid account preferences do not overwrite browser choices", () => {
  assert.deepEqual(accountPreferences({}), {});
  assert.deepEqual(accountPreferences({ locale: "ar", calendar: "other", numbering_system: null }), {});
});


test("platform language is inherited only when no personal preference exists", () => {
  assert.equal(accountPreferences({ locale: null }, "fa").locale, "fa");
  assert.equal(accountPreferences({ locale: "en" }, "fa").locale, "en");
  assert.equal(accountPreferences({ locale: "fa" }, "en").locale, "fa");
  assert.equal(accountPreferences({}, "en").locale, "en");
});

test("Persian language always uses Jalali even with a legacy Gregorian preference", () => {
  assert.equal(accountPreferences({ locale: "fa", calendar: "gregory" }).calendar, "persian");
  assert.equal(accountPreferences({ locale: null, calendar: "gregory" }, "fa").calendar, "persian");
  assert.equal(preferencesFromCookies({ "pmp.locale": "fa", "pmp.calendar": "gregory" }).calendar, "persian");
  assert.match(formatDate("2026-03-21", { ...defaults, locale: "fa" }, { year: "numeric" }), /1405/);
});
