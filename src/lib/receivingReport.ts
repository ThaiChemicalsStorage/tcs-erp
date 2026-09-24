/**
 * ใบรับสินค้า (Receiving Report / RR) — added 2026-09-03 for the Store department (แผนกสโตร์),
 * from the owner's 8-point list: *"ใบรับสินค้า RR รับสินค้าคือสามารถรับแค่บางส่วนได้ มีช่องให้กรอกแบบ
 * ราคาต่อหน่วยเท่าไหร่ จำนวนเท่าไหร่ กี่บาท สามารถกรอกในใบเดิมเพิ่มเติมได้ ดูได้ว่ารายการสินค้าที่รับแล้ว
 * เท่าไหร่ รายการยอดสินค้าค้างรับเท่าไหร่ … ทั้งหมดนี้คือใบเดียวกัน"*
 *
 * **หนึ่งใบสั่งซื้อ = หนึ่งใบรับสินค้า** (เจ้าของเคาะ 2026-09-03) สร้างจากใบสั่งซื้อที่อนุมัติแล้ว
 * แล้ว *รับได้หลายรอบในใบเดียวกัน* — แต่ละรอบคือหนึ่ง `ReceivingBatch` ที่มีเลขที่ใบกำกับภาษีของผู้ขาย
 * ของตัวเอง เมื่อบันทึกรอบหนึ่ง ระบบจะ (1) เพิ่มสต๊อกพร้อมต้นทุน (2) ตั้งหนี้ลงทะเบียนเจ้าหนี้/ภาษีซื้อ
 * ทั้งสองอย่างเป็นผลพลอยได้ของ "รับของ" ครั้งเดียว ไม่ต้องไปคีย์ซ้ำที่บัญชี
 *
 * บรรทัดสินค้าเป็น **snapshot** จากใบสั่งซื้อตอนสร้าง (กติกาเดียวกับ PR→PO) — แก้ใบสั่งซื้อทีหลัง
 * ไม่ย้อนมาเปลี่ยนใบรับสินค้าที่รับของไปแล้ว
 *
 * ยอด "สั่ง / รับแล้ว / ค้างรับ" **คำนวณตอนอ่านเสมอ ไม่เก็บลงฐานข้อมูล** — ตัวเลขที่เก็บซ้ำสองที่
 * คือตัวเลขที่วันหนึ่งจะไม่ตรงกัน ฟังก์ชันในไฟล์นี้เป็นตัวคิดชุดเดียวที่ทั้งหน้าจอและเซิร์ฟเวอร์ใช้ร่วมกัน
 * (ห้ามดึง React/i18n เข้ามาในไฟล์นี้ — `tests/serverImportGraph.test.ts` จะฟ้อง)
 *
 * ⚠️ **ใบพิมพ์ยังไม่ใช่ฟอร์มจริง** เจ้าของยังไม่ได้ส่งฟอร์มกระดาษมา เหมือนใบสั่งซื้อตอนเริ่ม
 */

import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";
import { resolveDiscountAmount, lineSubtotal, VAT_RATE, type DiscountMode } from "./quoteMath.js";
import type { DocumentAttachment } from "./documentAttachments.js";
import type { TranslationKey } from "./i18n.js";
import { uploadDocumentAttachment, deleteDocumentAttachment, fileToBase64 } from "./documentAttachments.js";

export type ReceivingReportStatus = "Open" | "Closed";

/**
 * รหัสรับเข้า = ตัวอักษรหน้าเลขที่ใบ (คำสั่งเจ้าของ 2026-09-23: *"เวลาสร้างใบที่ติด PO หรือไม่มี PO ก็ตาม
 * ให้สามารถเลือกรหัสรับเข้าได้ RR - ซื้อเชื่อ-วัตถุดิบ / RX - โรงงาน / RI - โครงการ"*) — รหัสเดียวกับชีต
 * บัญชีจ่ายของบริษัท จึงเป็น `entryType` ของหนี้ที่ใบนี้ตั้งด้วย (ดู `apEntries.ts`)
 *
 * แต่ละรหัสนับเลขแยกกัน · `RR` ใช้ตัวนับเดิม เลขจึงต่อจากใบเก่า · ใบก่อนวันนี้ไม่มีฟิลด์ อ่านเป็น `RR`
 */
