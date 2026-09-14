import type { ReactNode } from "react";
import { ArrowRight, Inbox, RotateCw, UserRound, TrendingUp, FileText, Wallet, Warehouse, Truck, CalendarClock, Hourglass, FileClock } from "lucide-react";
import { tabOfDepartment, type DashboardTabKey, type DepartmentKey } from "../../../lib/dashboardTabs";
import type { DashboardStats } from "../../../lib/dashboard";
import { AGING_BUCKET_COLORS, AGING_BUCKET_LABEL_KEY, type ArDashboardStats } from "../../../lib/accountingDashboard";
import type { AttentionItem, DepartmentDashboardResponse } from "../../../lib/departmentDashboard";
import { useI18n } from "../../../lib/i18n";
import { fmtShort, fmtDateShort } from "../format";
import { todayIsoBangkok } from "../dateRanges";
import { ActivityTimeline } from "../ActivityTimeline";
import { SkeletonBar } from "../DashboardStates";
import type { DashboardData } from "../useDashboardData";
import { PENDING_KIND_LABEL_KEY } from "../../pendingApprovals/kindLabels";
import { DEPARTMENT_META } from "./tabMeta";
import { ChartCard, DueBadge, EmptyNote, KpiCard, KpiGrid, MonthlyBars, Pill, SplitRow, type Segment } from "./DepartmentWidgets";
import { GOLD, SERIF } from "./dashboardTokens";
import { daysBetweenIso, fmtCount } from "./countFormat";

/**
 * แท็บภาพรวม — "Dashboard ที่ดูข้อมูลรวมได้ทุกอย่าง" ตามที่เจ้าของขอ (2026-09-14) ออกแบบใหม่เป็นแดชบอร์ดเต็ม
 * ตาม docs/DASHBOARD_DESIGN.md: KPI 4 ใบ → ยอดขายรายเดือน + การ์ดเด่นรออนุมัติทุกแผนก → การ์ดแผนก →
 * ต้องจัดการก่อน + กิจกรรมล่าสุด
 *
 * ทุกชิ้นโหลด/พังแยกกัน — ขายกับบัญชีมาจาก endpoint เดิมของตัวเอง ส่วนที่เหลือจาก
 * `/api/dashboard/departments?dept=overview` · ชิ้นที่ผู้ใช้ไม่มีสิทธิ์ไม่แสดงเลย
 */

const DEPARTMENT_ORDER: DepartmentKey[] = ["purchasing", "inventory", "production", "project", "service", "bd"];

