import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashToken, inviteUrl, newToken } from "@/lib/invites";

describe("invite tokens", () => {
  it("are 32 random bytes in base64url", () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(newToken()).not.toBe(token);
  });

  it("are stored as a sha256 hex hash, never as themselves", () => {
    const token = newToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).not.toContain(token);
  });

  it("build the link from APP_URL", () => {
    process.env.APP_URL = "https://anwesenheit.example.org/";
    expect(inviteUrl("abc")).toBe("https://anwesenheit.example.org/einladung/abc");
  });
});
