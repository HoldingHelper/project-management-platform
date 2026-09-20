import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const SPRINT_ID = "44444444-4444-4444-8444-444444444444";
const DOC_ID = "55555555-5555-4555-8555-555555555555";
const TASK_ID = "66666666-6666-4666-8666-666666666666";
const NOW = "2026-08-24T12:00:00Z";
const RECIPIENT_ID = "88888888-8888-4888-8888-888888888888";
const TEAM_ID = "99999999-9999-4999-8999-999999999999";

const user = {
  id: USER_ID,
  email: "owner@example.com",
  username: "owner",
  first_name: "Project",
  last_name: "Owner",
  full_name: "Project Owner",
  job_title: "Delivery lead",
  avatar_url: null,
  is_active: true,
  mfa_enabled: false,
  roles: ["Administrator"],
  permissions: [
    "projects.view",
    "projects.manage_all",
    "phases.manage_all",
    "tasks.view",
    "tasks.manage_all",
    "docs.view",
    "docs.edit",
  ],
  created_at: NOW,
};

const recipient = {
  ...user,
  id: RECIPIENT_ID,
  email: "support@example.com",
  username: "support",
  first_name: "Support",
  last_name: "Agent",
  full_name: "Support Agent",
  roles: ["Developer"],
};

const sprint = {
  id: SPRINT_ID,
  project_id: PROJECT_ID,
  name: "Sprint 1",
  phase_type: "Development",
  sequence: 1,
  start_date: "2026-08-24",
  end_date: "2026-09-06",
  status: "in-progress",
  progress_percentage: 35,
  lead_assignee_user_id: USER_ID,
  is_sprint: true,
  created_at: NOW,
  updated_at: NOW,
};

const initialProject = {
  id: PROJECT_ID,
  product_id: PRODUCT_ID,
  name: "Sprint migration",
  description: "Move delivery planning to two-week sprints.",
  budget: 12000,
  priority: "P1",
  risk_level: "Medium",
  start_date: "2026-08-24",
  end_date: "2026-10-18",
  estimated_completion_date: "2026-10-18",
  actual_completion_date: null,
  health_status: "on-track",
  status: "in-progress",
  tags: ["level:inter-team", "partition:tech"],
  progress_percentage: 35,
  created_by: "manual",
  last_modified_by: "manual",
  generation_run_id: null,
  ai_prompt_storage_key: null,
  ai_summary_storage_key: null,
  planning_mode: "sprints",
  created_at: NOW,
  updated_at: NOW,
};

