/* Opt-in local visual/persistence check. Restores the account appearance afterwards.
 * PMP_TEST_EMAIL and PMP_TEST_PASSWORD must be explicitly supplied. */
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
(async () => {
  const origin = process.env.PMP_TEST_ORIGIN || "http://127.0.0.1:3000";
  if (!process.env.PMP_TEST_EMAIL || !process.env.PMP_TEST_PASSWORD) throw new Error("Provide local test credentials explicitly");
  const login = await fetch(`${origin}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: process.env.PMP_TEST_EMAIL, password: process.env.PMP_TEST_PASSWORD }) });
  assert.ok(login.ok, "Local test login must succeed");
  const session = await login.json();
  const headers = { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  const original = await (await fetch(`${origin}/api/v1/users/me/settings`, { headers })).json();
  const restore = { theme: original.theme || "light", theme_variant: original.theme_variant || "classic", accent_color: original.accent_color || "blue" };
  const browser = await chromium.launch({ executablePath: process.env.PMP_CHROMIUM || "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
    await context.addInitScript(({ refresh, user }) => {
      if (!localStorage.getItem("pmp.refresh_token")) {
        localStorage.setItem("pmp.refresh_token", refresh);
        localStorage.setItem("pmp.user", JSON.stringify(user));
      }
    }, { refresh: session.refresh_token, user: session.user });
    const page = await context.newPage();
    await page.goto(`${origin}/settings`);
    const appearance = page.locator(".pmp-appearance-settings");
    await appearance.waitFor();
    await page.waitForFunction(() => !document.querySelector(".pmp-appearance-fieldset")?.disabled);
    assert.equal(await appearance.locator(".pmp-theme-choice").count(), 6);
    assert.equal(await appearance.locator(".pmp-theme-choice img").count(), 0);
    assert.equal(await appearance.locator(".pmp-accent-choice").count(), 6);
    async function choose(selector, value) {
      const input = appearance.locator(`${selector} input[value="${value}"]`);
      if (await input.isChecked()) return;
      const responsePromise = page.waitForResponse(response => response.url().includes("/users/me/settings") && response.request().method() === "PATCH");
      await input.locator("..").click();
      const response = await responsePromise;
      assert.ok(response.ok(), "Appearance update must succeed");
      await page.waitForFunction(() => !document.querySelector(".pmp-appearance-fieldset")?.disabled);
      assert.ok(await input.isChecked());
    }
    const designs = process.env.PMP_TEST_STYLE ? [process.env.PMP_TEST_STYLE] : ["classic", "frosted", "clinical", "sprint", "study", "minimal"];
    const colors = ["blue", "purple", "emerald", "teal", "rose", "amber"];
    for (const design of designs) {
      await choose(".pmp-theme-choice", design);
      if (design === "sprint") {
        const surface = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--surface-2").trim().toUpperCase());
        assert.equal(surface, "#171D35", "Sprint's navy surface must override the shared dark defaults");
      }
      if (design === "clinical") {
        const sidebar = await page.evaluate(() => getComputedStyle(document.querySelector(".pmp-sidebar")).backgroundImage);
        assert.ok(sidebar.includes("linear-gradient"), "Evergreen must have its own colored sidebar");
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.pmp-sidebar a:not([aria-current="page"])')).color === "rgb(225, 242, 237)");

      }
      await page.screenshot({ path: `/artifacts/theme-${design}.png`, animations: "disabled" });
      for (const color of colors) {
        await choose(".pmp-accent-choice", color);
        const actual = await page.evaluate(() => ({ style: document.documentElement.dataset.themeStyle, accent: document.documentElement.dataset.accent }));
        assert.equal(actual.style, design); assert.equal(actual.accent, color);
      }
      for (const mode of ["light", "dark"]) {
        await choose(".pmp-display-modes label", mode);
        assert.equal(await page.locator("html").getAttribute("data-theme"), mode);
      }
      console.log(`Verified ${design}: six accents, light/dark`);
    }
    await choose(".pmp-theme-choice", "frosted");
    await choose(".pmp-accent-choice", "purple");
    await choose(".pmp-display-modes label", "light");
    await page.reload();
    await appearance.waitFor();
    await page.waitForFunction(() => document.documentElement.dataset.themeStyle === "frosted" && document.documentElement.dataset.accent === "purple");
    assert.ok(await appearance.locator('.pmp-theme-choice input[value="frosted"]').isChecked());
    await appearance.screenshot({ path: "/artifacts/themes-settings.png" });
    const localeResponse = await fetch(`${origin}/api/v1/users/me/profile`, { method: "PATCH", headers, body: JSON.stringify({ locale: "fa" }) });
    assert.ok(localeResponse.ok);
    await page.reload();
    await appearance.waitFor();
    await page.waitForFunction(() => document.documentElement.dir === "rtl");
    assert.equal(await appearance.locator(".pmp-theme-choice").count(), 6);
    await appearance.screenshot({ path: "/artifacts/themes-settings-persian.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await appearance.scrollIntoViewIfNeeded();
    const overflow = await appearance.evaluate(element => element.scrollWidth > element.clientWidth + 1);
    assert.equal(overflow, false, "Appearance selector must fit mobile width");
    await appearance.screenshot({ path: "/artifacts/themes-settings-mobile.png" });
    // A rejected save must restore the previous visible choice.
    await page.route("**/api/v1/users/me/settings", route => route.request().method() === "PATCH" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ title: "Test failure" }) }) : route.continue());
    await appearance.locator('.pmp-theme-choice input[value="minimal"]').locator("..").click();
    await appearance.getByRole("alert").waitFor();
    assert.equal(await page.locator("html").getAttribute("data-theme-style"), "frosted");
    console.log("Verified reload persistence, Persian RTL, mobile fit, and failed-save rollback");
  } finally {
    const response = await fetch(`${origin}/api/v1/users/me/settings`, { method: "PATCH", headers, body: JSON.stringify(restore) });
    const localeRestore = await fetch(`${origin}/api/v1/users/me/profile`, { method: "PATCH", headers, body: JSON.stringify({ locale: session.user.locale ?? null }) });
    await browser.close();
    assert.ok(localeRestore.ok, "Original account language must be restored");
    assert.ok(response.ok, "Original account appearance must be restored");
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
