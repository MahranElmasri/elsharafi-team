import { NextResponse } from "next/server";
import { isAuthorized, parseAsOf } from "@/lib/cron";
import { berlinToday } from "@/lib/grid";
import { renderNotification, sendMail, type NotificationMail } from "@/lib/mail";
import { createAdminClient } from "@/lib/supabase/admin";

interface ReminderMail extends NotificationMail {
  user_id: string;
  kind: "year_end" | "carryover";
  year: number;
  days_at_risk: number;
}

/**
 * Daily reminders (R15), called by pg_cron through pg_net. The database decides who is due
 * and writes the in-app reminders; this route sends the emails and logs each one that went out.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET fehlt; Erinnerungen werden nicht verschickt.");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseAsOf(body);
  if (parsed === "invalid") {
    return NextResponse.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
  }
  const asOf = parsed ?? berlinToday();

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("run_reminders", { p_as_of: asOf });
  if (error) {
    console.error("[cron] run_reminders fehlgeschlagen:", error.message);
    return NextResponse.json({ error: "run_reminders failed" }, { status: 500 });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  let emailsSent = 0;
  let emailsFailed = 0;
  for (const mail of (data ?? []) as ReminderMail[]) {
    const sent = await sendMail(renderNotification(mail, appUrl));
    if (!sent) {
      emailsFailed++;
      continue;
    }
    emailsSent++;
    const { error: logError } = await supabase.rpc("log_reminder_email", {
      p_user: mail.user_id,
      p_kind: mail.kind,
      p_year: mail.year,
      p_days: mail.days_at_risk,
      p_as_of: asOf,
    });
    if (logError) console.error("[cron] log_reminder_email fehlgeschlagen:", logError.message);
  }

  console.info(
    `[cron] Erinnerungen ${asOf}: ${emailsSent} E-Mails gesendet, ${emailsFailed} fehlgeschlagen.`,
  );
  return NextResponse.json({ asOf, emailsSent, emailsFailed });
}
