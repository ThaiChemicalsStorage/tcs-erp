import { useMemo, useState } from "react";
import { Search, X, Package } from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { useI18n } from "../../lib/i18n";

export function ProductPickerModal({
  open,
  products,
  categories,
  onSelect,
  onClose,
}: {
  open: boolean;
  products: Product[];
  categories: ProductCategory[];
  onSelect: (product: Product) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? t("products.categoryUnspecified");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !p.archived)
      .filter((p) => (q ? p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) : true));
  }, [products, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("quotation.lineItems.pickFromCatalog")}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>
        <div className="px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 focus-within:border-[#c9a84c]/40 transition-colors">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("products.searchPlaceholder")}
              className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Package size={20} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("products.noFilterResults")}</p>
            </div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p); onClose(); }}
                className="w-full flex items-center justify-between px-5 py-3 border-b border-border/50 hover:bg-secondary/40 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.code} · {categoryName(p.categoryId)} · {p.unit}</p>
                </div>
                <span className="text-sm font-mono text-[#c9a84c] font-semibold flex-shrink-0 ml-3">฿{p.defaultPrice.toLocaleString()}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
