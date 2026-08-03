// การ์ดกรอบมาตรฐานสำหรับส่วนต่างๆ ของแดชบอร์ด พร้อมหัวข้อและปุ่มการทำงานเสริม
// Standard card wrapper for dashboard sections, with a title and optional actions
export function ChartCard({ title, sub, children, className = "", actions }: { title: string; sub?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <div className={`bg-card border border-border rounded-xl p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</h2>
          {sub && <p className="text-xs text-muted-foreground font-mono mt-0.5">{sub}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
