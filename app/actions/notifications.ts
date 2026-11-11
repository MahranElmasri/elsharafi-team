"use server";

import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

/** Opening the bell marks everything as read. */
export async function markNoticesRead(): Promise<void> {
  await requireUser();
  const supabase = await createServerClient();
  await supabase.rpc("mark_notifications_read");
}
