import type { KeyboardEvent } from "react";
import type { DiscountMode } from "../../lib/quoteMath";
import { fmt } from "../../lib/quotes";

/** ตัวช่วยที่ไม่ใช่คอมโพเนนต์ของหน้าคลังฝั่งรับของ — แยกจาก receivingUi.tsx เพื่อให้ไฟล์นั้นส่งออกเฉพาะคอมโพเนนต์ (fast refresh) */

export const PAGE_SIZE = 20;

export function paginate<T>(rows: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  return {
    pageCount,
    current,
    rows: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    from: (current - 1) * PAGE_SIZE + 1,
    to: Math.min(current * PAGE_SIZE, rows.length),
  };
}

/** แถวตารางที่ทั้งแถวกดเปิดเอกสารได้ (Enter/Space ด้วย) */
export function rowOpenProps(onOpen: () => void, ariaLabel: string) {
  return {
    tabIndex: 0,
    "aria-label": ariaLabel,
    onClick: onOpen,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

/** แถวที่เลือกได้ในหน้าต่างเลือก — พื้นฟ้าอ่อนเมื่อเลือก */
export const pickRowClass = (on: boolean) =>
  `w-full text-left border-b border-[#eef1f6] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 disabled:opacity-60 ${on ? "bg-[#eef4fc]" : "bg-white hover:bg-[#f8f9fc]"}`;

/** ส่วนลดแบบอ่านอย่างเดียว: "5%" / "500.00" / "—" */
export function discountText(discount: number | null | undefined, mode: DiscountMode | undefined): string {
  if (!discount) return "—";
  return mode === "amount" ? `฿${fmt(discount)}` : `${discount}%`;
}
