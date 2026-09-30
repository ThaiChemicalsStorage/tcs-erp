import { useEffect, useState } from "react";
import { Plus, Copy, Archive, ArchiveRestore, Trash2, ArrowUp, ArrowDown, X, ChevronDown, ChevronRight, ArrowLeft, Save, Info } from "lucide-react";
import {
  type ServiceTemplateSummary, type ServiceTemplate, type ServiceChecklistSectionDef, type ServiceChecklistGroupDef,
  type ServiceChecklistItemDef, type ServiceChecklistItemKind,
  fetchServiceTemplates, fetchServiceTemplate, createServiceTemplate, updateServiceTemplate,
  duplicateServiceTemplate, setServiceTemplateArchived,
} from "../../lib/serviceTemplates";
import type { DriveStep } from "driver.js";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../hooks/useToast";
import { Toast } from "../../components/Toast";
import { useI18n } from "../../lib/i18n";
import { formatQuoteDateThai } from "../../lib/quotes";
import { ListPageHeader, ListCard, ListTabs, ListEmpty } from "../../components/ui/ListPage";
import { DocumentColumns, RailTotalCard } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { Field } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field, table } from "../../components/ui/styles";

// ต่อท้ายชื่อตอนทำสำเนา — เป็นข้อมูลที่บันทึกลงชื่อ Template/หมวด (ไม่ใช่ข้อความบนจอ) จึงคงภาษาไทยเสมอเหมือนเดิม
const COPY_SUFFIX = " (สำเนา)";

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

type ListTab = "current" | "archived";

