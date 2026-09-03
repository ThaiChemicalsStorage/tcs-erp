import { useEffect, useMemo, useState } from "react";
import { Hammer, Printer, RotateCw, Loader2 } from "lucide-react";
import type { DriveStep } from "driver.js";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { fetchDepartments, type Department } from "../../lib/departments";
import { fetchTeams, type Team } from "../../lib/teams";
import { fetchCodeEntries, type CodeEntry } from "../../lib/codeRegister";
import { fetchToolHoldings, fetchToolReport, type ToolHoldingRow, type ToolReportRow } from "../../lib/toolHoldings";
import { ToolReportPrintDocument } from "./ToolReportPrintDocument";
import { EmptyState } from "../../components/EmptyState";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { formatQuoteDateThai } from "../../lib/quotes";
import { printDate } from "../../lib/printFormat";
import { useI18n } from "../../lib/i18n";

type Tab = "holdings" | "report";

const selectCls = "h-9 text-xs text-foreground bg-secondary border border-border rounded-lg px-3 outline-none focus:border-[#c9a84c]/50 transition-colors";

/** วันแรกของเดือนนี้ตามเวลาเครื่อง — ค่าตั้งต้นของช่วงรายงาน */
function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// หน้าเครื่องมือประจำทีม (2026-09-03) — เจ้าของสั่ง "เพิ่มหน้าคุมเครื่องมือ ว่าทีมนี้มีเครื่องมืออะไรในครอบครอง"
// และหน้าย่อยรายงานว่าทีมไหนเบิกอะไรไปบ้าง พิมพ์ได้ · อ่านอย่างเดียว ทุกตัวเลขมาจากบัญชีสต๊อกที่ใบเบิกประทับทีมไว้
export function ToolControlPage({ company, currentUserId }: { company: Company; currentUserId: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("holdings");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [codeEntries, setCodeEntries] = useState<CodeEntry[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [workTypeCode, setWorkTypeCode] = useState("");
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [retryToken, setRetryToken] = useState(0);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDepartments().then((list) => { if (!cancelled) setDepartments(list); }).catch(() => {});
    fetchTeams().then((list) => { if (!cancelled) setTeams(list); }).catch(() => {});
    fetchCodeEntries().then((list) => { if (!cancelled) setCodeEntries(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ผลลัพธ์ผูกกับ key ของรอบที่ fetch — loading = ยังไม่มีผลของ key ปัจจุบัน (pattern เดียวกับ StockPage)
  const filter = useMemo(() => ({ departmentId, teamId, workTypeCode, from: tab === "report" ? from : "", to: tab === "report" ? to : "" }), [departmentId, teamId, workTypeCode, from, to, tab]);
  const resultKey = `${tab}|${filter.departmentId}|${filter.teamId}|${filter.workTypeCode}|${filter.from}|${filter.to}|${retryToken}`;
  const [result, setResult] = useState<{ key: string; holdings?: ToolHoldingRow[]; rows?: ToolReportRow[]; truncated?: boolean; error?: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const key = resultKey;
    const load = tab === "holdings"
      ? fetchToolHoldings(filter).then((holdings) => ({ key, holdings }))
      : fetchToolReport(filter).then(({ rows, truncated }) => ({ key, rows, truncated }));
    load.then((r) => { if (!cancelled) setResult(r); }).catch(() => { if (!cancelled) setResult({ key, error: true }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);
  const current = result?.key === resultKey ? result : null;
  const loading = current === null;
  const holdings = current?.holdings ?? [];
  const rows = current?.rows ?? [];

  const tourSteps: DriveStep[] = [
    { element: '[data-tour="tool-filters"]', popover: { title: t("tour.toolControl.filters.title"), description: t("tour.toolControl.filters.desc"), side: "bottom" } },
    { element: '[data-tour="tool-tabs"]', popover: { title: t("tour.toolControl.tabs.title"), description: t("tour.toolControl.tabs.desc"), side: "bottom" } },
  ];
  const tour = useModuleTour("toolControl", currentUserId, tourSteps);

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  const activeDepartments = departments.filter((d) => d.isActive);
  const teamsOfDepartment = teams.filter((tm) => tm.isActive && (!departmentId || tm.departmentId === departmentId));
  const workTypes = codeEntries.filter((c) => c.kind === "workType" && c.isActive && !c.isDeleted);

  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };
  const filterLabel = [
    departmentId ? departments.find((d) => d.id === departmentId)?.name : t("toolControl.filter.all"),
    teamId ? teams.find((tm) => tm.id === teamId)?.name : t("toolControl.filter.allTeams"),
    workTypeCode ? workTypes.find((w) => w.code === workTypeCode)?.name ?? workTypeCode : "",
  ].filter(Boolean).join(" / ");
  const rangeLabel = from || to ? `${printDate(from)} – ${printDate(to)}` : "";

  const teamsHolding = new Set(holdings.map((h) => `${h.departmentId}|${h.teamId}`)).size;
  const piecesHeld = holdings.reduce((sum, h) => sum + h.held, 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 print:p-0 print:overflow-visible">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("toolControl.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("toolControl.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPrint(true)}
            disabled={loading || (tab === "holdings" ? holdings.length === 0 : rows.length === 0)}
            className="h-9 flex items-center gap-1.5 px-3 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-50"
          >
            <Printer size={13} /> {t("toolControl.print")}
          </button>
          <TourReplayButton onClick={tour.start} />
        </div>
      </div>

      <div data-tour="tool-tabs" className="flex items-center gap-1 border-b border-border print:hidden" role="tablist">
        {(["holdings", "report"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${tab === k ? "border-[#c9a84c] text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t(k === "holdings" ? "toolControl.tab.holdings" : "toolControl.tab.report")}
          </button>
        ))}
      </div>

      <div data-tour="tool-filters" className="flex items-end gap-3 flex-wrap print:hidden">
        <label className="text-xs text-muted-foreground space-y-1">
          <span className="block">{t("toolControl.filter.department")}</span>
          <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setTeamId(""); }} className={selectCls}>
            <option value="">{t("toolControl.filter.all")}</option>
            {activeDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground space-y-1">
          <span className="block">{t("toolControl.filter.team")}</span>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={selectCls}>
            <option value="">{t("toolControl.filter.allTeams")}</option>
            {teamsOfDepartment.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground space-y-1">
          <span className="block">{t("toolControl.filter.workType")}</span>
          <select value={workTypeCode} onChange={(e) => setWorkTypeCode(e.target.value)} className={selectCls}>
            <option value="">{t("toolControl.filter.allWorkTypes")}</option>
            {workTypes.map((w) => <option key={w.id} value={w.code}>{w.code} — {w.name}</option>)}
          </select>
        </label>
        {tab === "report" && (
          <>
            <label className="text-xs text-muted-foreground space-y-1">
              <span className="block">{t("toolControl.filter.from")}</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${selectCls} font-mono`} />
            </label>
            <label className="text-xs text-muted-foreground space-y-1">
              <span className="block">{t("toolControl.filter.to")}</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${selectCls} font-mono`} />
            </label>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 print:hidden">
        {(tab === "holdings"
          ? [
              { label: t("toolControl.summary.teams"), value: String(teamsHolding) },
              { label: t("toolControl.summary.items"), value: piecesHeld.toLocaleString("th-TH") },
            ]
          : [{ label: t("toolControl.summary.rows"), value: rows.length.toLocaleString("th-TH") }]
        ).map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#5a7299]/15 to-[#5a7299]/5 flex items-center justify-center mb-3">
              <Hammer size={15} style={{ color: "#5a7299" }} />
            </div>
            <p className="text-xl font-bold text-foreground font-mono">{loading ? "…" : s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden print:hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground" role="status" aria-live="polite">
            <Loader2 size={14} className="animate-spin" /> {t("toolControl.loading")}
          </div>
        ) : current?.error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">{t("toolControl.loadError")}</p>
            <button onClick={() => setRetryToken((n) => n + 1)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <RotateCw size={12} /> {t("toolControl.retry")}
            </button>
          </div>
        ) : tab === "holdings" ? (
          holdings.length === 0 ? (
            <EmptyState icon={Hammer} title={t("toolControl.empty.holdings")} description={t("toolControl.empty.holdingsHint")} compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[t("toolControl.col.department"), t("toolControl.col.team"), t("toolControl.col.product"), t("toolControl.col.unit"), t("toolControl.col.issued"), t("toolControl.col.returned"), t("toolControl.col.held"), t("toolControl.col.lastRequisition")].map((h, i) => (
                      <th key={h} className={`px-4 py-3 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${i >= 4 && i <= 6 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={`${h.departmentId}|${h.teamId}|${h.productId}`} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">{h.departmentName || "—"}</td>
                      <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">{h.teamName || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground"><span className="font-mono text-xs text-[#c9a84c] mr-2">{h.productCode}</span>{h.productName}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{h.unit || "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono text-right text-muted-foreground">{h.issued.toLocaleString("th-TH")}</td>
                      <td className="px-4 py-3 text-xs font-mono text-right text-muted-foreground">{h.returned.toLocaleString("th-TH")}</td>
                      <td className="px-4 py-3 text-sm font-mono font-semibold text-right text-foreground">{h.held.toLocaleString("th-TH")}</td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{h.lastSourceLabel || "—"} <span className="text-muted-foreground/70">· {formatQuoteDateThai(h.lastMovementAt)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : rows.length === 0 ? (
          <EmptyState icon={Hammer} title={t("toolControl.empty.report")} description={rangeLabel} compact />
        ) : (
          <div className="overflow-x-auto">
            {current?.truncated && <p className="px-4 pt-3 text-xs text-[#a75d1a]">{t("toolControl.truncated")}</p>}
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[t("toolControl.col.date"), t("toolControl.col.requisition"), t("toolControl.col.department"), t("toolControl.col.team"), t("toolControl.col.workType"), t("toolControl.col.product"), t("toolControl.col.kind"), t("toolControl.col.qty")].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${i === 7 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{formatQuoteDateThai(r.createdAt)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-[#c9a84c] whitespace-nowrap">{r.sourceLabel || "—"}</td>
                    <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">{r.departmentName || "—"}</td>
                    <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">{r.teamName || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.workTypeName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-foreground"><span className="font-mono text-xs text-muted-foreground mr-2">{r.productCode}</span>{r.productName}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${r.qty > 0 ? "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20" : "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20"}`}>
                        {t(r.qty > 0 ? "toolControl.kind.issue" : "toolControl.kind.return")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-right text-foreground">{Math.abs(r.qty).toLocaleString("th-TH")} <span className="text-xs font-normal text-muted-foreground">{r.unit}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ใบพิมพ์อยู่ใน DOM ตลอด (Ctrl+P ได้ใบเดียวกับปุ่ม) — พิมพ์ตามแท็บและตัวกรองที่เปิดอยู่ */}
      <ToolReportPrintDocument
        mode={tab}
        holdings={holdings}
        rows={rows}
        companyHeader={companyHeader}
        printedAt={today()}
        filterLabel={filterLabel}
        rangeLabel={rangeLabel}
      />
    </div>
  );
}
