import test from "node:test";
import assert from "node:assert/strict";
import { resolveWorkspaceDestination, resolveDocsReturnDestination } from "./workspace-navigation";

test("fresh login defaults to Holding", () => {
  assert.equal(resolveWorkspaceDestination(null, null), "/h/holding");
});

test("login restores the last workspace section and its filters", () => {
  for (const path of ["/portfolio", "/tasks?view=my&layout=monthly", "/my-work", "/app/docs/spaces/space/page"]) {
    assert.equal(resolveWorkspaceDestination(null, path), path);
  }
});

test("an interrupted workspace destination takes priority over saved Docs", () => {
  assert.equal(resolveWorkspaceDestination("/portfolio", "/app/docs"), "/portfolio");
});

test("external, public, and authentication destinations never replace the workspace", () => {
  for (const path of ["https://example.com", "//example.com", "/\\example.com", "/login", "/", "/docs", "/app", "/app/docs-other", "/unknown"]) {
    assert.equal(resolveWorkspaceDestination(path, null), "/h/holding", path);
    assert.equal(resolveWorkspaceDestination(path, "/my-work"), "/my-work", path);
  }
});

test("Docs returns to its previous workspace page including filters", () => {
  assert.equal(resolveDocsReturnDestination("/portfolio"), "/portfolio");
  assert.equal(resolveDocsReturnDestination("/tasks?view=my&layout=monthly"), "/tasks?view=my&layout=monthly");
});

test("direct Docs entry falls back to Holding without returning to Docs or an external site", () => {
  for (const path of [null, "/app/docs", "/app/docs/spaces/space/page", "/login", "//example.com"]) {
    assert.equal(resolveDocsReturnDestination(path), "/h/holding");
  }
});