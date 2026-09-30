import type { ReactNode, SelectHTMLAttributes } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { field } from "./styles";

/**
 * ช่องกรอกแบบใหม่: ชื่อช่องอยู่เหนือกล่อง · ดอกจันแดงเมื่อบังคับ · คำอธิบายหรือข้อผิดพลาดใต้กล่อง
 * ใส่ตัวกล่องเอง (input/select/textarea ที่ใช้ `field.input`) เป็น children
 */
export function Field({ label, htmlFor, required, help, error, className = "", children }: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  help?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className={field.label}>
        {label}
        {required && <span className="text-[#b93636]"> *</span>}
      </label>
      {children}
      {error ? (
        <p className={`${field.error} flex items-center gap-1`}><AlertCircle size={13} className="flex-shrink-0" />{error}</p>
      ) : help ? (
        <p className={field.help}>{help}</p>
      ) : null}
    </div>
  );
}

/**
 * ค่าที่อ่านอย่างเดียว (เอกสารที่อนุมัติแล้ว) — ไม่มีกล่อง · ชื่อเล็กสีเทาเหนือค่า · ว่าง = "—"
 */
export function ReadonlyField({ label, value, mono, className = "" }: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={`flex flex-col gap-0.5 min-w-0 ${className}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium break-words ${empty ? "text-[#8a97ad]" : "text-foreground"} ${mono ? "font-mono" : ""}`}>
        {empty ? "—" : value}
      </span>
    </div>
  );
}

/** dropdown หน้าตาช่องกรอก (select จริงของเบราว์เซอร์ + ลูกศร) — ส่ง props ของ <select> ได้ทั้งหมด */
export function SelectBox({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`relative block ${className}`}>
      <select {...props} className={`${field.input} w-full pr-9 appearance-none cursor-pointer`}>{children}</select>
      <ChevronDown size={16} aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
    </span>
  );
}
