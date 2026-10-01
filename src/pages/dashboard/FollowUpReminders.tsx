import type { FollowUps, FollowUpSummary, DashboardVatMode } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { todayIsoBangkok } from "../../lib/dateRanges";
import { ChartCard } from "./ChartCard";
import { fmtDateShort, fmtShort } from "./format";
import { DueBadge, Pill } from "./tabs/DepartmentWidgets";

/**
 * การติดตามลูกค้า (บอร์ด Dashboard-Sales, ดีไซน์ใหม่ 2026-09-30) — รวมสองการ์ดเดิม (รายการ 6 แถวบนแท็บ +
 * การ์ดแบ่งกลุ่มเลยกำหนด/วันนี้/กำลังจะถึง ในรายละเอียดเชิงลึก) เป็นรายการเดียวครบทุกแถว: เลยกำหนดก่อน
 * แล้ววันนี้ แล้วกำลังจะถึง · ป้ายท้ายแถวบอกเลย/อีกกี่วัน (ชี้ดูวันนัด) · กดแถวเปิดใบเสนอราคาของลูกค้ารายนั้น
 */
export function FollowUpReminders({ followUps, onOpenClient, vatMode }: { followUps: FollowUps; onOpenClient: (client: string) => void; vatMode: DashboardVatMode }) {
  const { t, lang } = useI18n();
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
  const rows: FollowUpSummary[] = [...followUps.overdue, ...followUps.today, ...followUps.upcoming];
  const today = todayIsoBangkok();
  return (
    <ChartCard
      flush className="h-full" bodyClassName="flex-1 min-h-0 flex flex-col"
      title={t("dashboard.followUps.title")} sub={t("dashboard.followUps.sub").replace("{vat}", vatSuffix)}
      actions={followUps.overdue.length > 0 ? <Pill tone="alert">{t("dashboard.followUps.overdueCount").replace("{n}", String(followUps.overdue.length))}</Pill> : undefined}
    >
      {rows.length === 0 ? (
        <p className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground text-center py-10">{t("dashboard.noData")}</p>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto">
          {rows.map((f) => (
            <li key={f.id} className="border-b border-[#eef1f6] last:border-0">
              <button
                type="button" onClick={() => onOpenClient(f.client)}
                className="w-full min-h-[52px] px-5 py-2 flex items-center gap-3 text-left hover:bg-[#f8f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 transition-colors"
              >
                <span className="flex-1 min-w-0 flex flex-col leading-snug">
                  <span className="font-medium truncate" title={f.client}>{f.client}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    <span className="font-mono">{f.id}</span>{f.salesperson ? ` · ${f.salesperson}` : ""} · {fmtShort(f.amount)}
                  </span>
                </span>
                <span title={t("dashboard.followUps.dateTitle").replace("{date}", f.followUpDate ? fmtDateShort(f.followUpDate.slice(0, 10), lang) : "—")} className="flex-shrink-0">
                  <DueBadge date={f.followUpDate} today={today} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
