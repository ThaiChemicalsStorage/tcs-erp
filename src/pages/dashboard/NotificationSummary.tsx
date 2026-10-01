import type { NotificationSummary as NotificationSummaryData } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { fmtCount } from "./tabs/countFormat";

// สรุปการแจ้งเตือนของผู้ใช้ — จำนวนที่ยังไม่อ่าน แยกตามประเภท (ข้อมูลส่วนตัว ไม่ขึ้นกับตัวกรอง)
// บอร์ดดีไซน์ใหม่ไม่มีการ์ดนี้ แต่เป็นข้อมูลที่แท็บขายแสดงอยู่ จึงคงไว้ในคอลัมน์ข้างตามหน้าตาการ์ดใหม่
// Shows a notification summary — unread count broken down by type
export function NotificationSummary({ summary }: { summary: NotificationSummaryData }) {
  const { t } = useI18n();
  const byType = Object.entries(summary.byType);
  return (
    <ChartCard title={t("dashboard.notifications.title")} sub={t("dashboard.notifications.personalNote")} bodyClassName="px-5 py-4 flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] leading-tight font-semibold tabular-nums">{fmtCount(summary.unreadCount)}</span>
        <span className="text-[13px] text-muted-foreground">{t("dashboard.notifications.unread")}</span>
      </div>
      {byType.length > 0 && (
        <ul className="flex flex-col">
          {byType.map(([type, count]) => (
            <li key={type} className="flex items-baseline gap-2 py-1 border-t border-[#eef1f6] text-[13px]">
              <span className="flex-1 min-w-0 truncate text-[#26395a]" title={type}>{type}</span>
              <span className="font-semibold tabular-nums">{fmtCount(count)}</span>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
