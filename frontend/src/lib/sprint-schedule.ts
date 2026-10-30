export const SPRINT_DURATIONS = [3, 7, 14] as const;
export function sprintSchedule(start: string, durations: readonly number[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !durations.length || durations.some((days) => !SPRINT_DURATIONS.includes(days as 3 | 7 | 14))) return [];
  const first = new Date(start + "T00:00:00Z");
  if (!Number.isFinite(first.getTime()) || first.toISOString().slice(0, 10) !== start) return [];
  let cursor = first.getTime();
  return durations.map((duration_days) => {
    const start_date = new Date(cursor).toISOString().slice(0, 10);
    const end_date = new Date(cursor + (duration_days - 1) * 86400000).toISOString().slice(0, 10);
    cursor += duration_days * 86400000;
    return { start_date, end_date, duration_days };
  });
}
