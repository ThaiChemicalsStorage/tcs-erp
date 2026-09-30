import { useEffect, useMemo, useState } from "react";
import { Plus, X, Trash2, Loader2, RotateCw, ChevronRight } from "lucide-react";
import {
  type MaterialRequisitionTemplate, type MaterialRequisitionTemplateLine,
  fetchMaterialRequisitionTemplates, createMaterialRequisitionTemplate,
  updateMaterialRequisitionTemplate, deleteMaterialRequisitionTemplate,
  blankTemplateLine, MAX_TEMPLATE_LINES,
} from "../../lib/materialRequisitionTemplate";
import { MATERIAL_CATEGORY_NAMES } from "../../lib/materialRequisition";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "../../lib/products";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Toast } from "../../components/Toast";
import { ListCard, ListEmpty, ListPageHeader, ListPagination, ListToolbar } from "../../components/ui/ListPage";
import { Drawer } from "../../components/ui/Overlays";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { Field } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { paginate, rowOpenProps, rowRemoveBtn } from "../project/projectUi";

/**
 * หน้าทะเบียนเทมเพลตใบเบิกและใบคืนวัสดุ — เจ้าของสั่ง 2026-09-02:
 * *"เทมเพลตใบเบิกและคืนวัสดุ สร้างหน้าเพิ่มขึ้นมาเป็นเป็นหน้าเทมเพลต"*
 *
 * เทมเพลตหนึ่งตัวคือ "ชุดรายการที่ตั้งชื่อไว้" ที่หน้าใบเบิกกดเรียกมาเติมทั้งชุดได้ในคลิกเดียว
 * ดีไซน์ใหม่ 2026-09-30: รายการเป็นตาราง (ทั้งแถวกดเปิด) · ฟอร์มแก้ไขย้ายจากกล่องกลางจอมาเป็นแผงด้านข้าง (Drawer)
 * ลบเทมเพลตอยู่ในเมนู "เพิ่มเติม" ท้ายแผง · ตัวเลือกสินค้าติ๊กได้หลายรายการ (`ProductPickerModal` โหมด multiSelect)
 *
 * **สิทธิ์**: ไม่มีสิทธิ์ชุดใหม่ ดูได้ด้วย `materialRequisition:view` แก้ทะเบียนด้วย
 * `materialRequisition:edit` — เหตุผลอยู่ใน `api/_lib/materialRequisitionTemplateHandler.ts`
 */

type Draft = { name: string; description: string; lines: MaterialRequisitionTemplateLine[] };

const EMPTY_DRAFT: Draft = { name: "", description: "", lines: [] };

