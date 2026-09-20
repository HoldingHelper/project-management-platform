import { expect, test, type Page, type Route } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "33333333-3333-4333-8333-333333333333";
const PAGE_ID_1 = "44444444-4444-4444-8444-444444444444";
const PAGE_ID_2 = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-09-20T12:00:00Z";

const user = {
  id: USER_ID,
  email: "dev@example.com",
  username: "dev",
  first_name: "Lead",
  last_name: "Engineer",
  full_name: "Lead Engineer",
  roles: ["Developer"],
  permissions: ["docs.view", "docs.comment", "docs.edit", "docs.manage"],
  created_at: NOW,
};

const space = {
  id: SPACE_ID,
  name: "Engineering Architecture",
  slug: "engineering-architecture",
  description: "Core system architecture and design docs",
  category: "Platform",
  visibility: "workspace",
  position: 0,
  created_at: NOW,
  updated_at: NOW,
};

const page1 = {
  id: PAGE_ID_1,
  space_id: SPACE_ID,
  parent_page_id: null,
  title: "Service Architecture",
  slug: "service-architecture",
  excerpt: "Overview of microservices and communication",
  content: "# Service Architecture\n\nSee [[Database Partitioning]] for data tier design.",
  content_json: {},
  status: "internal",
  visibility: "workspace",
  doc_type: "document",
  tags: ["architecture", "backend"],
  created_by: USER_ID,
  updated_by: USER_ID,
  created_at: NOW,
  updated_at: NOW,
};

