import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const HOLDING_ID = "20000000-0000-4000-8000-000000000001";
const VENTURE_ID = "20000000-0000-4000-8000-000000000002";
const FUNCTION_ID = "20000000-0000-4000-8000-000000000003";
const PROJECT_NODE_ID = "20000000-0000-4000-8000-000000000004";
const REQUEST_ID = "20000000-0000-4000-8000-000000000005";
const NOW = "2026-09-25T10:00:00Z";

const user = {
  id: USER_ID, email: "owner@example.com", username: "owner", first_name: "Holding",
  last_name: "Owner", full_name: "Holding Owner", job_title: "Group CEO", avatar_url: null,
  is_active: true, mfa_enabled: false, roles: ["SuperAdmin"],
  permissions: ["system.manage_users", "system.manage_roles", "reports.view_executive"], created_at: NOW,
};

const nodes = [
  { id: HOLDING_ID, type: "holding", parent_id: null, path: "holding", name: "Eskandarian Group", slug: "holding", status: "active", confidentiality: "standard", metadata_json: {}, acl_version: 1, source_type: null, source_id: null, created_at: NOW, updated_at: NOW },
  { id: VENTURE_ID, type: "venture", parent_id: HOLDING_ID, path: "holding.v_alpha", name: "Alpha Mobility", slug: "alpha-mobility", status: "active", confidentiality: "standard", metadata_json: { rag: "at-risk" }, acl_version: 1, source_type: "product", source_id: "30000000-0000-4000-8000-000000000001", created_at: NOW, updated_at: NOW },
  { id: FUNCTION_ID, type: "function", parent_id: HOLDING_ID, path: "holding.f_marketing", name: "Group Marketing", slug: "group-marketing", status: "active", confidentiality: "standard", metadata_json: {}, acl_version: 1, source_type: "department", source_id: "30000000-0000-4000-8000-000000000002", created_at: NOW, updated_at: NOW },
  { id: PROJECT_NODE_ID, type: "project", parent_id: VENTURE_ID, path: "holding.v_alpha.p_launch", name: "Market launch", slug: "market-launch", status: "active", confidentiality: "standard", metadata_json: {}, acl_version: 1, source_type: "project", source_id: "30000000-0000-4000-8000-000000000003", created_at: NOW, updated_at: NOW },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installApi(page: Page) {
  let requestStatus = "requested";
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    if (path === "/auth/login" || path === "/auth/refresh") return json(route, { access_token: "access", refresh_token: "refresh", token_type: "bearer", expires_in: 900, user });
    if (path === "/org/nodes") return json(route, nodes);
    if (path === "/org/cockpit") return json(route, {
      holding: nodes[0], active_ventures: 1, at_risk_ventures: 1, total_allocated_percent: 85, orphan_projects: 0,
      ventures: [{ id: VENTURE_ID, slug: "alpha-mobility", name: "Alpha Mobility", status: "active", confidentiality: "standard", project_count: 1, member_count: 8, allocation_percent: 85, rag: "at-risk", top_risk: "Launch partner approval", next_milestone: "Public beta · 2026-11-15" }],
    });
    if (path === `/strategy/visions/${VENTURE_ID}`) return json(route, { id: "40000000-0000-4000-8000-000000000001", node_id: VENTURE_ID, statement: "Make dependable mobility accessible across the region.", horizon: "2029", updated_by: USER_ID, updated_at: NOW });
    if (path.startsWith("/strategy/objectives")) return json(route, [{ id: "40000000-0000-4000-8000-000000000002", node_id: VENTURE_ID, parent_objective_id: null, title: "Prove repeatable market demand", period: "2027-H1", owner_user_id: USER_ID, status: "active", confidence: 0.72, weight: 1, created_at: NOW, updated_at: NOW }]);
    if (path === "/work/requests") return json(route, [{ id: REQUEST_ID, from_node_id: VENTURE_ID, to_node_id: FUNCTION_ID, title: "Launch campaign", need: "Build the first cross-channel market launch.", due_date: "2026-11-01", priority: "P1", status: requestStatus, created_by_user_id: USER_ID, created_task_id: requestStatus === "accepted" ? "50000000-0000-4000-8000-000000000001" : null, created_at: NOW, updated_at: NOW }]);
    if (path === `/work/requests/${REQUEST_ID}/accept`) { requestStatus = "accepted"; return json(route, { id: REQUEST_ID, from_node_id: VENTURE_ID, to_node_id: FUNCTION_ID, title: "Launch campaign", need: "Build the first cross-channel market launch.", due_date: "2026-11-01", priority: "P1", status: requestStatus, created_by_user_id: USER_ID, created_task_id: "50000000-0000-4000-8000-000000000001", created_at: NOW, updated_at: NOW }); }
    if (path.includes("pending-work")) return json(route, { pending_on_me: [], requested_by_me: [] });
    if (path.startsWith("/notifications")) return json(route, []);
    if (path === "/users/invitations") return json(route, []);
    if (path.startsWith("/users")) return json(route, { items: [user], page: 1, page_size: 200, total_count: 1 });
    if (path === "/tasks") return json(route, { items: [], page: 1, page_size: 100, total_count: 0 });
    if (path === "/projects") return json(route, { items: [], page: 1, page_size: 100, total_count: 0 });
    return json(route, []);
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("valid-test-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/h\/holding$/);
}

test("canonical URLs keep page identity stable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installApi(page);
  await login(page);

  await page.goto("/app/teams/tasks");
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole("heading", { name: "Task Browser" })).toBeVisible();
  await page.getByRole("tab", { name: "My tasks" }).click();
  await expect(page).toHaveURL(/\/tasks\?view=my$/);
  await page.getByRole("tab", { name: "Monthly" }).click();
  await expect(page).toHaveURL(/\/tasks\?view=my&layout=monthly$/);

  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/admin\/users$/);
  await page.waitForTimeout(250);
  expect(pageErrors).toEqual([]);
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Departments (0)" }).click();
  await expect(page).toHaveURL(/\/admin\/departments$/);
  await expect(page.getByRole("heading", { name: "Departments", exact: true })).toBeVisible();

  await page.goto("/app/docs");
  await expect(page).toHaveURL(/\/app\/docs$/);
  await expect(page.getByText("Knowledge Workspace", { exact: true })).toBeVisible();
  await expect(page.getByText("Executive Dashboard", { exact: true })).toHaveCount(0);

  await page.goto("/automations");
  await page.getByRole("button", { name: "Execution Audit Logs" }).click();
  await expect(page).toHaveURL(/\/automations\?view=logs$/);

  await page.goto("/v/not-a-visible-venture");
  await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("holding, venture, and function scopes form one responsive operating flow", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installApi(page);
  await login(page);

  await page.goto("/h/holding");
  await expect(page.getByRole("heading", { name: "Eskandarian Group" })).toBeVisible();
  await expect(page.getByText("Alpha Mobility", { exact: true })).toBeVisible();
  await expect(page.getByText("Launch partner approval")).toBeVisible();

  await page.getByRole("link", { name: /Alpha Mobility/ }).click();
  await expect(page.getByRole("heading", { name: "Alpha Mobility" })).toBeVisible();
  await expect(page.getByText("Make dependable mobility accessible across the region.")).toBeVisible();
  await expect(page.getByText("Prove repeatable market demand")).toBeVisible();

  await page.goto("/h/holding/functions/group-marketing");
  await expect(page.getByRole("heading", { name: "Group Marketing" })).toBeVisible();
  await expect(page.getByText("Launch campaign")).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText(/accepted/i)).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
