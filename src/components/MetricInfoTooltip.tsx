import { useState } from "react";
import { Info } from "lucide-react";

/**
 * Small "what does this metric mean?" affordance for KPI cards/columns whose name alone isn't
 * self-explanatory to a non-technical user (Expected Sales, Win Rate, Active/Non-Active Jobs,
 * Average Deal Size, ...). Click-to-toggle (not hover-only) so it works the same on touch devices
 * and via keyboard, not just a mouse.
 */
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
          className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-[#0b1d3a] text-white text-[11px] leading-relaxed p-2.5 shadow-xl"
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-[#0b1d3a] rotate-45" />
        </span>
      )}
    </span>
  );
}
