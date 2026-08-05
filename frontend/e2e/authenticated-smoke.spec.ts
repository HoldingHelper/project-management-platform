import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const email = process.env.PMP_E2E_EMAIL;
const password = process.env.PMP_E2E_PASSWORD;

test.describe("authenticated responsive shell", () => {
  test.skip(!email || !password, "Set PMP_E2E_EMAIL and PMP_E2E_PASSWORD to run seeded-role smoke tests.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email or username").fill(email!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("shell navigation, search and primary routes remain usable", async ({ page }, testInfo) => {
    await expect(page.getByRole("main")).toBeVisible();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await expect(page.getByPlaceholder(/search projects/i)).toBeVisible();
    await page.keyboard.press("Escape");

    const isMobile = testInfo.project.name !== "desktop";
    if (isMobile) {
      await expect(page.getByRole("navigation", { name: "Mobile primary navigation" })).toBeVisible();
      await page.getByRole("button", { name: "More" }).click();
      await expect(page.getByRole("dialog", { name: "More navigation" })).toBeVisible();
    } else {
      await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    }

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
