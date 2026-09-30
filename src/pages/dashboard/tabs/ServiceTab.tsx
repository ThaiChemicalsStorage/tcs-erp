import { useI18n } from "../../../lib/i18n";
import type { ServiceFollowUp } from "../../../lib/departmentDashboard";
import { fmtDateShort } from "../format";
import { ErrorState } from "../DashboardStates";
import { HeaderFigure } from "../ChartCard";
import {
  ChartCard, DepartmentViewFrame, Donut, DueListTable, EmptyNote, KpiCard, KpiGrid, MonthlyBars, Num, OpenListButton, Pill, SplitRow,
  TabIntro, type DepartmentTabProps, type PillTone,
} from "./DepartmentWidgets";
import { TONE } from "./dashboardTokens";
import { daysBetweenIso, fmtCount } from "./countFormat";

/**
 * แท็บบริการ — รายงานร่าง ปิดงานเดือนนี้ รอลูกค้าอนุมัติ PM ที่จะถึง · งานที่ตรวจ 12 เดือน · ผลการอนุมัติของลูกค้า
 * · PM ที่จะถึง · รายงานที่ต้องตามต่อ (docs/DASHBOARD_DESIGN.md ข้อ 7 · บอร์ด Dashboard-Service)
 */
export function ServiceTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t, lang } = useI18n();

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
        const now = t("dashboard.dept.caption.asOfNow");
        const docs = t("dashboard.unit.docs");
        const pmWithinWeek = d ? d.upcomingPm.filter((p) => daysBetweenIso(today, p.date) <= 7).length : 0;
        const staleDrafts = d?.staleDraftCount ?? 0;
        const [staleBefore, staleAfter] = t("dashboard.serviceTab.staleDraftCaption").split("{n}");
        const [weekBefore, weekAfter] = t("dashboard.serviceTab.pmWithinWeek").split("{n}");
        return (
          <>
            <TabIntro scope={block.scope} />
            <KpiGrid>
              <KpiCard
                label={t("dashboard.serviceTab.draft")} value={fmtCount(s.draft)} unit={docs} scope={now}
                caption={d && staleDrafts > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d89614]" aria-hidden="true" />
                    {staleBefore}<Num tone="warn">{fmtCount(staleDrafts)}</Num>{staleAfter}
                  </span>
                ) : undefined}
              />
              <KpiCard
                label={t("dashboard.serviceTab.completedThisMonth")} value={fmtCount(s.completedThisMonth)} unit={t("dashboard.unit.jobs")}
                sparkline={d ? { values: d.inspectedByMonth.map((m) => m.completed) } : undefined}
                caption={d ? t("dashboard.serviceTab.completedSparkline") : undefined}
              />
              <KpiCard tone={s.approvalPending > 0 ? "warn" : undefined} label={t("dashboard.serviceTab.approvalPending")} value={fmtCount(s.approvalPending)} unit={docs} scope={now} />
              {d && (
                <KpiCard
                  label={t("dashboard.serviceTab.upcomingPm")} value={fmtCount(d.upcomingPmCount)} unit={t("dashboard.unit.items")} scope={now}
                  caption={<>{weekBefore}<Num>{d.upcomingPm.length >= 10 && pmWithinWeek === d.upcomingPm.length ? `${pmWithinWeek}+` : fmtCount(pmWithinWeek)}</Num>{weekAfter}</>}
                />
              )}
            </KpiGrid>

            {d && (
              <>
                <SplitRow
                  main={(
                    <ChartCard
                      fill title={t("dashboard.serviceTab.byMonth.title")} sub={t("dashboard.serviceTab.byMonth.sub")}
                      actions={<HeaderFigure label={t("dashboard.serviceTab.inspectedInPeriod")} value={`${fmtCount(d.inspectedInPeriod)} ${t("dashboard.unit.jobs")}`} />}
                    >
                      <MonthlyBars
                        rows={d.inspectedByMonth} format={fmtCount} empty={t("dashboard.serviceTab.byMonth.empty")}
                        series={[{ key: "inspected", name: t("dashboard.serviceTab.byMonth.series") }]}
                      />
                    </ChartCard>
                  )}
                  side={(
                    <ChartCard title={t("dashboard.serviceTab.approval.title")} sub={t("dashboard.serviceTab.approval.sub")} className="h-full" bodyClassName="px-5 py-5 flex-1 flex items-center">
                      <Donut
                        unit={t("dashboard.serviceTab.unit.reports")} empty={t("dashboard.serviceTab.approval.empty")}
                        slices={[
                          { key: "approved", label: t("dashboard.serviceTab.approval.approved"), value: d.approvalBreakdown.approved, color: TONE.good },
                          { key: "pending", label: t("dashboard.serviceTab.approval.pending"), value: d.approvalBreakdown.pending, color: TONE.warn },
                          { key: "rejected", label: t("dashboard.serviceTab.approval.rejected"), value: d.approvalBreakdown.rejected, color: TONE.alert },
                          { key: "notSent", label: t("dashboard.serviceTab.approval.notSent"), value: d.approvalBreakdown.notSent, color: TONE.empty },
                        ]}
                      />
                    </ChartCard>
                  )}
                />

                <SplitRow
                  main={(
                    <DueListTable
                      title={t("dashboard.serviceTab.pm.title")} sub={`${now} · ${t("dashboard.serviceTab.pm.sub")}`}
                      rows={d.upcomingPm} dateLabel={t("dashboard.serviceTab.pm.dateCol")} today={today}
                      empty={t("dashboard.serviceTab.pm.empty")}
                      actions={<OpenListButton onClick={() => onNavigatePage("service")} />}
                    />
                  )}
                  side={(
                    <ChartCard title={t("dashboard.serviceTab.followUp.title")} sub={`${now} · ${t("dashboard.serviceTab.followUp.sub")}`} className="h-full" flush>
                      {d.followUps.length === 0 ? <EmptyNote>{t("dashboard.serviceTab.followUp.empty")}</EmptyNote> : (
                        <ul>
                          {d.followUps.map((f) => {
                            const pill = followUpPill(f, today);
                            return (
                              <li key={`${f.reason}-${f.id}`} className="flex items-center gap-3 px-5 min-h-[58px] py-2 border-b border-[#eef1f6] last:border-0">
                                <div className="min-w-0 flex-1 leading-snug">
                                  <p className="text-sm font-medium text-foreground truncate" title={f.party}>{f.party || "—"}</p>
                                  <p className="text-xs text-muted-foreground truncate"><span className="font-mono">{f.id}</span>{f.date ? ` · ${fmtDateShort(f.date, lang)}` : ""}</p>
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

