"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { savedPreferencesMatch, type Preferences } from "@/lib/i18n/core";
import { useAuth } from "@/lib/auth/AuthProvider";
import { updateMyProfile } from "@/lib/api/users";

export function LanguageSelector({ regional = false }: { regional?: boolean }) {
  const intl = useI18n();
  const { user, setUser } = useAuth();
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
    <label>{intl.t("Language")}<select aria-label={intl.t("Language")} value={intl.locale} disabled={saving} onChange={event => change({ locale: event.target.value as Preferences["locale"] })}><option value="en" lang="en">English</option><option value="fa" lang="fa">فارسی</option></select></label>
    {regional && <><label>{intl.t("Calendar")}<select value={intl.calendar} disabled={saving} onChange={event => change({ calendar: event.target.value as Preferences["calendar"] })}><option value="gregory">{intl.t("Gregorian")}</option><option value="persian">{intl.t("Persian calendar")}</option></select></label><label>{intl.t("Digits")}<select value={intl.numbering_system} disabled={saving} onChange={event => change({ numbering_system: event.target.value as Preferences["numbering_system"] })}><option value="latn">{intl.t("Latin digits")} (0123)</option><option value="arabext">{intl.t("Persian digits")} (۰۱۲۳)</option></select></label><p className="pmp-language-hint">{intl.t("Language changes apply immediately.")}</p></>}
    {error && <span role="alert">{intl.t("Language preference could not be saved.")}</span>}
  </div>;
}
