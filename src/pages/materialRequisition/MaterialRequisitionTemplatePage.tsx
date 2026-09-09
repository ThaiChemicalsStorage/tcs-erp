import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X, LayoutTemplate, Pencil, Trash2, Loader2, Save, RotateCw } from "lucide-react";
import {
  type MaterialRequisitionTemplate, type MaterialRequisitionTemplateLine,
  fetchMaterialRequisitionTemplates, createMaterialRequisitionTemplate,
  updateMaterialRequisitionTemplate, deleteMaterialRequisitionTemplate,
  blankTemplateLine, MAX_TEMPLATE_LINES,
} from "../../lib/materialRequisitionTemplate";
import { MATERIAL_CATEGORY_NAMES } from "../../lib/materialRequisition";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "../../lib/products";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { EmptyState } from "../../components/EmptyState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PageHeader } from "../../components/PageHeader";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";

/**
 * หน้าทะเบียนเทมเพลตใบเบิกและใบคืนวัสดุ — เจ้าของสั่ง 2026-09-02:
 * *"เทมเพลตใบเบิกและคืนวัสดุ สร้างหน้าเพิ่มขึ้นมาเป็นเป็นหน้าเทมเพลต"*
 *
 * เทมเพลตหนึ่งตัวคือ "ชุดรายการที่ตั้งชื่อไว้" ที่หน้าใบเบิกกดเรียกมาเติมทั้งชุดได้ในคลิกเดียว
 * โครงหน้าลอกจาก `pages/vendors/VendorsPage.tsx` (รายการ + ฟอร์มในกล่อง + ยืนยันก่อนลบ) ส่วนตัวเลือก
 * สินค้าใช้ `ProductPickerModal` ตัวเดียวกับที่หน้าใบเบิกใช้ กรองด้วยหมวดวัสดุชุดเดียวกัน — คนใช้จึงเห็น
 * แคตตาล็อกหน้าตาเดิมทั้งสองที่
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

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  /** `"new"` = กำลังสร้างตัวใหม่ · object = กำลังแก้ตัวนั้น · null = ปิดฟอร์ม */
  const [editing, setEditing] = useState<MaterialRequisitionTemplate | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
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

  const openNew = () => { setEditing("new"); setDraft(EMPTY_DRAFT); };
  const openEdit = (tpl: MaterialRequisitionTemplate) => {
    setEditing(tpl);
    setDraft({ name: tpl.name, description: tpl.description, lines: tpl.lines.map((l) => ({ ...l })) });
  };

  const addProduct = (product: Product) => {
    const categoryName = categories.find((c) => c.id === product.categoryId)?.name ?? "";
    setDraft((prev) => ({ ...prev, lines: [...prev.lines, blankTemplateLine(product, categoryName)] }));
    setPickerOpen(false);
  };

  const save = async () => {
    if (!draft.name.trim()) { toast.show(t("mrTemplate.errorNameRequired")); return; }
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
      setDeleteTarget(null);
      toast.show(t("mrTemplate.deletedToast"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("mrTemplate.errorDelete"));
    } finally {
      setDeleting(false);
    }
  };

  const inputClass = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3 sm:p-6 space-y-5 max-w-5xl mx-auto">
        <PageHeader
          title={t("mrTemplate.pageTitle")}
          description={t("mrTemplate.pageSubtitle")}
          actions={canEdit ? (
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
            >
              <Plus size={15} /> {t("mrTemplate.createBtn")}
            </button>
          ) : undefined}
        />

        <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("mrTemplate.searchPlaceholder")}
            aria-label={t("mrTemplate.searchPlaceholder")}
            className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("mrTemplate.loadError")}</p>
            <button onClick={retry} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <RotateCw size={12} /> {t("materialRequisition.retry")}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={LayoutTemplate}
            title={search.trim() ? t("mrTemplate.noMatchTitle") : t("mrTemplate.emptyTitle")}
            description={search.trim() ? t("mrTemplate.noMatchDescription") : t("mrTemplate.emptyDescription")}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((tpl) => (
              <div key={tpl.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{tpl.name}</p>
                  {tpl.description.trim() !== "" && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tpl.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("mrTemplate.lineCount").replace("{n}", String(tpl.lines.length))}
                    {tpl.lines.length > 0 && <span className="ml-1.5">· {tpl.lines.slice(0, 3).map((l) => l.productName).join(", ")}{tpl.lines.length > 3 ? " …" : ""}</span>}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => openEdit(tpl)} aria-label={t("mrTemplate.edit")} title={t("mrTemplate.edit")}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setDeleteTarget(tpl)} aria-label={t("mrTemplate.delete")} title={t("mrTemplate.delete")}
                      className="p-1.5 rounded-lg text-[#e05252] hover:bg-[#e05252]/10 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editing !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-5 gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
                {editing === "new" ? t("mrTemplate.createBtn") : t("mrTemplate.edit")}
              </h2>
              <button onClick={() => setEditing(null)} aria-label={t("mrTemplate.close")} title={t("mrTemplate.close")}
                className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto">
              <div>
                <label htmlFor="mrt-name" className="text-xs text-muted-foreground block mb-1">{t("mrTemplate.field.name")}</label>
                <input id="mrt-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label htmlFor="mrt-desc" className="text-xs text-muted-foreground block mb-1">{t("mrTemplate.field.description")}</label>
                <textarea id="mrt-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className={`${inputClass} resize-y leading-relaxed`} />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{t("mrTemplate.linesTitle")}</p>
                <button
                  onClick={() => setPickerOpen(true)}
                  disabled={draft.lines.length >= MAX_TEMPLATE_LINES}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-50"
                >
                  <Plus size={13} /> {t("mrTemplate.addLine")}
                </button>
              </div>

              {draft.lines.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">{t("mrTemplate.noLines")}</p>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("mrTemplate.col.product")}</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">{t("mrTemplate.col.unit")}</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">{t("mrTemplate.col.qty")}</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.map((line, idx) => (
                        <tr key={line.id} className="border-t border-border">
                          <td className="px-3 py-2 text-foreground">
                            {line.productCode && <span className="font-mono text-muted-foreground mr-1.5">{line.productCode}</span>}
                            {line.productName}
                          </td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{line.unit || "-"}</td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min={0}
                              value={line.plannedQty ?? ""}
                              aria-label={t("mrTemplate.col.qty")}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === "" ? null : Number(raw);
                                setDraft((prev) => ({
                                  ...prev,
                                  lines: prev.lines.map((l, i) => (i === idx ? { ...l, plannedQty: Number.isFinite(next as number) ? next : null } : l)),
                                }));
                              }}
                              className="w-full text-xs text-center text-foreground bg-secondary border border-border rounded px-1.5 py-1 outline-none focus:border-[#c9a84c]/50"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={() => setDraft((prev) => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) }))}
                              aria-label={t("mrTemplate.removeLine")}
                              title={t("mrTemplate.removeLine")}
                              className="p-1 rounded text-[#e05252] hover:bg-[#e05252]/10 transition-colors"
                            >
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                {t("mrTemplate.cancel")}
              </button>
              <button onClick={() => void save()} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("mrTemplate.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProductPickerModal open={pickerOpen} products={products} categories={categories}
        preferCategoryNames={MATERIAL_CATEGORY_NAMES} showStock
        onSelect={addProduct} onClose={() => setPickerOpen(false)} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("mrTemplate.deleteConfirmTitle")}
        message={t("mrTemplate.deleteConfirmMessage")}
        danger
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <Toast message={toast.message} />
    </div>
  );
}
