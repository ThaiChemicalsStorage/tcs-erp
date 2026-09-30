import type { ApEntry } from "../../lib/apEntries";
import type { ArAgingBucketKey } from "../../lib/accountingDashboard";

/**
 * ตัวช่วยล้วน (ไม่มี React) ของหน้าบัญชี — เดิมทั้งสามหน้ารายงาน (สรุปเอกสารประจำเดือน ทะเบียนภาษีซื้อ
 * ทะเบียนเจ้าหนี้) ต่างคนต่างลอก currentMonthLocal/thaiMonthLabel ไว้คนละชุด รวมไว้ที่นี่ตอนย้ายหน้าเข้าดีไซน์ใหม่
 */

export const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });

export function currentMonthLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

/** "2026-09" -> "กันยายน 2569" (พ.ศ.) — ชื่อเดือนภาษาไทยเสมอ เหมือนหัวรายงานที่พิมพ์ */
export function thaiMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

/** เดือน (YYYY-MM) ที่มีเอกสารอยู่จริง ใหม่สุดก่อน — ใช้เป็นตัวเลือกของตัวกรองเดือนในหน้ารายการ */
export function monthsPresent(isoDates: readonly string[]): string[] {
  return [...new Set(isoDates.map((d) => d.slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort().reverse();
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * ตัวเลขตัวอย่างบนหน้าสร้างใบกำกับภาษี (Manual) — สูตรเดียวกับ `computeArDocumentTotals()` ฝั่งเซิร์ฟเวอร์
 * (api/_lib/arCalculations.ts: ปัดทีละบรรทัด → รวม → VAT 7% ปัด 2 ตำแหน่ง) เพื่อให้ยอดที่เห็นก่อนกดตรงกับ
 * ใบที่ออกจริงทุกสตางค์ · เซิร์ฟเวอร์ยังคำนวณเองเสมอ ตัวเลขนี้เป็นแค่ภาพตัวอย่าง
 * ต้องแก้คู่กับ arCalculations.ts เสมอ — tests/accountingManualTotals.test.ts เทียบสองฝั่งให้
 */
export function manualLineAmount(qty: number, unitPrice: number): number {
  if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return 0;
  return round2(qty * unitPrice);
}

export function manualTotals(lineAmounts: readonly number[]): { valueAmount: number; vatAmount: number; netTotal: number } {
  const valueAmount = round2(lineAmounts.reduce((s, a) => s + a, 0));
  const vatAmount = round2(valueAmount * 0.07);
  return { valueAmount, vatAmount, netTotal: round2(valueAmount + vatAmount) };
}

export interface ApVendorGroup {
  vendorName: string;
  vendorTaxId: string;
  rows: ApEntry[];
  unpaid: number;
}

/** จัดกลุ่มหนี้ตามผู้ขาย — ผู้ขายที่ค้างจ่ายมากสุดขึ้นก่อน (ลำดับเดียวกับหน้าเดิมที่แยกตารางละผู้ขาย) */
export function groupApEntriesByVendor(entries: readonly ApEntry[], unknownVendorLabel: string): ApVendorGroup[] {
  const byVendor = new Map<string, ApEntry[]>();
  for (const e of entries) {
    const key = e.vendorName || unknownVendorLabel;
    byVendor.set(key, [...(byVendor.get(key) ?? []), e]);
  }
  const unpaidOf = (rows: ApEntry[]) => rows.filter((r) => r.status !== "Paid").reduce((s, r) => s + r.total, 0);
  return [...byVendor.entries()]
    .map(([vendorName, rows]) => ({ vendorName, vendorTaxId: rows[0].vendorTaxId, rows, unpaid: unpaidOf(rows) }))
    .sort((a, b) => b.unpaid - a.unpaid);
}

/** อายุหนี้ไล่เฉดน้ำเงินจากอ่อน (ยังไม่ครบกำหนด) ไปเข้ม (เกิน 90 วัน) — ใช้ร่วมกับแถบในการ์ดตัวเลข */
export const AGING_RAMP: Record<ArAgingBucketKey, string> = {
  notDue: "#c9dbf3",
  d1_30: "#9dbde8",
  d31_60: "#6f9bd9",
  d61_90: "#3f78c6",
  d90plus: "#1a4f96",
};
