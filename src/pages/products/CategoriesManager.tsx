import { useState } from "react";
import { ChevronRight, Plus, Pencil, Archive, ArchiveRestore, Check, X, Tags } from "lucide-react";
import type { ProductCategory } from "../../lib/products";
import { createCategory, updateCategory } from "../../lib/products";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n } from "../../lib/i18n";

/**
 * หน้าจัดการหมวดหมู่สินค้า: เพิ่ม แก้ไขชื่อ และเก็บ/เลิกเก็บถาวร
 *
 * **2026-09-09 — ใช้ได้สองแบบ** ตามที่เจ้าของขอให้ "จัดการหมวดหมู่สินค้าได้ด้วย":
 *   1. เป็นหน้าย่อยของหน้าสินค้า (ส่ง `onBack` มา) — ทางเดิมที่มีอยู่ก่อนแล้ว
 *   2. เป็น **เมนูของตัวเองในกลุ่มคลังสินค้า** (ไม่ส่ง `onBack`) — สโตร์เข้าถึงได้โดยไม่ต้องผ่าน
 *      หน้าสินค้า ซึ่งเป็นหน้าของฝ่ายอื่นและต้องมีสิทธิ์คนละชุด
 *
 * `canManage` สะท้อนสิทธิ์จริงฝั่งเซิร์ฟเวอร์ (`products:create` ตอนสร้าง / `products:edit` ตอนแก้)
 * — คนที่ดูได้อย่างเดียวจะเห็นรายการแต่ไม่มีปุ่ม ดีกว่าให้กดแล้วได้ 403
 */
export function CategoriesManager({
  categories,
  products = [],
  onChange,
  onBack,
  canManage = true,
}: {
  categories: ProductCategory[];
  /** ใช้นับว่าหมวดไหนมีสินค้าอยู่กี่ตัว — ไม่ส่งมาก็ได้ (หน้าย่อยของหน้าสินค้าส่งมาเสมอ) */
  products?: { categoryId: string; archived: boolean }[];
  onChange: (categories: ProductCategory[]) => void;
  /** ไม่ส่ง = เป็นหน้าเดี่ยว ไม่มีปุ่มย้อนกลับ */
  onBack?: () => void;
  canManage?: boolean;
}) {
  const { t } = useI18n();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // ตรวจสอบชื่อและสร้างหมวดหมู่ใหม่ ป้องกันชื่อซ้ำ
  // Validates the name and creates a new category, guarding against duplicates.
  const addCategory = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setError(t("products.categories.errorRequired"));
      return;
    }
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(t("products.categories.errorDuplicate"));
      return;
    }
    try {
      const created = await createCategory(trimmed);
      onChange([...categories, created]);
      setNewName("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("products.categories.createError"));
    }
  };

  const startEdit = (c: ProductCategory) => { setEditingId(c.id); setEditingName(c.name); };
  // บันทึกชื่อหมวดหมู่ที่แก้ไขแล้วไปยังเซิร์ฟเวอร์
  // Saves the edited category name to the server.
  const saveEdit = async () => {
    const trimmed = editingName.trim();
    if (!trimmed || !editingId) return;
    try {
      const updated = await updateCategory(editingId, { name: trimmed });
      onChange(categories.map((c) => (c.id === editingId ? updated : c)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("products.saveError"));
    }
  };

  // สลับสถานะเก็บถาวร/เลิกเก็บถาวรของหมวดหมู่ที่ระบุ
  // Toggles the archived/unarchived state of the given category.
  const toggleArchive = async (id: string) => {
    const target = categories.find((c) => c.id === id);
    if (!target) return;
    try {
      const updated = await updateCategory(id, { archived: !target.archived });
      onChange(categories.map((c) => (c.id === id ? updated : c)));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("products.saveError"));
    }
  };

  /**
   * จำนวนสินค้าที่ยังใช้งานอยู่ในหมวดนั้น — โชว์ไว้เพราะการเก็บหมวดถาวรไม่ได้แตะสินค้าในหมวดเลย
   * สินค้ายังอยู่และยังเลือกได้ตามปกติ แค่หมวดหายจากช่องเลือกหมวดเท่านั้น ตัวเลขนี้ทำให้คนกดรู้ว่า
   * กำลังเก็บหมวดที่ยังมีของอยู่กี่ตัว ก่อนจะกด
   */
  const activeProductCount = (categoryId: string) =>
    products.filter((p) => !p.archived && p.categoryId === categoryId).length;

  return (
    <div className="flex-1 overflow-y-auto">
      {onBack ? (
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight size={14} className="rotate-180" /> {t("products.breadcrumb")}
          </button>
          <ChevronRight size={13} className="text-muted-foreground" />
          <span className="text-sm text-[#c9a84c] font-medium" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("products.manageCategories")}</span>
        </div>
      ) : (
        <div className="px-6 pt-6 max-w-2xl mx-auto">
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("products.manageCategories")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("products.categories.pageSubtitle")}</p>
        </div>
      )}

      <div className="p-6 max-w-2xl mx-auto space-y-5">
        {canManage && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 id="categories-addNew-heading" className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            <Tags size={13} /> {t("products.categories.addNewTitle")}
          </h2>
          <div className="flex items-center gap-2">
            <input
              aria-labelledby="categories-addNew-heading"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              placeholder={t("products.categories.namePlaceholder")}
              className="flex-1 text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
            <button onClick={addCategory} className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              <Plus size={14} /> {t("common.add")}
            </button>
          </div>
          {error && <p className="text-xs text-[#e05252] mt-1.5">{error}</p>}
        </div>
        )}

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {categories.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t("products.categories.empty")}</p>
          )}
          {categories.map((c, i) => (
            <div key={c.id} className={`flex items-center justify-between px-5 py-3.5 ${i > 0 ? "border-t border-border" : ""}`}>
              {editingId === c.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    className="flex-1 text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
                  />
                  <button onClick={saveEdit} className="p-1.5 text-[#2aa36b] hover:bg-[#2aa36b]/10 rounded-lg transition-colors"><Check size={15} /></button>
                  <button onClick={() => setEditingId(null)} className="p-1.5 text-muted-foreground hover:bg-secondary rounded-lg transition-colors"><X size={15} /></button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm text-foreground font-medium truncate">{c.name}</span>
                    <StatusBadge
                      status={c.archived ? "archived" : "active"}
                      label={c.archived ? t("common.status.archived") : t("common.status.active")}
                    />
                    {products.length > 0 && (
                      <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {t("products.categories.productCount").replace("{n}", activeProductCount(c.id).toLocaleString())}
                      </span>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(c)} title={t("products.categories.editNameTitle")} aria-label={`${t("products.categories.editNameTitle")} ${c.name}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => toggleArchive(c.id)} title={c.archived ? t("common.unarchive") : t("common.archive")} aria-label={`${c.archived ? t("common.unarchive") : t("common.archive")} ${c.name}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                        {c.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
