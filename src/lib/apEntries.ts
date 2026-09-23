/**
 * ทะเบียนเจ้าหนี้ + ทะเบียนภาษีซื้อ (Accounts Payable) — added 2026-09-03 พร้อมใบรับสินค้า
 *
 * เจ้าของสั่งท้ายรายการงานสโตร์: *"บันทึกบัญชีเพื่อตั้งหนี้และได้ทะเบียนรายงานภาษีซื้อ ทะเบียนเจ้าหนี้
 * และการ์ด stock"* — สามอย่างนี้เป็นผลของ **การรับของครั้งเดียว** ไม่ใช่งานคีย์แยกของบัญชี
 * (การ์ดสต๊อกอยู่ที่หน้าสต๊อก ส่วนอีกสองทะเบียนอ่านจากตารางนี้)
 *
 * หนึ่งแถว = หนี้หนึ่งก้อนที่ตั้งจากเอกสารหนึ่งใบ ตอนนี้ระบบออกได้แค่ `entryType: "RR"` (รับของ)
 * เท่านั้น — รหัสประเภทอื่น (RM ผู้รับเหมา, RD ค่าขนส่ง, RO ค่าใช้จ่ายทั่วไป …) เป็นของจริงใน
 * ชีตบัญชีจ่ายของบริษัท (ดู MODULES/Accounting.md) แต่ยังไม่มีเอกสารต้นทางในระบบ จึงเปิด union
 * ไว้ตัวเดียวก่อน ไม่เดารหัสที่ยังไม่มีใครใช้
 *
 * **ไม่มีหน้าสร้างหนี้ด้วยมือ** ทุกแถวมาจากใบรับสินค้า — ถ้าเปิดให้พิมพ์เองได้ ทะเบียนกับสต๊อกจะแยกกัน
 * เดินทันที บัญชีแก้ได้แค่สถานะจ่าย/ไม่จ่าย
 */

import { apiFetch } from "./apiClient.js";

/** รหัสรับเข้าของใบรับสินค้าที่ตั้งหนี้ก้อนนี้ — `RR` ซื้อเชื่อ-วัตถุดิบ / `RX` โรงงาน / `RI` โครงการ (2026-09-23) */
export type ApEntryType = "RR" | "RX" | "RI";
export type ApEntryStatus = "Unpaid" | "Paid";

export interface ApEntry {
  id: string;
  entryType: ApEntryType;
  receivingReportId: string;
  receivingReportNumber: string;
  /** รอบการรับที่ตั้งหนี้ก้อนนี้ — ใช้ย้อนกลับตอนยกเลิกรอบ */
  batchId: string;
  purchaseOrderNumber: string;
  jobCode: string;
  vendorName: string;
  vendorTaxId: string;
  vendorAddress: string;
  /** เลขที่ใบกำกับภาษีของผู้ขาย — คอลัมน์บังคับของรายงานภาษีซื้อ */
  invoiceNumber: string;
  invoiceDate: string;
  description: string;
  subtotal: number;
  vatRate: number | null;
  vatAmt: number;
  total: number;
  status: ApEntryStatus;
  paidAt?: string;
  paidBy?: string;
  /** เลขที่เช็ค/อ้างอิงการจ่าย — บัญชีกรอกตอนกด "จ่ายแล้ว" */
  paymentRef?: string;
  postedAt: string;
  postedBy: string;
  postedByName: string;
}

export interface ApVendorSummaryRow {
  vendorName: string;
  entryCount: number;
  unpaidTotal: number;
  paidTotal: number;
}

export interface ApRegisterSummary {
  month: string;
  /** ยอดรวมของเดือน — ใช้เป็นท้ายตารางทะเบียนภาษีซื้อ */
  subtotal: number;
  vatAmt: number;
  total: number;
  unpaidTotal: number;
  vendors: ApVendorSummaryRow[];
}

export interface ApEntryFilter {
  /** YYYY-MM — กรองตาม `invoiceDate` (เดือนภาษี) ไม่ใช่วันที่ตั้งหนี้ */
  month?: string;
  vendor?: string;
  status?: ApEntryStatus | "";
}

function toQuery(filter: ApEntryFilter): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchApEntries(filter: ApEntryFilter): Promise<ApEntry[]> {
  const { apEntries } = await apiFetch<{ apEntries: ApEntry[] }>(`/ap-entries${toQuery(filter)}`);
  return apEntries;
}

export async function fetchApSummary(month: string): Promise<ApRegisterSummary> {
  const { summary } = await apiFetch<{ summary: ApRegisterSummary }>(`/ap-entries/summary?month=${encodeURIComponent(month)}`);
  return summary;
}

/** ทำเครื่องหมายจ่ายแล้ว / ยกเลิกการจ่าย — ยอดเงินแก้ไม่ได้ ต้องไปยกเลิกรอบรับของแทน */
export async function updateApEntry(id: string, fields: { status: ApEntryStatus; paymentRef?: string }): Promise<ApEntry> {
  const { apEntry } = await apiFetch<{ apEntry: ApEntry }>(`/ap-entries/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(fields),
  });
  return apEntry;
}
