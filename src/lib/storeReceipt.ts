import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";
import type { StoreReceiptCode } from "./storeCodes.js";

/**
 * ใบรับคืน / รับเข้าคลัง ของสโตร์ (2026-09-23) — เอกสารคู่ของใบเบิกของสโตร์ ตามภาพเมนู "ปรับยอดสินค้า" ที่เจ้าของ
 * ส่งมา (15 รหัส) · รหัสเลือกตอนสร้างจากดรอปดาวน์ และเป็นตัวอักษรหน้าเลขที่ใบ (`JD-202609-0001`)
 *
 * สามพฤติกรรมตามรหัส (`storeReceiptCodeInfo(code).kind`):
 *  - **return** (JD/J1/J2/J3/JP/JB/JS/JC/JT) — คืนของจาก **ใบเบิกของสโตร์ที่รหัสคู่กัน** (JD ↔ PD …) รายการดึงจาก
 *    ใบเบิกนั้น คืนได้ไม่เกินที่จ่ายไปลบที่คืนแล้ว และตอนรับเข้าคลังจะบวกยอดคืนลงใบเบิกต้นทางด้วย
 *    (ช่อง `returnQty` ของบรรทัด) ตัวเลขสองใบจึงตรงกันเสมอ
 *  - **receive** (FG/FP/GC/JN) — รับของเข้าคลังพร้อมต้นทุน (สินค้าสำเร็จรูป, ของลูกค้า, น็อตเป็นชุด)
 *  - **adjust** (JU/TK) — ตั้งยอดคงเหลือใหม่ (`qty` = ยอดที่ถูกต้อง/นับได้จริง) ระบบลงส่วนต่างให้
 *
 * ขั้นตอน: ร่าง → รออนุมัติ → อนุมัติ (เครื่องอนุมัติร่วม `documentApproval.ts` สิทธิ์ `materialRequisition:*`
 * ชุดเดียวกับใบเบิก) → สโตร์กด **รับเข้าคลัง** หนึ่งครั้ง (`stock:adjust`) สต๊อกจึงเปลี่ยน · รับเข้าแล้วแก้/ลบไม่ได้
 * ถ้าผิดให้ออกใบ JU แก้ — ตรงกับที่บัญชีทำในโปรแกรมเดิม
 *
 * ห้ามดึง React/i18n เข้ามาในไฟล์นี้ (เซิร์ฟเวอร์ import ชนิดข้อมูลจากที่นี่)
 */

export type StoreReceiptStatus = "Draft" | "PendingApproval" | "Final";

export interface StoreReceiptLine {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  /** return = จำนวนคืน · receive = จำนวนรับ · adjust = **ยอดคงเหลือที่ถูกต้อง** */
  qty: number | null;
  /** ต้นทุนต่อหน่วย — ใช้กับ receive เท่านั้น (ว่าง = ใช้ต้นทุนเฉลี่ยเดิม) */
  unitCost: number | null;
  /** บรรทัดของใบเบิกต้นทาง — ใช้กับ return เท่านั้น */
  sourceLineId?: string;
}