export type ReceivingReportCode = "RR" | "RX" | "RI";
export const RECEIVING_REPORT_CODES: readonly ReceivingReportCode[] = ["RR", "RX", "RI"];
export const RECEIVING_REPORT_CODE_LABEL_KEY: Record<ReceivingReportCode, TranslationKey> = {
  RR: "receivingReport.code.RR", RX: "receivingReport.code.RX", RI: "receivingReport.code.RI",
};

export function isReceivingReportCode(v: unknown): v is ReceivingReportCode {
  return typeof v === "string" && (RECEIVING_REPORT_CODES as readonly string[]).includes(v);
}

export function receivingReportCodeOf(doc: { id: string; receiveCode?: ReceivingReportCode }): ReceivingReportCode {
  if (doc.receiveCode) return doc.receiveCode;
  const prefix = doc.id.split("-")[0];
  return isReceivingReportCode(prefix) ? prefix : "RR";
}

/**
 * ใบเปล่า = ใบที่ไม่ได้สร้างจากใบสั่งซื้อ (2026-09-23) — สโตร์กรอกผู้ขายและรายการเอง แล้วรับของเป็นรอบ
 * แบบเดียวกับใบที่มีใบสั่งซื้อทุกอย่าง (สต๊อก + ตั้งหนี้) ต่างกันแค่ใบเปล่าแก้หัวใบและรายการได้
 */
export function isBlankReceivingReport(doc: { purchaseOrderId: string }): boolean {
  return !doc.purchaseOrderId;
}

/**
 * ประเภทราคา (คำสั่งเจ้าของ 2026-09-24: *"หน้าใบรับสินค้าอยากให้มี dropdown ประเภทราคา ไม่มี Vat, แยก Vat, รวม Vat"*)
 * — ชุดเดียวกับโปรแกรมบัญชีเดิม · `none` = ผู้ขายไม่จด VAT · `exclusive` = ราคายังไม่รวม VAT บวกเพิ่มท้ายบิล ·
 * `inclusive` = ราคาที่กรอกรวม VAT แล้ว ถอด VAT ออกจากยอด (ต้นทุนสต๊อกและฐานภาษีซื้อคือยอดก่อน VAT เสมอ)
 *
 * ใบ/รอบเก่าไม่มีฟิลด์นี้ อ่านผ่าน `priceTypeOf()` — ไม่มีอัตรา VAT = `none` มี = `exclusive` ซึ่งเป็นสูตรเดิมทุกประการ
 */
export type ReceivingPriceType = "none" | "exclusive" | "inclusive";
export const RECEIVING_PRICE_TYPES: readonly ReceivingPriceType[] = ["none", "exclusive", "inclusive"];
export const RECEIVING_PRICE_TYPE_LABEL_KEY: Record<ReceivingPriceType, TranslationKey> = {
  none: "receivingReport.priceType.none", exclusive: "receivingReport.priceType.exclusive", inclusive: "receivingReport.priceType.inclusive",
};

export function isReceivingPriceType(v: unknown): v is ReceivingPriceType {
  return typeof v === "string" && (RECEIVING_PRICE_TYPES as readonly string[]).includes(v);
}

export function priceTypeOf(doc: { priceType?: ReceivingPriceType; vatRate?: number | null }): ReceivingPriceType {
  if (doc.priceType) return doc.priceType;
  return doc.vatRate === null || doc.vatRate === undefined ? "none" : "exclusive";
}

/**
 * แยกยอดหลังหักส่วนลดเป็น ฐานก่อน VAT / VAT / ยอดรวม ตามประเภทราคา — สูตรเดียวของทั้งหน้าจอ ใบพิมพ์ และเซิร์ฟเวอร์
 * `vatRate` ว่างในแบบแยก/รวม VAT ใช้ 7%
 */
export function splitVat(amount: number, priceType: ReceivingPriceType, vatRate: number | null | undefined) {
  if (priceType === "none") return { base: amount, vatRate: null as number | null, vatAmt: 0, total: amount };
  const rate = vatRate ?? VAT_RATE;
  if (priceType === "inclusive") {
    const vatAmt = (amount * rate) / (100 + rate);
    return { base: amount - vatAmt, vatRate: rate as number | null, vatAmt, total: amount };
  }
  const vatAmt = (amount * rate) / 100;
  return { base: amount, vatRate: rate as number | null, vatAmt, total: amount + vatAmt };
}

