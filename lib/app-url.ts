const DEFAULT = "https://plan.mvz-elsharafi.de";

/**
 * Base URL for links in emails, invites and QR codes. Local dev sets APP_URL in .env.local.
 * Only scheme, host and port are kept, so a path in APP_URL (e.g. ".../login") never ends up
 * in front of every link.
 */
export function appUrl(): string {
  try {
    return new URL(process.env.APP_URL || DEFAULT).origin;
  } catch {
    return DEFAULT;
  }
}
