import type { VercelRequest, VercelResponse } from "@vercel/node";
import { refreshSessionCookie } from "./auth.js";

/**
 * `code`/`details` (added for the Quotation/Scope of Work required-field validation pass) let a
 * caller attach a structured, machine-readable payload alongside the human-readable Thai
 * `message` — e.g. `code: "DOCUMENT_INCOMPLETE"` plus `details: { fieldErrors, groupErrors }` so
 * the frontend can highlight the exact invalid fields/checklist groups instead of only showing a
 * toast. Both optional and unused by every pre-existing `HttpError` call site (they still throw
 * plain `HttpError(status, message)`, spreading to `undefined` and disappearing from the response).
 */
export class HttpError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  constructor(status: number, message: string, options?: { code?: string; details?: Record<string, unknown> }) {
    super(message);
    this.status = status;
    this.code = options?.code;
    this.details = options?.details;
  }
}

export function sendJson(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body);
}

export function sendError(res: VercelResponse, err: unknown) {
  if (err instanceof HttpError) {
    sendJson(res, err.status, { error: err.message, ...(err.code ? { code: err.code } : {}), ...(err.details ?? {}) });
    return;
  }
  console.error(err);
  sendJson(res, 500, { error: "Internal server error" });
}

/**
 * Parses path segments after `prefix` from the raw URL rather than Vercel's synthetic catch-all
 * query param — the query key for a `[...segments]` route turned out to be the literal
 * `"...segments"` string (dots included) on Vercel's plain Functions runtime, not `segments` as
 * in Next.js. Parsing the URL directly sidesteps that (undocumented, surprising) convention.
 */
export function getPathSegments(req: VercelRequest, prefix: string): string[] {
  const pathname = (req.url ?? "").split("?")[0];
  const trimmed = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
  return trimmed.split("/").filter(Boolean);
}

export async function withErrorHandling(
  req: VercelRequest,
  res: VercelResponse,
  handler: () => Promise<void>,
): Promise<void> {
  try {
    refreshSessionCookie(req, res);
    await handler();
  } catch (err) {
    sendError(res, err);
  }
}
