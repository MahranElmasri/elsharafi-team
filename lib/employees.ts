/** Server-side parsing of the employee form. Rules about people live in SQL. */
// Exception: fullYearAllowance, the profile's live full-year suggestion (R13).

export type Role = "admin" | "employee";
export const TEAMS = ["arbeiter", "aerzte", "verwaltung"] as const;
export type TeamId = (typeof TEAMS)[number];
export const WEEKDAYS = [
  { n: 1, short: "Mo" },
  { n: 2, short: "Di" },
  { n: 3, short: "Mi" },
  { n: 4, short: "Do" },
  { n: 5, short: "Fr" },
] as const;

export interface EmployeeInput {
  username: string;
  fullName: string;
  email: string | null;
  team: TeamId;
  role: Role;
  workdays: number[];
  startDate: string;
  endDate: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseEmployeeForm(
  form: FormData,
): { ok: true; value: EmployeeInput } | { ok: false; error: string } {
  const text = (k: string) => String(form.get(k) ?? "").trim();
  const username = text("username").toLowerCase();
  const fullName = text("fullName");
  const email = text("email").toLowerCase() || null;
  const team = text("team") as TeamId;
  const role: Role = text("role") === "admin" ? "admin" : "employee";
  const workdays = form
    .getAll("workdays")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 5);
  const startDate = text("startDate");
  const endDate = text("endDate") || null;

  if (!fullName) return { ok: false, error: "Bitte geben Sie den Namen ein." };
  if (!username) return { ok: false, error: "Bitte geben Sie einen Benutzernamen ein." };
  if (!TEAMS.includes(team)) return { ok: false, error: "Bitte wählen Sie eine Gruppe." };
  if (workdays.length === 0) return { ok: false, error: "Wählen Sie mindestens einen Arbeitstag." };
  if (!DATE.test(startDate)) return { ok: false, error: "Bitte geben Sie das Eintrittsdatum ein." };
  if (endDate && !DATE.test(endDate))
    return { ok: false, error: "Das Austrittsdatum ist ungültig." };
  if (endDate && endDate < startDate) {
    return { ok: false, error: "Das Austrittsdatum liegt vor dem Eintrittsdatum." };
  }
  return {
    ok: true,
    value: {
      username,
      fullName,
      email,
      team,
      role,
      workdays: [...new Set(workdays)].sort(),
      startDate,
      endDate,
    },
  };
}

/** The Auth email: the real one, or an internal address that never receives mail. */
export function authEmail(username: string, email: string | null): string {
  return email ?? `${username}@users.mvz-elsharafi.invalid`;
}

/** Days as entered in a German form: "27,5" or "27.5"; whole or half days. */
export function parseDays(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d{1,2}(\.\d)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n * 2) ? n : null;
}

/** Full-time vacation days at the practice (the profile's live suggestion). */
export const FULL_TIME_DAYS = 30;

/** Full-year allowance (R13): 30 × working days per week ÷ 5. */
export function fullYearAllowance(workdayCount: number): number {
  return (FULL_TIME_DAYS * workdayCount) / 5;
}