const doc = {
  id: DOC_ID,
  space_id: "77777777-7777-4777-8777-777777777777",
  parent_page_id: null,
  title: "Launch runbook",
  slug: "launch-runbook",
  excerpt: "Production launch steps",
  status: "internal",
  visibility: "internal",
  responsible_user_id: USER_ID,
  position: 0,
  updated_at: NOW,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installApi(
  page: Page,
  sessionUser: typeof user = user,
  projectMemberRole = "ProjectManager",
) {
  const state = {
    project: { ...initialProject },
    projectUpdate: null as Record<string, unknown> | null,
    createdTask: null as Record<string, unknown> | null,
    links: [] as Array<Record<string, unknown>>,
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = request.method();

    if (path === "/auth/login" || path === "/auth/refresh") {
      return json(route, { access_token: "test-access", refresh_token: "test-refresh", token_type: "bearer", expires_in: 900, user: sessionUser });
    }
    if (path === "/users") return json(route, { items: [sessionUser, recipient], page: 1, page_size: 200, total_count: 2 });
    if (path === "/teams") return json(route, [{ id: TEAM_ID, department_id: PRODUCT_ID, name: "Production Support", member_count: 4 }]);
    if (path === "/products") {
      return json(route, { items: [{ id: PRODUCT_ID, name: "PMP", owner_user_id: USER_ID, description: "PMP", created_at: NOW, updated_at: NOW }], page: 1, page_size: 200, total_count: 1 });
    }
    if (path === "/projects" && method === "GET") {
      return json(route, { items: [state.project], page: 1, page_size: 200, total_count: 1 });
    }
    if (path === `/projects/${PROJECT_ID}/overview`) {
      return json(route, {
        project: state.project,
        sprints: [sprint],
        phases: [sprint],
        current_sprint: sprint,
        current_phase: sprint,
        members: [{ project_id: PROJECT_ID, user_id: sessionUser.id, role: projectMemberRole }],
        milestones: [],
        task_stats: { total: state.createdTask ? 1 : 0, done: 0, in_progress: 0, blocked: 0, overdue: 0, unassigned: state.createdTask ? 1 : 0 },
        open_blockers: 0,
        upcoming_deadlines: [],
      });
    }
    if (path === `/projects/${PROJECT_ID}` && method === "PUT") {
      state.projectUpdate = request.postDataJSON();
      Object.assign(state.project, state.projectUpdate, { updated_at: NOW });
      return json(route, state.project);
    }
    if (path === `/projects/${PROJECT_ID}/sprints`) return json(route, [sprint]);
    if (path === `/sprints/${SPRINT_ID}/tasks`) {
      return json(route, state.createdTask ? [state.createdTask] : []);
    }
    if (path === `/sprints/${SPRINT_ID}/progress`) {
      return json(route, { percentage: 35, total_weight: 10, completed_weight: 3.5, overdue_task_ids: [], blocks: "" });
    }
    if (path === "/tasks" && method === "GET") {
      const items = url.searchParams.has("parent_task_id") || !state.createdTask ? [] : [state.createdTask];
      return json(route, { items, page: 1, page_size: 200, total_count: items.length });
    }
    if (path === "/tasks" && method === "POST") {
      const payload = request.postDataJSON();
      state.createdTask = {
        id: TASK_ID,
        title: payload.title,
        description: payload.description ?? null,
        phase_id: payload.phase_id,
        parent_task_id: payload.parent_task_id ?? null,
        task_type: payload.task_type,
        priority: payload.priority,
        status: payload.status,
        story_points: payload.story_points ?? null,
        estimated_hours: payload.estimated_hours ?? null,
        reviewer_user_id: payload.reviewer_user_id ?? null,
        github_url: payload.github_url ?? null,
        partition: payload.partition ?? null,
        start_date: payload.start_date ?? null,
        due_date: payload.due_date ?? null,
        assignee_user_ids: payload.assignee_user_ids ?? [],
        is_ticket: payload.is_ticket ?? false,
        ticket_requested_by_user_id: payload.is_ticket ? sessionUser.id : null,
        ticket_recipient_team_ids: payload.ticket_recipient_team_ids ?? [],
        labels: payload.label_names ?? [],
        checklist_items: [],
        board_order: 0,
        created_by: "manual",
        created_at: NOW,
        updated_at: NOW,
      };
      return json(route, state.createdTask, 201);
    }
    if (path === `/tasks/${TASK_ID}` && method === "GET") {
      return json(route, state.createdTask);
    }
    if (path === `/docs/entity-links/project/${PROJECT_ID}`) {
      return json(route, state.links.filter((link) => link.entity_type === "project"));
    }
    if (path === "/docs/pages" || path === "/docs/search") return json(route, [doc]);
    if (path === `/docs/pages/${DOC_ID}/links` && method === "POST") {
      const payload = request.postDataJSON();
      const link = { id: `link-${state.links.length + 1}`, page_id: DOC_ID, title: doc.title, slug: doc.slug, space_id: doc.space_id, excerpt: doc.excerpt, created_at: NOW, ...payload };
      state.links.push(link);
      return json(route, link, 201);
    }
    if (path === "/notifications/unread-count") return json(route, { count: 0 });
    if (path === "/chat/channels") return json(route, []);
    if (path.includes("pending-work")) return json(route, { pending_on_me: [] });
    if (path.startsWith("/analytics/") || path.startsWith("/blockers")) return json(route, []);
    return json(route, []);
  });
  return state;
}

