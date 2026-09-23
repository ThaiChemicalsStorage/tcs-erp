import { STORE_ISSUE_CODES } from "../../src/lib/storeCodes.js";
/**
 * Shared primitives for Global Search, split out 2026-08-28 when search grew from 7 categories to
 * 16. `searchHandler.ts` (master data, menu pages, orchestration) and `searchDocuments.ts` (the 9
 * business-document categories) both need these, and neither can import the other without a cycle.
 */

/** Result cap per category when searching everything — deliberately small. 18 categories × 5 was
 * ~80 rows to scroll past; 3 keeps the "all" view scannable and the type-filter chips are how a
 * user asks for more. */
export const LIMIT_ALL = 3;
/** Result cap when the user has narrowed to specific categories via `?types=`. */
export const LIMIT_FILTERED = 20;

export const MIN_QUERY_LENGTH = 2;
/**
 * Must stay in sync with the client-side `maxLength` on the search `<input>` in `GlobalSearch.tsx`
 * — that's defense-in-depth (a native browser constraint a modified client could bypass), this is
 * the real enforcement. See the original rationale in `searchHandler.ts`.
 */
export const MAX_QUERY_LENGTH = 100;

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive, unanchored (substring) match — safe against regex injection via `escapeRegExp`. */
export function containsRegex(query: string): { $regex: string; $options: string } {
  return { $regex: escapeRegExp(query), $options: "i" };
}

/**
 * Case-insensitive **prefix** match. Unlike `containsRegex()` this one can actually use a b-tree
 * index, which is the whole point of the document-number fast path below: this ERP has no text
 * index anywhere (see docs/DATABASE.md), so an anchored `^` regex is the only index-usable query
 * shape available. Every business-document collection is keyed or indexed on its own number field.
 */
export function startsWithRegex(query: string): { $regex: string; $options: string } {
  return { $regex: `^${escapeRegExp(query)}`, $options: "i" };
}

/**
 * Every document family in this ERP mints its number with a distinct prefix, so a query that looks
 * like a document number tells us which collection to check first. Sources, all server-side
 * minters: `nextQuoteId()` (api/handlers/quotes.ts, `Q#YYMMDD-NNNN`), `{AR|BI|RE|IV}{YY}{MM}{SEQ}`
 * (documentNumbering.ts), and — since 2026-09-03 — one shared `{PREFIX}-{YYYYMM}-{NNNN}` shape
 * (`nextMonthlyDocumentNumber()`, same file) for `SR-`/`MR-`/`JO-`/`PR-`/`PO-`/`CC-`/`SC-`/`RR-`.
 * Documents minted before that date carry the older `{PREFIX}-{พ.ศ.}-{NNNN}` (or
 * `SC-{ค.ศ.}-{MM}-{NNN}`) and are still found the same way — only the prefix matters here,
 * never the year digits.
 *
 * Scope of Work is deliberately absent: its `scopeNumber` is free-text typed by a person with no
 * enforced format (scopeOfWorkHandler.ts), so there is no prefix to recognise. It still matches
 * through the ordinary substring search like everything else.
 */
export const DOC_NUMBER_PREFIXES: { prefix: string; type: DocNumberFamily }[] = [
  { prefix: "Q#", type: "quotation" },
  { prefix: "SR-", type: "serviceReport" },
  { prefix: "MR-", type: "materialRequisition" },
  { prefix: "JO-", type: "jobOrder" },
  { prefix: "PR-", type: "purchaseRequest" },
  // ใบขอซื้อแยกรหัสตามฝ่าย (2026-09-23): Support = PR, ผลิต = FD, โครงการ = ED, งานเหล็ก = SD
  { prefix: "FD-", type: "purchaseRequest" },
  { prefix: "ED-", type: "purchaseRequest" },
  { prefix: "SD-", type: "purchaseRequest" },
  // ใบเบิกของสโตร์ (2026-09-23) — เลขขึ้นต้นด้วยรหัสการจ่าย 15 ตัว ทั้งหมดอยู่ใน material_requisitions
  ...STORE_ISSUE_CODES.map((c) => ({ prefix: `${c.code}-`, type: "materialRequisition" as const })),
  { prefix: "PO-", type: "purchaseOrder" },
  { prefix: "CC-", type: "costControl" },
  { prefix: "RR-", type: "receivingReport" },
  { prefix: "SC-", type: "productionOrder" },
  { prefix: "AR", type: "arDocument" },
  { prefix: "BI", type: "arDocument" },
  { prefix: "RE", type: "arDocument" },
  { prefix: "IV", type: "arDocument" },
];

export type DocNumberFamily =
  | "quotation" | "serviceReport" | "materialRequisition" | "jobOrder"
  | "purchaseRequest" | "productionOrder" | "arDocument" | "purchaseOrder" | "costControl"
  | "receivingReport";

/**
 * Which document family a query looks like, or `null` when it doesn't look like a number at all.
 *
 * Requires at least one character past the prefix so that typing a bare "PR" — which is also the
 * start of plenty of ordinary words — doesn't hijack the search into a single family. The AR/BI/
 * RE/IV prefixes are letters-only and therefore the loosest, so they additionally require the next
 * character to be a digit: "REV" is a word, "RE6908" is a receipt.
 */
export function detectDocNumberFamily(query: string): DocNumberFamily | null {
  const q = query.trim().toUpperCase();
  for (const { prefix, type } of DOC_NUMBER_PREFIXES) {
    if (q.length <= prefix.length || !q.startsWith(prefix)) continue;
    const rest = q.slice(prefix.length);
    // Letters-only prefixes (AR/BI/RE/IV) need a digit right after to count as a document number.
    if (/^[A-Z]+$/.test(prefix) && !/^\d/.test(rest)) continue;
    return type;
  }
  return null;
}
