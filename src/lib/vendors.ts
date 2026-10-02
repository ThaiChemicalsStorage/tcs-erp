import { apiFetch } from "./apiClient.js";
import type { ReceivingPriceType } from "./receivingReport.js";

/**
 * ทะเบียนผู้ขาย (2026-08-31) — เจ้าของขอไว้ 2026-08-28 พร้อมรหัสผู้ขาย
 *
 * **ใบสั่งซื้อยังเก็บ `vendorName` เป็นข้อความเหมือนเดิม** แล้วเพิ่ม `vendorId` เป็นตัวเลือก
 * (ดู `src/lib/purchaseOrder.ts`) — เอกสารเก่าทุกใบจึงอ่านได้เหมือนเดิม ไม่ต้อง migrate และ
 * ผู้ใช้ยังพิมพ์ชื่อผู้ขายที่ยังไม่มีในทะเบียนได้อยู่ ทะเบียนเป็นทางลัด ไม่ใช่กำแพง
 */


/**
 * ขั้นอนุมัติของทะเบียนผู้ขาย (2026-09-21) — เจ้าของสั่ง: *"ทะเบียนผู้ขาย จัดซื้อกรอกข้อมูลรายละเอียด
 * ครบแล้ว นำส่งข้อมูลไปที่บัญชีให้บัญชีอนุมัติก่อนเปิด PO สั่งซื้อ"*
 *
 * **ไม่มีค่า = ผู้ขายที่บันทึกไว้ก่อน 2026-09-21 ต้องอ่านเป็น `"approved"` เสมอ** — ไม่งั้นวันที่ deploy
 * จัดซื้อจะอนุมัติใบสั่งซื้อไม่ได้เลยทั้งระบบ · ใช้ `vendorApprovalStatusOf()` ตัวเดียวทุกที่ ห้ามอ่าน
 * ฟิลด์ดิบตรง ๆ ไม่งั้นสองที่จะเพี้ยนจากกัน
 */
export type VendorApprovalStatus = "draft" | "pendingApproval" | "approved" | "rejected";

/** อ่านขั้นอนุมัติของผู้ขาย — ผู้ขายเก่าที่ไม่มีฟิลด์นี้ = อนุมัติแล้ว (ดู `VendorApprovalStatus`) */
export function vendorApprovalStatusOf(v: { approvalStatus?: VendorApprovalStatus }): VendorApprovalStatus {
  return v.approvalStatus ?? "approved";
}

export interface Vendor {
  id: string;
  name: string;
  /** รหัสผู้ขาย — ว่างได้ แต่ถ้ากรอกแล้วห้ามซ้ำ (เช็คไม่สนตัวพิมพ์ เก็บเป็นตัวพิมพ์ใหญ่) */
  code: string;
  contactName: string;
  phone: string;
  taxId: string;
  address: string;
  note: string;
  isActive: boolean;
  /** ขั้นอนุมัติของบัญชี — อ่านผ่าน `vendorApprovalStatusOf()` เสมอ ไม่มีค่า = ผู้ขายก่อน 2026-09-21 */
  approvalStatus?: VendorApprovalStatus;
  submittedAt?: string;
  submittedBy?: string;
  approvedAt?: string;
  approvedByUserId?: string;
  approvedByName?: string;
  /** เหตุผลที่บัญชีไม่อนุมัติ — ล้างทุกครั้งที่ส่งใหม่ */
  rejectionComment?: string;

  // ── ช่องที่ฝ่ายจัดซื้อกรอก (เพิ่ม 2026-10-02 ตามหน้าจอโปรแกรมบัญชีเดิม) — ดู `VENDOR_PURCHASING_FIELDS` ──
  nameEn?: string;
  postalCode?: string;
  /** สาขาตามโปรแกรมเดิม: `0` = สำนักงานใหญ่ · `-1` = ไม่ระบุ · อื่น ๆ = เลขสาขา — ผู้ขายเก่าไม่มี = -1 */
  branch?: number;
  /** เงื่อนไขการชำระเงิน — เลือกจาก `VENDOR_PAYMENT_TERM_OPTIONS` หรือพิมพ์เอง · ใบสั่งซื้อดึงไปเติมให้ */
  paymentTerms?: string;

