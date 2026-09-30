import type { Vendor, VendorApprovalStatus } from "../../lib/vendors";
import type { TranslationKey } from "../../lib/i18n";
import type { PillTone } from "../purchaseOrder/purchasingUi";

/** สีป้ายขั้นอนุมัติของบัญชี — ร่างเทา · รอบัญชีอนุมัติเหลือง · อนุมัติแล้วเขียว · ไม่อนุมัติแดง */
export const vendorApprovalTone: Record<VendorApprovalStatus, PillTone> = {
  draft: "neutral",
  pendingApproval: "warning",
  approved: "success",
  rejected: "danger",
};

export const vendorApprovalLabelKey: Record<VendorApprovalStatus, TranslationKey> = {
  draft: "vendors.approval.draft",
  pendingApproval: "vendors.approval.pending",
  approved: "vendors.approval.approved",
  rejected: "vendors.approval.rejected",
};

export type VendorStatusTab = "all" | "active" | "inactive";

/**
 * กรองรายการผู้ขายตามแท็บ/คำค้น/การแสดงที่เก็บถาวร — แยกเป็นฟังก์ชันล้วนเพื่อให้จำนวนบนแท็บกับแถวที่เห็น
 * มาจากกติกาเดียวกันเสมอ (คำค้นดูชื่อ รหัส ผู้ติดต่อ เบอร์โทร เลขภาษี เหมือนเดิม)
 */
export function filterVendors(vendors: Vendor[], opts: { tab: VendorStatusTab; search: string; showArchived: boolean }): Vendor[] {
  const q = opts.search.trim().toLowerCase();
  return vendors.filter((v) => {
    if (!opts.showArchived && v.isDeleted) return false;
    if (opts.tab === "active" && !v.isActive) return false;
    if (opts.tab === "inactive" && v.isActive) return false;
    if (!q) return true;
    return [v.name, v.code, v.contactName, v.phone, v.taxId].some((f) => f.toLowerCase().includes(q));
  });
}
