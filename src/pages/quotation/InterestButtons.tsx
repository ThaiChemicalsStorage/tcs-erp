import { ThumbsUp, ThumbsDown } from "lucide-react";
import type { QuoteInterest } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";

export function InterestButtons({ value, onChange }: { value: QuoteInterest; onChange: (v: QuoteInterest) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-pressed={value === "น่าสนใจ"}
        onClick={(e) => { e.stopPropagation(); onChange(value === "น่าสนใจ" ? null : "น่าสนใจ"); }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all duration-150 ${
          value === "น่าสนใจ"
            ? "bg-[#2aa36b] text-white border-[#2aa36b]"
            : "bg-transparent text-muted-foreground border-border hover:border-[#2aa36b] hover:text-[#2aa36b]"
        }`}
      >
        <ThumbsUp size={12} className="flex-shrink-0" />
        {t("quotation.interest.interested")}
      </button>
      <button
        type="button"
        aria-pressed={value === "ไม่น่าสนใจ"}
        onClick={(e) => { e.stopPropagation(); onChange(value === "ไม่น่าสนใจ" ? null : "ไม่น่าสนใจ"); }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all duration-150 ${
          value === "ไม่น่าสนใจ"
            ? "bg-[#e05252] text-white border-[#e05252]"
            : "bg-transparent text-muted-foreground border-border hover:border-[#e05252] hover:text-[#e05252]"
        }`}
      >
        <ThumbsDown size={12} className="flex-shrink-0" />
        {t("quotation.interest.notInterested")}
      </button>
    </div>
  );
}
