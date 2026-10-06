import { useCallback, useMemo, useState } from "react";
import { Plus, ChevronUp, ChevronDown, ChevronRight, Tags, Package, Upload, Layers } from "lucide-react";
import { type Product, type ProductCategory, isKitProduct, kitBreakdownText } from "../../lib/products";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { EmptyState } from "../../components/EmptyState";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { SelectBox } from "../../components/ui/Field";
import { btn, table } from "../../components/ui/styles";
import { useI18n } from "../../lib/i18n";
import { Tag } from "../stock/inventoryUi";
import { fmtProductDate, rowOpenProps } from "../stock/inventoryFormat";

type SortKey = "code" | "name" | "category" | "unit" | "defaultPrice" | "updatedAt";
type StatusTab = "active" | "archived";

const PAGE_SIZE = 20;
const ALL_CATEGORIES = "all";

// หน้ารายการสินค้า (ดีไซน์ใหม่ 2026-09-30) — แท็บ ใช้งาน/เก็บถาวร แทนช่องติ๊ก · ค้นหา + หมวดหมู่ ·
// คลิกหัวคอลัมน์เพื่อเรียง · ทั้งแถวกดเปิดแผงข้อมูลสินค้า (ทำสำเนา/เก็บถาวร/ลบ อยู่ในเมนูท้ายแผง)
// Product list — active/archived tabs, search + category filter, sortable headers; a row opens the product drawer.
export function ProductList({
  products,
  categories,
  currentUserId,
  onOpen,
  onCreateNew,
  onManageCategories,
  onImport,
  canCreate,
}: {
  products: Product[];
  categories: ProductCategory[];
  currentUserId: string;
  onOpen: (id: string) => void;
  onCreateNew: () => void;
  onManageCategories: () => void;
  /** เปิดกล่องนำเข้าสินค้าจากไฟล์ Excel (2026-09-04) */
  onImport: () => void;
  /** ไม่มีสิทธิ์ products:create → ไม่มีปุ่มเพิ่ม/นำเข้า (2026-10-06) */
  canCreate: boolean;
}) {
  const { t } = useI18n();

  const tourSteps: TourStep[] = [
    { element: '[data-tour="products-create"]', manual: "ch21", popover: { title: t("tour.products.create.title"), description: t("tour.products.create.desc"), side: "bottom" } },
    { element: '[data-tour="products-import"]', manual: "ch21-1", popover: { title: t("tour.products.import.title"), description: t("tour.products.import.desc"), side: "bottom" } },
    { element: '[data-tour="products-categories"]', manual: "ch21-2", popover: { title: t("tour.products.categories.title"), description: t("tour.products.categories.desc"), side: "bottom" } },
    { element: '[data-tour="products-toolbar"]', manual: "ch2-6", popover: { title: t("tour.products.toolbar.title"), description: t("tour.products.toolbar.desc"), side: "bottom" } },
    { element: '[data-tour="products-table"]', manual: "ch21", popover: { title: t("tour.products.table.title"), description: t("tour.products.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("products", currentUserId, tourSteps);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "updatedAt", dir: "desc" });
  const [page, setPage] = useState(1);

  const categoryName = useCallback(
    (id: string) => categories.find((c) => c.id === id)?.name ?? t("products.categoryUnspecified"),
    [categories, t],
  );

  const counts = useMemo(() => ({
    active: products.filter((p) => !p.archived).length,
    archived: products.filter((p) => p.archived).length,
  }), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => (statusTab === "archived" ? p.archived : !p.archived))
      .filter((p) => (categoryFilter === ALL_CATEGORIES ? true : p.categoryId === categoryFilter))
      .filter((p) => (q ? p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) : true));
  }, [products, search, categoryFilter, statusTab]);

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

  const columns: { key: SortKey; label: string; className: string; right?: boolean }[] = [
    { key: "code", label: t("products.col.code"), className: "w-[168px]" },
    { key: "name", label: t("products.col.name"), className: "" },
    { key: "category", label: t("products.col.category"), className: "w-[190px]" },
    { key: "unit", label: t("products.col.unit"), className: "w-[90px]" },
    { key: "defaultPrice", label: t("products.col.price"), className: "w-[140px]", right: true },
    { key: "updatedAt", label: t("products.col.updatedAt"), className: "w-[140px]" },
  ];

  const tabs = [
    { key: "active" as const, label: t("common.status.active"), count: counts.active },
    { key: "archived" as const, label: t("common.status.archived"), count: counts.archived },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.inventory")}
        title={t("products.pageTitle")}
        description={t("products.pageSubtitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={(
          <>
            <button data-tour="products-categories" onClick={onManageCategories} className={btn.secondary}>
              <Tags size={16} /> {t("products.manageCategories")}
            </button>
            {canCreate && (
              <>
                <button data-tour="products-import" onClick={onImport} className={btn.secondary}>
                  <Upload size={16} /> {t("products.importFromFile")}
                </button>
                <button data-tour="products-create" onClick={onCreateNew} className={btn.primary}>
                  <Plus size={16} /> {t("products.addNew")}
                </button>
              </>
            )}
          </>
        )}
      />

      <ListCard>
        {products.length === 0 ? (
          <div data-tour="products-table">
            <EmptyState icon={Package} title={t("empty.products.title")} description={t("empty.products.sub")} actionLabel={canCreate ? t("empty.products.action") : undefined} onAction={canCreate ? onCreateNew : undefined} compact />
          </div>
        ) : (
          <>
            <div data-tour="products-toolbar">
              <ListTabs tabs={tabs} active={statusTab} onChange={(k) => { setStatusTab(k); setPage(1); }} ariaLabel={t("products.col.status")} />
              <ListToolbar
                search={search}
                onSearch={(v) => { setSearch(v); setPage(1); }}
                searchPlaceholder={t("products.searchPlaceholder")}
                count={t("ui.itemCount").replace("{n}", String(sorted.length))}
              >
                <SelectBox
                  aria-label={t("products.col.category")}
                  value={categoryFilter}
                  onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                  className="w-full sm:w-[220px]"
                >
                  <option value={ALL_CATEGORIES}>{t("products.allCategories")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.archived ? t("products.categoryArchivedSuffix") : ""}</option>
                  ))}
                </SelectBox>
              </ListToolbar>
            </div>

            <div data-tour="products-table">
              {sorted.length === 0 ? (
                <ListEmpty title={t("products.noFilterResults")} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] table-fixed">
                    <thead>
                      <tr className={table.head}>
                        {columns.map((col) => (
                          <th
                            key={col.key}
                            aria-sort={sort.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                            className={`${table.th} ${col.className}`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(col.key)}
                              className={`inline-flex items-center gap-1 select-none hover:text-foreground transition-colors ${col.right ? "w-full justify-end" : ""}`}
                            >
                              {col.label}
                              {sort.key === col.key && (sort.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                            </button>
                          </th>
                        ))}
                        <th className={`${table.th} w-12`}><span className="sr-only">{t("common.edit")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((p) => {
                        const kit = isKitProduct(p);
                        const sub = kit ? `${t("kit.perKit")} ${kitBreakdownText(p.kitComponents!, 1)}` : p.description;
                        return (
                          <tr key={p.id} {...rowOpenProps(() => onOpen(p.id), `${p.code} ${p.name}`)} className={`${table.row} group cursor-pointer text-sm outline-none focus-visible:bg-[#f8f9fc]`}>
                            <td className={`${table.td} ${table.code} break-all`}>{p.code}</td>
                            <td className={table.td}>
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="font-medium text-foreground truncate" title={p.name}>{p.name}</span>
                                {kit && <Tag tone="blue" icon={Layers}>{t("products.tag.kit")}</Tag>}
                                {p.isTool && <Tag tone="grey">{t("stock.toolBadge")}</Tag>}
                              </span>
                              {sub && <span className="block text-xs text-muted-foreground truncate" title={sub}>{sub}</span>}
                            </td>
                            <td className={`${table.td} text-[#3d5173] truncate`}>{categoryName(p.categoryId)}</td>
                            <td className={`${table.td} text-[#3d5173] truncate`}>{p.unit || "—"}</td>
                            <td className={`${table.td} ${table.money}`}>฿{p.defaultPrice.toLocaleString()}</td>
                            <td className={`${table.td} text-[#3d5173] whitespace-nowrap`}>{fmtProductDate(p.updatedAt)}</td>
                            <td className={`${table.td} text-right`}>
                              <ChevronRight size={18} aria-hidden="true" className="inline text-[#a3aec2] group-hover:text-foreground transition-colors" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {sorted.length > 0 && (
              <ListPagination
                page={clampedPage}
                pageCount={totalPages}
                from={(clampedPage - 1) * PAGE_SIZE + 1}
                to={Math.min(clampedPage * PAGE_SIZE, sorted.length)}
                total={sorted.length}
                onPage={setPage}
              />
            )}
          </>
        )}
      </ListCard>
    </div>
  );
}
