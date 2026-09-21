import { apiFetch } from "./apiClient.js";

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
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export type VendorDraft = Pick<Vendor, "name" | "code" | "contactName" | "phone" | "taxId" | "address" | "note" | "isActive">;

export function emptyVendorDraft(): VendorDraft {
  return { name: "", code: "", contactName: "", phone: "", taxId: "", address: "", note: "", isActive: true };
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
