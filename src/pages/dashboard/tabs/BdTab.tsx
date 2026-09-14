import { FileClock, FilePen, FileCheck2, CalendarRange, Link2, FileText } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { ChartCard } from "../ChartCard";
import { fmtDateShort } from "../format";
import {
  CardTable, DepartmentTabFrame, OpenListButton, SharedStatusPill, StatTile, TabIntro, TileGrid,
  type DepartmentTabProps,
} from "./DepartmentWidgets";
import { fmtCount } from "./countFormat";

/**
 * แท็บ BD — Cost Control **เป็นจำนวนเอกสารเท่านั้น ไม่มียอดเงิน** ตามที่เจ้าของสั่งถอดยอดรวมทั้งชุดออก
 * เมื่อ 2026-08-31 · เซิร์ฟเวอร์ไม่ส่งตัวเลขเงินมาเลย (มีเทสต์กันไว้) อย่าเพิ่มที่หน้าจอ
 */
export function BdTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t, lang } = useI18n();
  return (
    <DepartmentTabFrame dept="bd" result={result} onRetry={onRetry}>
      {(block) => {
        const s = block.summary;
        const d = block.detail;
        return (
          <>
            <TabIntro scope={block.scope} />
            <TileGrid>
              <StatTile icon={FileClock} label={t("dashboard.bd.pending")} value={fmtCount(s.pending)} accent="#e08a3c" />
              <StatTile icon={FilePen} label={t("dashboard.bd.draft")} value={fmtCount(s.draft)} accent="#5a7299" />
              <StatTile icon={FileCheck2} label={t("dashboard.bd.final")} value={fmtCount(s.final)} accent="#2aa36b" />
              <StatTile icon={CalendarRange} label={t("dashboard.bd.createdInPeriod")} value={fmtCount(s.createdInPeriod)} accent="#5a7299" caption={t("dashboard.dept.periodTag")} />
            </TileGrid>

            {d && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <ChartCard title={t("dashboard.bd.link.title")} sub={t("dashboard.dept.allDocsNow")}>
                  <div className="grid grid-cols-1 gap-3">
                    <StatTile variant="inset" icon={Link2} label={t("dashboard.bd.linkedToScope")} value={fmtCount(d.linkedToScope)} accent="#3b6fc9" />
                    <StatTile variant="inset" icon={FileText} label={t("dashboard.bd.standalone")} value={fmtCount(d.standalone)} accent="#5a7299" />
                  </div>
                </ChartCard>
                <div className="xl:col-span-2">
                  <CardTable
                    title={t("dashboard.bd.recent.title")} sub={t("dashboard.bd.recent.sub")}
                    headers={[t("dashboard.dept.due.col.docNumber"), t("dashboard.bd.col.jobName"), t("dashboard.bd.col.docDate"), t("dashboard.bd.col.status")]}
                    empty={t("dashboard.bd.recent.empty")} isEmpty={d.recent.length === 0}
                    actions={<OpenListButton onClick={() => onNavigatePage("costControl")} />}
                  >
                    {d.recent.map((row) => (
                      <tr key={row.id} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2.5 text-xs font-mono text-foreground font-semibold whitespace-nowrap">{row.docNumber}</td>
                        <td className="px-4 py-2.5 text-sm text-foreground max-w-[260px] truncate" title={row.party}>{row.party || "—"}</td>
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{row.date ? fmtDateShort(row.date, lang) : "—"}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap"><SharedStatusPill status={row.status} /></td>
                      </tr>
                    ))}
                  </CardTable>
                </div>
              </div>
            )}
          </>
        );
      }}
    </DepartmentTabFrame>
  );
}
