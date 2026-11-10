import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** 32 random bytes, base64url: the secret part of an invite or reset link. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored; the token itself exists only in the link. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteUrl(token: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/einladung/${token}`;
}

/** "Einladung erstellen" (R23): a fresh 7-day link; older unused links stop working. */
export async function createInvite(userId: string, createdBy: string) {
  const token = newToken();
  const { data, error } = await createAdminClient().rpc("create_invite", {
    p_user: userId,
    p_purpose: "invite",
    p_hash: hashToken(token),
    p_by: createdBy,
  });
  if (error) throw new Error(error.message);
  return { url: inviteUrl(token), expiresAt: data as string };
}
