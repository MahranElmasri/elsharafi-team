import type { GridData, GridEntry, GridPerson } from "@/components/AttendanceGrid";
import { berlinToday, buildColumns, dayKey } from "@/lib/grid";
import { createServerClient } from "@/lib/supabase/server";

/** Everything the admin grid shows for one month, read as the signed-in admin (RLS applies). */
export async function loadGridData(year: number, month: number): Promise<GridData> {
  const supabase = await createServerClient();
  const from = dayKey(year, month, 1);
  const to = dayKey(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());

  const [holidays, profiles, days, types, notes, missing, balances, teams, load, settings] =
    await Promise.all([
      supabase.rpc("berlin_holidays", { y: year }),
      supabase
        .from("profiles")
        .select("id, full_name, team_id, active, workdays, start_date, end_date, sort")
        .lte("start_date", to)
        .order("sort")
        .order("full_name"),
      supabase
        .from("absence_days")
        .select("user_id, day, type, status, half, au_received, request_id")
        .gte("day", from)
        .lte("day", to),
      supabase
        .from("absence_types")
        .select("code, letter, label, color, visible, sort")
        .order("sort"),
      supabase.from("day_notes").select("user_id, day, note").gte("day", from).lte("day", to),
      supabase.rpc("missing_au"),
      supabase.rpc("balances", { p_year: year }),
      supabase.from("teams").select("id, name, sort, max_absent").order("sort"),
      supabase.rpc("team_day_load", { a: from, b: to }),
      supabase.from("app_settings").select("half_days, au_tracking").single(),
    ]);

  const firstError = [
    holidays,
    profiles,
    days,
    types,
    notes,
    missing,
    balances,
    teams,
    load,
    settings,
  ]
    .map((r) => r.error)
    .find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const holidayMap = new Map<string, string>(
    (holidays.data as { day: string; name: string }[]).map((h) => [h.day, h.name]),
  );

  const entries: Record<string, GridEntry> = {};
  const withEntries = new Set<string>();
  for (const d of days.data ?? []) {
    entries[`${d.user_id}|${d.day}`] = {
      type: d.type,
      status: d.status,
      half: d.half,
      auReceived: d.au_received,
      requestId: d.request_id,
    };
    withEntries.add(d.user_id);
  }

  // Sick days of a run longer than 3 days that still lack an AU.
  const auMissing: string[] = [];
  type Run = { user_id: string; start_date: string; end_date: string };
  for (const run of (missing.data ?? []) as Run[]) {
    for (const d of days.data ?? []) {
      const inRun = d.user_id === run.user_id && d.day >= run.start_date && d.day <= run.end_date;
      if (inRun && !d.au_received) {
        auMissing.push(`${d.user_id}|${d.day}`);
      }
    }
  }
  type Balance = {
    user_id: string;
    allowance: number;
    carryover: number;
    sick_days: number;
    vacation_taken: number;
    remaining: number;
    vacation_pending: number;
  };
  const balanceOf = new Map(((balances.data ?? []) as Balance[]).map((b) => [b.user_id, b]));
  const teamOrder = new Map((teams.data ?? []).map((t) => [t.id, t.sort]));

  const people: GridPerson[] = (profiles.data ?? [])
    // Former staff appear only in months where they worked or have entries.
    .filter((p) => (p.active && (!p.end_date || p.end_date >= from)) || withEntries.has(p.id))
    .sort((a, b) => (teamOrder.get(a.team_id) ?? 0) - (teamOrder.get(b.team_id) ?? 0))
    .map((p) => {
      const b = balanceOf.get(p.id);
      return {
        id: p.id,
        name: p.full_name,
        teamId: p.team_id,
        active: p.active,
        workdays: p.workdays,
        startDate: p.start_date,
        endDate: p.end_date,
        sick: Number(b?.sick_days ?? 0),
        taken: Number(b?.vacation_taken ?? 0),
        remaining: Number(b?.remaining ?? 0),
        pending: Number(b?.vacation_pending ?? 0),
        hasAllowance: Number(b?.allowance ?? 0) + Number(b?.carryover ?? 0) > 0,
      };
    });

  type Load = { team_id: string; day: string; absent_count: number };
  return {
    columns: buildColumns(year, month, holidayMap, berlinToday()),
    people,
    entries,
    notes: Object.fromEntries((notes.data ?? []).map((n) => [`${n.user_id}|${n.day}`, n.note])),
    auMissing,
    types: Object.fromEntries(
      (types.data ?? []).map((t) => [t.code, { letter: t.letter, label: t.label, color: t.color }]),
    ),
    menuTypes: (types.data ?? []).filter((t) => t.visible).map((t) => t.code),
    teams: (teams.data ?? []).map((t) => ({ id: t.id, name: t.name, maxAbsent: t.max_absent })),
    load: Object.fromEntries(
      ((load.data ?? []) as Load[]).map((l) => [`${l.team_id}|${l.day}`, l.absent_count]),
    ),
    year,
    settings: { halfDays: settings.data!.half_days, auTracking: settings.data!.au_tracking },
  };
}
