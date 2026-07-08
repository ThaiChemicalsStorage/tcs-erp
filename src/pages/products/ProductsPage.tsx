import { useState } from "react";
import type { Product, ProductCategory } from "../../lib/products";
import { newId, nowIso } from "../../lib/products";
import { ProductList } from "./ProductList";
import { ProductForm, type ProductDraft } from "./ProductForm";
import { CategoriesManager } from "./CategoriesManager";

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
  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingProduct = products.find((p) => p.id === editingId);

  const handleCreate = (draft: ProductDraft) => {
    onProductsChange([
      ...products,
      { id: newId("prod"), ...draft, archived: false, createdAt: nowIso(), updatedAt: nowIso() },
    ]);
    setView("list");
  };

  const handleUpdate = (draft: ProductDraft) => {
    onProductsChange(products.map((p) => (p.id === editingId ? { ...p, ...draft, updatedAt: nowIso() } : p)));
    setView("list");
    setEditingId(null);
  };

  const handleArchiveToggle = (id: string) => {
    onProductsChange(products.map((p) => (p.id === id ? { ...p, archived: !p.archived, updatedAt: nowIso() } : p)));
  };

  const handleDelete = (id: string) => {
    onProductsChange(products.filter((p) => p.id !== id));
  };

  const handleDuplicate = (id: string) => {
    const source = products.find((p) => p.id === id);
    if (!source) return;
    let code = `${source.code}-COPY`;
    let n = 2;
    while (products.some((p) => p.code === code)) { code = `${source.code}-COPY${n}`; n++; }
    onProductsChange([
      ...products,
      { ...source, id: newId("prod"), code, name: `${source.name} (สำเนา)`, archived: false, createdAt: nowIso(), updatedAt: nowIso() },
    ]);
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
