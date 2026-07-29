import { useState } from "react";
import { Plus, FileText, Target, X, Search, GitBranch, HelpCircle } from "lucide-react";
import type { DriveStep } from "driver.js";
import { EmptyState } from "../../components/EmptyState";
import { useModuleTour } from "../../components/GuidedTour";
import { type Quote, type QuoteStatus, type QuoteInterest, type QuotationListFilter, statusStyle, statusIcon, statusLabelKey, isRevisionQuote } from "../../lib/quotes";
import type { JobType } from "../../lib/jobTypes";
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
  currentUserId,
  onOpen,
  onCreateNew,
  onInterestChange,
}: {
  quotes: Quote[];
  jobTypes: JobType[];
  /** Seeds the filters below on mount (a Dashboard pipeline-stage/follow-up click-through) — not re-applied on prop changes since QuoteList remounts fresh each visit, see QuotationPage.tsx. */
  initialFilter: QuotationListFilter | null;
  /** For the per-user "seen" tracking of this page's one-time guided tour (see useModuleTour). */
  currentUserId: string;
  onOpen: (id: string) => void;
  onCreateNew: () => void;
  onInterestChange: (id: string, v: QuoteInterest) => void;
}) {
  const { t } = useI18n();

  // Page tour (added 2026-07-29) — auto-starts once per user on their first visit to this list;
  // the HelpCircle button in the header replays it. Mounted here (not QuotationPage) so it can
  // never fire over the detail/editor views.
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="quotation-create"]', popover: { title: t("tour.quotation.create.title"), description: t("tour.quotation.create.desc"), side: "bottom" } },
    { element: '[data-tour="quotation-summary"]', popover: { title: t("tour.quotation.summary.title"), description: t("tour.quotation.summary.desc"), side: "bottom" } },
    { element: '[data-tour="quotation-filters"]', popover: { title: t("tour.quotation.filters.title"), description: t("tour.quotation.filters.desc"), side: "bottom" } },
    { element: '[data-tour="quotation-table"]', popover: { title: t("tour.quotation.table.title"), description: t("tour.quotation.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("quotation", currentUserId, tourSteps);
  const [filterStatus, setFilterStatus] = useState<string>(initialFilter?.status ?? FILTER_ALL);
  const [filterJobType, setFilterJobType] = useState<string>(FILTER_ALL);
  const [filterSalesperson, setFilterSalesperson] = useState<string>(FILTER_ALL);
  const [clientFilter, setClientFilter] = useState<string>(initialFilter?.client ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();
  // Distinct salespeople actually present in `quotes` (not a separate master list — salesperson is
  // a free-text snapshot, not a live user reference, same as everywhere else this field is used).
  // A caller without `quotations:viewAll` only ever receives their own quotes from the server, so
  // this list naturally narrows to just themselves for that case — no separate client-side gating
  // needed.
  const salespeopleInList = [...new Set(quotes.map((q) => q.salesperson).filter((s) => s.trim()))].sort();
  const filtered = quotes
    .filter((q) => filterStatus === FILTER_ALL || q.status === filterStatus)
    .filter((q) => filterJobType === FILTER_ALL || q.jobTypeCode === filterJobType)
    .filter((q) => filterSalesperson === FILTER_ALL || q.salesperson === filterSalesperson)
    .filter((q) => !clientFilter || q.client === clientFilter)
    .filter((q) => !normalizedSearch || [q.id, q.client, q.salesperson, q.poRef].some((v) => v.toLowerCase().includes(normalizedSearch)));

  const columns = [
    t("quotation.col.id"), t("quotation.col.client"), t("quotation.col.jobType"), t("quotation.col.salesperson"),
    t("quotation.col.date"), t("quotation.col.amount"), t("quotation.col.status"), t("quotation.col.interest"),
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("quotation.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("quotation.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={tour.start}
            title={t("tour.replay")}
            aria-label={t("tour.replay")}
            className="flex items-center justify-center w-9 h-9 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all"
          >
            <HelpCircle size={15} />
          </button>
          <button data-tour="quotation-create" onClick={onCreateNew} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
            <Plus size={15} /> {t("quotation.createNew")}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div data-tour="quotation-summary" className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: t("quotation.filterAll"), count: quotes.length, color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: t("quotation.status.pendingApproval"), count: quotes.filter((q) => q.status === "รออนุมัติ").length, color: "#c9a84c", bg: "from-[#c9a84c]/15 to-[#c9a84c]/5" },
          { label: t("quotation.status.approved"), count: quotes.filter((q) => q.status === "อนุมัติแล้ว").length, color: "#2aa36b", bg: "from-[#2aa36b]/15 to-[#2aa36b]/5" },
          { label: t("quotation.interest.interested"), count: quotes.filter((q) => q.interest === "น่าสนใจ").length, color: "#c9a84c", bg: "from-[#c9a84c]/15 to-[#c9a84c]/5" },
          { label: t("quotation.field.potentialOpportunity"), count: quotes.filter((q) => q.isPotentialOpportunity).length, color: "#1a5fb4", bg: "from-[#1a5fb4]/15 to-[#1a5fb4]/5", icon: Target },
          { label: t("quotation.revisionCount"), count: quotes.filter((q) => isRevisionQuote(q.id)).length, color: "#7c4dbb", bg: "from-[#7c4dbb]/15 to-[#7c4dbb]/5", icon: GitBranch },
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
      <div data-tour="quotation-filters" className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative h-9 w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("quotation.searchPlaceholder")}
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
            <option value={FILTER_ALL}>{t("quotation.field.jobType")}: {t("quotation.filterAll")}</option>
            {jobTypes.map((jt) => (
              <option key={jt.id} value={jt.code}>{jt.code} — {jt.name}</option>
            ))}
          </select>
          <select
            value={filterSalesperson}
            onChange={(e) => setFilterSalesperson(e.target.value)}
            className="h-9 text-xs text-foreground bg-secondary border border-border rounded-lg px-3 outline-none focus:border-[#c9a84c]/50 transition-colors"
          >
            <option value={FILTER_ALL}>{t("quotation.col.salesperson")}: {t("quotation.filterAll")}</option>
            {salespeopleInList.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {clientFilter && (
            <button onClick={() => setClientFilter("")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#1a5fb4]/10 text-[#1a5fb4] border border-[#1a5fb4]/20 hover:bg-[#1a5fb4]/15 transition-colors">
              {t("quotation.col.client")}: {clientFilter} <X size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
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
      </div>

      {/* Table */}
      <div data-tour="quotation-table" className="bg-card border border-border rounded-xl overflow-hidden">
        {quotes.length === 0 ? (
          <EmptyState icon={FileText} title={t("empty.quotations.title")} description={t("empty.quotations.sub")} actionLabel={t("empty.quotations.action")} onAction={onCreateNew} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <FileText size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("quotation.noFilterResults")}</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((q) => (
              <tr key={q.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold cursor-pointer whitespace-nowrap" onClick={() => onOpen(q.id)}>
                  {q.id}
                </td>
                <td className="px-4 py-3.5 text-sm text-foreground font-medium cursor-pointer max-w-[220px] truncate" onClick={() => onOpen(q.id)} title={q.client}>
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
        </div>
        )}
      </div>
    </div>
  );
}
