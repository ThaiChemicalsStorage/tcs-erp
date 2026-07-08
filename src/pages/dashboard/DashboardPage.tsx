import { useState } from "react";
import {
  ShoppingCart, TrendingUp, Boxes, Users, ArrowUpRight, ArrowDownRight,
  ChevronRight, CircleDot, ThumbsUp, ThumbsDown, Award,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import type { Quote } from "../../lib/quotes";
import { salesTeam } from "../../lib/salesTeam";

const salesChartData = salesTeam.map((s) => ({ name: s.name.split(" ")[0], value: s.sold, color: s.color }));

const revenueData = [
  { month: "ม.ค.", revenue: 4200000, expenses: 2800000 },
  { month: "ก.พ.", revenue: 3800000, expenses: 2600000 },
  { month: "มี.ค.", revenue: 5100000, expenses: 3100000 },
  { month: "เม.ย.", revenue: 4700000, expenses: 2900000 },
  { month: "พ.ค.", revenue: 6300000, expenses: 3500000 },
  { month: "มิ.ย.", revenue: 5800000, expenses: 3200000 },
  { month: "ก.ค.", revenue: 7200000, expenses: 4100000 },
  { month: "ส.ค.", revenue: 6900000, expenses: 3800000 },
  { month: "ก.ย.", revenue: 8100000, expenses: 4400000 },
  { month: "ต.ค.", revenue: 7600000, expenses: 4200000 },
  { month: "พ.ย.", revenue: 9200000, expenses: 5100000 },
  { month: "ธ.ค.", revenue: 10400000, expenses: 5800000 },
];

const categoryData = [
  { name: "การผลิต", value: 38, color: "#c9a84c" },
  { name: "การจัดจำหน่าย", value: 27, color: "#1a5fb4" },
  { name: "บริการ", value: 21, color: "#2aa36b" },
  { name: "ค้าปลีก", value: 14, color: "#7c4dbb" },
];

const dashboardOrders = [
  { id: "ORD-2024-8841", client: "เมอริเดียน คอร์ป", amount: 284500, status: "จัดส่งแล้ว", date: "14 ธ.ค. 2567", region: "อเมริกาเหนือ" },
  { id: "ORD-2024-8840", client: "วาสเกซ อินดัสทรีส์", amount: 92300, status: "กำลังดำเนินการ", date: "14 ธ.ค. 2567", region: "ยุโรป" },
  { id: "ORD-2024-8839", client: "เอเพ็กซ์ โกลบอล", amount: 1420000, status: "จัดส่งแล้ว", date: "13 ธ.ค. 2567", region: "เอเชียแปซิฟิก" },
  { id: "ORD-2024-8838", client: "สเตอร์ลิง ไดนามิกส์", amount: 56800, status: "รอดำเนินการ", date: "13 ธ.ค. 2567", region: "อเมริกาเหนือ" },
  { id: "ORD-2024-8837", client: "นากามูระ โฮลดิ้งส์", amount: 375000, status: "จัดส่งแล้ว", date: "12 ธ.ค. 2567", region: "เอเชียแปซิฟิก" },
  { id: "ORD-2024-8836", client: "ดูรอง เฟรร์ เอสเอ", amount: 218900, status: "ระงับชั่วคราว", date: "12 ธ.ค. 2567", region: "ยุโรป" },
  { id: "ORD-2024-8835", client: "แบล็กเวลล์ แอนด์ ซันส์", amount: 689200, status: "กำลังดำเนินการ", date: "11 ธ.ค. 2567", region: "อเมริกาเหนือ" },
];

const dashboardActivities = [
  { icon: "💰", action: "ชำระใบแจ้งหนี้ #INV-9921 แล้ว", detail: "฿284,500 โดย เมอริเดียน คอร์ป", time: "2 นาทีที่แล้ว" },
  { icon: "⚠️", action: "แจ้งเตือนสินค้าคงคลัง", detail: "SKU-4421 ต่ำกว่าสต็อกสำรอง (12 ชิ้น)", time: "18 นาทีที่แล้ว" },
  { icon: "👤", action: "เพิ่มผู้จำหน่ายรายใหม่", detail: "ทานากะ พรีซิชัน แมนูแฟคเจอริ่ง", time: "1 ชั่วโมงที่แล้ว" },
  { icon: "📦", action: "จัดส่งสินค้าออกแล้ว", detail: "ORD-2024-8840 → ศูนย์กระจายสินค้าแฟรงก์เฟิร์ต", time: "3 ชั่วโมงที่แล้ว" },
  { icon: "🔄", action: "อนุมัติใบสั่งซื้อแล้ว", detail: "PO-7734 — ฿92,400 วัตถุดิบ", time: "5 ชั่วโมงที่แล้ว" },
  { icon: "📊", action: "อัปเดตการคาดการณ์ Q4", detail: "คาดการณ์รายได้ +12.4% เทียบแผน", time: "เมื่อวาน" },
];

const kpis = [
  { title: "รายได้รวม", value: "฿10.4M", change: "+18.2%", up: true, sub: "เทียบ ธ.ค. 2566", icon: TrendingUp, color: "from-[#c9a84c]/20 to-[#c9a84c]/5", accent: "#c9a84c" },
  { title: "คำสั่งซื้อที่ใช้งาน", value: "1,284", change: "+6.7%", up: true, sub: "เทียบเดือนที่แล้ว", icon: ShoppingCart, color: "from-[#1a5fb4]/20 to-[#1a5fb4]/5", accent: "#1a5fb4" },
  { title: "มูลค่าสินค้าคงคลัง", value: "฿38.7M", change: "-2.1%", up: false, sub: "เทียบเดือนที่แล้ว", icon: Boxes, color: "from-[#2aa36b]/20 to-[#2aa36b]/5", accent: "#2aa36b" },
  { title: "จำนวนพนักงาน", value: "2,841", change: "+43", up: true, sub: "รับพนักงานใหม่ไตรมาสนี้", icon: Users, color: "from-[#7c4dbb]/20 to-[#7c4dbb]/5", accent: "#7c4dbb" },
];

const orderStatusStyles: Record<string, string> = {
  "จัดส่งแล้ว": "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20",
  "กำลังดำเนินการ": "bg-[#1a5fb4]/10 text-[#1a5fb4] border border-[#1a5fb4]/20",
  "รอดำเนินการ": "bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/20",
  "ระงับชั่วคราว": "bg-[#e05252]/10 text-[#e05252] border border-[#e05252]/20",
};

function fmtShort(n: number) {
  if (n >= 1000000) return `฿${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `฿${(n / 1000).toFixed(1)}K`;
  return `฿${n}`;
}

interface ChartTooltipEntry {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: ChartTooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#c9a84c]/30 rounded-lg p-3 shadow-xl">
      <p className="text-muted-foreground text-xs font-mono mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-xs font-mono" style={{ color: entry.color }}>
          {entry.name}: ฿{(entry.value / 1000000).toFixed(2)}M
        </p>
      ))}
    </div>
  );
}

interface SalesTooltipPayload {
  payload: { name: string; value: number; color: string };
}

function SalesTooltip({ active, payload }: { active?: boolean; payload?: SalesTooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-[#c9a84c]/30 rounded-lg p-3 shadow-xl">
      <p className="text-xs font-semibold text-foreground">{d.name}</p>
      <p className="text-xs font-mono text-muted-foreground mt-0.5">ปิดการขาย: <span style={{ color: d.color }} className="font-bold">{d.value} ฉบับ</span></p>
    </div>
  );
}

export function DashboardPage({ quotes }: { quotes: Quote[] }) {
  const [activeTab, setActiveTab] = useState<"revenue" | "expenses">("revenue");
  const [activeSales, setActiveSales] = useState<string | null>(null);

  const totalSold = salesTeam.reduce((s, t) => s + t.sold, 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Heading */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>ภาพรวมผู้บริหาร</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">ปีงบประมาณ 2567 · อัปเดตล่าสุด 14 ธ.ค. 2567 เวลา 14:32 น.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all">ส่งออกรายงาน</button>
          <button className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">+ สร้างคำสั่งซื้อ</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.title} className="bg-card border border-border rounded-xl p-5 hover:border-[#c9a84c]/30 transition-all duration-200">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center`}><Icon size={18} style={{ color: kpi.accent }} /></div>
                <span className={`flex items-center gap-1 text-xs font-mono font-medium ${kpi.up ? "text-[#2aa36b]" : "text-[#e05252]"}`}>
                  {kpi.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{kpi.change}
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground font-mono tracking-tight">{kpi.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{kpi.title}</p>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5 opacity-70">{kpi.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Revenue chart + segment */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>รายได้ vs ค่าใช้จ่าย</h2>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">ปีงบประมาณ 2567 · แยกรายเดือน</p>
            </div>
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {([{ key: "revenue" as const, label: "รายได้" }, { key: "expenses" as const, label: "ค่าใช้จ่าย" }]).map((t) => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${activeTab === t.key ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenueData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.3} /><stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1a5fb4" stopOpacity={0.25} /><stop offset="95%" stopColor="#1a5fb4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" />
              <XAxis dataKey="month" tick={{ fill: "#5a7299", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `฿${(v / 1000000).toFixed(0)}M`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" name="รายได้" stroke="#c9a84c" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: "#c9a84c" }} />
              <Area type="monotone" dataKey="expenses" name="ค่าใช้จ่าย" stroke="#1a5fb4" strokeWidth={2} fill="url(#expGrad)" dot={false} activeDot={{ r: 4, fill: "#1a5fb4" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>รายได้แยกตามกลุ่ม</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">การกระจาย Q4 2567</p>
          </div>
          <div className="flex justify-center mb-4">
            <PieChart width={160} height={160}>
              <Pie data={categoryData} cx={75} cy={75} innerRadius={50} outerRadius={72} paddingAngle={3} dataKey="value" strokeWidth={0}>
                {categoryData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
            </PieChart>
          </div>
          <div className="space-y-2.5">
            {categoryData.map((c) => (
              <div key={c.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                  <span className="text-xs text-muted-foreground">{c.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${c.value}%`, background: c.color }} /></div>
                  <span className="text-xs font-mono text-foreground w-8 text-right">{c.value}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sales Performance section ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* Donut chart */}
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>ยอดปิดการขาย</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">ใบเสนอราคาที่ปิดได้ · ธ.ค. 2567</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <PieChart width={160} height={160}>
                <Pie
                  data={salesChartData}
                  cx={75} cy={75}
                  innerRadius={48} outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                  onMouseEnter={(_, i) => setActiveSales(salesChartData[i].name)}
                  onMouseLeave={() => setActiveSales(null)}
                >
                  {salesChartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} opacity={activeSales && activeSales !== entry.name ? 0.35 : 1} />
                  ))}
                </Pie>
                <Tooltip content={<SalesTooltip />} />
              </PieChart>
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-xl font-bold text-foreground font-mono leading-none">{totalSold}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">ฉบับ</p>
              </div>
            </div>
            <div className="flex-1 space-y-2.5">
              {salesTeam.map((s) => (
                <div key={s.name} className="flex items-center gap-2" onMouseEnter={() => setActiveSales(s.name.split(" ")[0])} onMouseLeave={() => setActiveSales(null)}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-xs text-muted-foreground truncate flex-1">{s.name.split(" ")[0]}</span>
                  <span className="text-xs font-mono font-semibold text-foreground">{s.sold}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sales team table */}
        <div className="xl:col-span-3 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>ประสิทธิภาพทีมขาย</h2>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">สร้าง vs ปิดการขาย · เดือนนี้</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#1a5fb4] inline-block" />สร้าง</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#2aa36b] inline-block" />ปิดได้</span>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["พนักงานขาย", "สร้าง", "ปิดได้", "อัตราปิด", "มูลค่า", "อันดับ"].map((h) => (
                  <th key={h} className={`px-5 py-2.5 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider ${h === "พนักงานขาย" ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salesTeam.map((s, idx) => {
                const rate = Math.round((s.sold / s.created) * 100);
                return (
                  <tr key={s.name} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: s.color }}>{s.avatar}</div>
                        <div>
                          <p className="text-xs font-medium text-foreground">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">พนักงานขาย</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-mono font-semibold text-foreground">{s.created}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-mono font-semibold text-[#2aa36b]">{s.sold}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, background: rate >= 70 ? "#2aa36b" : rate >= 50 ? "#c9a84c" : "#e05252" }} />
                        </div>
                        <span className="text-xs font-mono font-semibold" style={{ color: rate >= 70 ? "#2aa36b" : rate >= 50 ? "#c9a84c" : "#e05252" }}>{rate}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-xs font-mono text-foreground font-semibold">{fmtShort(s.value)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end">
                        {idx === 0 ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#c9a84c]/15 text-[#c9a84c] text-[10px] font-bold border border-[#c9a84c]/25">
                            <Award size={9} /> #{idx + 1}
                          </span>
                        ) : (
                          <span className="text-xs font-mono text-muted-foreground">#{idx + 1}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Summary footer */}
          <div className="px-5 py-3 bg-muted/20 border-t border-border flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground">รวมทีม</span>
            <div className="flex items-center gap-6">
              <span className="text-xs font-mono text-foreground">สร้าง: <strong>{salesTeam.reduce((s, t) => s + t.created, 0)}</strong></span>
              <span className="text-xs font-mono text-[#2aa36b]">ปิดได้: <strong>{totalSold}</strong></span>
              <span className="text-xs font-mono text-foreground">มูลค่ารวม: <strong className="text-[#c9a84c]">{fmtShort(salesTeam.reduce((s, t) => s + t.value, 0))}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Quotation interest summary */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>ความสนใจใบเสนอราคา</h2>
          <div className="space-y-3">
            {[
              { label: "น่าสนใจ", count: quotes.filter((q) => q.interest === "น่าสนใจ").length, color: "#2aa36b", icon: <ThumbsUp size={13} /> },
              { label: "ไม่น่าสนใจ", count: quotes.filter((q) => q.interest === "ไม่น่าสนใจ").length, color: "#e05252", icon: <ThumbsDown size={13} /> },
              { label: "ยังไม่ประเมิน", count: quotes.filter((q) => q.interest === null).length, color: "#5a7299", icon: <CircleDot size={13} /> },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${item.color}15` }}>
                  <span style={{ color: item.color }}>{item.icon}</span>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-foreground">{item.label}</span>
                    <span className="text-xs font-mono font-semibold text-foreground">{item.count} ฉบับ</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${quotes.length ? (item.count / quotes.length) * 100 : 0}%`, background: item.color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Orders table */}
        <div className="xl:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>คำสั่งซื้อล่าสุด</h2>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">7 รายการล่าสุด</p>
            </div>
            <button className="text-xs text-[#c9a84c] hover:text-[#f0c040] font-medium transition-colors flex items-center gap-1">ดูทั้งหมด <ChevronRight size={13} /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["รหัสคำสั่งซื้อ", "ลูกค้า", "ภูมิภาค", "ยอดเงิน", "สถานะ", "วันที่"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dashboardOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border/50 hover:bg-secondary/40 transition-colors cursor-pointer">
                    <td className="px-5 py-3 text-xs font-mono text-[#c9a84c]">{order.id}</td>
                    <td className="px-5 py-3 text-sm text-foreground font-medium">{order.client}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{order.region}</td>
                    <td className="px-5 py-3 text-sm font-mono text-foreground font-medium">{fmtShort(order.amount)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${orderStatusStyles[order.status] ?? ""}`}>
                        <CircleDot size={8} /> {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground font-mono">{order.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>กิจกรรมสด</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">เหตุการณ์ระบบ</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#2aa36b] animate-pulse" />
            <span className="text-[10px] font-mono text-[#2aa36b]">สด</span>
          </div>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-3 divide-x divide-y divide-border/50">
          {dashboardActivities.map((a, i) => (
            <div key={i} className="px-5 py-4 hover:bg-secondary/30 transition-colors">
              <div className="flex items-start gap-3">
                <span className="text-base leading-none mt-0.5 flex-shrink-0">{a.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground leading-snug">{a.action}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug truncate">{a.detail}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-1 opacity-70">{a.time}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
