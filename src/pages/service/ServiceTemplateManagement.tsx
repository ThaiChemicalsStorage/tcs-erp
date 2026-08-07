import { useEffect, useState } from "react";
import { Layers, Plus, Copy, Archive, ArchiveRestore, Trash2, ArrowUp, ArrowDown, X } from "lucide-react";
import {
  type ServiceTemplateSummary, type ServiceTemplate, type ServiceChecklistSectionDef, type ServiceChecklistGroupDef,
  type ServiceChecklistItemDef, type ServiceChecklistItemKind,
  fetchServiceTemplates, fetchServiceTemplate, createServiceTemplate, updateServiceTemplate,
  duplicateServiceTemplate, setServiceTemplateArchived,
} from "../../lib/serviceTemplates";
import type { DriveStep } from "driver.js";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../hooks/useToast";
import { Toast } from "../../components/Toast";
import { useI18n } from "../../lib/i18n";

function moveItem<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const next = [...arr];
  const target = index + dir;
  if (target < 0 || target >= next.length) return arr;
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((it, i) => (typeof it === "object" && it !== null && "sortOrder" in it ? { ...it, sortOrder: i } : it));
}

let localKeySeq = 0;
function newLocalKey(prefix: string): string {
  localKeySeq += 1;
  return `${prefix}-new-${Date.now().toString(36)}-${localKeySeq}`;
}

