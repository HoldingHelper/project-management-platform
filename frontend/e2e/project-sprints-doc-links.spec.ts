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
    members: [{ project_id: PROJECT_ID, user_id: sessionUser.id, role: projectMemberRole }],
    sprint: { ...sprint, duration_days: 14 },
    sprintUpdates: [] as Array<Record<string, unknown>>,
    uploads: 0,
    failNextUpload: false,
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
    if (path === "/org/cockpit") return json(route, { holding: { slug: "holding", name: "Holding" }, ventures: [], active_ventures: 0, at_risk_ventures: 0, total_allocated_percent: 0, orphan_projects: 0 });
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
        sprints: [state.sprint],
        phases: [state.sprint],
        current_sprint: state.sprint,
        current_phase: state.sprint,
        members: state.members,
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
    if (path === `/products/${PRODUCT_ID}/members`) return json(route, [sessionUser, recipient]);
    if (path === `/projects/${PROJECT_ID}/members`) {
      if (method === "POST") {
        state.members.push({ project_id: PROJECT_ID, ...request.postDataJSON() });
        return route.fulfill({ status: 204 });
      }
      return json(route, state.members);
    }
    if (path === `/projects/${PROJECT_ID}/members/${RECIPIENT_ID}` && method === "DELETE") {
      state.members = state.members.filter((member) => member.user_id !== RECIPIENT_ID);
      return route.fulfill({ status: 204 });
    }
    if (path === `/projects/${PROJECT_ID}/sprints`) return json(route, [state.sprint]);
    if (path === `/sprints/${SPRINT_ID}` && method === "PUT") {
      const payload = request.postDataJSON();
      state.sprintUpdates.push(payload);
      Object.assign(state.sprint, payload);
      const start = new Date(state.sprint.start_date + "T00:00:00Z");
      start.setUTCDate(start.getUTCDate() + state.sprint.duration_days - 1);
      state.sprint.end_date = start.toISOString().slice(0, 10);
      return json(route, state.sprint);
    }
    if (path === "/files" && method === "POST") {
      if (state.failNextUpload) {
        state.failNextUpload = false;
        return json(route, { message: "Upload unavailable" }, 503);
      }
      expect(url.searchParams.get("documentation")).toBe("true");
      expect(request.postDataBuffer()?.toString()).toContain("project-guide.md");
      state.uploads++;
      return json(route, { id: `file-${state.uploads}`, file_name: "project-guide.md", size_bytes: 20 }, 201);
    }
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
    if (path.startsWith(`/docs/pages/${DOC_ID}/links/`) && method === "DELETE") {
      state.links = state.links.filter((link) => link.id !== path.split("/").at(-1));
      return route.fulfill({ status: 204 });
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
  await expect(page).toHaveURL(/\/(?:app\/(?:teams|docs)|h\/holding)$/);
}

test("project attachment archive warns the author about administrator restoration", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The lifecycle behavior is independent of viewport size.");
  const actor = { ...user, locale: "fa", calendar: "gregory", numbering_system: "latn" };
  await installApi(page, actor);
  let archived = false;
  const file = { id: DOC_ID, entity_type: "project", entity_id: PROJECT_ID, file_name: "my-document.pdf", content_type: "application/pdf", size_bytes: 1024, uploaded_by_user_id: USER_ID, version: 1, created_at: NOW };
  await page.route("**/api/v1/files?**", route => json(route, archived ? [] : [file]));
  await page.route(`**/api/v1/files/${DOC_ID}/lifecycle`, route => json(route, {
    page_id: DOC_ID, status: archived ? "archived" : "published", can_edit: false, can_publish: false, can_archive: !archived, can_restore: false,
  }));
  await page.route(`**/api/v1/docs/pages/${DOC_ID}/archive`, route => { archived = true; return json(route, {}); });
  await login(page, actor);
  await page.goto(`/projects/${PROJECT_ID}`);
  await page.getByRole("tab", { name: "پیوست‌ها", exact: true }).click();
  await page.getByRole("button", { name: `بایگانی سند ${file.file_name}` }).click();
  const dialog = page.getByRole("dialog", { name: "سند بایگانی شود؟" });
  await expect(dialog.getByText("اسناد بایگانی‌شده از همه کاربران عادی، از جمله نویسنده، پنهان هستند. فقط مدیر کل می‌تواند آن‌ها را بازیابی کند.")).toBeVisible();
  await dialog.getByRole("button", { name: "بایگانی", exact: true }).click();
  await expect(page.getByTitle(file.file_name)).toHaveCount(0);
});

