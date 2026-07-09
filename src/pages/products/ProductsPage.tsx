import { useState } from "react";
import type { Product, ProductCategory } from "../../lib/products";
import { createProduct, updateProduct, deleteProduct } from "../../lib/products";
import { ProductList } from "./ProductList";
import { ProductForm, type ProductDraft } from "./ProductForm";
import { CategoriesManager } from "./CategoriesManager";
import { useI18n } from "../../lib/i18n";

type View = "list" | "create" | "edit" | "categories";

export function ProductsPage({
  products,
  onProductsChange,
  categories,
  onCategoriesChange,
}: {
  products: Product[];
  onProductsChange: (products: Product[]) => void;
  categories: ProductCategory[];
  onCategoriesChange: (categories: ProductCategory[]) => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingProduct = products.find((p) => p.id === editingId);

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

  const handleArchiveToggle = async (id: string) => {
    const target = products.find((p) => p.id === id);
    if (!target) return;
    const updated = await updateProduct(id, { archived: !target.archived });
    onProductsChange(products.map((p) => (p.id === id ? updated : p)));
  };

  const handleDelete = async (id: string) => {
    await deleteProduct(id);
    onProductsChange(products.filter((p) => p.id !== id));
  };

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
      onEdit={(id) => { setEditingId(id); setView("edit"); }}
      onArchiveToggle={handleArchiveToggle}
      onDelete={handleDelete}
      onDuplicate={handleDuplicate}
      onCreateNew={() => setView("create")}
      onManageCategories={() => setView("categories")}
    />
  );
}
