import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export type Role = "admin" | "employee";

export interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  teamId: string;
}

export function homeFor(role: Role) {
  return role === "admin" ? "/admin" : "/me";
}

/**
 * The signed-in, active user. Anyone else is sent to /login; a deactivated
 * account is signed out first (R1). Pass "admin" to keep employees out.
 */
export async function requireUser(role?: Role): Promise<CurrentUser> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, full_name, role, team_id, active")
    .eq("id", user.id)
    .single();

  if (!profile?.active) {
    await supabase.auth.signOut();
    redirect("/login?gesperrt=1");
  }
  if (role === "admin" && profile.role !== "admin") redirect("/me");

  return {
    id: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    role: profile.role as Role,
    teamId: profile.team_id,
  };
}
