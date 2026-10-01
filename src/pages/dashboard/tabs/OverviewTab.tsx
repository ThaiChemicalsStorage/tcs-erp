import type { ReactNode } from "react";
import { ChevronRight, Info, RotateCw, UserRound } from "lucide-react";
import { tabOfDepartment, type DashboardTabKey, type DepartmentKey } from "../../../lib/dashboardTabs";
import type { DashboardStats } from "../../../lib/dashboard";
import type { ArAgingBucketKey, ArDashboardStats } from "../../../lib/accountingDashboard";
import type { AttentionItem, DepartmentDashboardResponse } from "../../../lib/departmentDashboard";
import { useI18n } from "../../../lib/i18n";
import { btn } from "../../../components/ui/styles";
import { fmtShort, fmtDateShort } from "../format";
import { todayIsoBangkok } from "../../../lib/dateRanges";
import { ActivityTimeline } from "../ActivityTimeline";
import { HeaderFigure } from "../ChartCard";
import { KpiSkeleton, SkeletonBar } from "../DashboardStates";
import type { DashboardData } from "../useDashboardData";
import { PENDING_KIND_LABEL_KEY } from "../../pendingApprovals/kindLabels";
import { DEPARTMENT_META } from "./tabMeta";
import {
  CardFooterLink, ChartCard, CountPill, DueBadge, EmptyNote, KpiCard, KpiGrid, MonthlyBars, Num, Pill, SplitRow, StatusChip, type Segment,
} from "./DepartmentWidgets";
import { BAR } from "./dashboardTokens";
import { daysBetweenIso, fmtAxis, fmtCount } from "./countFormat";

/**
 * แท็บภาพรวม — "Dashboard ที่ดูข้อมูลรวมได้ทุกอย่าง" ตามที่เจ้าของขอ (2026-09-14) · หน้าตาตามบอร์ด `Dashboard`
 * (ดีไซน์ใหม่ 2026-09-30): KPI 4 ใบ → รายได้รายเดือน + เอกสารรออนุมัติทุกแผนก → ต้องจัดการก่อน + สรุปแต่ละแผนก
 * → กิจกรรมล่าสุด (บอร์ดไม่มี แต่เป็นข้อมูลที่หน้านี้แสดงอยู่ จึงคงไว้ท้ายหน้า)
 *
 * ทุกชิ้นโหลด/พังแยกกัน — ขายกับบัญชีมาจาก endpoint เดิมของตัวเอง ส่วนที่เหลือจาก
 * `/api/dashboard/departments?dept=overview` · ชิ้นที่ผู้ใช้ไม่มีสิทธิ์ไม่แสดงเลย
 */

const DEPARTMENT_ORDER: DepartmentKey[] = ["purchasing", "inventory", "service", "production", "project", "bd"];

interface CardMetric { label: string; value: number | null | undefined; tone?: "alert" | "warn" }

/** แทน `{name}` ในข้อความด้วยชิ้น React (ตัวเลขเน้น) — ข้อความแปลยังมาจาก t() ทั้งประโยค */
function fill(template: string, parts: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((chunk, i) => {
    const m = /^\{(\w+)\}$/.exec(chunk);
    return m && m[1] in parts ? <span key={i}>{parts[m[1]]}</span> : chunk;
  });
}