for (const locale of ["fa", "en"] as const) test(`executive dashboard uses ${locale} for filters and generated insights`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Phone and desktop cover the dashboard.");
  const actor = { ...user, locale, calendar: "gregory", numbering_system: "latn", permissions: [...user.permissions, "analytics.view_org"] };
  await installApi(page, actor);
  const metric = { display_value: "7.3 hrs", rating: "High", benchmark: "Less than one day", value: 7.3, unit: "hours", trend_percentage: 0 };
  await page.route("**/api/v1/analytics/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/executive-summary")) return json(route, {
      dora: { overall_rating: "High", deployment_frequency: { ...metric, display_value: "1.6 / week" }, lead_time_for_changes: metric, mean_time_to_recovery: { ...metric, display_value: "8.5 hrs" }, change_failure_rate: { ...metric, display_value: "0.0%" }, lead_time_breakdown_hours: {} },
      flow: { velocity_total_points: 9, velocity_tasks_completed: 4, flow_efficiency_percentage: 31.7, wip_active_tasks: 0, velocity_by_type: { features_percent: 22.2, tech_debt_percent: 0, defects_percent: 77.8, infra_percent: 0 }, category_distribution: [{ category: "Technical", percentage: 100, points: 9 }] },
      predictability: { predictability_score_percent: 45, on_time_delivery_rate_percent: 100, overdue_tasks_count: 1, cfd_series: [] },
      summary: { headline: "Delivery performance is rated 'High' with 4 completed tasks (9.0 story points) and an 100.0% on-time delivery rate.", velocity_trend: "Flow velocity is steady with 22.2% allocated to new features, 0.0% to technical debt, and 77.8% to quality defect fixes.", investment_mix_summary: "Leading department investment is Technical (100.0%), followed by balanced execution across Platform, Operations, and Marketing streams.", bottlenecks_summary: "Mean Time to Recovery (MTTR) is 8.5 hrs (High rating) with 1 overdue task(s) in flight.", recommendations: ["Maintain Flow Efficiency at 31.7% by capping Active WIP to under 5 tasks."] },
    });
    if (path.endsWith("/project-health")) return json(route, { blocked: [], delayed: [] });
    if (path.endsWith("/velocity")) return json(route, { weeks: [], tasks_done: [] });
    if (path.endsWith("/burndown")) return json(route, { days: [] });
    if (path.endsWith("/completion-trends")) return json(route, { created: [], completed: [] });
    return json(route, []);
  });
  await login(page, actor);
  await page.goto("/dashboards/executive");
  const persian = locale === "fa";
  await expect(page.getByText(persian ? "عملکرد تحویل در سطح زیاد است؛ 4 کار (9 امتیاز) تکمیل شده و نرخ تحویل به‌موقع 100٪ است." : "Delivery performance is rated 'High' with 4 completed tasks (9.0 story points) and an 100.0% on-time delivery rate.")).toBeVisible();
  await expect(page.locator("select").filter({ has: page.locator(`option[value="30"]`) })).toHaveValue("30");
  await expect(page.getByRole("option", { name: persian ? "۳۰ روز گذشته" : "Last 30 days" })).toHaveCount(1);
  await page.getByRole("button", { name: persian ? "عملکرد DORA" : "DORA Performance" }).click();
  await expect(page.getByText(persian ? "دفعات استقرار" : "Deployment Frequency", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: persian ? "جریان و تخصیص" : "Flow & Investment" }).click();
  await expect(page.locator("span").filter({ hasText: persian ? /^فنی$/ : /^Technical$/ })).toBeVisible();
});

test("My work cards and pending items open their corresponding work", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Phone and desktop cover the same navigation.");
  test.setTimeout(120_000);
  await page.clock.setFixedTime(new Date("2026-08-24T12:00:00Z"));
  const actor = { ...user, permissions: [...user.permissions, "reports.view_executive"] };
  await installApi(page, actor);
  const base = { phase_id: SPRINT_ID, parent_task_id: null, task_type: "Feature", priority: "P2", story_points: 1, assignee_user_ids: [USER_ID], labels: [], checklist_items: [], board_order: 0, created_by: "manual", created_at: NOW, updated_at: NOW };
  const rows = [
    { ...base, id: TASK_ID, title: "Late but not blocked", status: "InProgress", due_date: "2026-08-23" },
    { ...base, id: DOC_ID, title: "Blocked but not late", status: "Blocked", due_date: "2026-09-03" },
    { ...base, id: RECIPIENT_ID, title: "Upcoming work", status: "Ready", due_date: "2026-08-27" },
    { ...base, id: TEAM_ID, title: "Completed work", status: "Done", due_date: "2026-08-23" },
    { ...base, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Someone else's blocked work", status: "Blocked", assignee_user_ids: [RECIPIENT_ID], due_date: null },
  ];
  const projectRows = [
    { ...initialProject, id: PROJECT_ID, name: "Active project", status: "in-progress", health_status: "on-track" },
    { ...initialProject, id: DOC_ID, name: "Blocked project", status: "not-started", health_status: "blocked" },
    { ...initialProject, id: TEAM_ID, name: "Delayed project", status: "in-progress", health_status: "delayed" },
    { ...initialProject, id: RECIPIENT_ID, name: "Completed project", status: "completed", health_status: "on-track" },
  ];
  await page.route("**/api/v1/tasks?**", route => json(route, { items: rows, total_count: rows.length, page: 1, page_size: 100 }));
  await page.route("**/api/v1/projects?**", route => json(route, { items: projectRows, total_count: projectRows.length, page: 1, page_size: 200 }));
  await page.route("**/api/v1/portfolio/gantt**", route => json(route, { projects: [], links: [] }));
  await page.route("**/api/v1/analytics/personal-dashboard", route => json(route, { velocity_points_completed: 1, blocked_tasks: 1, late_tasks: [{ task_id: TASK_ID }], upcoming_deadlines: [{ task_id: RECIPIENT_ID }] }));
  await page.route("**/api/v1/analytics/executive-dashboard", route => json(route, { active_projects: 2, completed_projects: 1, delayed_projects: 1, blocked_projects: 1 }));
  await page.route("**/api/v1/blockers", route => json(route, [{ id: SPRINT_ID, blocked_task_id: TASK_ID, status: "InProgress" }]));
  await page.route(`**/api/v1/users/${USER_ID}/pending-work`, route => json(route, { pending_on_me: [
    { kind: "blocker", id: SPRINT_ID, title: "Pending blocker", priority: "P2", detail: "Waiting" },
    { kind: "review_task", id: RECIPIENT_ID, title: "Pending review", priority: "P2", detail: "Review", project_id: PROJECT_ID },
  ], pending_on_others: [] }));
  await login(page, actor);
  await page.goto("/my-work");
  await expect(page.getByRole("link", { name: /Pending blocker/ })).toHaveAttribute("href", `/tasks/${TASK_ID}`);
  await expect(page.getByRole("link", { name: /Pending review/ })).toHaveAttribute("href", `/tasks/${RECIPIENT_ID}`);
  await expect(page.getByRole("link", { name: /Needs me/ })).toHaveAttribute("href", "#pending-on-me");
  for (const [label, expected, absent, view] of [
    ["My late work", "Late but not blocked", "Blocked but not late", "my-overdue"],
    ["Upcoming", "Upcoming work", "Late but not blocked", "my-upcoming"],
    ["My velocity", "Completed work", "Late but not blocked", "my-completed"],
    ["My blocked", "Blocked but not late", "Someone else's blocked work", "my-blocked"],
  ]) {
    await page.goto("/my-work");
    await page.getByRole("link", { name: new RegExp(label) }).click();
    await expect(page).toHaveURL(new RegExp(`view=${view}`));
    await expect(page.getByRole("link", { name: expected, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: absent, exact: true })).toHaveCount(0);
  }
  for (const [label, expected, absent, view] of [
    ["Blocked projects", "Blocked project", "Active project", "blocked"],
    ["Delayed", "Delayed project", "Blocked project", "delayed"],
    ["Completed", "Completed project", "Blocked project", "completed"],
    ["Active projects", "Active project", "Blocked project", "active"],
  ]) {
    await page.goto("/my-work");
    const card = page.getByRole("link", { name: new RegExp(`Open ${label}`) });
    await card.evaluate(node => node.scrollIntoView({ block: "center" }));
    await card.click();
    await expect(page).toHaveURL(new RegExp(`view=${view}`));
    await expect(page.getByRole("link").filter({ hasText: expected })).toBeVisible();
    await expect(page.getByRole("link").filter({ hasText: absent })).toHaveCount(0);
  }
});

