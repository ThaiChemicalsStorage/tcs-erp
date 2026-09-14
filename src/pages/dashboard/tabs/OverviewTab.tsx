import { ArrowRight, Inbox, RotateCw, UserRound } from "lucide-react";
import type { DashboardTabKey, DepartmentKey } from "../../../lib/dashboardTabs";
import type { DashboardStats } from "../../../lib/dashboard";
import type { ArDashboardStats } from "../../../lib/accountingDashboard";
import type { ApRegisterSummary } from "../../../lib/apEntries";
import type { BlockScope, DepartmentDashboardResponse } from "../../../lib/departmentDashboard";
import { useI18n } from "../../../lib/i18n";
import { fmtShort } from "../format";
import { ChartCard } from "../ChartCard";
import { ActivityTimeline } from "../ActivityTimeline";
import { SkeletonBar } from "../DashboardStates";
import type { DashboardData } from "../useDashboardData";
import { PENDING_KIND_LABEL_KEY } from "../../pendingApprovals/kindLabels";
import { DASHBOARD_TAB_META } from "./tabMeta";
import { fmtCount } from "./countFormat";

/**
 * แท็บภาพรวม — "Dashboard ที่ดูข้อมูลรวมได้ทุกอย่าง" ตามที่เจ้าของขอ (2026-09-14)
 *
 * การ์ดหนึ่งใบต่อหนึ่งแผนกที่ผู้ใช้มีสิทธิ์ ใบละ 2–4 ตัวเลขที่บอกว่า "ตอนนี้แผนกนี้มีอะไรค้าง" แล้วกดเข้าแท็บ
 * ของแผนกนั้นได้ · ใต้การ์ดคือจำนวนเอกสารรออนุมัติทุกแผนก และกิจกรรมล่าสุดของทั้งระบบ
 * การ์ดแต่ละใบโหลด/พังแยกกัน — ขายกับบัญชีมาจาก endpoint เดิมของตัวเอง ส่วนที่เหลือจาก
 * `/api/dashboard/departments?dept=overview`
 */

interface Metric {
  label: string;
  value: string;
  /** ตัวเลขนี้ขึ้นกับช่วงวันที่ — ติดป้ายให้เห็น ที่เหลือคือ ณ ปัจจุบัน */
  period?: boolean;
  tone?: "alert" | "warn";
}

type CardState =
  | { status: "ready"; metrics: Metric[]; scope: BlockScope }
  | { status: "loading" }
  | { status: "error" };

/** ตัวเลขที่ผู้ใช้ไม่มีสิทธิ์เห็นมาเป็น null — ตัดทิ้ง ไม่แสดงเป็นศูนย์ */
function count(value: number | null | undefined, label: string, extra: Omit<Partial<Metric>, "tone"> & { attention?: "alert" | "warn" } = {}): Metric | null {
  if (value === null || value === undefined) return null;
  const { attention, ...rest } = extra;
  return { label, value: fmtCount(value), tone: attention && value > 0 ? attention : undefined, ...rest };
}

function present(metrics: (Metric | null)[]): Metric[] {
  return metrics.filter((m): m is Metric => m !== null);
}

