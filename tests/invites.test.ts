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

describe("inviteMail", () => {
  const invite = {
    to: "anna@example.org",
    name: "Anna <Müller>",
    username: "anna.m",
    url: "https://team.example/einladung/abc",
    expiresAt: "2026-11-18T13:30:00Z",
  };

  it("gives username, steps, link and expiry as plain text", async () => {
    const { inviteMail } = await import("@/lib/invites");
    const mail = await inviteMail(invite);
    expect(mail.to).toBe("anna@example.org");
    expect(mail.text).toContain("Ihr Benutzername: anna.m");
    expect(mail.text).toContain("1. Öffnen Sie den Link");
    expect(mail.text).toContain("3. Klicken Sie auf „Passwort speichern“");
    expect(mail.text).toMatch(/4\. Künftig melden Sie sich unter http.*\/login/);
    expect(mail.text).toContain(invite.url);
    expect(mail.text).toContain("18.11.2026, 14:30");
  });

  it("shows the QR code as an inline PNG and escapes names in the HTML", async () => {
    const { inviteMail } = await import("@/lib/invites");
    const mail = await inviteMail(invite);
    expect(mail.html).toContain('src="cid:invite-qr"');
    expect(mail.html).toContain(`href="${invite.url}"`);
    expect(mail.html).toContain("Anna &lt;Müller&gt;");
    expect(mail.html).not.toContain("<Müller>");
    const [qr] = mail.attachments as { cid: string; content: Buffer }[];
    expect(qr.cid).toBe("invite-qr");
    expect(qr.content.subarray(1, 4).toString()).toBe("PNG");
  });

  it("attaches the employee guide as a PDF and names it in the steps", async () => {
    const { inviteMail } = await import("@/lib/invites");
    const mail = await inviteMail(invite);
    const guide = (mail.attachments as { filename: string; content: Buffer }[]).find(
      (a) => a.filename === "Anleitung-Mitarbeitende.pdf",
    );
    expect(guide?.content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(mail.text).toContain("5. Die Anleitung im Anhang");
    expect(mail.html).toContain("Die Anleitung im Anhang");
  });

  it("still builds without the guide when the file is missing", async () => {
    const { inviteMail } = await import("@/lib/invites");
    const mail = await inviteMail(invite, "/nonexistent/Anleitung.pdf");
    expect(mail.attachments).toHaveLength(1);
    expect(mail.text).not.toContain("Anleitung");
  });
});
