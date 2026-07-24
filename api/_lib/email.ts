/**
 * Minimal transactional-email sender via Resend's plain REST API (added 2026-07-23, Scope of Work
 * "Document Recipients" feature — see docs/MODULES/ScopeOfWork.md). Uses the platform `fetch`
 * (available in the Vercel Node runtime, no SDK needed) rather than the `resend` npm package, to
 * avoid a dependency for what is a single POST call. Requires `RESEND_API_KEY` to be set in the
 * Vercel project's environment variables — **not configured by this code, a human must obtain an
 * API key from resend.com and add it**, same category of manual, out-of-band step as any other
 * third-party credential (see docs/TODO.md). Every other email-sending feature this app might grow
 * later should reuse this one module rather than each hand-rolling its own `fetch` call.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("RESEND_API_KEY is not set");
    this.name = "EmailNotConfiguredError";
  }
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/** Sends one email to one recipient. Throws `EmailNotConfiguredError` if `RESEND_API_KEY` is
 * missing (checked once by the caller via `isEmailConfigured()` before looping, so a misconfigured
 * deployment fails fast with one clear error instead of N identical ones) or a plain `Error` on a
 * non-2xx response from Resend (message includes Resend's own error body when available, logged by
 * the caller — never surfaced verbatim to the end user, who only needs "ส่งไม่สำเร็จ"). */
export async function sendEmail({ to, subject, html, headers }: { to: string; subject: string; html: string;
  /** Extra SMTP headers passed through to Resend verbatim — used for threading (`Message-ID` on a
   * document's first send, `In-Reply-To`/`References` on follow-ups, added 2026-07-24 so repeat
   * sends of the same document land in the recipient's existing conversation instead of as a new
   * email each time). Threading is ultimately the receiving client's call — Gmail/Outlook honor
   * these headers; the `Re:` subject the caller pairs with them is the fallback signal. */
  headers?: Record<string, string>;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailNotConfiguredError();
  // Resend's own sandbox "from" address — works with zero setup for testing, but every recipient
  // must first "confirm" the Resend account owner's email to receive it. A real deployment should
  // set EMAIL_FROM to a verified sending domain (see resend.com/docs/dashboard/domains/introduction)
  // once one exists — not configured here, same manual-step category as RESEND_API_KEY itself.
  const from = process.env.EMAIL_FROM || "TCS ERP <onboarding@resend.dev>";
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, ...(headers ? { headers } : {}) }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${body.slice(0, 500)}`);
  }
}
