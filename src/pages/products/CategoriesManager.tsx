import { useState } from "react";
import { ChevronLeft, Plus, Pencil, Archive, ArchiveRestore, Tags } from "lucide-react";
import type { ProductCategory } from "../../lib/products";
import { createCategory, updateCategory } from "../../lib/products";
import { StatusBadge } from "../../components/StatusBadge";
import { ListPageHeader, ListCard } from "../../components/ui/ListPage";
import { btn, field, surface, table } from "../../components/ui/styles";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";

/**
 * หน้าจัดการหมวดหมู่สินค้า: เพิ่ม แก้ไขชื่อ และเก็บ/เลิกเก็บถาวร (ดีไซน์ใหม่ 2026-09-30 — ตารางเดียว
 * เพิ่ม/แก้ชื่อในแถว)
 *
 * **2026-09-09 — ใช้ได้สองแบบ** ตามที่เจ้าของขอให้ "จัดการหมวดหมู่สินค้าได้ด้วย":
 *   1. เป็นหน้าย่อยของหน้าสินค้า (ส่ง `onBack` มา) — มีลิงก์ย้อนกลับเหนือหัวหน้า
 *   2. เป็น **เมนูของตัวเองในกลุ่มคลังสินค้า** (ไม่ส่ง `onBack`) — สโตร์เข้าถึงได้โดยไม่ต้องผ่าน
 *      หน้าสินค้า ซึ่งเป็นหน้าของฝ่ายอื่นและต้องมีสิทธิ์คนละชุด
 * ทั้งสองแบบหน้าตาเดียวกันแล้ว (เดิมหน้าย่อยกับหน้าเดี่ยวต่างกัน)
 *
 * `canManage` สะท้อนสิทธิ์จริงฝั่งเซิร์ฟเวอร์ (`products:create` ตอนสร้าง / `products:edit` ตอนแก้)
 * — คนที่ดูได้อย่างเดียวจะเห็นรายการแต่ไม่มีปุ่ม ดีกว่าให้กดแล้วได้ 403
 */
