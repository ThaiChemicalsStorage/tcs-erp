import type { ReactNode } from "react";

// ป้ายชื่อฟิลด์ฟอร์มพร้อมเครื่องหมาย * สีแดงเมื่อเป็นฟิลด์ที่จำเป็นต้องกรอก
// Form field label that shows a red "*" marker when the field is required
export function RequiredFieldLabel({
  children,
  required = true,
  className = "text-xs text-muted-foreground block mb-1",
  htmlFor,
}: {
  children: ReactNode;
  required?: boolean;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={className}>
      {children} {required && <span className="text-[#e05252]">*</span>}
    </label>
  );
}
