import { createClient } from "@supabase/supabase-js";

export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export interface TestAccount {
  id: string;
  username: string;
  password: string;
}

/** Creates a throwaway account; usernames are unique per run. */
export async function createAccount(
  prefix: string,
  role: "admin" | "employee",
  withEmail = false,
): Promise<TestAccount> {
  const username = `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const password = "Test-Passwort-123";
  const { data, error } = await admin.auth.admin.createUser({
    email: withEmail ? `${username}@example.org` : `${username}@users.mvz-elsharafi.invalid`,
    password,
    email_confirm: true,
    app_metadata: role === "admin" ? { role: "admin" } : {},
    user_metadata: { username, full_name: `Test ${prefix}`, team: "arbeiter" },
  });
  if (error) throw error;
  return { id: data.user.id, username, password };
}

export async function deleteAccount(account: TestAccount) {
  await admin.auth.admin.deleteUser(account.id);
}
