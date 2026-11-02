const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC",
});
const dayMs = 86_400_000;

export function persianParts(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = formatter.formatToParts(date);
  const part = (name: string) => Number(parts.find(item => item.type === name)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** Convert with the same ICU calendar used for display, including leap years. */
export function persianToIso(year: number, month: number, day: number): string | null {
  if (![year, month, day].every(Number.isInteger) || year < 1 || year > 9376 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  let low = Math.floor(Date.UTC(year + 621, 0, 1) / dayMs);
  let high = Math.floor(Date.UTC(year + 623, 0, 1) / dayMs);
  const target = year * 10000 + month * 100 + day;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const iso = new Date(middle * dayMs).toISOString().slice(0, 10);
    const parts = persianParts(iso)!;
    const value = parts.year * 10000 + parts.month * 100 + parts.day;
    if (value === target) return iso;
    if (value < target) low = middle + 1;
    else high = middle - 1;
  }
  return null;
}

export function persianMonthDays(year: number, month: number) {
  const start = persianToIso(year, month, 1)!;
  const next = persianToIso(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1)!;
  return Math.round((Date.parse(next) - Date.parse(start)) / dayMs);
}
