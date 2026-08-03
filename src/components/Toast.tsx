import { CheckCircle2 } from "lucide-react";

// ข้อความแจ้งเตือนสั้น ๆ มุมล่างขวาของหน้าจอ แสดงเมื่อมีข้อความเท่านั้น
// Short toast notification in the bottom-right corner, rendered only when a message is present
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[60] print:hidden">
      <div role="status" aria-live="polite" aria-atomic="true" className="flex items-center gap-2.5 bg-[#0b1d3a] text-white px-4 py-3 rounded-lg shadow-2xl border border-[#c9a84c]/30">
        <CheckCircle2 size={16} className="text-[#c9a84c] flex-shrink-0" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  );
}
