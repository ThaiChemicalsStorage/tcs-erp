import { useCallback, useMemo, useState } from "react";
import {
  Plus, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Pencil, Copy, Archive, ArchiveRestore, Trash2, Tags, Package, HelpCircle, Upload,
} from "lucide-react";
import type { DriveStep } from "driver.js";
import type { Product, ProductCategory } from "../../lib/products";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useModuleTour } from "../../components/GuidedTour";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n } from "../../lib/i18n";

type SortKey = "code" | "name" | "category" | "unit" | "defaultPrice" | "status" | "updatedAt";

const PAGE_SIZE = 8;
const ALL_CATEGORIES = "all";

// จัดรูปแบบวันที่ ISO ให้เป็นรูปแบบไทยแบบสั้น
// Formats an ISO date string into a short Thai date format.
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

// หน้ารายการสินค้า พร้อมค้นหา กรองตามหมวดหมู่ เรียงลำดับ และแบ่งหน้า
// Product list page with search, category filtering, sorting, and pagination.
export function ProductList({
  products,
  categories,
  currentUserId,
  onEdit,
  onArchiveToggle,
  onDelete,
  onDuplicate,
  onCreateNew,
  onManageCategories,
  onImport,
}: {
  products: Product[];
  categories: ProductCategory[];
  currentUserId: string;
  onEdit: (id: string) => void;
  onArchiveToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onCreateNew: () => void;
  onManageCategories: () => void;
  /** เปิดกล่องนำเข้าสินค้าจากไฟล์ Excel (2026-09-04) */
  onImport: () => void;
}) {
  const { t } = useI18n();

  const tourSteps: DriveStep[] = [
    { element: '[data-tour="products-create"]', popover: { title: t("tour.products.create.title"), description: t("tour.products.create.desc"), side: "bottom" } },
    { element: '[data-tour="products-import"]', popover: { title: t("tour.products.import.title"), description: t("tour.products.import.desc"), side: "bottom" } },
    { element: '[data-tour="products-categories"]', popover: { title: t("tour.products.categories.title"), description: t("tour.products.categories.desc"), side: "bottom" } },
    { element: '[data-tour="products-toolbar"]', popover: { title: t("tour.products.toolbar.title"), description: t("tour.products.toolbar.desc"), side: "bottom" } },
    { element: '[data-tour="products-table"]', popover: { title: t("tour.products.table.title"), description: t("tour.products.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("products", currentUserId, tourSteps);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "updatedAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const categoryName = useCallback(
    (id: string) => categories.find((c) => c.id === id)?.name ?? t("products.categoryUnspecified"),
    [categories, t],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => (showArchived ? true : !p.archived))
      .filter((p) => (categoryFilter === ALL_CATEGORIES ? true : p.categoryId === categoryFilter))
      .filter((p) => (q ? p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) : true));
  }, [products, search, categoryFilter, showArchived]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort.key) {
        case "code": return a.code.localeCompare(b.code) * dir;
        case "name": return a.name.localeCompare(b.name) * dir;
        case "category": return categoryName(a.categoryId).localeCompare(categoryName(b.categoryId)) * dir;
        case "unit": return a.unit.localeCompare(b.unit) * dir;
        case "defaultPrice": return (a.defaultPrice - b.defaultPrice) * dir;
        case "status": return (Number(a.archived) - Number(b.archived)) * dir;
        case "updatedAt": return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
        default: return 0;
      }
    });
    return arr;
  }, [filtered, sort, categoryName]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  // สลับทิศทางการเรียงลำดับ หรือเปลี่ยนคอลัมน์ที่ใช้เรียง แล้วกลับไปหน้าแรก
  // Toggles sort direction or switches the sort column, resetting to page 1.
  const toggleSort = (key: SortKey) => {
    setSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "code", label: t("products.col.code") },
    { key: "name", label: t("products.col.name") },
    { key: "category", label: t("products.col.category") },
    { key: "unit", label: t("products.col.unit") },
    { key: "defaultPrice", label: t("products.col.price") },
    { key: "status", label: t("products.col.status") },
    { key: "updatedAt", label: t("products.col.updatedAt") },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("products.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("products.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={tour.start}
            title={t("tour.replay")}
            aria-label={t("tour.replay")}
            className="flex items-center justify-center w-9 h-9 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all"
          >
            <HelpCircle size={15} />
          </button>
          <button data-tour="products-import" onClick={onImport} className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all">
            <Upload size={15} /> {t("products.importFromFile")}
          </button>
          <button data-tour="products-categories" onClick={onManageCategories} className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all">
            <Tags size={15} /> {t("products.manageCategories")}
          </button>
          <button data-tour="products-create" onClick={onCreateNew} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
            <Plus size={15} /> {t("products.addNew")}
          </button>
        </div>
      </div>

      <div data-tour="products-toolbar" className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 focus-within:border-[#c9a84c]/40 transition-colors">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("products.searchPlaceholder")}
            className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none"
        >
          <option value={ALL_CATEGORIES}>{t("products.allCategories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.archived ? t("products.categoryArchivedSuffix") : ""}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground ml-auto">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }}
            className="w-4 h-4 rounded border-border accent-[#c9a84c]"
          />
          {t("products.showArchived")}
        </label>
      </div>

      <div data-tour="products-table" className="bg-card border border-border rounded-xl overflow-hidden">
        {products.length === 0 ? (
          <EmptyState icon={Package} title={t("empty.products.title")} description={t("empty.products.sub")} actionLabel={t("empty.products.action")} onAction={onCreateNew} compact />
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Package size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("products.noFilterResults")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      aria-sort={sort.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      className="px-4 py-3 text-left whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="flex items-center gap-1 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider select-none hover:text-foreground transition-colors"
                      >
                        {col.label}
                        {sort.key === col.key && (sort.dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 w-32" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors group">
                    <td className="px-4 py-3 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{p.code}</td>
                    <td className="px-4 py-3 text-sm text-foreground font-medium max-w-[240px] truncate" title={p.name}>{p.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{categoryName(p.categoryId)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.unit}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground">฿{p.defaultPrice.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={p.archived ? "archived" : "active"}
                        label={p.archived ? t("common.status.archived") : t("common.status.active")}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{fmtDate(p.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-50 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button onClick={() => onEdit(p.id)} title={t("common.edit")} aria-label={`${t("common.edit")} ${p.name}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => onDuplicate(p.id)} title={t("products.action.duplicate")} aria-label={`${t("products.action.duplicate")} ${p.name}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                          <Copy size={14} />
                        </button>
                        <button onClick={() => onArchiveToggle(p.id)} title={p.archived ? t("common.unarchive") : t("common.archive")} aria-label={`${p.archived ? t("common.unarchive") : t("common.archive")} ${p.name}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                          {p.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        </button>
                        <button onClick={() => setConfirmDeleteId(p.id)} title={t("common.delete")} aria-label={`${t("common.delete")} ${p.name}`} className="p-1.5 text-muted-foreground hover:text-[#e05252] transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground font-mono">
                {t("products.showingRange")
                  .replace("{a}", String((clampedPage - 1) * PAGE_SIZE + 1))
                  .replace("{b}", String(Math.min(clampedPage * PAGE_SIZE, sorted.length)))
                  .replace("{c}", String(sorted.length))}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={clampedPage === 1}
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 disabled:opacity-40 disabled:pointer-events-none transition-all"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-mono text-foreground px-2">{clampedPage} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={clampedPage === totalPages}
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 disabled:opacity-40 disabled:pointer-events-none transition-all"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title={t("products.deleteConfirmTitle")}
        message={t("products.deleteConfirmMessage")}
        confirmLabel={t("products.deletePermanently")}
        danger
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => { if (confirmDeleteId) onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
      />
    </div>
  );
}