/** หนึ่งบรรทัดที่สั่งซื้อไว้ — snapshot จากใบสั่งซื้อ ไม่เปลี่ยนอีกเลยหลังสร้าง */
export interface ReceivingReportLine {
  id: string;
  /** บรรทัดต้นทางในใบสั่งซื้อ — เก็บไว้ไล่ที่มา ไม่ได้ใช้ query */
  poLineId: string;
  /** null = ผู้จัดซื้อพิมพ์เอง ยังไม่มีรหัสสินค้า → รับของแล้ว **ไม่เขียนสต๊อก** แต่ตั้งหนี้ตามปกติ */
  productId: string | null;
  productCode: string;
  description: string;
  subDetails: string[];
  unit: string;
  qtyOrdered: number;
  unitPriceOrdered: number;
  discount?: number | null;
  discountMode?: DiscountMode;
}

/** หนึ่งบรรทัดในหนึ่งรอบการรับ */
export interface ReceivingBatchLine {
  lineId: string;
  qty: number;
  unitPrice: number;
  /** qty × unitPrice — เก็บไว้เพราะเป็นตัวเลขที่ถูกตั้งหนี้ไปแล้ว ต้องไม่เปลี่ยนตามสูตรที่แก้ทีหลัง */
  amount: number;
}

/**
 * หนึ่งรอบการรับของ — เทียบเท่าใบส่งของ/ใบกำกับภาษีหนึ่งใบของผู้ขาย
 *
 * `postedAt`/`stockMovementIds`/`apEntryId` เขียนโดยเซิร์ฟเวอร์เท่านั้น เก็บไว้เพื่อ **ย้อนกลับได้**:
 * ยกเลิกรอบล่าสุดแล้วต้องรู้ว่าต้องกลับสต๊อกรายการไหน และลบหนี้ใบไหน
 */
export interface ReceivingBatch {
  id: string;
  /** ลำดับที่รับ เริ่มที่ 1 — ใช้แสดง "รับครั้งที่ N" */
  seq: number;
  receivedDate: string;
  /** เลขที่ใบกำกับภาษี/ใบส่งของของผู้ขาย — บังคับกรอก เพราะทะเบียนภาษีซื้อต้องมี */
  invoiceNumber: string;
  invoiceDate: string;
  vatRate: number | null;
  /** ประเภทราคาของบิลรอบนี้ (2026-09-24) — รอบเก่าไม่มี อ่านผ่าน `priceTypeOf()` */
  priceType?: ReceivingPriceType;
  /** ส่วนลดท้ายบิล (2026-09-24) — หักยอดหนี้และเกลี่ยลงต้นทุนสต๊อกตามสัดส่วน · ไม่พิมพ์ลงฟอร์ม (คำสั่งเจ้าของ) */
  discount?: number | null;
  discountMode?: DiscountMode;
  /** ผลรวม จำนวน × ราคา ก่อนหักส่วนลด · รอบเก่าไม่มี (= `subtotal`) */
  grossAmount?: number;
  discountAmt?: number;
  lines: ReceivingBatchLine[];
  /** ฐานก่อน VAT หลังหักส่วนลด — ยอดที่ลงทะเบียนภาษีซื้อ */
  subtotal: number;
  vatAmt: number;
  total: number;
  /** เครดิต (วัน) และวันครบกำหนดของบิลรอบนี้ (2026-09-24) — ใบรับวางบิลอ่านวันครบกำหนดจากตรงนี้ก่อน */
  creditDays?: number | null;
  dueDate?: string;
  /** ชื่อผู้รับของที่พิมพ์บนใบ — ข้อความอิสระ ไม่ใช่ผู้ใช้ในระบบ */
  receivedBy: string;
  remark: string;
  postedAt: string;
  postedBy: string;
  postedByName: string;
  stockMovementIds: string[];
  apEntryId: string;
}

