import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";

/**
 * ใบรับวางบิล (BR) ของสโตร์ — 2026-09-23 · เจ้าของส่งตัวอย่างจากโปรแกรมบัญชีเดิมมา (`reference/company/ใบวางบิล.pdf`,
 * BR6909091) พร้อมคำสั่ง *"อยากให้ทำหน้าใบวางบิลของสโตร์เพิ่มให้หน่อย"* และเลือกแบบ **ไม่ต้องอนุมัติ**
 *
 * ผู้ขายมาวางบิล → สโตร์เลือกผู้ขาย → ติ๊กใบรับสินค้าที่ยังไม่จ่ายของผู้ขายนั้น → บันทึก → พิมพ์ให้ผู้ขายเซ็นรับ
 *
 * **ไม่มีตัวเลขเงินเก็บในใบนี้เลย** — เก็บแค่ `apEntryIds` (หนี้ในทะเบียนเจ้าหนี้ หนึ่งแถวต่อหนึ่งรอบการรับ) แล้ว
 * อ่านยอด/วันที่/สถานะจ่ายจากทะเบียนเจ้าหนี้ทุกครั้งที่เปิด คอลัมน์ "จ่ายแล้ว / เงินคงค้าง" จึงตรงกับที่บัญชี
 * ติ๊กจ่ายไว้เสมอ และตัวเลขมีที่มาที่เดียว (หนี้หนึ่งก้อนแก้ยอดไม่ได้อยู่แล้ว ต้องยกเลิกรอบรับทั้งรอบ)
 *
 * กติกา: หนี้หนึ่งก้อนอยู่ในใบรับวางบิลที่ยังไม่ถูกลบได้ใบเดียว · ต้องเป็นของผู้ขายรายเดียวกับหัวใบ ·
 * รอบการรับที่อยู่ในใบรับวางบิลยกเลิกไม่ได้ (เอาออกจากใบก่อน) — กันแถวในใบชี้ไปหาหนี้ที่หายไปแล้ว
 *
 * ⚠️ เคยมี "ใบรับวางบิล" ของฝ่ายจัดซื้อ สร้างและถอดออกวันเดียวกัน 2026-08-28 (ดู MODULES/Purchasing.md) ·
 * ใบนี้เป็นของใหม่ ใช้คอลเลกชันใหม่ ไม่แตะ `bill_receipts` ที่ถูกทิ้งไว้
 *
 * ห้ามดึง React/i18n เข้ามาในไฟล์นี้ (เซิร์ฟเวอร์ import ชนิดข้อมูลจากที่นี่)
 */

export interface VendorBill {
  id: string;
  documentNumber: string;
  vendorName: string;
  vendorCode: string;
  vendorTaxId: string;
  vendorAddress: string;
  /** วันที่รับวางบิล */
  billDate: string;
  /** เงื่อนไขการชำระเงิน (วันเครดิต) — ใช้คิดวันครบกำหนดของแถวที่ใบสั่งซื้อไม่ได้ระบุเครดิต */
  creditDays: number | null;
  /** วันที่นัดจ่ายชำระ — บรรทัดท้ายของฟอร์ม */
  paymentDate: string;
  remarks: string;
  apEntryIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

/** หนึ่งแถวของใบ — ประกอบจากทะเบียนเจ้าหนี้ตอนอ่าน ไม่ได้เก็บ */
export interface VendorBillRow {
  apEntryId: string;
  receivingReportId: string;
  /** เลขที่ใบรับสินค้า + "/รอบ" เมื่อใบนั้นรับหลายรอบ */
  receivingReportNumber: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  paid: number;
  outstanding: number;
  /** หนี้ก้อนนี้หายไปจากทะเบียน (ไม่ควรเกิด — การยกเลิกรอบถูกกันไว้แล้ว) */
  missing?: boolean;
}

export interface VendorBillBundle {
  vendorBill: VendorBill;
  rows: VendorBillRow[];
}

export interface VendorBillSummary {
  id: string;
  documentNumber: string;
  vendorName: string;
  billDate: string;
  paymentDate: string;
  rowCount: number;
  total: number;
  outstanding: number;
  updatedAt: string;
}

/** หนี้ที่ยังไม่จ่ายและยังไม่อยู่ในใบรับวางบิลใบไหน — ตัวเลือกตอนสร้าง/เพิ่มแถว */
export interface VendorBillCandidate extends VendorBillRow {
  vendorName: string;
}

export type VendorBillUpdateFields = Partial<Pick<VendorBill, "billDate" | "creditDays" | "paymentDate" | "remarks" | "apEntryIds">>;

export function vendorBillTotals(rows: VendorBillRow[]): { amount: number; paid: number; outstanding: number } {
  return rows.reduce((t, r) => ({ amount: t.amount + r.amount, paid: t.paid + r.paid, outstanding: t.outstanding + r.outstanding }), { amount: 0, paid: 0, outstanding: 0 });
}

// ── API ──────────────────────────────────────────────────────────────────────

export async function fetchVendorBills(): Promise<VendorBillSummary[]> {
  const { vendorBills } = await apiFetch<{ vendorBills: VendorBillSummary[] }>("/vendor-bills");
  return vendorBills;
}

/** ไม่ระบุผู้ขาย = หนี้ที่เลือกได้ของทุกผู้ขาย (หน้าจอใช้ทำรายชื่อผู้ขายที่มีบิลค้าง) */
export async function fetchVendorBillCandidates(vendorName?: string): Promise<VendorBillCandidate[]> {
  const qs = vendorName ? `?vendor=${encodeURIComponent(vendorName)}` : "";
  const { candidates } = await apiFetch<{ candidates: VendorBillCandidate[] }>(`/vendor-bills/candidates${qs}`);
  return candidates;
}

/** สร้างใบของผู้ขายรายนี้ — ติ๊กหนี้ที่ยังไม่จ่ายของผู้ขายนั้นให้ทั้งหมด (เอาออกทีหลังได้) */
export async function createVendorBill(vendorName: string): Promise<VendorBillBundle> {
  return apiFetch<VendorBillBundle>("/vendor-bills", { method: "POST", body: JSON.stringify({ vendorName }) });
}

export async function fetchVendorBill(id: string): Promise<VendorBillBundle> {
  return apiFetch<VendorBillBundle>(`/vendor-bills/${encodeURIComponent(id)}`);
}

export async function updateVendorBill(id: string, fields: VendorBillUpdateFields, opts?: WriteOptions): Promise<VendorBillBundle> {
  return apiFetch<VendorBillBundle>(`/vendor-bills/${encodeURIComponent(id)}${writeQuery(opts)}`, {
    method: "PATCH", body: JSON.stringify(fields),
  });
}

export async function deleteVendorBill(id: string): Promise<void> {
  await apiFetch<void>(`/vendor-bills/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function logVendorBillPrinted(id: string): Promise<void> {
  await apiFetch(`/vendor-bills/${encodeURIComponent(id)}/print`, { method: "POST" });
}
