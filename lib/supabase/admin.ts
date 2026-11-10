import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Server only: it bypasses RLS. Used for account work
 * (username lookup, create, ban, delete) and never handed to the browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
