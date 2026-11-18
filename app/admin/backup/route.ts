import { requireUser } from "@/lib/session";
import { readAll } from "@/lib/supabase/read-all";
import { createServerClient } from "@/lib/supabase/server";

// Every table the admin can read. Left out: notifications (short-lived, readable only by
// their owner) and invite_tokens (secret hashes).
// Table → primary key, for stable paging.
const TABLES: Record<string, string[]> = {
  teams: ["id"],
  absence_types: ["code"],
  app_settings: ["id"],
  profiles: ["id"],
  leave_allowances: ["user_id", "year"],
  leave_requests: ["id"],
  absence_days: ["user_id", "day"],
  closure_days: ["day"],
  day_notes: ["user_id", "day"],
  notify_recipients: ["email"],
  reminder_log: ["id"],
  audit_log: ["id"],
};

/** JSON backup of all data (R21). Contains health data: admins only, never cached. */
export async function GET() {
  await requireUser("admin");
  const supabase = await createServerClient();
  const tables: Record<string, unknown[]> = {};
  for (const [name, key] of Object.entries(TABLES)) {
    tables[name] = await readAll(supabase, name, key);
  }
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  return new Response(JSON.stringify({ created_at: now.toISOString(), tables }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="Sicherung-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
