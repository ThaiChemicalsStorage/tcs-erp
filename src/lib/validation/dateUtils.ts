/**
 * Pure, throw-free semantic date check — "" (not scheduled/unset) or a real `YYYY-MM-DD` calendar
 * date. Mirrors `validateIsoDateOrEmpty()` in `api/_lib/quoteValidation.ts` (which throws
 * `HttpError` and is server-only, so it can't be shared into frontend code) — added 2026-07-16,
 * Codex review Medium Priority fix: the finalization/print validators previously only checked a
 * date field was non-blank, so a malformed or impossible date (e.g. a legacy record with a garbled
 * string, or "2026-02-30") could pass finalization even though it would never have been accepted by
 * a fresh `PATCH`/create request.
 */
export function isValidIsoDateOrEmpty(v: string): boolean {
  if (v === "") return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
}
