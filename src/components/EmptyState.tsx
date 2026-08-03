import type { LucideIcon } from "lucide-react";

// แสดงสถานะ "ยังไม่มีข้อมูล" พร้อมคำอธิบายและปุ่มดำเนินการ (ถ้ามี) ใช้ร่วมกันหลายหน้า
// Shared "no data yet" state with a title, description, and optional action button
export function EmptyState({
  icon: Icon, title, description, actionLabel, onAction, compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-3 ${compact ? "py-16" : "p-12"}`}>
      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
        <Icon size={22} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</p>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-1 flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
