import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { ACCENT_COLORS, THEME_STYLES, DEFAULT_APPEARANCE, normalizeAppearance, resolvedTheme, THEME_INIT_SCRIPT, applyAppearance, getStoredAppearance } from "./theme";

test("six independent styles and six accents include the existing design and purple", () => {
  assert.equal(new Set(THEME_STYLES.map(item => item.id)).size, 6);
  assert.equal(new Set(ACCENT_COLORS.map(item => item.id)).size, 6);
  assert.ok(THEME_STYLES.some(item => item.id === "classic"));
  assert.ok(ACCENT_COLORS.some(item => item.id === "purple"));
  assert.deepEqual(THEME_STYLES.map(item => item.name), ["Classic", "Frosted Glass", "Evergreen", "Midnight", "Warm Glass", "Minimal"]);
});
test("appearance validates cached values and preserves independent choices", () => {
  assert.deepEqual(normalizeAppearance({ theme: "dark", theme_variant: "study", accent_color: "purple" }), { theme: "dark", theme_variant: "study", accent_color: "purple" });
  assert.deepEqual(normalizeAppearance({ theme: "bad", theme_variant: "unknown", accent_color: "url(x)" }), DEFAULT_APPEARANCE);
  assert.deepEqual(normalizeAppearance(null, { ...DEFAULT_APPEARANCE, theme: "dark" }), { ...DEFAULT_APPEARANCE, theme: "dark" });
});
test("system mode follows OS without overriding explicit light/dark choices", () => {
  assert.equal(resolvedTheme("system", true), "dark"); assert.equal(resolvedTheme("system", false), "light");
  assert.equal(resolvedTheme("light", true), "light"); assert.equal(resolvedTheme("dark", false), "dark");
});
test("before-paint script restores selections, migrates legacy mode and tolerates blocked storage", () => {
  function render(appearance: string | null, legacy: string | null, blocked = false) {
    const root = { dataset: {} as Record<string,string>, style: {} as Record<string,string> };
    runInNewContext(THEME_INIT_SCRIPT, { document: { documentElement: root }, localStorage: { getItem: (key: string) => { if (blocked) throw new Error("Blocked"); return key === "pmp.appearance" ? appearance : legacy; } }, matchMedia: () => ({ matches: true }) });
    return root;
  }
  assert.deepEqual(render(JSON.stringify({ theme: "system", theme_variant: "sprint", accent_color: "purple" }), null).dataset, { theme: "dark", themeStyle: "sprint", accent: "purple" });
  assert.equal(render(null, "dark").dataset.theme, "dark");
  assert.equal(render(null, null, true).dataset.theme, "light");
  assert.equal(render(JSON.stringify({ theme_variant: "invalid", accent_color: "invalid" }), null).dataset.themeStyle, "classic");
});
test("all six light accent swatches meet WCAG AA for white button text", () => {
  for (const color of ACCENT_COLORS) {
    const channels = color.color.slice(1).match(/../g)!.map(part => parseInt(part, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    const luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    assert.ok(1.05 / (luminance + .05) >= 4.5, color.name);
  }
});

test("account caches keep theme choices independent and blocked storage does not prevent applying a theme", () => {
  const originals = new Map(["window", "document"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = new Map<string,string>();
  const root = { dataset: {} as Record<string,string>, style: {} as Record<string,string> };
  let blocked = false;
  Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: root } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: false }), localStorage: { getItem: (key: string) => { if (blocked) throw new Error("Blocked"); return storage.get(key) ?? null; }, setItem: (key: string, value: string) => { if (blocked) throw new Error("Blocked"); storage.set(key,value); } } } });
  try {
    const first = { theme: "dark" as const, theme_variant: "study" as const, accent_color: "purple" as const };
    const second = { theme: "light" as const, theme_variant: "minimal" as const, accent_color: "emerald" as const };
    applyAppearance(first, "first"); applyAppearance(second, "second");
    assert.deepEqual(getStoredAppearance("first"), first); assert.deepEqual(getStoredAppearance("second"), second);
    blocked = true; assert.doesNotThrow(() => applyAppearance(first, "first"));
    assert.equal(root.dataset.themeStyle, "study"); assert.equal(root.dataset.accent, "purple");
  } finally { for (const [key, original] of originals) { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis,key); } }
});
