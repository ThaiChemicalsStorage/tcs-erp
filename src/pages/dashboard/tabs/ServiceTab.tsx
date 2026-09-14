import { CalendarRange, Hourglass, XCircle, CalendarClock } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { ServiceSummary } from "../ServiceSummary";
import {
  DepartmentTabFrame, DueListTable, OpenListButton, StatTile, TabIntro, TileGrid, type DepartmentTabProps,
} from "./DepartmentWidgets";
import { fmtCount } from "./countFormat";

/** แท็บบริการ — การ์ดงานบริการเดิม (ย้ายมาจากแดชบอร์ดขาย) + การอนุมัติของลูกค้า + PM ที่กำลังจะถึง */
export function ServiceTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t } = useI18n();
  return (
    <DepartmentTabFrame dept="service" result={result} onRetry={onRetry}>
      {(block, response) => {
        const d = block.detail;
        return (
          <>
            <TabIntro scope={block.scope} />
            {d && (
              <>
                <ServiceSummary data={d.counts} />
                <TileGrid>
                  <StatTile icon={CalendarRange} label={t("dashboard.serviceTab.inspectedInPeriod")} value={fmtCount(d.inspectedInPeriod)} accent="#1f9d8a" caption={t("dashboard.dept.periodTag")} />
                  <StatTile icon={Hourglass} label={t("dashboard.serviceTab.approvalPending")} value={fmtCount(d.approvalPending)} accent="#e08a3c" tone={d.approvalPending > 0 ? "warn" : undefined} />
                  <StatTile icon={XCircle} label={t("dashboard.serviceTab.approvalRejected")} value={fmtCount(d.approvalRejected)} accent="#e05252" tone={d.approvalRejected > 0 ? "alert" : undefined} />
                  <StatTile icon={CalendarClock} label={t("dashboard.serviceTab.upcomingPm")} value={fmtCount(d.upcomingPmCount)} accent="#3b6fc9" />
                </TileGrid>
                <DueListTable
                  title={t("dashboard.serviceTab.pm.title")} sub={t("dashboard.serviceTab.pm.sub")}
                  rows={d.upcomingPm} dateLabel={t("dashboard.serviceTab.pm.dateCol")} today={response.today}
                  empty={t("dashboard.serviceTab.pm.empty")}
                  actions={<OpenListButton onClick={() => onNavigatePage("service")} />}
                />
              </>
            )}
          </>
        );
      }}
    </DepartmentTabFrame>
  );
}
