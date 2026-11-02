import { persianParts, persianToIso, persianMonthDays } from "./persian-date";
import type { Preferences } from "./core";

type Calendar = Preferences["calendar"];
export function calendarMonth(iso: string, calendar: Calendar) {
  if (calendar === "gregory") return iso.slice(0, 7);
  const parts = persianParts(iso)!;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}
export function shiftMonth(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  const total = year * 12 + month - 1 + delta;
  return `${Math.floor(total / 12)}-${String(((total % 12) + 12) % 12 + 1).padStart(2, "0")}`;
}
export function monthBoundary(key: string, calendar: Calendar, end = false) {
  const [year, month] = key.split("-").map(Number);
  if (calendar === "persian") return persianToIso(year, month, end ? persianMonthDays(year, month) : 1)!;
  const day = end ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 1;
  return `${key}-${String(day).padStart(2, "0")}`;
}