export interface ReceivingReport {
  id: string;
  /** รหัสรับเข้า (2026-09-23) — ดู `ReceivingReportCode` · ใบเก่าไม่มี ใช้ `receivingReportCodeOf()` */
  receiveCode?: ReceivingReportCode;
  /** เลขที่บนฟอร์ม แก้เองได้ ตั้งต้นเท่ากับ `id` — กติกาเดียวกับใบสั่งซื้อ/ใบเบิก */
  documentNumber: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  jobCode: string;
  vendorName: string;
  vendorTaxId: string;
  vendorAddress: string;
  /** snapshot เงื่อนไขราคาของใบสั่งซื้อ — ใช้คิด "มูลค่าสั่งซื้อ" ให้ตรงกับใบสั่งซื้อเป๊ะ ๆ */
  orderVatRate: number | null;
  orderDiscount?: number | null;
  orderDiscountMode?: DiscountMode;
  /**
   * เงื่อนไขบิลที่สโตร์กรอก (2026-09-24) — แก้ได้ทุกใบ รวมใบที่มาจากใบสั่งซื้อ (ตั้งต้นจากใบสั่งซื้อ) และเป็นค่าตั้งต้นของ
   * หน้าต่างรับของแต่ละรอบ · อัตรา VAT และส่วนลดท้ายบิลใช้ `orderVatRate` / `orderDiscount` ตัวเดิม
   */
  priceType?: ReceivingPriceType;
  creditDays?: number | null;
  /**
   * ผู้ออกบิล (2026-09-24) — ปกติคือผู้ขาย · `billerCustom` = สโตร์พิมพ์เอง (เช่นซื้อเงินสดจากร้านที่ไม่มีในทะเบียน)
   * ต้องมีชื่อบริษัท · หนี้ในทะเบียนเจ้าหนี้ตั้งเป็นชื่อนี้ (`billerOf()`)
   */
  billerCustom?: boolean;
  billerName?: string;
  billerTaxId?: string;
  billerAddress?: string;
  lines: ReceivingReportLine[];
  batches: ReceivingBatch[];
  /** Closed = รับครบทุกบรรทัด หรือสโตร์กดปิดใบเพื่อยกเลิกส่วนที่เหลือ */
  status: ReceivingReportStatus;
  closedAt?: string;
  remarks: string;
  attachments: DocumentAttachment[];
  /** จำนวนครั้งที่กดพิมพ์ (2026-09-23) — ฟอร์ม FM-ST-01 มีช่อง "พิมพ์ครั้งที่" · เซิร์ฟเวอร์เพิ่มเองตอนกดพิมพ์ */
  printCount?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

/**
 * ข้อมูลที่ใบพิมพ์ FM-ST-01 ต้องใช้แต่ไม่ได้อยู่ในใบรับสินค้าเอง (2026-09-23) — มากับการกดพิมพ์
 * (`POST /:id/print`) อ่านจากใบสั่งซื้อ/ใบขอซื้อ/ทะเบียนผู้ขาย ณ ตอนนั้น · ใบเปล่าไม่มีใบสั่งซื้อ ช่องพวกนี้ว่าง
 */
export interface ReceivingReportPrintInfo {
  printCount: number;
  vendorCode: string;
  creditDays: number | null;
  purchaseOrderDate: string;
  /** "ขนส่งโดย" — วิธีจัดส่ง + สถานที่ส่งของ ของใบสั่งซื้อ */
  shippingText: string;
  /** หมายเหตุหัวใบ — หมายเหตุของใบรับสินค้า ถ้าว่างใช้ของใบสั่งซื้อ */
  headerRemark: string;
  purchaseRequestNumber: string;
  purchaseRequestDate: string;
}

export interface ReceivingReportSummary {
  id: string;
  receiveCode?: ReceivingReportCode;
  documentNumber: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  vendorName: string;
  jobCode: string;
  status: ReceivingReportStatus;
  orderedValue: number;
  receivedValue: number;
  outstandingValue: number;
  batchCount: number;
  updatedAt: string;
}

// ── ตัวคิดเลข (ใช้ร่วมกันทั้งหน้าจอและเซิร์ฟเวอร์) ────────────────────────────────

/** จำนวนที่รับไปแล้วของบรรทัดหนึ่ง รวมทุกรอบ */
export function receivedQtyOf(doc: Pick<ReceivingReport, "batches">, lineId: string): number {
  return doc.batches.reduce(
    (sum, b) => sum + b.lines.reduce((s, l) => (l.lineId === lineId ? s + l.qty : s), 0),
    0,
  );
}

/** มูลค่าที่รับไปแล้วของบรรทัดหนึ่ง (ก่อน VAT) */
export function receivedAmountOf(doc: Pick<ReceivingReport, "batches">, lineId: string): number {
  return doc.batches.reduce(
    (sum, b) => sum + b.lines.reduce((s, l) => (l.lineId === lineId ? s + l.amount : s), 0),
    0,
  );
}

/** ค้างรับของบรรทัดหนึ่ง — ไม่ติดลบ ต่อให้รับเกิน (ซึ่งเซิร์ฟเวอร์กันไว้แล้ว) */
export function outstandingQtyOf(doc: Pick<ReceivingReport, "batches">, line: ReceivingReportLine): number {
  return Math.max(0, line.qtyOrdered - receivedQtyOf(doc, line.id));
}

/** รับครบทุกบรรทัดแล้วหรือยัง — ตัวตัดสินว่าใบควรปิด */
export function isFullyReceived(doc: Pick<ReceivingReport, "lines" | "batches">): boolean {
  return doc.lines.every((line) => outstandingQtyOf(doc, line) <= 0);
}

type OrderTermsDoc = Pick<ReceivingReport, "lines" | "orderVatRate" | "orderDiscount" | "orderDiscountMode" | "priceType">;

/**
 * มูลค่าสั่งซื้อทั้งใบแบบใบเสนอราคา — คิดแบบเดียวกับ `purchaseOrderTotals()` (ส่วนลดรายบรรทัด → ส่วนลดท้ายใบ → VAT)
 * บวกประเภทราคา (2026-09-24) · ใบจากใบสั่งซื้อตั้งต้นด้วยเงื่อนไขของใบสั่งซื้อ ตัวเลขจึงตรงกับใบสั่งซื้อที่พิมพ์ออกไป
 * จนกว่าสโตร์จะแก้เงื่อนไขให้ตรงบิลจริง
 */
export function orderTotalsOf(doc: OrderTermsDoc) {
  const gross = doc.lines.reduce(
    (sum, l) => sum + lineSubtotal({ qty: l.qtyOrdered, unitPrice: l.unitPriceOrdered, discount: l.discount ?? 0, discountMode: l.discountMode }),
    0,
  );
  const discountAmt = resolveDiscountAmount(gross, doc.orderDiscount ?? 0, doc.orderDiscountMode);
  const afterDiscount = gross - discountAmt;
  const priceType = priceTypeOf({ priceType: doc.priceType, vatRate: doc.orderVatRate });
  const { base, vatRate, vatAmt, total } = splitVat(afterDiscount, priceType, doc.orderVatRate);
  return { gross, discountAmt, afterDiscount, base, priceType, vatRate, vatAmt, total };
}

export function orderedValueOf(doc: OrderTermsDoc): number {
  return orderTotalsOf(doc).total;
}

/** วันครบกำหนด = วันที่ + เครดิต (วัน) · เครดิตว่างหรือไม่มีวันที่ = ว่าง */
export function dueDateOf(date: string, creditDays: number | null | undefined): string {
  if (!date || creditDays === null || creditDays === undefined || !Number.isFinite(creditDays)) return "";
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + creditDays);
  return d.toISOString().slice(0, 10);
}

