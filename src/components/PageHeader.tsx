import type { ReactNode } from "react";

// หัวข้อหน้ากลาง แสดงชื่อหน้า คำอธิบายสั้น และปุ่มการทำงานหลัก (ถ้ามี)
// Shared page header showing title, short description, and an optional primary action slot
export function PageHeader({
  title, description, actions, path,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  path?: string;
}) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-3">
      <div>
        {path && <p className="text-xs text-muted-foreground font-mono mb-1">{path}</p>}
        <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
