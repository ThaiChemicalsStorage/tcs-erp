import { FilePen, CheckCircle2, Hourglass, CalendarClock } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import type { ServiceFollowUp } from "../../../lib/departmentDashboard";
import { fmtDateShort } from "../format";
import { ErrorState } from "../DashboardStates";
import { DEPARTMENT_META } from "./tabMeta";
import {
  ChartCard, DepartmentViewFrame, Donut, DueListTable, EmptyNote, KpiCard, KpiGrid, MonthlyBars, OpenListButton, Pill, SplitRow,
  TabIntro, type DepartmentTabProps, type PillTone,
} from "./DepartmentWidgets";
import { daysBetweenIso, fmtCount } from "./countFormat";

/**
 * แท็บบริการ — รายงานร่าง ปิดงานเดือนนี้ รอลูกค้าอนุมัติ PM ที่จะถึง · งานที่ตรวจ 12 เดือน · ผลการอนุมัติของลูกค้า
 * · PM ที่จะถึง · รายงานที่ต้องตามต่อ (docs/DASHBOARD_DESIGN.md ข้อ 7)
 */
export function ServiceTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t, lang } = useI18n();
  const accent = DEPARTMENT_META.service.accent;

  const followUpPill = (f: ServiceFollowUp, today: string): { tone: PillTone; text: string } => {
    const days = f.date ? Math.max(0, daysBetweenIso(f.date, today)) : null;
    const withDays = (key: "dashboard.serviceTab.followUp.pending" | "dashboard.serviceTab.followUp.staleDraft") =>
      t(key).replace("{n}", days === null ? "—" : String(days));
    if (f.reason === "rejected") return { tone: "alert", text: t("dashboard.serviceTab.followUp.rejected") };
    if (f.reason === "pending") return { tone: "warn", text: withDays("dashboard.serviceTab.followUp.pending") };
    return { tone: "neutral", text: withDays("dashboard.serviceTab.followUp.staleDraft") };
  };

  return (
    <DepartmentViewFrame view="service" result={result} onRetry={onRetry}>
      {(response) => {
        const block = response.blocks.service;
        if (!block) return <ErrorState onRetry={onRetry} />;
        const s = block.summary;
        const d = block.detail;
        const today = response.today;
        const pmWithinWeek = d ? d.upcomingPm.filter((p) => daysBetweenIso(today, p.date) <= 7).length : 0;
        const staleDrafts = d?.staleDraftCount ?? 0;
        return (
          <>
            <TabIntro scope={block.scope} />
            <KpiGrid>
              <KpiCard
                icon={FilePen} chip="#5a7299" label={t("dashboard.serviceTab.draft")} value={fmtCount(s.draft)}
                caption={d && staleDrafts > 0 ? t("dashboard.serviceTab.staleDraftCaption").replace("{n}", fmtCount(staleDrafts)) : t("dashboard.dept.caption.asOfNow")}
              />
              <KpiCard
                icon={CheckCircle2} chip={accent} label={t("dashboard.serviceTab.completedThisMonth")} value={fmtCount(s.completedThisMonth)}
                sparkline={d ? { values: d.inspectedByMonth.map((m) => m.completed), color: accent } : undefined}
                caption={d ? t("dashboard.serviceTab.completedSparkline") : undefined}
              />
              <KpiCard icon={Hourglass} chip="#e08a3c" tone={s.approvalPending > 0 ? "warn" : undefined} label={t("dashboard.serviceTab.approvalPending")} value={fmtCount(s.approvalPending)} caption={t("dashboard.dept.caption.asOfNow")} />
              {d && (
                <KpiCard
                  icon={CalendarClock} chip={accent} label={t("dashboard.serviceTab.upcomingPm")} value={fmtCount(d.upcomingPmCount)}
                  caption={t("dashboard.serviceTab.pmWithinWeek").replace("{n}", d.upcomingPm.length >= 10 && pmWithinWeek === d.upcomingPm.length ? `${pmWithinWeek}+` : fmtCount(pmWithinWeek))}
                />
              )}
            </KpiGrid>

            {d && (
              <>
                <SplitRow
                  main={(
                    <ChartCard
                      title={t("dashboard.serviceTab.byMonth.title")} sub={t("dashboard.serviceTab.byMonth.sub")}
                      actions={(
                        <div className="text-right">
                          <p className="text-lg font-semibold font-mono text-foreground leading-none">{fmtCount(d.inspectedInPeriod)}</p>
                          <p className="text-xs text-muted-foreground mt-1">{t("dashboard.serviceTab.inspectedInPeriod")}</p>
                        </div>
                      )}
                    >
                      <MonthlyBars
                        rows={d.inspectedByMonth} format={fmtCount} empty={t("dashboard.serviceTab.byMonth.empty")}
                        series={[{ key: "inspected", name: t("dashboard.serviceTab.byMonth.series"), color: accent }]}
                      />
                    </ChartCard>
                  )}
                  side={(
                    <ChartCard title={t("dashboard.serviceTab.approval.title")} sub={t("dashboard.serviceTab.approval.sub")} className="h-full">
                      <Donut
                        unit={t("dashboard.serviceTab.unit.reports")} empty={t("dashboard.serviceTab.approval.empty")}
                        slices={[
                          { key: "approved", label: t("dashboard.serviceTab.approval.approved"), value: d.approvalBreakdown.approved, color: "#2aa36b" },
                          { key: "pending", label: t("dashboard.serviceTab.approval.pending"), value: d.approvalBreakdown.pending, color: "#e08a3c" },
                          { key: "rejected", label: t("dashboard.serviceTab.approval.rejected"), value: d.approvalBreakdown.rejected, color: "#e05252" },
                          { key: "notSent", label: t("dashboard.serviceTab.approval.notSent"), value: d.approvalBreakdown.notSent, color: "#8a94a6" },
                        ]}
                      />
                    </ChartCard>
                  )}
                />

                <SplitRow
                  main={(
                    <DueListTable
                      title={t("dashboard.serviceTab.pm.title")} sub={t("dashboard.serviceTab.pm.sub")}
                      rows={d.upcomingPm} dateLabel={t("dashboard.serviceTab.pm.dateCol")} today={today}
                      empty={t("dashboard.serviceTab.pm.empty")}
                      actions={<OpenListButton onClick={() => onNavigatePage("service")} />}
                    />
                  )}
                  side={(
                    <ChartCard title={t("dashboard.serviceTab.followUp.title")} sub={t("dashboard.dept.caption.asOfNow")} className="h-full">
                      {d.followUps.length === 0 ? <EmptyNote>{t("dashboard.serviceTab.followUp.empty")}</EmptyNote> : (
                        <ul className="-my-2">
                          {d.followUps.map((f) => {
                            const pill = followUpPill(f, today);
                            return (
                              <li key={`${f.reason}-${f.id}`} className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground truncate" title={f.party}>{f.party || "—"}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{f.id}{f.date ? ` · ${fmtDateShort(f.date, lang)}` : ""}</p>
                                </div>
                                <Pill tone={pill.tone}>{pill.text}</Pill>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </ChartCard>
                  )}
                />
              </>
            )}
          </>
        );
      }}
    </DepartmentViewFrame>
  );
}
