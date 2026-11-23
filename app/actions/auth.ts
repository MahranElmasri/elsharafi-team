"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { labels } from "@/lib/labels";
import { homeFor, type Role } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { SESSION_ONLY_COOKIE } from "@/lib/supabase/session-cookie";

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

  // "Angemeldet bleiben" unchecked: the auth cookies end with the browser (R1).
  const sessionOnly = form.get("remember") !== "on";
  const supabase = await createServerClient(sessionOnly);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: labels.login.failed };

  const cookieStore = await cookies();
  if (sessionOnly) {
    cookieStore.set(SESSION_ONLY_COOKIE, "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } else {
    cookieStore.delete(SESSION_ONLY_COOKIE);
  }

  redirect(homeFor(profile.role as Role));
}

export async function logout() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
