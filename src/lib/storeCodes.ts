import type { TranslationKey } from "./i18n.js";

/**
 * รหัสการจ่ายและรหัสการรับของสโตร์ (2026-09-23) — ลอกจากเมนู "จ่ายภายใน" / "ปรับยอดสินค้า" ของโปรแกรมบัญชีที่
 * บริษัทใช้อยู่ (ภาพที่เจ้าของส่งมา) เพื่อให้เลขเอกสารในระบบนี้ตรงกับที่ฝ่ายบัญชีคุ้นเคย
 *
 * - **ใบเบิกของสโตร์** = ใบเบิกวัสดุ (`material_requisitions`) ที่ `ownerDepartment: "store"` + `issueCode`
 *   ใช้ขั้นอนุมัติ การจ่ายเป็นรอบ และคิวตัดของเดิมทั้งหมด ต่างแค่เลขที่ขึ้นต้นด้วยรหัส
 * - **ใบรับคืน / รับเข้าคลัง** = เอกสารชนิดใหม่ (`store_receipts`) มีสามพฤติกรรมตามรหัส:
 *   คืนของจากใบเบิก (`return`) · รับของเข้าคลัง (`receive`) · ปรับยอด (`adjust`)
 *
 * รหัสคือตัวอักษรหน้าเลขที่ใบ (`PD-202609-0001`) แต่ละรหัสนับเลขแยก · เลือกตอนสร้างและเปลี่ยนภายหลังไม่ได้
 * (ฝังอยู่ใน `_id`) — แนวเดียวกับรหัสใบขอซื้อ/ใบรับสินค้า
 *
 * ชื่อ P1/J1 สะกด "SHELL" ทั้งสองฝั่ง — ภาพฝั่งจ่ายเขียน "SHEEL" ซึ่งเป็นคำพิมพ์ผิดของคำเดียวกับฝั่งรับ
 * ไฟล์นี้ต้องไม่มี React (เซิร์ฟเวอร์ import) — `TranslationKey` เป็น `import type` จึงปลอดภัย
 */

export type StoreIssueCode = "OU" | "FOC" | "PD" | "P1" | "P2" | "P3" | "PN" | "PP" | "PB" | "PU" | "PM" | "PX" | "PT" | "PA" | "PW";
export type StoreIssueGroup = "sale" | "production" | "project" | "internal";

export type StoreReceiptCode = "JD" | "J1" | "J2" | "J3" | "JP" | "JB" | "JS" | "JC" | "JT" | "FG" | "FP" | "GC" | "JN" | "JU" | "TK";
export type StoreReceiptGroup = "returnProduction" | "returnProject" | "returnOther" | "receive" | "adjust";
/** สามพฤติกรรมของใบรับ — ตัดสินว่าหัวใบมีช่องอะไรและตอนรับเข้าคลังเขียนสต๊อกแบบไหน */
export type StoreReceiptKind = "return" | "receive" | "adjust";

export interface StoreIssueCodeInfo {
  code: StoreIssueCode;
  group: StoreIssueGroup;
  nameKey: TranslationKey;
}

export interface StoreReceiptCodeInfo {
  code: StoreReceiptCode;
  group: StoreReceiptGroup;
  kind: StoreReceiptKind;
  /** รหัสใบเบิกที่ใบคืนนี้คืนของให้ — ใบคืนเลือกได้เฉพาะใบเบิกรหัสนี้ */
  pair?: StoreIssueCode;
  nameKey: TranslationKey;
}

export const STORE_ISSUE_CODES: readonly StoreIssueCodeInfo[] = [
  { code: "OU", group: "sale", nameKey: "storeCode.OU" },
  { code: "FOC", group: "sale", nameKey: "storeCode.FOC" },
  { code: "PD", group: "production", nameKey: "storeCode.PD" },
  { code: "P1", group: "production", nameKey: "storeCode.P1" },
  { code: "P2", group: "production", nameKey: "storeCode.P2" },
  { code: "P3", group: "production", nameKey: "storeCode.P3" },
  { code: "PN", group: "production", nameKey: "storeCode.PN" },
  { code: "PP", group: "project", nameKey: "storeCode.PP" },
  { code: "PB", group: "project", nameKey: "storeCode.PB" },
  { code: "PU", group: "project", nameKey: "storeCode.PU" },
  { code: "PM", group: "internal", nameKey: "storeCode.PM" },
  { code: "PX", group: "internal", nameKey: "storeCode.PX" },
  { code: "PT", group: "internal", nameKey: "storeCode.PT" },
  { code: "PA", group: "internal", nameKey: "storeCode.PA" },
  { code: "PW", group: "internal", nameKey: "storeCode.PW" },
];

