import { HttpError } from "./http.js";
import type { QuoteFields } from "./collections.js";
import { computeQuoteAmountWithVat } from "./quoteAmounts.js";

/**
 * Server-side quote payload validation — added per the 2026-07-10 Codex review's Critical finding
 * that `api/handlers/quotes.ts` copied POST/PATCH/workflow-draft fields into MongoDB with no
 * schema validation, no bounds checking, no date validation, and no server-side recomputation of
 * `amount`. Every function here is pure (no MongoDB/network calls) except `validateJobType`,
 * which needs the caller to have already fetched the job-type master list.
 *
 * The totals formula itself lives in `./quoteAmounts.ts` (shared with `api/dashboard/index.ts`,
 * so both compute a quote's value the same way) rather than importing `src/lib/quotes.tsx`'s
 * `computeTotals()` — that file also defines JSX (`statusIcon`), and importing it by value into a
 * Node serverless function would drag React/JSX evaluation in for no reason.
 */

const MAX_LINES = 200;
const MAX_TAGS_PER_LINE = 20;
const MAX_SUBDETAILS_PER_LINE = 50;
const MAX_SHORT_TEXT = 300;
const MAX_LONG_TEXT = 5000;
const MAX_LINE_TEXT = 2000;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Trims and caps length; throws if the input isn't a string at all (a wrong JSON type, not just an empty one). */
function sanitizeText(v: unknown, fieldLabel: string, maxLen: number, required = false): string {
  if (v === undefined || v === null) {
    if (required) throw new HttpError(400, `กรุณากรอก${fieldLabel}`);
    return "";
  }
  if (typeof v !== "string") throw new HttpError(400, `${fieldLabel}ต้องเป็นข้อความ`);
  const trimmed = v.trim();
  if (required && !trimmed) throw new HttpError(400, `กรุณากรอก${fieldLabel}`);
  if (trimmed.length > maxLen) throw new HttpError(400, `${fieldLabel}ยาวเกินไป (สูงสุด ${maxLen} ตัวอักษร)`);
  return trimmed;
}

/** Non-negative, finite number within `[0, max]` — used for qty/unitPrice/discount percentages. */
function sanitizeNumber(v: unknown, fieldLabel: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  if (!isFiniteNumber(v)) throw new HttpError(400, `${fieldLabel}ต้องเป็นตัวเลข`);
  if (v < min || v > max) throw new HttpError(400, `${fieldLabel}ต้องอยู่ระหว่าง ${min} ถึง ${max}`);
  return v;
}

/** "" (not scheduled/unset) or a real `YYYY-MM-DD` calendar date — rejects malformed strings like "2026-13-40" or free text. */
export function validateIsoDateOrEmpty(v: unknown, fieldLabel: string): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v !== "string") throw new HttpError(400, `${fieldLabel}ไม่ถูกต้อง`);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!match) throw new HttpError(400, `${fieldLabel}ต้องอยู่ในรูปแบบ YYYY-MM-DD`);
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const roundTrips = date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
  if (!roundTrips) throw new HttpError(400, `${fieldLabel}ไม่ใช่วันที่จริง`);
  return v;
}

function sanitizeSubDetail(raw: unknown, lineIndex: number, subIndex: number): QuoteFields["lines"][number]["subDetails"][number] {
  if (typeof raw !== "object" || raw === null) throw new HttpError(400, `รายละเอียดย่อยของรายการที่ ${lineIndex + 1} ไม่ถูกต้อง`);
  const r = raw as Record<string, unknown>;
  return {
    id: sanitizeText(r.id, `รหัสรายละเอียดย่อยที่ ${subIndex + 1} ของรายการที่ ${lineIndex + 1}`, 100, true),
    text: sanitizeText(r.text, `รายละเอียดย่อยที่ ${subIndex + 1} ของรายการที่ ${lineIndex + 1}`, MAX_LINE_TEXT),
  };
}

function sanitizeLine(raw: unknown, index: number): QuoteFields["lines"][number] {
  if (typeof raw !== "object" || raw === null) throw new HttpError(400, `รายการที่ ${index + 1} ไม่ถูกต้อง`);
  const r = raw as Record<string, unknown>;
  if (!isFiniteNumber(r.id)) throw new HttpError(400, `รหัสรายการที่ ${index + 1} ไม่ถูกต้อง`);

  const rawTags = Array.isArray(r.tags) ? r.tags : [];
  if (rawTags.length > MAX_TAGS_PER_LINE) throw new HttpError(400, `รายการที่ ${index + 1} มีแท็กมากเกินไป`);
  const tags = rawTags.map((t, i) => sanitizeText(t, `แท็กที่ ${i + 1} ของรายการที่ ${index + 1}`, 50));

  const rawSubDetails = Array.isArray(r.subDetails) ? r.subDetails : [];
  if (rawSubDetails.length > MAX_SUBDETAILS_PER_LINE) throw new HttpError(400, `รายการที่ ${index + 1} มีรายละเอียดย่อยมากเกินไป`);
  const subDetails = rawSubDetails.map((sd, i) => sanitizeSubDetail(sd, index, i));

  return {
    id: r.id,
    description: sanitizeText(r.description, `รายละเอียดสินค้าของรายการที่ ${index + 1}`, MAX_LINE_TEXT),
    unit: sanitizeText(r.unit, `หน่วยของรายการที่ ${index + 1}`, 50),
    qty: sanitizeNumber(r.qty, `จำนวนของรายการที่ ${index + 1}`, { min: 0, max: 1_000_000 }),
    unitPrice: sanitizeNumber(r.unitPrice, `ราคาต่อหน่วยของรายการที่ ${index + 1}`, { min: 0, max: 1_000_000_000 }),
    discount: sanitizeNumber(r.discount, `ส่วนลดของรายการที่ ${index + 1}`, { min: 0, max: 100 }),
    tags,
    subDetails,
    // Optional, defaults falsy — added 2026-07-14 for Quotation Templates' section-header lines
    // (see docs/MODULES/QuotationTemplates.md). No special validation beyond "must be a real
    // boolean if present": a header line is still a completely ordinary QuoteLine otherwise, so
    // its qty/unitPrice/discount/etc. go through the exact same checks as any other line.
    isSectionHeader: sanitizeBoolean(r.isSectionHeader, `ประเภทหัวข้อของรายการที่ ${index + 1}`),
  };
}

