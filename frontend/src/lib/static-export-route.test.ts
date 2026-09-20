import test from "node:test";
import assert from "node:assert/strict";
import { resolveStaticExportParams } from "./static-export-route";

test("resolves each static-export dynamic route from the viewer pathname", () => {
  assert.deepEqual(resolveStaticExportParams("/projects/5688d7f8-4827-4d63-a016-bb882642fa6f", ["projects"], 1), [
    "5688d7f8-4827-4d63-a016-bb882642fa6f",
  ]);
  assert.deepEqual(resolveStaticExportParams("/tasks/859b3de5-3d69-48d6-a3db-55b34f990e63", ["tasks"], 1), [
    "859b3de5-3d69-48d6-a3db-55b34f990e63",
  ]);
  assert.deepEqual(resolveStaticExportParams("/profile/0d9fc443-34af-4c93-a3a4-cd27a273aa61", ["profile"], 1), [
    "0d9fc443-34af-4c93-a3a4-cd27a273aa61",
  ]);
  assert.deepEqual(resolveStaticExportParams("/accept-invitation/a%2Bb%3Dc", ["accept-invitation"], 1), ["a+b=c"]);
  assert.deepEqual(
    resolveStaticExportParams(
      "/app/docs/spaces/f001fe9a-91cc-4bc6-91a1-27fa0dce6638/55da7f71-78c4-4e5d-9941-210d7e9b40d4",
      ["app", "docs", "spaces"],
      2
    ),
    ["f001fe9a-91cc-4bc6-91a1-27fa0dce6638", "55da7f71-78c4-4e5d-9941-210d7e9b40d4"]
  );
});

test("rejects unrelated, incomplete, and malformed viewer paths", () => {
  assert.equal(resolveStaticExportParams("/projects/ai-generator", ["tasks"], 1), null);
  assert.equal(resolveStaticExportParams("/app/docs/spaces/one", ["app", "docs", "spaces"], 2), null);
  assert.equal(resolveStaticExportParams("/tasks/%E0%A4%A", ["tasks"], 1), null);
});

test("resolves dynamic IDs from static-export /app/teams aliases", () => {
  assert.deepEqual(
    resolveStaticExportParams("/app/teams/tasks/859b3de5-3d69-48d6-a3db-55b34f990e63", ["tasks"], 1),
    ["859b3de5-3d69-48d6-a3db-55b34f990e63"]
  );
  assert.deepEqual(
    resolveStaticExportParams("/app/teams/projects/5688d7f8-4827-4d63-a016-bb882642fa6f", ["projects"], 1),
    ["5688d7f8-4827-4d63-a016-bb882642fa6f"]
  );
  assert.deepEqual(
    resolveStaticExportParams("/app/teams/profile/0d9fc443-34af-4c93-a3a4-cd27a273aa61", ["profile"], 1),
    ["0d9fc443-34af-4c93-a3a4-cd27a273aa61"]
  );
});
