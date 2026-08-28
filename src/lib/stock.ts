import { apiFetch } from "./apiClient.js";
import type { TranslationKey } from "./i18n.js";

/**
 * Product Stock (added 2026-08-18). See api/_lib/collections.ts's StockMovementFields doc comment
 * for why this ledger is deliberately shared/document-agnostic — Accounting's IV stock-cutting
 * feature (src/pages/accounting/ArStockPanel.tsx) is the first caller, not the only intended one.
 */
export type StockMovementKind = "receive" | "deduct" | "adjust";
export type StockMovementSourceType = "manual" | "ar_document";

export interface StockMovement {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  kind: StockMovementKind;
  delta: number;
  balanceAfter: number;
  reason: string;
  sourceType: StockMovementSourceType;
  sourceId?: string;
  sourceLabel?: string;
  createdAt: string;
  createdBy: string;
}

export const STOCK_MOVEMENT_KIND_LABELS: Record<StockMovementKind, string> = {
  receive: "รับเข้า",
  deduct: "ตัดออก",
  adjust: "ปรับยอด",
};

/** i18n key equivalent of the map above — same `t(SOME_LABEL_KEY[x])` pattern as
 * `DOC_TYPE_LABEL_KEY` (src/lib/accounting.ts). Use this (not the plain-Thai map above) in any
 * on-screen UI. Added 2026-08-18. */
export const STOCK_MOVEMENT_KIND_LABEL_KEY: Record<StockMovementKind, TranslationKey> = {
  receive: "stock.movementKind.receive",
  deduct: "stock.movementKind.deduct",
  adjust: "stock.movementKind.adjust",
};

export async function fetchStockMovements(filter?: { productId?: string; sourceId?: string }): Promise<StockMovement[]> {
  const params = new URLSearchParams();
  if (filter?.productId) params.set("productId", filter.productId);
  if (filter?.sourceId) params.set("sourceId", filter.sourceId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const { movements } = await apiFetch<{ movements: StockMovement[] }>(`/stock-movements${qs}`);
  return movements;
}

/** Manual receive/deduct/adjust from the Stock page — not tied to any document. */
export async function createStockMovement(fields: {
  productId: string;
  kind: StockMovementKind;
  qty?: number; // for "receive"/"deduct" — a positive magnitude
  delta?: number; // for "adjust" — a signed correction
  reason: string;
}): Promise<StockMovement> {
  const { movement } = await apiFetch<{ movement: StockMovement }>("/stock-movements", {
    method: "POST",
    body: JSON.stringify(fields),
  });
  return movement;
}