export function MaterialRequisitionTemplatePage({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const toast = useToast();

  const [templates, setTemplates] = useState<MaterialRequisitionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  /** `"new"` = กำลังสร้างตัวใหม่ · object = กำลังแก้ตัวนั้น · null = ปิดแผง */
  const [editing, setEditing] = useState<MaterialRequisitionTemplate | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MaterialRequisitionTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchList = () => fetchMaterialRequisitionTemplates()
    .then((list) => { setTemplates(list); setLoading(false); })
    .catch(() => { setLoadError(true); setLoading(false); });
  // แยก `retry` ออกจาก `fetchList` เพราะการตั้ง loading/error ตรง ๆ ใน effect นับเป็น setState
  // แบบซิงโครนัส ซึ่ง lint ห้ามไว้ (ทำให้เรนเดอร์ซ้อนกัน) — ตอนเปิดหน้า ค่าเริ่มต้นถูกอยู่แล้ว
  const retry = () => { setLoading(true); setLoadError(false); void fetchList(); };
  useEffect(() => { void fetchList(); }, []);

  // แคตตาล็อกโหลดแบบ best-effort — ถ้าล้ม ยังดู/ลบเทมเพลตเดิมได้ แค่เพิ่มรายการใหม่ไม่ได้
  useEffect(() => {
    fetchProducts().then(setProducts).catch(() => setProducts([]));
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((tpl) =>
      tpl.name.toLowerCase().includes(q)
      || tpl.description.toLowerCase().includes(q)
      || tpl.lines.some((l) => l.productName.toLowerCase().includes(q) || l.productCode.toLowerCase().includes(q)));
  }, [templates, search]);
  const paged = paginate(filtered, page);

  const openNew = () => { setEditing("new"); setDraft(EMPTY_DRAFT); setNameError(false); };
  const openEdit = (tpl: MaterialRequisitionTemplate) => {
    setEditing(tpl);
    setDraft({ name: tpl.name, description: tpl.description, lines: tpl.lines.map((l) => ({ ...l })) });
    setNameError(false);
  };

  /** เพิ่มหลายตัวจากตัวเลือกสินค้าทีเดียว — ตัดส่วนที่เกินเพดานรายการต่อเทมเพลตทิ้งพร้อมบอก */
  const addProducts = (picked: Product[]) => {
    const room = Math.max(0, MAX_TEMPLATE_LINES - draft.lines.length);
    const accepted = picked.slice(0, room);
    const categoryName = (p: Product) => categories.find((c) => c.id === p.categoryId)?.name ?? "";
    setDraft((prev) => ({ ...prev, lines: [...prev.lines, ...accepted.map((p) => blankTemplateLine(p, categoryName(p)))] }));
    if (accepted.length < picked.length) toast.show(t("mrTemplate.lineLimitReached").replace("{n}", String(MAX_TEMPLATE_LINES)));
  };

  const save = async () => {
    if (!draft.name.trim()) { setNameError(true); toast.show(t("mrTemplate.errorNameRequired")); return; }
    setSaving(true);
    try {
      const saved = editing === "new" || editing === null
        ? await createMaterialRequisitionTemplate(draft)
        : await updateMaterialRequisitionTemplate(editing.id, draft);
      setTemplates((prev) => prev.some((x) => x.id === saved.id) ? prev.map((x) => (x.id === saved.id ? saved : x)) : [...prev, saved]);
      setEditing(null);
      toast.show(t("mrTemplate.savedToast"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("mrTemplate.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMaterialRequisitionTemplate(deleteTarget.id);
      setTemplates((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      if (editing !== null && editing !== "new" && editing.id === deleteTarget.id) setEditing(null);
      setDeleteTarget(null);
      toast.show(t("mrTemplate.deletedToast"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("mrTemplate.errorDelete"));
    } finally {
      setDeleting(false);
    }
  };

  const preview = (tpl: MaterialRequisitionTemplate) =>
    `${tpl.lines.slice(0, 3).map((l) => l.productName).join(", ")}${tpl.lines.length > 3 ? " …" : ""}`;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.project")}
        title={t("mrTemplate.pageTitle")}
        description={t("mrTemplate.pageSubtitle")}
        actions={canEdit ? (
          <button type="button" onClick={openNew} className={btn.primary}>
            <Plus size={16} /> {t("mrTemplate.createBtn")}
          </button>
        ) : undefined}
      />

      <ListCard>
        <ListToolbar
          search={search}
          onSearch={(v) => { setSearch(v); setPage(1); }}
          searchPlaceholder={t("mrTemplate.searchPlaceholder")}
          count={loading || loadError ? undefined : t("mrTemplate.templateCount").replace("{n}", String(filtered.length))}
        />
        {loading ? (
          <div className="px-5 py-4 space-y-2" role="status" aria-live="polite">
            {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" aria-hidden="true" />)}
          </div>
        ) : loadError ? (
          <ListEmpty
            title={t("mrTemplate.loadError")}
            action={<button type="button" onClick={retry} className={btn.secondary}><RotateCw size={16} /> {t("materialRequisition.retry")}</button>}
          />
        ) : filtered.length === 0 ? (
          <ListEmpty
            title={search.trim() ? t("mrTemplate.noMatchTitle") : t("mrTemplate.emptyTitle")}
            hint={search.trim() ? t("mrTemplate.noMatchDescription") : t("mrTemplate.emptyDescription")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className={table.head}>
                  <th className={`${table.th} w-[340px]`}>{t("mrTemplate.col.name")}</th>
                  <th className={table.th}>{t("mrTemplate.linesTitle")}</th>
                  <th className={`${table.th} text-right`}>{t("mrTemplate.col.count")}</th>
                  <th className={`${table.th} w-10`} aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((tpl) => {
                  const cells = (
                    <>
                      <td className={`${table.td} max-w-[340px]`}>
                        <span className="block text-sm font-semibold text-foreground truncate">{tpl.name}</span>
                        {tpl.description.trim() !== "" && <span className="block text-xs text-muted-foreground truncate">{tpl.description}</span>}
                      </td>
                      <td className={`${table.td} max-w-0 w-full`}>
                        <span className="block text-sm text-[#3d5173] truncate">{preview(tpl) || "—"}</span>
                      </td>
                      <td className={`${table.td} text-right tabular-nums text-sm text-[#3d5173] whitespace-nowrap`}>{t("mrTemplate.lineCount").replace("{n}", String(tpl.lines.length))}</td>
                      <td className={table.td}>
                        {canEdit && <ChevronRight size={16} className="text-[#a3aec2] group-hover:text-foreground transition-colors ml-auto" aria-hidden="true" />}
                      </td>
                    </>
                  );
                  return canEdit ? (
                    <tr key={tpl.id} {...rowOpenProps(() => openEdit(tpl), `${t("mrTemplate.edit")} ${tpl.name}`)}
                      className={`${table.row} group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}>
                      {cells}
                    </tr>
                  ) : (
                    <tr key={tpl.id} className={table.row}>{cells}</tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !loadError && filtered.length > 0 && (
          <ListPagination page={paged.current} pageCount={paged.pageCount} from={paged.from} to={paged.to} total={filtered.length} onPage={setPage} />
        )}
      </ListCard>

      <Drawer
        open={editing !== null}
        busy={saving}
        title={editing === "new" ? t("mrTemplate.createBtn") : (draft.name.trim() || editing?.name || "")}
        subtitle={editing === "new" ? t("mrTemplate.drawerNewHint") : t("mrTemplate.drawerEditHint").replace("{n}", String(draft.lines.length))}
        // Esc ถูกดักโดยทุกกล่องที่เปิดอยู่พร้อมกัน — ขณะตัวเลือกสินค้า/กล่องยืนยันลบเปิดทับอยู่ Esc ต้องปิดแค่กล่องบน
        // ไม่ใช่ปิดแผงทิ้งไปพร้อมรายการที่ยังไม่ได้บันทึก
        onClose={() => { if (!pickerOpen && !deleteTarget) setEditing(null); }}
        footerLeft={editing !== null && editing !== "new" ? (
          <MoreMenu
            align="left"
            items={[{
              key: "delete", label: t("mrTemplate.delete"), hint: t("mrTemplate.deleteConfirmMessage"), icon: Trash2, danger: true,
              onSelect: () => setDeleteTarget(editing),
            }]}
          />
        ) : undefined}
        footerRight={
          <>
            <button type="button" onClick={() => setEditing(null)} disabled={saving} className={btn.secondary}>{t("mrTemplate.cancel")}</button>
            <button type="button" onClick={() => void save()} disabled={saving} className={btn.primary}>
              {saving && <Loader2 size={16} className="animate-spin" />} {t("mrTemplate.save")}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <Field label={t("mrTemplate.field.name")} htmlFor="mrt-name" required error={nameError ? t("mrTemplate.errorNameRequired") : undefined}>
              <input id="mrt-name" value={draft.name} aria-invalid={nameError || undefined}
                onChange={(e) => { setDraft({ ...draft, name: e.target.value }); if (e.target.value.trim()) setNameError(false); }}
                className={`${field.input} w-full`} />
            </Field>
            <Field label={t("mrTemplate.field.description")} htmlFor="mrt-desc">
              <textarea id="mrt-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className={`${field.textarea} w-full resize-y`} />
            </Field>
          </div>
          <div className="h-px bg-[#eef1f6]" />
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5">
              <h3 className="flex-1 text-[15px] font-semibold text-foreground">{t("mrTemplate.linesTitle")}</h3>
              <button type="button" onClick={() => setPickerOpen(true)} disabled={draft.lines.length >= MAX_TEMPLATE_LINES} className={btn.text}>
                <Plus size={16} /> {t("mrTemplate.addLine")}
              </button>
            </div>
            {draft.lines.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-6 text-center border border-dashed border-[#c3ccda] rounded-[10px]">{t("mrTemplate.noLines")}</p>
            ) : (
              <div className="border border-border rounded-[10px] overflow-hidden">
                <div className="grid grid-cols-[minmax(0,1fr)_56px_104px_36px] gap-2 items-center h-9 pl-3.5 pr-2 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]">
                  <span>{t("mrTemplate.col.product")}</span><span>{t("mrTemplate.col.unit")}</span><span className="text-right">{t("mrTemplate.col.qty")}</span><span />
                </div>
                {draft.lines.map((line, idx) => (
                  <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_56px_104px_36px] gap-2 items-center min-h-[52px] py-1.5 pl-3.5 pr-2 border-b border-[#eef1f6] last:border-b-0">
                    <span className="flex flex-col min-w-0 leading-snug">
                      <span className="text-sm font-medium text-foreground truncate" title={line.productName}>{line.productName}</span>
                      {line.productCode && <span className="font-mono text-xs text-muted-foreground">{line.productCode}</span>}
                    </span>
                    <span className="text-sm text-[#3d5173] truncate">{line.unit || "-"}</span>
                    <input
                      type="number"
                      min={0}
                      value={line.plannedQty ?? ""}
                      aria-label={`${t("mrTemplate.col.qty")} ${line.productName}`}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const next = raw === "" ? null : Number(raw);
                        setDraft((prev) => ({
                          ...prev,
                          lines: prev.lines.map((l, i) => (i === idx ? { ...l, plannedQty: Number.isFinite(next as number) ? next : null } : l)),
                        }));
                      }}
                      className={`${field.cell} w-full min-w-0 text-right tabular-nums`}
                    />
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) }))}
                      aria-label={`${t("mrTemplate.removeLine")} ${line.productName}`}
                      title={t("mrTemplate.removeLine")}
                      className={rowRemoveBtn}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </Drawer>

      <ProductPickerModal
        open={pickerOpen}
        products={products}
        categories={categories}
        preferCategoryNames={MATERIAL_CATEGORY_NAMES}
        showStock
        multiSelect
        subtitle={t("mrTemplate.pickerHint")}
        onSelect={(p) => addProducts([p])}
        onSelectMany={addProducts}
        onClose={() => setPickerOpen(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("mrTemplate.deleteConfirmTitle")}
        message={t("mrTemplate.deleteConfirmMessage")}
        confirmLabel={t("mrTemplate.delete")}
        danger
        busy={deleting}
        summary={deleteTarget && (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-foreground truncate">{deleteTarget.name}</span>
              {deleteTarget.description.trim() !== "" && <span className="text-[13px] text-[#3d5173] truncate">{deleteTarget.description}</span>}
            </div>
            <span className="text-[13px] text-[#3d5173] whitespace-nowrap">{t("mrTemplate.lineCount").replace("{n}", String(deleteTarget.lines.length))}</span>
          </div>
        )}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <Toast message={toast.message} />
    </div>
  );
}
