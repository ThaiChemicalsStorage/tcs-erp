import type { KeyboardEvent } from "react";
import { formatDisplayDate } from "../../lib/displayDate";

/**
 * ตัวช่วยที่ไม่ใช่คอมโพเนนต์ของหน้าคลังสินค้า/สต๊อก/เครื่องมือ/คำขอเพิ่มสินค้า — แยกจาก inventoryUi.tsx
 * เพื่อให้ไฟล์นั้นส่งออกเฉพาะคอมโพเนนต์ (fast refresh)
 */

/** แถวตารางที่ทั้งแถวกดเปิดได้ (Enter/Space ด้วย) — กดปุ่ม/ช่องกรอกที่อยู่ในแถวไม่นับ */
export function rowOpenProps(onOpen: () => void, ariaLabel: string) {
  return {
    tabIndex: 0,
    "aria-label": ariaLabel,
    onClick: onOpen,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

/** วันที่สั้นตามภาษาที่เลือก "27 ก.ย. 2569" / "27 Sep 2026" */
export function fmtProductDate(iso: string) {
  return formatDisplayDate(iso);
}

/** เงินบาทสองตำแหน่ง */
export const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
