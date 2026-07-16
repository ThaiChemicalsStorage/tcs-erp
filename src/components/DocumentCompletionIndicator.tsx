/**
 * Compact "ความสมบูรณ์ของข้อมูล" progress indicator for the Quotation/Scope of Work toolbar — a
 * user aid only (per the validation spec: "Do not use this indicator as the only validation
 * mechanism"), never itself a gate. The real gate is always the ValidationSummary +
 * disabled-button + server-side re-check. Added 2026-07-16.
 */
export function DocumentCompletionIndicator({ totalCount, missingCount }: { totalCount: number; missingCount: number }) {
  if (totalCount <= 0) return null;
  const completed = Math.max(0, totalCount - missingCount);
  const pct = Math.round((completed / totalCount) * 100);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" title={`กรอกแล้ว ${completed} จาก ${totalCount} รายการ`}>
      <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden flex-shrink-0">
        <div className={`h-full transition-all ${pct >= 100 ? "bg-[#2aa36b]" : "bg-[#c9a84c]"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono">{pct}%</span>
    </div>
  );
}
