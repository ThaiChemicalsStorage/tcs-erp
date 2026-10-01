import { useEffect, useState, type ReactNode } from "react";
import { CalendarRange, Users, Wallet, ChevronDown } from "lucide-react";
import { fetchArDashboardStats, type ArDashboardStats } from "../../lib/accountingDashboard";
import { rangeForPreset, type DateRangePreset } from "../../lib/dateRanges";
import { fmtShort, fmtDateShort } from "../dashboard/format";
import { EmptyState } from "../../components/EmptyState";
import { MetricInfoTooltip } from "../../components/MetricInfoTooltip";
import { ArTrendChart, DocTypeBreakdownChart, BillingFunnelChart, AgingChart, DashCard } from "./AccountingDashboardCharts";
import { AGING_BUCKET_LABEL_KEY } from "../../lib/accountingDashboard";
import { Sparkline } from "../dashboard/tabs/DepartmentWidgets";
import { ListPageHeader } from "../../components/ui/ListPage";
import { btn, field, table } from "../../components/ui/styles";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { PAGE_CLASS } from "./accountingUi";
import { AGING_RAMP, money } from "./accountingFormat";

// แดชบอร์ดบัญชี (เพิ่ม 2026-08-18) — ภาพรวมและรายละเอียดเชิงลึกของบัญชีลูกหนี้ (AR/IV/BI/RE)
// แยกจากแดชบอร์ดหลักของบริษัท (ซึ่งเน้นภาพรวมงานขาย/ใบเสนอราคา) — ดึงข้อมูลจาก GET /api/ar-dashboard
// Accounting Dashboard — a detail view scoped to Accounts Receivable, separate from the company's
// main cross-module Dashboard. Some sections are current-state snapshots, not period-filtered —
// each is labeled honestly per docs/UI_GUIDELINES.md "Filter Honesty"; see accountingDashboard.ts.
// ดีไซน์ใหม่ 2026-09-30: เปลี่ยนหน้าตาอย่างเดียว — ตัวเลขทุกตัวความหมายเดิม (เจ้าของตัดสินใจไว้)
export function AccountingDashboardPage({ currentUserId }: { currentUserId: string }) {
  const { t } = useI18n();
  return (
    <div className={PAGE_CLASS}>
      <AccountingDashboardView heading={{ module: t("nav.group.accounting"), title: t("accountingDashboard.title"), description: t("accountingDashboard.description"), currentUserId }} />
    </div>
  );
}

/**
 * เนื้อในของแดชบอร์ดบัญชี (ตัวกรอง + ตัวเลข + กราฟ) — แยกออกมา 2026-09-14 เพื่อให้แท็บ
 * "บัญชี" บนหน้าแดชบอร์ดใช้ของชิ้นเดียวกับเมนูแดชบอร์ดบัญชี ไม่มีสองเวอร์ชันให้ตัวเลขเพี้ยนจากกัน
 * เมนูเดิมในกลุ่มบัญชียังอยู่ครบ · ตัวกรองวันที่เป็นของตัวเอง เพราะ ar-dashboard ตีความช่วงว่างเป็น "เดือนนี้"
 * `heading` = หน้าเมนูแดชบอร์ดบัญชี (หัวหน้า + ตัวกรองชิดขวา) · ไม่ส่ง = แท็บบนแดชบอร์ดหลัก (ตัวกรองแถวเดียว)
 */