/** ผู้ที่หนี้ของใบนี้ตั้งเป็นชื่อ — ผู้ออกบิลที่กรอกเอง หรือผู้ขาย */
export function billerOf(doc: Pick<ReceivingReport, "vendorName" | "vendorTaxId" | "vendorAddress" | "billerCustom" | "billerName" | "billerTaxId" | "billerAddress">) {
  if (doc.billerCustom && (doc.billerName ?? "").trim()) {
    return { name: (doc.billerName ?? "").trim(), taxId: doc.billerTaxId ?? "", address: doc.billerAddress ?? "" };
  }
  return { name: doc.vendorName, taxId: doc.vendorTaxId, address: doc.vendorAddress };
}

/**
 * สามตัวเลขที่เจ้าของขอไว้ข้อแรก: *"ซื้อมาเท่าไหร่ รับมาเท่าไหร่ ยอดค้างรับเท่าไหร่"*
 *
 * "รับแล้ว" คือยอดจริงที่ตั้งหนี้ไป (รวม VAT ของแต่ละรอบ) ไม่ใช่ยอดตามราคาใบสั่งซื้อ — ของจริง
 * ผู้ขายมักส่งมาราคาไม่ตรงใบสั่งซื้อเป๊ะ และตัวเลขที่ต้องกระทบยอดกับบัญชีคือยอดที่ตั้งหนี้
 */