export interface StoreReceipt {
  id: string;
  documentNumber: string;
  receiptCode: StoreReceiptCode;
  /** ใบเบิกของสโตร์ที่คืนของให้ — return เท่านั้น */
  sourceRequisitionId: string;
  sourceRequisitionNumber: string;
  jobCode: string;
  customerName: string;
  /** ใบสั่งผลิต / รหัสงาน / ใบเบิก PN ที่อ้าง — receive */
  reference: string;
  /** เหตุผลการปรับ — adjust บังคับ */
  reason: string;
  receivedDate: string;
  chargeDepartmentId: string;
  chargeDepartmentName: string;
  chargeTeamId: string;
  chargeTeamName: string;
  lines: StoreReceiptLine[];
  returnedBy: string;
  receivedBy: string;
  preparedBy: string;
  preparedAt: string;
  approvedBy: string;
  approvedAt: string;
  approvedByUserId?: string;
  rejectionComment?: string;
  storeDeptBy: string;
  storeDeptAt: string;
  costDeptBy: string;
  costDeptAt: string;
  status: StoreReceiptStatus;
  /** เวลาที่กดรับเข้าคลัง — ว่าง = ยังไม่ได้แตะสต๊อก */
  postedAt: string;
  postedBy: string;
  postedByName: string;
  stockMovementIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

export interface StoreReceiptSummary {
  id: string;
  documentNumber: string;
  receiptCode: StoreReceiptCode;
  status: StoreReceiptStatus;
  posted: boolean;
  jobCode: string;
  reference: string;
  sourceRequisitionNumber: string;
  chargeDepartmentName: string;
  chargeTeamName: string;
  updatedAt: string;
}

/** บรรทัดของใบเบิกต้นทางที่ยังคืนได้ — หน้าจอใช้โชว์ "จ่ายไป / คืนแล้ว" */
export interface StoreReceiptSourceLine {
  lineId: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  issued: number;
  returned: number;
}

/** ใบเบิกที่เลือกเป็นต้นทางของใบคืนได้ — อนุมัติแล้ว รหัสคู่กัน และยังมีของที่ยังไม่คืน */
export interface StoreReceiptSourceCandidate {
  id: string;
  documentNumber: string;
  jobCode: string;
  storeReference: string;
  chargeDepartmentName: string;
  chargeTeamName: string;
  updatedAt: string;
}

export interface StoreReceiptBundle {
  storeReceipt: StoreReceipt;
  stockByProduct: Record<string, number>;
  sourceLines: StoreReceiptSourceLine[];
}

export type StoreReceiptUpdateFields = Partial<Pick<StoreReceipt,
  "documentNumber" | "jobCode" | "customerName" | "reference" | "reason" | "receivedDate"
  | "returnedBy" | "receivedBy" | "preparedBy" | "preparedAt" | "approvedBy" | "approvedAt"
  | "storeDeptBy" | "storeDeptAt" | "costDeptBy" | "costDeptAt" | "sourceRequisitionId">> & {
  lines?: Pick<StoreReceiptLine, "id" | "productId" | "qty" | "unitCost" | "sourceLineId">[];
};

export function blankStoreReceiptLine(): StoreReceiptLine {
  return {
    id: `srline_new_${Math.random().toString(36).slice(2, 10)}`,
    productId: "", productCode: "", productName: "", unit: "", qty: null, unitCost: null,
  };
}

// ── API ──────────────────────────────────────────────────────────────────────

export async function fetchStoreReceipts(): Promise<StoreReceiptSummary[]> {
  const { storeReceipts } = await apiFetch<{ storeReceipts: StoreReceiptSummary[] }>("/store-receipts");
  return storeReceipts;
}
export async function fetchStoreReceipt(id: string): Promise<StoreReceiptBundle> {
  return apiFetch<StoreReceiptBundle>(`/store-receipts/${encodeURIComponent(id)}`);
}
export async function createStoreReceipt(receiptCode: StoreReceiptCode): Promise<StoreReceipt> {
  const { storeReceipt } = await apiFetch<{ storeReceipt: StoreReceipt }>("/store-receipts", {
    method: "POST", body: JSON.stringify({ receiptCode }),
  });
  return storeReceipt;
}
export async function updateStoreReceipt(id: string, fields: StoreReceiptUpdateFields, options?: WriteOptions): Promise<StoreReceiptBundle> {
  return apiFetch<StoreReceiptBundle>(`/store-receipts/${encodeURIComponent(id)}${writeQuery(options)}`, {
    method: "PATCH", body: JSON.stringify(fields),
  });
}
export async function deleteStoreReceipt(id: string): Promise<void> {
  await apiFetch(`/store-receipts/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export async function fetchStoreReceiptSourceCandidates(receiptCode: StoreReceiptCode): Promise<StoreReceiptSourceCandidate[]> {
  const { requisitions } = await apiFetch<{ requisitions: StoreReceiptSourceCandidate[] }>(
    `/store-receipts/source-requisitions?receiptCode=${encodeURIComponent(receiptCode)}`,
  );
  return requisitions;
}
async function action(id: string, verb: string, body?: unknown): Promise<StoreReceipt> {
  const { storeReceipt } = await apiFetch<{ storeReceipt: StoreReceipt }>(`/store-receipts/${encodeURIComponent(id)}/${verb}`, {
    method: "POST", body: body === undefined ? undefined : JSON.stringify(body),
  });
  return storeReceipt;
}
export const submitStoreReceiptApproval = (id: string) => action(id, "submit-approval");
export const approveStoreReceipt = (id: string) => action(id, "approve");
export const rejectStoreReceipt = (id: string, comment: string) => action(id, "reject", { comment });
export const withdrawStoreReceiptApproval = (id: string) => action(id, "withdraw-approval");
/** รับเข้าคลัง — สต๊อกเปลี่ยนตรงนี้ครั้งเดียว (ใบต้องอนุมัติแล้ว) */
export async function postStoreReceipt(id: string): Promise<StoreReceiptBundle> {
  return apiFetch<StoreReceiptBundle>(`/store-receipts/${encodeURIComponent(id)}/post`, { method: "POST" });
}
export async function logStoreReceiptPrinted(id: string): Promise<void> {
  await apiFetch(`/store-receipts/${encodeURIComponent(id)}/print`, { method: "POST" });
}