  // ── ช่องที่ฝ่ายบัญชีกรอก (2026-10-02) — จัดซื้อเห็นแต่แก้ไม่ได้ เซิร์ฟเวอร์กัน · ดู `VENDOR_ACCOUNTING_FIELDS` ──
  /** ประเภทเงินได้ที่จ่าย */
  whtIncomeType?: string;
  /** อัตราภาษีที่หัก (%) */
  whtRate?: number | null;
  /** หมวดภาษีหัก ณ ที่จ่าย (ภ.ง.ด.3 / ภ.ง.ด.53) */
  whtCategory?: string;
  /** เงื่อนไขการหักภาษี (หัก ณ ที่จ่าย / ออกให้ตลอดไป / ออกให้ครั้งเดียว) */
  whtCondition?: string;
  /** ประเภทผู้จำหน่าย เช่น "00 ซื้อในประเทศ/เพื่อผลิต" */
  vendorType?: string;
  /** เลขที่บัญชี (เจ้าหนี้) — เลือกจากทะเบียนรหัสบัญชี */
  accountCode?: string;
  /** ประเภทราคา ชุดเดียวกับใบรับสินค้า · "" = ไม่ระบุ */
  priceType?: ReceivingPriceType | "";
  vatRate?: number | null;
  /** ขนส่งโดย */
  shippingMethod?: string;
  creditDays?: number | null;
  currency?: string;
  /** ส่วนลด — ข้อความตามโปรแกรมเดิม (เช่น "5%") ไม่ได้คิดเลขที่ไหน */
  discount?: string;
  /** วงเงินอนุมัติ */
  creditLimit?: number | null;
  /** ยอดยกมา */
  openingBalance?: number | null;
  /** เช็คจ่ายล่วงหน้า */
  advanceCheque?: number | null;