export function OverviewTab({
  visibleTabs, departments, sales, ar, ap, onOpenTab, onOpenQuote, onOpenPendingApprovals, onRetry,
}: {
  visibleTabs: DashboardTabKey[];
  departments: DashboardData<DepartmentDashboardResponse>;
  sales: DashboardData<DashboardStats> | null;
  ar: DashboardData<ArDashboardStats> | null;
  ap: DashboardData<ApRegisterSummary> | null;
  onOpenTab: (key: DashboardTabKey) => void;
  onOpenQuote: (quoteId: string) => void;
  onOpenPendingApprovals: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const overview = departments.data?.view === "overview" ? departments.data : null;

  const departmentCard = (key: DepartmentKey): CardState => {
    if (!overview) return departments.error ? { status: "error" } : { status: "loading" };
    if (overview.failed.includes(key)) return { status: "error" };
    const scopeOf = (block: { scope: BlockScope } | null | undefined) => block?.scope ?? "all";
    switch (key) {
      case "purchasing": {
        const b = overview.blocks.purchasing;
        if (!b) return { status: "error" };
        return { status: "ready", scope: scopeOf(b), metrics: present([
          count(b.summary.prAwaitingPo, t("dashboard.purchasing.prAwaitingPo")),
          count(b.summary.poPending, t("dashboard.purchasing.poPending")),
          count(b.summary.poAwaitingReceipt, t("dashboard.purchasing.poAwaitingReceipt")),
          count(b.summary.poOverdue, t("dashboard.purchasing.poOverdue"), { attention: "alert" }),
        ]) };
      }
      case "inventory": {
        const b = overview.blocks.inventory;
        if (!b) return { status: "error" };
        return { status: "ready", scope: scopeOf(b), metrics: present([
          b.summary.stockValue === null ? null : { label: t("dashboard.inventory.stockValue"), value: fmtShort(b.summary.stockValue) },
          count(b.summary.lowStock, t("dashboard.inventory.lowStock"), { attention: "warn" }),
          count(b.summary.mrAwaitingIssue, t("dashboard.inventory.mrAwaitingIssue")),
          count(b.summary.openReceivingReports, t("dashboard.inventory.openReceivingReports")),
        ]) };
      }
      case "production": {
        const b = overview.blocks.production;
        if (!b) return { status: "error" };
        return { status: "ready", scope: scopeOf(b), metrics: present([
          count(b.summary.pending, t("dashboard.production.pending")),
          count(b.summary.dueSoon, t("dashboard.production.dueSoon"), { attention: "warn" }),
          count(b.summary.pastDue, t("dashboard.production.pastDue"), { attention: "alert" }),
          count(b.summary.mrAwaitingIssue, t("dashboard.production.mrAwaitingIssue")),
        ]) };
      }
      case "project": {
        const b = overview.blocks.project;
        if (!b) return { status: "error" };
        return { status: "ready", scope: scopeOf(b), metrics: present([
          count(b.summary.jobOrderPending, t("dashboard.project.jobOrderPending")),
          count(b.summary.jobOrderDueSoon, t("dashboard.project.jobOrderDueSoon"), { attention: "warn" }),
          count(b.summary.mrAwaitingIssue, t("dashboard.project.mrAwaitingIssue")),
          count(b.summary.prOpen, t("dashboard.project.prOpen")),
        ]) };
      }
      case "bd": {
        const b = overview.blocks.bd;
        if (!b) return { status: "error" };
        return { status: "ready", scope: scopeOf(b), metrics: present([
          count(b.summary.pending, t("dashboard.bd.pending")),
          count(b.summary.draft, t("dashboard.bd.draft")),
          count(b.summary.final, t("dashboard.bd.final")),
          count(b.summary.createdInPeriod, t("dashboard.bd.createdInPeriod"), { period: true }),
        ]) };
      }
      case "service": {
        const b = overview.blocks.service;
        if (!b) return { status: "error" };
        return { status: "ready", scope: scopeOf(b), metrics: present([
          count(b.summary.draft, t("dashboard.serviceTab.draft")),
          count(b.summary.completedThisMonth, t("dashboard.serviceTab.completedThisMonth")),
          count(b.summary.approvalPending, t("dashboard.serviceTab.approvalPending"), { attention: "warn" }),
        ]) };
      }
    }
  };

  const salesCard = (): CardState => {
    if (!sales) return { status: "error" };
    if (!sales.data) return sales.error ? { status: "error" } : { status: "loading" };
    const { kpis, filters } = sales.data;
    const vatSuffix = t(filters.vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
    return { status: "ready", scope: sales.data.ownDataOnly ? "own" : "all", metrics: [
      { label: t("dashboard.overview.sales.totalQuotations"), value: fmtCount(kpis.totalQuotations), period: true },
      { label: `${t("dashboard.overview.sales.closedSales")} ${vatSuffix}`, value: fmtShort(kpis.closedSales), period: true },
      { label: `${t("dashboard.overview.sales.expectedSales")} ${vatSuffix}`, value: fmtShort(kpis.expectedSales), period: true },
    ] };
  };

  const accountingCard = (): CardState => {
    const waiting = (d: DashboardData<unknown> | null) => !!d && !d.data && !d.error;
    if (waiting(ar) || waiting(ap)) return { status: "loading" };
    if ((!ar || !ar.data) && (!ap || !ap.data)) return { status: "error" };
    return { status: "ready", scope: "all", metrics: present([
      // ป้ายสองตัวยืมจากแดชบอร์ดบัญชี ให้คำเดียวกันทั้งสองที่
      ar?.data ? { label: t("accountingDashboard.kpi.outstanding.title"), value: fmtShort(ar.data.kpis.outstandingNet) } : null,
      ar?.data ? count(ar.data.kpis.outstandingCount, t("dashboard.overview.accounting.outstandingDocs")) : null,
      ar?.data ? count(ar.data.kpis.depositNotBilledJobs, t("accountingDashboard.kpi.depositNotBilled.title"), { attention: "warn" }) : null,
      ap?.data ? { label: t("dashboard.overview.accounting.apUnpaid"), value: fmtShort(ap.data.unpaidTotal) } : null,
    ]) };
  };

  const cards = visibleTabs.filter((k) => k !== "overview").map((key) => ({
    key,
    state: key === "sales" ? salesCard() : key === "accounting" ? accountingCard() : departmentCard(key as DepartmentKey),
  }));

  const pending = overview?.pendingApprovals ?? null;
  const pendingTotal = pending?.reduce((sum, row) => sum + row.count, 0) ?? 0;

  return (
    <>
      <p className="text-xs text-muted-foreground -mt-2">{t("dashboard.overview.caption")}</p>

      <div data-tour="dashboard-overview-cards" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(({ key, state }) => (
          <DepartmentSummaryCard key={key} tabKey={key} state={state} onOpen={() => onOpenTab(key)} onRetry={onRetry} />
        ))}
      </div>

      {pending && pending.length > 0 && (
        <ChartCard
          title={t("dashboard.overview.pending.title")}
          sub={t("dashboard.overview.pending.sub")}
          actions={
            <button onClick={onOpenPendingApprovals} className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all whitespace-nowrap">
              <Inbox size={13} /> {t("dashboard.overview.pending.open")}
            </button>
          }
        >
          {pendingTotal === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("dashboard.overview.pending.none")}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {pending.filter((row) => row.count > 0).map((row) => (
                <div key={row.kind} className="border border-border rounded-lg p-3 min-w-0">
                  <p className="text-lg font-bold font-mono text-foreground leading-none">{fmtCount(row.count)}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate" title={t(PENDING_KIND_LABEL_KEY[row.kind])}>{t(PENDING_KIND_LABEL_KEY[row.kind])}</p>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      )}

      {overview?.activityTimeline && (
        <ActivityTimeline entries={overview.activityTimeline} onOpenQuote={onOpenQuote} actorLabel={t("dashboard.overview.activityActor")} />
      )}
    </>
  );
}

function DepartmentSummaryCard({ tabKey, state, onOpen, onRetry }: {
  tabKey: DashboardTabKey;
  state: CardState;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const meta = DASHBOARD_TAB_META[tabKey];
  const Icon = meta.icon;
  const title = t(meta.labelKey);
  return (
    <section aria-label={title} className="bg-card border border-border rounded-xl p-5 flex flex-col min-w-0">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${meta.accent}18` }}>
          <Icon size={16} style={{ color: meta.accent }} />
        </div>
        <h2 className="text-base font-semibold text-foreground truncate" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</h2>
        {state.status === "ready" && state.scope === "own" && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap" title={t("dashboard.dept.ownScope")}>
            <UserRound size={11} className="text-[#c9a84c]" /> {t("dashboard.dept.ownScopeShort")}
          </span>
        )}
      </div>

      <div className="flex-1">
        {state.status === "loading" ? (
          <div className="space-y-3" aria-hidden="true">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <SkeletonBar className="h-3 w-28" />
                <SkeletonBar className="h-5 w-12" />
              </div>
            ))}
          </div>
        ) : state.status === "error" ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-xs text-muted-foreground">{t("dashboard.dept.loadError")}</p>
            <button onClick={onRetry} className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <RotateCw size={12} /> {t("dashboard.dept.retry")}
            </button>
          </div>
        ) : state.metrics.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("dashboard.dept.noPermittedMetrics")}</p>
        ) : (
          <dl className="space-y-2.5">
            {state.metrics.map((m) => (
              <div key={m.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-muted-foreground min-w-0">
                  {m.label}
                  {m.period && <span className="text-muted-foreground/80"> · {t("dashboard.dept.periodTag")}</span>}
                </dt>
                <dd className={`text-lg font-mono font-semibold whitespace-nowrap ${m.tone === "alert" ? "text-[#d22626]" : m.tone === "warn" ? "text-[#a75d1a]" : "text-foreground"}`}>{m.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <button
        onClick={onOpen}
        className="group mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {t("dashboard.dept.openTab")}
        <ArrowRight size={13} className="group-hover:text-[#c9a84c] transition-colors" />
      </button>
    </section>
  );
}
