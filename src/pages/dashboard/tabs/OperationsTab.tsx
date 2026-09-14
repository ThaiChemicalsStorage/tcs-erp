import { FileClock, CalendarClock, AlarmClock, PackageMinus, AlertTriangle } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import type { DepartmentKey } from "../../../lib/dashboardTabs";
import type { DepartmentDashboardResponse, DueItem, OpenPurchaseRequestStages, StatusCounts } from "../../../lib/departmentDashboard";
import { fmtDateShort } from "../format";
import { DEPARTMENT_META } from "./tabMeta";
import {
  ChartCard, DepartmentViewFrame, DueListTable, EmptyNote, KpiCard, KpiGrid, MonthlyBars, OpenListButton,
  ProgressBar, SectionHeading, SegmentBar, SharedStatusPill, SplitRow, TabIntro, type DepartmentTabProps,
  type Segment
} from "./DepartmentWidgets";
import { GOLD, STATUS_COLORS } from "./dashboardTokens";
import { fmtCount } from "./countFormat";

/**
 * แท็บรวม ผลิต · โครงการ · BD (2026-09-14) — เจ้าของสั่ง *"แผนกไหนมีน้อยจับรวมกันเลย"*
 *
 * ผลิตกับโครงการใช้ใบเบิก ใบขอซื้อ และใบส่งมอบชุดเดียวกัน จึงอยู่ส่วนเดียวกันและเทียบกันในกราฟเดียว · BD มี
 * แค่จำนวน Cost Control (ไม่มีเงิน ตามคำสั่ง 2026-08-31) จึงเป็นส่วนล่างใต้เส้นคั่น
 * · **ทุกตัวเลขต้องบอกแผนก** (ป้ายแผนก / แถบแยกสี / คอลัมน์แผนก) ห้ามรวมยอดสองแผนกโดยไม่แยกให้เห็น
 * · บล็อกของแผนกที่ผู้ใช้ไม่มีสิทธิ์เป็น null — ส่วนนั้นไม่แสดงเลย ไม่ใช่แสดงเป็นศูนย์
 * · ใบสั่งผลิต/ใบสั่งงานไม่มีสถานะ "เสร็จ" ป้าย "เลยกำหนด" จึงพูดตรง ๆ ว่าเลยวันที่บนใบ
 */
export function OperationsTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  return (
    <DepartmentViewFrame view="operations" result={result} onRetry={onRetry}>
      {(response) => <OperationsContent response={response} onRetry={onRetry} onNavigatePage={onNavigatePage} />}
    </DepartmentViewFrame>
  );
}

