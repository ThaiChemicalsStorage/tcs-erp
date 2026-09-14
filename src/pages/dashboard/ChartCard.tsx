// การ์ดกรอบมาตรฐานสำหรับส่วนต่างๆ ของแดชบอร์ด พร้อมหัวข้อและปุ่มการทำงานเสริม
// Standard card wrapper for dashboard sections, with a title and optional actions
// `fill` (2026-09-14): การ์ดที่ถูกยืดให้สูงเท่าการ์ดข้าง ๆ ในแถว 2 ต่อ 1 — เนื้อหา (กราฟ) ขยายลงเต็มการ์ด
// ไม่เหลือช่องว่างใต้กราฟ · ไม่ส่ง = หน้าตาเดิมทุกที่
export function ChartCard({ title, sub, children, className = "", actions, fill = false }: { title: string; sub?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode; fill?: boolean }) {
  return (
    <div className={`bg-card border border-border rounded-xl p-5 ${fill ? "flex flex-col" : ""} ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</h2>
          {sub && <p className="text-xs text-muted-foreground font-mono mt-0.5">{sub}</p>}
        </div>
        {actions}
      </div>
      {fill ? <div className="flex-1 min-h-0 flex flex-col">{children}</div> : children}
    </div>
  );
}
