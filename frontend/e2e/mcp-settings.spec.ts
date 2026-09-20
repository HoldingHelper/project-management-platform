import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-08-25T12:00:00Z";
const RAW_TOKEN = `pmp_mcp_${"x".repeat(64)}`;

const user = {
  id: USER_ID,
  email: "agent.user@example.com",
  username: "agent-user",
  first_name: "Agent",
  last_name: "User",
  full_name: "Agent User",
  job_title: "Developer",
  avatar_url: null,
  is_active: true,
  mfa_enabled: false,
  roles: ["Developer"],
  permissions: ["docs.view", "docs.edit", "tasks.view"],
  created_at: NOW,
};

const setup = {
  endpoint_url: "http://test/api/v1/mcp",
  skill_resource_uri: "pmp://agent/SKILL.md",
  skill_markdown: "---\nname: project-management-platform-mcp\n---\n\n# Project Management Platform MCP\n\nRead visible records before changing them.",
  available_permissions: [
    {
      code: "docs.edit",
      description: "Edit visible documentation",
      tool_names: ["pmp_docs_create_page", "pmp_docs_update_page"],
    },
    {
      code: "docs.view",
      description: "View visible documentation",
      tool_names: ["pmp_docs_list_spaces", "pmp_docs_search_or_get"],
    },
    {
      code: "tasks.view",
      description: "View visible tasks",
      tool_names: ["pmp_tasks_list", "pmp_tasks_get"],
    },
  ],
  available_tools: [
    { name: "pmp_user_context", description: "Show connected identity.", inputSchema: { type: "object" } },
    { name: "pmp_docs_list_spaces", description: "List visible spaces.", inputSchema: { type: "object" } },
    { name: "pmp_docs_search_or_get", description: "Search visible pages.", inputSchema: { type: "object" } },
    { name: "pmp_docs_create_page", description: "Create a page.", inputSchema: { type: "object" } },
    { name: "pmp_docs_update_page", description: "Update a visible page.", inputSchema: { type: "object" } },
    { name: "pmp_tasks_list", description: "List visible tasks.", inputSchema: { type: "object" } },
    { name: "pmp_tasks_get", description: "Get a visible task.", inputSchema: { type: "object" } },
  ],
  security_notes: [],
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installApi(page: Page) {
  const state = { created: null as Record<string, unknown> | null };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, "");
    if (path === "/auth/login" || path === "/auth/refresh") {
      return json(route, { access_token: "test-access", refresh_token: "test-refresh", token_type: "bearer", expires_in: 900, user });
    }
    if (path === "/users/me") return json(route, user);
    if (path === "/mcp/setup") return json(route, setup);
    if (path === "/mcp/tokens" && request.method() === "POST") {
      state.created = request.postDataJSON();
      return json(route, {
        id: TOKEN_ID,
        name: state.created?.name,
        token_prefix: RAW_TOKEN.slice(0, 20),
        token: RAW_TOKEN,
        permission_codes: state.created?.permission_codes,
        created_at: NOW,
        expires_at: "2026-11-23T12:00:00Z",
        last_used_at: null,
        revoked_at: null,
        is_active: true,
      }, 201);
    }
    if (path === "/mcp/tokens") return json(route, []);
    if (path === "/notifications/unread-count") return json(route, { count: 0 });
    if (path.includes("pending-work")) return json(route, { pending_on_me: [] });
    if (path.startsWith("/analytics/") || path.startsWith("/blockers")) return json(route, []);
    return json(route, []);
  });
  return state;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("valid-test-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/app\/(teams|docs)$/);
}

test("a user creates a least-privilege MCP connection with discoverable agent instructions", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  const api = await installApi(page);
  await login(page);
  await page.goto("/settings/mcp");

  await expect(page.getByRole("heading", { name: "AI & MCP Connections" })).toBeVisible();
  await expect(page.getByText("Passwords never leave Platform")).toBeVisible();
  await page.getByRole("button", { name: "None" }).click();
  await page.getByPlaceholder("Search permissions or tools…").fill("docs.view");
  await page.getByRole("checkbox").check();
  await page.getByLabel("Connection name").fill("Codex — least privilege");
  await page.getByRole("button", { name: "Generate connection token" }).click();

  await expect.poll(() => api.created?.permission_codes).toEqual(["docs.view"]);
  expect(api.created?.expires_in_days).toBe(90);
  await expect(page.getByText("COPY NOW — SHOWN ONCE")).toBeVisible();
  await expect(page.getByText(RAW_TOKEN, { exact: true })).toBeVisible();
  await expect(page.getByText("Advertised through MCP as pmp://agent/SKILL.md.", { exact: true })).toBeVisible();
  await expect(page.getByText("name: project-management-platform-mcp", { exact: false })).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
