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

// แดชบอร์ดบัญชี (เพิ่ม 2026-08-18) — ภาพรวมและรายละเอียดเชิงลึกของบัญชีลูกหนี้ (AR/IV/BI/RE)
// แยกจากแดชบอร์ดหลักของบริษัท (ซึ่งเน้นภาพรวมงานขาย/ใบเสนอราคา) — ดึงข้อมูลจาก GET /api/ar-dashboard
// Accounting Dashboard — a detail view scoped to Accounts Receivable, separate from the company's
// main cross-module Dashboard. Some sections are current-state snapshots, not period-filtered —
// each is labeled honestly per docs/UI_GUIDELINES.md "Filter Honesty"; see accountingDashboard.ts.
export function AccountingDashboardPage() {
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
    { key: "thisMonth", label: "เดือนนี้" },
    { key: "lastMonth", label: "เดือนที่แล้ว" },
    { key: "thisQuarter", label: "ไตรมาสนี้" },
    { key: "thisYear", label: "ปีนี้" },
    { key: "custom", label: "กำหนดเอง" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <PageHeader title="แดชบอร์ดบัญชี" description="ภาพรวมและรายละเอียดบัญชีลูกหนี้ (ใบรับเงินมัดจำ/ใบกำกับภาษี/ใบแจ้งหนี้/ใบเสร็จรับเงิน)" />

      <div className="flex items-center gap-2.5 flex-wrap bg-card border border-border rounded-lg px-3 py-2">
        <div className="flex items-center gap-1.5 text-muted-foreground pl-1"><CalendarRange size={13} /></div>
        <select
          value={preset}
          onChange={(e) => applyPreset(e.target.value as DateRangePreset)}
          aria-label="ช่วงเวลา"
          className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
        >
          {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="วันเริ่มต้น"
              className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors font-mono" />
            <span className="text-xs text-muted-foreground">—</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="วันสิ้นสุด"
              className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors font-mono" />
          </div>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground pl-2"><Users size={13} /></div>
        <select
          value={salesperson}
          onChange={(e) => setSalesperson(e.target.value)}
          aria-label="พนักงานขาย"
          className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
        >
          <option value="">พนักงานขายทั้งหมด</option>
          {availableSalespeople.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : loadError || !stats ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-muted-foreground">โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
          <button onClick={() => setRetryToken((t) => t + 1)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">ลองใหม่</button>
        </div>
      ) : !stats.hasAnyData ? (
        <EmptyState icon={Wallet} title="ยังไม่มีข้อมูลบัญชี" description="ยังไม่มีเอกสารบัญชี (AR/IV/BI/RE) ในระบบ — ออกเอกสารได้จากหน้า 'วางบิลตามงาน'" />
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
      {sub && <p className="text-[11px] text-muted-foreground font-mono mt-1">{sub}</p>}
    </div>
  );
}

function KpiCards({ stats }: { stats: ArDashboardStats }) {
  const { kpis } = stats;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <SummaryCard
        title="ยอดออกใบกำกับภาษี" value={fmtShort(kpis.issuedNet)} sub={`${kpis.issuedCount.toLocaleString("th-TH")} ฉบับ`}
        icon={Receipt} accent="#c9a84c" help="ยอดสุทธิรวมของ AR+IV ที่ออกในช่วงเวลาที่เลือกด้านบน (ไม่รวมเอกสารที่ยกเลิก)"
      />
      <SummaryCard
        title="VAT ขาย" value={fmtShort(kpis.vatAmount)} sub="ตามช่วงเวลาที่เลือก"
        icon={Banknote} accent="#1a5fb4" help="ภาษีมูลค่าเพิ่มของใบกำกับภาษี (AR+IV) ที่ออกในช่วงเวลาที่เลือก — สำหรับกระทบยอดยื่นภาษีขาย"
      />
      <SummaryCard
        title="ยอดค้างชำระ" value={fmtShort(kpis.outstandingNet)} sub={`${kpis.outstandingCount.toLocaleString("th-TH")} ฉบับ · ข้อมูล ณ ปัจจุบัน`}
        icon={AlertTriangle} accent="#e08a3c" help="ใบกำกับภาษี (AR/IV) ที่ออกแล้วแต่ยังไม่มีใบเสร็จรับเงิน — เป็นข้อมูล ณ ปัจจุบัน ไม่ขึ้นกับตัวกรองช่วงเวลาด้านบน (ขึ้นกับพนักงานขายที่เลือก)"
      />
      <SummaryCard
        title="งานที่ยังไม่ออกบิลมัดจำ" value={kpis.depositNotBilledJobs.toLocaleString("th-TH")} sub="ข้อมูล ณ ปัจจุบัน"
        icon={Wallet} accent="#5a7299" help="Scope of Work ที่ยังไม่มีการออกใบรับเงินมัดจำ/ใบกำกับภาษี (AR) เลย — เป็นข้อมูล ณ ปัจจุบัน ไม่ขึ้นกับตัวกรองช่วงเวลาด้านบน (ขึ้นกับพนักงานขายที่เลือก)"
      />
      <SummaryCard
        title="เอกสารที่ยกเลิก" value={kpis.cancelledCount.toLocaleString("th-TH")} sub="ตามช่วงเวลาที่เลือก"
        icon={Ban} accent="#e05252" help="จำนวนเอกสารบัญชีทุกประเภทที่ถูกยกเลิกในช่วงเวลาที่เลือก"
      />
    </div>
  );
}

function AgingTable({ invoices }: { invoices: ArDashboardStats["aging"]["invoices"] }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>รายการค้างชำระ (สูงสุด 30 รายการ)</h2>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">เรียงตามจำนวนวันที่เกินกำหนดมากที่สุดก่อน — ข้อมูล ณ ปัจจุบัน</p>
      </div>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">ไม่มียอดค้างชำระ</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["เลขที่เอกสาร", "ประเภท", "เลขที่งาน", "ลูกค้า", "ครบกำหนด", "เกินกำหนด", "ยอดค้างชำระ (บาท)"].map((h) => (
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
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: `${AGING_BUCKET_COLORS[inv.bucketKey]}1a`, color: AGING_BUCKET_COLORS[inv.bucketKey] }}>
                      {inv.daysOverdue <= 0 ? "ยังไม่ครบกำหนด" : `${inv.daysOverdue} วัน`}
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
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>ลูกค้ารายใหญ่</h2>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">เรียงตามยอดใบกำกับภาษี (AR+IV) ในช่วงเวลาที่เลือก</p>
      </div>
      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">ยังไม่มีข้อมูลในช่วงนี้</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["ลูกค้า", "จำนวนใบกำกับภาษี", "ยอดสุทธิ (บาท)", "ยอดค้างชำระปัจจุบัน (บาท)"].map((h) => (
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

