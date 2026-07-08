import { useState } from "react";
import { Plus, FileText } from "lucide-react";
import { type Quote, type QuoteStatus, type QuoteInterest, statusStyle, statusIcon } from "../../lib/quotes";
import { salesTeam } from "../../lib/salesTeam";
import { InterestButtons } from "./InterestButtons";

const statuses: QuoteStatus[] = ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว", "ยกเลิก"];

export function QuoteList({
  quotes,
  onOpen,
  onCreateNew,
  onInterestChange,
}: {
  quotes: Quote[];
  onOpen: (id: string) => void;
  onCreateNew: () => void;
  onInterestChange: (id: string, v: QuoteInterest) => void;
}) {
  const [filterStatus, setFilterStatus] = useState<string>("ทั้งหมด");
  const filtered = filterStatus === "ทั้งหมด" ? quotes : quotes.filter((q) => q.status === filterStatus);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>ใบเสนอราคา</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">จัดการและติดตามใบเสนอราคาทั้งหมด</p>
        </div>
        <button onClick={onCreateNew} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
          <Plus size={15} /> สร้างใบเสนอราคา
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "ทั้งหมด", count: quotes.length, color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: "รออนุมัติ", count: quotes.filter((q) => q.status === "รออนุมัติ").length, color: "#c9a84c", bg: "from-[#c9a84c]/15 to-[#c9a84c]/5" },
          { label: "อนุมัติแล้ว", count: quotes.filter((q) => q.status === "อนุมัติแล้ว").length, color: "#2aa36b", bg: "from-[#2aa36b]/15 to-[#2aa36b]/5" },
          { label: "น่าสนใจ", count: quotes.filter((q) => q.interest === "น่าสนใจ").length, color: "#c9a84c", bg: "from-[#c9a84c]/15 to-[#c9a84c]/5" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:border-[#c9a84c]/30 transition-all">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.bg} flex items-center justify-center mb-3`}>
              <FileText size={15} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-bold text-foreground font-mono">{s.count}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1 bg-muted rounded-xl p-1 w-fit">
        {["ทั้งหมด", ...statuses].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["เลขที่", "ลูกค้า", "พนักงานขาย", "วันที่", "มูลค่า", "สถานะ", "ความสนใจ"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((q) => (
              <tr key={q.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold cursor-pointer" onClick={() => onOpen(q.id)}>
                  {q.id}
                </td>
                <td className="px-4 py-3.5 text-sm text-foreground font-medium cursor-pointer" onClick={() => onOpen(q.id)}>
                  {q.client}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const s = salesTeam.find((t) => t.name === q.salesperson);
                      return s ? (
                        <>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ background: s.color }}>{s.avatar}</div>
                          <span className="text-xs text-foreground">{q.salesperson.split(" ")[0]}</span>
                        </>
                      ) : <span className="text-xs text-muted-foreground">{q.salesperson}</span>;
                    })()}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">{q.date}</td>
                <td className="px-4 py-3.5 text-sm font-mono text-foreground font-semibold">฿{q.amount.toLocaleString()}</td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[q.status]}`}>
                    {statusIcon[q.status]} {q.status}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <InterestButtons value={q.interest} onChange={(v) => onInterestChange(q.id, v)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
