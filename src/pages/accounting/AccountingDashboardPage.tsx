import { useEffect, useState } from "react";
import { CalendarRange, Users, Wallet, Receipt, AlertTriangle, Banknote, Ban } from "lucide-react";
import { fetchArDashboardStats, type ArDashboardStats } from "../../lib/accountingDashboard";
import { rangeForPreset, type DateRangePreset } from "../dashboard/dateRanges";
import { fmtShort, fmtDateShort } from "../dashboard/format";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { MetricInfoTooltip } from "../../components/MetricInfoTooltip";
import { ArTrendChart, DocTypeBreakdownChart, BillingFunnelChart, AgingChart } from "./AccountingDashboardCharts";
import { AGING_BUCKET_COLORS } from "../../lib/accountingDashboard";
import { useI18n } from "../../lib/i18n";

// แดชบอร์ดบัญชี (เพิ่ม 2026-08-18) — ภาพรวมและรายละเอียดเชิงลึกของบัญชีลูกหนี้ (AR/IV/BI/RE)
// แยกจากแดชบอร์ดหลักของบริษัท (ซึ่งเน้นภาพรวมงานขาย/ใบเสนอราคา) — ดึงข้อมูลจาก GET /api/ar-dashboard
// Accounting Dashboard — a detail view scoped to Accounts Receivable, separate from the company's
// main cross-module Dashboard. Some sections are current-state snapshots, not period-filtered —
// each is labeled honestly per docs/UI_GUIDELINES.md "Filter Honesty"; see accountingDashboard.ts.
export function AccountingDashboardPage() {
  const { t } = useI18n();
  const [preset, setPreset] = useState<DateRangePreset>("thisMonth");
  const [from, setFrom] = useState<string>(() => rangeForPreset("thisMonth")?.from ?? "");
  const [to, setTo] = useState<string>(() => rangeForPreset("thisMonth")?.to ?? "");
  const [salesperson, setSalesperson] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  // เก็บผลลัพธ์พร้อม key ของรอบที่ fetch — loading/error คำนวณจากการเทียบ key แทนการ setState
  // แบบ synchronous ใน effect (ต้องห้ามตาม react-hooks/set-state-in-effect) — pattern เดียวกับ
  // ArMonthlyReportPage.tsx
  const [result, setResult] = useState<{ key: string; stats?: ArDashboardStats; error?: boolean } | null>(null);

  // เก็บรายชื่อพนักงานขายล่าสุดที่เคยโหลดมาไว้ต่างหาก (อัปเดตพร้อม setResult ในตัว .then() ด้านล่าง —
  // ไม่ใช่ effect แยก) เพื่อไม่ให้ dropdown ตัวเลือกหายวับไปมาระหว่างกำลังโหลดรอบใหม่ (loading=true, stats=null ชั่วคราว)
  const [availableSalespeople, setAvailableSalespeople] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const key = `${from}#${to}#${salesperson}#${retryToken}`;
    fetchArDashboardStats({ from, to, salesperson: salesperson || undefined })
      .then((s) => { if (!cancelled) { setResult({ key, stats: s }); setAvailableSalespeople(s.availableSalespeople); } })
      .catch(() => { if (!cancelled) setResult({ key, error: true }); });
    return () => { cancelled = true; };
  }, [from, to, salesperson, retryToken]);

  const currentKey = `${from}#${to}#${salesperson}#${retryToken}`;
  const current = result?.key === currentKey ? result : null;
  const loading = current === null;
  const loadError = current?.error === true;
  const stats = current?.stats ?? null;

  const applyPreset = (p: DateRangePreset) => {
    setPreset(p);
    if (p === "custom") return;
    const range = rangeForPreset(p);
    if (range) { setFrom(range.from); setTo(range.to); }
  };

  const PRESETS: { key: DateRangePreset; label: string }[] = [
    { key: "thisMonth", label: t("accountingDashboard.preset.thisMonth") },
    { key: "lastMonth", label: t("accountingDashboard.preset.lastMonth") },
    { key: "thisQuarter", label: t("accountingDashboard.preset.thisQuarter") },
    { key: "thisYear", label: t("accountingDashboard.preset.thisYear") },
    { key: "custom", label: t("accountingDashboard.preset.custom") },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <PageHeader title={t("accountingDashboard.title")} description={t("accountingDashboard.description")} />

      <div className="flex items-center gap-2.5 flex-wrap bg-card border border-border rounded-lg px-3 py-2">
        <div className="flex items-center gap-1.5 text-muted-foreground pl-1"><CalendarRange size={13} /></div>
        <select
          value={preset}
          onChange={(e) => applyPreset(e.target.value as DateRangePreset)}
          aria-label={t("accountingDashboard.filter.dateRangeLabel")}
          className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
        >
          {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("accountingDashboard.filter.fromDateLabel")}
              className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors font-mono" />
            <span className="text-xs text-muted-foreground">—</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("accountingDashboard.filter.toDateLabel")}
              className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors font-mono" />
          </div>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground pl-2"><Users size={13} /></div>
        <select
          value={salesperson}
          onChange={(e) => setSalesperson(e.target.value)}
          aria-label={t("accountingDashboard.filter.salespersonLabel")}
          className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
        >
          <option value="">{t("accountingDashboard.filter.allSalespeople")}</option>
          {availableSalespeople.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : loadError || !stats ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-muted-foreground">{t("accountingDashboard.error.loadFailed")}</p>
          <button onClick={() => setRetryToken((n) => n + 1)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">{t("accountingDashboard.error.retry")}</button>
        </div>
      ) : !stats.hasAnyData ? (
        <EmptyState icon={Wallet} title={t("accountingDashboard.empty.title")} description={t("accountingDashboard.empty.description")} />
      ) : (
        <>
          <KpiCards stats={stats} />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <ArTrendChart trend={stats.trend} />
            <DocTypeBreakdownChart data={stats.docTypeBreakdown} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <BillingFunnelChart data={stats.billingFunnel} />
            <AgingChart buckets={stats.aging.buckets} />
          </div>

          <AgingTable invoices={stats.aging.invoices} />
          <TopCustomersTable customers={stats.topCustomers} />
        </>
      )}
    </div>
  );
}

