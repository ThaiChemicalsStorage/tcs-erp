import { ThumbsUp, ThumbsDown } from "lucide-react";
import type { QuoteInterest } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";

// ปุ่มสำหรับติดตั้งสถานะความสนใจ (สนใจ/ไม่สนใจ) ของใบเสนอราคา — กดซ้ำปุ่มเดิมเพื่อล้างค่า
// Toggle buttons for marking a quote's interest status (interested / not interested); pressing the
// active one again clears it. Clicks never bubble, so the buttons work inside a clickable list row.
export function InterestButtons({ value, onChange, compact = false }: {
  value: QuoteInterest;
  onChange: (v: QuoteInterest) => void;
  /** แถวในตาราง: ปุ่มไอคอนอย่างเดียว (ชื่อเต็มอยู่ใน title/aria-label) */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const base = `inline-flex items-center justify-center gap-1.5 rounded-lg border text-[12.5px] font-semibold whitespace-nowrap transition-colors ${compact ? "w-8 h-8" : "h-8 px-2.5"}`;
  const idle = "bg-white border-[#c3ccda] text-muted-foreground";
  const options = [
    { v: "น่าสนใจ" as const, Icon: ThumbsUp, label: t("quotation.interest.interested"), on: "bg-[#e6f4ec] border-[#b5dcc6] text-[#1b7f4f]", hover: "hover:border-[#1b7f4f] hover:text-[#1b7f4f]" },
    { v: "ไม่น่าสนใจ" as const, Icon: ThumbsDown, label: t("quotation.interest.notInterested"), on: "bg-[#fcebeb] border-[#f0c4c4] text-[#b93636]", hover: "hover:border-[#b93636] hover:text-[#b93636]" },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {options.map(({ v, Icon, label, on, hover }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          title={label}
          aria-label={compact ? label : undefined}
          onClick={(e) => { e.stopPropagation(); onChange(value === v ? null : v); }}
          onKeyDown={(e) => e.stopPropagation()}
          className={`${base} ${value === v ? on : `${idle} ${hover}`}`}
        >
          <Icon size={13} className="flex-shrink-0" />
          {!compact && label}
        </button>
      ))}
    </div>
  );
}
