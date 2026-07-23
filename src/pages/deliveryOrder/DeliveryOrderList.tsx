import { useState } from "react";
import { Truck, Search, X } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import type { DeliveryOrderListItem, DeliveryOrderStatus } from "../../lib/deliveryOrder";
import { formatQuoteDateThai } from "../../lib/quotes";

const FILTER_ALL = "all";

const statusStyle: Record<DeliveryOrderStatus, string> = {
  Draft: "bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20",
  Final: "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20",
};

export function DeliveryOrderList({
  deliveryOrders,
  onOpen,
}: {
  deliveryOrders: DeliveryOrderListItem[];
  onOpen: (id: string) => void;
}) {
  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();

  // Defensive normalization, same "MongoDB enforces no schema" rationale as ScopeOfWorkList.tsx.
  const items = deliveryOrders.map((d) => ({
    ...d,
    scopeNumber: d.scopeNumber ?? "",
    customerCompanyName: d.customerCompanyName ?? "",
    status: d.status ?? "Draft",
  }));

  const filtered = items
    .filter((d) => filterStatus === FILTER_ALL || d.status === filterStatus)
    .filter((d) => !normalizedSearch || [d.scopeNumber, d.customerCompanyName].some((v) => v.toLowerCase().includes(normalizedSearch)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>ใบส่งมอบสินค้า</h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-mono">จัดการและติดตามใบส่งมอบสินค้าและบริการทั้งหมด</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {[
          { label: "ทั้งหมด", count: deliveryOrders.length, color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: "Draft", count: deliveryOrders.filter((d) => d.status === "Draft").length, color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: "Final", count: deliveryOrders.filter((d) => d.status === "Final").length, color: "#2aa36b", bg: "from-[#2aa36b]/15 to-[#2aa36b]/5" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:border-[#c9a84c]/30 transition-all">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.bg} flex items-center justify-center mb-3`}>
              <Truck size={15} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-bold text-foreground font-mono">{s.count}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative h-9 w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหารหัสงาน / ลูกค้า"
              className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
          {[FILTER_ALL, "Draft", "Final"].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {s === FILTER_ALL ? "ทั้งหมด" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {deliveryOrders.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="ยังไม่มีใบส่งมอบสินค้า"
            description='สร้างใบส่งมอบสินค้าได้จากปุ่มในหน้ารายละเอียด Scope of Work'
            compact
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Truck size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">ไม่พบใบส่งมอบสินค้าที่ตรงกับเงื่อนไข</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["รหัสงาน", "ลูกค้า", "จำนวนงวด", "สถานะ", "แก้ไขล่าสุด"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => onOpen(d.id)}>
                <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{d.scopeNumber}</td>
                <td className="px-4 py-3.5 text-sm text-foreground font-medium max-w-[260px] truncate" title={d.customerCompanyName}>{d.customerCompanyName}</td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">{d.installmentCount}</td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[d.status]}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(d.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        )}
      </div>
    </div>
  );
}
