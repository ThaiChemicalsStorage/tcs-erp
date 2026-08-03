interface BrandMarkProps {
  size?: number;
  variant?: "mark" | "full";
  theme?: "dark" | "light";
  className?: string;
}

// แสดงโลโก้และชื่อแบรนด์ของแอป ใช้ร่วมกันทุกจุดที่ต้องโชว์โลโก้
// Renders the app's brand mark/logo, shared across every place the logo appears
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
          <p className={`text-[10px] font-mono uppercase tracking-widest truncate mt-0.5 ${theme === "dark" ? "text-[#c9a84c]" : "text-[#866d28]"}`}>ระบบองค์กร</p>
        </div>
      )}
    </div>
  );
}
