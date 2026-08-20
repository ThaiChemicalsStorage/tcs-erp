import { useState, type ReactNode } from "react";
import { Briefcase, Search, X } from "lucide-react";
import type { DriveStep } from "driver.js";
import { EmptyState } from "../../components/EmptyState";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import type { ProjectListItem, ProjectStatus } from "../../lib/project";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";

const FILTER_ALL = "all";

const statusStyle: Record<ProjectStatus, string> = {
  Planning: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  InProgress: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
  Completed: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};

// แสดงตารางรายการโครงการ พร้อมตัวกรองสถานะและช่องค้นหา
// Renders the Project list table with a status filter and search box.
export function ProjectList({
  projects,
  currentUserId,
  onOpen,
  headerAction,
}: {
  projects: ProjectListItem[];
  currentUserId: string;
  onOpen: (id: string) => void;
  /** ปุ่ม "+ สร้าง" ของหน้านั้นๆ — ให้หน้า Page เป็นเจ้าของ state ของกล่องเลือกต้นทาง ส่วน List ยังเป็น
   * component แสดงผลล้วนเหมือนเดิม (2026-08-20) */
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const statusLabel: Record<ProjectStatus, string> = {
    Planning: t("project.status.planning"),
    InProgress: t("project.status.inProgress"),
    Completed: t("project.status.completed"),
  };
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="project-summary"]', popover: { title: t("tour.project.summary.title"), description: t("tour.project.summary.desc"), side: "bottom" } },
    { element: '[data-tour="project-filters"]', popover: { title: t("tour.project.filters.title"), description: t("tour.project.filters.desc"), side: "bottom" } },
    { element: '[data-tour="project-table"]', popover: { title: t("tour.project.table.title"), description: t("tour.project.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("project", currentUserId, tourSteps);
  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const items = projects.map((p) => ({
    ...p,
    scopeNumber: p.scopeNumber ?? "",
    customerCompanyName: p.customerCompanyName ?? "",
    status: p.status ?? "Planning",
  }));

  const filtered = items
    .filter((p) => filterStatus === FILTER_ALL || p.status === filterStatus)
    .filter((p) => !normalizedSearch || [p.scopeNumber, p.customerCompanyName].some((v) => v.toLowerCase().includes(normalizedSearch)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("project.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("project.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          <TourReplayButton onClick={tour.start} />
        </div>
      </div>

      <div data-tour="project-summary" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t("quotation.filterAll"), count: items.length, color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: statusLabel.Planning, count: items.filter((p) => p.status === "Planning").length, color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: statusLabel.InProgress, count: items.filter((p) => p.status === "InProgress").length, color: "#e08a3c", bg: "from-[#e08a3c]/15 to-[#e08a3c]/5" },
          { label: statusLabel.Completed, count: items.filter((p) => p.status === "Completed").length, color: "#2aa36b", bg: "from-[#2aa36b]/15 to-[#2aa36b]/5" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:border-[#c9a84c]/30 transition-all">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.bg} flex items-center justify-center mb-3`}>
              <Briefcase size={15} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-bold text-foreground font-mono">{s.count}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div data-tour="project-filters" className="flex items-center gap-3 flex-wrap">
        <div className="relative h-9 w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("project.searchPlaceholder")}
            className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
          {([FILTER_ALL, "Planning", "InProgress", "Completed"] as const).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {s === FILTER_ALL ? t("quotation.filterAll") : statusLabel[s as ProjectStatus]}
            </button>
          ))}
        </div>
      </div>

      <div data-tour="project-table" className="bg-card border border-border rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={Briefcase} title={t("project.empty.title")} description={t("project.empty.description")} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Briefcase size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("project.noFilterResults")}</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {[t("project.col.jobCode"), t("project.col.customer"), t("project.col.itemCount"), t("project.col.status"), t("project.col.updatedAt")].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                tabIndex={0}
                role="button"
                aria-label={`${t("project.openRow")} ${p.scopeNumber}`}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p.id); } }}
                className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
              >
                <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{p.scopeNumber}</td>
                <td className="px-4 py-3.5 text-sm text-foreground font-medium max-w-[260px] truncate" title={p.customerCompanyName}>{p.customerCompanyName}</td>
                <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground">{p.itemCount}</td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[p.status]}`}>
                    {statusLabel[p.status]}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(p.updatedAt)}</td>
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