test("task navigation restores the source filters through Back and Forward", async ({ page }, testInfo) => {
  const api = await installApi(page);
  api.createdTask = {
    id: TASK_ID, title: "Return to my filtered work", description: "Full task context",
    phase_id: SPRINT_ID, parent_task_id: null, task_type: "Feature", priority: "P2", status: "Ready",
    story_points: 3, estimated_hours: 2, actual_hours: 0, reviewer_user_id: null, github_url: null,
    partition: "tech", start_date: null, due_date: null, assignee_user_ids: [], is_ticket: false,
    ticket_recipient_team_ids: [], labels: [], checklist_items: [], board_order: 0,
    created_by: "manual", created_at: NOW, updated_at: NOW,
  };
  await login(page);
  await page.goto("/tasks");
  if (testInfo.project.name === "phone") await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByPlaceholder("Search title…").fill("Return");
  if (testInfo.project.name === "phone") await page.getByRole("button", { name: "Close filters" }).last().click();
  await page.getByRole("link", { name: "Return to my filtered work", exact: true }).first().click();
  if (testInfo.project.name === "phone") {
    await expect(page).toHaveURL(new RegExp(`/tasks/${TASK_ID}$`));
    await page.getByRole("button", { name: "Back", exact: true }).click();
  } else {
    await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`task=${TASK_ID}`));
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "Task details" })).toHaveCount(0);
    await page.goForward();
    await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible();
    await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  }
  await expect(page.getByPlaceholder("Search title…")).toHaveValue("Return");
  await expect(page).toHaveURL(/\/tasks$/);
});

