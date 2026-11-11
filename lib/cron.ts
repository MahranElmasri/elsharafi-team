import { createHash, timingSafeEqual } from "node:crypto";

/** True when the Authorization header carries exactly `Bearer {secret}`. Constant time. */
export function isAuthorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  // Hash both sides so the comparison never depends on the lengths.
  const given = createHash("sha256").update(header.slice(7)).digest();
  const wanted = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, wanted);
}

/** The optional `{ "asOf": "YYYY-MM-DD" }` body; null when absent, "invalid" when malformed. */
export function parseAsOf(body: unknown): string | null | "invalid" {
  if (body === null || typeof body !== "object" || !("asOf" in body)) return null;
  const value = (body as { asOf: unknown }).asOf;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid";
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : "invalid";
}
