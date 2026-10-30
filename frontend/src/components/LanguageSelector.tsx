"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { savedPreferencesMatch, type Preferences } from "@/lib/i18n/core";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPlatformLanguage, setPlatformLanguage, updateMyProfile } from "@/lib/api/users";

export function LanguageSelector({ regional = false }: { regional?: boolean }) {
  const intl = useI18n();
  const { user, setUser, isSuperAdmin } = useAuth();
  const client = useQueryClient();
  const platform = useQuery({ queryKey: ["platform-language"], queryFn: getPlatformLanguage });
  const [platformChoice, setPlatformChoice] = useState<"en" | "fa" | "">("");
  async function changeLanguage(locale: string) {
    if (locale !== "default") return change({ locale: locale as Preferences["locale"] });
    if (!user) return;
    setError(false); setSaving(true);
    try {
      const updated = await updateMyProfile({ locale: null });
      if (updated.locale != null) throw new Error("Preference reset failed");
      setUser(updated);
      intl.setPreferences({ locale: platform.data?.locale ?? "en" });
    } catch { setError(true); }
    finally { setSaving(false); }
  }
  async function saveDefault() {
    setError(false); setSaving(true);
    try {
      const updated = await setPlatformLanguage(platformChoice || platform.data?.locale || "en");
      client.setQueryData(["platform-language"], updated);
    } catch { setError(true); }
    finally { setSaving(false); }
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  async function change(prefs: Partial<Preferences>) {
    setError(false); setSaving(true);
    try {
      if (user) {
        const updated = await updateMyProfile(prefs);
        if (!savedPreferencesMatch(updated, prefs)) throw new Error("Language preference was not confirmed by the server");
        setUser(updated);
      }
      intl.setPreferences(prefs);
    } catch { setError(true); }
    finally { setSaving(false); }
  }
  return <div className="pmp-language-preferences">
    <label>{intl.t("Language")}<select aria-label={intl.t("Language")} value={user?.locale ?? "default"} disabled={saving} onChange={event => changeLanguage(event.target.value)}><option value="default">{intl.t("Use platform default")}</option><option value="en" lang="en">English</option><option value="fa" lang="fa">فارسی</option></select></label>
    {regional && <><label>{intl.t("Calendar")}<select value={intl.calendar} disabled={saving} onChange={event => change({ calendar: event.target.value as Preferences["calendar"] })}><option value="gregory">{intl.t("Gregorian")}</option><option value="persian">{intl.t("Persian calendar")}</option></select></label><label>{intl.t("Digits")}<select value={intl.numbering_system} disabled={saving} onChange={event => change({ numbering_system: event.target.value as Preferences["numbering_system"] })}><option value="latn">{intl.t("Latin digits")} (0123)</option><option value="arabext">{intl.t("Persian digits")} (۰۱۲۳)</option></select></label><p className="pmp-language-hint">{intl.t("Language changes apply immediately.")}</p></>}
    {isSuperAdmin() && <fieldset style={{ marginTop: 16, padding: 12, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2)" }}>
      <legend>{intl.t("Platform default language")}</legend>
      {!platform.data?.configured && <p>{intl.t("Choose the initial language for all users.")}</p>}
      <p>{intl.t("Applies to users without a personal language preference.")}</p>
      <label>{intl.t("Default language")}<select value={platformChoice || platform.data?.locale || "en"} disabled={saving || !platform.data} onChange={event => setPlatformChoice(event.target.value as "en" | "fa")}><option value="en">English</option><option value="fa">فارسی</option></select></label>
      <button type="button" className="docs-toolbar-btn" disabled={saving || !platform.data} onClick={saveDefault}>{intl.t("Save default language")}</button>
    </fieldset>}
    {error && <span role="alert">{intl.t("Language preference could not be saved.")}</span>}
  </div>;
}
