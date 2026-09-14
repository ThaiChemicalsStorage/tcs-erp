/**
 * ค่าคงที่ของหน้าตาแดชบอร์ด (docs/DASHBOARD_DESIGN.md ข้อ 4 และ 6) — แยกจากไฟล์คอมโพเนนต์เพื่อให้ fast refresh
 * ของ Vite ทำงาน (ไฟล์ที่ export ทั้งคอมโพเนนต์และค่าคงที่ ถูกโหลดใหม่ทั้งหน้าเมื่อแก้)
 */

export const SERIF = { fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" } as const;

/** ทองใช้น้อย — แท็บที่เลือก ช่วงปัจจุบันในกราฟ การ์ดเด่น และปุ่มหลัก (Rare Gold Rule) */
export const GOLD = "#c9a84c";

/** สีของสามสถานะเครื่องอนุมัติร่วม (ร่าง / รออนุมัติ / อนุมัติแล้ว) บนแถบสัดส่วน */
export const STATUS_COLORS = { draft: "#c5d0e4", pending: "#e08a3c", final: "#5a7299" } as const;

/** คลาสของเซลล์ตาราง — ตารางทุกใบในแดชบอร์ดใช้ชุดเดียวกัน */
export const TD = "px-4 py-3 text-sm text-foreground";
export const TD_MONO = "px-4 py-3 text-xs font-mono whitespace-nowrap";
export const TR = "border-b border-border/50 last:border-0";