// จัดการ Template รายการตรวจเช็คสำหรับโมดูลบริการ — รายการ + ฟอร์มแก้ไขหมวด/กลุ่ม/รายการตรวจเช็ค
// Service Checklist Template management — list + a sections/groups/items editor.
export function ServiceTemplateManagement({
  currentUserId,
  canCreate,
  canEdit,
  canArchive,
}: {
  currentUserId: string;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="servicetpl-list"]', popover: { title: t("tour.serviceTpl.list.title"), description: t("tour.serviceTpl.list.desc"), side: "top" } },
    { element: '[data-tour="servicetpl-archived"]', popover: { title: t("tour.serviceTpl.archived.title"), description: t("tour.serviceTpl.archived.desc"), side: "bottom" } },
  ];
  const tour = useModuleTour("serviceTemplates", currentUserId, tourSteps);
  const [templates, setTemplates] = useState<ServiceTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const loadList = () => {
    setLoading(true);
    fetchServiceTemplates().then((list) => { setTemplates(list); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => {
    let cancelled = false;
    fetchServiceTemplates().then((list) => { if (!cancelled) { setTemplates(list); setLoading(false); } }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const visible = templates.filter((tp) => showArchived || !tp.isDeleted);

  if (editingId !== null) {
    return (
      <>
        <ServiceTemplateEditor
          templateId={editingId}
          canEdit={canEdit}
          onBack={() => { setEditingId(null); loadList(); }}
          showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("serviceTemplates.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("serviceTemplates.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <TourReplayButton onClick={tour.start} />
          <button
            data-tour="servicetpl-archived"
            onClick={() => setShowArchived((v) => !v)}
            className={`h-9 px-3 text-xs rounded-lg font-medium border transition-all ${showArchived ? "bg-[#c9a84c]/10 text-[#866d28] border-[#c9a84c]/40" : "bg-secondary text-muted-foreground border-border hover:text-foreground"}`}
          >
            {t("serviceTemplates.showArchived")}
          </button>
          {canCreate && (
            <button onClick={() => setEditingId("new")} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              <Plus size={15} /> {t("serviceTemplates.addNew")}
            </button>
          )}
        </div>
      </div>

      <div data-tour="servicetpl-list" className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center"><div className="h-10 w-10 rounded-full border-2 border-[#c9a84c] border-t-transparent animate-spin" /></div>
        ) : visible.length === 0 ? (
          <EmptyState icon={Layers} title={t("serviceTemplates.empty.title")} description={t("serviceTemplates.empty.description")} compact />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[t("serviceTemplates.col.name"), t("serviceTemplates.col.code"), t("serviceTemplates.col.sections"), t("serviceTemplates.col.items"), t("serviceTemplates.col.status"), ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((tp) => (
                  <tr key={tp.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3.5 text-sm text-foreground font-medium cursor-pointer" onClick={() => setEditingId(tp.id)}>{tp.templateName}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{tp.templateCode}</td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">{tp.sectionCount}</td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">{tp.itemCount}</td>
                    <td className="px-4 py-3.5">
                      {tp.isDeleted ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">{t("serviceTemplates.archived")}</span>
                      ) : tp.isActive ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20">{t("serviceTemplates.active")}</span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20">{t("serviceTemplates.inactive")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        {canCreate && (
                          <button
                            title={t("serviceTemplates.duplicate")}
                            onClick={async () => {
                              try { await duplicateServiceTemplate(tp.id, `${tp.templateName} (สำเนา)`); toast.show(t("serviceTemplates.toast.duplicated")); loadList(); }
                              catch { toast.show(t("serviceTemplates.toast.actionFailed")); }
                            }}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/60 transition-colors"
                          ><Copy size={14} /></button>
                        )}
                        {canArchive && (
                          <button
                            title={tp.isDeleted ? t("serviceTemplates.restore") : t("serviceTemplates.archive")}
                            onClick={async () => {
                              try { await setServiceTemplateArchived(tp.id, !tp.isDeleted); toast.show(t("serviceTemplates.toast.updated")); loadList(); }
                              catch { toast.show(t("serviceTemplates.toast.actionFailed")); }
                            }}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/60 transition-colors"
                          >{tp.isDeleted ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
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
      <Toast message={toast.message} />
    </div>
  );
}

function emptyItem(): ServiceChecklistItemDef {
  return { key: newLocalKey("item"), label: "", kind: "normalAbnormal", sortOrder: 0 };
}
function emptyGroup(): ServiceChecklistGroupDef {
  return { key: newLocalKey("group"), title: "", sortOrder: 0, items: [emptyItem()] };
}
function emptySection(): ServiceChecklistSectionDef {
  return { key: newLocalKey("section"), title: "", isOptionalAddon: false, sortOrder: 0, groups: [emptyGroup()] };
}

function ServiceTemplateEditor({
  templateId, canEdit, onBack, showToast,
}: {
  templateId: string | "new";
  canEdit: boolean;
  onBack: () => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const isNew = templateId === "new";
  const [loading, setLoading] = useState(!isNew);
  const [templateName, setTemplateName] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<ServiceChecklistSectionDef[]>(isNew ? [emptySection()] : []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    fetchServiceTemplate(templateId).then((tpl: ServiceTemplate) => {
      if (cancelled) return;
      setTemplateName(tpl.templateName);
      setDescription(tpl.description);
      setSections(tpl.sections);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isNew, templateId]);

  const updateSection = (idx: number, patch: Partial<ServiceChecklistSectionDef>) =>
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const updateGroup = (sIdx: number, gIdx: number, patch: Partial<ServiceChecklistGroupDef>) =>
    setSections((prev) => prev.map((s, i) => (i !== sIdx ? s : { ...s, groups: s.groups.map((g, j) => (j === gIdx ? { ...g, ...patch } : g)) })));
  const updateItem = (sIdx: number, gIdx: number, iIdx: number, patch: Partial<ServiceChecklistItemDef>) =>
    setSections((prev) => prev.map((s, i) => (i !== sIdx ? s : {
      ...s, groups: s.groups.map((g, j) => (j !== gIdx ? g : { ...g, items: g.items.map((it, k) => (k === iIdx ? { ...it, ...patch } : it)) })),
    })));

  const handleSave = async () => {
    if (!templateName.trim()) { showToast(t("serviceTemplates.toast.nameRequired")); return; }
    setSaving(true);
    try {
      if (isNew) {
        await createServiceTemplate({ templateName, description, sections });
        showToast(t("serviceTemplates.toast.created"));
      } else {
        await updateServiceTemplate(templateId, { templateName, description, sections });
        showToast(t("serviceTemplates.toast.updated"));
      }
      onBack();
    } catch {
      showToast(t("serviceTemplates.toast.actionFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex-1 p-8 flex justify-center"><div className="h-10 w-10 rounded-full border-2 border-[#c9a84c] border-t-transparent animate-spin" /></div>;
  }

  const inputClass = "h-9 w-full px-3 text-sm bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60";

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
          {isNew ? t("serviceTemplates.addNew") : t("serviceTemplates.editTitle")}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all">{t("serviceTemplates.cancel")}</button>
          {canEdit && (
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60">
              {saving ? t("service.saving") : t("serviceTemplates.save")}
            </button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label className="text-xs font-medium text-muted-foreground mb-1 block">{t("serviceTemplates.form.name")}</label>
          <input value={templateName} disabled={!canEdit} onChange={(e) => setTemplateName(e.target.value)} className={inputClass} />
        </div>
        <div><label className="text-xs font-medium text-muted-foreground mb-1 block">{t("serviceTemplates.form.description")}</label>
          <input value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="space-y-3">
        {sections.map((section, sIdx) => (
          <div key={section.key} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-muted/30 flex items-center gap-2 flex-wrap">
              <input
                value={section.title} disabled={!canEdit} placeholder={t("serviceTemplates.form.sectionTitle")}
                onChange={(e) => updateSection(sIdx, { title: e.target.value })}
                className="flex-1 min-w-[180px] h-8 px-2.5 text-sm font-semibold bg-transparent border border-transparent hover:border-border focus:border-[#c9a84c]/50 rounded-lg outline-none transition-colors"
              />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={section.isOptionalAddon} disabled={!canEdit} onChange={(e) => updateSection(sIdx, { isOptionalAddon: e.target.checked })} />
                {t("serviceTemplates.form.isOptionalAddon")}
              </label>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setSections((prev) => moveItem(prev, sIdx, -1))} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/60"><ArrowUp size={13} /></button>
                  <button onClick={() => setSections((prev) => moveItem(prev, sIdx, 1))} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/60"><ArrowDown size={13} /></button>
                  <button onClick={() => setSections((prev) => [...prev, { ...section, key: newLocalKey("section"), title: `${section.title} (สำเนา)` }])} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/60"><Copy size={13} /></button>
                  <button onClick={() => setSections((prev) => prev.filter((_, i) => i !== sIdx))} className="p-1.5 text-[#e05252] hover:bg-[#e05252]/10 rounded-lg"><Trash2 size={13} /></button>
                </div>
              )}
            </div>
            <div className="p-4 space-y-3">
              {section.groups.map((group, gIdx) => (
                <div key={group.key} className="border border-border/60 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      value={group.title} disabled={!canEdit} placeholder={t("serviceTemplates.form.groupTitle")}
                      onChange={(e) => updateGroup(sIdx, gIdx, { title: e.target.value })}
                      className="flex-1 min-w-[160px] h-8 px-2.5 text-xs font-semibold uppercase tracking-wide bg-transparent border border-transparent hover:border-border focus:border-[#c9a84c]/50 rounded-lg outline-none transition-colors"
                    />
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateSection(sIdx, { groups: moveItem(section.groups, gIdx, -1) })} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary/60"><ArrowUp size={12} /></button>
                        <button onClick={() => updateSection(sIdx, { groups: moveItem(section.groups, gIdx, 1) })} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary/60"><ArrowDown size={12} /></button>
                        <button onClick={() => updateSection(sIdx, { groups: [...section.groups, { ...group, key: newLocalKey("group") }] })} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary/60"><Copy size={12} /></button>
                        <button onClick={() => updateSection(sIdx, { groups: section.groups.filter((_, j) => j !== gIdx) })} className="p-1 text-[#e05252] hover:bg-[#e05252]/10 rounded"><Trash2 size={12} /></button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((item, iIdx) => (
                      <div key={item.key} className="flex items-center gap-2">
                        <input
                          value={item.label} disabled={!canEdit} placeholder={t("serviceTemplates.form.itemLabel")}
                          onChange={(e) => updateItem(sIdx, gIdx, iIdx, { label: e.target.value })}
                          className="flex-1 h-8 px-2.5 text-xs bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
                        />
                        <select
                          value={item.kind} disabled={!canEdit}
                          onChange={(e) => updateItem(sIdx, gIdx, iIdx, { kind: e.target.value as ServiceChecklistItemKind })}
                          className="h-8 text-xs bg-secondary border border-border rounded-lg px-2 outline-none focus:border-[#c9a84c]/50 transition-colors"
                        >
                          <option value="normalAbnormal">{t("serviceTemplates.form.kindNormalAbnormal")}</option>
                          <option value="measurement">{t("serviceTemplates.form.kindMeasurement")}</option>
                        </select>
                        {canEdit && (
                          <button onClick={() => updateGroup(sIdx, gIdx, { items: group.items.filter((_, k) => k !== iIdx) })} className="p-1.5 text-[#e05252] hover:bg-[#e05252]/10 rounded-lg flex-shrink-0"><X size={13} /></button>
                        )}
                      </div>
                    ))}
                    {canEdit && (
                      <button onClick={() => updateGroup(sIdx, gIdx, { items: [...group.items, emptyItem()] })} className="text-xs text-[#c9a84c] hover:underline flex items-center gap-1 mt-1">
                        <Plus size={12} /> {t("serviceTemplates.form.addItem")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {canEdit && (
                <button onClick={() => updateSection(sIdx, { groups: [...section.groups, emptyGroup()] })} className="text-xs text-[#c9a84c] hover:underline flex items-center gap-1">
                  <Plus size={12} /> {t("serviceTemplates.form.addGroup")}
                </button>
              )}
            </div>
          </div>
        ))}
        {canEdit && (
          <button onClick={() => setSections((prev) => [...prev, emptySection()])} className="flex items-center gap-2 px-4 py-2 text-sm border border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all w-full justify-center">
            <Plus size={14} /> {t("serviceTemplates.form.addSection")}
          </button>
        )}
      </div>
    </div>
  );
}
