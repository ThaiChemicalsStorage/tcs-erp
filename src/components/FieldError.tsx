// แสดงข้อความ error ใต้ช่องกรอกข้อมูล ถ้าไม่มีข้อความก็ไม่แสดงอะไรเลย
// Renders a validation error below a form field; renders nothing when there's no message
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-[#e05252] mt-1">{message}</p>;
}
