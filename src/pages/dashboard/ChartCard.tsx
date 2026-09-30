import type { ReactNode } from "react";

// การ์ดกรอบมาตรฐานสำหรับส่วนต่างๆ ของแดชบอร์ด (ดีไซน์ใหม่ 2026-09-30): หัวการ์ดคั่นเส้นบาง — ชื่อ 16/600
// + ป้ายเล็ก (เช่น "ก่อนภาษี") + บรรทัดรองบอกขอบเขตข้อมูล · ปุ่ม/ตัวเลขสรุปชิดขวา · แล้วเนื้อหา
// Standard dashboard card: divided header (title + optional tag + scope line, actions on the right), then the body.
// `fill`: การ์ดที่ถูกยืดให้สูงเท่าการ์ดข้าง ๆ ในแถว 2 ต่อ 1 — เนื้อหา (กราฟ) ขยายลงเต็มการ์ด
// `flush`: เนื้อหาไม่มีระยะขอบ (ตาราง/รายการเต็มความกว้าง)
export function ChartCard({ title, sub, tag, children, className = "", actions, fill = false, flush = false, bodyClassName }: {
  title: string;
  sub?: ReactNode;
  tag?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  fill?: boolean;
  flush?: boolean;
  bodyClassName?: string;
}) {
  const body = bodyClassName ?? (flush ? "" : "px-6 py-5");
  return (
    <section className={`bg-card border border-border rounded-xl min-w-0 flex flex-col ${flush ? "overflow-hidden" : ""} ${className}`}>
      <div className="px-6 py-4 border-b border-[#eef1f6] flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {tag && <ScopeTag>{tag}</ScopeTag>}
          </div>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">{actions}</div>}
      </div>
      <div className={`${fill ? "flex-1 min-h-0 flex flex-col" : ""} ${body}`}>{children}</div>
    </section>
  );
}

// ป้ายเล็กสีเทาอ่อน — "ช่วงที่เลือก" / "ก่อนภาษี" / "รวม VAT 7%"
// Small grey pill used for scope and tax labels.
export function ScopeTag({ children }: { children: ReactNode }) {
  return (
    <span className="h-5 px-2 rounded-full bg-[#eef1f6] text-[#3d5173] text-xs font-medium inline-flex items-center whitespace-nowrap flex-shrink-0">
      {children}
    </span>
  );
}

// ตัวเลขสรุปชิดขวาบนหัวการ์ด (เช่น "รวม 12 เดือน ฿9.53M")
// Right-aligned headline figure in a card header.
export function HeaderFigure({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-base font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
