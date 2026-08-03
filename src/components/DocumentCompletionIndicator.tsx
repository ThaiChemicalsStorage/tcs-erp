// แสดงแถบความสมบูรณ์ของข้อมูลในเอกสาร เป็นแค่ตัวช่วยแสดงผล ไม่ใช่ตัวตรวจสอบหลัก
// Shows a data-completion progress bar for the document toolbar; a visual aid only, not the real validation gate
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
