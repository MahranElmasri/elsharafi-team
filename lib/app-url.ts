/** Base URL for links in emails, invites and QR codes. Local dev sets APP_URL in .env.local. */
export function appUrl(): string {
  return (process.env.APP_URL || "https://plan.mvz-elsharafi.de").replace(/\/+$/, "");
}
