"use server";

import { revalidatePath } from "next/cache";
import { sendAll } from "@/lib/mail";
import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export interface DecisionResult {
  error?: string;
  ok?: string;
}

const UUID = /^[0-9a-f-]{36}$/;

function cleanNote(note: string) {
  const text = note.trim();
  return text.length > 500 ? null : text;
}

/** "Genehmigen" / "Ablehnen" (R9). The database re-checks the balance on approval. */
export async function decideRequest(
  id: string,
  approve: boolean,
  note: string,
): Promise<DecisionResult> {
  await requireUser("admin");
  if (!UUID.test(id)) return { error: "Antrag nicht gefunden." };
  const text = cleanNote(note);
  if (text === null) return { error: "Die Nachricht darf höchstens 500 Zeichen haben." };
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("decide_leave", {
    p_id: id,
    p_approve: approve,
    p_note: text || null,
  });
  if (error) return { error: error.message };
  await sendAll(data.emails);
  revalidatePath("/admin", "layout");
  return { ok: approve ? "Genehmigt." : "Abgelehnt." };
}

/** "Stornieren": the admin cancels a pending or approved request (R9). */
export async function cancelRequest(id: string, note: string): Promise<DecisionResult> {
  await requireUser("admin");
  if (!UUID.test(id)) return { error: "Antrag nicht gefunden." };
  const text = cleanNote(note);
  if (text === null) return { error: "Die Nachricht darf höchstens 500 Zeichen haben." };
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("cancel_leave", { p_id: id, p_note: text || null });
  if (error) return { error: error.message };
  await sendAll(data.emails);
  revalidatePath("/admin", "layout");
  return { ok: "Storniert." };
}
