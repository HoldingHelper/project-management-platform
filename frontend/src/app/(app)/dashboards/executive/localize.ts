import type { Locale } from "@/lib/i18n/core";

type Translate = (message: string, values?: Record<string, string | number>) => string;

// The API currently produces these deterministic English summaries. Unknown
// narratives are left intact rather than translated with invented meaning.
const narratives: Array<[RegExp, string, string[]]> = [
  [/^Delivery performance is rated '(.+?)' with (\d+) completed tasks \(([\d.]+) story points\) and an ([\d.]+)% on-time delivery rate\.$/, "Delivery performance is rated {rating} with {tasks} completed tasks ({points} story points) and an {rate}% on-time delivery rate.", ["rating", "tasks", "points", "rate"]],
  [/^Flow velocity is steady with ([\d.]+)% allocated to new features, ([\d.]+)% to technical debt, and ([\d.]+)% to quality defect fixes\.$/, "Flow velocity is steady with {features}% allocated to new features, {debt}% to technical debt, and {defects}% to quality defect fixes.", ["features", "debt", "defects"]],
  [/^Leading department investment is (.+?) \(([\d.]+)%\), followed by balanced execution across Platform, Operations, and Marketing streams\.$/, "Leading department investment is {category} ({percentage}%), followed by balanced execution across Platform, Operations, and Marketing streams.", ["category", "percentage"]],
  [/^Mean Time to Recovery \(MTTR\) is (.+?) \((.+?) rating\) with (\d+) overdue task\(s\) in flight\.$/, "Mean Time to Recovery (MTTR) is {duration} ({rating} rating) with {tasks} overdue tasks in flight.", ["duration", "rating", "tasks"]],
  [/^Maintain Flow Efficiency at ([\d.]+)% by capping Active WIP to under (\d+) tasks\.$/, "Maintain Flow Efficiency at {efficiency}% by capping Active WIP to under {tasks} tasks.", ["efficiency", "tasks"]],
  [/^Keep Technical Debt allocation near ~15% to maintain Lead Time for Changes under (.+?)\.$/, "Keep Technical Debt allocation near ~15% to maintain Lead Time for Changes under {duration}.", ["duration"]],
  [/^Ensure automated GitHub PR verification and CI\/CD checks continue to keep CFR below (.+?)\.$/, "Ensure automated GitHub PR verification and CI/CD checks continue to keep CFR below {rate}.", ["rate"]],
  [/^(.+?) blocker · pending (\d+) day\(s\)$/, "{severity} blocker · pending {days} days", ["severity", "days"]],
  [/^Past its end date by (\d+) day\(s\)$/, "Past its end date by {days} days", ["days"]],
  [/^Blocked with no movement for (\d+) day\(s\)$/, "Blocked with no movement for {days} days", ["days"]],
];

export function localizeMetric(value: string, locale: Locale, t: Translate): string {
  if (locale !== "fa") return value;
  const match = value.match(/^([\d.]+)\s*(hrs|days|\/ week)$/);
  if (!match) return value;
  const unit = match[2] === "hrs" ? "{value} hours" : match[2] === "days" ? "{value} days" : "{value} per week";
  return t(unit, { value: Number(match[1]) });
}

export function localizeNarrative(value: string, locale: Locale, t: Translate): string {
  if (locale !== "fa") return value;
  for (const [pattern, message, fields] of narratives) {
    const match = value.match(pattern);
    if (!match) continue;
    const values = Object.fromEntries(fields.map((field, index) => {
      const raw = match[index + 1];
      if (field === "duration") return [field, localizeMetric(raw, locale, t)];
      if (field === "rating" || field === "category" || field === "severity") return [field, t(raw)];
      return [field, /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : raw];
    }));
    return t(message, values);
  }
  return value;
}
