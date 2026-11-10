"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { authEmail, parseDays, parseEmployeeForm, TEAMS } from "@/lib/employees";
import { createInvite } from "@/lib/invites";
import { labels } from "@/lib/labels";
import { sendMail } from "@/lib/mail";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  ok?: string;
}

const L = labels.employees;

/** Adds a person (R19). The account has no password until they open their invite link. */
export async function createEmployee(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser("admin");
  const parsed = parseEmployeeForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const e = parsed.value;

  const supabase = await createServerClient();
  const { data: conflict, error: checkError } = await supabase.rpc("employee_conflict", {
    p_user: null,
    p_username: e.username,
    p_email: e.email,
  });
  if (checkError) return { error: checkError.message };
  if (conflict) return { error: conflict as string };

  const { data, error } = await createAdminClient().auth.admin.createUser({
    email: authEmail(e.username, e.email),
    email_confirm: true,
    app_metadata: { role: e.role },
    user_metadata: {
      username: e.username,
      full_name: e.fullName,
      team: e.team,
      workdays: e.workdays,
      start_date: e.startDate,
    },
  });
  if (error || !data.user) return { error: L.createFailed };

  // Same rules as an edit (end date, cleaned values).
  const { error: saveError } = await saveProfile(supabase, data.user.id, e);
  if (saveError) return { error: saveError.message };

  revalidatePath("/admin/employees");
  redirect(`/admin/employees/${data.user.id}?neu=1`);
}

function saveProfile(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  id: string,
  e: Extract<ReturnType<typeof parseEmployeeForm>, { ok: true }>["value"],
) {
  return supabase.rpc("save_employee", {
    p_user: id,
    p_username: e.username,
    p_full_name: e.fullName,
    p_email: e.email,
    p_team: e.team,
    p_role: e.role,
    p_workdays: e.workdays,
    p_start: e.startDate,
    p_end: e.endDate,
  });
}

/** Saves the details, then brings the Auth account (login email, role) in step. */
export async function saveEmployee(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireUser("admin");
  const parsed = parseEmployeeForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const e = parsed.value;

  const supabase = await createServerClient();
  const { error } = await saveProfile(supabase, id, e);
  if (error) return { error: error.message };

  const { error: authError } = await createAdminClient().auth.admin.updateUserById(id, {
    email: authEmail(e.username, e.email),
    email_confirm: true,
    app_metadata: { role: e.role },
    user_metadata: { username: e.username, full_name: e.fullName, team: e.team },
  });
  if (authError) return { error: L.authSyncFailed };

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  return { ok: L.saved };
}

/** Deactivating also blocks the login itself; the profile check ends open sessions (R1). */
export async function setEmployeeActive(id: string, active: boolean): Promise<ActionState> {
  await requireUser("admin");
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_employee_active", { p_user: id, p_active: active });
  if (error) return { error: error.message };

  const { error: banError } = await createAdminClient().auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError) return { error: L.authSyncFailed };

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  return { ok: active ? L.activated : L.deactivated };
}

export async function deleteEmployee(id: string): Promise<ActionState> {
  await requireUser("admin");
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("delete_employee", { p_user: id });
  if (error) return { error: error.message };
  revalidatePath("/admin/employees");
  redirect("/admin/employees?geloescht=1");
}

export interface InviteResult extends ActionState {
  url?: string;
  qrSvg?: string;
  expiresAt?: string;
  emailedTo?: string;
}

/** "Einladung erstellen" (R23): link + QR always, email when there is an address. */
export async function createInviteFor(id: string): Promise<InviteResult> {
  const me = await requireUser("admin");
  const supabase = await createServerClient();
  const { data: person } = await supabase
    .from("profiles")
    .select("username, full_name, notify_email")
    .eq("id", id)
    .single();
  if (!person) return { error: L.notFound };

  let invite: { url: string; expiresAt: string };
  try {
    invite = await createInvite(id, me.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : L.inviteFailed };
  }

  const qrSvg = await QRCode.toString(invite.url, { type: "svg", margin: 1, width: 220 });
  let emailedTo: string | undefined;
  if (person.notify_email) {
    const sent = await sendMail({
      to: person.notify_email,
      subject: L.inviteMailSubject,
      text: L.inviteMailText(person.full_name, person.username, invite.url),
    });
    if (sent) emailedTo = person.notify_email;
  }
  return { url: invite.url, qrSvg, expiresAt: invite.expiresAt, emailedTo };
}

export async function saveAllowance(
  id: string,
  year: number,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireUser("admin");
  const days = parseDays(form.get("days"));
  const carryover = parseDays(form.get("carryover") || "0");
  if (days === null || carryover === null) return { error: L.allowanceInvalid };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_allowance", {
    p_user: id,
    p_year: year,
    p_days: days,
    p_carryover: carryover,
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/employees/${id}`);
  return { ok: L.allowanceSaved(year) };
}

/** §5 BUrlG suggestion (R13); the admin decides whether to take it. */
export async function suggestAllowance(
  id: string,
  year: number,
  fullTimeDays: number,
): Promise<{ days?: number; error?: string }> {
  await requireUser("admin");
  if (!Number.isFinite(fullTimeDays) || fullTimeDays <= 0 || fullTimeDays > 60) {
    return { error: L.fullTimeInvalid };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("suggested_allowance", {
    p_user: id,
    p_year: year,
    p_fulltime_days: fullTimeDays,
  });
  if (error) return { error: error.message };
  return { days: Number(data) };
}

export async function saveTeamLimits(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser("admin");
  const supabase = await createServerClient();
  for (const team of TEAMS) {
    const raw = String(form.get(team) ?? "").trim();
    if (!/^\d{1,2}$/.test(raw)) return { error: L.limitInvalid };
    const { error } = await supabase.rpc("set_team_limit", { p_team: team, p_max: Number(raw) });
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/employees");
  return { ok: L.limitsSaved };
}
