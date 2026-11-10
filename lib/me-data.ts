import { buildColumns, dayKey, type DayColumn } from "@/lib/grid";
import { createServerClient } from "@/lib/supabase/server";

export interface MyEntry {
  type: string;
  status: "pending" | "approved";
  half: "am" | "pm" | null;
}

export interface MyRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "denied" | "cancelled";
  days: number;
  decisionNote: string | null;
  substitute: string | null;
}

export interface MyBalance {
  allowance: number;
  carryover: number;
  carryoverUsed: number;
  carryoverExpired: number;
  taken: number;
  pending: number;
  remaining: number; // without pending requests
  available: number; // after pending requests
  sick: number;
  byType: Record<string, number>;
}

export type TypeInfo = { letter: string; label: string; color: string; deductsVacation: boolean };

export interface MeData {
  year: number;
  columns: DayColumn[];
  profile: { workdays: number[]; startDate: string; endDate: string | null; teamName: string };
  entries: Record<string, MyEntry>; // by day
  balance: MyBalance;
  hasAllowance: boolean;
  requests: MyRequest[];
  types: Record<string, TypeInfo>;
  requestTypes: string[];
  reportTypes: string[];
  settings: { halfDays: boolean; substitutes: boolean; teamCalendar: boolean; auTracking: boolean };
  /** Colleagues from the same group; empty when the team calendar is switched off (R11). */
  team: { id: string; name: string; workdays: number[]; absent: string[] }[];
}

/** One month of the signed-in employee's own page, read as that employee (RLS applies). */
export async function loadMeData(
  userId: string,
  year: number,
  month: number,
  today: string,
): Promise<MeData> {
  const supabase = await createServerClient();
  const from = dayKey(year, month, 1);
  const to = dayKey(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());

  const [holidays, profile, days, balance, allowance, requests, types, settings, members, team] =
    await Promise.all([
      supabase.rpc("berlin_holidays", { y: year }),
      supabase
        .from("profiles")
        .select("workdays, start_date, end_date, teams(name)")
        .eq("id", userId)
        .single(),
      supabase
        .from("absence_days")
        .select("day, type, status, half, amount, request_id")
        .eq("user_id", userId)
        .gte("day", `${year}-01-01`)
        .lte("day", `${year}-12-31`),
      supabase.rpc("balance_of", { p_user: userId, p_year: year, p_as_of: today }).single(),
      supabase
        .from("leave_allowances")
        .select("days")
        .eq("user_id", userId)
        .eq("year", year)
        .maybeSingle(),
      supabase
        .from("leave_requests")
        .select("id, type, start_date, end_date, status, decision_note, substitute_id")
        .eq("user_id", userId)
        .gte("end_date", `${year}-01-01`)
        .lte("start_date", `${year}-12-31`)
        .order("start_date", { ascending: false }),
      supabase
        .from("absence_types")
        .select("code, letter, label, color, entry_mode, visible, deducts_vacation, sort")
        .order("sort"),
      supabase
        .from("app_settings")
        .select("half_days, substitutes, team_calendar, au_tracking")
        .single(),
      supabase.rpc("team_members"),
      supabase.rpc("team_calendar", { a: from, b: to }),
    ]);

  const firstError = [
    holidays,
    profile,
    days,
    balance,
    allowance,
    requests,
    types,
    settings,
    members,
    team,
  ]
    .map((r) => r.error)
    .find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const holidayMap = new Map<string, string>(
    (holidays.data as { day: string; name: string }[]).map((h) => [h.day, h.name]),
  );

  const entries: Record<string, MyEntry> = {};
  const amountByRequest: Record<string, number> = {};
  for (const d of days.data ?? []) {
    if (d.day >= from && d.day <= to) {
      entries[d.day] = { type: d.type, status: d.status, half: d.half };
    }
    if (d.request_id) {
      amountByRequest[d.request_id] = (amountByRequest[d.request_id] ?? 0) + Number(d.amount);
    }
  }

  const memberRows = (members.data ?? []) as {
    user_id: string;
    full_name: string;
    workdays: number[];
  }[];
  const names = new Map(memberRows.map((m) => [m.user_id, m.full_name]));
  const absentBy = new Map<string, string[]>();
  for (const row of (team.data ?? []) as { user_id: string; day: string }[]) {
    absentBy.set(row.user_id, [...(absentBy.get(row.user_id) ?? []), row.day]);
  }

  const typeRows = types.data ?? [];
  const s = settings.data!;
  const p = profile.data!;

  return {
    year,
    columns: buildColumns(year, month, holidayMap, today),
    profile: {
      workdays: p.workdays,
      startDate: p.start_date,
      endDate: p.end_date,
      teamName: (p.teams as unknown as { name: string } | null)?.name ?? "",
    },
    entries,
    balance: parseBalance(balance.data),
    hasAllowance: !!allowance.data,
    requests: (requests.data ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      days: amountByRequest[r.id] ?? 0,
      decisionNote: r.decision_note,
      substitute: r.substitute_id ? (names.get(r.substitute_id) ?? null) : null,
    })),
    types: Object.fromEntries(
      typeRows.map((t) => [
        t.code,
        { letter: t.letter, label: t.label, color: t.color, deductsVacation: t.deducts_vacation },
      ]),
    ),
    requestTypes: typeRows
      .filter((t) => t.visible && t.entry_mode === "request")
      .map((t) => t.code),
    reportTypes: typeRows.filter((t) => t.visible && t.entry_mode === "report").map((t) => t.code),
    settings: {
      halfDays: s.half_days,
      substitutes: s.substitutes,
      teamCalendar: s.team_calendar,
      auTracking: s.au_tracking,
    },
    team: memberRows.map((m) => ({
      id: m.user_id,
      name: m.full_name,
      workdays: m.workdays,
      absent: absentBy.get(m.user_id) ?? [],
    })),
  };
}

/** The row from balance_of() as numbers. */
export function parseBalance(row: unknown): MyBalance {
  const b = (row ?? {}) as Record<string, number | Record<string, number>>;
  const n = (k: string) => Number(b[k] ?? 0);
  return {
    allowance: n("allowance"),
    carryover: n("carryover"),
    carryoverUsed: n("carryover_used"),
    carryoverExpired: n("carryover_expired"),
    taken: n("vacation_taken"),
    pending: n("vacation_pending"),
    remaining: n("remaining"),
    available: n("available"),
    sick: n("sick_days"),
    byType: Object.fromEntries(
      Object.entries((b.by_type ?? {}) as Record<string, number>).map(([k, v]) => [k, Number(v)]),
    ),
  };
}
