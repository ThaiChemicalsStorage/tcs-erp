import { useState } from "react";
import { Plus, FileText, Target, X } from "lucide-react";
import { type Quote, type QuoteStatus, type QuoteInterest, statusStyle, statusIcon, statusLabelKey } from "../../lib/quotes";
import type { JobType } from "../../lib/jobTypes";
import type { QuotationListFilter } from "../dashboard/DashboardPage";
import { initials } from "../../lib/users";
import { InterestButtons } from "./InterestButtons";
import { useI18n } from "../../lib/i18n";

const AVATAR_COLORS = ["#c9a84c", "#1a5fb4", "#2aa36b", "#7c4dbb", "#e05252"];
const FILTER_ALL = "all";

/** Deterministic initials-avatar color for any salesperson name — works for every real name, not just a fixed roster. */
function avatarColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const statuses: QuoteStatus[] = [
  "ร่าง",
  "รออนุมัติ",
  "อนุมัติแล้ว",
  "ส่งให้ลูกค้าแล้ว",
  "ลูกค้ายอมรับ",
  "ปิดการขายสำเร็จ",
  "ลูกค้าปฏิเสธ",
  "เสียโอกาส",
  "ยกเลิก",
];

export function QuoteList({
  quotes,
  jobTypes,
  initialFilter,
  onOpen,
  onCreateNew,
  onInterestChange,
}: {
  quotes: Quote[];
  jobTypes: JobType[];
  /** Seeds the filters below on mount (a Dashboard pipeline-stage/follow-up click-through) — not re-applied on prop changes since QuoteList remounts fresh each visit, see QuotationPage.tsx. */
  initialFilter: QuotationListFilter | null;
  onOpen: (id: string) => void;
  onCreateNew: () => void;
  onInterestChange: (id: string, v: QuoteInterest) => void;
}) {
  const { t } = useI18n();
  const [filterStatus, setFilterStatus] = useState<string>(initialFilter?.status ?? FILTER_ALL);
  const [filterJobType, setFilterJobType] = useState<string>(FILTER_ALL);
  const [clientFilter, setClientFilter] = useState<string>(initialFilter?.client ?? "");
  const filtered = quotes
    .filter((q) => filterStatus === FILTER_ALL || q.status === filterStatus)
    .filter((q) => filterJobType === FILTER_ALL || q.jobTypeCode === filterJobType)
    .filter((q) => !clientFilter || q.client === clientFilter);

  const columns = [
    t("quotation.col.id"), t("quotation.col.client"), t("quotation.col.jobType"), t("quotation.col.salesperson"),
    t("quotation.col.date"), t("quotation.col.amount"), t("quotation.col.status"), t("quotation.col.interest"),
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>{t("quotation.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("quotation.pageSubtitle")}</p>
        </div>
        <button onClick={onCreateNew} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
          <Plus size={15} /> {t("quotation.createNew")}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: t("quotation.filterAll"), count: quotes.length, color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: t("quotation.status.pendingApproval"), count: quotes.filter((q) => q.status === "รออนุมัติ").length, color: "#c9a84c", bg: "from-[#c9a84c]/15 to-[#c9a84c]/5" },
          { label: t("quotation.status.approved"), count: quotes.filter((q) => q.status === "อนุมัติแล้ว").length, color: "#2aa36b", bg: "from-[#2aa36b]/15 to-[#2aa36b]/5" },
          { label: t("quotation.interest.interested"), count: quotes.filter((q) => q.interest === "น่าสนใจ").length, color: "#c9a84c", bg: "from-[#c9a84c]/15 to-[#c9a84c]/5" },
          { label: t("quotation.field.potentialOpportunity"), count: quotes.filter((q) => q.isPotentialOpportunity).length, color: "#1a5fb4", bg: "from-[#1a5fb4]/15 to-[#1a5fb4]/5", icon: Target },
        ].map((s) => {
          const Icon = s.icon ?? FileText;
          return (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:border-[#c9a84c]/30 transition-all">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.bg} flex items-center justify-center mb-3`}>
                <Icon size={15} style={{ color: s.color }} />
              </div>
              <p className="text-xl font-bold text-foreground font-mono">{s.count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 w-fit flex-wrap">
          <button onClick={() => setFilterStatus(FILTER_ALL)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === FILTER_ALL ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
            {t("quotation.filterAll")}
          </button>
          {statuses.map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {t(statusLabelKey[s])}
            </button>
          ))}
        </div>
        <select
          value={filterJobType}
          onChange={(e) => setFilterJobType(e.target.value)}
          className="text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors"
        >
          <option value={FILTER_ALL}>{t("quotation.field.jobType")}: {t("quotation.filterAll")}</option>
          {jobTypes.map((jt) => (
            <option key={jt.id} value={jt.code}>{jt.code} — {jt.name}</option>
          ))}
        </select>
        {clientFilter && (
          <button onClick={() => setClientFilter("")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#1a5fb4]/10 text-[#1a5fb4] border border-[#1a5fb4]/20 hover:bg-[#1a5fb4]/15 transition-colors">
            {t("quotation.col.client")}: {clientFilter} <X size={12} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <FileText size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">{t("empty.quotations.title")}</p>
            <p className="text-xs text-muted-foreground max-w-xs text-center">{t("empty.quotations.sub")}</p>
            <button onClick={onCreateNew} className="mt-1 flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              <Plus size={15} /> {t("empty.quotations.action")}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <FileText size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("quotation.noFilterResults")}</p>
          </div>
        ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((q) => (
              <tr key={q.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold cursor-pointer" onClick={() => onOpen(q.id)}>
                  {q.id}
                </td>
                <td className="px-4 py-3.5 text-sm text-foreground font-medium cursor-pointer" onClick={() => onOpen(q.id)}>
                  {q.client}
                </td>
                <td className="px-4 py-3.5 text-xs">
                  {q.jobTypeCode ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono text-[10px]">
                      {q.jobTypeCode}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {q.isPotentialOpportunity && (
                    <Target size={11} className="inline-block ml-1.5 text-[#1a5fb4] align-middle" />
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    {q.salesperson ? (
                      <>
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                          style={{ background: avatarColorFor(q.salesperson) }}
                        >
                          {initials(q.salesperson)}
                        </div>
                        <span className="text-xs text-foreground">{q.salesperson.split(" ")[0]}</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">{q.date}</td>
                <td className="px-4 py-3.5 text-sm font-mono text-foreground font-semibold">฿{q.amount.toLocaleString()}</td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[q.status]}`}>
                    {statusIcon[q.status]} {t(statusLabelKey[q.status])}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <InterestButtons value={q.interest} onChange={(v) => onInterestChange(q.id, v)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
