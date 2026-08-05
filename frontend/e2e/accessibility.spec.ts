import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const theme of ["dark", "light"] as const) {
  test(`login is responsive and accessible in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((selectedTheme) => localStorage.setItem("pmp.theme", selectedTheme), theme);
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    if (theme === "light") await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    else await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await expect(page).toHaveScreenshot(`login-${theme}.png`, { fullPage: true });
  });
}

test("password reveal is keyboard accessible", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("example-password");
  await page.getByRole("button", { name: "Show password" }).focus();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password" })).toBeFocused();
});
