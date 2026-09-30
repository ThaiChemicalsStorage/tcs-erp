export type StatusBadgeStatus = "archived" | "active" | "inactive";

// สีตามดีไซน์ใหม่ (2026-09-30): พื้นอ่อน + ตัวอักษรเข้ม + จุดสีนำหน้า
const STATUS_STYLES: Record<StatusBadgeStatus, { pill: string; dot: string }> = {
  archived: { pill: "bg-[#eef1f6] text-[#3d5173]", dot: "bg-[#8a97ad]" },
  active: { pill: "bg-[#e6f4ec] text-[#1b7f4f]", dot: "bg-[#1b7f4f]" },
  inactive: { pill: "bg-[#fdf3e0] text-[#8a5a00]", dot: "bg-[#d89614]" },
};

// ป้ายแสดงสถานะ (เก็บถาวร/ใช้งาน/ไม่ใช้งาน) พร้อมสีตามสถานะ
// Colored badge showing an item's status (archived/active/inactive)
export function StatusBadge({ status, label }: { status: StatusBadgeStatus; label: string }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${style.pill}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
      {label}
    </span>
  );
}
