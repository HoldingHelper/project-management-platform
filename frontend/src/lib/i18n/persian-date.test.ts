import { test } from "node:test";
import assert from "node:assert/strict";
import { persianParts, persianToIso, persianMonthDays } from "./persian-date";

test("Jalali New Year round trips through ISO without changing the day", () => {
  assert.deepEqual(persianParts("2026-03-21"), { year: 1405, month: 1, day: 1 });
  assert.equal(persianToIso(1405, 1, 1), "2026-03-21");
  assert.equal(persianToIso(1404, 12, 29), "2026-03-20");
  assert.equal(persianToIso(1403, 12, 30), "2025-03-20");
  assert.equal(persianToIso(1404, 12, 30), null);
});

test("Jalali months and leap years determine the selectable days", () => {
  assert.equal(persianMonthDays(1405, 1), 31);
  assert.equal(persianMonthDays(1405, 7), 30);
  assert.equal(persianMonthDays(1403, 12), 30);
  assert.equal(persianMonthDays(1404, 12), 29);
  assert.equal(persianToIso(1405, 7, 31), null);
});
