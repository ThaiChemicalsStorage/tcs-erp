import { useMemo, useState } from "react";
import {
  Plus, Search, Eye, Pencil, Star, Power, Archive, ArchiveRestore, Building2,
} from "lucide-react";
import type { CompanyProfile } from "../../../lib/companyProfiles";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { EmptyState } from "../../../components/EmptyState";
import { useI18n } from "../../../lib/i18n";

type StatusFilter = "all" | "active" | "inactive";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export function CompanyProfileList({
  profiles,
  canCreate,
  canEdit,
  canArchive,
  canSetDefault,
  onView,
  onEdit,
  onCreateNew,
  onToggleActive,
  onSetDefault,
  onArchiveToggle,
}: {
  profiles: CompanyProfile[];
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canSetDefault: boolean;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onCreateNew: () => void;
  onToggleActive: (id: string) => void;
  onSetDefault: (id: string) => void;
  onArchiveToggle: (id: string) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [defaultOnly, setDefaultOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [setDefaultTarget, setSetDefaultTarget] = useState<CompanyProfile | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CompanyProfile | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<CompanyProfile | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles
      .filter((p) => (showArchived ? true : !p.isDeleted))
      .filter((p) => (statusFilter === "all" ? true : statusFilter === "active" ? p.isActive : !p.isActive))
      .filter((p) => (defaultOnly ? p.isDefault : true))
      .filter((p) => (q ? [p.companyNameTh, p.companyNameEn, p.displayName, p.companyCode, p.taxId].some((f) => f.toLowerCase().includes(q)) : true));
  }, [profiles, search, statusFilter, defaultOnly, showArchived]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("companyProfiles.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("companyProfiles.pageSubtitle")}</p>
        </div>
        {canCreate && (
          <button onClick={onCreateNew} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
            <Plus size={15} /> {t("companyProfiles.addNew")}
          </button>
        )}
      </div>

      {profiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 focus-within:border-[#c9a84c]/40 transition-colors">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t("companyProfiles.searchPlaceholder")}
              className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none">
            <option value="all">{t("companyProfiles.filter.all")}</option>
            <option value="active">{t("companyProfiles.filter.active")}</option>
            <option value="inactive">{t("companyProfiles.filter.inactive")}</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground">
            <input type="checkbox" checked={defaultOnly} onChange={(e) => setDefaultOnly(e.target.checked)} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
            {t("companyProfiles.filter.defaultOnly")}
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground ml-auto">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
            {t("companyProfiles.showArchived")}
          </label>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {profiles.length === 0 ? (
          <EmptyState icon={Building2} title={t("empty.companyProfiles.title")} description={t("empty.companyProfiles.sub")} actionLabel={canCreate ? t("empty.companyProfiles.action") : undefined} onAction={canCreate ? onCreateNew : undefined} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Building2 size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("companyProfiles.noFilterResults")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("companyProfiles.col.logo")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("companyProfiles.col.code")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("companyProfiles.col.name")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("companyProfiles.col.taxId")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("companyProfiles.col.branch")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("companyProfiles.col.phone")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("companyProfiles.col.email")}</th>
                  <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("companyProfiles.col.default")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("companyProfiles.col.status")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("companyProfiles.col.updatedAt")}</th>
                  <th className="px-4 py-3 w-40" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors group ${p.isDeleted ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="w-10 h-8 flex items-center justify-center bg-secondary border border-border rounded overflow-hidden flex-shrink-0">
                        {p.logoDataUrl ? <img src={p.logoDataUrl} alt={`${t("companyProfiles.form.logoLabel")} — ${p.displayName || p.companyNameTh}`} className="w-full h-full object-contain" /> : <Building2 size={14} className="text-muted-foreground" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{p.companyCode}</td>
                    <td className="px-4 py-3 text-sm text-foreground font-medium max-w-[220px] truncate" title={p.companyNameTh}>{p.displayName || p.companyNameTh}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{p.taxId || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{p.branchName || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{p.phone || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate" title={p.email}>{p.email || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      {p.isDefault && <Star size={14} className="inline text-[#c9a84c] fill-[#c9a84c]" />}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        p.isDeleted ? "bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20"
                        : p.isActive ? "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20" : "bg-[#e08a3c]/10 text-[#e08a3c] border border-[#e08a3c]/20"
                      }`}>
                        {p.isDeleted ? t("common.status.archived") : p.isActive ? t("common.status.active") : t("companyProfiles.status.inactive")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">{fmtDate(p.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onView(p.id)} title={t("common.view")} aria-label={`${t("common.view")} ${p.companyNameTh}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                          <Eye size={14} />
                        </button>
                        {canEdit && (
                          <button onClick={() => onEdit(p.id)} title={t("common.edit")} aria-label={`${t("common.edit")} ${p.companyNameTh}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                            <Pencil size={14} />
                          </button>
                        )}
                        {canSetDefault && !p.isDefault && !p.isDeleted && p.isActive && (
                          <button onClick={() => setSetDefaultTarget(p)} title={t("companyProfiles.action.setDefault")} aria-label={`${t("companyProfiles.action.setDefault")} ${p.companyNameTh}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                            <Star size={14} />
                          </button>
                        )}
                        {canEdit && !p.isDeleted && (
                          <button
                            onClick={() => (p.isActive ? setDeactivateTarget(p) : onToggleActive(p.id))}
                            title={p.isActive ? t("companyProfiles.action.deactivate") : t("companyProfiles.action.activate")}
                            aria-label={`${p.isActive ? t("companyProfiles.action.deactivate") : t("companyProfiles.action.activate")} ${p.companyNameTh}`}
                            className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors"
                          >
                            <Power size={14} />
                          </button>
                        )}
                        {canArchive && (
                          <button onClick={() => setArchiveTarget(p)} title={p.isDeleted ? t("common.unarchive") : t("common.archive")} aria-label={`${p.isDeleted ? t("common.unarchive") : t("common.archive")} ${p.companyNameTh}`} className="p-1.5 text-muted-foreground hover:text-[#e05252] transition-colors">
                            {p.isDeleted ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={setDefaultTarget !== null}
        title={t("companyProfiles.setDefaultConfirmTitle")}
        message={t("companyProfiles.setDefaultConfirmMessage").replace("{name}", setDefaultTarget?.displayName || setDefaultTarget?.companyNameTh || "")}
        confirmLabel={t("companyProfiles.action.setDefault")}
        onCancel={() => setSetDefaultTarget(null)}
        onConfirm={() => { if (setDefaultTarget) onSetDefault(setDefaultTarget.id); setSetDefaultTarget(null); }}
      />
      <ConfirmDialog
        open={deactivateTarget !== null}
        title={t("companyProfiles.action.confirmDeactivateTitle")}
        message={t("companyProfiles.action.confirmDeactivateMessage")}
        confirmLabel={t("companyProfiles.action.deactivate")}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={() => { if (deactivateTarget) onToggleActive(deactivateTarget.id); setDeactivateTarget(null); }}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        title={archiveTarget?.isDeleted ? t("companyProfiles.unarchiveConfirmTitle") : t("companyProfiles.archiveConfirmTitle")}
        message={archiveTarget?.isDeleted ? t("companyProfiles.unarchiveConfirmMessage") : t("companyProfiles.archiveConfirmMessage")}
        confirmLabel={archiveTarget?.isDeleted ? t("common.unarchive") : t("common.archive")}
        danger={!archiveTarget?.isDeleted}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => { if (archiveTarget) onArchiveToggle(archiveTarget.id); setArchiveTarget(null); }}
      />
    </div>
  );
}
