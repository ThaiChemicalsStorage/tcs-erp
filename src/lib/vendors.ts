import { apiFetch } from "./apiClient.js";

/**
 * ทะเบียนผู้ขาย (2026-08-31) — เจ้าของขอไว้ 2026-08-28 พร้อมรหัสผู้ขาย
 *
 * **ใบสั่งซื้อยังเก็บ `vendorName` เป็นข้อความเหมือนเดิม** แล้วเพิ่ม `vendorId` เป็นตัวเลือก
 * (ดู `src/lib/purchaseOrder.ts`) — เอกสารเก่าทุกใบจึงอ่านได้เหมือนเดิม ไม่ต้อง migrate และ
 * ผู้ใช้ยังพิมพ์ชื่อผู้ขายที่ยังไม่มีในทะเบียนได้อยู่ ทะเบียนเป็นทางลัด ไม่ใช่กำแพง
 */

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

export async function setVendorArchived(id: string, isDeleted: boolean): Promise<Vendor> {
  const { vendor } = await apiFetch<{ vendor: Vendor }>(`/vendors/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    body: JSON.stringify({ isDeleted }),
  });
  return vendor;
}

/** ตัวเลือกสำหรับ `<Combobox>` บนใบสั่งซื้อ/ใบขอซื้อ — เอาเฉพาะที่ยังใช้งานอยู่ */
export function vendorComboboxOptions(vendors: Vendor[]): { value: string; label: string; hint?: string }[] {
  return vendors
    .filter((v) => v.isActive && !v.isDeleted)
    .map((v) => ({
      value: v.name,
      label: v.code ? `${v.code} — ${v.name}` : v.name,
      hint: [v.contactName, v.phone, v.taxId].filter(Boolean).join(" · ") || undefined,
    }));
}
