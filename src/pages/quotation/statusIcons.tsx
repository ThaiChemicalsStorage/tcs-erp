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
