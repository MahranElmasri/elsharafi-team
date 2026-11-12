import webpush, { WebPushError } from "web-push";

/** What the service worker shows: title, text and the in-app path a tap opens. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** A notification row as a push message. Only in-app paths are opened on tap. */
export function toPushPayload(n: { message: string; link: string | null }): PushPayload {
  const url = n.link?.startsWith("/") && !n.link.startsWith("//") ? n.link : "/";
  return { title: "Anwesenheit", body: n.message, url };
}

/** VAPID details from the environment, or null when push is not set up. */
export function vapidFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/**
 * Sends one push. "gone" means the push service no longer knows this device (404/410),
 * so its subscription should be deleted. Never throws.
 */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
  vapid: NonNullable<ReturnType<typeof vapidFromEnv>>,
): Promise<"sent" | "gone" | "failed"> {
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { vapidDetails: vapid, TTL: 24 * 60 * 60, urgency: "high" },
    );
    return "sent";
  } catch (e) {
    if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) return "gone";
    console.error("[push] Senden fehlgeschlagen:", e instanceof Error ? e.message : e);
    return "failed";
  }
}
