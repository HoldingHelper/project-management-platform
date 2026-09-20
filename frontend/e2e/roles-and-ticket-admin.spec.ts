import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ROLE_ID = "22222222-2222-4222-8222-222222222222";
const EDITABLE_ROLE_ID = "55555555-5555-4555-8555-555555555555";
const PERMISSION_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-08-24T12:00:00Z";

const admin = {
  id: USER_ID,
  email: "admin@example.com",
  username: "admin",
  first_name: "Workspace",
  last_name: "Admin",
  full_name: "Workspace Admin",
  job_title: "Administrator",
  avatar_url: null,
  is_active: true,
  mfa_enabled: false,
  roles: ["SuperAdmin"],
  permissions: ["system.manage_users", "system.manage_roles"],
  created_at: NOW,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installApi(page: Page) {
  const state = {
    createdRole: null as Record<string, unknown> | null,
    updatedRole: null as Record<string, unknown> | null,
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, "");
    if (path === "/auth/login" || path === "/auth/refresh") {
      return json(route, { access_token: "test-access", refresh_token: "test-refresh", token_type: "bearer", expires_in: 900, user: admin });
    }
    if (path === "/users/me") return json(route, admin);
    if (path === "/users") return json(route, { items: [admin], page: 1, page_size: 200, total_count: 1 });
    if (path === "/roles" && request.method() === "POST") {
      const payload = request.postDataJSON();
      state.createdRole = payload;
      return json(route, { id: ROLE_ID, ...payload }, 201);
    }
    if (path === `/roles/${EDITABLE_ROLE_ID}` && request.method() === "PATCH") {
      const payload = request.postDataJSON();
      state.updatedRole = payload;
      return json(route, {
        id: EDITABLE_ROLE_ID,
        name: "ProjectManager",
        description: "Project manager role",
        ...payload,
      });
    }
    if (path === "/roles") {
      return json(route, [
        { id: ROLE_ID, name: "SuperAdmin", description: "Workspace administrator", permission_codes: ["system.manage_roles"] },
        { id: EDITABLE_ROLE_ID, name: "ProjectManager", description: "Project manager role", permission_codes: ["tasks.view"] },
      ]);
    }
    if (path === "/permissions") {
      return json(route, [
        { id: PERMISSION_ID, code: "tasks.manage_team", description: "Create and manage work for a team" },
        { id: "44444444-4444-4444-8444-444444444444", code: "tasks.view", description: "View tasks" },
      ]);
    }
    if (["/departments", "/teams", "/employees", "/users/invitations", "/chat/channels"].includes(path)) return json(route, []);
    if (path === "/notifications/unread-count") return json(route, { count: 0 });
    if (path.includes("pending-work")) return json(route, { pending_on_me: [] });
    if (path.startsWith("/analytics/") || path.startsWith("/blockers")) return json(route, []);
    return json(route, []);
  });
  return state;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(admin.email);
  await page.getByLabel("Password", { exact: true }).fill("valid-test-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/app\/(teams|docs)$/);
}

test("an administrator creates a database-backed role from searchable permissions", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  const api = await installApi(page);
  await login(page);

  await page.goto("/admin/users");
  await page.getByRole("button", { name: /Roles \(2\)/ }).click();
  await expect(page.getByText("Workspace administrator")).toBeVisible();
  await page.getByRole("button", { name: "New Role" }).click();
  await page.getByLabel("Role name").fill("Support Lead");
  await page.getByLabel("Description").fill("Owns production support tickets");
  await page.getByPlaceholder("Search capabilities…").fill("manage team");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create role" }).click();

  await expect.poll(() => api.createdRole?.name).toBe("Support Lead");
  expect(api.createdRole?.permission_codes).toEqual(["tasks.manage_team"]);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("an administrator edits the permissions assigned to a role", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  const api = await installApi(page);
  await login(page);

  await page.goto("/admin/users");
  await page.getByRole("button", { name: /Roles \(2\)/ }).click();
  await page.getByRole("button", { name: "Edit permissions for ProjectManager" }).click();
  await expect(page.getByRole("dialog", { name: "Edit ProjectManager permissions" })).toBeVisible();
  await page.getByPlaceholder("Search capabilities…").fill("manage team");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save permissions" }).click();

  await expect.poll(() => api.updatedRole?.permission_codes).toEqual(["tasks.view", "tasks.manage_team"]);
  await expect(page.getByText("Role permissions updated")).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
