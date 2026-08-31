import { useState } from "react";
import { ClipboardList, Search, X, HelpCircle } from "lucide-react";
import type { DriveStep } from "driver.js";
import { EmptyState } from "../../components/EmptyState";
import { useModuleTour } from "../../components/GuidedTour";
import { scopePoNumbers, scopeQuotationNumbers, type ScopeOfWorkListItem, type ScopeOfWorkStatus } from "../../lib/scopeOfWork";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";

const FILTER_ALL = "all";

const statusStyle: Record<ScopeOfWorkStatus, string> = {
  Draft: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  PendingApproval: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
  Final: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};
const statusLabel: Record<ScopeOfWorkStatus, string> = { Draft: "Draft", PendingApproval: "รออนุมัติ", Final: "Final" };

// แสดงตารางรายการ Scope of Work พร้อมตัวกรองและช่องค้นหา
// Renders the Scope of Work list table with filters and search.
export function ScopeOfWorkList({
  scopeOfWorks,
  currentUserId,
  onOpen,
}: {
  scopeOfWorks: ScopeOfWorkListItem[];
  currentUserId: string;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="sow-summary"]', popover: { title: t("tour.sow.summary.title"), description: t("tour.sow.summary.desc"), side: "bottom" } },
    { element: '[data-tour="sow-filters"]', popover: { title: t("tour.sow.filters.title"), description: t("tour.sow.filters.desc"), side: "bottom" } },
    { element: '[data-tour="sow-nopo"]', popover: { title: t("tour.sow.nopo.title"), description: t("tour.sow.nopo.desc"), side: "bottom" } },
    { element: '[data-tour="sow-table"]', popover: { title: t("tour.sow.table.title"), description: t("tour.sow.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("scopeOfWork", currentUserId, tourSteps);

  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  const [filterJobType, setFilterJobType] = useState<string>(FILTER_ALL);
  const [filterSalesperson, setFilterSalesperson] = useState<string>(FILTER_ALL);
  const [filterNoPo, setFilterNoPo] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const items = scopeOfWorks.map((s) => ({
    ...s,
    scopeNumber: s.scopeNumber ?? "",
    customerName: s.customerName ?? "",
    quotationNumber: s.quotationNumber ?? "",
    jobTypeCode: s.jobTypeCode ?? "",
    quotationSalesperson: s.quotationSalesperson ?? "",
    customerPoNumber: s.customerPoNumber ?? "",
    status: s.status ?? "Draft",
    // เลขทุกเลขของใบนั้นต่อกันแล้ว — ใช้ทั้งแสดงในตารางและค้นหา (หนึ่ง Scope มีได้หลายใบเสนอราคา/PO)
    poNumbersText: scopePoNumbers(s).join(", "),
    quotationNumbersText: scopeQuotationNumbers(s).join(", "),
  }));

  const jobTypesInList = [...new Set(items.map((s) => s.jobTypeCode).filter((c) => c.trim()))].sort();
  const salespeopleInList = [...new Set(items.map((s) => s.quotationSalesperson).filter((n) => n.trim()))].sort();

  const noPoCount = items.filter((s) => !s.customerPoNumber.trim()).length;

  const filtered = items
    .filter((s) => filterStatus === FILTER_ALL || s.status === filterStatus)
    .filter((s) => filterJobType === FILTER_ALL || s.jobTypeCode === filterJobType)
    .filter((s) => filterSalesperson === FILTER_ALL || s.quotationSalesperson === filterSalesperson)
    .filter((s) => !filterNoPo || !s.customerPoNumber.trim())
    .filter((s) => !normalizedSearch || [s.scopeNumber, s.customerName, s.quotationNumbersText, s.poNumbersText, s.jobTypeCode].some((v) => v.toLowerCase().includes(normalizedSearch)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>Scope of Work</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("scopeOfWork.pageSubtitle")}</p>
        </div>
        <button
          onClick={tour.start}
          title={t("tour.replay")}
          aria-label={t("tour.replay")}
          className="flex items-center justify-center w-9 h-9 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all"
        >
          <HelpCircle size={15} />
        </button>
      </div>

      <div data-tour="sow-summary" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          { label: t("quotation.filterAll"), count: scopeOfWorks.length, color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: "Draft", count: scopeOfWorks.filter((s) => s.status === "Draft").length, color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: "รออนุมัติ", count: scopeOfWorks.filter((s) => s.status === "PendingApproval").length, color: "#e08a3c", bg: "from-[#e08a3c]/15 to-[#e08a3c]/5" },
          { label: "Final", count: scopeOfWorks.filter((s) => s.status === "Final").length, color: "#2aa36b", bg: "from-[#2aa36b]/15 to-[#2aa36b]/5" },
          { label: t("scopeOfWork.noPoBadge"), count: noPoCount, color: "#e08a3c", bg: "from-[#e08a3c]/15 to-[#e08a3c]/5" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:border-[#c9a84c]/30 transition-all">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.bg} flex items-center justify-center mb-3`}>
              <ClipboardList size={15} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-bold text-foreground font-mono">{s.count}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div data-tour="sow-filters" className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative h-9 w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("scopeOfWork.searchPlaceholder")}
              className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={13} />
              </button>
            )}
          </div>
          <select
            value={filterJobType}
            onChange={(e) => setFilterJobType(e.target.value)}
            className="h-9 text-xs text-foreground bg-secondary border border-border rounded-lg px-3 outline-none focus:border-[#c9a84c]/50 transition-colors"
          >
            <option value={FILTER_ALL}>{t("scopeOfWork.filterJobTypeAll")}</option>
            {jobTypesInList.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <select
            value={filterSalesperson}
            onChange={(e) => setFilterSalesperson(e.target.value)}
            className="h-9 text-xs text-foreground bg-secondary border border-border rounded-lg px-3 outline-none focus:border-[#c9a84c]/50 transition-colors"
          >
            <option value={FILTER_ALL}>{t("scopeOfWork.filterSalespersonAll")}</option>
            {salespeopleInList.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
            {[FILTER_ALL, "Draft", "PendingApproval", "Final"].map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
                {s === FILTER_ALL ? t("quotation.filterAll") : statusLabel[s as ScopeOfWorkStatus] ?? s}
              </button>
            ))}
          </div>
          <button
            data-tour="sow-nopo"
            onClick={() => setFilterNoPo((v) => !v)}
            className={`h-9 px-3 text-xs rounded-xl font-medium border transition-all ${filterNoPo ? "bg-[#e08a3c] text-white border-[#e08a3c]" : "bg-secondary text-muted-foreground border-border hover:text-foreground hover:border-[#e08a3c]/40"}`}
          >
            {t("scopeOfWork.noPoFilter")} {noPoCount > 0 && `(${noPoCount})`}
          </button>
        </div>
      </div>

      <div data-tour="sow-table" className="bg-card border border-border rounded-xl overflow-hidden">
        {scopeOfWorks.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t("scopeOfWork.empty.title")}
            description={t("scopeOfWork.empty.description")}
            compact
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <ClipboardList size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("scopeOfWork.noFilterResults")}</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {[
                t("scopeOfWork.col.scopeNumber"),
                t("scopeOfWork.col.customer"),
                t("scopeOfWork.col.salesperson"),
                t("scopeOfWork.col.jobType"),
                t("scopeOfWork.col.quotation"),
                t("scopeOfWork.col.po"),
                t("scopeOfWork.col.deliveryDate"),
                t("scopeOfWork.col.status"),
                t("scopeOfWork.col.updatedAt"),
              ].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                tabIndex={0}
                role="button"
                aria-label={`${t("scopeOfWork.openRow")} ${s.scopeNumber}`}
                onClick={() => onOpen(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(s.id);
                  }
                }}
                className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
              >
                <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{s.scopeNumber}</td>
                <td className="px-4 py-3.5 text-sm text-foreground font-medium max-w-[220px] truncate" title={s.customerName}>{s.customerName}</td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{s.quotationSalesperson || "—"}</td>
                <td className="px-4 py-3.5 text-xs">
                  {s.jobTypeCode ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono text-[10px]">
                      {s.jobTypeCode}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{s.quotationNumbersText}</td>
                <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                  {/* ตัวนับ/ตัวกรอง "ยังไม่มี PO" ยังตัดสินจากเลขหลักเหมือนเดิม — หน้าจอแก้ไขเขียน
                      เลขแรกลงช่องนั้นเสมอ ใบที่มีเลขอยู่จริงจึงไม่มีทางขึ้นแบดจ์นี้ */}
                  {s.poNumbersText ? (
                    <span className="font-mono text-muted-foreground">{s.poNumbersText}</span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/25">{t("scopeOfWork.noPoBadge")}</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(s.deliveryDate)}</td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[s.status]}`}>
                    {statusLabel[s.status] ?? s.status}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(s.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        )}
      </div>
    </div>
  );
}