test("Task details refreshes published documents when reopened", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Exercises the desktop task details dialog cache.");
  const api = await installApi(page);
  api.createdTask = {
    id: TASK_ID, title: "Document lifecycle task", description: "Publication check", phase_id: SPRINT_ID,
    parent_task_id: null, task_type: "Feature", priority: "P2", status: "Ready",
    assignee_user_ids: [], labels: [], checklist_items: [], board_order: 0,
    created_by: "manual", created_at: NOW, updated_at: NOW,
  };
  let status = "draft";
  await page.route("**/api/v1/files?**", route => json(route, [{
    id: DOC_ID, entity_type: "task", entity_id: TASK_ID, file_name: "voice_20261101_135707.ogg",
    content_type: "audio/ogg", size_bytes: 20480, uploaded_by_user_id: USER_ID, version: 1, created_at: NOW,
  }]));
  await page.route(`**/api/v1/files/${DOC_ID}/lifecycle`, route => json(route, {
    page_id: DOC_ID, status, can_edit: status === "draft", can_publish: status === "draft", can_archive: true, can_restore: false,
  }));
  await login(page);
  await page.goto("/tasks");
  await page.getByRole("link", { name: "Document lifecycle task", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Task details", exact: true });
  await expect(dialog.getByText("Draft / On Publish", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  // Publishing in another tab can happen without a websocket event reaching this tab.
  status = "published";
  await page.getByRole("link", { name: "Document lifecycle task", exact: true }).first().click();
  await expect(dialog.getByText("Published · Read-only", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Publish document", exact: true })).toHaveCount(0);

  // A later archive in Docs must also refresh when the browser tab becomes visible.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    window.dispatchEvent(new Event("visibilitychange"));
  });
  status = "archived";
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(dialog.getByText("Archived · Read-only", { exact: true })).toBeVisible();
});

test("Persian uses Jalali dates and saves selected days as ISO", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Phone and desktop cover the shared date control.");
  const persianUser = { ...user, locale: "fa", calendar: "gregory", numbering_system: "latn" };
  const api = await installApi(page, persianUser);
  await login(page, persianUser);
  await page.goto(`/projects/${PROJECT_ID}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await page.getByRole("button", { name: "ویرایش پروژه", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "ویرایش پروژه", exact: true });
  const plannedStart = modal.getByLabel("شروع برنامه‌ریزی‌شده", { exact: true });
  await plannedStart.click();
  const projectCalendar = modal.getByRole("group", { name: "تقویم جلالی", exact: true });
  const monthSelector = projectCalendar.getByLabel("ماه شمسی");
  expect((await monthSelector.boundingBox())!.width).toBeGreaterThan(85);
  await expect(monthSelector.locator("option:checked")).not.toHaveText("");
  await projectCalendar.getByLabel("سال شمسی").fill("1405");
  await projectCalendar.getByLabel("ماه شمسی").selectOption("1");
  await projectCalendar.getByRole("button", { name: "2 فروردین 1405", exact: true }).click();
  await expect(plannedStart).toContainText("1405/01/02");
  const start = modal.getByLabel("تاریخ شروع", { exact: true });
  await expect(start).toContainText("1405");
  await start.click();
  const calendar = modal.getByRole("group", { name: "تقویم جلالی", exact: true });
  await calendar.getByLabel("سال شمسی").fill("1405");
  await calendar.getByLabel("ماه شمسی").selectOption("1");
  await calendar.getByRole("button", { name: "1 فروردین 1405", exact: true }).click();
  await expect(start).toContainText("1405/01/01");
  await modal.getByRole("button", { name: "ذخیره تغییرات", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(api.project.start_date).toBe("2026-03-22");
  expect(api.project.end_date).toBe("2026-04-04");
  expect(api.sprint.start_date).toBe("2026-03-21");
  expect(api.sprint.end_date).toBe("2026-04-03");
  await page.reload();
  await page.getByRole("button", { name: "ویرایش پروژه", exact: true }).click();
  await expect(modal.getByLabel("شروع برنامه‌ریزی‌شده", { exact: true })).toContainText("1405/01/02");
  await expect(modal.getByLabel("تاریخ شروع", { exact: true })).toContainText("1405/01/01");
  await modal.getByLabel("تاریخ شروع", { exact: true }).click();
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(accessibility.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("jalali-calendar.png"), fullPage: true });
  await modal.getByRole("group", { name: "تقویم جلالی", exact: true }).getByLabel("ماه شمسی").press("Escape");
  await expect(modal.getByRole("group", { name: "تقویم جلالی", exact: true })).toHaveCount(0);
  await expect(modal.getByLabel("تاریخ شروع", { exact: true })).toBeFocused();
});

for (const locale of ["fa", "en"] as const) test(`project labels and dates follow ${locale} locale`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Phone and desktop cover the project workspace.");
  test.setTimeout(60_000);
  const actor = { ...user, locale, calendar: "gregory", numbering_system: "latn" };
  const api = await installApi(page, actor);
  api.project.tags = ["level:inter-team", "partition:design"];
  api.members[0].role = "UIUX";
  api.createdTask = {
    id: TASK_ID, title: "Design review", description: null, phase_id: SPRINT_ID,
    parent_task_id: null, task_type: "Feature", partition: "design", priority: "P2", status: "Ready",
    start_date: "2026-08-24", due_date: "2026-09-06", assignee_user_ids: [], labels: [], checklist_items: [],
    board_order: 0, created_by: "manual", created_at: NOW, updated_at: NOW,
  };
  await login(page, actor);
  await page.goto(`/projects/${PROJECT_ID}`);
  const persian = locale === "fa";
  await expect(page.getByRole("heading", { name: "Sprint migration" })).toBeVisible();
  await expect(page.getByText(persian ? "2 شهریور 1405" : "Aug 24, 2026", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(persian ? "بدون مسئول" : "Unassigned", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(persian ? "طراحی" : "design", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: persian ? "پیوست‌ها" : "Attachments", exact: true }).click();
  await expect(page.getByRole("heading", { name: persian ? "پیوست‌ها و مستندات پروژه" : "Project Attachments & Documents" })).toBeVisible();
  await expect(page.getByRole("button", { name: persian ? "بارگذاری فایل" : "Upload File" })).toBeVisible();
  await page.getByRole("tab", { name: persian ? "تیم" : "Team", exact: true }).click();
  await expect(page.getByText(persian ? "طراحی رابط و تجربه کاربری" : "UIUX", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: persian ? "برد" : "Board", exact: true }).click();
  await expect(page.getByRole("button", { name: /Design review/ }).first()).toBeVisible();
  await expect(page.getByText(persian ? "2 شهریور 1405" : "Aug 24, 2026", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("Persian project team count stays clear of member avatars", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Phone and desktop cover the team card layout.");
  const persianUser = { ...user, locale: "fa", calendar: "gregory", numbering_system: "latn" };
  const api = await installApi(page, persianUser);
  api.members.push({ project_id: PROJECT_ID, user_id: RECIPIENT_ID, role: "Developer" });
  await login(page, persianUser);
  await page.goto(`/projects/${PROJECT_ID}`);
  const avatars = page.locator('[aria-label="اعضای پروژه"]');
  const count = avatars.locator("+ span");
  await expect(avatars.locator(":scope > span")).toHaveCount(2);
  await expect(count).toContainText("2 عضو");
  const countBox = await count.boundingBox();
  const avatarBoxes = await avatars.locator(":scope > span").all();
  expect(countBox).not.toBeNull();
  const firstAvatar = await avatarBoxes[0].boundingBox();
  const secondAvatar = await avatarBoxes[1].boundingBox();
  expect(firstAvatar!.x + firstAvatar!.width).toBeLessThanOrEqual(secondAvatar!.x);
  for (const avatar of avatarBoxes) {
    const box = await avatar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width <= countBox!.x || countBox!.x + countBox!.width <= box!.x || box!.y + box!.height <= countBox!.y || countBox!.y + countBox!.height <= box!.y).toBeTruthy();
  }
  await avatars.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("persian-project-team.png") });
});

test("project document controls fit in the Persian edit dialog", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Phone and desktop cover narrow and wide layouts.");
  const persianUser = { ...user, locale: "fa", calendar: "gregory", numbering_system: "latn" };
  await installApi(page, persianUser);
  const fileName = "ecommerce-product-catalog-edited.md";
  await page.route("**/api/v1/files?**", route => json(route, [{
    id: DOC_ID, entity_type: "project", entity_id: PROJECT_ID, file_name: fileName,
    content_type: "text/markdown", size_bytes: 19353, uploaded_by_user_id: USER_ID, version: 1, created_at: NOW,
  }]));
  await page.route(`**/api/v1/files/${DOC_ID}/lifecycle`, route => json(route, {
    page_id: DOC_ID, status: "draft", can_edit: true, can_publish: true, can_archive: true, can_restore: false,
  }));
  await login(page, persianUser);
  await page.goto(`/projects/${PROJECT_ID}`);
  await page.getByRole("button", { name: "ویرایش پروژه", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "ویرایش پروژه", exact: true });
  const filename = modal.getByTitle(fileName);
  const download = modal.getByRole("button", { name: `Download ${fileName}` });
  const publish = modal.getByRole("button", { name: "انتشار سند", exact: true });
  const archive = modal.getByRole("button", { name: `بایگانی سند ${fileName}` });
  await expect(filename).toBeVisible();
  await expect(download).toBeVisible();
  await expect(publish).toBeVisible();
  await expect(archive).toBeVisible();
  const boxes = await Promise.all([filename, download, publish, archive].map(item => item.boundingBox()));
  expect(boxes.every(Boolean)).toBeTruthy();
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!;
    const b = boxes[j]!;
    expect(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1).toBeTruthy();
  }
  expect(await modal.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
});

test("Persian monthly planning puts Nowruz tasks in Farvardin", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The month grouping uses shared calendar logic.");
  await page.clock.setFixedTime(new Date("2026-03-22T12:00:00Z"));
  const persianUser = { ...user, locale: "fa", calendar: "gregory", numbering_system: "latn" };
  const api = await installApi(page, persianUser);
  api.createdTask = {
    id: TASK_ID, title: "Nowruz delivery", description: "Jalali grouping", phase_id: SPRINT_ID,
    parent_task_id: null, task_type: "Feature", priority: "P2", status: "Ready", due_date: "2026-03-21",
    assignee_user_ids: [], labels: [], checklist_items: [], board_order: 0,
    created_by: "manual", created_at: NOW, updated_at: NOW,
  };
  await login(page, persianUser);
  await page.goto("/tasks?layout=monthly");
  const month = page.getByText("فروردین 1405", { exact: true }).locator("..").locator("..");
  await expect(month.getByRole("link", { name: "Nowruz delivery", exact: true })).toBeVisible();
});

test("portfolio timeline keeps panned bars outside project labels and zooms long schedules", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Phone and desktop exercise timeline sizing.");
  await page.clock.setFixedTime(new Date("2026-03-22T12:00:00Z"));
  const faUser = { ...user, locale: "fa", calendar: "persian" };
  await installApi(page, faUser);
  await page.route("**/api/v1/portfolio/gantt*", route => json(route, {
    projects: [{ ...initialProject, name: "Timeline project", start_date: "2026-03-15", end_date: "2026-04-05", current_sprint: "Sprint 1", milestones: [] }], links: [],
  }));
  await login(page, faUser);
  await page.goto("/portfolio");
  const chart = page.locator(".pmp-chart-time-axis").first();
  const project = chart.getByRole("link", { name: "Timeline project", exact: true }).first();
  await expect(project).toBeVisible();
  await expect(chart.locator('[data-project-label] [data-status]').first()).toHaveAttribute("data-status", "in-progress");
  const month = await chart.getByText("فروردین 1405", { exact: true }).boundingBox();
  const grid = await chart.locator("[data-timeline-grid]").boundingBox();
  // The range starts on March 5; Farvardin begins March 21, sixteen days later.
  expect(Math.abs(month!.x - grid!.x - grid!.width * 16 / 46)).toBeLessThan(2);
  await page.getByRole("button", { name: "نمایش بازه بعد", exact: true }).first().click();
  await chart.locator("[data-timeline-grid]").evaluate(node => node.scrollIntoView({ block: "center" }));
  const covered = await project.evaluate(link => {
    const label = link.parentElement!.parentElement!;
    const rect = label.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.right - 10, rect.top + rect.height / 2);
    return !!hit?.closest('[title*="click to open"]');
  });
  expect(covered).toBe(false);
  const timelineBar = chart.locator(`[data-timeline-bar="${PROJECT_ID}"]`);
  const beforePan = await timelineBar.evaluate(node => (node as HTMLElement).style.left);
  const panGrid = (await chart.locator("[data-timeline-grid]").boundingBox())!;
  await page.mouse.move(panGrid.x + 80, panGrid.y + panGrid.height - 3);
  await page.mouse.down();
  await page.mouse.move(panGrid.x + 120, panGrid.y + panGrid.height - 3, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => timelineBar.evaluate(node => (node as HTMLElement).style.left)).not.toBe(beforePan);
  await page.screenshot({ path: testInfo.outputPath("panned-timeline.png"), fullPage: true });
  await project.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_ID}$`));
  await page.route("**/api/v1/portfolio/gantt*", route => json(route, {
    projects: [{ ...initialProject, name: "Long schedule", start_date: "2023-03-15", end_date: "2026-04-05", milestones: [] }], links: [],
  }));
  await page.goto("/portfolio");
  const bar = chart.locator('[title^="Long schedule ·"]').first();
  const before = (await bar.boundingBox())!.width;
  await page.getByRole("button", { name: "بزرگ‌نمایی", exact: true }).first().click();
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeGreaterThan(before);
  const labels = chart.locator("[data-project-label]");
  const labelBefore = (await labels.boundingBox())!.x;
  await chart.evaluate(node => { node.scrollLeft = 150; });
  expect(Math.abs((await labels.boundingBox())!.x - labelBefore)).toBeLessThan(1);
  const accessibility = await new AxeBuilder({ page }).include(".pmp-chart-time-axis").analyze();
  expect(accessibility.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("portfolio-timeline.png"), fullPage: true });
});

