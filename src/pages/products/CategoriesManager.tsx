import { useState } from "react";
import { ChevronRight, Plus, Pencil, Archive, ArchiveRestore, Check, X, Tags } from "lucide-react";
import type { ProductCategory } from "../../lib/products";
import { createCategory, updateCategory } from "../../lib/products";
import { useI18n } from "../../lib/i18n";

export function CategoriesManager({
  categories,
  onChange,
  onBack,
}: {
  categories: ProductCategory[];
  onChange: (categories: ProductCategory[]) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

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

  const toggleArchive = async (id: string) => {
    const target = categories.find((c) => c.id === id);
    if (!target) return;
    const updated = await updateCategory(id, { archived: !target.archived });
    onChange(categories.map((c) => (c.id === id ? updated : c)));
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("products.breadcrumb")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-medium" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("products.manageCategories")}</span>
      </div>

      <div className="p-6 max-w-2xl mx-auto space-y-5">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            <Tags size={13} /> {t("products.categories.addNewTitle")}
          </p>
          <div className="flex items-center gap-2">
            <input
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

        <div className="bg-card border border-border rounded-xl overflow-hidden">
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
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm text-foreground font-medium">{c.name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      c.archived ? "bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20" : "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20"
                    }`}>
                      {c.archived ? t("common.status.archived") : t("common.status.active")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(c)} title={t("products.categories.editNameTitle")} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => toggleArchive(c.id)} title={c.archived ? t("common.unarchive") : t("common.archive")} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                      {c.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
