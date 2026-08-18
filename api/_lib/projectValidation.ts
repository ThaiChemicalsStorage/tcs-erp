import { HttpError } from "./http.js";

/**
 * Shared by all 4 Project-module handlers (added 2026-08-18, Stage 3) — small sanitizers not already
 * covered by quoteValidation.ts's cross-module exports (sanitizeShortText/sanitizeLongText/
 * validateIsoDateOrEmpty, already reused by scopeOfWorkHandler.ts/deliveryOrderHandler.ts).
 */

/** Quantity/cost fields that are `number | null` on the client types (plannedQty, withdrawal1Qty,
 * qtyRequested, estimatedCost, etc.) — mirrors the `number | null` convention QuoteLine/
 * ScopeOfWorkItem/DeliveryOrder already use throughout, rather than defaulting an absent value to 0
 * (indistinguishable from "the user typed zero"). */
export function sanitizeNullableNumber(v: unknown, fieldLabel: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new HttpError(400, `${fieldLabel}ต้องเป็นตัวเลข`);
  if (v < min || v > max) throw new HttpError(400, `${fieldLabel}ต้องอยู่ระหว่าง ${min} ถึง ${max}`);
  return v;
}

export function sanitizeEnum<T extends string>(v: unknown, allowed: readonly T[], fieldLabel: string): T {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new HttpError(400, `${fieldLabel}ไม่ถูกต้อง`);
}
