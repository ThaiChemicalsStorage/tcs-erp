import { countersCollection } from "./collections.js";

/**
 * Accounts Receivable document numbering (added 2026-08-17) — `{PREFIX}{YY}{MM}{SEQ}`, e.g.
 * `AR6907008`, matching the company's real existing "Express" accounting software numbering (read
 * straight off real reference PDFs, see docs/MODULES/Accounting.md) — not a scheme invented for this
 * ERP, one to match exactly.
 *
 * No existing counter uses this exact `PREFIX_YYMM` monthly-key shape: `quote_{YYMMDD}` (daily,
 * Gregorian `%100`, see api/handlers/quotes.ts's `todayYyMmDd()`) and `service_report_{buddhistYear}`
 * (yearly, Buddhist, see api/_lib/serviceReportHandler.ts's `nextServiceReportId()`) are each only
 * half the pattern. This copies `service_report_`'s **Buddhist**-year math, not `quote_`'s Gregorian
 * one — copying the wrong precedent would print the wrong century-digit on every single invoice.
 *
 * `yy`/`mm` are computed fresh on every call (never cached), so a New Year rollover is safe purely
 * because the counter `_id` naturally becomes a new string on Jan 1 — same reasoning `nextQuoteId()`
 * already relies on for its own daily rollover.
 */
export type ArDocumentPrefix = "AR" | "IV" | "BI" | "RE";

/** Bangkok-local Buddhist-era "YYMM", e.g. 2026-08 -> "2608" (พ.ศ. 2569 -> "69"). Exported for tests. */
export function bangkokBuddhistYyMm(now: Date = new Date()): { yy: string; mm: string } {
  const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const buddhistYear = bangkokNow.getUTCFullYear() + 543;
  const yy = String(buddhistYear % 100).padStart(2, "0");
  const mm = String(bangkokNow.getUTCMonth() + 1).padStart(2, "0");
  return { yy, mm };
}

export async function nextArDocNumber(
  counters: Awaited<ReturnType<typeof countersCollection>>,
  prefix: ArDocumentPrefix,
  /** Injectable for tests only (e.g. asserting a Dec 31 -> Jan 1 rollover) — real call sites never
   * pass this, letting it default to the real current time. */
  now: Date = new Date(),
): Promise<string> {
  const { yy, mm } = bangkokBuddhistYyMm(now);
  const key = `${prefix.toLowerCase()}_${yy}${mm}`;
  const result = await counters.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  const seq = result?.seq ?? 1;
  return `${prefix}${yy}${mm}${String(seq).padStart(3, "0")}`;
}

/**
 * เลขเอกสารภายในทุกใบ — `{PREFIX}-{YYYYMM}-{NNNN}` เช่น `PO-202609-0001` (คำสั่งเจ้าของ 2026-09-03:
 * "กำหนดรหัสเอกสารทุกอันให้เรียงแบบ ปีเดือน-ใบที่เท่าไหร่ของเดือนนั้น" · เจ้าของเลือก ค.ศ. 4 หลัก)
 *
 * ใช้กับ ใบสั่งซื้อ / ใบขอซื้อ / ใบสั่งงาน / ใบเบิก / ใบสั่งผลิต / Cost Control / รายงานบริการ /
 * ใบรับสินค้า — **ไม่ใช่** ใบเสนอราคา (`Q#YYMMDD-NNNN`) และเอกสารบัญชี AR/BI/RE/IV ด้านบน ซึ่งผูกกับ
 * เลขในโปรแกรม Express จริงของบริษัท · ใบเก่าที่ออกด้วยรูปแบบ `{PREFIX}-{พ.ศ.}-{NNNN}` ไม่ถูกเปลี่ยนเลข
 * ตัวนับเก่า (`purchase_order_2569` ฯลฯ) ปล่อยทิ้งไว้เฉย ๆ — ตัวนับใหม่ใช้กุญแจคนละชุด
 *
 * prefix ตัวอักษรต้องคงไว้เสมอ: `detectDocNumberFamily()` ใน searchShared.ts แยกหมวดเอกสารจาก
 * prefix เท่านั้น เลขเปล่า `202609-0001` จะทำให้ Global Search แยกไม่ออกว่าเป็นใบอะไร
 */
export function bangkokYyyyMm(now: Date = new Date()): { yyyy: string; mm: string } {
  const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return {
    yyyy: String(bangkokNow.getUTCFullYear()),
    mm: String(bangkokNow.getUTCMonth() + 1).padStart(2, "0"),
  };
}

export async function nextMonthlyDocumentNumber(
  counters: Awaited<ReturnType<typeof countersCollection>>,
  /** ตัวอักษรหน้าเลข เช่น `PO` — พิมพ์ลงเลขจริง */
  prefix: string,
  /** กุญแจตัวนับ เช่น `purchase_order` — ต่อท้ายด้วย `_YYYYMM` จึงเริ่ม 0001 ใหม่ทุกเดือน */
  counterKey: string,
  /** ฉีดได้เฉพาะในเทสต์ (ข้ามเดือน) — โค้ดจริงไม่ส่ง */
  now: Date = new Date(),
): Promise<string> {
  const { yyyy, mm } = bangkokYyyyMm(now);
  const result = await counters.findOneAndUpdate(
    { _id: `${counterKey}_${yyyy}${mm}` },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  const seq = result?.seq ?? 1;
  return `${prefix}-${yyyy}${mm}-${String(seq).padStart(4, "0")}`;
}