function SummaryCard({ title, value, sub, icon: Icon, accent, help }: {
  title: string; value: string; sub?: string; icon: typeof Wallet; accent: string; help?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-[#c9a84c]/30 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${accent}1a` }}>
          <Icon size={16} style={{ color: accent }} />
        </div>
        {help && <MetricInfoTooltip label={title} text={help} />}
      </div>
      <p className="text-xl font-bold text-foreground font-mono">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{title}</p>
      {sub && <p className="text-xs text-muted-foreground font-mono mt-1">{sub}</p>}
    </div>
  );
}

function KpiCards({ stats }: { stats: ArDashboardStats }) {
  const { t } = useI18n();
  const { kpis } = stats;
  const docsUnit = t("accountingDashboard.unit.docs");
  const asOfNow = t("accountingDashboard.sub.asOfNow");
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <SummaryCard
        title={t("accountingDashboard.kpi.issuedTotal.title")} value={fmtShort(kpis.issuedNet)} sub={`${kpis.issuedCount.toLocaleString("th-TH")} ${docsUnit}`}
        icon={Receipt} accent="#c9a84c" help={t("accountingDashboard.kpi.issuedTotal.help")}
      />
      <SummaryCard
        title={t("accountingDashboard.kpi.vatSales.title")} value={fmtShort(kpis.vatAmount)} sub={t("accountingDashboard.sub.selectedPeriod")}
        icon={Banknote} accent="#1a5fb4" help={t("accountingDashboard.kpi.vatSales.help")}
      />
      <SummaryCard
        title={t("accountingDashboard.kpi.outstanding.title")} value={fmtShort(kpis.outstandingNet)} sub={`${kpis.outstandingCount.toLocaleString("th-TH")} ${docsUnit} · ${asOfNow}`}
        icon={AlertTriangle} accent="#e08a3c" help={t("accountingDashboard.kpi.outstanding.help")}
      />
      <SummaryCard
        title={t("accountingDashboard.kpi.depositNotBilled.title")} value={kpis.depositNotBilledJobs.toLocaleString("th-TH")} sub={asOfNow}
        icon={Wallet} accent="#5a7299" help={t("accountingDashboard.kpi.depositNotBilled.help")}
      />
      <SummaryCard
        title={t("accountingDashboard.kpi.cancelled.title")} value={kpis.cancelledCount.toLocaleString("th-TH")} sub={t("accountingDashboard.sub.selectedPeriod")}
        icon={Ban} accent="#e05252" help={t("accountingDashboard.kpi.cancelled.help")}
      />
    </div>
  );
}

function AgingTable({ invoices }: { invoices: ArDashboardStats["aging"]["invoices"] }) {
  const { t } = useI18n();
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("accountingDashboard.agingTable.title")}</h2>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{t("accountingDashboard.agingTable.sub")}</p>
      </div>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("accountingDashboard.msg.noOutstanding")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {[
                  t("accountingDashboard.agingTable.col.docNo"),
                  t("accountingDashboard.agingTable.col.docType"),
                  t("accountingDashboard.agingTable.col.scopeNumber"),
                  t("accountingDashboard.agingTable.col.customer"),
                  t("accountingDashboard.agingTable.col.dueDate"),
                  t("accountingDashboard.agingTable.col.overdue"),
                  t("accountingDashboard.agingTable.col.outstandingAmount"),
                ].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border/50">
                  <td className="px-4 py-2.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{inv.docNo}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{inv.docType}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{inv.scopeNumber || "—"}</td>
                  <td className="px-4 py-2.5 text-sm text-foreground max-w-[220px] truncate" title={inv.customerName}>{inv.customerName}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{fmtDateShort(inv.dueDate, "th")}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: `${AGING_BUCKET_COLORS[inv.bucketKey]}1a`, color: AGING_BUCKET_COLORS[inv.bucketKey] }}>
                      {inv.daysOverdue <= 0 ? t("accountingDashboard.agingTable.notYetDue") : `${inv.daysOverdue} ${t("accountingDashboard.unit.days")}`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground font-mono whitespace-nowrap">{inv.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TopCustomersTable({ customers }: { customers: ArDashboardStats["topCustomers"] }) {
  const { t } = useI18n();
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("accountingDashboard.topCustomers.title")}</h2>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{t("accountingDashboard.topCustomers.sub")}</p>
      </div>
      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("accountingDashboard.msg.noDataInPeriod")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {[
                  t("accountingDashboard.topCustomers.col.customer"),
                  t("accountingDashboard.topCustomers.col.invoiceCount"),
                  t("accountingDashboard.topCustomers.col.netTotal"),
                  t("accountingDashboard.topCustomers.col.currentOutstanding"),
                ].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.customerName} className="border-b border-border/50">
                  <td className="px-4 py-2.5 text-sm text-foreground max-w-[260px] truncate" title={c.customerName}>{c.customerName}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{c.count.toLocaleString("th-TH")}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground font-mono whitespace-nowrap">{c.netTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: c.outstandingNet > 0 ? "#a75d1a" : undefined }}>
                    {c.outstandingNet > 0 ? c.outstandingNet.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