async function login(page: Page, sessionUser: typeof user = user) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(sessionUser.email);
  await page.getByLabel("Password", { exact: true }).fill("valid-test-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/app\/(teams|docs)$/);
}

test("project dates, sprint planning, and searchable Docs links work together", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Desktop and phone cover the adaptive project workspace.");
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  const api = await installApi(page);
  await login(page);

  await page.goto(`/projects/${PROJECT_ID}`);
  await expect(page.getByText("Sprint: Sprint 1")).toBeVisible();
  await expect(page.getByText("In progress", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Edit project" }).click();

  await expect(page.getByLabel("Planned start")).toBeDisabled();
  await expect(page.getByLabel("Planned end")).toBeDisabled();
  await expect(page.getByLabel("Actual end date")).toBeEnabled();
  await page.getByLabel("Project name").fill("Sprint migration updated");
  await page.getByLabel("Actual end date").fill("2026-10-20");
  const projectDocSearch = page.getByLabel("Search documents to connect to project");
  await projectDocSearch.fill("Launch");
  await page.getByRole("option", { name: /Launch runbook/ }).click();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect.poll(() => api.projectUpdate?.name).toBe("Sprint migration updated");
  expect(api.projectUpdate?.start_date).toBe(initialProject.start_date);
  expect(api.projectUpdate?.end_date).toBe(initialProject.end_date);
  expect(api.projectUpdate?.actual_completion_date).toBe("2026-10-20");
  await expect.poll(() => api.links.filter((link) => link.entity_type === "project").length).toBe(1);

  await page.getByRole("tab", { name: "Board" }).click();
  await expect(page.getByRole("button", { name: /Sprint 1/ })).toBeVisible();
  await expect(page.getByText("Sprint progress")).toBeVisible();
  await page.getByRole("button", { name: "Task" }).click();
  await page.getByLabel("Title").fill("Connect release checklist");
  await page.getByText("Send as a ticket").click();
  const recipientSearch = page.getByLabel("Search ticket recipients");
  await recipientSearch.fill("Production");
  await page.getByRole("option", { name: /Production Support/ }).click();
  const taskDocSearch = page.getByLabel("Search documents to connect to task");
  await taskDocSearch.fill("Launch");
  await page.getByRole("option", { name: /Launch runbook/ }).click();
  await page.getByRole("button", { name: "Create task" }).click();
  await expect.poll(() => api.createdTask?.title).toBe("Connect release checklist");
  expect(api.createdTask?.is_ticket).toBe(true);
  expect(api.createdTask?.ticket_recipient_team_ids).toEqual([TEAM_ID]);
  await expect.poll(() => api.links.filter((link) => link.entity_type === "task").length).toBe(1);

  const boardUrl = page.url();
  await page.getByRole("button", { name: "Open task details for Connect release checklist" }).click();
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect release checklist" })).toBeVisible();
  await expect(page).toHaveURL(boardUrl);
  await page.getByRole("button", { name: "Close dialog" }).click();

  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("a user without task-management permissions can create tasks", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Desktop and phone cover the adaptive task controls.");
  const basicUser = {
    ...user,
    email: "guest@example.com",
    username: "guest",
    first_name: "Guest",
    last_name: "Member",
    full_name: "Guest Member",
    roles: ["Guest"],
    permissions: [],
  };
  const api = await installApi(page, basicUser, "Observer");
  await login(page, basicUser);

  await page.goto("/tasks");
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();

  await page.goto(`/projects/${PROJECT_ID}?tab=board`);
  await page.getByRole("button", { name: "Task", exact: true }).click();
  await page.getByLabel("Title").fill("Task created by an observer");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect.poll(() => api.createdTask?.title).toBe("Task created by an observer");

  await page.getByRole("button", { name: "Open task details for Task created by an observer" }).click();
  await expect(page.getByLabel("New subtask title")).toBeVisible();
});
