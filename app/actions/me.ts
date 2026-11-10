"use server";

import { revalidatePath } from "next/cache";
import { formatDays } from "@/lib/dates";
import { sendAll } from "@/lib/mail";
import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export interface MeActionState {
  error?: string;
  ok?: string;
  /** Changes on every success, so the form can close itself. */
  done?: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/;

function dates(form: FormData) {
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  if (!DAY.test(from) || !DAY.test(to)) return null;
  return { from, to };
}

function note(form: FormData) {
  const text = String(form.get("note") ?? "").trim();
  return text.length > 500 ? null : text;
}

/** "Urlaub beantragen" (R7). The database checks days, overlaps and the balance. */
export async function requestLeave(_prev: MeActionState, form: FormData): Promise<MeActionState> {
  await requireUser();
  const range = dates(form);
  if (!range) return { error: "Wählen Sie den ersten und den letzten Tag." };
  const text = note(form);
  if (text === null) return { error: "Die Notiz darf höchstens 500 Zeichen haben." };
  const substitute = String(form.get("substitute") ?? "");

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("request_leave", {
    p_type: String(form.get("type") ?? ""),
    p_from: range.from,
    p_to: range.to,
    p_start_half: form.get("startHalf") ? "pm" : null,
    p_end_half: form.get("endHalf") ? "am" : null,
    p_substitute: UUID.test(substitute) ? substitute : null,
    p_note: text || null,
  });
  if (error) return { error: error.message };
  await sendAll(data.emails);
  revalidatePath("/me");
  return {
    ok: `Beantragt: ${formatDays(Number(data.days))} ${Number(data.days) === 1 ? "Arbeitstag" : "Arbeitstage"}. Die Praxisleitung wurde benachrichtigt.`,
    done: Date.now(),
  };
}

/** "Krank melden" (R8): recorded straight away, the admins are told. */
export async function reportSick(_prev: MeActionState, form: FormData): Promise<MeActionState> {
  await requireUser();
  const range = dates(form);
  if (!range) return { error: "Wählen Sie den ersten Tag und den voraussichtlich letzten Tag." };
  const text = note(form);
  if (text === null) return { error: "Die Notiz darf höchstens 500 Zeichen haben." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("report_absence", {
    p_type: String(form.get("type") ?? ""),
    p_from: range.from,
    p_to: range.to,
    p_note: text || null,
  });
  if (error) return { error: error.message };
  await sendAll(data.emails);
  revalidatePath("/me");
  const skipped = (data.skipped as string[]).length;
  return {
    ok: `Krank gemeldet. Gute Besserung.${skipped ? ` ${skipped} Tag(e) hatten schon einen Eintrag und wurden übersprungen.` : ""}`,
    done: Date.now(),
  };
}

/** "Antrag zurückziehen" while it is still pending (R9). */
export async function withdrawRequest(id: string): Promise<MeActionState> {
  await requireUser();
  if (!UUID.test(id)) return { error: "Antrag nicht gefunden." };
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("cancel_leave", { p_id: id });
  if (error) return { error: error.message };
  await sendAll(data.emails);
  revalidatePath("/me");
  return { ok: "Antrag zurückgezogen." };
}