interface CardMetric { label: string; value: number | null | undefined; tone?: "alert" | "warn" }

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
            icon={TrendingUp} chip={DEPARTMENT_META.accounting.accent} label={`${t("dashboard.kpi.closedSales")} ${vatSuffix}`} value={fmtShort(salesData.kpis.closedSales)}
            sparkline={{ values: salesData.revenueTrend.monthly.map((p) => p.revenue), color: DEPARTMENT_META.accounting.accent }}
            caption={t("dashboard.overview.kpi.closedSalesCaption").replace("{n}", fmtCount(salesData.kpis.wonDeals))}
          />
        ),
      }, {
        key: "activeQuotations",
        node: (
          <KpiCard
            icon={FileText} chip={DEPARTMENT_META.sales.accent} label={t("dashboard.kpi.activeQuotations")} value={fmtCount(salesData.kpis.activeQuotations)}
            sparkline={salesData.salesActivity ? { values: salesData.salesActivity.monthly.map((p) => p.created), color: DEPARTMENT_META.sales.accent } : undefined}
            caption={salesData.salesActivity ? t("dashboard.overview.kpi.activeQuotationsCaption") : t("dashboard.dept.periodTag")}
          />
        ),
      });
    }
  }
  if (ar && !ar.error) {
    if (!ar.data) kpis.push({ key: "ar", node: "loading" });
    else {
      const buckets = new Map(ar.data.aging.buckets.map((b) => [b.key, b.amount]));
      const over60 = (buckets.get("d61_90") ?? 0) + (buckets.get("d90plus") ?? 0);
      const segments: Segment[] = [
        { key: "notDue", label: t(AGING_BUCKET_LABEL_KEY.notDue), value: buckets.get("notDue") ?? 0, color: AGING_BUCKET_COLORS.notDue },
        { key: "d1_30", label: t(AGING_BUCKET_LABEL_KEY.d1_30), value: buckets.get("d1_30") ?? 0, color: AGING_BUCKET_COLORS.d1_30 },
        { key: "d31_60", label: t(AGING_BUCKET_LABEL_KEY.d31_60), value: buckets.get("d31_60") ?? 0, color: AGING_BUCKET_COLORS.d31_60 },
        { key: "over60", label: t("dashboard.overview.aging.over60"), value: over60, color: AGING_BUCKET_COLORS.d90plus },
      ];
      kpis.push({
        key: "ar",
        node: (
          <KpiCard
            icon={Wallet} chip={DEPARTMENT_META.accounting.accent} label={t("accountingDashboard.kpi.outstanding.title")} value={fmtShort(ar.data.kpis.outstandingNet)}
            caption={<AgingLegend segments={segments} count={ar.data.kpis.outstandingCount} />}
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
      kpis.push({
        key: "stock",
        node: (
          <KpiCard
            icon={Warehouse} chip={DEPARTMENT_META.inventory.accent} label={t("dashboard.inventory.stockValue")} value={fmtShort(inv.summary.stockValue)}
            caption={inv.summary.lowStock !== null
              ? <>{t("dashboard.inventory.lowStock")} <span className={`font-mono ${inv.summary.lowStock > 0 ? "text-[#a75d1a]" : "text-foreground"}`}>{fmtCount(inv.summary.lowStock)}</span></>
              : t("dashboard.dept.caption.asOfNow")}
          />
        ),
      });
    }
    // สำรองสำหรับคนที่ไม่เห็นขาย/บัญชี/สต๊อก — ให้แถวบนมีตัวเลขของแผนกตัวเองแทน
    if (pur?.summary.poAwaitingReceipt != null) kpis.push({ key: "po", node: <KpiCard icon={Truck} chip={DEPARTMENT_META.purchasing.accent} label={t("dashboard.purchasing.poAwaitingReceipt")} value={fmtCount(pur.summary.poAwaitingReceipt)} caption={t("dashboard.dept.caption.asOfNow")} /> });
    if (prod) kpis.push({ key: "production", node: <KpiCard icon={CalendarClock} chip="#e08a3c" tone={prod.summary.dueSoon > 0 ? "warn" : undefined} label={t("dashboard.production.dueSoon")} value={fmtCount(prod.summary.dueSoon)} caption={t("dashboard.dept.caption.asOfNow")} /> });
    if (svc) kpis.push({ key: "service", node: <KpiCard icon={Hourglass} chip="#e08a3c" tone={svc.summary.approvalPending > 0 ? "warn" : undefined} label={t("dashboard.serviceTab.approvalPending")} value={fmtCount(svc.summary.approvalPending)} caption={t("dashboard.dept.caption.asOfNow")} /> });
    if (bd) kpis.push({ key: "bd", node: <KpiCard icon={FileClock} chip={GOLD} label={t("dashboard.bd.pending")} value={fmtCount(bd.summary.pending)} caption={t("dashboard.dept.caption.asOfNow")} /> });
  }
  const topKpis = kpis.slice(0, 4);

  const pending = overview?.pendingApprovals ?? null;
  const revenueChart = sales && !sales.error && (
    <ChartCard
      fill
      title={`${t("dashboard.chart.revenue.title")} ${vatSuffix}`}
      sub={salesData ? `${t("dashboard.overview.revenue.sub")} ${fmtDateShort(salesData.filters.to || todayIsoBangkok(), lang)}` : undefined}
    >
      {salesData
        ? <MonthlyBars rows={salesData.revenueTrend.monthly.map((p) => ({ month: p.period, revenue: p.revenue }))} series={[{ key: "revenue", name: t("dashboard.kpi.closedSales"), color: DEPARTMENT_META.sales.accent }]} format={fmtShort} empty={t("dashboard.noData")} />
        : <SkeletonBar className="h-[220px] w-full" />}
    </ChartCard>
  );

  return (
    <>
      <p className="text-xs text-muted-foreground -mt-2">{t("dashboard.overview.caption")}</p>

      {topKpis.length > 0 && (
        <KpiGrid>
          {topKpis.map(({ key, node }) => (node === "loading" ? <KpiSkeleton key={key} /> : <div key={key} className="contents">{node}</div>))}
        </KpiGrid>
      )}

      <SplitRow
        main={revenueChart}
        side={pending
          ? <PendingHighlight rows={pending} wide={!revenueChart} onOpen={onOpenPendingApprovals} />
          : overviewLoading ? <div className="h-full min-h-[280px] rounded-xl bg-muted animate-pulse" /> : null}
      />

      <div data-tour="dashboard-overview-cards" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {overviewLoading
          ? [...Array(3)].map((_, i) => <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />)
          : departments.error && !overview
            ? <ErrorCard onRetry={onRetry} />
            : overview && DEPARTMENT_ORDER.map((key) => {
              if (!(key in overview.blocks)) return null;
              if (overview.failed.includes(key)) return <DepartmentCard key={key} dept={key} metrics={null} own={false} onOpen={() => onOpenTab(tabOfDepartment(key))} onRetry={onRetry} />;
              const metrics = departmentMetrics(key, overview, t);
              if (!metrics) return null;
              const own = overview.blocks[key]?.scope === "own";
              return <DepartmentCard key={key} dept={key} metrics={metrics} own={own} onOpen={() => onOpenTab(tabOfDepartment(key))} onRetry={onRetry} />;
            })}
      </div>

      {overview && (overview.attention || overview.activityTimeline) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          {overview.attention && <AttentionList items={overview.attention} today={overview.today} visibleTabs={visibleTabs} onOpenTab={onOpenTab} />}
          {overview.activityTimeline && <ActivityTimeline entries={overview.activityTimeline} onOpenQuote={onOpenQuote} actorLabel={t("dashboard.overview.activityActor")} />}
        </div>
      )}
    </>
  );
}

type T = ReturnType<typeof useI18n>["t"];

/** ตัวเลขของการ์ดแผนก — ตัวแรกที่ไม่เป็น null เป็นตัวหลัก · null ทั้งบล็อก = ไม่มีสิทธิ์ ไม่แสดงการ์ด */
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

function KpiSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-[18px] space-y-3" aria-hidden="true">
      <div className="flex items-center gap-2.5"><SkeletonBar className="h-[34px] w-[34px] rounded-lg" /><SkeletonBar className="h-3 w-24" /></div>
      <SkeletonBar className="h-6 w-20" />
      <SkeletonBar className="h-2 w-full" />
    </div>
  );
}