function OperationsContent({ response, onRetry, onNavigatePage }: {
  response: DepartmentDashboardResponse;
  onRetry: () => void;
  onNavigatePage: (navKey: string) => void;
}) {
  const { t, lang } = useI18n();
  const production = response.blocks.production ?? null;
  const project = response.blocks.project ?? null;
  const bd = response.blocks.bd ?? null;
  const today = response.today;
  const scope = [production, project, bd].some((b) => b?.scope === "own") ? "own" : "all";

  const works: DepartmentKey[] = [...(production ? ["production" as const] : []), ...(project ? ["project" as const] : [])];
  const pd = production?.detail ?? null;
  const pj = project?.detail ?? null;

  /** แถบแยกสองแผนก — ข้ามแผนกที่ไม่มีสิทธิ์ หรือตัวเลขนั้นเป็น null */
  const split = (productionValue: number | null | undefined, projectValue: number | null | undefined): Segment[] => [
    ...(production && productionValue !== null && productionValue !== undefined
      ? [{ key: "production", label: t("dashboard.tab.production"), value: productionValue, color: DEPARTMENT_META.production.accent }] : []),
    ...(project && projectValue !== null && projectValue !== undefined
      ? [{ key: "project", label: t("dashboard.tab.project"), value: projectValue, color: DEPARTMENT_META.project.accent }] : []),
  ];
  const sum = (segments: Segment[]) => segments.reduce((s, x) => s + x.value, 0);

  const pendingSplit = split(production?.summary.pending, project?.summary.jobOrderPending);
  const dueSoonSplit = split(production?.summary.dueSoon, project?.summary.jobOrderDueSoon);
  const pastDueSplit = split(production?.summary.pastDue, project?.summary.jobOrderPastDue);
  const mrSplit = split(production?.summary.mrAwaitingIssue, project?.summary.mrAwaitingIssue);

  const startedRows = (pd?.startedByMonth ?? pj?.startedByMonth ?? []).map((m, i) => ({
    month: m.month,
    production: pd?.startedByMonth[i]?.count ?? 0,
    project: pj?.startedByMonth?.[i]?.count ?? 0,
  }));
  const startedSeries = [
    ...(pd ? [{ key: "production", name: t("dashboard.ops.started.production"), color: DEPARTMENT_META.production.accent }] : []),
    ...(pj?.startedByMonth ? [{ key: "project", name: t("dashboard.ops.started.project"), color: DEPARTMENT_META.project.accent }] : []),
  ];

  const dueRows: (DueItem & { dept: DepartmentKey })[] = [
    ...(pd?.dueList ?? []).map((r) => ({ ...r, dept: "production" as const })),
    ...(pj?.dueList ?? []).map((r) => ({ ...r, dept: "project" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const deptOfRow = new Map(dueRows.map((r) => [r.id, r.dept]));

  const deliveryOrder = pd?.deliveryOrder ?? pj?.deliveryOrder ?? null;
  const worksFailed = response.failed.some((k) => k === "production" || k === "project");

  return (
    <>
      <TabIntro scope={scope}>
        <span>{t("dashboard.ops.intro")}</span>
      </TabIntro>

      {worksFailed && <FailedNote onRetry={onRetry} />}

      {works.length > 0 && (
        <>
          <SectionHeading depts={works} title={t("dashboard.ops.works.title")} note={t("dashboard.ops.works.note")} />
          <KpiGrid>
            <KpiCard icon={FileClock} chip={GOLD} label={t("dashboard.ops.pending")} value={fmtCount(sum(pendingSplit))} segments={pendingSplit} />
            <KpiCard icon={CalendarClock} chip="#e08a3c" tone={sum(dueSoonSplit) > 0 ? "warn" : undefined} label={t("dashboard.ops.dueSoon")} value={fmtCount(sum(dueSoonSplit))} segments={dueSoonSplit} />
            <KpiCard icon={AlarmClock} chip="#e05252" tone={sum(pastDueSplit) > 0 ? "alert" : undefined} label={t("dashboard.ops.pastDue")} value={fmtCount(sum(pastDueSplit))} segments={pastDueSplit} help={t("dashboard.production.pastDueHelp")} />
            {mrSplit.length > 0 && <KpiCard icon={PackageMinus} chip="#e08a3c" label={t("dashboard.ops.mrAwaitingIssue")} value={fmtCount(sum(mrSplit))} segments={mrSplit} />}
          </KpiGrid>

          {(pd || pj) && (
            <>
              <SplitRow
                main={startedSeries.length > 0 && (
                  <ChartCard title={t("dashboard.ops.started.title")} sub={t("dashboard.ops.started.sub")}>
                    <MonthlyBars rows={startedRows} series={startedSeries} format={fmtCount} empty={t("dashboard.ops.started.empty")} />
                  </ChartCard>
                )}
                side={(
                  <ChartCard title={t("dashboard.ops.status.title")} sub={t("dashboard.ops.status.sub")} className="h-full">
                    <div className="space-y-5">
                      {pd && <StatusRow label={t("nav.productionOrder")} counts={pd.status} onOpen={() => onNavigatePage("productionOrder")} />}
                      {pj?.jobOrderStatus && <StatusRow label={t("nav.jobOrder")} counts={pj.jobOrderStatus} onOpen={() => onNavigatePage("jobOrder")} />}
                      {(pd?.prOpenStage || pj?.prOpenStage) && (
                        <div className="pt-4 border-t border-border space-y-2">
                          <p className="text-sm font-medium text-foreground">{t("dashboard.ops.prOpen.title")}</p>
                          {pd?.prOpenStage && <PrStageLine dept="production" stages={pd.prOpenStage} />}
                          {pj?.prOpenStage && <PrStageLine dept="project" stages={pj.prOpenStage} />}
                        </div>
                      )}
                    </div>
                  </ChartCard>
                )}
              />

              <SplitRow
                main={(
                  <DueListTable
                    title={t("dashboard.ops.due.title")} sub={t("dashboard.ops.due.sub")}
                    rows={dueRows} dateLabel={t("dashboard.ops.due.dateCol")} today={today}
                    empty={t("dashboard.ops.due.empty")} deptOf={(row) => deptOfRow.get(row.id) ?? "production"}
                  />
                )}
                side={deliveryOrder && (
                  <ChartCard
                    title={t("nav.deliveryOrder")} sub={t("dashboard.dept.deliveryOrderShared")} className="h-full"
                    actions={<OpenListButton onClick={() => onNavigatePage("deliveryOrder")} />}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        ["final", t("dashboard.dept.status.final"), deliveryOrder.final],
                        ["pending", t("dashboard.dept.status.pending"), deliveryOrder.pending],
                        ["draft", t("dashboard.dept.status.draft"), deliveryOrder.draft],
                        ["total", t("dashboard.dept.status.total"), deliveryOrder.total],
                      ] as const).map(([key, label, value]) => (
                        <div key={key} className="rounded-lg bg-muted/70 p-3">
                          <p className="text-xl font-semibold font-mono text-foreground leading-none">{fmtCount(value)}</p>
                          <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
                        </div>
                      ))}
                    </div>
                  </ChartCard>
                )}
              />
            </>
          )}
        </>
      )}

      {response.failed.includes("bd") && <FailedNote onRetry={onRetry} />}

      {bd && (
        <>
          <SectionHeading depts={["bd"]} title={t("nav.costControl")} note={t("dashboard.ops.bd.note")} divider={works.length > 0} />
          <SplitRow
            main={(
              <ChartCard title={t("dashboard.ops.bd.counts.title")} sub={t("dashboard.dept.allDocsNow")}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {([
                    ["pending", t("dashboard.bd.pending"), bd.summary.pending, bd.summary.pending > 0 ? "text-[#a75d1a]" : "text-foreground"],
                    ["draft", t("dashboard.bd.draft"), bd.summary.draft, "text-foreground"],
                    ["final", t("dashboard.bd.final"), bd.summary.final, "text-foreground"],
                    ["period", `${t("dashboard.bd.createdInPeriod")}`, bd.summary.createdInPeriod, "text-foreground"],
                  ] as const).map(([key, label, value, cls], i) => (
                    <div key={key} className={`min-w-0 ${i > 0 ? "sm:pl-3 sm:border-l sm:border-border" : ""}`}>
                      <p className="text-xs text-muted-foreground truncate" title={label}>{label}</p>
                      <p className={`text-xl font-semibold font-mono leading-tight mt-1 ${cls}`}>{fmtCount(value)}</p>
                    </div>
                  ))}
                </div>
                {bd.detail && (
                  <div className="mt-5 pt-4 border-t border-border">
                    <p className="text-xs font-mono text-muted-foreground mb-2">{t("dashboard.ops.bd.byMonth")}</p>
                    <MonthlyBars rows={bd.detail.createdByMonth} series={[{ key: "count", name: t("dashboard.ops.bd.byMonthSeries"), color: DEPARTMENT_META.bd.accent }]} format={fmtCount} height={150} empty={t("dashboard.bd.recent.empty")} />
                  </div>
                )}
              </ChartCard>
            )}
            side={bd.detail && (
              <ChartCard title={t("dashboard.bd.link.title")} sub={t("dashboard.dept.allDocsNow")} className="h-full" actions={<OpenListButton onClick={() => onNavigatePage("costControl")} />}>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground">{t("dashboard.bd.linkedToScope")}</span>
                    <span className="font-mono text-muted-foreground">{fmtCount(bd.detail.linkedToScope)} / {fmtCount(bd.detail.linkedToScope + bd.detail.standalone)}</span>
                  </div>
                  <ProgressBar value={bd.detail.linkedToScope} max={bd.detail.linkedToScope + bd.detail.standalone} color={DEPARTMENT_META.bd.accent} />
                  <p className="text-xs text-muted-foreground">{t("dashboard.bd.standalone")} <span className="font-mono text-foreground">{fmtCount(bd.detail.standalone)}</span></p>
                </div>
                <div className="mt-5 pt-4 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{t("dashboard.bd.recent.title")}</p>
                  {bd.detail.recent.length === 0 ? <EmptyNote>{t("dashboard.bd.recent.empty")}</EmptyNote> : (
                    <ul>
                      {bd.detail.recent.slice(0, 5).map((row) => (
                        <li key={row.id} className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-mono font-semibold text-foreground">{row.docNumber}</p>
                            <p className="text-xs text-muted-foreground truncate" title={row.party}>{row.party || "—"}{row.date ? ` · ${fmtDateShort(row.date, lang)}` : ""}</p>
                          </div>
                          <SharedStatusPill status={row.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </ChartCard>
            )}
          />
        </>
      )}
    </>
  );
}

function StatusRow({ label, counts, onOpen }: { label: string; counts: StatusCounts; onOpen: () => void }) {
  const { t } = useI18n();
  const total = counts.draft + counts.pending + counts.final;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <button onClick={onOpen} className="text-sm font-medium text-foreground hover:text-[#866d28] transition-colors">{label}</button>
        <span className="text-xs font-mono text-muted-foreground">{fmtCount(total)} {t("dashboard.unit.docs")}</span>
      </div>
      <SegmentBar
        height={14}
        segments={[
          { key: "draft", label: t("dashboard.dept.status.draft"), value: counts.draft, color: STATUS_COLORS.draft },
          { key: "pending", label: t("dashboard.dept.status.pending"), value: counts.pending, color: STATUS_COLORS.pending },
          { key: "final", label: t("dashboard.dept.status.final"), value: counts.final, color: STATUS_COLORS.final },
        ]}
      />
    </div>
  );
}

function PrStageLine({ dept, stages }: { dept: DepartmentKey; stages: OpenPurchaseRequestStages }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="font-medium" style={{ color: DEPARTMENT_META[dept].ink }}>{t(DEPARTMENT_META[dept].labelKey)}</span>
      <span className="text-muted-foreground">
        {t("dashboard.ops.prOpen.atStore")} <span className="font-mono text-foreground">{fmtCount(stages.atStore)}</span>
        {" · "}
        {t("dashboard.ops.prOpen.atPurchasing")} <span className="font-mono text-foreground">{fmtCount(stages.atPurchasing)}</span>
      </span>
    </div>
  );
}

function FailedNote({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[#e05252]/25 bg-[#e05252]/5 text-sm">
      <AlertTriangle size={16} className="text-[#d22626] flex-shrink-0" />
      <span className="flex-1 text-foreground">{t("dashboard.dept.loadError")}</span>
      <button onClick={onRetry} className="px-2.5 py-1 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">{t("dashboard.dept.retry")}</button>
    </div>
  );
}
