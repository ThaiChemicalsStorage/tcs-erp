/**
 * Person-to-person email sending via the acting user's OWN Gmail account (nodemailer + Gmail
 * SMTP) — rewritten 2026-08-07, replacing the original central Resend sender (2026-07-23), per
 * direct user request: Scope of Work document emails must come from the personal Gmail of the
 * person who clicks send, so recipients can reply to them directly. Each user stores a Gmail App
 * Password (encrypted — see ./emailCredentials.ts); the sender's own `users.email` +
 * decrypted App Password authenticate the SMTP session, so Gmail itself enforces that the From
 * address is genuinely the sender's. Every email-sending feature this app grows later should
 * reuse this module rather than hand-rolling its own transport.
 *
 * Unlike Resend, Gmail SMTP PRESERVES a caller-supplied `Message-ID`, so the synthetic-References
 * threading anchor scheme in scopeOfWorkHandler.ts works at least as well as before.
 *
 * Known Gmail constraints (surfaced to users in Settings → การส่งอีเมล help copy):
 *   - App Passwords require the Google account to have 2-Step Verification enabled.
 *   - Personal accounts are limited to roughly 500 outgoing recipients/day.
 */
import nodemailer, { type Transporter } from "nodemailer";

/** Gmail rejected the SMTP login (wrong/revoked App Password, or 2FA/app-password disabled) —
 * callers map this to a precise Thai 400 instead of a generic send failure. */
export class GmailAuthError extends Error {
  constructor(cause: unknown) {
    super("Gmail rejected the App Password");
    this.name = "GmailAuthError";
    this.cause = cause;
  }
}

function isAuthFailure(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number } | null;
  return !!e && (e.code === "EAUTH" || e.responseCode === 535);
}

/** One pooled transport per send action (fan-out reuses the same authenticated session instead of
 * N separate logins). Callers MUST `transport.close()` in a `finally`. */
export function createGmailTransport(senderEmail: string, appPassword: string): Transporter {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: senderEmail, pass: appPassword },
    pool: true,
    maxConnections: 2,
  });
}

/** Sends one email to one recipient through the given transport. From is rendered as
 * `"fromName" <fromEmail>` — with Gmail SMTP the fromEmail must be (and is) the authenticated
 * account itself. Throws `GmailAuthError` on an authentication failure, a plain Error otherwise
 * (logged by the caller — never surfaced verbatim to the end user). */
export async function sendEmailAs(
  transport: Transporter,
  { fromName, fromEmail, to, subject, html, messageId, inReplyTo, references }: {
    fromName: string;
    fromEmail: string;
    to: string;
    subject: string;
    html: string;
    /** Threading (see scopeOfWorkHandler.ts): `messageId` on a document's first send,
     * `inReplyTo`/`references` on follow-ups, so repeat sends of the same document land in the
     * recipient's existing conversation. Honoring them is ultimately the receiving client's call. */
    messageId?: string;
    inReplyTo?: string;
    references?: string;
  },
): Promise<void> {
  try {
    await transport.sendMail({
      from: { name: fromName, address: fromEmail },
      to,
      subject,
      html,
      ...(messageId ? { messageId } : {}),
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(references ? { references } : {}),
    });
  } catch (err) {
    if (isAuthFailure(err)) throw new GmailAuthError(err);
    throw err;
  }
}
