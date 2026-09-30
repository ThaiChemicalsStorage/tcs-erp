import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { btn } from "./styles";

export interface MoreMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** รายการที่ย้อนกลับไม่ได้ (ลบ ยกเลิก) — ตัวแดง ย้ายไปอยู่ท้ายเมนูหลังเส้นแบ่งเสมอ */
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

/**
 * ปุ่ม "เพิ่มเติม ▾" (ดีไซน์ใหม่ 2026-09-30) — ที่เก็บคำสั่งที่ใช้ไม่บ่อย (ทำสำเนา ออกฉบับแก้ไข ลบ ยกเลิก)
 * แทนการเรียงปุ่มยาวบนหัวหน้าเอกสาร · ไม่มีรายการ = ไม่แสดงปุ่มเลย
 */
export function MoreMenu({ items, label, align = "right", small = false, trigger }: {
  items: (MoreMenuItem | false | null | undefined)[];
  label?: string;
  align?: "left" | "right";
  small?: boolean;
  /** ปุ่มเปิดแบบอื่น (เช่นไอคอน ⋯ ท้ายแถว) — ไม่ระบุ = ปุ่ม "เพิ่มเติม ▾" */
  trigger?: (props: { open: boolean; toggle: () => void }) => ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  // เก็บ element ไว้ใน state (ไม่ใช่ ref) — toggle ถูกส่งเข้า trigger ระหว่าง render ห้ามอ่าน ref ในนั้น
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const list = items.filter((i): i is MoreMenuItem => !!i);
  const normal = list.filter((i) => !i.danger);
  const danger = list.filter((i) => i.danger);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => { if (!rootEl?.contains(e.target as Node)) setOpen(false); };
    // เมนูลอยแบบ fixed จึงไม่โดนการ์ดที่ overflow-hidden ตัด — เลื่อนหน้า/ย่อหน้าต่างแล้วปิดเมนู ไม่ให้ค้างผิดที่
    const onMove = (e: Event) => { if (!rootEl?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, rootEl]);

  if (list.length === 0) return null;
  // เปิดขึ้นด้านบนเมื่อที่ว่างด้านล่างไม่พอ (แถวท้ายตาราง ท้ายแผงด้านข้าง)
  const toggle = () => {
    if (!open && rootEl) {
      const r = rootEl.getBoundingClientRect();
      const estimate = list.length * 40 + (normal.length && danger.length ? 13 : 0) + 14;
      const below = window.innerHeight - r.bottom;
      const up = below < estimate + 8 && r.top > below;
      setPos({
        position: "fixed",
        ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
        ...(align === "right" ? { right: window.innerWidth - r.right } : { left: r.left }),
      });
    }
    setOpen((v) => !v);
  };
  const row = (item: MoreMenuItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        type="button"
        role="menuitem"
        disabled={item.disabled}
        title={item.hint}
        onClick={() => { setOpen(false); item.onSelect(); }}
        className={`w-full h-10 px-2.5 rounded-md flex items-center gap-2.5 text-sm text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          item.danger ? "text-[#b93636] hover:bg-[#fcebeb]" : "text-foreground hover:bg-[#f4f6fa]"
        }`}
      >
        {Icon && <Icon size={16} className={item.danger ? "" : "text-muted-foreground"} />}
        <span className="flex-1 truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <div ref={setRootEl} className="relative print:hidden">
      {trigger ? trigger({ open, toggle }) : (
        <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className={`${small ? btn.secondarySm : btn.secondary} ${open ? "bg-[#f4f6fa]" : ""}`}>
          {label ?? t("ui.more")}
          <ChevronDown size={16} className="text-muted-foreground" />
        </button>
      )}
      {open && (
        <div role="menu" style={pos} className={`z-[60] min-w-64 w-max max-w-80 bg-card border border-border rounded-[10px] shadow-[0_12px_28px_-8px_rgba(11,29,58,0.22)] p-1.5 flex flex-col`}>
          {normal.map(row)}
          {normal.length > 0 && danger.length > 0 && <div className="h-px bg-[#eef1f6] my-1.5 mx-1" />}
          {danger.map(row)}
        </div>
      )}
    </div>
  );
}
