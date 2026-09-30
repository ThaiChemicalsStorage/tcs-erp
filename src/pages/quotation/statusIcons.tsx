import { FilePen, Clock, CheckCircle2, Ban, Send, CheckCheck, Trophy, XCircle, Frown } from "lucide-react";
import type { QuoteStatus } from "../../lib/quotes";

/**
 * ไอคอนประจำสถานะใบเสนอราคา — ย้ายออกจาก `src/lib/quotes.tsx` เมื่อ 2026-08-25
 *
 * The per-status quotation icons. This lived in `src/lib/quotes.tsx` until 2026-08-25 and was the
 * only JSX in that file — which mattered because `api/` imports `src/lib/quotes` at runtime, so the
 * **server** had to be able to transpile JSX at boot. That is exactly what broke production on
 * 2026-08-21 (the Docker image shipped without `tsconfig.json` and crash-looped; see CHANGELOG.md
 * 2026-08-21c). Moving it here let `quotes.tsx` become a plain `quotes.ts`, so the situation cannot
 * recur.
 *
 * **Keep JSX out of `src/lib/quotes.ts` and out of anything it imports.** `tests/serverImportGraph.test.ts`
 * fails the build if a `.tsx` file ever re-enters the server's runtime import graph.
 *
 * `statusStyle` / `statusLabelKey` deliberately stayed in `src/lib/quotes.ts` — they are plain
 * strings, carry no React dependency, and are used by server-adjacent code paths too.
 */
export const statusIcon: Record<QuoteStatus, React.ReactNode> = {
  "ร่าง": <FilePen size={10} />,
  "รออนุมัติ": <Clock size={10} />,
  "อนุมัติแล้ว": <CheckCircle2 size={10} />,
  "ส่งให้ลูกค้าแล้ว": <Send size={10} />,
  "ลูกค้ายอมรับ": <CheckCheck size={10} />,
  "ปิดการขายสำเร็จ": <Trophy size={10} />,
  "ลูกค้าปฏิเสธ": <XCircle size={10} />,
  "เสียโอกาส": <Frown size={10} />,
  "ยกเลิก": <Ban size={10} />,
};

/**
 * ป้ายสถานะใบเสนอราคาแบบดีไซน์ใหม่ (2026-09-30) — พื้นอ่อน + จุดสี + ตัวหนา 12.5px ตาม DESIGN.md "Status Pills"
 * ร่าง/ยกเลิก เทา · รออนุมัติ เหลือง · อนุมัติแล้ว/ส่งให้ลูกค้าแล้ว น้ำเงิน · ลูกค้ายอมรับ/ปิดการขายสำเร็จ เขียว ·
 * ลูกค้าปฏิเสธ/เสียโอกาส แดง · ยกเลิกขีดฆ่า · คำบนป้ายยังเป็นคำเดิมของแอป (`statusLabelKey`)
 */
const PILL_TONE: Record<QuoteStatus, { pill: string; dot: string }> = {
  "ร่าง": { pill: "bg-[#eef1f6] text-[#3d5173]", dot: "bg-[#8a97ad]" },
  "รออนุมัติ": { pill: "bg-[#fdf3e0] text-[#8a5a00]", dot: "bg-[#d89614]" },
  "อนุมัติแล้ว": { pill: "bg-[#e8f0fb] text-[#1a5fb4]", dot: "bg-[#1a5fb4]" },
  "ส่งให้ลูกค้าแล้ว": { pill: "bg-[#e8f0fb] text-[#1a5fb4]", dot: "bg-[#1a5fb4]" },
  "ลูกค้ายอมรับ": { pill: "bg-[#e6f4ec] text-[#1b7f4f]", dot: "bg-[#1b7f4f]" },
  "ปิดการขายสำเร็จ": { pill: "bg-[#e6f4ec] text-[#1b7f4f]", dot: "bg-[#1b7f4f]" },
  "ลูกค้าปฏิเสธ": { pill: "bg-[#fcebeb] text-[#b93636]", dot: "bg-[#b93636]" },
  "เสียโอกาส": { pill: "bg-[#fcebeb] text-[#b93636]", dot: "bg-[#b93636]" },
  "ยกเลิก": { pill: "bg-[#eef1f6] text-[#5f7293] line-through", dot: "bg-[#8a97ad]" },
};

export function QuoteStatusPill({ status, label }: { status: QuoteStatus; label: string }) {
  const tone = PILL_TONE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${tone.pill}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tone.dot}`} />
      {label}
    </span>
  );
}
