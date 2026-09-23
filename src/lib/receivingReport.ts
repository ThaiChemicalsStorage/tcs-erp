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
import { resolveDiscountAmount, lineSubtotal, type DiscountMode } from "./quoteMath.js";
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
  lines: ReceivingBatchLine[];
  subtotal: number;
  vatAmt: number;
  total: number;
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
  lines: ReceivingReportLine[];
  batches: ReceivingBatch[];
  /** Closed = รับครบทุกบรรทัด หรือสโตร์กดปิดใบเพื่อยกเลิกส่วนที่เหลือ */
  status: ReceivingReportStatus;
  closedAt?: string;
  remarks: string;
  attachments: DocumentAttachment[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
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

/**
 * มูลค่าสั่งซื้อทั้งใบ — คิดแบบเดียวกับ `purchaseOrderTotals()` ทุกขั้น (ส่วนลดรายบรรทัด →
 * ส่วนลดท้ายใบ → VAT) เพื่อให้ตัวเลข "ซื้อมาเท่าไหร่" บนใบรับสินค้า ตรงกับใบสั่งซื้อที่พิมพ์ออกไป
 */
export function orderedValueOf(doc: Pick<ReceivingReport, "lines" | "orderVatRate" | "orderDiscount" | "orderDiscountMode">): number {
  const subtotal = doc.lines.reduce(
    (sum, l) => sum + lineSubtotal({ qty: l.qtyOrdered, unitPrice: l.unitPriceOrdered, discount: l.discount ?? 0, discountMode: l.discountMode }),
    0,
  );
  const afterDiscount = subtotal - resolveDiscountAmount(subtotal, doc.orderDiscount ?? 0, doc.orderDiscountMode);
  const vatAmt = doc.orderVatRate !== null && doc.orderVatRate !== undefined ? (afterDiscount * doc.orderVatRate) / 100 : 0;
  return afterDiscount + vatAmt;
}

/**
 * สามตัวเลขที่เจ้าของขอไว้ข้อแรก: *"ซื้อมาเท่าไหร่ รับมาเท่าไหร่ ยอดค้างรับเท่าไหร่"*
 *
 * "รับแล้ว" คือยอดจริงที่ตั้งหนี้ไป (รวม VAT ของแต่ละรอบ) ไม่ใช่ยอดตามราคาใบสั่งซื้อ — ของจริง
 * ผู้ขายมักส่งมาราคาไม่ตรงใบสั่งซื้อเป๊ะ และตัวเลขที่ต้องกระทบยอดกับบัญชีคือยอดที่ตั้งหนี้
 */
export function receivingReportTotals(doc: Pick<ReceivingReport, "lines" | "batches" | "orderVatRate" | "orderDiscount" | "orderDiscountMode">) {
  const orderedValue = orderedValueOf(doc);
  const receivedValue = doc.batches.reduce((sum, b) => sum + b.total, 0);
  return { orderedValue, receivedValue, outstandingValue: Math.max(0, orderedValue - receivedValue) };
}

/** ยอดของหนึ่งรอบการรับ — ตัวเดียวกับที่เซิร์ฟเวอร์ใช้ตอนบันทึก ไม่ให้หน้าจอกับหลังบ้านคิดคนละแบบ */
export function batchTotals(lines: { qty: number; unitPrice: number }[], vatRate: number | null) {
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const vatAmt = vatRate !== null && vatRate !== undefined ? (subtotal * vatRate) / 100 : 0;
  return { subtotal, vatAmt, total: subtotal + vatAmt };
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
export type ReceivingReportUpdateFields = Partial<Pick<ReceivingReport, "documentNumber" | "remarks" | "status" | "jobCode" | "vendorName" | "vendorTaxId" | "vendorAddress" | "orderVatRate">> & {
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

export async function logReceivingReportPrinted(id: string): Promise<void> {
  await apiFetch(`/receiving-reports/${encodeURIComponent(id)}/print`, { method: "POST" });
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
