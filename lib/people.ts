import { createAdminClient } from "@/lib/supabase/admin";

/** Last sign-in per account, to show who still has to open their invite. Admin pages only. */
export async function lastSignIns(): Promise<Map<string, string | null>> {
  const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  return new Map((data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
}
