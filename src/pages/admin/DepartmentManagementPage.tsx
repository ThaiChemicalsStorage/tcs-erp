import { useId, useState } from "react";
import { Archive, ArchiveRestore, ChevronRight, Loader2, Plus, RotateCcw, X } from "lucide-react";
import type { Department } from "../../lib/departments";
import { createDepartment, updateDepartment } from "../../lib/departments";
import type { Team } from "../../lib/teams";
import { createTeam, updateTeam } from "../../lib/teams";
import { ApiError } from "../../lib/apiClient";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { ListPageHeader, ListCard, ListEmpty } from "../../components/ui/ListPage";
import { Drawer } from "../../components/ui/Overlays";
import { Field } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field, table } from "../../components/ui/styles";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";

// หน้าจัดการแผนก — ตารางแผนก คลิกแถวเปิดแผงด้านข้างเพื่อแก้ชื่อ จัดการทีม หรือเก็บถาวร (ดีไซน์ใหม่ 2026-09-30)
// Manages departments — a table; a row opens a side panel to rename, manage teams, or archive
export function DepartmentManagementPage({
  currentUserId,
  departments,
  onDepartmentsChange,
  teams,
  onTeamsChange,
}: {
  currentUserId: string;
  departments: Department[];
  onDepartmentsChange: (departments: Department[]) => void;
  teams: Team[];
  onTeamsChange: (teams: Team[]) => void;
}) {
  const { t } = useI18n();
  const { message, show } = useToast();
  const tourSteps: TourStep[] = [
    { element: '[data-tour="dept-create"]', manual: "ch27-3", popover: { title: t("tour.departments.create.title"), description: t("tour.departments.create.desc"), side: "bottom" } },
    { element: '[data-tour="dept-table"]', manual: "ch27-3", popover: { title: t("tour.departments.table.title"), description: t("tour.departments.table.desc"), side: "top" } },
    { element: '[data-tour="dept-teams"]', manual: "ch27-3", popover: { title: t("tour.departments.teams.title"), description: t("tour.departments.teams.desc"), side: "bottom" } },
    { element: '[data-tour="dept-status"]', manual: "ch27-3", popover: { title: t("tour.departments.status.title"), description: t("tour.departments.status.desc"), side: "bottom" } },
  ];
  const tour = useModuleTour("departments", currentUserId, tourSteps);
  /** "new" = แผงเพิ่มแผนก · id = แผงของแผนกนั้น · null = ปิด */
  const [drawerTarget, setDrawerTarget] = useState<string | null>(null);

  const teamsFor = (departmentId: string) => teams.filter((tm) => tm.departmentId === departmentId);
  const activeCount = departments.filter((d) => d.isActive).length;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.admin")}
        title={t("nav.departments")}
        description={t("departments.pageHint")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={
          <button data-tour="dept-create" onClick={() => setDrawerTarget("new")} className={btn.primary}>
            <Plus size={16} /> {t("departments.addDepartment")}
          </button>
        }
      />

      <ListCard>
        {departments.length === 0 ? (
          <ListEmpty title={t("departments.empty")} />
        ) : (
          <div data-tour="dept-table" className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed">
              <thead>
                <tr className={table.head}>
                  <th className={`${table.th} w-[240px]`}>{t("departments.col.name")}</th>
                  <th data-tour="dept-teams" className={table.th}>{t("departments.col.teams")}</th>
                  <th className={`${table.th} w-[110px] text-right`}>{t("departments.col.teamCount")}</th>
                  <th data-tour="dept-status" className={`${table.th} w-[160px]`}>{t("departments.col.status")}</th>
                  <th className={`${table.th} w-12`}><span className="sr-only">{t("common.edit")}</span></th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => {
                  const deptTeams = teamsFor(d.id);
                  const activeTeams = deptTeams.filter((tm) => tm.isActive);
                  const archivedTeams = deptTeams.length - activeTeams.length;
                  return (
                    <tr key={d.id} onClick={() => setDrawerTarget(d.id)} className={`${table.row} group cursor-pointer text-sm`}>
                      <td className={table.td}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDrawerTarget(d.id); }}
                          aria-label={`${t("common.edit")} ${d.name}`}
                          className={`font-medium truncate max-w-full text-left rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 ${d.isActive ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          {d.name}
                        </button>
                      </td>
                      <td className={table.td}>
                        <span className={`block truncate ${activeTeams.length ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>
                          {activeTeams.length ? activeTeams.map((tm) => tm.name).join(" · ") : t("departments.noTeams")}
                        </span>
                        {archivedTeams > 0 && (
                          <span className="block text-xs text-muted-foreground">{t("departments.archivedTeams").replace("{n}", String(archivedTeams))}</span>
                        )}
                      </td>
                      <td className={`${table.td} text-right tabular-nums ${deptTeams.length ? "text-foreground" : "text-[#8a97ad]"}`}>
                        {deptTeams.length ? t("departments.teamCount").replace("{n}", String(deptTeams.length)) : t("common.dash")}
                      </td>
                      <td className={table.td}>
                        <StatusBadge status={d.isActive ? "active" : "archived"} label={d.isActive ? t("departments.statusActive") : t("departments.archivedBadge")} />
                      </td>
                      <td className={`${table.td} text-right`}>
                        <ChevronRight size={18} aria-hidden="true" className="inline text-[#a3aec2] group-hover:text-foreground transition-colors" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap px-5 py-3.5 text-[13px] text-muted-foreground">
          <span className="flex-1">
            {t("departments.summary")
              .replace("{n}", String(departments.length))
              .replace("{active}", String(activeCount))
              .replace("{archived}", String(departments.length - activeCount))}
          </span>
          {departments.length > 0 && <span>{t("departments.clickHint")}</span>}
        </div>
      </ListCard>

      {drawerTarget && (
        <DepartmentDrawer
          key={drawerTarget}
          initialDepartmentId={drawerTarget === "new" ? null : drawerTarget}
          departments={departments}
          onDepartmentsChange={onDepartmentsChange}
          teams={teams}
          onTeamsChange={onTeamsChange}
          onToast={show}
          onClose={() => setDrawerTarget(null)}
        />
      )}
      <Toast message={message} />
    </div>
  );
}

interface TeamRow {
  /** คีย์ในหน้านี้เท่านั้น (ทีมใหม่ยังไม่มี id) */
  key: string;
  /** null = ทีมใหม่ที่ยังไม่บันทึก */
  id: string | null;
  name: string;
  isActive: boolean;
  savedName: string;
  savedActive: boolean;
}

const toRow = (tm: Team): TeamRow => ({ key: tm.id, id: tm.id, name: tm.name, isActive: tm.isActive, savedName: tm.name, savedActive: tm.isActive });

/**
 * แผงแผนก (บอร์ด Departments-Teams) — แก้ชื่อแผนก เพิ่ม/แก้ชื่อ/เก็บถาวร/กู้คืนทีม แล้วกด "บันทึก" ครั้งเดียว
 * (เดิมแต่ละช่องบันทึกทันทีทีละรายการ — เปลี่ยนตามดีไซน์ใหม่ที่เจ้าของอนุมัติ 2026-09-30)
 * เก็บถาวร/กู้คืน "ทั้งแผนก" อยู่ในเมนูเพิ่มเติมและมีผลทันทีเหมือนเดิม
 * ถ้าบันทึกพังกลางทาง รายการที่สำเร็จแล้วถูกจำไว้ (กดบันทึกซ้ำจะไม่สร้างทีมซ้ำ)
 */
function DepartmentDrawer({ initialDepartmentId, departments, onDepartmentsChange, teams, onTeamsChange, onToast, onClose }: {
  initialDepartmentId: string | null;
  departments: Department[];
  onDepartmentsChange: (departments: Department[]) => void;
  teams: Team[];
  onTeamsChange: (teams: Team[]) => void;
  onToast: (message: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const formId = useId();
  const nameId = useId();
  // แผนกใหม่ที่บันทึกสำเร็จแล้วแต่ทีมยังบันทึกไม่ครบ จะกลายเป็นโหมดแก้ไขของแผนกนั้น
  const [departmentId, setDepartmentId] = useState<string | null>(initialDepartmentId);
  const department = departmentId ? departments.find((d) => d.id === departmentId) ?? null : null;
  const [name, setName] = useState(department?.name ?? "");
  const [savedName, setSavedName] = useState(department?.name ?? "");
  const [rows, setRows] = useState<TeamRow[]>(() => (departmentId ? teams.filter((tm) => tm.departmentId === departmentId).map(toRow) : []));
  const [newKeyCounter, setNewKeyCounter] = useState(0);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const setRow = (key: string, patch: Partial<TeamRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addTeam = () => {
    const key = `new-${newKeyCounter}`;
    setNewKeyCounter((n) => n + 1);
    setRows((rs) => [...rs, { key, id: null, name: "", isActive: true, savedName: "", savedActive: true }]);
    setFocusKey(key);
  };

  // บันทึกทุกการเปลี่ยนแปลงในแผงตามลำดับ: แผนก → ทีมเดิม/ทีมใหม่ — จำผลที่สำเร็จไว้แม้ขั้นถัดไปพัง
  // Saves every staged change in order (department, then teams), keeping whatever succeeded if a later step fails
  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    if (!name.trim()) { setError(t("departments.errorNameRequired")); return; }
    if (rows.some((r) => r.isActive && !r.name.trim())) { setError(t("departments.errorTeamNameRequired")); return; }
    setError("");
    setSaving(true);

    let deptList = departments;
    let teamList = teams;
    let deptId = departmentId;
    const next = [...rows];
    try {
      if (!deptId) {
        const created = await createDepartment({ name: name.trim() });
        deptList = [...deptList, created];
        deptId = created.id;
        setDepartmentId(created.id);
        setSavedName(created.name);
      } else if (name.trim() !== savedName) {
        const updated = await updateDepartment(deptId, { name: name.trim() });
        deptList = deptList.map((x) => (x.id === updated.id ? updated : x));
        setSavedName(updated.name);
      }
      for (let i = 0; i < next.length; i++) {
        const r = next[i];
        if (r.id === null) {
          const created = await createTeam({ name: r.name.trim(), departmentId: deptId });
          teamList = [...teamList, created];
          next[i] = { ...toRow(created), key: r.key };
          continue;
        }
        const fields: { name?: string; isActive?: boolean } = {};
        if (r.name.trim() && r.name.trim() !== r.savedName) fields.name = r.name.trim();
        if (r.isActive !== r.savedActive) fields.isActive = r.isActive;
        if (fields.name === undefined && fields.isActive === undefined) continue;
        const updated = await updateTeam(r.id, fields);
        teamList = teamList.map((x) => (x.id === updated.id ? updated : x));
        next[i] = { ...toRow(updated), key: r.key };
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
      onDepartmentsChange(deptList);
      onTeamsChange(teamList);
      setRows(next);
      setSaving(false);
      return;
    }
    onDepartmentsChange(deptList);
    onTeamsChange(teamList);
    setSaving(false);
    onToast(initialDepartmentId ? t("common.savedNote") : t("departments.createdToast"));
    onClose();
  };

  // เก็บถาวร/กู้คืนทั้งแผนก — มีผลทันที (เหมือนเดิม) ไม่แตะการแก้ไขอื่นที่ยังไม่บันทึกในแผง
  // Archives/restores the whole department immediately (as before), leaving unsaved panel edits untouched
  const toggleDepartmentActive = async () => {
    if (!department) return;
    setArchiving(true);
    try {
      const updated = await updateDepartment(department.id, { isActive: !department.isActive });
      onDepartmentsChange(departments.map((x) => (x.id === updated.id ? updated : x)));
      onToast(t("common.savedNote"));
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setArchiving(false);
    }
  };

  const savedRows = rows.filter((r) => r.id !== null);
  const archivedSaved = savedRows.filter((r) => !r.savedActive).length;

  const title = (
    <span className="flex flex-col min-w-0">
      <span className="text-[13px] font-normal text-muted-foreground">{t("nav.departments")}</span>
      <span className="truncate">{department ? department.name : t("departments.addDepartment")}</span>
    </span>
  );
  const subtitle = department ? (
    <span className="inline-flex items-center gap-2.5 flex-wrap mt-1">
      <StatusBadge status={department.isActive ? "active" : "archived"} label={department.isActive ? t("departments.statusActive") : t("departments.archivedBadge")} />
      <span>
        {t("departments.teamCount").replace("{n}", String(savedRows.length))}
        {archivedSaved > 0 && ` · ${t("departments.archivedTeams").replace("{n}", String(archivedSaved))}`}
      </span>
    </span>
  ) : undefined;

  const footerLeft = department ? (
    <MoreMenu
      align="left"
      items={[
        department.isActive
          ? { key: "archive", label: t("departments.menu.archive"), hint: t("departments.menu.archiveHint"), icon: Archive, danger: true, disabled: archiving || saving, onSelect: () => void toggleDepartmentActive() }
          : { key: "restore", label: t("departments.menu.restore"), icon: ArchiveRestore, disabled: archiving || saving, onSelect: () => void toggleDepartmentActive() },
      ]}
    />
  ) : undefined;

  const footerRight = (
    <>
      <button type="button" onClick={onClose} disabled={saving} className={btn.secondary}>{t("common.cancel")}</button>
      <button type="submit" form={formId} disabled={saving} className={`${btn.primary} min-w-[88px]`}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : t("common.save")}
      </button>
    </>
  );

  return (
    <Drawer open title={title} subtitle={subtitle} onClose={onClose} busy={saving} footerLeft={footerLeft} footerRight={footerRight}>
      <form id={formId} onSubmit={(e) => void handleSave(e)} noValidate className="flex flex-col gap-6">
        {error && <p role="alert" className="rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5">{error}</p>}

        <section className="flex flex-col gap-4">
          <h3 className="text-[15px] font-semibold text-foreground">{t("departments.sectionInfo")}</h3>
          <Field label={t("departments.nameLabel")} htmlFor={nameId} required>
            <input id={nameId} autoFocus={!department} placeholder={t("departments.namePlaceholder")} className={`${field.input} w-full`} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </section>

        <div className="h-px bg-[#eef1f6] flex-shrink-0" />

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h3 className="text-[15px] font-semibold text-foreground">{t("departments.teamsTitle")}</h3>
            <span className="text-[13px] text-muted-foreground">{t("departments.teamCount").replace("{n}", String(rows.length))}</span>
          </div>
          {rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("departments.noTeams")}</p>
          ) : (
            <div className="flex flex-col border border-border rounded-[10px] overflow-hidden">
              {rows.map((r) => {
                const isNew = r.id === null;
                if (!r.isActive) {
                  return (
                    <div key={r.key} className="flex items-center gap-2.5 min-h-[57px] py-2.5 pl-3 pr-2 border-b border-[#eef1f6] last:border-b-0">
                      <span className="flex-1 min-w-0 pl-[11px] text-muted-foreground truncate">{r.name}</span>
                      <StatusBadge status="archived" label={t("departments.archivedBadge")} />
                      <button type="button" onClick={() => setRow(r.key, { isActive: true })} aria-label={`${t("departments.restoreAction")} ${r.name}`} className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-[#1a5fb4] text-sm font-medium hover:bg-[#e8f0fb] transition-colors whitespace-nowrap flex-shrink-0">
                        <RotateCcw size={15} /> {t("departments.restoreAction")}
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={r.key} className={`flex items-center gap-2 py-2.5 pl-3 pr-2 border-b border-[#eef1f6] last:border-b-0 ${isNew ? "bg-[#f8f9fc]" : ""}`}>
                    <input
                      aria-label={t("departments.teamNamePlaceholder")}
                      placeholder={t("departments.teamNamePlaceholder")}
                      autoFocus={focusKey === r.key}
                      value={r.name}
                      onChange={(e) => setRow(r.key, { name: e.target.value })}
                      className={`${field.cell} flex-1 min-w-0`}
                    />
                    {isNew ? (
                      <>
                        <span className="h-[22px] px-2 rounded-md bg-[#e8f0fb] text-[#1a5fb4] text-xs font-semibold inline-flex items-center flex-shrink-0">{t("departments.newTeamBadge")}</span>
                        <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={t("departments.removeNewTeam")} title={t("departments.removeNewTeam")} className={btn.icon}>
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRow(r.key, { isActive: false })}
                        aria-label={`${t("departments.archiveAction")} ${r.savedName}`}
                        title={`${t("departments.archiveAction")} ${r.savedName}`}
                        className={btn.icon}
                      >
                        <Archive size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div>
            <button type="button" onClick={addTeam} className={btn.text}>
              <Plus size={16} /> {t("departments.addTeam")}
            </button>
          </div>
        </section>
      </form>
    </Drawer>
  );
}