export function AccountingDashboardView({ heading }: { heading?: { module: string; title: string; description: string; currentUserId: string } }) {
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

  // คำแนะนำประจำหน้า — เฉพาะเมนูแดชบอร์ดบัญชี (มี heading) · แท็บบัญชีบนแดชบอร์ดหลักไม่เล่นเอง (autoStart ปิด)
  // รอโหลดเสร็จก่อนค่อยเล่นเอง เพราะการ์ด/กราฟ/ตารางยังไม่อยู่บนจอระหว่างโหลด
  const tourSteps: TourStep[] = [
    { element: '[data-tour="accdash-filters"]', manual: "ch13-3", popover: { title: t("tour.accDash.filters.title"), description: t("tour.accDash.filters.desc"), side: "bottom" } },
    { element: '[data-tour="accdash-kpis"]', manual: "ch13-3", popover: { title: t("tour.accDash.kpis.title"), description: t("tour.accDash.kpis.desc"), side: "bottom" } },
    { element: '[data-tour="accdash-trend"]', manual: "ch13-3", popover: { title: t("tour.accDash.trend.title"), description: t("tour.accDash.trend.desc"), side: "top" } },
    { element: '[data-tour="accdash-aging"]', manual: "ch13-3", popover: { title: t("tour.accDash.aging.title"), description: t("tour.accDash.aging.desc"), side: "top" } },
    { element: '[data-tour="accdash-customers"]', manual: "ch13-3", popover: { title: t("tour.accDash.customers.title"), description: t("tour.accDash.customers.desc"), side: "top" } },
  ];
  const tour = useModuleTour("accountingDashboard", heading?.currentUserId ?? "", tourSteps, { autoStart: !!heading && !loading });

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

  const filters = (
    <div data-tour="accdash-filters" className="flex items-end gap-3 flex-wrap">
      <IconSelect
        label={t("accountingDashboard.filter.dateRangeLabel")}
        icon={<CalendarRange size={16} />}
        value={preset}
        onChange={(v) => applyPreset(v as DateRangePreset)}
        widthClass="w-[180px]"
      >
        {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </IconSelect>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("accountingDashboard.filter.fromDateLabel")} className={`${field.input} font-mono`} />
          <span className="text-sm text-muted-foreground">—</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("accountingDashboard.filter.toDateLabel")} className={`${field.input} font-mono`} />
        </div>
      )}
      <IconSelect
        label={t("accountingDashboard.filter.salespersonLabel")}
        icon={<Users size={16} />}
        value={salesperson}
        onChange={setSalesperson}
        widthClass="w-[220px]"
      >
        <option value="">{t("accountingDashboard.filter.allSalespeople")}</option>
        {availableSalespeople.map((s) => <option key={s} value={s}>{s}</option>)}
      </IconSelect>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {heading
        ? <ListPageHeader module={heading.module} title={heading.title} description={heading.description} help={<TourReplayButton variant="title" onClick={tour.start} />} actions={filters} />
        : <div className="flex justify-end">{filters}</div>}

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : loadError || !stats ? (
        <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-muted-foreground">{t("accountingDashboard.error.loadFailed")}</p>
          <button type="button" onClick={() => setRetryToken((n) => n + 1)} className={btn.secondary}>{t("accountingDashboard.error.retry")}</button>
        </div>
      ) : !stats.hasAnyData ? (
        <EmptyState icon={Wallet} title={t("accountingDashboard.empty.title")} description={t("accountingDashboard.empty.description")} />
      ) : (
        <>
          <KpiCards stats={stats} />

          {/* โครง หลัก + ข้าง 380 — ตัวเลขทุกตัวเหมือนเดิม เปลี่ยนแค่การจัดวาง */}
          <DashRow tourId="accdash-trend" main={<ArTrendChart trend={stats.trend} />} side={<DocTypeBreakdownChart data={stats.docTypeBreakdown} />} />
          <DashRow tourId="accdash-aging" main={<AgingTable invoices={stats.aging.invoices} />} side={<BillingFunnelChart data={stats.billingFunnel} />} />
          <DashRow tourId="accdash-customers" main={<TopCustomersTable customers={stats.topCustomers} />} side={<AgingChart buckets={stats.aging.buckets} />} />
        </>
      )}
    </div>
  );
}

function DashRow({ main, side, tourId }: { main: ReactNode; side: ReactNode; tourId?: string }) {
  return (
    <div data-tour={tourId} className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-stretch">
      <div className="min-w-0 flex flex-col [&>*]:flex-1">{main}</div>
      <div className="min-w-0 flex flex-col [&>*]:flex-1">{side}</div>
    </div>
  );
}

/** ตัวกรองแบบ select มีไอคอนนำหน้าในกล่อง ชื่อช่องอยู่เหนือกล่อง */
function IconSelect({ label, icon, value, onChange, widthClass, children }: {
  label: string;
  icon: ReactNode;
  value: string;
  onChange: (v: string) => void;
  widthClass: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={field.label}>{label}</span>
      <span className={`relative block ${widthClass}`}>
        <span className="absolute left-3 top-3 text-muted-foreground pointer-events-none flex">{icon}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={`${field.input.replace("px-3", "pl-[38px] pr-9")} w-full appearance-none cursor-pointer`}>
          {children}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-3 text-muted-foreground pointer-events-none" />
      </span>
    </label>
  );
}

