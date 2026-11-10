import { parseBalance, type MyRequest, type TypeInfo } from "@/lib/me-data";
import { createServerClient } from "@/lib/supabase/server";

export interface PendingRequest {
  id: string;
  userId: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  note: string | null;
  substitute: string | null;
  createdAt: string;
  /** Vacation left once this request is approved; null for types that don't deduct. */
  remainingAfter: number | null;
  conflicts: { name: string; type: string; status: string; days: string[] }[];
  overLimit: { day: string; absent: number; max: number }[];
  typeLimit: { used: number; limit: number; from: string; to: string } | null;
}

export interface MissingAuRun {
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  missing: number;
}

export interface ApprovalsData {
  requests: PendingRequest[];
  missingAu: MissingAuRun[];
  types: Record<string, TypeInfo>;
  auTracking: boolean;
}

async function loadTypes(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data, error } = await supabase
    .from("absence_types")
    .select("code, letter, label, color, deducts_vacation");
  if (error) throw new Error(error.message);
  return Object.fromEntries(
    (data ?? []).map((t) => [
      t.code,
      { letter: t.letter, label: t.label, color: t.color, deductsVacation: t.deducts_vacation },
    ]),
  ) as Record<string, TypeInfo>;
}

/** "Offene Anträge" and "AU fehlt" for the admin (R9, R10, R17, R25). */
export async function loadApprovals(): Promise<ApprovalsData> {
  const supabase = await createServerClient();
  const [requests, conflicts, overLimit, limits, missing, settings, types] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, user_id, type, start_date, end_date, note, substitute_id, created_at")
      .eq("status", "pending")
      .order("start_date"),
    supabase.rpc("request_conflicts"),
    supabase.rpc("request_over_limit"),
    supabase.rpc("request_limit_warnings"),
    supabase.rpc("missing_au"),
    supabase.from("app_settings").select("au_tracking").single(),
    loadTypes(supabase),
  ]);
  const firstError = [requests, conflicts, overLimit, limits, missing, settings]
    .map((r) => r.error)
    .find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const rows = requests.data ?? [];
  const ids = rows.map((r) => r.id);
  const people = [...new Set(rows.flatMap((r) => [r.user_id, r.substitute_id]).filter(Boolean))];
  const [{ data: profiles }, { data: days }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", people as string[]),
    supabase.from("absence_days").select("request_id, amount").in("request_id", ids),
  ]);
  const name = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const amount = new Map<string, number>();
  for (const d of days ?? []) {
    amount.set(d.request_id, (amount.get(d.request_id) ?? 0) + Number(d.amount));
  }

  // One balance per person and year, for "Danach bleiben …".
  const balanceKeys = [
    ...new Set(
      rows
        .filter((r) => types[r.type]?.deductsVacation)
        .map((r) => `${r.user_id}|${r.start_date.slice(0, 4)}`),
    ),
  ];
  const balances = new Map<string, number>();
  await Promise.all(
    balanceKeys.map(async (key) => {
      const [user, year] = key.split("|");
      const { data, error } = await supabase
        .rpc("balance_of", { p_user: user, p_year: Number(year) })
        .single();
      if (error) throw new Error(error.message);
      balances.set(key, parseBalance(data).remaining);
    }),
  );

  const conflictRows = (conflicts.data ?? []) as {
    request_id: string;
    full_name: string;
    type: string;
    status: string;
    days: string[];
  }[];
  const overRows = (overLimit.data ?? []) as {
    request_id: string;
    day: string;
    absent_count: number;
    max_absent: number;
  }[];
  const limitRows = (limits.data ?? []) as {
    request_id: string;
    used: number;
    limit_days: number;
    window_start: string;
    window_end: string;
  }[];

  return {
    requests: rows.map((r) => {
      const days = amount.get(r.id) ?? 0;
      const remaining = balances.get(`${r.user_id}|${r.start_date.slice(0, 4)}`);
      const limit = limitRows.find((l) => l.request_id === r.id);
      return {
        id: r.id,
        userId: r.user_id,
        name: name.get(r.user_id) ?? "",
        type: r.type,
        startDate: r.start_date,
        endDate: r.end_date,
        days,
        note: r.note,
        substitute: r.substitute_id ? (name.get(r.substitute_id) ?? null) : null,
        createdAt: r.created_at,
        remainingAfter: remaining === undefined ? null : remaining - days,
        conflicts: conflictRows
          .filter((c) => c.request_id === r.id)
          .map((c) => ({ name: c.full_name, type: c.type, status: c.status, days: c.days })),
        overLimit: overRows
          .filter((o) => o.request_id === r.id)
          .map((o) => ({ day: o.day, absent: o.absent_count, max: o.max_absent })),
        typeLimit: limit
          ? {
              used: Number(limit.used),
              limit: Number(limit.limit_days),
              from: limit.window_start,
              to: limit.window_end,
            }
          : null,
      };
    }),
    missingAu: (
      (missing.data ?? []) as {
        user_id: string;
        full_name: string;
        start_date: string;
        end_date: string;
        missing: number;
      }[]
    ).map((m) => ({
      userId: m.user_id,
      name: m.full_name,
      startDate: m.start_date,
      endDate: m.end_date,
      missing: m.missing,
    })),
    types,
    auTracking: settings.data!.au_tracking,
  };
}

/** One person's requests for a year, for the admin's person view. */
export async function loadPersonRequests(
  userId: string,
  year: number,
): Promise<{ requests: MyRequest[]; types: Record<string, TypeInfo> }> {
  const supabase = await createServerClient();
  const [{ data, error }, types] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, type, start_date, end_date, status, decision_note, substitute_id")
      .eq("user_id", userId)
      .gte("end_date", `${year}-01-01`)
      .lte("start_date", `${year}-12-31`)
      .order("start_date", { ascending: false }),
    loadTypes(supabase),
  ]);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const subs = rows.map((r) => r.substitute_id).filter(Boolean) as string[];
  const [{ data: profiles }, { data: days }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", subs),
    supabase
      .from("absence_days")
      .select("request_id, amount")
      .in(
        "request_id",
        rows.map((r) => r.id),
      ),
  ]);
  const name = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const amount = new Map<string, number>();
  for (const d of days ?? []) {
    amount.set(d.request_id, (amount.get(d.request_id) ?? 0) + Number(d.amount));
  }
  return {
    types,
    requests: rows.map((r) => ({
      id: r.id,
      type: r.type,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      days: amount.get(r.id) ?? 0,
      decisionNote: r.decision_note,
      substitute: r.substitute_id ? (name.get(r.substitute_id) ?? null) : null,
    })),
  };
}
