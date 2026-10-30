import test from "node:test";
import assert from "node:assert/strict";
import { sprintSchedule } from "./sprint-schedule";

test("3, 7 and 14 day sprints use inclusive dates", () => {
  for (const days of [3, 7, 14]) {
    const plan = sprintSchedule("2026-10-30", [days, days, days]);
    assert.equal(plan.length, 3);
    assert.equal((Date.parse(plan[2].end_date) - Date.parse(plan[0].start_date)) / 86400000 + 1, days * 3);
    assert.equal(Date.parse(plan[1].start_date) - Date.parse(plan[0].end_date), 86400000);
  }
});
test("mixed sprint durations cross leap days without gaps", () => {
  assert.deepEqual(sprintSchedule("2028-02-28", [3, 7, 14]).map((window) => [window.start_date, window.end_date]), [
    ["2028-02-28", "2028-03-01"], ["2028-03-02", "2028-03-08"], ["2028-03-09", "2028-03-22"],
  ]);
});
test("invalid dates and unsupported durations cannot form a schedule", () => {
  for (const start of ["", "2026-02-30", "invalid"]) assert.deepEqual(sprintSchedule(start, [7]), []);
  for (const days of [0, 1, 4, 15]) assert.deepEqual(sprintSchedule("2026-10-30", [days]), []);
});
