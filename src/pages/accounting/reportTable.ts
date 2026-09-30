/**
 * สูตร class ของตารางรายงานบัญชีที่ "พิมพ์หน้าจอตัวเอง" (Pattern B — สรุปเอกสารประจำเดือน ทะเบียนภาษีซื้อ
 * ทะเบียนเจ้าหนี้) · บนจอตามดีไซน์ใหม่ (หัวตาราง 12.5/600 พื้นเทาอ่อน เลขเงินชิดขวา) · บนกระดาษยังแน่นเท่าเดิม
 * (ช่องห่าง 1 · ตัวหนังสือเล็ก · ขึ้นบรรทัดใหม่ได้ · ไม่มีแถบเลื่อน) ซึ่งเป็นหน้าตาที่ตรวจเป็น PDF จริงไว้แล้ว
 * (2026-09-04) — แก้หน้าจอได้ แต่ห้ามตัด class `print:*` ทิ้ง
 */
export const REPORT = {
  page: "flex-1 overflow-y-auto p-6 space-y-5 print:overflow-visible print:p-0",
  card: "bg-card border border-border rounded-xl overflow-hidden print:border-black",
  cardHead: "px-6 py-4 border-b border-[#eef1f6] flex flex-wrap items-center gap-2.5 print:px-2 print:py-1.5",
  table: "w-full min-w-[760px] text-sm print:min-w-0",
  headRow: "h-10 bg-[#f8f9fc] border-b border-border print:h-auto",
  th: "px-3 first:pl-6 last:pr-6 text-left text-[12.5px] font-semibold text-[#3d5173] whitespace-nowrap print:px-1 print:first:pl-1 print:last:pr-1 print:py-1 print:text-[10px] print:whitespace-normal",
  /** หัวคอลัมน์ตัวเลข — ชิดขวาตามคอลัมน์ */
  thNum: "px-3 first:pl-6 last:pr-6 text-right text-[12.5px] font-semibold text-[#3d5173] whitespace-nowrap print:px-1 print:first:pl-1 print:last:pr-1 print:py-1 print:text-[10px] print:whitespace-normal",
  row: "border-b border-[#eef1f6]",
  td: "px-3 first:pl-6 last:pr-6 py-3 whitespace-nowrap print:px-1 print:first:pl-1 print:last:pr-1 print:py-1 print:text-xs print:whitespace-normal",
  num: "text-right tabular-nums",
  footRow: "bg-[#f8f9fc] border-t-2 border-[#c3ccda] font-bold print:border-black",
} as const;