// จัดการ Template รายการตรวจเช็คสำหรับโมดูลบริการ — ดีไซน์ใหม่ (บอร์ด ServiceTemplates / ServiceTemplateEditor):
// รายการแบบแท็บ ใช้งานอยู่/เก็บถาวร (ทั้งแถวกดเปิด) + หน้าแก้ไขที่หมวดพับได้ · ทำสำเนา/เก็บถาวรย้ายไปอยู่ในเมนู "เพิ่มเติม" ของหน้าแก้ไข
// Service Checklist Template management — tabbed list (current/archived, whole row opens) + an editor with
// collapsible sections; duplicate/archive live in the editor's "More" menu instead of on each list row.
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
  const [tab, setTab] = useState<ListTab>("current");
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

  const current = templates.filter((tp) => !tp.isDeleted);
  const archived = templates.filter((tp) => tp.isDeleted);
  const visible = tab === "archived" ? archived : current;

  if (editingId !== null) {
    return (
      <>
        <ServiceTemplateEditor
          key={editingId}
          templateId={editingId}
          canCreate={canCreate}
          canEdit={canEdit}
          canArchive={canArchive}
          onBack={() => { setEditingId(null); loadList(); }}
          showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-6 pb-8 flex flex-col gap-5">
      <ListPageHeader
        module={t("service.pageTitle")}
        title={t("serviceTemplates.pageTitle")}
        description={t("serviceTemplates.listDescription")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={canCreate && (
          <button type="button" onClick={() => setEditingId("new")} className={btn.primary}>
            <Plus size={16} /> {t("serviceTemplates.addNew")}
          </button>
        )}
      />

      <ListCard>
        <div data-tour="servicetpl-archived">
          <ListTabs<ListTab>
            ariaLabel={t("serviceTemplates.tabsAria")}
            active={tab}
            onChange={setTab}
            tabs={[
              { key: "current", label: t("serviceTemplates.tab.current"), count: current.length },
              { key: "archived", label: t("serviceTemplates.tab.archived"), count: archived.length },
            ]}
          />
        </div>
        <div data-tour="servicetpl-list">
          {loading ? (
            <div className="p-5 flex flex-col gap-2" role="status" aria-live="polite">
              <span className="sr-only">{t("service.loading")}</span>
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" aria-hidden="true" />)}
            </div>
          ) : visible.length === 0 ? (
            <ListEmpty
              title={tab === "archived" ? t("serviceTemplates.emptyArchived") : t("serviceTemplates.empty.title")}
              hint={tab === "archived" ? undefined : t("serviceTemplates.empty.description")}
              action={tab === "current" && canCreate ? (
                <button type="button" onClick={() => setEditingId("new")} className={btn.primary}><Plus size={16} /> {t("serviceTemplates.addNew")}</button>
              ) : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className={table.head}>
                    <th className={table.th}>{t("serviceTemplates.col.name")}</th>
                    <th className={`${table.th} w-[250px]`}>{t("serviceTemplates.col.code")}</th>
                    <th className={`${thRight} w-[80px]`}>{t("serviceTemplates.col.sections")}</th>
                    <th className={`${thRight} w-[90px]`}>{t("serviceTemplates.col.items")}</th>
                    <th className={`${table.th} w-[140px]`}>{t("serviceTemplates.col.status")}</th>
                    <th className={`${table.th} w-10`}><span className="sr-only">{t("serviceTemplates.openRow")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((tp) => (
                    <tr
                      key={tp.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`${t("serviceTemplates.openRow")} ${tp.templateName}`}
                      onClick={() => setEditingId(tp.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingId(tp.id); }
                      }}
                      className={`${table.row} h-16 group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                    >
                      <td className={`${table.td} max-w-0`}>
                        <span className="block text-sm font-medium text-foreground truncate" title={tp.templateName}>{tp.templateName}</span>
                      </td>
                      <td className={`${table.td} font-mono text-[13px] text-[#3d5173] whitespace-nowrap`}>{tp.templateCode}</td>
                      <td className={`${table.td} text-right text-sm text-[#3d5173] tabular-nums`}>{tp.sectionCount}</td>
                      <td className={`${table.td} text-right text-sm text-[#3d5173] tabular-nums`}>{tp.itemCount}</td>
                      <td className={table.td}><TemplateStatusBadge template={tp} /></td>
                      <td className={`${table.td} text-[#a3aec2] group-hover:text-foreground`}><ChevronRight size={16} className="ml-auto" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {!loading && visible.length > 0 && (
          <div className="px-5 py-3 border-t border-[#eef1f6] text-[13px] text-muted-foreground">
            {t("serviceTemplates.footer").replace("{n}", String(visible.length))}
          </div>
        )}
      </ListCard>
      <Toast message={toast.message} />
    </div>
  );
}

function TemplateStatusBadge({ template }: { template: { isDeleted: boolean; isActive: boolean } }) {
  const { t } = useI18n();
  if (template.isDeleted) return <StatusBadge status="archived" label={t("serviceTemplates.archived")} />;
  if (template.isActive) return <StatusBadge status="active" label={t("serviceTemplates.active")} />;
  return <StatusBadge status="inactive" label={t("serviceTemplates.inactive")} />;
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

const thRight = table.th.replace("text-left", "text-right");
const iconBtn = "w-9 h-9 rounded-lg text-[#8a97ad] hover:text-foreground hover:bg-[#f4f6fa] flex items-center justify-center transition-colors flex-shrink-0";
const iconBtnSm = "w-8 h-8 rounded-lg text-[#8a97ad] hover:text-foreground hover:bg-[#f4f6fa] flex items-center justify-center transition-colors flex-shrink-0";
const deleteBtn = "w-9 h-9 rounded-lg text-[#8a97ad] hover:text-[#b93636] hover:bg-[#fcebeb] flex items-center justify-center transition-colors flex-shrink-0";
const deleteBtnSm = "w-8 h-8 rounded-lg text-[#8a97ad] hover:text-[#b93636] hover:bg-[#fcebeb] flex items-center justify-center transition-colors flex-shrink-0";

function ServiceTemplateEditor({
  templateId, canCreate, canEdit, canArchive, onBack, showToast,
}: {
  templateId: string | "new";
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  onBack: () => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const isNew = templateId === "new";
  const [loading, setLoading] = useState(!isNew);
  const [templateName, setTemplateName] = useState("");
  const [description, setDescription] = useState("");
  // Template ใหม่เริ่มด้วยหมวดว่างหนึ่งหมวด และกางหมวดนั้นไว้ให้กรอกทันที
  const [initialSection] = useState(() => (isNew ? emptySection() : null));
  const [sections, setSections] = useState<ServiceChecklistSectionDef[]>(() => (initialSection ? [initialSection] : []));
  // ข้อมูลอ่านอย่างเดียวของ Template ที่มีอยู่แล้ว (หัวหน้า: รหัส · เวอร์ชัน · สถานะ · แก้ไขล่าสุด)
  const [meta, setMeta] = useState<Pick<ServiceTemplate, "templateCode" | "version" | "isActive" | "isDeleted" | "updatedAt"> | null>(null);
  // หมวดที่กางอยู่ (ดีไซน์ใหม่: หมวดพับได้) — เปิดหมวดแรกไว้ หมวดที่เพิ่ม/ทำสำเนาใหม่กางให้ทันที
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(initialSection ? [initialSection.key] : []));
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    fetchServiceTemplate(templateId).then((tpl: ServiceTemplate) => {
      if (cancelled) return;
      setTemplateName(tpl.templateName);
      setDescription(tpl.description);
      setSections(tpl.sections);
      setMeta({ templateCode: tpl.templateCode, version: tpl.version, isActive: tpl.isActive, isDeleted: tpl.isDeleted, updatedAt: tpl.updatedAt });
      setOpenSections(new Set(tpl.sections[0] ? [tpl.sections[0].key] : []));
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
  const openSection = (key: string) => setOpenSections((prev) => new Set(prev).add(key));
  const toggleSection = (key: string) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

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

  // ทำสำเนา/เก็บถาวร (ย้ายมาจากปุ่มท้ายแถวในรายการ) — ทำกับฉบับที่บันทึกบนเซิร์ฟเวอร์ แล้วกลับไปหน้ารายการเหมือนเดิม
  const handleDuplicate = async () => {
    if (isNew) return;
    setBusy(true);
    try {
      await duplicateServiceTemplate(templateId, `${templateName}${COPY_SUFFIX}`);
      showToast(t("serviceTemplates.toast.duplicated"));
      onBack();
    } catch {
      showToast(t("serviceTemplates.toast.actionFailed"));
      setBusy(false);
    }
  };
  const handleArchive = async () => {
    if (isNew || !meta) return;
    setBusy(true);
    try {
      await setServiceTemplateArchived(templateId, !meta.isDeleted);
      showToast(t("serviceTemplates.toast.updated"));
      onBack();
    } catch {
      showToast(t("serviceTemplates.toast.actionFailed"));
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-8 flex flex-col gap-3" role="status" aria-live="polite">
        <span className="sr-only">{t("service.loading")}</span>
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" aria-hidden="true" />)}
      </div>
    );
  }

  let itemCount = 0, naCount = 0, msCount = 0, optionalCount = 0;
  for (const s of sections) {
    if (s.isOptionalAddon) optionalCount += 1;
    for (const g of s.groups) for (const it of g.items) {
      itemCount += 1;
      if (it.kind === "measurement") msCount += 1; else naCount += 1;
    }
  }
  const itemsLabel = (n: number) => t("ui.itemCount").replace("{n}", String(n));

  return (
    <div className="doc-form flex-1 overflow-y-auto">
      <div className="sticky top-0 z-20 bg-card border-b border-border px-4 md:px-8 pt-3.5 pb-[18px] flex flex-col gap-2.5">
        <button type="button" onClick={onBack} className="self-start text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft size={14} />
          {t("serviceTemplates.backToList")}
        </button>
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-[22px] leading-snug font-semibold text-foreground truncate">
                {isNew ? t("serviceTemplates.addNew") : templateName || t("serviceTemplates.editTitle")}
              </h1>
              {meta && <TemplateStatusBadge template={meta} />}
            </div>
            {meta && (
              <span className="text-[13px] text-muted-foreground">
                <span className="font-mono">{meta.templateCode}{meta.version ? ` · v${meta.version}` : ""}</span>
                {meta.updatedAt && ` · ${t("serviceTemplates.updatedAt").replace("{date}", formatQuoteDateThai(meta.updatedAt))}`}
              </span>
            )}
          </div>
          <span className="flex-1" />
          <div className="flex items-center gap-2.5 flex-wrap">
            <button type="button" onClick={onBack} className={btn.secondary}>{t("serviceTemplates.cancel")}</button>
            {!isNew && meta && (
              <MoreMenu
                items={[
                  canCreate && { key: "duplicate", label: t("serviceTemplates.duplicate"), icon: Copy, disabled: busy, onSelect: handleDuplicate },
                  canArchive && (meta.isDeleted
                    ? { key: "restore", label: t("serviceTemplates.restore"), icon: ArchiveRestore, disabled: busy, onSelect: handleArchive }
                    : { key: "archive", label: t("serviceTemplates.archive"), icon: Archive, danger: true, disabled: busy, onSelect: handleArchive }),
                ]}
              />
            )}
            {canEdit && (
              <button type="button" onClick={handleSave} disabled={saving} className={btn.primary}>
                <Save size={16} /> {saving ? t("service.saving") : t("serviceTemplates.save")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-6 pb-10 flex flex-col gap-5">
        <DocumentColumns
          main={(
            <SectionCard title={t("serviceTemplates.section.info")}>
              <div className="flex flex-col gap-[18px]">
                <Field label={t("serviceTemplates.form.name")} required>
                  <input value={templateName} disabled={!canEdit} onChange={(e) => setTemplateName(e.target.value)} className={`${field.input} w-full`} />
                </Field>
                <Field label={t("serviceTemplates.form.description")}>
                  <textarea value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${field.textarea} w-full resize-y`} />
                </Field>
              </div>
            </SectionCard>
          )}
          rail={(
            <>
              <RailTotalCard
                label={t("serviceTemplates.rail.total")}
                amount={itemsLabel(itemCount)}
                rows={[
                  { label: t("serviceTemplates.col.sections"), value: t("serviceTemplates.rail.sectionsValue").replace("{n}", String(sections.length)).replace("{m}", String(optionalCount)) },
                  { label: t("serviceTemplates.form.kindNormalAbnormal"), value: itemsLabel(naCount) },
                  { label: t("serviceTemplates.form.kindMeasurement"), value: itemsLabel(msCount) },
                ]}
              />
              <div className="rounded-xl bg-[#e8f0fb] border border-[#b9d0f0] p-4 flex gap-2.5 text-[#16407a]">
                <Info size={18} className="flex-shrink-0 mt-0.5" />
                <span className="text-[13px] leading-relaxed">{t("serviceTemplates.rail.note")}</span>
              </div>
            </>
          )}
        />

        <div className="flex items-baseline gap-2.5 flex-wrap -mb-1.5">
          <h2 className="text-base font-semibold text-foreground">{t("serviceTemplates.sectionsHeading")}</h2>
          <span className="text-[13px] text-muted-foreground">{t("serviceTemplates.sectionsSub")}</span>
        </div>

        {sections.map((section, sIdx) => {
          const open = openSections.has(section.key);
          const sectionItems = section.groups.reduce((n, g) => n + g.items.length, 0);
          return (
            <section key={section.key} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className={`py-3 pl-3 pr-4 flex items-center gap-3 flex-wrap ${open ? "border-b border-[#eef1f6]" : ""}`}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  aria-expanded={open}
                  aria-label={t("serviceTemplates.aria.toggleSection").replace("{title}", section.title || String(sIdx + 1))}
                  className="w-9 h-9 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] flex items-center justify-center flex-shrink-0"
                >
                  <ChevronDown size={18} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
                </button>
                <span className="text-xs font-semibold text-muted-foreground flex-shrink-0">{t("serviceTemplates.sectionNo").replace("{n}", String(sIdx + 1))}</span>
                <input
                  value={section.title} disabled={!canEdit} placeholder={t("serviceTemplates.form.sectionTitle")}
                  aria-label={t("serviceTemplates.form.sectionTitle")}
                  onChange={(e) => updateSection(sIdx, { title: e.target.value })}
                  className={`${field.input} flex-1 min-w-[180px] text-[15px] font-semibold`}
                />
                <span className="text-[13px] text-muted-foreground flex-shrink-0">
                  {t("serviceTemplates.sectionCount").replace("{g}", String(section.groups.length)).replace("{n}", String(sectionItems))}
                </span>
                <label className="flex items-center gap-2 text-[13px] text-[#3d5173] flex-shrink-0 cursor-pointer">
                  <input type="checkbox" checked={section.isOptionalAddon} disabled={!canEdit} onChange={(e) => updateSection(sIdx, { isOptionalAddon: e.target.checked })} className="w-4 h-4 accent-[#0b1d3a]" />
                  {t("serviceTemplates.form.isOptionalAddon")}
                </label>
                {canEdit && (
                  <>
                    <span aria-hidden="true" className="w-px h-6 bg-border flex-shrink-0" />
                    <span className="flex gap-0.5 flex-shrink-0">
                      <button type="button" aria-label={t("serviceTemplates.aria.moveSectionUp")} title={t("serviceTemplates.aria.moveSectionUp")} onClick={() => setSections((prev) => moveItem(prev, sIdx, -1))} className={iconBtn}><ArrowUp size={16} /></button>
                      <button type="button" aria-label={t("serviceTemplates.aria.moveSectionDown")} title={t("serviceTemplates.aria.moveSectionDown")} onClick={() => setSections((prev) => moveItem(prev, sIdx, 1))} className={iconBtn}><ArrowDown size={16} /></button>
                      <button
                        type="button"
                        aria-label={t("serviceTemplates.aria.duplicateSection")}
                        title={t("serviceTemplates.aria.duplicateSection")}
                        onClick={() => {
                          const key = newLocalKey("section");
                          setSections((prev) => [...prev, { ...section, key, title: `${section.title}${COPY_SUFFIX}` }]);
                          openSection(key);
                        }}
                        className={iconBtn}
                      ><Copy size={16} /></button>
                      <button type="button" aria-label={t("serviceTemplates.aria.deleteSection")} title={t("serviceTemplates.aria.deleteSection")} onClick={() => setSections((prev) => prev.filter((_, i) => i !== sIdx))} className={deleteBtn}><Trash2 size={16} /></button>
                    </span>
                  </>
                )}
              </div>

              {open && (
                <div className="px-4 md:px-6 py-4 flex flex-col gap-3">
                  {section.groups.map((group, gIdx) => (
                    <div key={group.key} className="border border-border rounded-[10px] overflow-hidden">
                      <div className="py-2.5 pl-3.5 pr-2.5 bg-[#f8f9fc] border-b border-border flex items-center gap-2.5">
                        <span className="text-xs font-semibold text-muted-foreground flex-shrink-0">{t("serviceTemplates.groupLabel")}</span>
                        <input
                          value={group.title} disabled={!canEdit} placeholder={t("serviceTemplates.form.groupTitle")}
                          aria-label={t("serviceTemplates.form.groupTitle")}
                          onChange={(e) => updateGroup(sIdx, gIdx, { title: e.target.value })}
                          className={`${field.cell} flex-1 min-w-0 font-semibold`}
                        />
                        {canEdit && (
                          <span className="flex gap-0.5 flex-shrink-0">
                            <button type="button" aria-label={t("serviceTemplates.aria.moveGroupUp")} title={t("serviceTemplates.aria.moveGroupUp")} onClick={() => updateSection(sIdx, { groups: moveItem(section.groups, gIdx, -1) })} className={iconBtnSm}><ArrowUp size={15} /></button>
                            <button type="button" aria-label={t("serviceTemplates.aria.moveGroupDown")} title={t("serviceTemplates.aria.moveGroupDown")} onClick={() => updateSection(sIdx, { groups: moveItem(section.groups, gIdx, 1) })} className={iconBtnSm}><ArrowDown size={15} /></button>
                            <button type="button" aria-label={t("serviceTemplates.aria.duplicateGroup")} title={t("serviceTemplates.aria.duplicateGroup")} onClick={() => updateSection(sIdx, { groups: [...section.groups, { ...group, key: newLocalKey("group") }] })} className={iconBtnSm}><Copy size={15} /></button>
                            <button type="button" aria-label={t("serviceTemplates.aria.deleteGroup")} title={t("serviceTemplates.aria.deleteGroup")} onClick={() => updateSection(sIdx, { groups: section.groups.filter((_, j) => j !== gIdx) })} className={deleteBtnSm}><Trash2 size={15} /></button>
                          </span>
                        )}
                      </div>
                      <div className="hidden sm:grid grid-cols-[28px_minmax(0,1fr)_210px_36px] gap-2 items-center h-9 pl-3.5 pr-2.5 border-b border-[#eef1f6] text-[12.5px] font-semibold text-[#3d5173]">
                        <span>#</span>
                        <span>{t("serviceTemplates.form.itemLabel")}</span>
                        <span>{t("serviceTemplates.col.kind")}</span>
                        <span />
                      </div>
                      {group.items.map((item, iIdx) => (
                        <div key={item.key} className="grid grid-cols-[28px_minmax(0,1fr)_36px] sm:grid-cols-[28px_minmax(0,1fr)_210px_36px] gap-2 items-center py-1.5 pl-3.5 pr-2.5 border-b border-[#eef1f6]">
                          <span className="text-[13px] text-muted-foreground tabular-nums">{iIdx + 1}</span>
                          <input
                            value={item.label} disabled={!canEdit} placeholder={t("serviceTemplates.form.itemLabel")}
                            aria-label={t("serviceTemplates.form.itemLabel")}
                            onChange={(e) => updateItem(sIdx, gIdx, iIdx, { label: e.target.value })}
                            className={`${field.cell} min-w-0 w-full`}
                          />
                          <select
                            value={item.kind} disabled={!canEdit}
                            aria-label={t("serviceTemplates.col.kind")}
                            onChange={(e) => updateItem(sIdx, gIdx, iIdx, { kind: e.target.value as ServiceChecklistItemKind })}
                            className={`${field.cell} w-full col-start-2 sm:col-start-auto`}
                          >
                            <option value="normalAbnormal">{t("serviceTemplates.form.kindNormalAbnormal")}</option>
                            <option value="measurement">{t("serviceTemplates.form.kindMeasurement")}</option>
                          </select>
                          {canEdit ? (
                            <button type="button" aria-label={t("serviceTemplates.aria.deleteItem")} title={t("serviceTemplates.aria.deleteItem")} onClick={() => updateGroup(sIdx, gIdx, { items: group.items.filter((_, k) => k !== iIdx) })} className={`${deleteBtn} row-start-1 col-start-3 sm:row-start-auto sm:col-start-auto`}><X size={16} /></button>
                          ) : <span />}
                        </div>
                      ))}
                      {canEdit && (
                        <div className="px-2.5 py-1.5">
                          <button type="button" onClick={() => updateGroup(sIdx, gIdx, { items: [...group.items, emptyItem()] })} className="h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1a5fb4] hover:bg-[#e8f0fb] transition-colors">
                            <Plus size={15} /> {t("serviceTemplates.form.addItem")}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <button type="button" onClick={() => updateSection(sIdx, { groups: [...section.groups, emptyGroup()] })} className={`${btn.text} self-start`}>
                      <Plus size={16} /> {t("serviceTemplates.form.addGroup")}
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {canEdit && (
          <button
            type="button"
            onClick={() => {
              const s = emptySection();
              setSections((prev) => [...prev, s]);
              openSection(s.key);
            }}
            className="h-12 rounded-xl border border-dashed border-[#a3aec2] bg-white text-sm font-medium text-foreground hover:bg-[#f4f6fa] flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={16} /> {t("serviceTemplates.form.addSection")}
          </button>
        )}
      </div>
    </div>
  );
}
