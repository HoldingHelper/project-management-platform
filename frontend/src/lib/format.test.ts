import test from "node:test";
import assert from "node:assert/strict";
import {
  avatarHue,
  blockMeter,
  columnForStatus,
  displayName,
  initials,
  PRIORITY_COLOR,
  PRIORITY_GLYPH,
  relativeTime,
  semanticColor,
  toSemantic,
} from "./format";

test("displayName handles empty, dash, and valid names", () => {
  assert.equal(displayName(""), "Unknown");
  assert.equal(displayName("-"), "Unknown");
  assert.equal(displayName("  "), "Unknown");
  assert.equal(displayName("John Doe"), "John Doe");
});

test("initials extracts uppercase 1-2 character initials", () => {
  assert.equal(initials("John Doe"), "JD");
  assert.equal(initials("Alice"), "AL");
  assert.equal(initials(""), "UN");
});

test("blockMeter formats visual discrete bar", () => {
  assert.equal(blockMeter(50, 10), "█████░░░░░");
  assert.equal(blockMeter(100, 10), "██████████");
  assert.equal(blockMeter(0, 10), "░░░░░░░░░░");
});

test("toSemantic maps task and project statuses", () => {
  assert.equal(toSemantic("Done"), "completed");
  assert.equal(toSemantic("Blocked"), "blocked");
  assert.equal(toSemantic("InProgress"), "in-progress");
  assert.equal(toSemantic("Review"), "delayed");
  assert.equal(toSemantic("NotStarted"), "not-started");
});

test("columnForStatus buckets task status into Kanban columns", () => {
  assert.equal(columnForStatus("NotStarted"), "To Do");
  assert.equal(columnForStatus("InProgress"), "In Progress");
  assert.equal(columnForStatus("Done"), "Done");
});

test("PRIORITY_COLOR and PRIORITY_GLYPH contain valid tokens for P0..P3", () => {
  assert.ok(PRIORITY_COLOR["P0"]);
  assert.ok(PRIORITY_COLOR["P1"]);
  assert.ok(PRIORITY_COLOR["P2"]);
  assert.ok(PRIORITY_COLOR["P3"]);

  assert.equal(PRIORITY_GLYPH["P0"], "◆");
  assert.equal(PRIORITY_GLYPH["P1"], "▲");
  assert.equal(PRIORITY_GLYPH["P3"], "▼");
});

test("semanticColor returns fg and bg values", () => {
  const comp = semanticColor("completed");
  assert.equal(comp.label, "Completed");
  assert.ok(comp.fg);
  assert.ok(comp.bg);
});
