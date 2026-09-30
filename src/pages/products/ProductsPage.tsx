import { useEffect, useState } from "react";
import type { Product, ProductCategory } from "../../lib/products";
import { createProduct, updateProduct, deleteProduct, fetchProducts, fetchCategories, resetKitRecipeCache } from "../../lib/products";
import { ProductList } from "./ProductList";
import { ProductDrawer, type ProductDraft } from "./ProductDrawer";
import { CategoriesManager } from "./CategoriesManager";
import { ProductImportDialog } from "./ProductImportDialog";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useI18n } from "../../lib/i18n";

type View = "list" | "categories";

// หน้าหลักของโมดูลสินค้า — รายการ + แผงข้อมูลสินค้าด้านขวา (สร้าง/แก้ไข) และหน้าจัดการหมวดหมู่
// Products module root page — list + right-side product drawer (create/edit), and the category-management view.
export function ProductsPage({
  products,
  onProductsChange,
  categories,
  onCategoriesChange,
  currentUserId,
  initialEditId,
  onEditIdConsumed,
  autoView,
  autoViewSeq,
  onAutoActionConsumed,
}: {
  products: Product[];
  onProductsChange: (products: Product[]) => void;
  categories: ProductCategory[];
  onCategoriesChange: (categories: ProductCategory[]) => void;
  currentUserId: string;
  initialEditId?: string | null;
  onEditIdConsumed?: () => void;
  autoView?: "create" | "categories" | null;
  autoViewSeq?: number | null;
  onAutoActionConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<View>("list");
  /** id ของสินค้าที่เปิดในแผง หรือ "new" — เก็บเป็น id เพื่อให้แผงเห็นสถานะล่าสุดหลังเก็บถาวรจากเมนู */
  const [formTarget, setFormTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [appliedEditId, setAppliedEditId] = useState<string | null>(null);
  if (initialEditId && initialEditId !== appliedEditId) {
    setAppliedEditId(initialEditId);
    if (products.some((p) => p.id === initialEditId)) {
      setView("list");
      setFormTarget(initialEditId);
    }
  }
  useEffect(() => {
    if (initialEditId) onEditIdConsumed?.();
  }, [initialEditId, onEditIdConsumed]);

  const [appliedAutoViewSeq, setAppliedAutoViewSeq] = useState<number | null>(null);
  if (autoViewSeq != null && autoViewSeq !== appliedAutoViewSeq && autoView) {
    setAppliedAutoViewSeq(autoViewSeq);
    if (autoView === "create") { setView("list"); setFormTarget("new"); } else setView(autoView);
  }
  useEffect(() => {
    if (autoViewSeq != null) onAutoActionConsumed?.();
  }, [autoViewSeq, onAutoActionConsumed]);

  const drawerProduct = formTarget && formTarget !== "new" ? products.find((p) => p.id === formTarget) ?? null : null;
  const drawerOpen = formTarget === "new" || drawerProduct !== null;

  // บันทึกจากแผง — สร้างสินค้าใหม่หรืออัปเดตตัวที่เปิดอยู่ แล้วปิดแผงเมื่อสำเร็จ
  // Saves from the drawer — creates a new product or updates the open one, closing the drawer on success.
  const handleSave = async (draft: ProductDraft): Promise<string | null> => {
    try {
      if (formTarget === "new") {
        const created = await createProduct(draft.kitComponents.length > 0 ? draft : { ...draft, kitComponents: undefined });
        if (draft.kitComponents.length > 0) resetKitRecipeCache();
        onProductsChange([...products, created]);
      } else if (formTarget) {
        const updated = await updateProduct(formTarget, draft);
        resetKitRecipeCache(); // สูตรชุดอาจเปลี่ยน — เอกสารที่เปิดต่อจากนี้โหลดสูตรใหม่
        onProductsChange(products.map((p) => (p.id === formTarget ? updated : p)));
      }
      setFormTarget(null);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t(formTarget === "new" ? "products.createError" : "products.saveError");
    }
  };

  // สลับสถานะเก็บถาวร/เลิกเก็บถาวรของสินค้าตาม id
  // Toggles the archived/unarchived state of the product by id.
  const handleArchiveToggle = async (id: string) => {
    const target = products.find((p) => p.id === id);
    if (!target) return;
    const updated = await updateProduct(id, { archived: !target.archived });
    onProductsChange(products.map((p) => (p.id === id ? updated : p)));
  };

  // ลบสินค้าตาม id แล้วนำออกจากรายการในหน้าจอ
  // Deletes the product by id and removes it from the on-screen list.
  const handleDelete = async (id: string) => {
    await deleteProduct(id);
    onProductsChange(products.filter((p) => p.id !== id));
  };

  // ทำสำเนาสินค้า โดยตั้งรหัสใหม่ให้ไม่ซ้ำกับที่มีอยู่ (เติม -COPY, -COPY2, ...)
  // Duplicates a product, generating a unique code by appending -COPY, -COPY2, etc.
  const handleDuplicate = async (id: string) => {
    const source = products.find((p) => p.id === id);
    if (!source) return;
    let code = `${source.code}-COPY`;
    let n = 2;
    while (products.some((p) => p.code === code)) { code = `${source.code}-COPY${n}`; n++; }
    const created = await createProduct({
      code, name: `${source.name}${t("products.copySuffix")}`, categoryId: source.categoryId, unit: source.unit,
      defaultPrice: source.defaultPrice, description: source.description, specifications: source.specifications,
    });
    onProductsChange([...products, created]);
  };

  if (view === "categories") {
    return <CategoriesManager categories={categories} products={products} onChange={onCategoriesChange} onBack={() => setView("list")} />;
  }

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? t("products.categoryUnspecified");

  return (
    <>
      <ProductList
        products={products}
        categories={categories}
        currentUserId={currentUserId}
        onOpen={setFormTarget}
        onCreateNew={() => setFormTarget("new")}
        onManageCategories={() => setView("categories")}
        onImport={() => setImportOpen(true)}
      />
      {drawerOpen && (
        <ProductDrawer
          key={formTarget ?? ""}
          product={drawerProduct}
          categories={categories}
          existingCodes={products.filter((p) => p.id !== drawerProduct?.id).map((p) => p.code)}
          allProducts={products}
          locked={deleteTarget !== null}
          onSave={handleSave}
          onClose={() => setFormTarget(null)}
          onDuplicate={(p) => { setFormTarget(null); void handleDuplicate(p.id); }}
          onArchiveToggle={(p) => { if (!p.archived) setFormTarget(null); void handleArchiveToggle(p.id); }}
          onDelete={setDeleteTarget}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("products.deleteConfirmTitle")}
        message={t("products.deleteConfirmMessage")}
        confirmLabel={t("products.deletePermanently")}
        danger
        summary={deleteTarget && (
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-[13px] font-medium text-[#3d5173] flex-shrink-0">{deleteTarget.code}</span>
            <span className="font-medium text-foreground truncate">{deleteTarget.name}</span>
            <span className="text-muted-foreground truncate">{categoryName(deleteTarget.categoryId)}</span>
          </span>
        )}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) { void handleDelete(deleteTarget.id); setFormTarget(null); }
          setDeleteTarget(null);
        }}
      />
      {importOpen && (
        <ProductImportDialog
          products={products}
          categories={categories}
          onClose={() => setImportOpen(false)}
          // ดึงทั้งสองรายการใหม่หลังนำเข้า — การนำเข้าสร้างได้ทั้งสินค้าและหมวดหมู่ และง่ายกว่าเดา
          // ว่ามีอะไรถูกสร้างบ้าง (กติกาเดียวกับปุ่มนำเข้าของทะเบียนรหัส)
          onImported={async () => {
            const [nextProducts, nextCategories] = await Promise.all([fetchProducts(), fetchCategories()]);
            onProductsChange(nextProducts);
            onCategoriesChange(nextCategories);
          }}
        />
      )}
    </>
  );
}
