"use server";

import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

/** Opening the bell marks everything as read. */
export async function markNoticesRead(): Promise<void> {
  await requireUser();
  const supabase = await createServerClient();
  await supabase.rpc("mark_notifications_read");
}

/** Saves this device's push subscription for the signed-in person (R27). */
export async function savePushDevice(device: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: String(device?.endpoint ?? ""),
    p_p256dh: String(device?.p256dh ?? ""),
    p_auth: String(device?.auth ?? ""),
  });
  return error ? { error: error.message } : {};
}

/** Removes this device's push subscription (own devices only, enforced in SQL). */
export async function removePushDevice(endpoint: string): Promise<void> {
  await requireUser();
  const supabase = await createServerClient();
  await supabase.rpc("delete_push_subscription", { p_endpoint: String(endpoint ?? "") });
}
