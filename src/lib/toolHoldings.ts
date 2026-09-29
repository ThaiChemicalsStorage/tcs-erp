import { apiFetch } from "./apiClient.js";
import type { StockMovementKind } from "./stock.js";
import type { Product } from "./products.js";

/**
 * เครื่องมือประจำทีม (2026-09-03) — ไม่มีคอลเล็กชันของตัวเอง ทุกตัวเลขมาจากบัญชีเดินสะพัดของสต๊อก
 * ที่ประทับแผนก/ทีมไว้ ดู api/_lib/toolHoldingsHandler.ts
 *
 * `fetchToolHoldings()` / `fetchToolReport()` อ่านอย่างเดียว แต่ตั้งแต่ 2026-09-03b โมดูลนี้
 * **เขียนได้ด้วย** ผ่าน `issueTools()` ที่ท้ายไฟล์ (จ่าย/รับคืนตรงจากหน้าเครื่องมือ ได้เลข TL- ของตัวเอง)
 * ยอดถือครองจึงรวมทั้งของที่จ่ายตามใบเบิกและที่จ่ายตรงจากหน้านี้
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

/**
 * จ่าย / รับคืนเครื่องมือให้ทีมโดยตรง (2026-09-03 รอบสอง) — เจ้าของสั่ง *"หน้าตัดเบิกเครื่องมือ
 * มีแผนกในการเบิกโครงการหรือผลิต"*
 *
 * เขียนลงบัญชีสต๊อกชุดเดียวกับใบเบิก ต่างแค่ `sourceType` และได้เลขที่ของตัวเอง `TL-YYYYMM-NNNN`
 * หนึ่งเลขต่อการกดหนึ่งครั้ง — ยอดถือครองจึงรวมของที่จ่ายทั้งสองทางเสมอ
 */
export interface ToolIssueInput {
  mode: "issue" | "return";
  departmentId: string;
  /** บังคับ — ยอดถือครองเป็นของทีม ไม่ใช่ของแผนก */
  teamId: string;
  workTypeCode?: string;
  note?: string;
  lines: { productId: string; qty: number }[];
}

export async function issueTools(input: ToolIssueInput): Promise<{ slipNumber: string; lineCount: number }> {
  return apiFetch<{ slipNumber: string; lineCount: number }>("/tool-holdings/issue", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * เครื่องมือกองกลาง (2026-09-29) — เพิ่มจากหน้าเครื่องมือประจำทีมได้เลย ไม่ผ่านคลังสินค้า · รหัสเว้นว่าง = ระบบออก `CT-0001`
 * · `qty` = ยอดเริ่มต้น (ลงบัญชีสต๊อกเป็นการปรับยอด) ดู `Product.commonTool`
 */
export async function createCommonTool(input: { code?: string; name: string; unit?: string; qty?: number }): Promise<Product> {
  const { product } = await apiFetch<{ product: Product }>("/tool-holdings/tools", { method: "POST", body: JSON.stringify(input) });
  return product;
}

/** ตั้งยอดคงเหลือของเครื่องมือกองกลาง — `qty` คือยอดที่ควรเป็น (ไม่ใช่ยอดที่จะบวก) ระบบลงส่วนต่างให้ */
export async function setCommonToolStock(productId: string, qty: number, note?: string): Promise<Product> {
  const { product } = await apiFetch<{ product: Product }>(`/tool-holdings/tools/${encodeURIComponent(productId)}/stock`, {
    method: "POST", body: JSON.stringify({ qty, note }),
  });
  return product;
}
