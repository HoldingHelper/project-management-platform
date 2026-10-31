"use client";

import { useEffect, useId, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getMySettings, updateMySettings } from "@/lib/api/users";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { ACCENT_COLORS, THEME_STYLES, applyAppearance, getStoredAppearance, normalizeAppearance, type Appearance } from "@/lib/theme";

export function AppearanceSettings() {
  const { t } = useI18n();
  const { user } = useAuth();
  const group = useId();
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ["my-settings", user?.id], queryFn: getMySettings, enabled: !!user });
  const [current, setCurrent] = useState<Appearance>(() => getStoredAppearance());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => { if (settings.data) setCurrent(normalizeAppearance(settings.data, getStoredAppearance(user?.id))); }, [settings.data, user?.id]);
  async function choose(updates: Partial<Appearance>) {
    if (saving || !user) return;
    const previous = current;
    const next = { ...current, ...updates };
    setSaving(true); setMessage(""); setError(false); setCurrent(next);
    applyAppearance(next, user.id);
    try {
      const saved = await updateMySettings(next);
      if (saved.theme !== next.theme || saved.theme_variant !== next.theme_variant || saved.accent_color !== next.accent_color) throw new Error("Appearance preference was not confirmed by the server.");
      client.setQueryData(["my-settings", user.id], saved);
      client.setQueryData(["my-settings"], saved);
      setMessage(t("Appearance saved to your account."));
    } catch {
      setCurrent(previous); applyAppearance(previous, user.id); setError(true);
      setMessage(t("Could not save appearance. Your previous theme has been restored."));
    } finally { setSaving(false); }
  }
  const disabled = saving || settings.isPending || settings.isError;
  return <div className="pmp-appearance-settings" aria-busy={saving}>
    <p className="pmp-appearance-intro">{t("Choose a theme and accent color.")}</p>
    {settings.isError && <p role="alert">{t("Appearance settings could not be loaded.")} <button type="button" onClick={() => settings.refetch()}>{t("Retry")}</button></p>}
    <fieldset disabled={disabled} className="pmp-appearance-fieldset">
      <legend>{t("Theme style")}</legend>
      <div className="pmp-theme-grid">
        {THEME_STYLES.map(style => <label key={style.id} className={`pmp-theme-choice ${current.theme_variant === style.id ? "is-selected" : ""}`}>
          <input type="radio" name={`${group}-style`} value={style.id} checked={current.theme_variant === style.id} onChange={() => choose({ theme_variant: style.id, ...(style.id === "classic" ? {} : { theme: style.mode }), accent_color: style.accent })} />
          <span className="pmp-theme-choice-name">{t(style.name)}</span>
        </label>)}
      </div>
    </fieldset>
    <fieldset disabled={disabled} className="pmp-appearance-fieldset">
      <legend>{t("Accent color")}</legend>
      <div className="pmp-accent-grid">
        {ACCENT_COLORS.map(color => <label key={color.id} className={`pmp-accent-choice ${current.accent_color === color.id ? "is-selected" : ""}`}>
          <input type="radio" name={`${group}-accent`} value={color.id} checked={current.accent_color === color.id} onChange={() => choose({ accent_color: color.id })} />
          <span style={{ background: color.color }} aria-hidden="true">{current.accent_color === color.id && <Check size={16} />}</span><b>{t(color.name)}</b>
        </label>)}
      </div>
    </fieldset>
    <fieldset disabled={disabled} className="pmp-appearance-fieldset">
      <legend>{t("Display mode")}</legend>
      <div className="pmp-display-modes">
        {([{ id: "light", name: "Light", icon: Sun }, { id: "dark", name: "Dark", icon: Moon }, { id: "system", name: "System", icon: Monitor }] as const).map(mode => <label key={mode.id} className={current.theme === mode.id ? "is-selected" : ""}>
          <input type="radio" name={`${group}-mode`} value={mode.id} checked={current.theme === mode.id} onChange={() => choose({ theme: mode.id })} /><mode.icon size={16} />{t(mode.name)}
        </label>)}
      </div>
    </fieldset>
    <p role={error ? "alert" : "status"} className="pmp-appearance-save-status">{saving ? t("Saving…") : message || t("Changes apply immediately and sync with your account.")}</p>
  </div>;
}
