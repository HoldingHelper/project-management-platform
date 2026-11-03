import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarMonth, monthBoundary, shiftMonth } from "./calendar-month";

test("monthly planning groups and moves tasks by Jalali month boundaries", () => {
  assert.equal(calendarMonth("2026-03-20", "persian"), "1404-12");
  assert.equal(calendarMonth("2026-03-21", "persian"), "1405-01");
  assert.equal(monthBoundary("1405-01", "persian"), "2026-03-21");
  assert.equal(monthBoundary("1405-01", "persian", true), "2026-04-20");
  assert.equal(monthBoundary("1403-12", "persian", true), "2025-03-20");
  assert.equal(shiftMonth("1404-12", 1), "1405-01");
  assert.equal(shiftMonth("1405-01", -1), "1404-12");
});

test("English monthly planning retains Gregorian boundaries in any timezone", () => {
  assert.equal(calendarMonth("2026-03-21", "gregory"), "2026-03");
  assert.equal(monthBoundary("2026-03", "gregory", true), "2026-03-31");
  assert.equal(monthBoundary("2024-02", "gregory", true), "2024-02-29");
});
