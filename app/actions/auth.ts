"use server";

import { redirect } from "next/navigation";
import { labels } from "@/lib/labels";
import { homeFor, type Role } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

/**
 * Username login (R1). The username is mapped to the account's Auth email on the
 * server; every failure gives the same answer so usernames cannot be probed.
 */
export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const username = String(form.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: labels.login.missing };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, active")
    .eq("username", username)
    .maybeSingle();
  if (!profile?.active) return { error: labels.login.failed };

  const { data: account } = await admin.auth.admin.getUserById(profile.id);
  const email = account?.user?.email;
  if (!email) return { error: labels.login.failed };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: labels.login.failed };

  redirect(homeFor(profile.role as Role));
}

export async function logout() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
