"use server";

import { redirect } from "next/navigation";
import { hashToken, inviteUrl, newToken } from "@/lib/invites";
import { labels } from "@/lib/labels";
import { sendMail } from "@/lib/mail";
import { homeFor, type Role } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  done?: boolean;
}

type PeekStatus = "ok" | "unknown" | "used" | "expired" | "inactive";

/** Sets the password from an invite or reset link, then signs the person in (R23). */
export async function setPassword(
  token: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const repeat = String(form.get("repeat") ?? "");
  if (password.length < 10) return { error: labels.invite.tooShort };
  if (password !== repeat) return { error: labels.invite.mismatch };

  const admin = createAdminClient();
  const hash = hashToken(token);
  const { data: redeemed } = await admin.rpc("redeem_invite", { p_hash: hash });
  const owner = (redeemed as { user_id: string; role: Role }[] | null)?.[0];
  if (!owner) {
    const { data: peek } = await admin.rpc("peek_invite", { p_hash: hash });
    const status = ((peek as { status: PeekStatus }[] | null)?.[0]?.status ?? "unknown") as Exclude<
      PeekStatus,
      "ok"
    >;
    return { error: labels.invite[status] ?? labels.invite.unknown };
  }

  const { data: updated, error } = await admin.auth.admin.updateUserById(owner.user_id, {
    password,
  });
  const email = updated?.user?.email;
  if (error || !email) return { error: labels.invite.failed };

  const supabase = await createServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) redirect("/login");
  redirect(homeFor(owner.role));
}

/** "Passwort vergessen": the same answer whatever the username (R23). */
export async function requestReset(_prev: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get("username") ?? "").trim();
  if (!username) return { done: true };

  const token = newToken();
  const { data } = await createAdminClient().rpc("request_reset", {
    p_username: username,
    p_hash: hashToken(token),
  });
  const target = (data as { full_name: string; email: string }[] | null)?.[0];
  if (target) {
    await sendMail({
      to: target.email,
      subject: labels.forgot.mailSubject,
      text: labels.forgot.mailText(target.full_name, inviteUrl(token)),
    });
  }
  return { done: true };
}
