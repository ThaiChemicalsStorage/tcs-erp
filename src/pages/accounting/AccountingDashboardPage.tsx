import { useEffect, useState } from "react";
import { CalendarRange, Users, Wallet, Receipt, AlertTriangle, Banknote } from "lucide-react";
import { fetchArDashboardStats, type ArDashboardStats } from "../../lib/accountingDashboard";
import { rangeForPreset, type DateRangePreset } from "../dashboard/dateRanges";
import { fmtShort, fmtDateShort } from "../dashboard/format";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { ArTrendChart, DocTypeBreakdownChart, BillingFunnelChart, AgingChart } from "./AccountingDashboardCharts";
import { AGING_BUCKET_COLORS, AGING_BUCKET_LABEL_KEY } from "../../lib/accountingDashboard";
import { KpiCard, KpiGrid, SplitRow } from "../dashboard/tabs/DepartmentWidgets";
import { useI18n } from "../../lib/i18n";

// แดชบอร์ดบัญชี (เพิ่ม 2026-08-18) — ภาพรวมและรายละเอียดเชิงลึกของบัญชีลูกหนี้ (AR/IV/BI/RE)
// แยกจากแดชบอร์ดหลักของบริษัท (ซึ่งเน้นภาพรวมงานขาย/ใบเสนอราคา) — ดึงข้อมูลจาก GET /api/ar-dashboard
// Accounting Dashboard — a detail view scoped to Accounts Receivable, separate from the company's
// main cross-module Dashboard. Some sections are current-state snapshots, not period-filtered —
// each is labeled honestly per docs/UI_GUIDELINES.md "Filter Honesty"; see accountingDashboard.ts.
export function AccountingDashboardPage() {
  const { t } = useI18n();
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <PageHeader title={t("accountingDashboard.title")} description={t("accountingDashboard.description")} />
      <AccountingDashboardView />
    </div>
  );
}

/**
 * เนื้อในของแดชบอร์ดบัญชี (ตัวกรอง + ตัวเลข + กราฟ) ไม่มีหัวหน้า — แยกออกมา 2026-09-14 เพื่อให้แท็บ
 * "บัญชี" บนหน้าแดชบอร์ดใช้ของชิ้นเดียวกับเมนูแดชบอร์ดบัญชี ไม่มีสองเวอร์ชันให้ตัวเลขเพี้ยนจากกัน
 * เมนูเดิมในกลุ่มบัญชียังอยู่ครบ · ตัวกรองวันที่เป็นของตัวเอง เพราะ ar-dashboard ตีความช่วงว่างเป็น "เดือนนี้"
 */
export function AccountingDashboardView() {
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
    <div className="space-y-6">
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

          {/* โครง 2 ต่อ 1 ตาม docs/DASHBOARD_DESIGN.md ข้อ 3 — ตัวเลขทุกตัวเหมือนเดิม เปลี่ยนแค่การจัดวาง */}
          <SplitRow main={<ArTrendChart trend={stats.trend} />} side={<DocTypeBreakdownChart data={stats.docTypeBreakdown} />} />
          <SplitRow main={<AgingTable invoices={stats.aging.invoices} />} side={<BillingFunnelChart data={stats.billingFunnel} />} />
          <SplitRow main={<TopCustomersTable customers={stats.topCustomers} />} side={<AgingChart buckets={stats.aging.buckets} />} />
        </>
      )}
    </div>
  );
}

function KpiCards({ stats }: { stats: ArDashboardStats }) {
  const { t } = useI18n();
  const { kpis } = stats;
  const docsUnit = t("accountingDashboard.unit.docs");
  const asOfNow = t("accountingDashboard.sub.asOfNow");
  const accent = "#157347";
  const agingSegments = stats.aging.buckets.map((b) => ({ key: b.key, label: t(AGING_BUCKET_LABEL_KEY[b.key]), value: Math.round(b.amount), color: AGING_BUCKET_COLORS[b.key] }));
  return (
    <KpiGrid>
      <KpiCard
        icon={Receipt} chip={accent} label={t("accountingDashboard.kpi.issuedTotal.title")} value={fmtShort(kpis.issuedNet)} help={t("accountingDashboard.kpi.issuedTotal.help")}
        sparkline={{ values: stats.trend.map((p) => p.netTotal), color: accent }}
        caption={`${kpis.issuedCount.toLocaleString("th-TH")} ${docsUnit} · ${t("accountingDashboard.kpi.cancelled.title")} ${kpis.cancelledCount.toLocaleString("th-TH")}`}
      />
      <KpiCard icon={Banknote} chip={accent} label={t("accountingDashboard.kpi.vatSales.title")} value={fmtShort(kpis.vatAmount)} help={t("accountingDashboard.kpi.vatSales.help")} caption={t("accountingDashboard.sub.selectedPeriod")} />
      <KpiCard
        icon={AlertTriangle} chip="#e08a3c" label={t("accountingDashboard.kpi.outstanding.title")} value={fmtShort(kpis.outstandingNet)} help={t("accountingDashboard.kpi.outstanding.help")}
        caption={<><AgingBar segments={agingSegments} /><span className="block mt-1.5">{`${kpis.outstandingCount.toLocaleString("th-TH")} ${docsUnit} · ${asOfNow}`}</span></>}
      />
      <KpiCard
        icon={Wallet} chip="#e08a3c" tone={kpis.depositNotBilledJobs > 0 ? "warn" : undefined}
        label={t("accountingDashboard.kpi.depositNotBilled.title")} value={kpis.depositNotBilledJobs.toLocaleString("th-TH")} help={t("accountingDashboard.kpi.depositNotBilled.help")} caption={asOfNow}
      />
    </KpiGrid>
  );
}

/** แถบอายุหนี้ในการ์ด KPI — สีชุดเดียวกับกราฟอายุหนี้ด้านล่าง คำอธิบายสีเป็นข้อความเสมอ (มูลค่าอยู่ในกราฟ) */
function AgingBar({ segments }: { segments: { key: string; label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <span className="block space-y-1.5">
      <span className="flex gap-0.5 h-2 overflow-hidden rounded" role="img" aria-label={segments.map((s) => `${s.label} ${fmtShort(s.value)}`).join(", ")}>
        {total === 0 ? <span className="flex-1 bg-muted" /> : segments.filter((s) => s.value > 0).map((s) => <span key={s.key} style={{ flexGrow: s.value, background: s.color }} />)}
      </span>
      <span className="flex flex-wrap gap-x-2.5 gap-y-0.5">
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
        ))}
      </span>
    </span>
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

