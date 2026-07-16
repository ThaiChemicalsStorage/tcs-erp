import { AlertTriangle } from "lucide-react";

/**
 * Top-of-form validation summary — shown whenever a document is incomplete, so the user sees at a
 * glance how much is left before Preview/Submit/Approve/Print/etc. become available, without
 * hunting through the form for red asterisks one at a time. Added 2026-07-16 (required-field
 * validation pass), shared between Quotation and Scope of Work per "use the same validation
 * behavior... do not create two unrelated implementations."
 */
export function ValidationSummary({ missingCount, messages = [] }: { missingCount: number; messages?: string[] }) {
  if (missingCount <= 0) return null;
  const shown = messages.slice(0, 8);
  const remaining = messages.length - shown.length;
  return (
    <div className="bg-[#e05252]/10 border border-[#e05252]/30 rounded-xl p-4 print:hidden">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="text-[#e05252] flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#e05252]">ยังไม่สามารถดำเนินการต่อได้</p>
          <p className="text-xs text-[#e05252]/90 mt-0.5">กรุณากรอกข้อมูลที่จำเป็นให้ครบ {missingCount} รายการ</p>
          {shown.length > 0 && (
            <ul className="mt-2 space-y-0.5 list-disc list-inside">
              {shown.map((m, i) => (
                <li key={i} className="text-xs text-[#e05252]/90">{m}</li>
              ))}
              {remaining > 0 && <li className="text-xs text-[#e05252]/70">และอีก {remaining} รายการ</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
