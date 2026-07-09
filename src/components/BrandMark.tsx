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
    <div className={`flex items-center gap-3 min-w-0 ${className ?? ""}`}>
      <img
        src="/logo.png"
        alt="Thai Chemicals Storage ERP"
        style={{ height: size, width: "auto" }}
        className="object-contain flex-shrink-0"
      />
      {variant === "full" && (
        <div className="overflow-hidden">
          <p
            className={`text-sm font-semibold whitespace-nowrap leading-tight ${theme === "dark" ? "text-white" : "text-foreground"}`}
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Thai Chemicals Storage ERP
          </p>
          <p className="text-[#c9a84c] text-[10px] font-mono uppercase tracking-widest whitespace-nowrap">ระบบองค์กร</p>
        </div>
      )}
    </div>
  );
}
