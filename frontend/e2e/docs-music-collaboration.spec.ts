import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const SPACE_ID = "33333333-3333-4333-8333-333333333333";
const PAGE_ID = "44444444-4444-4444-8444-444444444444";
const CHANNEL_ID = "55555555-5555-4555-8555-555555555555";
const PROJECT_ID = "66666666-6666-4666-8666-666666666666";
const NOW = "2026-08-23T12:00:00Z";

const owner = {
  id: OWNER_ID,
  email: "owner@example.com",
  username: "owner",
  first_name: "Doc",
  last_name: "Owner",
  full_name: "Doc Owner",
  job_title: "Editor",
  avatar_url: null,
  is_active: true,
  mfa_enabled: false,
  roles: ["Developer"],
  permissions: ["docs.view", "docs.comment", "docs.edit", "chat.access", "music.access"],
  created_at: NOW,
};

const colleague = {
  ...owner,
  id: OTHER_ID,
  email: "alice@example.com",
  username: "alice",
  first_name: "Alice",
  last_name: "Engineer",
  full_name: "Alice Engineer",
};

const docPage = {
  id: PAGE_ID,
  space_id: SPACE_ID,
  parent_page_id: null,
  title: "Launch checklist",
  slug: "launch-checklist",
  excerpt: "A public launch guide",
  content: "## Launch\nReview the release checklist before deployment.",
  content_json: {},
  status: "draft",
  visibility: "private",
  responsible_user_id: null,
  position: 0,
  youtube_url: null,
  seo_title: null,
  seo_description: null,
  created_by: OWNER_ID,
  updated_by: OWNER_ID,
  created_at: NOW,
  updated_at: NOW,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installApi(page: Page) {
  const state = {
    currentDoc: { ...docPage },
    permissions: [] as Array<Record<string, string>>,
    comments: [] as Array<Record<string, unknown>>,
    attachments: [] as Array<Record<string, unknown>>,
    links: [] as Array<Record<string, unknown>>,
    deletedMusic: false,
    streamProxyRequested: false,
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = request.method();

    if (path === "/auth/login") {
      return json(route, { access_token: "test-access", refresh_token: "test-refresh", token_type: "bearer", expires_in: 900, user: owner });
    }
    if (path === "/auth/refresh") {
      return json(route, { access_token: "test-access", refresh_token: "test-refresh", token_type: "bearer", expires_in: 900, user: owner });
    }
    if (path === "/users") return json(route, { items: [owner, colleague], page: 1, page_size: 200, total_count: 2 });
    if (path === "/teams") return json(route, [{ id: "77777777-7777-4777-8777-777777777777", name: "Platform" }]);
    if (path === "/departments") return json(route, [{ id: "88888888-8888-4888-8888-888888888888", name: "Engineering" }]);
    if (path === "/projects") {
      const docsLookup = url.searchParams.get("page_size") === "200";
      return json(route, { items: docsLookup ? [{ id: PROJECT_ID, name: "Roadmap launch", health_status: "on-track" }] : [], page: 1, page_size: docsLookup ? 200 : 100, total_count: docsLookup ? 1 : 0 });
    }
    if (path === "/tasks") return json(route, { items: [], page: 1, page_size: 30, total_count: 0 });

    if (path === `/docs/pages/${PAGE_ID}/comments`) {
      if (method === "POST") {
        const payload = request.postDataJSON();
        const created = { id: "99999999-9999-4999-8999-999999999999", page_id: PAGE_ID, author_user_id: OWNER_ID, created_at: NOW, ...payload };
        state.comments.push(created);
        return json(route, created, 201);
      }
      return json(route, state.comments);
    }
    if (path === `/docs/pages/${PAGE_ID}/revisions`) return json(route, []);
    if (path === `/docs/page/${PAGE_ID}/permissions`) {
      if (method === "PUT") {
        state.permissions = (request.postDataJSON() as Array<Record<string, string>>).map((item, index) => ({
          id: `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          resource_type: "page",
          resource_id: PAGE_ID,
          ...item,
        }));
        return route.fulfill({ status: 204 });
      }
      return json(route, state.permissions);
    }
    if (path === `/docs/pages/${PAGE_ID}/links`) {
      if (method === "POST") {
        const created = { id: "b0000000-0000-4000-8000-000000000001", page_id: PAGE_ID, created_at: NOW, ...request.postDataJSON() };
        state.links.push(created);
        return json(route, created, 201);
      }
      return json(route, state.links);
    }
    if (path === `/docs/pages/${PAGE_ID}/attachments/upload`) {
      const created = { id: "c0000000-0000-4000-8000-000000000001", page_id: PAGE_ID, file_name: "brief.txt", file_url: null, mime_type: "text/plain", uploaded_by: OWNER_ID, size_bytes: 12, stored: true, created_at: NOW };
      state.attachments.push(created);
      return json(route, created, 201);
    }
    if (path === `/docs/pages/${PAGE_ID}/attachments`) return json(route, state.attachments);
    if (path === `/docs/pages/${PAGE_ID}`) {
      if (method === "PATCH") {
        Object.assign(state.currentDoc, request.postDataJSON());
        if (state.currentDoc.visibility === "public") state.currentDoc.status = "published";
        else if (state.currentDoc.status === "published") state.currentDoc.status = "internal";
      }
      return json(route, state.currentDoc);
    }

    if (path === "/chat/channels") return json(route, []);
    if (path === "/music/channels") {
      return json(route, state.deletedMusic ? [] : [{
        channel: { id: CHANNEL_ID, name: "lite_music", color: "gold", owner_user_id: OWNER_ID, drive_folder_id: "folder", drive_folder_name: "Public Drive folder", created_at: NOW, updated_at: NOW },
        member_count: 1,
        is_member: true,
        can_control: true,
        is_playing: false,
        now_playing: null,
      }]);
    }
    if (path === `/music/channels/${CHANNEL_ID}` && method === "DELETE") {
      state.deletedMusic = true;
      return route.fulfill({ status: 204 });
    }
    if (path === `/music/channels/${CHANNEL_ID}/state`) {
      return json(route, { channel_id: CHANNEL_ID, playlist: [{ id: "track-1", name: "tone.wav", mime_type: "audio/wav" }], track_index: 0, track: { id: "track-1", name: "tone.wav", mime_type: "audio/wav" }, is_playing: false, position_seconds: 0, server_epoch_ms: Date.now(), server_now_ms: Date.now(), state_version: 1 });
    }
    if (path === `/music/channels/${CHANNEL_ID}/tracks/track-1/stream-url`) {
      return json(route, { url: "/api/v1/music/tracks/track-1/stream?token=signed" });
    }
    if (path === "/music/tracks/track-1/stream") {
      state.streamProxyRequested = true;
      return route.fulfill({ status: 200, contentType: "audio/wav", body: Buffer.from("UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=", "base64") });
    }
    if (path === `/music/channels/${CHANNEL_ID}/members`) return json(route, [{ channel_id: CHANNEL_ID, user_id: OWNER_ID, can_control: true, created_at: NOW }]);
    if (path === "/music/drive/status") return json(route, { configured: false, connected: false, email: null });

    if (path === "/notifications/unread-count") return json(route, { count: 0 });
    if (path.includes("pending-work")) return json(route, { pending_on_me: [] });
    if (path.startsWith("/docs/")) return json(route, []);
    return json(route, []);
  });
  return state;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill("valid-test-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/app\/(teams|docs)$/);
}

test("Docs collaboration controls and music ownership work together", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The desktop workflow exercises the in-flow communication drawer.");
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  const api = await installApi(page);
  await login(page);

  await page.goto(`/app/docs/spaces/${SPACE_ID}/${PAGE_ID}`);
  await expect(page.getByRole("heading", { name: "Launch checklist" })).toBeVisible();
  await page.getByRole("button", { name: "Access" }).click();
  const accessSearch = page.getByLabel("Search access subjects");
  await accessSearch.fill("Alice");
  await page.getByRole("option", { name: /Alice Engineer/ }).click();
  await page.getByRole("button", { name: "Grant" }).click();
  await expect.poll(() => api.permissions.length).toBe(1);
  await expect.poll(() => api.currentDoc.visibility).toBe("selected");
  await page.getByRole("button", { name: "Public without sign-in" }).click();
  await expect.poll(() => api.currentDoc.visibility).toBe("public");

  await page.getByRole("button", { name: "Linked work" }).click();
  const workSearch = page.getByLabel("Search linked work");
  await workSearch.fill("Roadmap");
  await page.getByRole("option", { name: /Roadmap launch/ }).click();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect.poll(() => api.links.length).toBe(1);

  await page.getByRole("button", { name: "Files" }).click();
  await page.getByLabel("Choose local attachment").setInputFiles({ name: "brief.txt", mimeType: "text/plain", buffer: Buffer.from("hello docs") });
  await page.getByRole("button", { name: "Upload file" }).click();
  await expect(page.getByRole("button", { name: "brief.txt" })).toBeVisible();

  await page.getByRole("tab", { name: "Write" }).click();
  const editor = page.getByLabel("Document content");
  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("release checklist");
    element.focus();
    element.setSelectionRange(start, start + "release checklist".length);
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(page.getByText(/Commenting on “release checklist”/)).toBeVisible();
  await page.getByPlaceholder(/Write a comment/).fill("Verify this step");
  await page.getByPlaceholder(/Write a comment/).press("Enter");
  await expect.poll(() => api.comments.length).toBe(1);
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.locator("mark", { hasText: "release checklist" })).toBeVisible();

  await page.getByRole("link", { name: "Teams" }).click();
  await expect(page).toHaveURL(/\/app\/teams$/);
  await page.waitForTimeout(500);
  expect(pageErrors).toEqual([]);
  await page.getByLabel("Open team chat").click();
  await page.getByRole("button", { name: /Music · 1/ }).click();
  await page.getByRole("button", { name: /lite_music/ }).click();
  await expect(page.getByRole("button", { name: "Delete music channel" })).toBeVisible();
  await expect.poll(() => page.locator("audio").getAttribute("src")).toContain("/api/v1/music/tracks/track-1/stream");
  await expect.poll(() => api.streamProxyRequested).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete music channel" }).click();
  await expect.poll(() => api.deletedMusic).toBe(true);

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("a published workspace Doc is readable without signing in", async ({ page }) => {
  await page.route("**/api/v1/docs/public/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/navigation")) {
      return json(route, [{ name: "Platform", slug: "platform", description: "Published guides", pages: [{ id: PAGE_ID, slug: "launch-checklist", title: docPage.title, excerpt: docPage.excerpt }] }]);
    }
    return json(route, { ...docPage, status: "published", visibility: "public" });
  });
  await page.goto("/docs");
  await expect(page.getByRole("heading", { name: "Published from the workspace" })).toBeVisible();
  await page.getByRole("link", { name: /Launch checklist/ }).click();
  await expect(page).toHaveURL(new RegExp(`/docs/shared/${PAGE_ID}$`));
  await expect(page.getByRole("heading", { name: "Launch checklist" })).toBeVisible();
  await expect(page.getByText("Review the release checklist before deployment.")).toBeVisible();
});