/** Validates and sanitizes a `lines` array — throws on any malformed line rather than silently dropping/coercing it. */
export function validateLines(raw: unknown): QuoteFields["lines"] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "รูปแบบรายการสินค้าไม่ถูกต้อง");
  if (raw.length > MAX_LINES) throw new HttpError(400, `มีรายการสินค้ามากเกินไป (สูงสุด ${MAX_LINES} รายการ)`);
  return raw.map((l, i) => sanitizeLine(l, i));
}

/** The VAT-included grand total actually persisted as `Quote.amount` — see `./quoteAmounts.ts`. */
export function computeQuoteAmount(lines: QuoteFields["lines"], discountPct: number): number {
  return computeQuoteAmountWithVat(lines, discountPct);
}

/**
 * Server-authoritative Job Type: the client-supplied `jobTypeCode` must match a real master
 * record (active or previously deactivated — a deactivated code is still a legitimate historical
 * reference, just no longer offered as a new UI choice), and `jobTypeName` is always re-derived
 * from that record rather than trusted from the client, so a stale/forged display name can never
 * be persisted. Pass `activeOnly: true` only when creating a brand-new quote, where the client's
 * own picker can only ever offer active codes anyway.
 */
export function validateJobType(
  jobTypeCode: unknown,
  jobTypes: { code: string; name: string; isActive: boolean }[],
  { required }: { required: boolean },
): { jobTypeCode: string; jobTypeName: string } {
  const code = sanitizeText(jobTypeCode, "ประเภทงาน", 50, required);
  if (!code) return { jobTypeCode: "", jobTypeName: "" };
  const match = jobTypes.find((j) => j.code === code);
  if (!match) throw new HttpError(400, "ประเภทงานไม่ถูกต้อง กรุณาเลือกจากรายการที่กำหนด");
  return { jobTypeCode: match.code, jobTypeName: match.name };
}

/**
 * Server-authoritative Quotation Template reference (added 2026-07-14) — same pattern as
 * `validateJobType()` above: the client-supplied `quotationTemplateId` must match a real,
 * non-deleted `quotation_templates` record, and `quotationTemplateName`/`quotationTemplateVersion`
 * are always re-derived from that record rather than trusted from the client. Deliberately allows
 * a currently-*inactive* template match (an Admin may have deactivated it moments after a Sales
 * user started their draft) — only `isDeleted` disqualifies it, since a template someone actually
 * started building a quote from should never suddenly become an invalid reference mid-save. Never
 * `required`: a quote can always be started blank ("เริ่มจากใบเสนอราคาเปล่า"), no template needed.
 *
 * `quoteJobTypeCode` is the quote's OWN already-validated `jobTypeCode` (from `validateJobType()`
 * above, called first at every call site) — 2026-07-14, Codex review High Priority fix: previously
 * the template's `jobTypeCode` was never compared against the quote's, so a direct API caller
 * (bypassing the wizard's UI-level guardrails) could create e.g. a TA quotation carrying LI
 * template provenance. A template match whose `jobTypeCode` disagrees is now rejected outright,
 * the same way an unrecognized id is.
 */
export function validateQuotationTemplate(
  quotationTemplateId: unknown,
  templates: { id: string; templateName: string; version: string; jobTypeCode: string; isDeleted: boolean }[],
  quoteJobTypeCode: string,
): { quotationTemplateId: string; quotationTemplateName: string; quotationTemplateVersion: string } {
  const id = sanitizeText(quotationTemplateId, "Template ใบเสนอราคา", 100, false);
  if (!id) return { quotationTemplateId: "", quotationTemplateName: "", quotationTemplateVersion: "" };
  const match = templates.find((t) => t.id === id && !t.isDeleted);
  if (!match) throw new HttpError(400, "Template ใบเสนอราคาไม่ถูกต้อง กรุณาเลือกจากรายการที่กำหนด");
  if (match.jobTypeCode !== quoteJobTypeCode) {
    throw new HttpError(400, "Template ใบเสนอราคาไม่ตรงกับประเภทงานที่เลือก กรุณาเลือกใหม่");
  }
  return { quotationTemplateId: match.id, quotationTemplateName: match.templateName, quotationTemplateVersion: match.version };
}

export function sanitizeShortText(v: unknown, fieldLabel: string, required = false): string {
  return sanitizeText(v, fieldLabel, MAX_SHORT_TEXT, required);
}
export function sanitizeLongText(v: unknown, fieldLabel: string): string {
  return sanitizeText(v, fieldLabel, MAX_LONG_TEXT);
}
export function sanitizeDiscountPct(v: unknown): number {
  if (v === undefined) return 0;
  return sanitizeNumber(v, "ส่วนลดรวม", { min: 0, max: 100 });
}
export function sanitizeBoolean(v: unknown, fieldLabel: string): boolean {
  if (v === undefined) return false;
  if (typeof v !== "boolean") throw new HttpError(400, `${fieldLabel}ต้องเป็นค่าจริง/เท็จ`);
  return v;
}
