"use server";

import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/audit";
import { groupDays } from "@/lib/grid";
import { sendAll } from "@/lib/mail";
import { SWITCHES, TYPE_COLORS, codeFromLabel, type Settings } from "@/lib/settings";
import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  ok?: string;
  warning?: string;
  done?: number;
}

const UUID = /^[0-9a-f-]{36}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[a-z_]{2,32}$/;

/** One feature switch on or off (R24). No data is deleted. */
export async function setSwitch(key: keyof Settings, on: boolean): Promise<FormState> {
  await requireUser("admin");
  const sw = SWITCHES.find((s) => s.key === key);
  if (!sw || typeof on !== "boolean") return { error: "Unbekannte Einstellung." };
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ [sw.column]: on })
    .eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: `${sw.label} ist ${on ? "eingeschaltet" : "ausgeschaltet"}.` };
}

/** Add or edit an absence type (R25). An empty `code` means a new type. */
export async function saveType(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser("admin");
  const supabase = await createServerClient();
  const label = String(form.get("label") ?? "").trim();
  const letter = String(form.get("letter") ?? "").trim();
  const color = String(form.get("color") ?? "");
  const entryMode = String(form.get("entry_mode") ?? "request");
  const limitDays = String(form.get("limit_days") ?? "").trim();
  const limitYears = String(form.get("limit_years") ?? "").trim();
  const sort = Number(form.get("sort") || 100);
  if (!label || label.length > 60)
    return { error: "Geben Sie eine Bezeichnung mit höchstens 60 Zeichen ein." };
  if (letter.length < 1 || letter.length > 2)
    return { error: "Das Zeichen hat 1 oder 2 Buchstaben." };
  if (!TYPE_COLORS.some((c) => c.value === color)) return { error: "Wählen Sie eine Farbe." };
  if (!["request", "report", "admin"].includes(entryMode))
    return { error: "Ungültige Eingabeart." };
  if (!Number.isInteger(sort) || sort < 0 || sort > 999)
    return { error: "Reihenfolge: eine Zahl von 0 bis 999." };
  if ((limitDays === "") !== (limitYears === "")) {
    return { error: "Für eine Grenze geben Sie Tage und Zeitraum an, sonst beides leer lassen." };
  }
  const days = limitDays === "" ? null : Number(limitDays.replace(",", "."));
  if (days !== null && !(days > 0 && days < 1000)) return { error: "Grenze: mehr als 0 Tage." };
  if (limitYears !== "" && !["1", "2"].includes(limitYears))
    return { error: "Zeitraum: 1 oder 2 Jahre." };

  let code = String(form.get("code") ?? "");
  const { data: existing, error: listError } = await supabase
    .from("absence_types")
    .select("code, visible");
  if (listError) return { error: listError.message };
  const codes = (existing ?? []).map((t) => t.code as string);
  // Visibility of an existing type is changed only by its switch (setTypeVisible).
  let visible = form.get("visible") === "on";
  if (code) {
    const current = existing?.find((t) => t.code === code);
    if (!CODE.test(code) || !current) return { error: "Unbekannte Abwesenheitsart." };
    visible = current.visible as boolean;
  } else {
    code = codeFromLabel(label, codes); // never an existing code, so nothing is overwritten
  }

  const { error } = await supabase.rpc("save_absence_type", {
    p_code: code,
    p_letter: letter,
    p_label: label,
    p_color: color,
    p_entry_mode: entryMode,
    p_deducts_vacation: form.get("deducts_vacation") === "on",
    p_is_health: form.get("is_health") === "on",
    p_limit_days: days,
    p_limit_years: limitYears === "" ? null : Number(limitYears),
    p_visible: visible,
    p_sort: sort,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: `„${label}“ gespeichert.`, done: Date.now() };
}

/** Show or hide one non-fixed type from its switch (R25). Every other field stays as stored. */
export async function setTypeVisible(code: string, visible: boolean): Promise<FormState> {
  await requireUser("admin");
  if (!CODE.test(code) || typeof visible !== "boolean")
    return { error: "Unbekannte Abwesenheitsart." };
  const supabase = await createServerClient();
  const { data: t, error: readError } = await supabase
    .from("absence_types")
    .select(
      "code, letter, label, color, entry_mode, deducts_vacation, is_health, limit_days, limit_years, is_fixed, sort",
    )
    .eq("code", code)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!t) return { error: "Unbekannte Abwesenheitsart." };
  if (t.is_fixed) return { error: "Feste Arten bleiben immer sichtbar." };
  const { error } = await supabase.rpc("save_absence_type", {
    p_code: t.code,
    p_letter: t.letter,
    p_label: t.label,
    p_color: t.color,
    p_entry_mode: t.entry_mode,
    p_deducts_vacation: t.deducts_vacation,
    p_is_health: t.is_health,
    p_limit_days: t.limit_days,
    p_limit_years: t.limit_years,
    p_visible: visible,
    p_sort: t.sort,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: `„${t.label}“ ist ${visible ? "sichtbar" : "ausgeblendet"}.` };
}

/** Delete a type that was never used (R25). The database refuses used ones. */
export async function deleteType(code: string): Promise<FormState> {
  await requireUser("admin");
  if (!CODE.test(code)) return { error: "Unbekannte Abwesenheitsart." };
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("delete_absence_type", { p_code: code });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Gelöscht." };
}

/** Enter or remove one type for a date range for one person (R26). */
export async function rangeEntry(
  user: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  await requireUser("admin");
  const type = String(form.get("type") ?? "");
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  const remove = form.get("intent") === "remove";
  if (!UUID.test(user) || !CODE.test(type)) return { error: "Wählen Sie eine Art." };
  if (!DAY.test(from) || !DAY.test(to))
    return { error: "Wählen Sie den ersten und den letzten Tag." };

  const supabase = await createServerClient();
  const { data: t } = await supabase
    .from("absence_types")
    .select("label")
    .eq("code", type)
    .maybeSingle();
  const label = t?.label ?? type;
  const range = `${formatDate(from)}–${formatDate(to)}`;
  revalidatePath("/admin", "layout");

  if (remove) {
    const { data, error } = await supabase.rpc("clear_absence_range", {
      p_user: user,
      a: from,
      b: to,
      p_type: type,
    });
    if (error) return { error: error.message };
    await sendAll(data.emails);
    const removed = Number(data.removed);
    return { ok: `${label} ${range}: ${removed} ${removed === 1 ? "Tag" : "Tage"} entfernt.` };
  }

  const { data, error } = await supabase.rpc("set_absence_range", {
    p_user: user,
    a: from,
    b: to,
    p_type: type,
  });
  if (error) return { error: error.message };
  await sendAll(data.emails);
  const skipped = data.skipped as string[];
  let ok = `${label} ${range}: ${data.added} ${data.added === 1 ? "Tag" : "Tage"} eingetragen.`;
  if (skipped.length)
    ok += ` Übersprungen, weil schon etwas eingetragen ist: ${groupDays(skipped)}`;

  // Limits only warn (R25).
  const { data: usage } = await supabase.rpc("type_usage", {
    p_user: user,
    p_type: type,
    p_as_of: to,
  });
  const u = (usage as { used: number; limit_days: number }[] | null)?.[0];
  const warning =
    u && Number(u.used) > Number(u.limit_days)
      ? `Grenze überschritten: ${Number(u.used).toLocaleString("de-DE")} von ${Number(u.limit_days).toLocaleString("de-DE")} Tagen genutzt.`
      : undefined;
  return { ok, warning };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Add an extra email recipient for request and sick-report notices (R18). */
export async function addRecipient(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser("admin");
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    return { error: "Bitte eine gültige E-Mail-Adresse eingeben, z. B. praxis@beispiel.de." };
  }
  const supabase = await createServerClient();
  const { error } = await supabase.from("notify_recipients").insert({ email });
  if (error?.code === "23505") return { error: `${email} steht schon in der Liste.` };
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: `${email} bekommt ab jetzt die E-Mails.`, done: Date.now() };
}

/** Remove an extra email recipient (R18). */
export async function removeRecipient(email: string): Promise<FormState> {
  await requireUser("admin");
  if (typeof email !== "string" || !EMAIL.test(email)) return { error: "Unbekannte Adresse." };
  const supabase = await createServerClient();
  const { error } = await supabase.from("notify_recipients").delete().eq("email", email);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: `${email} entfernt.` };
}