export function CategoriesManager({
  currentUserId,
  categories,
  products = [],
  onChange,
  onBack,
  canManage = true,
}: {
  currentUserId: string;
  categories: ProductCategory[];
  /** ใช้นับว่าหมวดไหนมีสินค้าอยู่กี่ตัว — ไม่ส่งมาก็ได้ (หน้าย่อยของหน้าสินค้าส่งมาเสมอ) */
  products?: { categoryId: string; archived: boolean }[];
  onChange: (categories: ProductCategory[]) => void;
  /** ไม่ส่ง = เป็นหน้าเดี่ยว ไม่มีปุ่มย้อนกลับ */
  onBack?: () => void;
  canManage?: boolean;
}) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  // ปุ่มเพิ่มและไอคอนท้ายแถวมีเฉพาะผู้มีสิทธิ์จัดการ — ทัวร์ข้ามขั้นที่หาไม่เจอเอง
  const tourSteps: TourStep[] = [
    { element: '[data-tour="categories-add"]', manual: "ch21-2", popover: { title: t("tour.categories.add.title"), description: t("tour.categories.add.desc"), side: "bottom" } },
    { element: '[data-tour="categories-list"]', manual: "ch21-2", popover: { title: t("tour.categories.list.title"), description: t("tour.categories.list.desc"), side: "top" } },
    { element: '[data-tour="categories-row-actions"]', manual: "ch21-2", popover: { title: t("tour.categories.actions.title"), description: t("tour.categories.actions.desc"), side: "left" } },
    { element: '[data-tour="categories-summary"]', manual: "ch21-2", popover: { title: t("tour.categories.archived.title"), description: t("tour.categories.archived.desc"), side: "bottom" } },
  ];
  const tour = useModuleTour("productCategories", currentUserId, tourSteps);

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
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("products.categories.createError"));
    }
  };

  const startEdit = (c: ProductCategory) => { setEditingId(c.id); setEditingName(c.name); setError(""); };
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
  const showCount = products.length > 0;
  const activeCount = categories.filter((c) => !c.archived).length;
  const cols = `grid-cols-[minmax(0,1fr)_auto] ${showCount ? "sm:grid-cols-[minmax(0,1fr)_160px_160px_96px]" : "sm:grid-cols-[minmax(0,1fr)_160px_96px]"}`;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      {onBack && (
        <button type="button" onClick={onBack} className={`${btn.text} self-start -mb-2`}>
          <ChevronLeft size={16} /> {t("products.pageTitle")}
        </button>
      )}
      <ListPageHeader
        module={t("nav.group.inventory")}
        title={t("nav.productCategories")}
        description={t("products.categories.pageSubtitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={canManage && (
          <button type="button" data-tour="categories-add" onClick={() => { setAdding(true); setError(""); }} className={btn.primary}>
            <Plus size={16} /> {t("products.categories.addNewTitle")}
          </button>
        )}
      />

      <div data-tour="categories-list">
      <ListCard>
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[#eef1f6]">
          <h2 className={surface.cardTitle}>{t("products.categories.listTitle")}</h2>
          <span className="flex-1" />
          <span data-tour="categories-summary" className="text-[13px] text-muted-foreground">
            {t("products.categories.countSummary").replace("{active}", String(activeCount)).replace("{archived}", String(categories.length - activeCount))}
          </span>
        </div>

        <div className={`grid ${cols} items-center gap-x-3 px-5 ${table.head}`}>
          <span>{t("products.categories.col.name")}</span>
          {showCount && <span className="hidden sm:block text-right pr-10">{t("products.categories.col.count")}</span>}
          <span className="hidden sm:block">{t("products.col.status")}</span>
          <span />
        </div>

        {canManage && adding && (
          <form
            onSubmit={(e) => { e.preventDefault(); void addCategory(); }}
            className="flex items-end gap-2.5 flex-wrap px-5 py-3 bg-[#f8f9fc] border-b border-border"
          >
            <label className="flex flex-col gap-1 min-w-0 flex-1 sm:flex-none">
              <span className={field.label}>{t("products.categories.addNewTitle")} <span className="text-[#b93636]">*</span></span>
              <input
                autoFocus
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setAdding(false); } }}
                placeholder={t("products.categories.namePlaceholder")}
                aria-invalid={!!error}
                className={`${field.cell} w-full sm:w-[420px]`}
              />
            </label>
            <span className="flex gap-2">
              <button type="button" onClick={() => { setAdding(false); setNewName(""); setError(""); }} className={btn.secondarySm}>{t("common.cancel")}</button>
              <button type="submit" className={btn.secondarySm}><Plus size={15} /> {t("common.add")}</button>
            </span>
          </form>
        )}

        {error && <p role="alert" className={`${field.error} px-5 py-2.5 border-b border-[#eef1f6] bg-[#fcebeb]`}>{error}</p>}

        {categories.length === 0 && (
          <div className="py-14 px-6 flex flex-col items-center gap-2 text-center">
            <Tags size={22} className="text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t("products.categories.empty")}</p>
          </div>
        )}
        {categories.map((c, i) => (
          <div key={c.id} className={`grid ${cols} items-center gap-x-3 px-5 min-h-14 py-2 border-b border-[#eef1f6] last:border-b-0 bg-white hover:bg-[#f8f9fc] transition-colors`}>
            <span className="min-w-0 flex items-center">
              {editingId === c.id ? (
                <form onSubmit={(e) => { e.preventDefault(); void saveEdit(); }} className="flex items-center gap-2 flex-wrap min-w-0">
                  <input
                    autoFocus
                    aria-label={`${t("products.categories.editNameTitle")} ${c.name}`}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditingId(null); } }}
                    className={`${field.cell} w-full sm:w-[360px]`}
                  />
                  <button type="button" onClick={() => setEditingId(null)} className={btn.secondarySm}>{t("common.cancel")}</button>
                  <button type="submit" className={btn.secondarySm}>{t("common.save")}</button>
                </form>
              ) : (
                <span className={`text-sm font-medium truncate ${c.archived ? "text-muted-foreground" : "text-foreground"}`}>{c.name}</span>
              )}
            </span>
            {showCount && (
              <span className="hidden sm:block text-right pr-10 text-sm text-[#3d5173] tabular-nums">
                {t("products.categories.productCount").replace("{n}", activeProductCount(c.id).toLocaleString())}
              </span>
            )}
            <span className="hidden sm:block">
              <StatusBadge status={c.archived ? "archived" : "active"} label={c.archived ? t("common.status.archived") : t("common.status.active")} />
            </span>
            <span data-tour={i === 0 && canManage ? "categories-row-actions" : undefined} className="flex justify-end gap-1">
              {canManage && editingId !== c.id && (
                <>
                  <button type="button" onClick={() => startEdit(c)} title={t("products.categories.editNameTitle")} aria-label={`${t("products.categories.editNameTitle")} ${c.name}`} className={btn.icon}>
                    <Pencil size={16} />
                  </button>
                  <button type="button" onClick={() => void toggleArchive(c.id)} title={c.archived ? t("common.unarchive") : t("common.archive")} aria-label={`${c.archived ? t("common.unarchive") : t("common.archive")} ${c.name}`} className={btn.icon}>
                    {c.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </ListCard>
      </div>
    </div>
  );
}
