import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing, docs, search, and login form one public journey", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /engineering that carries weight/i })).toBeVisible();
  await expect(page.getByLabel(/workspace preview/i)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  if (testInfo.project.name !== "desktop") {
    await page.getByLabel("Open navigation").click();
    await page.getByRole("navigation", { name: "Mobile public navigation" }).getByRole("link", { name: "Docs" }).click();
  } else {
    await page.getByRole("navigation", { name: "Public navigation" }).getByRole("link", { name: "Docs" }).click();
  }
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole("heading", { name: "Find the answer. Keep moving." })).toBeVisible();

  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  const search = page.getByLabel("Search titles, guides, categories, and tutorials");
  await expect(search).toBeFocused();
  await search.fill("permissions");
  await page.getByRole("link", { name: /roles and permissions/i }).click();
  await expect(page).toHaveURL(/\/docs\/teams\/roles-and-permissions$/);
  await expect(page.getByRole("heading", { name: "The API is authoritative" })).toBeVisible();

  if (testInfo.project.name !== "desktop") {
    await page.getByLabel("Open navigation").click();
    await page.getByRole("navigation", { name: "Mobile public navigation" }).getByRole("link", { name: "Log in" }).click();
  } else {
    await page.getByRole("link", { name: "Log in" }).first().click();
  }
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("documentation search has a useful zero-results recovery", async ({ page }) => {
  await page.goto("/docs");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.getByLabel("Search titles, guides, categories, and tutorials").fill("zzzz-no-guide");
  await expect(page.getByRole("heading", { name: /no results for/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear search" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByText("Suggested guides")).toBeVisible();
});

test("login enters Internal Docs and the module switcher opens Teams", async ({ page }) => {
  const user = { id:"11111111-1111-4111-8111-111111111111",email:"mock@example.com",username:"mock",first_name:"Mock",last_name:"User",full_name:"Mock User",job_title:"Developer",avatar_url:null,is_active:true,mfa_enabled:false,roles:["Developer"],permissions:["docs.view","docs.comment","docs.edit"],created_at:"2026-08-05T00:00:00Z" };
  await page.addInitScript(() => localStorage.setItem("workspace.last-module", "docs"));
  await page.route("**/api/v1/**", async route => {
    const url = route.request().url();
    if (url.includes("/auth/login")) return route.fulfill({ json: { access_token:"test-access",refresh_token:"test-refresh",token_type:"bearer",expires_in:900,user } });
    if (url.includes("/analytics/personal-dashboard")) return route.fulfill({ json: {
      assigned_tasks_total: 6,
      open_tasks: 2,
      in_progress_tasks: 2,
      completed_tasks: 4,
      blocked_tasks: 0,
      attention_required_tasks: 0,
      unscheduled_open_tasks: 2,
      completion_rate_percent: 66.7,
      upcoming_deadlines: [],
      late_tasks: [],
      velocity_points_completed: 0,
      hours_logged: 0,
    } });
    if (url.includes("/projects?" ) || url.includes("/users?")) return route.fulfill({ json: { items:[],page:1,page_size:200,total_count:0 } });
    if (url.includes("pending-work")) return route.fulfill({ json: { pending_on_me:[] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/login");
  await page.getByLabel("Email or username").fill("mock@example.com");
  await page.getByLabel("Password", { exact: true }).fill("valid-test-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/app\/docs$/);
  await expect(page.getByRole("heading", { name: "Internal Knowledge" })).toBeVisible();
  await page.getByLabel("Workspace modules").getByRole("link", { name: "Teams" }).click();
  await expect(page).toHaveURL(/\/app\/teams$/);
  await expect(page.getByRole("heading", { name: "Good day, Mock" })).toBeVisible();
  const assignedCard = page.locator('a[href="/tasks?view=my"]').filter({ hasText: "Assigned tasks" });
  await expect(assignedCard).toContainText("6");
  await expect(assignedCard).toContainText("2 currently open");
  await expect(page.getByText("Completion rate", { exact: true })).toBeVisible();
  await expect(page.getByText("66.7%", { exact: true })).toBeVisible();
  await expect(page.getByText("My Work Summary", { exact: true })).toBeVisible();
  await expect(page.getByText("My Sprint", { exact: true })).toHaveCount(0);
  const teamsA11y = await new AxeBuilder({ page }).analyze();
  expect(teamsA11y.violations).toEqual([]);
});

for (const theme of ["dark", "light"] as const) {
  test(`public landing and docs meet automated WCAG checks in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((selectedTheme) => localStorage.setItem("pmp.theme", selectedTheme), theme);
    for (const route of ["/", "/docs", "/docs/teams/roles-and-permissions"]) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `${route} (${theme})`).toEqual([]);
    }
  });
}
