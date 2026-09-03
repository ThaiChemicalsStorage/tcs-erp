import { apiFetch } from "./apiClient.js";
import type { StockMovementKind } from "./stock.js";

/**
 * เครื่องมือประจำทีม (2026-09-03) — อ่านอย่างเดียว ไม่มีเอกสารของตัวเอง ทุกตัวเลขมาจากบัญชีเดินสะพัด
 * ของสต๊อกที่ใบเบิกประทับแผนก/ทีมไว้ ดู api/_lib/toolHoldingsHandler.ts
 */
export interface ToolHoldingRow {
  departmentId: string;
  departmentName: string;
  teamId: string;
  teamName: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  issued: number;
  returned: number;
  held: number;
  lastSourceLabel: string;
  lastMovementAt: string;
}

export interface ToolReportRow {
  id: string;
  createdAt: string;
  kind: StockMovementKind;
  /** บวก = ทีมเบิกไป, ลบ = ทีมคืน */
  qty: number;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  sourceLabel: string;
  departmentName: string;
  teamName: string;
  workTypeName: string;
  createdBy: string;
}

export interface ToolFilter {
  departmentId?: string;
  teamId?: string;
  workTypeCode?: string;
  from?: string;
  to?: string;
}

function toQuery(filter: ToolFilter, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filter, ...extra })) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchToolHoldings(filter: ToolFilter): Promise<ToolHoldingRow[]> {
  const { holdings } = await apiFetch<{ holdings: ToolHoldingRow[] }>(`/tool-holdings${toQuery(filter)}`);
  return holdings;
}

export async function fetchToolReport(filter: ToolFilter): Promise<{ rows: ToolReportRow[]; truncated: boolean }> {
  return apiFetch<{ rows: ToolReportRow[]; truncated: boolean }>(`/tool-holdings${toQuery(filter, { report: "1" })}`);
}
