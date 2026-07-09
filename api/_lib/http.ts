import type { VercelRequest, VercelResponse } from "@vercel/node";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body);
}

export function sendError(res: VercelResponse, err: unknown) {
  if (err instanceof HttpError) {
    sendJson(res, err.status, { error: err.message });
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
  res: VercelResponse,
  handler: () => Promise<void>,
): Promise<void> {
  try {
    await handler();
  } catch (err) {
    sendError(res, err);
  }
}
