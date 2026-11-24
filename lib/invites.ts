import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { labels } from "@/lib/labels";
import type { Mail } from "@/lib/mail";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/app-url";

/** 32 random bytes, base64url: the secret part of an invite or reset link. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored; the token itself exists only in the link. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteUrl(token: string): string {
  return `${appUrl()}/einladung/${token}`;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Shipped with the server bundle through `outputFileTracingIncludes` in `next.config.ts`. */
export const GUIDE_FILE = path.join(process.cwd(), "Anleitung", "Anleitung-Mitarbeitende.pdf");

/** The employee guide (R23), or null when it can't be read: the invite still goes out without it. */
async function readGuide(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch (err) {
    console.error(`[mail] Anleitung nicht lesbar, Einladung ohne Anhang: ${file}`, err);
    return null;
  }
}

/**
 * The invite email (R23): username, steps, link and QR code, as text and HTML.
 * The QR code is an inline PNG, because Gmail and Outlook block `data:` images.
 * The employee guide is attached as a PDF and named in the steps when it can be read.
 */
export async function inviteMail(invite: {
  to: string;
  name: string;
  username: string;
  url: string;
  expiresAt: string;
}, guideFile = GUIDE_FILE): Promise<Mail> {
  const M = labels.employees.inviteMail;
  const loginUrl = `${appUrl()}/login`;
  const until = new Date(invite.expiresAt).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });
  const guide = await readGuide(guideFile);
  const steps = guide ? [...M.steps(loginUrl), M.guide] : M.steps(loginUrl);

  const text = [
    M.greeting(invite.name),
    "",
    M.intro,
    "",
    `${M.username} ${invite.username}`,
    "",
    M.stepsTitle,
    ...steps.map((step, i) => `${i + 1}. ${step}`),
    "",
    M.link,
    invite.url,
    "",
    M.valid(until),
    "",
    M.footer,
    M.noReply,
  ].join("\n");

  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="de"><body style="margin:0;padding:24px;background:#f6f8f7;font-family:Arial,Helvetica,sans-serif;color:#1d2b34;font-size:16px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:2px solid #1d2b34;padding:24px">
<p style="margin:0 0 12px">${e(M.greeting(invite.name))}</p>
<p style="margin:0 0 16px">${e(M.intro)}</p>
<p style="margin:0 0 20px;padding:12px;background:#f6f8f7;border-left:4px solid #1d2b34">${e(M.username)}<br><strong style="font-size:20px">${e(invite.username)}</strong></p>
<p style="margin:0 0 8px"><strong>${e(M.stepsTitle)}</strong></p>
<ol style="margin:0 0 20px;padding-left:22px">${steps.map((step) => `<li style="margin-bottom:6px">${e(step)}</li>`).join("")}</ol>
<p style="margin:0 0 20px"><a href="${e(invite.url)}" style="display:inline-block;background:#1d2b34;color:#ffffff;text-decoration:none;padding:12px 20px;font-weight:bold">${e(M.button)}</a></p>
<p style="margin:0 0 8px">${e(M.qr)}</p>
<p style="margin:0 0 20px"><img src="cid:invite-qr" width="200" height="200" alt="QR-Code mit dem Einladungslink" style="display:block;border:0"></p>
<p style="margin:0 0 4px;font-size:14px">${e(M.link)}</p>
<p style="margin:0 0 20px;font-size:14px;word-break:break-all"><a href="${e(invite.url)}" style="color:#1d2b34">${e(invite.url)}</a></p>
<p style="margin:0 0 20px;font-size:14px">${e(M.valid(until))}</p>
<p style="margin:0">${e(M.footer)}</p>
<p style="margin:4px 0 0;font-size:12px;color:#4a5862">${e(M.noReply)}</p>
</div></body></html>`;

  const qr = await QRCode.toBuffer(invite.url, { type: "png", margin: 1, width: 400 });
  return {
    to: invite.to,
    subject: M.subject,
    text,
    html,
    attachments: [
      { filename: "einladung-qr.png", content: qr, cid: "invite-qr" },
      ...(guide
        ? [{ filename: "Anleitung-Mitarbeitende.pdf", content: guide, contentType: "application/pdf" }]
        : []),
    ],
  };
}
