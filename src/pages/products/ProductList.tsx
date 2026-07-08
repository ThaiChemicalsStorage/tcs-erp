import { useCallback, useMemo, useState } from "react";
import {
  Plus, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Pencil, Copy, Archive, ArchiveRestore, Trash2, Tags, Package,
} from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { ConfirmDialog } from "../../components/ConfirmDialog";

type SortKey = "code" | "name" | "category" | "unit" | "defaultPrice" | "status" | "updatedAt";

const PAGE_SIZE = 8;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export function ProductList({
  products,
  categories,
  onEdit,
  onArchiveToggle,
  onDelete,
  onDuplicate,
  onCreateNew,
  onManageCategories,
}: {
  products: Product[];
  categories: ProductCategory[];
  onEdit: (id: string) => void;
  onArchiveToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onCreateNew: () => void;
  onManageCategories: () => void;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ทั้งหมด");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "updatedAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const categoryName = useCallback(
    (id: string) => categories.find((c) => c.id === id)?.name ?? "ไม่ระบุหมวดหมู่",
    [categories],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => (showArchived ? true : !p.archived))
      .filter((p) => (categoryFilter === "ทั้งหมด" ? true : p.categoryId === categoryFilter))
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

  const toggleSort = (key: SortKey) => {
    setSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "code", label: "รหัสสินค้า" },
    { key: "name", label: "ชื่อสินค้า" },
    { key: "category", label: "หมวดหมู่" },
    { key: "unit", label: "หน่วย" },
    { key: "defaultPrice", label: "ราคาเริ่มต้น" },
    { key: "status", label: "สถานะ" },
    { key: "updatedAt", label: "อัปเดตล่าสุด" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>คลังสินค้า / บริการ</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">รายการสินค้าและบริการต้นแบบสำหรับใช้ในใบเสนอราคา</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onManageCategories} className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all">
            <Tags size={15} /> จัดการหมวดหมู่
          </button>
          <button onClick={onCreateNew} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
            <Plus size={15} /> เพิ่มสินค้าใหม่
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 focus-within:border-[#c9a84c]/40 transition-colors">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="ค้นหารหัสหรือชื่อสินค้า..."
            className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none"
        >
          <option value="ทั้งหมด">ทุกหมวดหมู่</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.archived ? " (เก็บถาวร)" : ""}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground ml-auto">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }}
            className="w-4 h-4 rounded border-border accent-[#c9a84c]"
          />
          แสดงรายการที่เก็บถาวร
        </label>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Package size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">ไม่พบสินค้าที่ตรงกับเงื่อนไข</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        {sort.key === col.key && (sort.dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 w-32" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors group">
                    <td className="px-4 py-3 text-xs font-mono text-[#c9a84c] font-semibold">{p.code}</td>
                    <td className="px-4 py-3 text-sm text-foreground font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{categoryName(p.categoryId)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.unit}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground">฿{p.defaultPrice.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        p.archived ? "bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20" : "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20"
                      }`}>
                        {p.archived ? "เก็บถาวร" : "ใช้งาน"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{fmtDate(p.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onEdit(p.id)} title="แก้ไข" className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => onDuplicate(p.id)} title="ทำสำเนา" className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                          <Copy size={14} />
                        </button>
                        <button onClick={() => onArchiveToggle(p.id)} title={p.archived ? "เลิกเก็บถาวร" : "เก็บถาวร"} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                          {p.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        </button>
                        <button onClick={() => setConfirmDeleteId(p.id)} title="ลบ" className="p-1.5 text-muted-foreground hover:text-[#e05252] transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground font-mono">
                แสดง {(clampedPage - 1) * PAGE_SIZE + 1}-{Math.min(clampedPage * PAGE_SIZE, sorted.length)} จาก {sorted.length} รายการ
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
        title="ลบสินค้านี้ถาวร?"
        message="การลบจะไม่สามารถย้อนกลับได้ ใบเสนอราคาที่เคยใช้สินค้านี้จะไม่ได้รับผลกระทบ แนะนำให้ใช้ 'เก็บถาวร' แทนหากต้องการเก็บประวัติไว้"
        confirmLabel="ลบถาวร"
        danger
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => { if (confirmDeleteId) onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
      />
    </div>
  );
}
