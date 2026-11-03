import assert from "node:assert/strict";
import test from "node:test";
import { translateWithPreferences } from "../../../../lib/i18n/core";
import { localizeMetric, localizeNarrative } from "./localize";

const fa = (message: string, values?: Record<string, string | number>) => translateWithPreferences({ locale: "fa", calendar: "persian", numbering_system: "latn" }, message, values);
const en = (message: string, values?: Record<string, string | number>) => translateWithPreferences({ locale: "en", calendar: "gregory", numbering_system: "latn" }, message, values);

test("executive narrative translates known server text without changing its figures", () => {
  const original = "Delivery performance is rated 'High' with 4 completed tasks (9.0 story points) and an 100.0% on-time delivery rate.";
  assert.equal(localizeNarrative(original, "en", en), original);
  assert.equal(localizeNarrative(original, "fa", fa), "عملکرد تحویل در سطح زیاد است؛ 4 کار (9 امتیاز) تکمیل شده و نرخ تحویل به‌موقع 100٪ است.");
  assert.equal(localizeMetric("7.3 hrs", "fa", fa), "7.3 ساعت");
  assert.equal(localizeNarrative("A new server narrative", "fa", fa), "A new server narrative");
  assert.match(localizeNarrative("Maintain Flow Efficiency at 31.7% by capping Active WIP to under 5 tasks.", "fa", fa), /31\.7.*5|5.*31\.7/);
});

test("each current generated narrative has a Persian translation", () => {
  const examples = [
    "Flow velocity is steady with 22.2% allocated to new features, 0.0% to technical debt, and 77.8% to quality defect fixes.",
    "Leading department investment is Technical (100.0%), followed by balanced execution across Platform, Operations, and Marketing streams.",
    "Mean Time to Recovery (MTTR) is 8.5 hrs (High rating) with 1 overdue task(s) in flight.",
    "Maintain Flow Efficiency at 31.7% by capping Active WIP to under 5 tasks.",
    "Keep Technical Debt allocation near ~15% to maintain Lead Time for Changes under 7.3 hrs.",
    "Ensure automated GitHub PR verification and CI/CD checks continue to keep CFR below 0.0%.",
  ];
  for (const text of examples) {
    assert.notEqual(localizeNarrative(text, "fa", fa), text);
    assert.equal(localizeNarrative(text, "en", en), text);
  }
});
