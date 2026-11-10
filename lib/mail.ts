import nodemailer, { type Transporter } from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  text: string;
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
