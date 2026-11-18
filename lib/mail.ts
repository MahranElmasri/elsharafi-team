import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { appUrl } from "@/lib/app-url";

export interface Mail {
  to: string;
  subject: string;
  /** Always set: mail apps without HTML show this. */
  text: string;
  html?: string;
  /** Inline images use `cid` and are referenced in the HTML as `cid:…`. */
  attachments?: SendMailOptions["attachments"];
}

let transport: Transporter | null | undefined;

function getTransport() {
  if (transport !== undefined) return transport;
  const host = process.env.SMTP_HOST;
  transport = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      })
    : null;
  return transport;
}

/**
 * Sends one email through the practice mailbox. Never throws: a failure is logged and
 * reported as false, so the action that triggered it still succeeds (R18).
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const smtp = getTransport();
  if (!smtp) {
    // No SMTP configured (local development): show the mail in the server log instead.
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[mail] nicht gesendet (kein SMTP) an ${mail.to}: ${mail.subject}\n${mail.text}`,
      );
    } else {
      console.error(`[mail] SMTP_HOST fehlt, E-Mail an ${mail.to} nicht gesendet: ${mail.subject}`);
    }
    return false;
  }
  try {
    await smtp.sendMail({ from: process.env.MAIL_FROM, ...mail });
    return true;
  } catch (err) {
    console.error(`[mail] Versand an ${mail.to} fehlgeschlagen: ${mail.subject}`, err);
    return false;
  }
}

/** A notification row from an RPC: {to, subject, text, link?}. */
export interface NotificationMail extends Mail {
  link?: string | null;
}

/**
 * Wraps a notification's text for email (R18): greeting, the message, a link back to the
 * page it is about, and a footer. The wording of the message itself comes from SQL.
 */
export function renderNotification(mail: NotificationMail, appUrl: string): Mail {
  const base = appUrl.replace(/\/+$/, "");
  const link = mail.link && mail.link.startsWith("/") ? `${base}${mail.link}` : null;
  const text = [
    "Guten Tag,",
    "",
    mail.text.trim(),
    ...(link ? ["", `Zur App: ${link}`] : []),
    "",
    "MVZ El-Sharafi",
    "Diese Nachricht wurde automatisch verschickt. Bitte antworten Sie nicht darauf.",
  ].join("\n");
  return { to: mail.to, subject: mail.subject, text };
}

function isNotificationMail(m: unknown): m is NotificationMail {
  const x = m as Record<string, unknown> | null;
  return (
    typeof x?.to === "string" &&
    x.to.includes("@") &&
    typeof x.subject === "string" &&
    typeof x.text === "string"
  );
}

/** Sends the emails an RPC returned. Rows without an address are skipped; failures are logged. */
export async function sendAll(mails: unknown): Promise<void> {
  if (!Array.isArray(mails)) return;
  await Promise.all(
    mails.filter(isNotificationMail).map((m) => sendMail(renderNotification(m, appUrl()))),
  );
}
