interface BrandMarkProps {
  /** px height of the logo mark; width follows automatically (aspect ratio preserved, never stretched) */
  size?: number;
  /** "mark" = logo only; "full" = logo + company name + Thai subtitle */
  variant?: "mark" | "full";
  /** wordmark text color — "dark" for navy/dark panels, "light" for card/print backgrounds */
  theme?: "dark" | "light";
  className?: string;
}

/**
 * The single source of truth for the app's brand mark. Every place the logo
 * appears (sidebar, login, loading screen, quote/print fallback) renders this
 * component instead of a copy-pasted inline block, so sizing/spacing/behavior
 * stays consistent and the underlying image only needs to be swapped in one place.
 */
export function BrandMark({ size = 32, variant = "full", theme = "dark", className }: BrandMarkProps) {
  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className ?? ""}`}>
      <img
        src="/logo.png"
        alt="Thai Chemicals Storage ERP"
        style={{ height: size, width: "auto" }}
        className="object-contain flex-shrink-0"
      />
      {variant === "full" && (
        <div className="min-w-0">
          <p
            className={`text-xs font-semibold leading-snug break-words line-clamp-2 ${theme === "dark" ? "text-white" : "text-foreground"}`}
            style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}
            title="Thai Chemicals Storage ERP"
          >
            Thai Chemicals Storage ERP
          </p>
          {/* Gold only reads at proper contrast on the dark navy panel (~7.3:1) — on a light/card
              background it drops to ~2.1:1, well under the 4.5:1 AA floor (Impeccable audit
              2026-07-30). #866d28 is the same darkened-gold text variant DESIGN.md already defines
              for the Pending Approval status pill, reused here instead of minting a new hex. */}
          <p className={`text-[10px] font-mono uppercase tracking-widest truncate mt-0.5 ${theme === "dark" ? "text-[#c9a84c]" : "text-[#866d28]"}`}>ระบบองค์กร</p>
        </div>
      )}
    </div>
  );
}
