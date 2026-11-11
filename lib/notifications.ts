import { toNotice, type Notice } from "@/lib/notice";
import { createServerClient } from "@/lib/supabase/server";

/** The latest notifications of the signed-in person (RLS: only their own). */
export async function loadNotices(): Promise<{ notices: Notice[]; unread: number }> {
  const supabase = await createServerClient();
  const [list, unread] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, message, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (list.error) throw new Error(list.error.message);
  return { notices: (list.data ?? []).map(toNotice), unread: unread.count ?? 0 };
}
