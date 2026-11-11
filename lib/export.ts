import ExcelJS from "exceljs";
import { buildColumns, MONTHS } from "@/lib/grid";
import { readAll } from "@/lib/supabase/read-all";
import { createServerClient } from "@/lib/supabase/server";

// The Excel export for payroll (R21). Approved days only.

export interface ExportPerson {
  id: string;
  name: string;
  team: string;
  workdays: number[];
  start: string;
  end: string | null;
}

export interface ExportDay {
  user_id: string;
  day: string;
  type: string;
  amount: number;
  half: "am" | "pm" | null;
}

export interface ExportBalance {
  user_id: string;
  allowance: number;
  carryover: number;
  carryover_expired: number;
  vacation_taken: number;
  vacation_pending: number;
  remaining: number;
  sick_days: number;
}

export interface ExportData {
  year: number;
  asOf: string;
  people: ExportPerson[];
  days: ExportDay[];
  holidays: Map<string, string>;
  types: Map<string, { letter: string; label: string; deducts: boolean; sick: boolean }>;
  balances: ExportBalance[];
}

export async function loadExport(year: number, asOf: string): Promise<ExportData> {
  const supabase = await createServerClient();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [people, teams, days, holidays, types, balances] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, team_id, workdays, start_date, end_date, sort")
      .lte("start_date", to)
      .or(`end_date.is.null,end_date.gte.${from}`)
      .order("sort")
      .order("full_name"),
    supabase.from("teams").select("id, name"),
    readAll<ExportDay>(
      supabase,
      "absence_days",
      ["user_id", "day"],
      "user_id, day, type, amount, half",
      (q) => q.eq("status", "approved").gte("day", from).lte("day", to),
    ),
    supabase.rpc("berlin_holidays", { y: year }),
    supabase.from("absence_types").select("code, letter, label, deducts_vacation"),
    supabase.rpc("balances", { p_year: year, p_as_of: asOf }),
  ]);
  const error = [people, teams, holidays, types, balances].find((r) => r.error)?.error;
  if (error) throw new Error(error.message);
  const teamName = new Map((teams.data ?? []).map((t) => [t.id, t.name]));
  return {
    year,
    asOf,
    people: (people.data ?? []).map((p) => ({
      id: p.id,
      name: p.full_name,
      team: teamName.get(p.team_id) ?? "",
      workdays: p.workdays,
      start: p.start_date,
      end: p.end_date,
    })),
    days,
    holidays: new Map(
      ((holidays.data ?? []) as { day: string; name: string }[]).map((h) => [h.day, h.name]),
    ),
    types: new Map(
      (types.data ?? []).map((t) => [
        t.code,
        {
          letter: t.letter,
          label: t.label,
          deducts: t.deducts_vacation,
          sick: t.code === "sick" || t.code === "child_sick",
        },
      ]),
    ),
    balances: (balances.data ?? []) as ExportBalance[],
  };
}

const HOLIDAY_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF8E4E2" },
};
const OFF_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9EDEC" } };
const WEEKDAY = ["", "Mo", "Di", "Mi", "Do", "Fr"];
const n = (v: unknown) => Number(v ?? 0);

export function exportWorkbook(data: ExportData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MVZ El-Sharafi";
  const byKey = new Map(data.days.map((d) => [`${d.user_id}|${d.day}`, d]));

  for (let month = 1; month <= 12; month++) {
    const columns = buildColumns(data.year, month, data.holidays, "");
    const first = columns[0]?.key ?? `${data.year}-${String(month).padStart(2, "0")}-01`;
    const last = columns.at(-1)?.key ?? first;
    const ws = wb.addWorksheet(MONTHS[month - 1], {
      views: [{ state: "frozen", xSplit: 2, ySplit: 2 }],
    });

    ws.addRow([
      "Name",
      "Gruppe",
      ...columns.map((c) => c.holiday ?? WEEKDAY[c.weekday]),
      "Krank",
      "Urlaub",
      "Sonstige",
    ]);
    ws.addRow(["", "", ...columns.map((c) => c.day), "", "", ""]);
    ws.getRow(1).font = { bold: true };
    ws.getRow(2).font = { bold: true };
    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 14;
    columns.forEach((c, i) => {
      ws.getColumn(i + 3).width = 5;
      ws.getColumn(i + 3).alignment = { horizontal: "center" };
      if (c.holiday) ws.getCell(1, i + 3).fill = HOLIDAY_FILL;
    });

    for (const p of data.people) {
      if (p.start > last || (p.end && p.end < first)) continue; // not employed this month
      let sick = 0;
      let vacation = 0;
      let other = 0;
      const cells = columns.map((c) => {
        const d = byKey.get(`${p.id}|${c.key}`);
        if (!d) return "";
        const t = data.types.get(d.type);
        const amount = n(d.amount);
        if (t?.sick) sick += amount;
        else if (t?.deducts) vacation += amount;
        else other += amount;
        return `${d.half ? "½" : ""}${t?.letter ?? d.type}`;
      });
      const row = ws.addRow([p.name, p.team, ...cells, sick, vacation, other]);
      columns.forEach((c, i) => {
        if (c.holiday) row.getCell(i + 3).fill = HOLIDAY_FILL;
        else if (!p.workdays.includes(c.weekday)) row.getCell(i + 3).fill = OFF_FILL;
      });
    }
  }

  const year = wb.addWorksheet("Jahr", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  year.addRow([
    "Name",
    "Anspruch",
    "Übertrag",
    "Übertrag verfallen",
    "Urlaub genommen",
    "Urlaub beantragt",
    "Resturlaub",
    "Krankheitstage",
  ]).font = { bold: true };
  year.getColumn(1).width = 26;
  for (let c = 2; c <= 8; c++) year.getColumn(c).width = 14;
  const balanceOf = new Map(data.balances.map((b) => [b.user_id, b]));
  for (const p of data.people) {
    const b = balanceOf.get(p.id);
    if (!b) continue;
    year.addRow([
      p.name,
      n(b.allowance),
      n(b.carryover),
      n(b.carryover_expired),
      n(b.vacation_taken),
      n(b.vacation_pending),
      n(b.remaining),
      n(b.sick_days),
    ]);
  }
  const [y, m, d] = data.asOf.split("-").map(Number);
  year.addRow([]);
  year.addRow([`Stand ${d}.${m}.${y}. Monatsblätter: nur genehmigte Tage. ½ = halber Tag.`]);
  return wb;
}
