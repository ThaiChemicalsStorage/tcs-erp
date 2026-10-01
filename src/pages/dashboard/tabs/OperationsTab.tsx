import { AlertTriangle, RotateCw } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import type { DepartmentKey } from "../../../lib/dashboardTabs";
import type { DeliveryOrderCounts, DepartmentDashboardResponse, DueItem, OpenPurchaseRequestStages, StatusCounts } from "../../../lib/departmentDashboard";
import { fmtDateShort } from "../format";
import { DEPARTMENT_META } from "./tabMeta";
import { btn } from "../../../components/ui/styles";
import {
  CardFooterLink, ChartCard, DepartmentViewFrame, DueListTable, EmptyNote, KpiCard, KpiGrid, MonthlyBars, Num, ProgressBar,
  SectionHeading, SegmentBar, SeriesLegend, SharedStatusPill, SplitRow, StatCells, StatusChip, TabIntro, type DepartmentTabProps,
  type PillTone, type Segment
} from "./DepartmentWidgets";
import { CHART, STATUS_COLORS } from "./dashboardTokens";
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

  /** แถบแยกสองแผนก (ผลิต = น้ำเงิน · โครงการ = ส้ม) — ข้ามแผนกที่ไม่มีสิทธิ์ หรือตัวเลขนั้นเป็น null */
  const split = (productionValue: number | null | undefined, projectValue: number | null | undefined): Segment[] => [
    ...(production && productionValue !== null && productionValue !== undefined
      ? [{ key: "production", label: t("dashboard.tab.production"), value: productionValue, color: CHART.blue }] : []),
    ...(project && projectValue !== null && projectValue !== undefined
      ? [{ key: "project", label: t("dashboard.tab.project"), value: projectValue, color: CHART.orange }] : []),
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
    ...(pd ? [{ key: "production", name: t("dashboard.ops.started.production"), color: CHART.blue }] : []),
    ...(pj?.startedByMonth ? [{ key: "project", name: t("dashboard.ops.started.project"), color: CHART.orange }] : []),
  ];

  const dueRows: (DueItem & { dept: DepartmentKey })[] = [
    ...(pd?.dueList ?? []).map((r) => ({ ...r, dept: "production" as const })),
    ...(pj?.dueList ?? []).map((r) => ({ ...r, dept: "project" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const deptOfRow = new Map(dueRows.map((r) => [r.id, r.dept]));

  const deliveryOrder = pd?.deliveryOrder ?? pj?.deliveryOrder ?? null;
  const worksFailed = response.failed.some((k) => k === "production" || k === "project");
  const now = t("dashboard.dept.caption.asOfNow");
  const docs = t("dashboard.unit.docs");

  return (
    <>
      <TabIntro scope={scope}>
        <span>{t("dashboard.ops.intro")}</span>
      </TabIntro>

      {worksFailed && <FailedNote onRetry={onRetry} />}

      {works.length > 0 && (
        <>
          <SectionHeading
            depts={works} title={t("dashboard.ops.works.title")}
            note={works.length > 1 ? `${t("dashboard.ops.works.note")} · ${t("dashboard.ops.works.colors")}` : t("dashboard.ops.works.note")}
          />
          <KpiGrid>
            <KpiCard label={t("dashboard.ops.pending")} value={fmtCount(sum(pendingSplit))} unit={docs} scope={now} segments={pendingSplit} />
            <KpiCard tone={sum(dueSoonSplit) > 0 ? "warn" : undefined} label={t("dashboard.ops.dueSoon")} value={fmtCount(sum(dueSoonSplit))} unit={docs} scope={now} segments={dueSoonSplit} />
            <KpiCard tone={sum(pastDueSplit) > 0 ? "alert" : undefined} label={t("dashboard.ops.pastDue")} value={fmtCount(sum(pastDueSplit))} unit={docs} scope={now} segments={pastDueSplit} help={t("dashboard.production.pastDueHelp")} />
            {mrSplit.length > 0 && <KpiCard label={t("dashboard.ops.mrAwaitingIssue")} value={fmtCount(sum(mrSplit))} unit={docs} scope={now} segments={mrSplit} />}
          </KpiGrid>

          {(pd || pj) && (
            <>
              <SplitRow
                main={startedSeries.length > 0 && (
                  <ChartCard fill title={t("dashboard.ops.started.title")} sub={t("dashboard.ops.started.sub")} actions={startedSeries.length > 1 ? <SeriesLegend series={startedSeries} /> : undefined}>
                    <MonthlyBars rows={startedRows} series={startedSeries} format={fmtCount} empty={t("dashboard.ops.started.empty")} />
                  </ChartCard>
                )}
                side={(
                  <ChartCard title={t("dashboard.ops.status.title")} sub={t("dashboard.ops.status.sub")} className="h-full" bodyClassName="px-5 pt-3.5 pb-4">
                    <div className="flex flex-col gap-3.5">
                      {pd && <StatusRow label={t("nav.productionOrder")} counts={pd.status} onOpen={() => onNavigatePage("productionOrder")} />}
                      {pj?.jobOrderStatus && <StatusRow label={t("nav.jobOrder")} counts={pj.jobOrderStatus} onOpen={() => onNavigatePage("jobOrder")} />}
                      {(pd?.prOpenStage || pj?.prOpenStage) && (
                        <div className="pt-2.5 border-t border-[#eef1f6] flex flex-col gap-1">
                          <p className="text-xs font-semibold text-muted-foreground">{t("dashboard.ops.prOpen.title")}</p>
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
                side={deliveryOrder && <DeliveryOrderCard counts={deliveryOrder} onOpen={() => onNavigatePage("deliveryOrder")} />}
              />
            </>
          )}
        </>
      )}

      {response.failed.includes("bd") && <FailedNote onRetry={onRetry} />}

      {bd && (
        <>
          <SectionHeading depts={["bd"]} title={t("nav.costControl")} note={t("dashboard.ops.bd.note")} />
          <SplitRow
            main={(
              <ChartCard fill flush title={t("dashboard.ops.bd.counts.title")} sub={t("dashboard.ops.bd.counts.sub")}>
                <div className="border-b border-[#eef1f6]">
                  <StatCells
                    size="lg"
                    cells={[
                      { key: "pending", label: t("dashboard.bd.pending"), value: fmtCount(bd.summary.pending), tone: bd.summary.pending > 0 ? "warn" : undefined },
                      { key: "draft", label: t("dashboard.bd.draft"), value: fmtCount(bd.summary.draft) },
                      { key: "final", label: t("dashboard.bd.final"), value: fmtCount(bd.summary.final) },
                      { key: "period", label: t("dashboard.bd.createdInPeriod"), tag: t("dashboard.dept.periodTag"), value: fmtCount(bd.summary.createdInPeriod) },
                    ]}
                  />
                </div>
                {bd.detail && (
                  <div className="flex-1 flex flex-col px-6 pt-3.5 pb-4 gap-2 min-h-[230px]">
                    <p className="text-[13px] font-semibold text-[#26395a]">{t("dashboard.ops.bd.byMonth")}</p>
                    <MonthlyBars rows={bd.detail.createdByMonth} series={[{ key: "count", name: t("dashboard.ops.bd.byMonthSeries") }]} format={fmtCount} height={180} empty={t("dashboard.bd.recent.empty")} />
                  </div>
                )}
              </ChartCard>
            )}
            side={bd.detail && (
              <ChartCard flush title={t("dashboard.bd.link.title")} sub={t("dashboard.dept.allDocsNow")} className="h-full" bodyClassName="flex-1 flex flex-col">
                <div className="px-5 pt-3.5 pb-4 flex flex-col gap-1.5 border-b border-[#eef1f6]">
                  <div className="flex items-baseline gap-2">
                    <span className="flex-1 text-[13px] text-[#26395a]">{t("dashboard.bd.linkedToScope")}</span>
                    <span className="font-semibold tabular-nums">{fmtCount(bd.detail.linkedToScope)} / {fmtCount(bd.detail.linkedToScope + bd.detail.standalone)}</span>
                  </div>
                  <ProgressBar
                    value={bd.detail.linkedToScope} max={bd.detail.linkedToScope + bd.detail.standalone} color={CHART.blue}
                    label={`${t("dashboard.bd.linkedToScope")} ${fmtCount(bd.detail.linkedToScope)} / ${fmtCount(bd.detail.linkedToScope + bd.detail.standalone)}`}
                  />
                  <span className="text-xs text-muted-foreground">{t("dashboard.bd.standalone")} <Num>{fmtCount(bd.detail.standalone)}</Num> {docs}</span>
                </div>
                <p className="px-5 pt-3 pb-1 text-xs font-semibold text-muted-foreground">{t("dashboard.bd.recent.title")}</p>
                {bd.detail.recent.length === 0 ? <EmptyNote>{t("dashboard.bd.recent.empty")}</EmptyNote> : (
                  <ul>
                    {bd.detail.recent.slice(0, 5).map((row) => (
                      <li key={row.id} className="min-h-12 px-5 py-1.5 flex items-center gap-3">
                        <span className="flex-1 min-w-0 flex flex-col leading-snug">
                          <span className="font-mono text-[13px] font-medium">{row.docNumber}</span>
                          <span className="text-xs text-muted-foreground truncate" title={row.party}>{row.party || "—"}{row.date ? ` · ${fmtDateShort(row.date, lang)}` : ""}</span>
                        </span>
                        <SharedStatusPill status={row.status} />
                      </li>
                    ))}
                  </ul>
                )}
                <CardFooterLink label={t("dashboard.dept.openList")} onClick={() => onNavigatePage("costControl")} />
              </ChartCard>
            )}
          />
        </>
      )}
    </>
  );
}

/** สถานะเอกสารหนึ่งชนิด — ชื่อเป็นลิงก์ไปหน้ารายการ · จำนวนรวม · แถบสัดส่วน + คำอธิบายสีพร้อมตัวเลข */
function StatusRow({ label, counts, onOpen }: { label: string; counts: StatusCounts; onOpen: () => void }) {
  const { t } = useI18n();
  const total = counts.draft + counts.pending + counts.final;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <button type="button" onClick={onOpen} className="-mx-1.5 px-1.5 rounded-md text-sm font-semibold text-[#1a5fb4] hover:bg-[#e8f0fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 transition-colors">{label}</button>
        <span className="flex-1" />
        <span className="text-[13px] text-muted-foreground"><Num>{fmtCount(total)}</Num> {t("dashboard.unit.docs")}</span>
      </div>
      <SegmentBar
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
    <div className="flex items-baseline gap-2 text-[13px]">
      <span className="flex-1 text-[#26395a]">{t(DEPARTMENT_META[dept].labelKey)}</span>
      <span className="text-muted-foreground">
        {t("dashboard.ops.prOpen.atStore")} <Num>{fmtCount(stages.atStore)}</Num>
        {" · "}
        {t("dashboard.ops.prOpen.atPurchasing")} <Num>{fmtCount(stages.atPurchasing)}</Num>
      </span>
    </div>
  );
}

/** ใบส่งมอบสินค้า — เอกสารชุดเดียวที่ขาย ผลิต และโครงการใช้ร่วมกัน (บอร์ด Dashboard-Operations) */
function DeliveryOrderCard({ counts, onOpen }: { counts: DeliveryOrderCounts; onOpen: () => void }) {
  const { t } = useI18n();
  const rows: { key: string; tone: PillTone; label: string; value: number; color: string }[] = [
    { key: "final", tone: "info", label: t("dashboard.dept.status.final"), value: counts.final, color: STATUS_COLORS.final },
    { key: "pending", tone: "warn", label: t("dashboard.dept.status.pending"), value: counts.pending, color: STATUS_COLORS.pending },
    { key: "draft", tone: "neutral", label: t("dashboard.dept.status.draft"), value: counts.draft, color: STATUS_COLORS.draft },
  ];
  return (
    <ChartCard flush title={t("nav.deliveryOrder")} sub={t("dashboard.dept.deliveryOrderShared")} className="h-full" bodyClassName="flex-1 flex flex-col">
      <div className="px-5 pt-4 pb-1 flex items-baseline gap-2">
        <span className="text-[28px] leading-tight font-semibold tabular-nums">{fmtCount(counts.total)}</span>
        <span className="text-sm text-muted-foreground">{t("dashboard.dept.status.total")} · {t("dashboard.unit.docs")}</span>
      </div>
      <div className="flex-1 px-5 pt-2 pb-3 flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="flex-1"><StatusChip tone={r.tone}>{r.label}</StatusChip></span>
              <span className="font-semibold tabular-nums">{fmtCount(r.value)}</span>
            </div>
            <ProgressBar height={6} value={r.value} max={counts.total} color={r.color} label={`${r.label} ${fmtCount(r.value)} / ${fmtCount(counts.total)}`} />
          </div>
        ))}
      </div>
      <CardFooterLink label={t("dashboard.dept.openList")} onClick={onOpen} />
    </ChartCard>
  );
}

function FailedNote({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#f2caca] bg-[#fcebeb] text-sm">
      <AlertTriangle size={16} className="text-[#b93636] flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 text-foreground">{t("dashboard.dept.loadError")}</span>
      <button type="button" onClick={onRetry} className={btn.secondarySm}><RotateCw size={14} /> {t("dashboard.dept.retry")}</button>
    </div>
  );
}
