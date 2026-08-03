import { useEffect, useState } from "react";
import type { Product, ProductCategory } from "../../lib/products";
import { createProduct, updateProduct, deleteProduct } from "../../lib/products";
import { ProductList } from "./ProductList";
import { ProductForm, type ProductDraft } from "./ProductForm";
import { CategoriesManager } from "./CategoriesManager";
import { useI18n } from "../../lib/i18n";

type View = "list" | "create" | "edit" | "categories";

// หน้าหลักของโมดูลสินค้า สลับมุมมองระหว่างรายการ สร้าง/แก้ไข และจัดการหมวดหมู่
// Products module root page — switches between list, create/edit, and category-management views.
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
  const [editingId, setEditingId] = useState<string | null>(null);

  const [appliedEditId, setAppliedEditId] = useState<string | null>(null);
  if (initialEditId && initialEditId !== appliedEditId) {
    setAppliedEditId(initialEditId);
    if (products.some((p) => p.id === initialEditId)) {
      setEditingId(initialEditId);
      setView("edit");
    }
  }
  useEffect(() => {
    if (initialEditId) onEditIdConsumed?.();
  }, [initialEditId, onEditIdConsumed]);

  const [appliedAutoViewSeq, setAppliedAutoViewSeq] = useState<number | null>(null);
  if (autoViewSeq != null && autoViewSeq !== appliedAutoViewSeq && autoView) {
    setAppliedAutoViewSeq(autoViewSeq);
    setView(autoView);
  }
  useEffect(() => {
    if (autoViewSeq != null) onAutoActionConsumed?.();
  }, [autoViewSeq, onAutoActionConsumed]);

  const editingProduct = products.find((p) => p.id === editingId);

  // สร้างสินค้าใหม่แล้วอัปเดตรายการ, กลับไปหน้ารายการเมื่อสำเร็จ
  // Creates a new product, updates the list, and returns to the list view on success.
  const handleCreate = async (draft: ProductDraft): Promise<string | null> => {
    try {
      const created = await createProduct(draft);
      onProductsChange([...products, created]);
      setView("list");
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t("products.createError");
    }
  };

  // บันทึกการแก้ไขสินค้าที่กำลังเปิดอยู่แล้วกลับไปหน้ารายการ
  // Saves edits to the currently open product and returns to the list view.
  const handleUpdate = async (draft: ProductDraft): Promise<string | null> => {
    if (!editingId) return null;
    try {
      const updated = await updateProduct(editingId, draft);
      onProductsChange(products.map((p) => (p.id === editingId ? updated : p)));
      setView("list");
      setEditingId(null);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t("products.saveError");
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
    return <CategoriesManager categories={categories} onChange={onCategoriesChange} onBack={() => setView("list")} />;
  }

  if (view === "create") {
    return (
      <ProductForm
        mode="create"
        categories={categories}
        existingCodes={products.map((p) => p.code)}
        onSave={handleCreate}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "edit" && editingProduct) {
    return (
      <ProductForm
        mode="edit"
        initial={editingProduct}
        categories={categories}
        existingCodes={products.filter((p) => p.id !== editingId).map((p) => p.code)}
        onSave={handleUpdate}
        onCancel={() => { setView("list"); setEditingId(null); }}
      />
    );
  }

  return (
    <ProductList
      products={products}
      categories={categories}
      currentUserId={currentUserId}
      onEdit={(id) => { setEditingId(id); setView("edit"); }}
      onArchiveToggle={handleArchiveToggle}
      onDelete={handleDelete}
      onDuplicate={handleDuplicate}
      onCreateNew={() => setView("create")}
      onManageCategories={() => setView("categories")}
    />
  );
}