  // ── เซิร์ฟเวอร์เขียน/คำนวณ อ่านอย่างเดียว ──
  /** วันที่เลิกใช้ — ตั้งตอนปิดใช้งาน ล้างตอนเปิดใช้งาน */
  inactiveAt?: string;
  /** ยอดคงเหลือ = ยอดยกมา + หนี้ที่ยังไม่จ่ายในทะเบียนเจ้าหนี้ · `null` = ผู้เรียกไม่มีสิทธิ์ `ap:view` */
  balance?: number | null;
  /** วันที่ใบกำกับล่าสุดในทะเบียนเจ้าหนี้ ("" = ยังไม่มี) */
  lastBillDate?: string;

  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/** ช่องที่ฝ่ายจัดซื้อกรอก (`vendor:create`/`vendor:edit`) — เจ้าของ 2026-10-02: *"ที่อยู่ โทรศัพท์ ชื่อผู้ติดต่อ หมายเหตุ
 *  เลขประจำตัวผู้เสียภาษี สาขา รหัสไปรษณีย์"* + เงื่อนไขการชำระเงิน + ชื่อ/รหัส/ชื่ออังกฤษของหัวฟอร์ม */
export const VENDOR_PURCHASING_FIELDS = [
  "name", "code", "nameEn", "contactName", "phone", "taxId", "branch", "address", "postalCode", "note", "paymentTerms",
] as const;
/** ช่องที่ฝ่ายบัญชีกรอก (`vendor:approve`) — *"ส่วนที่เหลือในรูปที่ส่งไปให้บัญชีกรอกเอง"* */
export const VENDOR_ACCOUNTING_FIELDS = [
  "whtIncomeType", "whtRate", "whtCategory", "whtCondition", "vendorType", "accountCode",
  "priceType", "vatRate", "shippingMethod", "creditDays", "currency", "discount",
  "creditLimit", "openingBalance", "advanceCheque",
] as const;
export type VendorPurchasingField = (typeof VENDOR_PURCHASING_FIELDS)[number];
export type VendorAccountingField = (typeof VENDOR_ACCOUNTING_FIELDS)[number];

/** ตัวเลือกเงื่อนไขการชำระเงิน — ข้อความตามที่เจ้าของพิมพ์มา 2026-10-02 · พิมพ์ค่าอื่นเองได้ */
export const VENDOR_PAYMENT_TERM_OPTIONS = [
  "1.เครดิต 30วัน",
  "2.เครดิต 60วัน",
  "3.เงินสด/โอนชำระ",
  "4.โอนชำระรอบจ่ายตามเงื่อนไขTCS",
] as const;
/** หมวดภาษีหัก ณ ที่จ่าย — ตัวเลือกช่วยพิมพ์ ไม่บังคับ */
export const VENDOR_WHT_CATEGORY_OPTIONS = ["ภ.ง.ด.3", "ภ.ง.ด.53"] as const;
/** เงื่อนไขการหักภาษี — ตัวเลือกช่วยพิมพ์ ไม่บังคับ */
export const VENDOR_WHT_CONDITION_OPTIONS = ["1.หัก ณ ที่จ่าย", "2.ออกให้ตลอดไป", "3.ออกให้ครั้งเดียว"] as const;

/** สาขาเป็นข้อความ: 0 = สำนักงานใหญ่ · -1/ไม่มี = "" · อื่น ๆ = "สาขาที่ 00001" (รูปแบบใบกำกับภาษี) */
export function vendorBranchText(branch: number | undefined | null): string {
  if (branch === undefined || branch === null || branch < 0) return "";
  if (branch === 0) return "สำนักงานใหญ่";
  return `สาขาที่ ${String(branch).padStart(5, "0")}`;
}

export type VendorDraft = Pick<Vendor, "name" | "code" | "contactName" | "phone" | "taxId" | "address" | "note" | "isActive">
  & Partial<Pick<Vendor, Exclude<VendorPurchasingField | VendorAccountingField, "name" | "code" | "contactName" | "phone" | "taxId" | "address" | "note">>>;

export function emptyVendorDraft(): VendorDraft {
  return { name: "", code: "", contactName: "", phone: "", taxId: "", address: "", note: "", isActive: true, branch: -1 };
}

export async function fetchVendors(): Promise<Vendor[]> {
  const { vendors } = await apiFetch<{ vendors: Vendor[] }>("/vendors");
  return vendors;
}

export async function createVendor(draft: VendorDraft): Promise<Vendor> {
  const { vendor } = await apiFetch<{ vendor: Vendor }>("/vendors", { method: "POST", body: JSON.stringify(draft) });
  return vendor;
}

export async function updateVendor(id: string, draft: Partial<VendorDraft>): Promise<Vendor> {
  const { vendor } = await apiFetch<{ vendor: Vendor }>(`/vendors/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(draft) });
  return vendor;
}

/** ส่งผู้ขายให้บัญชีอนุมัติ — ได้เฉพาะตอนเป็นร่างหรือถูกตีกลับ */
export async function submitVendorApproval(id: string): Promise<Vendor> {
  const { vendor } = await apiFetch<{ vendor: Vendor }>(`/vendors/${encodeURIComponent(id)}/submit-approval`, { method: "POST" });
  return vendor;
}
/** บัญชีอนุมัติผู้ขาย — ปลดล็อกให้เอาไปใช้บนใบสั่งซื้อได้ */
export async function approveVendor(id: string): Promise<Vendor> {
  const { vendor } = await apiFetch<{ vendor: Vendor }>(`/vendors/${encodeURIComponent(id)}/approve`, { method: "POST" });
  return vendor;
}
/** บัญชีตีกลับ — ต้องมีเหตุผลเสมอ */
export async function rejectVendor(id: string, comment: string): Promise<Vendor> {
  const { vendor } = await apiFetch<{ vendor: Vendor }>(`/vendors/${encodeURIComponent(id)}/reject`, {
    method: "POST", body: JSON.stringify({ comment }),
  });
  return vendor;
}

export async function setVendorArchived(id: string, isDeleted: boolean): Promise<Vendor> {
  const { vendor } = await apiFetch<{ vendor: Vendor }>(`/vendors/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    body: JSON.stringify({ isDeleted }),
  });
  return vendor;
}

/**
 * ตัวเลือกสำหรับ `<Combobox>` บนใบสั่งซื้อ/ใบขอซื้อ — เอาเฉพาะที่ยังใช้งานอยู่ **และบัญชีอนุมัติแล้ว**
 *
 * ตัวกรอง `approved` เพิ่ม 2026-09-21 ตามคำสั่งเจ้าของข้อ 5 · **หน้าทะเบียนผู้ขายต้องไม่ใช้ตัวนี้**
 * เพราะที่นั่นต้องเห็นผู้ขายทุกสถานะเพื่อเอามาส่งอนุมัติ
 */
export function vendorComboboxOptions(vendors: Vendor[]): { value: string; label: string; hint?: string }[] {
  return vendors
    .filter((v) => v.isActive && !v.isDeleted && vendorApprovalStatusOf(v) === "approved")
    .map((v) => ({
      value: v.name,
      label: v.code ? `${v.code} — ${v.name}` : v.name,
      hint: [v.contactName, v.phone, v.taxId].filter(Boolean).join(" · ") || undefined,
    }));
}
