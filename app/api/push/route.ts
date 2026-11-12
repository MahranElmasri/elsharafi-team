import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cron";
import { sendPush, toPushPayload, vapidFromEnv } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Push for new notifications (R27). Called by the notifications trigger through pg_net with
 * `{ ids }`; sends each notification to every device of its person and drops expired devices.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const vapid = vapidFromEnv();
  if (!secret || !vapid) {
    console.error("[push] CRON_SECRET oder VAPID-Schlüssel fehlen; Push ist aus.");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = body?.ids;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 500 ||
    !ids.every((id) => typeof id === "string" && UUID.test(id))
  ) {
    return NextResponse.json({ error: "ids must be a list of notification ids" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: notices, error } = await supabase
    .from("notifications")
    .select("user_id, message, link")
    .in("id", ids);
  if (error) {
    console.error("[push] Meldungen nicht lesbar:", error.message);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
  const users = [...new Set((notices ?? []).map((n) => n.user_id as string))];
  const { data: devices, error: deviceError } = users.length
    ? await supabase
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth")
        .in("user_id", users)
    : { data: [], error: null };
  if (deviceError) {
    console.error("[push] Geräte nicht lesbar:", deviceError.message);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }

  const sends = (notices ?? []).flatMap((n) =>
    (devices ?? [])
      .filter((d) => d.user_id === n.user_id)
      .map(async (d) => ({
        id: d.id as string,
        outcome: await sendPush(d, toPushPayload(n), vapid),
      })),
  );
  const results = await Promise.all(sends);
  const gone = [...new Set(results.filter((r) => r.outcome === "gone").map((r) => r.id))];
  if (gone.length) {
    const { error: deleteError } = await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", gone);
    if (deleteError)
      console.error("[push] Abgelaufene Geräte nicht gelöscht:", deleteError.message);
  }

  const sent = results.filter((r) => r.outcome === "sent").length;
  const failed = results.filter((r) => r.outcome === "failed").length;
  return NextResponse.json({ sent, failed, removed: gone.length });
}