export function OverviewTab({ visibleTabs, departments, sales, ar, onOpenTab, onOpenQuote, onOpenPendingApprovals, onRetry }: {
  visibleTabs: DashboardTabKey[];
  departments: DashboardData<DepartmentDashboardResponse>;
  sales: DashboardData<DashboardStats> | null;
  ar: DashboardData<ArDashboardStats> | null;
  onOpenTab: (key: DashboardTabKey) => void;
  onOpenQuote: (quoteId: string) => void;
  onOpenPendingApprovals: () => void;
  onRetry: () => void;
}) {
  const { t, lang } = useI18n();
  const overview = departments.data?.view === "overview" ? departments.data : null;
  const overviewLoading = !overview && !departments.error;
  const salesData = sales?.data ?? null;
  const vatSuffix = salesData ? t(salesData.filters.vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre") : "";
  const now = t("dashboard.dept.caption.asOfNow");
  const docs = t("dashboard.unit.docs");

  // ── KPI 4 ใบ: เลือกจากชิ้นที่ผู้ใช้เห็นตามลำดับความสำคัญ ──
  const kpis: { key: string; node: ReactNode | "loading" }[] = [];
  if (sales && !sales.error) {
    if (!salesData) {
      kpis.push({ key: "closedSales", node: "loading" }, { key: "activeQuotations", node: "loading" });
    } else {
      kpis.push({
        key: "closedSales",
        node: (
          <KpiCard
            label={t("dashboard.kpi.closedSales")} scope="period" value={fmtShort(salesData.kpis.closedSales)}
            sparkline={{ values: salesData.revenueTrend.monthly.map((p) => p.revenue) }}
            caption={`${vatSuffix} · ${t("dashboard.kpi.wonSparkCaption").replace("{n}", fmtCount(salesData.kpis.wonDeals))}`}
          />
        ),
      }, {
        key: "activeQuotations",
        node: (
          <KpiCard
            label={t("dashboard.kpi.activeQuotations")} scope="period" value={fmtCount(salesData.kpis.activeQuotations)} unit={docs}
            sparkline={salesData.salesActivity ? { values: salesData.salesActivity.monthly.map((p) => p.created) } : undefined}
            caption={salesData.salesActivity ? t("dashboard.kpi.sparkCreatedCaption") : undefined}
          />
        ),
      });
    }
  }
  if (ar && !ar.error) {
    if (!ar.data) kpis.push({ key: "ar", node: "loading" });
    else {
      const buckets = new Map(ar.data.aging.buckets.map((b) => [b.key, b.amount]));
      const amount = (key: ArAgingBucketKey) => buckets.get(key) ?? 0;
      const over60 = amount("d61_90") + amount("d90plus");
      const overdue = amount("d1_30") + amount("d31_60") + over60;
      // ช่วงอายุหนี้ใช้น้ำเงินไล่ระดับตามบอร์ด (ยิ่งเกินนานยิ่งเข้ม) — ชื่อและยอดของแต่ละช่วงอยู่ใน title/aria ของแถบ
      const segments: Segment[] = [
        { key: "notDue", label: t("accounting.agingBucket.notDue"), value: amount("notDue"), color: BAR.light },
        { key: "d1_30", label: t("accounting.agingBucket.d1_30"), value: amount("d1_30"), color: BAR.muted },
        { key: "d31_60", label: t("accounting.agingBucket.d31_60"), value: amount("d31_60"), color: BAR.rank },
        { key: "over60", label: t("dashboard.overview.aging.over60"), value: over60, color: BAR.latest },
      ];
      kpis.push({
        key: "ar",
        node: (
          <KpiCard
            label={t("accountingDashboard.kpi.outstanding.title")} value={fmtShort(ar.data.kpis.outstandingNet)}
            scope={t("dashboard.overview.ar.scope").replace("{n}", fmtCount(ar.data.kpis.outstandingCount))}
            segments={segments} segmentFormat={fmtShort} segmentLegend={false}
            caption={fill(t("dashboard.overview.ar.caption"), { overdue: <Num>{fmtShort(overdue)}</Num>, over60: <Num>{fmtShort(over60)}</Num> })}
          />
        ),
      });
    }
  }
  if (overviewLoading) kpis.push({ key: "stock", node: "loading" });
  if (overview) {
    const inv = overview.blocks.inventory;
    const pur = overview.blocks.purchasing;
    const prod = overview.blocks.production;
    const svc = overview.blocks.service;
    const bd = overview.blocks.bd;
    if (inv && inv.summary.stockValue !== null) {
      const low = inv.summary.lowStock;
      kpis.push({
        key: "stock",
        node: (
          <KpiCard
            label={t("dashboard.inventory.stockValue")} value={fmtShort(inv.summary.stockValue)} scope={now}
            badge={low !== null
              ? <div><StatusChip tone={low > 0 ? "warn" : "neutral"}>{t("dashboard.overview.stock.lowBadge").replace("{n}", fmtCount(low))}</StatusChip></div>
              : undefined}
          />
        ),
      });
    }
    // สำรองสำหรับคนที่ไม่เห็นขาย/บัญชี/สต๊อก — ให้แถวบนมีตัวเลขของแผนกตัวเองแทน
    if (pur?.summary.poAwaitingReceipt != null) kpis.push({ key: "po", node: <KpiCard label={t("dashboard.purchasing.poAwaitingReceipt")} value={fmtCount(pur.summary.poAwaitingReceipt)} unit={docs} scope={now} /> });
    if (prod) kpis.push({ key: "production", node: <KpiCard tone={prod.summary.dueSoon > 0 ? "warn" : undefined} label={t("dashboard.production.dueSoon")} value={fmtCount(prod.summary.dueSoon)} unit={docs} scope={now} /> });
    if (svc) kpis.push({ key: "service", node: <KpiCard tone={svc.summary.approvalPending > 0 ? "warn" : undefined} label={t("dashboard.serviceTab.approvalPending")} value={fmtCount(svc.summary.approvalPending)} unit={docs} scope={now} /> });
    if (bd) kpis.push({ key: "bd", node: <KpiCard label={t("dashboard.bd.pending")} value={fmtCount(bd.summary.pending)} unit={docs} scope={now} /> });
  }
  const topKpis = kpis.slice(0, 4);

  const pending = overview?.pendingApprovals ?? null;
  const months = salesData?.revenueTrend.monthly ?? [];
  const revenueChart = sales && !sales.error && (
    <ChartCard
      fill
      title={t("dashboard.chart.revenue.title")}
      tag={vatSuffix || undefined}
      sub={salesData ? `${t("dashboard.overview.revenue.sub")} ${fmtDateShort(salesData.filters.to || todayIsoBangkok(), lang)}` : undefined}
      actions={salesData && months.length > 0
        ? <HeaderFigure label={t("dashboard.overview.revenue.total").replace("{n}", String(months.length))} value={fmtShort(months.reduce((s, p) => s + p.revenue, 0))} />
        : undefined}
    >
      {salesData
        ? <MonthlyBars rows={months.map((p) => ({ month: p.period, revenue: p.revenue }))} series={[{ key: "revenue", name: t("dashboard.kpi.closedSales") }]} format={fmtShort} axisFormat={fmtAxis} height={240} empty={t("dashboard.noData")} />
        : <SkeletonBar className="h-[240px] w-full" />}
    </ChartCard>
  );

  return (
    <>
      <p className="flex items-start gap-2 text-[13px] text-muted-foreground -mt-2">
        <Info size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
        <span>{t("dashboard.overview.intro")}</span>
      </p>

      {topKpis.length > 0 && (
        <KpiGrid dataTour="dashboard-overview-kpis">
          {topKpis.map(({ key, node }) => (node === "loading" ? <KpiSkeleton key={key} /> : <div key={key} className="contents">{node}</div>))}
        </KpiGrid>
      )}

      <SplitRow
        main={revenueChart}
        side={pending
          ? <PendingCard rows={pending} onOpen={onOpenPendingApprovals} />
          : overviewLoading ? <div className="h-full min-h-[280px] rounded-xl bg-muted animate-pulse" /> : null}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-5 items-stretch">
        {overview?.attention && <AttentionList items={overview.attention} today={overview.today} visibleTabs={visibleTabs} onOpenTab={onOpenTab} />}
        <div data-tour="dashboard-overview-cards" className={`min-w-0 ${overview?.attention ? "" : "xl:col-span-2"}`}>
          {overviewLoading
            ? <div className="h-64 rounded-xl bg-muted animate-pulse" />
            : departments.error && !overview
              ? <ErrorCard onRetry={onRetry} />
              : overview && <DepartmentSummary overview={overview} onOpenTab={onOpenTab} onRetry={onRetry} />}
        </div>
      </div>

      {overview?.activityTimeline && (
        <ActivityTimeline entries={overview.activityTimeline} onOpenQuote={onOpenQuote} actorLabel={t("dashboard.overview.activityActor")} sub={t("dashboard.overview.activity.sub")} />
      )}
    </>
  );
}

type T = ReturnType<typeof useI18n>["t"];

/** ตัวเลขของการ์ดแผนก — null ทั้งบล็อก = ไม่มีสิทธิ์ ไม่แสดงแผนกนั้น */
function departmentMetrics(key: DepartmentKey, overview: DepartmentDashboardResponse, t: T): CardMetric[] | null {
  const warn = (v: number | null | undefined) => (v ? "warn" as const : undefined);
  const alert = (v: number | null | undefined) => (v ? "alert" as const : undefined);
  const b = overview.blocks;
  switch (key) {
    case "purchasing": {
      const s = b.purchasing?.summary;
      return s ? [
        { label: t("dashboard.purchasing.prAwaitingPo"), value: s.prAwaitingPo },
        { label: t("dashboard.purchasing.poAwaitingReceipt"), value: s.poAwaitingReceipt },
        { label: t("dashboard.purchasing.poOverdue"), value: s.poOverdue, tone: alert(s.poOverdue) },
        { label: t("dashboard.purchasing.poPending"), value: s.poPending },
      ] : null;
    }
    case "inventory": {
      const s = b.inventory?.summary;
      return s ? [
        { label: t("dashboard.inventory.mrAwaitingIssue"), value: s.mrAwaitingIssue },
        { label: t("dashboard.inventory.lowStock"), value: s.lowStock, tone: warn(s.lowStock) },
        { label: t("dashboard.inventory.openReceivingReports"), value: s.openReceivingReports },
      ] : null;
    }
    case "production": {
      const s = b.production?.summary;
      return s ? [
        { label: t("dashboard.production.dueSoon"), value: s.dueSoon, tone: warn(s.dueSoon) },
        { label: t("dashboard.production.pastDue"), value: s.pastDue, tone: alert(s.pastDue) },
        { label: t("dashboard.production.pending"), value: s.pending },
      ] : null;
    }
    case "project": {
      const s = b.project?.summary;
      return s ? [
        { label: t("dashboard.project.jobOrderDueSoon"), value: s.jobOrderDueSoon, tone: warn(s.jobOrderDueSoon) },
        { label: t("dashboard.project.jobOrderPending"), value: s.jobOrderPending },
        { label: t("dashboard.project.prOpen"), value: s.prOpen },
        { label: t("dashboard.project.mrAwaitingIssue"), value: s.mrAwaitingIssue },
      ] : null;
    }
    case "service": {
      const s = b.service?.summary;
      return s ? [
        { label: t("dashboard.serviceTab.approvalPending"), value: s.approvalPending, tone: warn(s.approvalPending) },
        { label: t("dashboard.serviceTab.draft"), value: s.draft },
        { label: t("dashboard.serviceTab.completedThisMonth"), value: s.completedThisMonth },
      ] : null;
    }
    case "bd": {
      const s = b.bd?.summary;
      return s ? [
        { label: t("dashboard.bd.pending"), value: s.pending, tone: warn(s.pending) },
        { label: t("dashboard.bd.draft"), value: s.draft },
        { label: t("dashboard.bd.final"), value: s.final },
      ] : null;
    }
  }
}

/** เอกสารรออนุมัติทุกแผนก (บอร์ด: การ์ดขาว · ตัวเลขรวมสีอำพันบนหัว · แถวต่อชนิดเอกสาร · ลิงก์ท้ายการ์ด) */
function PendingCard({ rows, onOpen }: { rows: { kind: keyof typeof PENDING_KIND_LABEL_KEY; count: number }[]; onOpen: () => void }) {
  const { t } = useI18n();
  const shown = rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const total = shown.reduce((s, r) => s + r.count, 0);
  if (rows.length === 0) return null;
  return (
    <ChartCard
      flush dataTour="dashboard-pending" title={t("dashboard.overview.pending.title")} sub={t("dashboard.overview.pending.sub")} className="h-full" bodyClassName="flex-1 flex flex-col"
      actions={<CountPill count={total} />}
    >
      {total === 0 ? (
        <EmptyNote>{t("dashboard.overview.pending.none")}</EmptyNote>
      ) : (
        <ul className="flex-1 px-2 py-1.5">
          {shown.map((r) => (
            <li key={r.kind}>
              <button
                type="button" onClick={onOpen}
                className="w-full min-h-[31px] px-3 py-1 rounded-md flex items-center gap-2.5 text-sm text-left hover:bg-[#f8f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#d89614] flex-shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0 truncate text-[#26395a]" title={t(PENDING_KIND_LABEL_KEY[r.kind])}>{t(PENDING_KIND_LABEL_KEY[r.kind])}</span>
                <span className="font-semibold tabular-nums">{fmtCount(r.count)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <CardFooterLink label={t("dashboard.overview.pending.open")} onClick={onOpen} />
    </ChartCard>
  );
}

/** สรุปแต่ละแผนก — การ์ดเดียว แบ่งคอลัมน์ต่อแผนก · กดชื่อแผนกเปิดแท็บ · ตัวเลขชิดซ้ายหน้าชื่อตัวชี้วัด */
function DepartmentSummary({ overview, onOpenTab, onRetry }: {
  overview: DepartmentDashboardResponse;
  onOpenTab: (key: DashboardTabKey) => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const blocks = DEPARTMENT_ORDER.filter((key) => key in overview.blocks);
  return (
    <ChartCard title={t("dashboard.overview.depts.title")} sub={t("dashboard.overview.depts.sub")} className="h-full" bodyClassName="px-5 pt-4 pb-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
        {blocks.map((key) => {
          const failed = overview.failed.includes(key);
          const metrics = failed ? null : departmentMetrics(key, overview, t);
          if (!failed && !metrics) return null;
          return (
            <DepartmentBlock
              key={key} dept={key} metrics={metrics} own={overview.blocks[key]?.scope === "own"}
              onOpen={() => onOpenTab(tabOfDepartment(key))} onRetry={onRetry}
            />
          );
        })}
      </div>
    </ChartCard>
  );
}

function DepartmentBlock({ dept, metrics, own, onOpen, onRetry }: {
  dept: DepartmentKey;
  /** null = บล็อกนี้คำนวณพัง */
  metrics: CardMetric[] | null;
  own: boolean;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const title = t(DEPARTMENT_META[dept].labelKey);
  const present = metrics?.filter((m) => m.value !== null && m.value !== undefined) ?? [];
  const toneClass = (tone?: "alert" | "warn") => (tone === "alert" ? "text-[#b93636]" : tone === "warn" ? "text-[#8a5a00]" : "text-foreground");
  return (
    <section aria-label={title} className="flex flex-col gap-1.5 min-w-0">
      <button
        type="button" onClick={onOpen} aria-label={`${t("dashboard.dept.openTab")} ${title}`}
        className="-mx-2 h-8 px-2 rounded-md flex items-center gap-1.5 text-left text-sm font-semibold text-foreground hover:bg-[#f4f6fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 transition-colors"
      >
        <span className="flex-1 min-w-0 truncate">{title}</span>
        {own && (
          <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground whitespace-nowrap" title={t("dashboard.dept.ownScope")}>
            <UserRound size={12} aria-hidden="true" /> {t("dashboard.dept.ownScopeShort")}
          </span>
        )}
        <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" aria-hidden="true" />
      </button>
      {metrics === null ? (
        <div className="flex flex-col items-start gap-2 pt-1 border-t border-[#eef1f6]">
          <p className="text-xs text-muted-foreground pt-1">{t("dashboard.dept.loadError")}</p>
          <button type="button" onClick={onRetry} className={btn.secondarySm}><RotateCw size={14} /> {t("dashboard.dept.retry")}</button>
        </div>
      ) : present.length === 0 ? (
        <p className="text-xs text-muted-foreground pt-1 border-t border-[#eef1f6]">{t("dashboard.dept.noPermittedMetrics")}</p>
      ) : (
        <ul className="flex flex-col">
          {present.map((m) => (
            <li key={m.label} className="flex items-baseline gap-2.5 py-[3px] border-t border-[#eef1f6]">
              <span className={`w-8 flex-shrink-0 text-right text-base font-semibold tabular-nums ${toneClass(m.tone)}`}>{fmtCount(m.value ?? 0)}</span>
              <span className="text-[13px] leading-snug text-[#3d5173] min-w-0">{m.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-start gap-2.5 h-full">
      <p className="text-sm text-muted-foreground">{t("dashboard.dept.loadError")}</p>
      <button type="button" onClick={onRetry} className={btn.secondarySm}><RotateCw size={14} /> {t("dashboard.dept.retry")}</button>
    </div>
  );
}

const ATTENTION_KIND_LABEL = {
  poOverdue: "dashboard.overview.attention.kind.poOverdue",
  productionDue: "dashboard.overview.attention.kind.productionDue",
  jobOrderDue: "dashboard.overview.attention.kind.jobOrderDue",
  serviceApproval: "dashboard.overview.attention.kind.serviceApproval",
} as const;

/** รายการ "ต้องจัดการก่อน" ข้ามแผนก — กดแถวเพื่อเข้าแท็บของแผนกนั้น */
function AttentionList({ items, today, visibleTabs, onOpenTab }: {
  items: AttentionItem[];
  today: string;
  visibleTabs: DashboardTabKey[];
  onOpenTab: (key: DashboardTabKey) => void;
}) {
  const { t, lang } = useI18n();
  return (
    <ChartCard flush title={t("dashboard.overview.attention.title")} sub={t("dashboard.overview.attention.sub")} className="h-full">
      {items.length === 0 ? <EmptyNote>{t("dashboard.overview.attention.empty")}</EmptyNote> : (
        <ul>
          {items.map((item) => {
            const tab = tabOfDepartment(item.dept);
            const waited = item.kind === "serviceApproval" && item.date ? Math.max(0, daysBetweenIso(item.date, today)) : null;
            return (
              <li key={`${item.kind}-${item.id}`} className="border-b border-[#eef1f6] last:border-0">
                <button
                  type="button" onClick={() => onOpenTab(tab)} disabled={!visibleTabs.includes(tab)}
                  className="w-full min-h-[54px] px-5 py-2 flex items-center gap-3 text-left hover:bg-[#f8f9fc] disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 transition-colors"
                >
                  <span className="min-w-0 flex-1 flex flex-col leading-snug">
                    <span className="truncate" title={item.party}>
                      <span className="font-mono text-[13px] font-medium">{item.docNumber}</span>
                      {item.party && <span className="text-sm text-[#3d5173]"> · {item.party}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {t(DEPARTMENT_META[item.dept].labelKey)} · {t(ATTENTION_KIND_LABEL[item.kind])}{item.date ? ` · ${fmtDateShort(item.date, lang)}` : ""}
                    </span>
                  </span>
                  {waited !== null
                    ? <Pill tone={waited >= 3 ? "warn" : "neutral"}>{t("dashboard.overview.attention.waitingDays").replace("{n}", String(waited))}</Pill>
                    : <DueBadge date={item.date} today={today} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}