export const STORE_RECEIPT_CODES: readonly StoreReceiptCodeInfo[] = [
  { code: "JD", group: "returnProduction", kind: "return", pair: "PD", nameKey: "storeCode.JD" },
  { code: "J1", group: "returnProduction", kind: "return", pair: "P1", nameKey: "storeCode.J1" },
  { code: "J2", group: "returnProduction", kind: "return", pair: "P2", nameKey: "storeCode.J2" },
  { code: "J3", group: "returnProduction", kind: "return", pair: "P3", nameKey: "storeCode.J3" },
  { code: "JP", group: "returnProject", kind: "return", pair: "PP", nameKey: "storeCode.JP" },
  { code: "JB", group: "returnProject", kind: "return", pair: "PB", nameKey: "storeCode.JB" },
  { code: "JS", group: "returnProject", kind: "return", pair: "PU", nameKey: "storeCode.JS" },
  { code: "JC", group: "returnOther", kind: "return", pair: "FOC", nameKey: "storeCode.JC" },
  { code: "JT", group: "returnOther", kind: "return", pair: "PT", nameKey: "storeCode.JT" },
  { code: "FG", group: "receive", kind: "receive", nameKey: "storeCode.FG" },
  { code: "FP", group: "receive", kind: "receive", nameKey: "storeCode.FP" },
  { code: "GC", group: "receive", kind: "receive", nameKey: "storeCode.GC" },
  { code: "JN", group: "receive", kind: "receive", nameKey: "storeCode.JN" },
  { code: "JU", group: "adjust", kind: "adjust", nameKey: "storeCode.JU" },
  { code: "TK", group: "adjust", kind: "adjust", nameKey: "storeCode.TK" },
];

export const STORE_ISSUE_GROUP_LABEL_KEY: Record<StoreIssueGroup, TranslationKey> = {
  sale: "storeCode.group.sale", production: "storeCode.group.production",
  project: "storeCode.group.project", internal: "storeCode.group.internal",
};
export const STORE_RECEIPT_GROUP_LABEL_KEY: Record<StoreReceiptGroup, TranslationKey> = {
  returnProduction: "storeCode.group.returnProduction", returnProject: "storeCode.group.returnProject",
  returnOther: "storeCode.group.returnOther", receive: "storeCode.group.receive", adjust: "storeCode.group.adjust",
};

const ISSUE_BY_CODE = new Map(STORE_ISSUE_CODES.map((c) => [c.code, c]));
const RECEIPT_BY_CODE = new Map(STORE_RECEIPT_CODES.map((c) => [c.code, c]));

export function isStoreIssueCode(v: unknown): v is StoreIssueCode {
  return typeof v === "string" && ISSUE_BY_CODE.has(v as StoreIssueCode);
}
export function isStoreReceiptCode(v: unknown): v is StoreReceiptCode {
  return typeof v === "string" && RECEIPT_BY_CODE.has(v as StoreReceiptCode);
}
export function storeIssueCodeInfo(code: StoreIssueCode): StoreIssueCodeInfo {
  return ISSUE_BY_CODE.get(code)!;
}
export function storeReceiptCodeInfo(code: StoreReceiptCode): StoreReceiptCodeInfo {
  return RECEIPT_BY_CODE.get(code)!;
}

/** กุญแจตัวนับของแต่ละรหัส — แยกกันทุกรหัส ต่อท้ายด้วย `_YYYYMM` ใน `nextMonthlyDocumentNumber()` */
export function storeIssueCounterKey(code: StoreIssueCode): string {
  return `store_issue_${code.toLowerCase()}`;
}
export function storeReceiptCounterKey(code: StoreReceiptCode): string {
  return `store_receipt_${code.toLowerCase()}`;
}
