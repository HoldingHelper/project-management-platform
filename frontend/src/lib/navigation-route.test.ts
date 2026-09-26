import test from "node:test";
import assert from "node:assert/strict";
import { getRouteMeta, NAV_GROUPS, PERSONAL_NAV } from "../components/shell/navigation";

test("route metadata identifies each canonical administration and scope page", () => {
  assert.equal(getRouteMeta("/admin/users").title, "People");
  assert.equal(getRouteMeta("/admin/departments").title, "Departments");
  assert.equal(getRouteMeta("/admin/roles").title, "Roles & Permissions");
  assert.equal(getRouteMeta("/h/holding/functions/marketing").title, "Function Hub");
  assert.equal(getRouteMeta("/h/holding").title, "Holding Cockpit");
  assert.equal(getRouteMeta("/unregistered/path").title, "Project Platform");
});

test("canonical navigation paths activate one matching destination", () => {
  const items = [...NAV_GROUPS.flatMap((group) => group.items), ...PERSONAL_NAV];
  for (const pathname of [
    "/admin/users",
    "/admin/departments",
    "/admin/teams",
    "/admin/roles",
    "/admin/partitions",
    "/admin/invitations",
    "/admin/org",
    "/projects/123",
    "/projects/ai-generator",
    "/settings/mcp",
  ]) {
    const matches = items.filter((item) => item.match(pathname));
    assert.equal(matches.length, 1, `${pathname} matched: ${matches.map((item) => item.href).join(", ")}`);
  }
});
