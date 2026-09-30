import type { ReactNode } from "react";
import { surface } from "./styles";

/**
 * การ์ดหัวข้อในหน้าเอกสาร: หัวการ์ด (ชื่อ 16/600 + ปุ่มเล็กด้านขวา) คั่นเส้นบาง แล้วตามด้วยเนื้อหา
 * `bodyClassName` ไม่ระบุ = padding มาตรฐาน · ส่ง "" เมื่อเนื้อหาเป็นตารางเต็มความกว้าง
 */
export function SectionCard({ title, subtitle, actions, children, bodyClassName, className = "", id }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`${surface.card} ${className}`}>
      {(title || actions) && (
        <div className={surface.cardHead}>
          <div className="flex-1 min-w-0">
            {title && <h2 className={surface.cardTitle}>{title}</h2>}
            {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName ?? "px-6 pt-5 pb-6"}>{children}</div>
    </section>
  );
}