test("timeline dates are inclusive, dependencies reach their targets and focus charts have unique markers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Checks shared date geometry and focused chart instances.");
  await page.clock.setFixedTime(new Date("2026-03-22T12:00:00Z"));
  await installApi(page, { ...user, roles: ["CLevel"] });
  await page.route("**/api/v1/portfolio/gantt*", route => json(route, {
    projects: [
      { ...initialProject, name: "One day", status: "completed", health_status: "delayed", start_date: "2026-03-21", end_date: "2026-03-21", milestones: [] },
      { ...initialProject, id: DOC_ID, name: "Two days", status: "not-started", health_status: "delayed", start_date: "2026-03-23", end_date: "2026-03-24", milestones: [] },
    ],
    links: [{ id: "test-dependency", predecessor_project_id: PROJECT_ID, successor_project_id: DOC_ID, dependency_type: "FinishToStart", lag_days: 0 }],
  }));
  await login(page);
  await page.goto("/timeline?level=inter-team");
  const chart = page.locator(".pmp-chart-time-axis").first();
  const oneDay = chart.locator(`[data-timeline-bar="${PROJECT_ID}"]`);
  const twoDays = chart.locator(`[data-timeline-bar="${DOC_ID}"]`);
  await expect(oneDay).toBeVisible();
  const widths = await Promise.all([oneDay.boundingBox(), twoDays.boundingBox()]);
  expect(Math.abs(widths[1]!.width / widths[0]!.width - 2)).toBeLessThan(.05);
  const labels = chart.locator("[data-project-label] [data-status]");
  await expect(labels.nth(0)).toHaveAttribute("data-status", "completed");
  await expect(labels.nth(1)).toHaveAttribute("data-status", "not-started");
  await expect(chart.getByTitle("Drag project start", { exact: true })).toHaveCount(0);
  const arrow = await chart.locator("path[marker-end]").getAttribute("d");
  const arrowEndX = Number(arrow!.trim().split(/[ ,]+/).at(-2));
  const targetLeft = await twoDays.evaluate(node => parseFloat((node as HTMLElement).style.left));
  expect(Math.abs(arrowEndX - (targetLeft - 4))).toBeLessThan(.1);
  await page.getByRole("button", { name: /^Focus .* chart$/ }).click();
  const markerIds = await page.locator("marker").evaluateAll(nodes => nodes.map(node => node.id));
  expect(markerIds).toHaveLength(2);
  expect(new Set(markerIds).size).toBe(2);
  await page.getByRole("button", { name: "Exit chart focus", exact: true }).click();
  await oneDay.focus();
  await oneDay.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_ID}$`));
});

test("project planned end follows start and sprint durations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Phone and desktop cover the edit form.");
  const api = await installApi(page);
  await login(page);
  await page.goto(`/projects/${PROJECT_ID}`);
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Edit project", exact: true });
  await expect(modal.getByLabel("Planned end")).toHaveAttribute("readonly", "");
  await expect(modal.getByLabel("Planned end")).toHaveValue(initialProject.end_date);
  await modal.getByLabel("Planned start").fill("2026-09-10");
  await expect(modal.getByLabel("Planned end")).toHaveValue("2026-09-23");
  await modal.getByRole("button", { name: "Save changes" }).click();
  await expect(modal).toHaveCount(0);
  expect(api.project.start_date).toBe("2026-09-10");
  expect(api.project.end_date).toBe("2026-09-23");
  expect(api.sprint.start_date).toBe(sprint.start_date);
  expect(api.sprint.end_date).toBe(sprint.end_date);
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await expect(modal.getByLabel("Planned start")).toHaveValue("2026-09-10");
  await expect(modal.getByLabel("Planned end")).toHaveValue("2026-09-23");
  await modal.getByLabel("Sprint duration").selectOption("7");
  await expect(modal.getByLabel("Planned end")).toHaveValue("2026-09-16");
  await modal.getByRole("button", { name: "Save changes" }).click();
  await expect(modal).toHaveCount(0);
  expect(api.project.end_date).toBe("2026-09-16");
  expect(api.sprint.duration_days).toBe(7);
});

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

  await expect(page.getByLabel("Planned start")).toBeEnabled();
  await expect(page.getByLabel("Planned end")).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Actual end date")).toBeEnabled();
  await page.getByLabel("Planned start").fill("2026-09-10");
  await expect(page.getByLabel("Planned end")).toHaveValue("2026-09-23");
  await page.getByLabel("Project name").fill("Sprint migration updated");
  await page.getByLabel("Actual end date").fill("2026-10-20");
  const projectDocSearch = page.getByLabel("Search documents to connect to project");
  await projectDocSearch.fill("Launch");
  await page.getByRole("option", { name: /Launch runbook/ }).click();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect.poll(() => api.projectUpdate?.name).toBe("Sprint migration updated");
  expect(api.projectUpdate?.start_date).toBe("2026-09-10");
  expect(api.projectUpdate?.end_date).toBe("2026-09-23");
  expect(api.projectUpdate?.actual_completion_date).toBe("2026-10-20");
  await expect.poll(() => api.links.filter((link) => link.entity_type === "project").length).toBe(1);
  await page.getByRole("button", { name: "Edit project" }).click();
  await expect(page.getByLabel("Planned start")).toHaveValue("2026-09-10");
  await expect(page.getByLabel("Planned end")).toHaveValue("2026-09-23");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

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
  await expect(page).toHaveURL(`${boardUrl}&task=${TASK_ID}`);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page).toHaveURL(boardUrl);

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


test("Edit project saves members, sprint edits and additional documentation", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const api = await installApi(page);
  await login(page);
  await page.goto(`/projects/${PROJECT_ID}`);
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  let modal = page.getByRole("dialog", { name: "Edit project", exact: true });
  await expect(modal.getByRole("button", { name: /Remove member: Project Owner/ })).toHaveCount(0);
  await modal.getByLabel("User", { exact: true }).selectOption(RECIPIENT_ID);
  await modal.getByLabel("Project role", { exact: true }).selectOption("QA");
  await modal.getByRole("button", { name: "Add member", exact: true }).click();
  await modal.getByLabel("Sprint name", { exact: true }).fill("Release sprint");
  await modal.getByLabel("Start date", { exact: true }).fill("2026-09-01");
  await modal.getByLabel("Sprint duration", { exact: true }).selectOption("7");
  await expect(modal.getByLabel("Calculated end date", { exact: true })).toHaveValue("2026-09-07");
  await modal.getByLabel("Search documents to connect to project").fill("Launch");
  await modal.getByRole("option", { name: /Launch runbook/ }).click();
  await modal.locator('input[type="file"]').setInputFiles({ name: "project-guide.md", mimeType: "text/markdown", buffer: Buffer.from("# Project guide") });
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("edit-project.png"), fullPage: true });
  await modal.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(api.members).toContainEqual({ project_id: PROJECT_ID, user_id: RECIPIENT_ID, role: "QA" });
  expect(api.sprint.name).toBe("Release sprint");
  expect(api.sprint.start_date).toBe("2026-09-01");
  expect(api.sprint.end_date).toBe("2026-09-07");
  expect(api.uploads).toBe(1);
  expect(api.links).toHaveLength(1);
  expect(api.project.start_date).toBe(initialProject.start_date);
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Edit project", exact: true });
  await expect(modal.getByLabel("Sprint name", { exact: true })).toHaveValue("Release sprint");
  await expect(modal.getByRole("button", { name: /Launch runbook/ })).toBeVisible();
  const removeMember = modal.getByRole("button", { name: "Remove member: Support Agent", exact: true });
  await removeMember.evaluate(node => node.scrollIntoView({ block: "center" }));
  await removeMember.click();
  await modal.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(api.members.map((member) => member.user_id)).toEqual([USER_ID]);
  expect(api.links).toHaveLength(1);
  expect(api.uploads).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("Edit project cancels drafts and retries a failed upload without duplicating changes", async ({ page }) => {
  const api = await installApi(page);
  await login(page);
  await page.goto(`/projects/${PROJECT_ID}`);
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  let modal = page.getByRole("dialog", { name: "Edit project", exact: true });
  await modal.getByLabel("User", { exact: true }).selectOption(RECIPIENT_ID);
  await modal.getByRole("button", { name: "Add member", exact: true }).click();
  await modal.getByLabel("Sprint name", { exact: true }).fill("Discard this draft");
  await modal.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(api.members).toHaveLength(1);
  expect(api.sprintUpdates).toHaveLength(0);
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Edit project", exact: true });
  await expect(modal.getByLabel("Sprint name", { exact: true })).toHaveValue("Sprint 1");
  await expect(modal.getByRole("button", { name: "Remove member: Support Agent", exact: true })).toHaveCount(0);
  await modal.getByLabel("User", { exact: true }).selectOption(RECIPIENT_ID);
  await modal.getByRole("button", { name: "Add member", exact: true }).click();
  await modal.getByLabel("Sprint name", { exact: true }).fill("Retry sprint");
  await modal.getByLabel("Search documents to connect to project").fill("Launch");
  await modal.getByRole("option", { name: /Launch runbook/ }).click();
  await modal.locator('input[type="file"]').setInputFiles({ name: "project-guide.md", mimeType: "text/markdown", buffer: Buffer.from("# Project guide") });
  api.failNextUpload = true;
  await modal.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Project saved, but some documents could not be uploaded. Retry Save changes to upload the remaining files.", { exact: true })).toBeVisible();
  await expect(modal.getByText("project-guide.md", { exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(api.members).toHaveLength(2);
  expect(api.links).toHaveLength(1);
  expect(api.uploads).toBe(1);
  expect(api.sprintUpdates).toHaveLength(1);
});

for (const entityType of ["project", "task"] as const) {
  test(`${entityType} History & Changes shows real edits with old and new values`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "tablet", "Phone and desktop cover history layout.");
    const api = await installApi(page);
    api.createdTask = {
      id: TASK_ID, title: "Audited task", description: "History details", phase_id: SPRINT_ID,
      parent_task_id: null, task_type: "Feature", priority: "P2", status: "Ready",
      assignee_user_ids: [], labels: [], checklist_items: [], board_order: 0,
      created_by: "manual", created_at: NOW, updated_at: NOW,
    };
    const id = entityType === "project" ? PROJECT_ID : TASK_ID;
    await page.route(`**/api/v1/${entityType}s/${id}/history*`, (route) => json(route, [{
      id: "audit-update", entity_type: entityType === "project" ? "projects.Project" : "projects.TaskItem",
      entity_id: id, action_type: "Update", user_id: USER_ID, user_name: "Project Owner",
      changes_json: JSON.stringify({ priority: { old: "P2", new: "P1" }, description: { old: "Previous brief", new: "Updated brief" } }),
      occurred_at: "2026-08-25T12:30:00Z",
    }, {
      id: "audit-create", entity_type: entityType === "project" ? "projects.Project" : "projects.TaskItem",
      entity_id: id, action_type: "Create", user_id: USER_ID, user_name: "Project Owner",
      changes_json: "{}", occurred_at: NOW,
    }]));
    await login(page);
    await page.goto(`/${entityType}s/${id}`);
    await page.getByRole(entityType === "project" ? "tab" : "button", { name: "History & Changes", exact: true }).click();
    const history = page.getByRole("region", { name: "History & Changes", exact: true });
    await expect(history.getByText("Previous brief", { exact: true })).toBeVisible();
    await expect(history.getByText("Updated brief", { exact: true })).toBeVisible();
    await expect(history.getByText("P2", { exact: true })).toBeVisible();
    await expect(history.getByText("P1", { exact: true })).toBeVisible();
    await expect(history.getByText("Project Owner", { exact: true }).first()).toBeVisible();
    await expect(history.getByText("Created", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const accessibility = await new AxeBuilder({ page }).include('[aria-label="History & Changes"]').analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("history.png"), fullPage: true });
  });
}

test("super administrator can restore a project from the categorized archive", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Desktop and phone cover the archive layout.");
  const admin = { ...user, roles: ["SuperAdmin"], locale: "fa", calendar: "gregory", numbering_system: "latn" };
  await installApi(page, admin);
  let archived = true;
  await page.route("**/api/v1/projects/archive/items", route => json(route, {
    products: [], projects: archived ? [{ id: PROJECT_ID, name: "Archived project" }] : [],
    tasks: [], documents: [{ id: DOC_ID, name: "Archived document", space_id: "77777777-7777-4777-8777-777777777777" }], organization: [],
  }));
  await page.route(`**/api/v1/projects/archive/projects/${PROJECT_ID}/restore`, route => { archived = false; return json(route, {}); });
  await login(page, admin);
  await page.goto("/admin/archive");
  const projects = page.getByRole("heading", { name: /پروژه‌ها/ }).locator("..");
  await expect(projects.getByRole("link", { name: "Archived project" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Archived document" })).toBeVisible();
  await projects.getByRole("button", { name: "بازیابی", exact: true }).click();
  await expect(projects.getByText("مورد بایگانی‌شده‌ای وجود ندارد.")).toBeVisible();
});

test("project and task actions offer archive instead of delete", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Action labels are independent of viewport size.");
  const api = await installApi(page);
  api.createdTask = { id: TASK_ID, title: "Retained task", description: "", phase_id: SPRINT_ID, parent_task_id: null, task_type: "Feature", priority: "P2", status: "Ready", assignee_user_ids: [], labels: [], checklist_items: [], board_order: 0, created_by: "manual", created_at: NOW, updated_at: NOW };
  await login(page);
  await page.goto(`/projects/${PROJECT_ID}`);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  await page.goto("/tasks");
  await page.getByRole("link", { name: "Retained task", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Task details", exact: true });
  await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
});

test("file owner can enable and revoke download and Telegram sharing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The permission control is shared across viewports.");
  await installApi(page);
  let enabled = false;
  const file = { id: DOC_ID, entity_type: "project", entity_id: PROJECT_ID, file_name: "sharing-test.pdf", content_type: "application/pdf", size_bytes: 100, uploaded_by_user_id: USER_ID, version: 1, created_at: NOW };
  await page.route("**/api/v1/files?**", route => json(route, [{ ...file, download_share_enabled: enabled }]));
  await page.route(`**/api/v1/files/${DOC_ID}/lifecycle`, route => json(route, { page_id: DOC_ID, status: "published", can_edit: false, can_publish: false, can_archive: true, can_restore: false }));
  await page.route(`**/api/v1/files/${DOC_ID}/sharing`, route => {
    if (route.request().method() === "PUT") enabled = route.request().postDataJSON().enabled;
    return json(route, { enabled, can_manage: true });
  });
  await login(page);
  await page.goto(`/projects/${PROJECT_ID}`);
  await page.getByRole("tab", { name: "Attachments", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: `Allow download and Telegram sharing for ${file.file_name}` });
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeDisabled();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeEnabled();
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeDisabled();
});

for (const theme of ["light", "dark"] as const) test(`archived products projects and tasks are muted in ${theme} theme`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Desktop and phone cover archived list layouts.");
  const admin = { ...user, roles: ["SuperAdmin"] };
  await installApi(page, admin);
  await page.addInitScript((value) => {
    document.documentElement.dataset.theme = value;
    const observer = new MutationObserver(() => { if (document.documentElement.dataset.theme !== value) document.documentElement.dataset.theme = value; });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }, theme);
  const product = { id: PRODUCT_ID, name: "Active product", owner_user_id: USER_ID, status: "Active", environment: "Development", priority: "P2", technology_stack: [], description: null, created_at: NOW, updated_at: NOW };
  const products = [product, { ...product, id: DOC_ID, name: "Archived product", status: "Archived" }];
  const projects = [{ ...initialProject, name: "Active project" }, { ...initialProject, id: DOC_ID, name: "Archived project", status: "archived" }];
  const base = { phase_id: SPRINT_ID, parent_task_id: null, task_type: "Feature", priority: "P2", assignee_user_ids: [], labels: [], checklist_items: [], board_order: 0, created_by: "manual", created_at: NOW, updated_at: NOW };
  const tasks = [{ ...base, id: TASK_ID, title: "Active task", status: "Ready" }, { ...base, id: RECIPIENT_ID, title: "Archived task", status: "Archived" }];
  await page.route("**/api/v1/products?**", route => json(route, { items: products, page: 1, page_size: 200, total_count: 2 }));
  await page.route("**/api/v1/projects?**", route => json(route, { items: projects, page: 1, page_size: 200, total_count: 2 }));
  await page.route("**/api/v1/portfolio/gantt**", route => json(route, { projects: [], links: [] }));
  await page.route("**/api/v1/tasks?**", route => json(route, { items: tasks, page: 1, page_size: 100, total_count: 2 }));
  await page.route("**/api/v1/projects/archive/items", route => json(route, { products: [{ id: DOC_ID, name: "Archived product" }], projects: [{ id: DOC_ID, name: "Archived project" }], tasks: [{ id: RECIPIENT_ID, name: "Archived task" }], documents: [], organization: [] }));
  await login(page, admin);
  await page.goto("/h/holding");
  const archivedProduct = page.locator("section.pmp-card").filter({ hasText: "Archived product" });
  const activeProduct = page.locator("section.pmp-card").filter({ hasText: "Active product" });
  await expect(archivedProduct).toHaveClass(/pmp-archived/);
  await expect(activeProduct).not.toHaveClass(/pmp-archived/);
  expect(await archivedProduct.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe(await activeProduct.evaluate(node => getComputedStyle(node).backgroundColor));
  await expect(archivedProduct).toHaveCSS("opacity", "1");
  await expect(archivedProduct.getByText("Archived", { exact: true })).toBeVisible();
  await page.goto("/portfolio");
  const archivedProject = page.getByRole("link", { name: /Archived project/ });
  const activeProject = page.getByRole("link", { name: /Active project/ });
  await expect(archivedProject).toHaveClass(/pmp-archived/);
  await expect(activeProject).not.toHaveClass(/pmp-archived/);
  expect(await archivedProject.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe(await activeProject.evaluate(node => getComputedStyle(node).backgroundColor));
  await page.goto("/tasks");
  const selector = testInfo.project.name === "phone" ? ".pmp-data-card" : "tr";
  const archivedTask = page.locator(selector).filter({ hasText: "Archived task" });
  const activeTask = page.locator(selector).filter({ hasText: "Active task" });
  await expect(archivedTask).toHaveClass(/pmp-archived/);
  await expect(activeTask).not.toHaveClass(/pmp-archived/);
  expect(await archivedTask.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe(await activeTask.evaluate(node => getComputedStyle(node).backgroundColor));
  await expect(archivedTask.getByText("Archived", { exact: true })).toBeVisible();
  await page.goto("/admin/archive");
  const entry = page.locator(".pmp-archived").filter({ hasText: "Archived project" });
  await expect(entry).toBeVisible();
  await expect(entry.getByRole("button", { name: "Restore", exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath(`archive-${theme}.png`) });
});