/** แถบอายุลูกหนี้ในการ์ด KPI — ใช้สีชุดเดียวกับแดชบอร์ดบัญชี · คำอธิบายสีเป็นข้อความเสมอ */
function AgingLegend({ segments, count }: { segments: Segment[]; count: number }) {
  const { t } = useI18n();
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <span className="block space-y-1.5">
      <span className="flex gap-0.5 h-2 overflow-hidden rounded" role="img" aria-label={segments.map((s) => `${s.label} ${fmtShort(s.value)}`).join(", ")}>
        {total === 0 ? <span className="flex-1 bg-muted" /> : segments.filter((s) => s.value > 0).map((s) => <span key={s.key} style={{ flexGrow: s.value, background: s.color }} />)}
      </span>
      <span className="flex flex-wrap gap-x-2.5 gap-y-0.5">
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />{s.label}
          </span>
        ))}
      </span>
      <span className="block">{t("dashboard.dept.caption.asOfNow")} · {fmtCount(count)} {t("dashboard.unit.docs")}</span>
    </span>
  );
}

/** การ์ดเด่นพื้นเข้มหนึ่งใบต่อหน้า (DASHBOARD_DESIGN.md ข้อ 4) — จำนวนเอกสารที่รอผู้ใช้อนุมัติ ทุกแผนก */
function PendingHighlight({ rows, wide, onOpen }: { rows: { kind: keyof typeof PENDING_KIND_LABEL_KEY; count: number }[]; wide: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  const shown = rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const total = shown.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...shown.map((r) => r.count));
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl p-5 h-full flex flex-col gap-4" style={{ background: "#0b1d3a", color: "#e8edf5" }} aria-label={t("dashboard.overview.pending.title")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold" style={SERIF}>{t("dashboard.overview.pending.title")}</h2>
          <p className="text-xs mt-0.5" style={{ color: "#a8bed8" }}>{t("dashboard.overview.pending.sub")}</p>
        </div>
        <p className="text-4xl font-semibold font-mono leading-none" style={{ color: GOLD }}>{fmtCount(total)}</p>
      </div>
      {total === 0 ? (
        <p className="text-sm flex-1 flex items-center justify-center py-6" style={{ color: "#a8bed8" }}>{t("dashboard.overview.pending.none")}</p>
      ) : (
        <ul className={`flex-1 grid gap-x-6 gap-y-3 content-start ${wide ? "sm:grid-cols-2 xl:grid-cols-4" : ""}`}>
          {shown.map((r) => (
            <li key={r.kind} className="space-y-1.5 min-w-0">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate" title={t(PENDING_KIND_LABEL_KEY[r.kind])}>{t(PENDING_KIND_LABEL_KEY[r.kind])}</span>
                <span className="font-mono font-semibold" style={{ color: "#ffffff" }}>{fmtCount(r.count)}</span>
              </div>
              <div className="h-1.5 rounded" style={{ background: "rgba(168,190,216,0.15)" }}>
                <div className="h-full rounded" style={{ width: `${(r.count / max) * 100}%`, background: GOLD }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={onOpen}
        className="self-start flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1d3a] transition-colors"
      >
        <Inbox size={15} /> {t("dashboard.overview.pending.open")}
      </button>
    </section>
  );
}

function DepartmentCard({ dept, metrics, own, onOpen, onRetry }: {
  dept: DepartmentKey;
  /** null = บล็อกนี้คำนวณพัง */
  metrics: CardMetric[] | null;
  own: boolean;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const meta = DEPARTMENT_META[dept];
  const Icon = meta.icon;
  const title = t(meta.labelKey);
  const present = metrics?.filter((m) => m.value !== null && m.value !== undefined) ?? [];
  const [main, ...rest] = present;
  const toneClass = (tone?: "alert" | "warn") => (tone === "alert" ? "text-[#d22626]" : tone === "warn" ? "text-[#a75d1a]" : "text-foreground");
  return (
    <section aria-label={title} className="bg-card border border-border rounded-xl p-[18px] flex flex-col gap-3 min-w-0">
      <button onClick={onOpen} className="group flex items-center gap-2.5 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50">
        <span className="w-[30px] h-[30px] rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${meta.accent}18` }}>
          <Icon size={15} style={{ color: meta.accent }} />
        </span>
        <span className="text-[15px] font-semibold text-foreground truncate" style={SERIF}>{title}</span>
        {own && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap" title={t("dashboard.dept.ownScope")}>
            <UserRound size={11} className="text-[#c9a84c]" /> {t("dashboard.dept.ownScopeShort")}
          </span>
        )}
        <ArrowRight size={14} className="ml-auto text-muted-foreground group-hover:text-[#c9a84c] transition-colors flex-shrink-0" aria-label={t("dashboard.dept.openTab")} />
      </button>

      {metrics === null ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-xs text-muted-foreground">{t("dashboard.dept.loadError")}</p>
          <button onClick={onRetry} className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <RotateCw size={12} /> {t("dashboard.dept.retry")}
          </button>
        </div>
      ) : !main ? (
        <p className="text-xs text-muted-foreground">{t("dashboard.dept.noPermittedMetrics")}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className={`text-2xl font-semibold font-mono leading-none ${toneClass(main.tone)}`}>{fmtCount(main.value ?? 0)}</span>
            <span className="text-sm text-muted-foreground truncate" title={main.label}>{main.label}</span>
          </div>
          {rest.length > 0 && (
            <dl className="grid grid-cols-2 gap-2 pt-2.5 border-t border-border">
              {rest.slice(0, 2).map((m) => (
                <div key={m.label} className="min-w-0">
                  <dd className={`text-base font-semibold font-mono ${toneClass(m.tone)}`}>{fmtCount(m.value ?? 0)}</dd>
                  <dt className="text-xs text-muted-foreground truncate" title={m.label}>{m.label}</dt>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </section>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-start gap-2">
      <p className="text-sm text-muted-foreground">{t("dashboard.dept.loadError")}</p>
      <button onClick={onRetry} className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
        <RotateCw size={12} /> {t("dashboard.dept.retry")}
      </button>
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
    <ChartCard title={t("dashboard.overview.attention.title")} sub={t("dashboard.overview.attention.sub")}>
      {items.length === 0 ? <EmptyNote>{t("dashboard.overview.attention.empty")}</EmptyNote> : (
        <ul className="-my-2">
          {items.map((item) => {
            const meta = DEPARTMENT_META[item.dept];
            const Icon = meta.icon;
            const tab = tabOfDepartment(item.dept);
            const waited = item.kind === "serviceApproval" && item.date ? Math.max(0, daysBetweenIso(item.date, today)) : null;
            return (
              <li key={`${item.kind}-${item.id}`} className="border-b border-border/50 last:border-0">
                <button
                  onClick={() => onOpenTab(tab)} disabled={!visibleTabs.includes(tab)}
                  className="w-full flex items-center gap-3 py-3 text-left rounded-lg hover:bg-muted/40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${meta.accent}18` }}>
                    <Icon size={15} style={{ color: meta.accent }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground truncate" title={item.party}>
                      <span className="font-mono">{item.docNumber}</span>{item.party ? ` · ${item.party}` : ""}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {t(meta.labelKey)} · {t(ATTENTION_KIND_LABEL[item.kind])}{item.date ? ` · ${fmtDateShort(item.date, lang)}` : ""}
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
