"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export interface Skipped {
  name: string;
  type: string;
  days: string[];
}

export interface ClosureState {
  error?: string;
  ok?: string;
  skipped?: Skipped[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "Schließung eintragen" (R16): B days for everyone, safe to repeat. */
export async function createClosure(_prev: ClosureState, form: FormData): Promise<ClosureState> {
  await requireUser("admin");
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  const note = String(form.get("note") ?? "").trim();
  if (!DAY.test(from) || !DAY.test(to))
    return { error: "Wählen Sie den ersten und den letzten Tag." };
  if (note.length > 200) return { error: "Die Notiz darf höchstens 200 Zeichen haben." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("set_closure", {
    a: from,
    b: to,
    p_note: note || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");

  const conflicts = data.conflicts as { full_name: string; day: string; type: string }[];
  const byPerson = new Map<string, Skipped>();
  for (const c of conflicts) {
    const key = `${c.full_name}|${c.type}`;
    const s = byPerson.get(key) ?? { name: c.full_name, type: c.type, days: [] };
    s.days.push(c.day);
    byPerson.set(key, s);
  }
  const days = Number(data.closure_days);
  const added = Number(data.added);
  return {
    ok: `Eingetragen: ${days} ${days === 1 ? "Schließtag" : "Schließtage"}, ${added} neue Einträge.`,
    skipped: [...byPerson.values()],
  };
}

/** "Entfernen": removes the closure and its B days (not days from requests). */
export async function removeClosure(from: string, to: string): Promise<ClosureState> {
  await requireUser("admin");
  if (!DAY.test(from) || !DAY.test(to)) return { error: "Ungültiger Zeitraum." };
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("remove_closure", { a: from, b: to });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: `Entfernt, ${data.removed} Einträge gelöscht.` };
}