export function receivingReportTotals(doc: Pick<ReceivingReport, "lines" | "batches" | "orderVatRate" | "orderDiscount" | "orderDiscountMode" | "priceType">) {
  const orderedValue = orderedValueOf(doc);
  const receivedValue = doc.batches.reduce((sum, b) => sum + b.total, 0);
  return { orderedValue, receivedValue, outstandingValue: Math.max(0, orderedValue - receivedValue) };
}

export interface BatchTerms {
  priceType?: ReceivingPriceType;
  discount?: number | null;
  discountMode?: DiscountMode;
}

/**
 * ยอดของหนึ่งรอบการรับ — ตัวเดียวกับที่เซิร์ฟเวอร์ใช้ตอนบันทึก ไม่ให้หน้าจอกับหลังบ้านคิดคนละแบบ
 * `subtotal` = ฐานก่อน VAT หลังหักส่วนลด (ยอดที่ลงทะเบียนภาษีซื้อ) · `costFactor` = ฐาน ÷ ยอดก่อนหักส่วนลด ใช้คูณราคา
 * ต่อหน่วยเป็นต้นทุนสต๊อก (ส่วนลดเกลี่ยตามสัดส่วน และแบบรวม VAT ถอด VAT ออก) · ไม่ส่ง `terms` = สูตรเดิมก่อน 2026-09-24
 */
export function batchTotals(lines: { qty: number; unitPrice: number }[], vatRate: number | null, terms: BatchTerms = {}) {
  const gross = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const discountAmt = resolveDiscountAmount(gross, terms.discount ?? 0, terms.discountMode);
  const priceType = priceTypeOf({ priceType: terms.priceType, vatRate });
  const split = splitVat(gross - discountAmt, priceType, vatRate);
  return {
    gross, discountAmt, priceType, vatRate: split.vatRate,
    subtotal: split.base, vatAmt: split.vatAmt, total: split.total,
    costFactor: gross > 0 ? split.base / gross : 1,
  };
}

// ── API ──────────────────────────────────────────────────────────────────────

export async function fetchAllReceivingReports(): Promise<ReceivingReportSummary[]> {
  const { receivingReports } = await apiFetch<{ receivingReports: ReceivingReportSummary[] }>("/receiving-reports");
  return receivingReports;
}

/** ใบรับสินค้าของใบสั่งซื้อใบนี้ — ใช้ให้ปุ่ม "รับสินค้า" บนใบสั่งซื้อรู้ว่าจะเปิดใบเดิมหรือสร้างใหม่ */
export async function fetchReceivingReportsByPurchaseOrder(purchaseOrderId: string): Promise<ReceivingReportSummary[]> {
  const { receivingReports } = await apiFetch<{ receivingReports: ReceivingReportSummary[] }>(
    `/receiving-reports?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`,
  );
  return receivingReports;
}

export async function fetchReceivingReport(id: string): Promise<ReceivingReport> {
  const { receivingReport } = await apiFetch<{ receivingReport: ReceivingReport }>(`/receiving-reports/${encodeURIComponent(id)}`);
  return receivingReport;
}

/** สร้างจากใบสั่งซื้อที่อนุมัติแล้ว — ถ้ามีใบอยู่แล้วเซิร์ฟเวอร์ตอบ 409 พร้อม id เดิมให้เปิดต่อ */
export async function createReceivingReport(purchaseOrderId: string, receiveCode?: ReceivingReportCode): Promise<ReceivingReport> {
  const { receivingReport } = await apiFetch<{ receivingReport: ReceivingReport }>("/receiving-reports", {
    method: "POST", body: JSON.stringify(receiveCode ? { purchaseOrderId, receiveCode } : { purchaseOrderId }),
  });
  return receivingReport;
}

/** ใบเปล่า — ไม่มีใบสั่งซื้อต้นทาง สโตร์กรอกผู้ขายและรายการเอง (2026-09-23) */
export async function createBlankReceivingReport(receiveCode: ReceivingReportCode): Promise<ReceivingReport> {
  const { receivingReport } = await apiFetch<{ receivingReport: ReceivingReport }>("/receiving-reports", {
    method: "POST", body: JSON.stringify({ receiveCode }),
  });
  return receivingReport;
}

/** บรรทัดของใบเปล่าที่หน้าจอส่งไป — `poLineId`/`subDetails`/ส่วนลด ไม่มีความหมายกับใบที่ไม่มีใบสั่งซื้อ */
export type ReceivingReportLineInput = Pick<ReceivingReportLine, "id" | "productId" | "productCode" | "description" | "unit" | "qtyOrdered" | "unitPriceOrdered">;

