// Display helpers for the admin grid. Which days count, and every other rule, lives in SQL;
// the database refuses entries on days these helpers would show as non-working.

export const WEEKDAY_SHORT = ["", "Mo", "Di", "Mi", "Do", "Fr"] as const;
export const WEEKDAY_LONG = [
  "",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
] as const;
export const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

export interface DayColumn {
  key: string; // "2026-11-17"
  day: number; // 17
  weekday: 1 | 2 | 3 | 4 | 5;
  isFriday: boolean;
  isMonthStart: boolean; // first column of the month: the yellow line
  holiday: string | null;
  isToday: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** The month's Mon–Fri columns. `month` is 1–12. */
export function buildColumns(
  year: number,
  month: number,
  holidays: ReadonlyMap<string, string>,
  todayKey: string,
): DayColumn[] {
  const columns: DayColumn[] = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    const iso = ((new Date(Date.UTC(year, month - 1, d)).getUTCDay() + 6) % 7) + 1;
    if (iso > 5) continue;
    const key = dayKey(year, month, d);
    columns.push({
      key,
      day: d,
      weekday: iso as DayColumn["weekday"],
      isFriday: iso === 5,
      isMonthStart: columns.length === 0,
      holiday: holidays.get(key) ?? null,
      isToday: key === todayKey,
    });
  }
  return columns;
}

/** Whether the person works on that column's day (pattern and employment dates). */
export function worksOn(
  person: { workdays: number[]; startDate: string; endDate: string | null },
  column: Pick<DayColumn, "key" | "weekday">,
): boolean {
  if (column.key < person.startDate) return false;
  if (person.endDate && column.key > person.endDate) return false;
  return person.workdays.includes(column.weekday);
}

/** "2026-11" from the URL, falling back to the current month. */
export function parseMonth(param: string | undefined, todayKey: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(param ?? "");
  const year = m ? Number(m[1]) : Number(todayKey.slice(0, 4));
  const month = m ? Number(m[2]) : Number(todayKey.slice(5, 7));
  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    return { year: Number(todayKey.slice(0, 4)), month: Number(todayKey.slice(5, 7)) };
  }
  return { year, month };
}

export function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export const monthParam = (year: number, month: number) => `${year}-${pad(month)}`;

/** Today in Berlin as "YYYY-MM-DD". */
export function berlinToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

/** A stamp's slight tilt, stable per cell so it doesn't jump between renders. */
export function stampTilt(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 9) - 4; // −4° … +4°
}