/** การ์ดตัวเลขตามบอร์ด — ชื่อ · ปุ่ม (i) · ป้ายช่วงข้อมูลชิดขวา · ตัวเลขใหญ่ · (แถบอายุหนี้) · คำอธิบายล่าง */
function DashKpiCard({ title, help, chip, value, unit, tone, extra, caption }: {
  title: string;
  help: string;
  chip: string;
  value: string;
  unit?: string;
  tone?: "warn";
  extra?: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-xl px-5 py-[18px] flex flex-col gap-1.5 min-h-[150px] min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[13px] font-medium text-[#3d5173] truncate" title={title}>{title}</span>
        <MetricInfoTooltip label={title} text={help} />
        <span className="flex-1" />
        <span className="h-5 px-2 rounded-full bg-[#eef1f6] text-[#3d5173] text-xs font-medium inline-flex items-center whitespace-nowrap">{chip}</span>
      </div>
      <span className={`text-3xl leading-tight font-semibold tabular-nums ${tone === "warn" ? "text-[#a75d1a]" : "text-foreground"}`}>
        {value}
        {unit && <span className="text-sm font-medium text-muted-foreground"> {unit}</span>}
      </span>
      {extra}
      <span className="flex-1" />
      {caption && <div className="text-xs text-muted-foreground">{caption}</div>}
    </section>
  );
}

function KpiCards({ stats }: { stats: ArDashboardStats }) {
  const { t } = useI18n();
  const { kpis } = stats;
  const docsUnit = t("accountingDashboard.unit.docs");
  const chipPeriod = t("accountingDashboard.chip.period");
  const chipNow = t("accountingDashboard.chip.now");
  const agingSegments = stats.aging.buckets.map((b) => ({ key: b.key, label: t(AGING_BUCKET_LABEL_KEY[b.key]), value: Math.round(b.amount), color: AGING_RAMP[b.key] }));
  return (
    <div data-tour="accdash-kpis" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
      <DashKpiCard
        title={t("accountingDashboard.kpi.issuedTotal.title")} help={t("accountingDashboard.kpi.issuedTotal.help")} chip={chipPeriod}
        value={fmtShort(kpis.issuedNet)}
        extra={<div className="self-end -mt-1"><Sparkline values={stats.trend.map((p) => p.netTotal)} color="#1a5fb4" /></div>}
        caption={`${kpis.issuedCount.toLocaleString("th-TH")} ${docsUnit} · ${t("accountingDashboard.kpi.cancelled.title")} ${kpis.cancelledCount.toLocaleString("th-TH")}`}
      />
      <DashKpiCard
        title={t("accountingDashboard.kpi.vatSales.title")} help={t("accountingDashboard.kpi.vatSales.help")} chip={chipPeriod}
        value={fmtShort(kpis.vatAmount)}
        caption={t("accountingDashboard.kpi.vatSales.caption")}
      />
      <DashKpiCard
        title={t("accountingDashboard.kpi.outstanding.title")} help={t("accountingDashboard.kpi.outstanding.help")} chip={chipNow}
        value={fmtShort(kpis.outstandingNet)}
        extra={<AgingBar segments={agingSegments} />}
        caption={`${kpis.outstandingCount.toLocaleString("th-TH")} ${docsUnit}`}
      />
      <DashKpiCard
        title={t("accountingDashboard.kpi.depositNotBilled.title")} help={t("accountingDashboard.kpi.depositNotBilled.help")} chip={chipNow}
        value={kpis.depositNotBilledJobs.toLocaleString("th-TH")} unit={t("accountingDashboard.unit.jobs")}
        tone={kpis.depositNotBilledJobs > 0 ? "warn" : undefined}
        caption={t("accountingDashboard.sub.asOfNow")}
      />
    </div>
  );
}

/** แถบอายุหนี้ในการ์ด KPI — สีชุดเดียวกับกราฟอายุหนี้ด้านล่าง · ชื่อช่วงอยู่ใน title/aria-label ของแต่ละช่วง */
function AgingBar({ segments }: { segments: { key: string; label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <span className="mt-0.5 flex gap-0.5 h-2 overflow-hidden rounded-full" role="img" aria-label={segments.map((s) => `${s.label} ${fmtShort(s.value)}`).join(", ")}>
      {total === 0 ? <span className="flex-1 bg-[#eef1f6]" /> : segments.filter((s) => s.value > 0).map((s) => (
        <span key={s.key} title={`${s.label} ${fmtShort(s.value)}`} style={{ flexGrow: s.value, background: s.color }} />
      ))}
    </span>
  );
}

const OVERDUE_CHIP = {
  late: "bg-[#fcebeb] text-[#b93636]",
  mid: "bg-[#fdf3e0] text-[#8a5a00]",
  ok: "bg-[#eef1f6] text-[#3d5173]",
} as const;

function AgingTable({ invoices }: { invoices: ArDashboardStats["aging"]["invoices"] }) {
  const { t } = useI18n();
  const th = table.th.replace("first:pl-5", "first:pl-6").replace("last:pr-5", "last:pr-6");
  const thNum = th.replace("text-left", "text-right");
  const td = `${table.td.replace("first:pl-5", "first:pl-6").replace("last:pr-5", "last:pr-6")} py-2.5`;
  return (
    <DashCard title={t("accountingDashboard.agingTable.title")} sub={t("accountingDashboard.agingTable.sub")} bodyClassName="">
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("accountingDashboard.msg.noOutstanding")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className={table.head}>
                <th className={th}>{t("accountingDashboard.agingTable.col.docNo")}</th>
                <th className={th}>{t("accountingDashboard.agingTable.col.customer")}</th>
                <th className={th}>{t("accountingDashboard.agingTable.col.dueDate")}</th>
                <th className={th}>{t("accountingDashboard.agingTable.col.overdue")}</th>
                <th className={thNum}>{t("accountingDashboard.agingTable.col.outstandingAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const chip = inv.daysOverdue > 60 ? OVERDUE_CHIP.late : inv.daysOverdue > 0 ? OVERDUE_CHIP.mid : OVERDUE_CHIP.ok;
                return (
                  <tr key={inv.id} className="border-b border-[#eef1f6] last:border-b-0 hover:bg-[#f8f9fc] transition-colors">
                    <td className={`${td} whitespace-nowrap`}>
                      <span className="flex flex-col leading-snug">
                        <span className={table.code}>{inv.docNo}</span>
                        <span className="text-xs text-muted-foreground">
                          <span className="font-mono" title={t("accountingDashboard.agingTable.col.docType")}>{inv.docType}</span>
                          {" · "}
                          <span className="font-mono" title={t("accountingDashboard.agingTable.col.scopeNumber")}>{inv.scopeNumber || "—"}</span>
                        </span>
                      </span>
                    </td>
                    <td className={`${td} text-sm font-medium text-foreground max-w-[240px] truncate`} title={inv.customerName}>{inv.customerName}</td>
                    <td className={`${td} text-sm text-[#3d5173] whitespace-nowrap`}>{fmtDateShort(inv.dueDate, "th")}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-semibold ${chip}`}>
                        {inv.daysOverdue <= 0 ? t("accountingDashboard.agingTable.notYetDue") : `${inv.daysOverdue} ${t("accountingDashboard.unit.days")}`}
                      </span>
                    </td>
                    <td className={`${td} ${table.money} text-sm text-foreground whitespace-nowrap`}>{money(inv.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}

function TopCustomersTable({ customers }: { customers: ArDashboardStats["topCustomers"] }) {
  const { t } = useI18n();
  const th = table.th.replace("first:pl-5", "first:pl-6").replace("last:pr-5", "last:pr-6");
  const thNum = th.replace("text-left", "text-right");
  const td = `${table.td.replace("first:pl-5", "first:pl-6").replace("last:pr-5", "last:pr-6")} py-2.5 text-sm`;
  return (
    <DashCard title={t("accountingDashboard.topCustomers.title")} sub={t("accountingDashboard.topCustomers.sub")} bodyClassName="">
      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("accountingDashboard.msg.noDataInPeriod")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className={table.head}>
                <th className={th}>{t("accountingDashboard.topCustomers.col.customer")}</th>
                <th className={thNum}>{t("accountingDashboard.topCustomers.col.invoiceCount")}</th>
                <th className={thNum}>{t("accountingDashboard.topCustomers.col.netTotal")}</th>
                <th className={thNum}>{t("accountingDashboard.topCustomers.col.currentOutstanding")}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.customerName} className="border-b border-[#eef1f6] last:border-b-0 hover:bg-[#f8f9fc] transition-colors">
                  <td className={`${td} font-medium text-foreground max-w-[260px] truncate`} title={c.customerName}>{c.customerName}</td>
                  <td className={`${td} text-right tabular-nums text-[#3d5173] whitespace-nowrap`}>{c.count.toLocaleString("th-TH")}</td>
                  <td className={`${td} ${table.money} text-foreground whitespace-nowrap`}>{money(c.netTotal)}</td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap ${c.outstandingNet > 0 ? "text-[#a75d1a]" : "text-[#8a97ad]"}`}>
                    {c.outstandingNet > 0 ? money(c.outstandingNet) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}