export function blankReceivingReportLine(): ReceivingReportLine {
  return {
    id: `rrline_new_${Math.random().toString(36).slice(2, 10)}`, poLineId: "", productId: null, productCode: "",
    description: "", subDetails: [], unit: "", qtyOrdered: 0, unitPriceOrdered: 0,
  };
}

/**
 * ช่องที่แก้ได้ — สามช่องแรกได้ทุกใบ ที่เหลือ **เฉพาะใบเปล่า** (เซิร์ฟเวอร์ตอบ 400 ถ้าส่งมากับใบที่มีใบสั่งซื้อ
 * เพราะหัวใบและรายการของใบนั้นเป็น snapshot ของใบสั่งซื้อ)
 */
export type ReceivingReportUpdateFields = Partial<Pick<ReceivingReport,
  | "documentNumber" | "remarks" | "status" | "jobCode" | "vendorName" | "vendorTaxId" | "vendorAddress"
  | "orderVatRate" | "orderDiscount" | "orderDiscountMode" | "priceType" | "creditDays"
  | "billerCustom" | "billerName" | "billerTaxId" | "billerAddress">> & {
  lines?: ReceivingReportLineInput[];
};

export async function updateReceivingReport(id: string, fields: ReceivingReportUpdateFields, options?: WriteOptions): Promise<ReceivingReport> {
  const { receivingReport } = await apiFetch<{ receivingReport: ReceivingReport }>(
    `/receiving-reports/${encodeURIComponent(id)}${writeQuery(options)}`,
    { method: "PATCH", body: JSON.stringify(fields) },
  );
  return receivingReport;
}

export interface ReceiveBatchInput {
  receivedDate: string;
  invoiceNumber: string;
  invoiceDate: string;
  vatRate: number | null;
  priceType: ReceivingPriceType;
  discount: number | null;
  discountMode: DiscountMode;
  creditDays: number | null;
  receivedBy: string;
  remark: string;
  lines: { lineId: string; qty: number; unitPrice: number }[];
}

/** บันทึกรับของหนึ่งรอบ — เพิ่มสต๊อก + ตั้งหนี้ ในคำสั่งเดียว */
export async function postReceivingBatch(id: string, batch: ReceiveBatchInput): Promise<ReceivingReport> {
  const { receivingReport } = await apiFetch<{ receivingReport: ReceivingReport }>(
    `/receiving-reports/${encodeURIComponent(id)}/receipts`,
    { method: "POST", body: JSON.stringify(batch) },
  );
  return receivingReport;
}

/** ยกเลิกรอบล่าสุด — สต๊อกและหนี้ย้อนกลับทั้งคู่ (รอบที่จ่ายเงินแล้วยกเลิกไม่ได้) */
export async function deleteReceivingBatch(id: string, batchId: string): Promise<ReceivingReport> {
  const { receivingReport } = await apiFetch<{ receivingReport: ReceivingReport }>(
    `/receiving-reports/${encodeURIComponent(id)}/receipts/${encodeURIComponent(batchId)}`,
    { method: "DELETE" },
  );
  return receivingReport;
}

export async function deleteReceivingReport(id: string): Promise<void> {
  await apiFetch(`/receiving-reports/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** บันทึกการพิมพ์ — คืนข้อมูลเสริมของใบพิมพ์ FM-ST-01 (ดู `ReceivingReportPrintInfo`) */
export async function logReceivingReportPrinted(id: string): Promise<ReceivingReportPrintInfo> {
  const { printInfo } = await apiFetch<{ printInfo: ReceivingReportPrintInfo }>(`/receiving-reports/${encodeURIComponent(id)}/print`, { method: "POST" });
  return printInfo;
}

export async function uploadReceivingReportAttachment(id: string, file: File): Promise<ReceivingReport> {
  const { receivingReport } = await uploadDocumentAttachment<{ receivingReport: ReceivingReport }>("receiving-reports", id, {
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    dataBase64: await fileToBase64(file),
  });
  return receivingReport;
}

export async function deleteReceivingReportAttachment(id: string, attachmentId: string): Promise<ReceivingReport> {
  const { receivingReport } = await deleteDocumentAttachment<{ receivingReport: ReceivingReport }>("receiving-reports", id, attachmentId);
  return receivingReport;
}