const page2 = {
  id: PAGE_ID_2,
  space_id: SPACE_ID,
  parent_page_id: null,
  title: "Database Partitioning",
  slug: "database-partitioning",
  excerpt: "ADR on PostgreSQL table partitioning",
  content: "# Database Partitioning\n\nWe partition task and activity tables by month.",
  content_json: {},
  status: "internal",
  visibility: "workspace",
  doc_type: "adr",
  tags: ["database", "postgres"],
  created_by: USER_ID,
  updated_by: USER_ID,
  created_at: NOW,
  updated_at: NOW,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function setupMockRoutes(page: Page) {
  // Inject session tokens before navigating
  await page.addInitScript(
    ({ u }) => {
      window.localStorage.setItem("pmp.refresh_token", "test-refresh");
      window.localStorage.setItem("pmp.user", JSON.stringify(u));
    },
    { u: user }
  );

  await page.route("**/api/v1/auth/refresh", (r) =>
    json(r, {
      access_token: "test-access",
      refresh_token: "test-refresh",
      token_type: "bearer",
      expires_in: 900,
      user,
    })
  );
  await page.route("**/api/v1/auth/me", (r) => json(r, user));
  await page.route("**/api/v1/docs/spaces*", (r) => json(r, [space]));
  await page.route(`**/api/v1/docs/pages?space_id=${SPACE_ID}*`, (r) => json(r, [page1, page2]));
  await page.route("**/api/v1/docs/pages?*", (r) => json(r, [page1, page2]));
  await page.route(`**/api/v1/docs/pages/${PAGE_ID_1}`, (r) => {
    if (r.request().method() === "PATCH") {
      const data = r.request().postDataJSON();
      return json(r, { ...page1, ...data, updated_at: new Date().toISOString() });
    }
    return json(r, page1);
  });
  await page.route(`**/api/v1/docs/pages/${PAGE_ID_2}`, (r) => json(r, page2));
  await page.route(`**/api/v1/docs/pages/${PAGE_ID_1}/backlinks`, (r) => json(r, []));
  await page.route(`**/api/v1/docs/pages/${PAGE_ID_2}/backlinks`, (r) =>
    json(r, [
      {
        id: "rel-1",
        source_page_id: PAGE_ID_1,
        target_page_id: PAGE_ID_2,
        target_title: "Database Partitioning",
        relation_type: "links_to",
        anchor_text: "data tier design",
        confidence: "EXTRACTED",
        confidence_score: 1.0,
        created_at: NOW,
      },
    ])
  );
  await page.route("**/api/v1/docs/tags", (r) =>
    json(r, [
      { id: "tag-1", name: "architecture", page_count: 1 },
      { id: "tag-2", name: "database", page_count: 1 },
    ])
  );
  await page.route("**/api/v1/docs/sources*", (r) => json(r, []));
  await page.route("**/api/v1/docs/wikilink-suggestions*", (r) =>
    json(r, [
      { title: "Database Partitioning", slug: "database-partitioning", space_id: SPACE_ID, doc_type: "adr", exists: true },
      { title: "Service Architecture", slug: "service-architecture", space_id: SPACE_ID, doc_type: "document", exists: true },
    ])
  );
  await page.route("**/api/v1/docs/search/quick*", (r) =>
    json(r, [
      {
        id: PAGE_ID_2,
        result_type: "page",
        title: "Database Partitioning",
        slug: "database-partitioning",
        space_id: SPACE_ID,
        space_name: "Engineering Architecture",
        excerpt: "ADR on PostgreSQL table partitioning",
        rank_score: 1.0,
        matching_field: "title",
        doc_type: "adr",
      },
    ])
  );
  await page.route("**/api/v1/docs/graph/global*", (r) =>
    json(r, {
      nodes: [
        { id: PAGE_ID_1, label: "Service Architecture", doc_type: "document", degree: 1 },
        { id: PAGE_ID_2, label: "Database Partitioning", doc_type: "adr", degree: 1 },
      ],
      edges: [
        { source: PAGE_ID_1, target: PAGE_ID_2, relation_type: "links_to" },
      ],
    })
  );
  await page.route("**/api/v1/notifications*", (r) => json(r, []));
}

test.describe("Knowledge Workspace", () => {
  test("loads 3-panel workspace, explorer, tab bar, and quick switcher", async ({ page }) => {
    await setupMockRoutes(page);

    await page.goto("/app/docs");

    // Verify Knowledge Base explorer is present
    await expect(page.getByText("Knowledge Base")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Engineering Architecture", { exact: true })).toBeVisible();

    // Verify Quick Switcher trigger
    await expect(page.getByText("Search docs & ADRs...")).toBeVisible();

    // Trigger Quick Switcher via click
    await page.getByText("Search docs & ADRs...").click();
    await expect(page.getByPlaceholder("Type page title, slug, or keyword...")).toBeVisible();

    // Type query and check results
    await page.getByPlaceholder("Type page title, slug, or keyword...").fill("partitioning");
    const switcherModal = page.locator("[data-testid=quick-switcher]");
    await expect(switcherModal.getByText("Database Partitioning")).toBeVisible();

    // Click to open document in workspace tab
    await switcherModal.getByText("Database Partitioning").click();

    // Tab bar should now display the opened document
    const tabBar = page.locator("[data-testid=workspace-tab-bar]");
    await expect(tabBar.getByText("Database Partitioning")).toBeVisible();

    // Editor should load document content
    await expect(page.getByPlaceholder("Write markdown here... Type [[ to link another doc, # to add a tag...")).toBeVisible();
  });

  test("supports multi-tab workspace, pinning, and tab switching", async ({ page }) => {
    await setupMockRoutes(page);

    await page.goto("/app/docs");

    // Open first doc via Quick Switcher
    await page.getByText("Search docs & ADRs...").click();
    await page.getByPlaceholder("Type page title, slug, or keyword...").fill("partitioning");
    const switcherModal = page.locator("[data-testid=quick-switcher]");
    await switcherModal.getByText("Database Partitioning").click();

    // Open Global Graph tab
    await page.getByTitle("Open Knowledge Graph").click();

    // Verify both tabs are visible in tab bar
    const tabBar = page.locator("[data-testid=workspace-tab-bar]");
    await expect(tabBar.getByText("Database Partitioning")).toBeVisible();
    await expect(tabBar.getByText("Knowledge Graph")).toBeVisible();

    // Switch back to document tab
    await tabBar.getByText("Database Partitioning").click();
    await expect(page.getByPlaceholder("Write markdown here... Type [[ to link another doc, # to add a tag...")).toBeVisible();
  });

  test("supports knowledge graph view with interactive nodes", async ({ page }) => {
    await setupMockRoutes(page);

    await page.goto("/app/docs");

    // Open Knowledge Graph
    await page.getByTitle("Open Knowledge Graph").click();

    // Verify SVG canvas and legend
    await expect(page.locator("[data-testid=knowledge-graph-canvas]")).toBeVisible();
    await expect(page.getByText("Global Knowledge Graph")).toBeVisible();
    await expect(page.getByText("ADR (Architecture Decision)")).toBeVisible();
  });
});
