import { useState } from "react";
import { Info } from "lucide-react";

// ปุ่มไอคอนเล็ก ๆ สำหรับกดดูคำอธิบายความหมายของตัวชี้วัด (KPI) แบบคลิกเปิด/ปิด
// Small info-icon button that toggles a tooltip explaining a KPI's meaning
export function MetricInfoTooltip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onBlur={() => setOpen(false)}
        className="text-muted-foreground/70 hover:text-[#c9a84c] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c9a84c] rounded-full"
      >
        <Info size={12} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-[#0b1d3a] text-white text-xs leading-relaxed p-2.5 shadow-xl"
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-[#0b1d3a] rotate-45" />
        </span>
      )}
    </span>
  );
}
