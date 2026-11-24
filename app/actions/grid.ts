"use server";

import { sendAll } from "@/lib/mail";
import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export interface GridResult {
  error?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/;

function invalid(user: string, day: string) {
  return !UUID.test(user) || !DAY.test(day);
}

/** The grid click and the menu's type choice. `type` null removes the entry (R2). */
export async function setCell(
  user: string,
  day: string,
  type: string | null,
  half: "am" | "pm" | null,
): Promise<GridResult> {
  await requireUser("admin");
  if (invalid(user, day)) return { error: "Ungültiger Tag." };
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("set_absence", {
    p_user: user,
    p_day: day,
    p_type: type,
    p_half: half,
  });
  if (error) return { error: error.message };
  // The reception hears of a new or removed day (R18).
  await sendAll(data.emails);
  return {};
}

export async function saveNote(user: string, day: string, note: string): Promise<GridResult> {
  await requireUser("admin");
  if (invalid(user, day)) return { error: "Ungültiger Tag." };
  if (note.length > 500) return { error: "Die Notiz darf höchstens 500 Zeichen haben." };
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_note", { p_user: user, p_day: day, p_note: note });
  return error ? { error: error.message } : {};
}

/** "AU liegt vor": applies to the whole sick run that contains the day (R17). */
export async function setAu(
  user: string,
  day: string,
  received: boolean,
): Promise<GridResult & { days?: number }> {
  await requireUser("admin");
  if (invalid(user, day)) return { error: "Ungültiger Tag." };
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("set_au", {
    p_user: user,
    p_day: day,
    p_received: received,
  });
  return error ? { error: error.message } : { days: Number(data) };
}

/** The dates behind an X or U count in the name column. */
export async function listDays(
  user: string,
  year: number,
  kind: "sick" | "vacation",
): Promise<GridResult & { days?: string[] }> {
  await requireUser("admin");
  if (!UUID.test(user) || !Number.isInteger(year)) return { error: "Ungültige Anfrage." };
  const supabase = await createServerClient();
  // Same groups as the counts in balance_of: X = sick + child sick, U = types that deduct vacation.
  let codes = ["sick", "child_sick"];
  if (kind === "vacation") {
    const { data: types } = await supabase
      .from("absence_types")
      .select("code")
      .eq("deducts_vacation", true);
    codes = (types ?? []).map((t) => t.code);
  }
  const { data, error } = await supabase
    .from("absence_days")
    .select("day")
    .eq("user_id", user)
    .eq("status", "approved")
    .in("type", codes)
    .gte("day", `${year}-01-01`)
    .lte("day", `${year}-12-31`)
    .order("day");
  if (error) return { error: error.message };
  return { days: (data ?? []).map((d) => d.day) };
}
