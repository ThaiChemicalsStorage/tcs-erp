import { useId, useState } from "react";
import { Plus, Pencil, Archive, ArchiveRestore, ChevronDown, ChevronRight, Check, X } from "lucide-react";
import type { Department } from "../../lib/departments";
import { createDepartment, updateDepartment } from "../../lib/departments";
import type { Team } from "../../lib/teams";
import { createTeam, updateTeam } from "../../lib/teams";
import { ApiError } from "../../lib/apiClient";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการแผนก — แสดงรายชื่อแผนก คลิกเพื่อขยายดู/จัดการทีมย่อยในแผนกนั้น
// Manages departments — list departments, expand one to view/manage its teams inline
export function DepartmentManagementPage({
  departments,
  onDepartmentsChange,
  teams,
  onTeamsChange,
}: {
  departments: Department[];
  onDepartmentsChange: (departments: Department[]) => void;
  teams: Team[];
  onTeamsChange: (teams: Team[]) => void;
}) {
  const { t } = useI18n();
  const { message, show } = useToast();
  const newDeptId = useId();
  const newTeamId = useId();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creatingDept, setCreatingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [error, setError] = useState("");

  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState("");

  const [creatingTeamFor, setCreatingTeamFor] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");

  const teamsFor = (departmentId: string) => teams.filter((tm) => tm.departmentId === departmentId);

  const submitNewDepartment = async () => {
    if (!newDeptName.trim()) { setError(t("departments.errorNameRequired")); return; }
    try {
      const created = await createDepartment({ name: newDeptName.trim() });
      onDepartmentsChange([...departments, created]);
      show(t("departments.createdToast"));
      setCreatingDept(false);
      setNewDeptName("");
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const startEditDept = (d: Department) => { setEditingDeptId(d.id); setEditDeptName(d.name); setError(""); };
  const submitEditDept = async (d: Department) => {
    if (!editDeptName.trim()) { setError(t("departments.errorNameRequired")); return; }
    try {
      const updated = await updateDepartment(d.id, { name: editDeptName.trim() });
      onDepartmentsChange(departments.map((x) => (x.id === d.id ? updated : x)));
      setEditingDeptId(null);
      setError("");
      show(t("common.savedNote"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const toggleDeptActive = async (d: Department) => {
    try {
      const updated = await updateDepartment(d.id, { isActive: !d.isActive });
      onDepartmentsChange(departments.map((x) => (x.id === d.id ? updated : x)));
      show(t("common.savedNote"));
    } catch (err) {
      show(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const submitNewTeam = async (departmentId: string) => {
    if (!newTeamName.trim()) { setError(t("departments.errorTeamNameRequired")); return; }
    try {
      const created = await createTeam({ name: newTeamName.trim(), departmentId });
      onTeamsChange([...teams, created]);
      show(t("departments.teamCreatedToast"));
      setCreatingTeamFor(null);
      setNewTeamName("");
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const startEditTeam = (tm: Team) => { setEditingTeamId(tm.id); setEditTeamName(tm.name); setError(""); };
  const submitEditTeam = async (tm: Team) => {
    if (!editTeamName.trim()) { setError(t("departments.errorTeamNameRequired")); return; }
    try {
      const updated = await updateTeam(tm.id, { name: editTeamName.trim() });
      onTeamsChange(teams.map((x) => (x.id === tm.id ? updated : x)));
      setEditingTeamId(null);
      setError("");
      show(t("common.savedNote"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const toggleTeamActive = async (tm: Team) => {
    try {
      const updated = await updateTeam(tm.id, { isActive: !tm.isActive });
      onTeamsChange(teams.map((x) => (x.id === tm.id ? updated : x)));
      show(t("common.savedNote"));
    } catch (err) {
      show(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-xs text-muted-foreground">{t("departments.pageHint")}</p>
        <button
          onClick={() => { setCreatingDept(true); setNewDeptName(""); setError(""); }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
        >
          <Plus size={15} /> {t("departments.addDepartment")}
        </button>
      </div>

      {creatingDept && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4 flex items-center gap-2">
          <input
            id={newDeptId}
            autoFocus
            placeholder={t("departments.namePlaceholder")}
            className="flex-1 text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitNewDepartment(); if (e.key === "Escape") setCreatingDept(false); }}
          />
          <button onClick={submitNewDepartment} className="p-2 text-[#c9a84c] hover:text-[#f0c040] transition-colors" aria-label={t("common.save")}><Check size={16} /></button>
          <button onClick={() => { setCreatingDept(false); setError(""); }} className="p-2 text-muted-foreground hover:text-foreground transition-colors" aria-label={t("common.cancel")}><X size={16} /></button>
        </div>
      )}
      {error && <p className="text-xs text-[#e05252] mb-3">{error}</p>}

      <div className="space-y-3">
        {departments.map((d) => {
          const expanded = expandedId === d.id;
          const deptTeams = teamsFor(d.id);
          return (
            <div key={d.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 p-4">
                <button
                  onClick={() => setExpandedId(expanded ? null : d.id)}
                  aria-label={expanded ? t("departments.collapseTeams") : t("departments.expandTeams")}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>

                {editingDeptId === d.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      autoFocus
                      className="flex-1 text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50"
                      value={editDeptName}
                      onChange={(e) => setEditDeptName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitEditDept(d); if (e.key === "Escape") setEditingDeptId(null); }}
                    />
                    <button onClick={() => submitEditDept(d)} className="p-1.5 text-[#c9a84c] hover:text-[#f0c040] transition-colors" aria-label={t("common.save")}><Check size={14} /></button>
                    <button onClick={() => setEditingDeptId(null)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" aria-label={t("common.cancel")}><X size={14} /></button>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{d.name}</p>
                    {!d.isActive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">{t("departments.archivedBadge")}</span>
                    )}
                    {deptTeams.length > 0 && <span className="text-xs text-muted-foreground">· {deptTeams.length}</span>}
                  </div>
                )}

                {editingDeptId !== d.id && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEditDept(d)} title={t("common.edit")} aria-label={`${t("common.edit")} ${d.name}`} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><Pencil size={13} /></button>
                    <button
                      onClick={() => toggleDeptActive(d)}
                      title={d.isActive ? t("departments.archiveAction") : t("departments.restoreAction")}
                      aria-label={`${d.isActive ? t("departments.archiveAction") : t("departments.restoreAction")} ${d.name}`}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {d.isActive ? <Archive size={13} /> : <ArchiveRestore size={13} />}
                    </button>
                  </div>
                )}
              </div>

              {expanded && (
                <div className="border-t border-border bg-secondary/30 p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("departments.teamsTitle")}</p>
                    <button
                      onClick={() => { setCreatingTeamFor(d.id); setNewTeamName(""); setError(""); }}
                      className="flex items-center gap-1 text-xs text-[#c9a84c] hover:text-[#f0c040] transition-colors"
                    >
                      <Plus size={12} /> {t("departments.addTeam")}
                    </button>
                  </div>

                  {creatingTeamFor === d.id && (
                    <div className="flex items-center gap-2 mb-2.5">
                      <input
                        id={newTeamId}
                        autoFocus
                        placeholder={t("departments.teamNamePlaceholder")}
                        className="flex-1 text-sm text-foreground bg-card border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") submitNewTeam(d.id); if (e.key === "Escape") setCreatingTeamFor(null); }}
                      />
                      <button onClick={() => submitNewTeam(d.id)} className="p-1.5 text-[#c9a84c] hover:text-[#f0c040] transition-colors" aria-label={t("common.save")}><Check size={14} /></button>
                      <button onClick={() => setCreatingTeamFor(null)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" aria-label={t("common.cancel")}><X size={14} /></button>
                    </div>
                  )}

                  {deptTeams.length === 0 && creatingTeamFor !== d.id ? (
                    <p className="text-xs text-muted-foreground">{t("departments.noTeams")}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {deptTeams.map((tm) => (
                        <div key={tm.id} className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
                          {editingTeamId === tm.id ? (
                            <>
                              <input
                                autoFocus
                                className="flex-1 text-sm text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1 outline-none focus:border-[#c9a84c]/50"
                                value={editTeamName}
                                onChange={(e) => setEditTeamName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") submitEditTeam(tm); if (e.key === "Escape") setEditingTeamId(null); }}
                              />
                              <button onClick={() => submitEditTeam(tm)} className="p-1 text-[#c9a84c] hover:text-[#f0c040] transition-colors" aria-label={t("common.save")}><Check size={13} /></button>
                              <button onClick={() => setEditingTeamId(null)} className="p-1 text-muted-foreground hover:text-foreground transition-colors" aria-label={t("common.cancel")}><X size={13} /></button>
                            </>
                          ) : (
                            <>
                              <p className="flex-1 text-xs text-foreground">{tm.name}</p>
                              {!tm.isActive && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">{t("departments.archivedBadge")}</span>
                              )}
                              <button onClick={() => startEditTeam(tm)} title={t("common.edit")} aria-label={`${t("common.edit")} ${tm.name}`} className="p-1 text-muted-foreground hover:text-foreground transition-colors"><Pencil size={12} /></button>
                              <button
                                onClick={() => toggleTeamActive(tm)}
                                title={tm.isActive ? t("departments.archiveAction") : t("departments.restoreAction")}
                                aria-label={`${tm.isActive ? t("departments.archiveAction") : t("departments.restoreAction")} ${tm.name}`}
                                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {tm.isActive ? <Archive size={12} /> : <ArchiveRestore size={12} />}
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Toast message={message} />
    </div>
  );
}
