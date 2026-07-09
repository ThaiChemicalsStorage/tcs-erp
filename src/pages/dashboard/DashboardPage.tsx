import { useEffect, useState } from "react";
import {
  TrendingUp, Boxes, Users, FileText, Trophy, Frown,
  ThumbsUp, ThumbsDown, CircleDot, LayoutDashboard, type LucideIcon,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { type Quote, interestLabelKey } from "../../lib/quotes";
import { fetchDashboardStats, type DashboardStats } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";

const CATEGORY_COLORS = ["#c9a84c", "#1a5fb4", "#2aa36b", "#7c4dbb", "#e05252", "#1f9d8a"];

function fmtShort(n: number) {
  if (n >= 1000000) return `฿${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `฿${(n / 1000).toFixed(1)}K`;
  return `฿${n.toLocaleString("th-TH")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "short" });
}

interface ChartTooltipEntry {
  name: string;
  value: number;
  color: string;
}

function RevenueTooltip({ active, payload, label }: { active?: boolean; payload?: ChartTooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#c9a84c]/30 rounded-lg p-3 shadow-xl">
      <p className="text-muted-foreground text-xs font-mono mb-1">{label}</p>
      <p className="text-xs font-mono text-[#c9a84c]">{fmtShort(payload[0].value)}</p>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, accent }: { title: string; value: string; icon: LucideIcon; accent: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-[#c9a84c]/30 transition-all duration-200">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: `${accent}18` }}>
        <Icon size={18} style={{ color: accent }} />
      </div>
      <p className="text-2xl font-bold text-foreground font-mono tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{title}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="h-8 w-56 rounded-lg bg-muted animate-pulse" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
      </div>
      <div className="h-64 rounded-xl bg-muted animate-pulse" />
    </div>
  );
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
        <LayoutDashboard size={22} className="text-muted-foreground" />
      </div>
      <p className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>{title}</p>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{sub}</p>
    </div>
  );
}

export function DashboardPage({ quotes }: { quotes: Quote[] }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDashboardStats()
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <DashboardSkeleton />;

  const kpis = stats?.kpis ?? {
    totalCustomers: 0, totalLeads: 0, totalQuotations: 0, totalProducts: 0, totalRevenue: 0, wonDeals: 0, lostDeals: 0,
  };
  const revenueByMonth = stats?.revenueByMonth ?? [];
  const categoryBreakdown = stats?.categoryBreakdown ?? [];
  const hasBusinessData = kpis.totalQuotations > 0 || kpis.totalProducts > 0;

  const kpiCards: { title: string; value: string; icon: LucideIcon; accent: string }[] = [
    { title: t("dashboard.kpi.totalRevenue"), value: fmtShort(kpis.totalRevenue), icon: TrendingUp, accent: "#c9a84c" },
    { title: t("dashboard.kpi.totalQuotations"), value: kpis.totalQuotations.toLocaleString("th-TH"), icon: FileText, accent: "#1a5fb4" },
    { title: t("dashboard.kpi.totalProducts"), value: kpis.totalProducts.toLocaleString("th-TH"), icon: Boxes, accent: "#2aa36b" },
    { title: t("dashboard.kpi.totalCustomers"), value: kpis.totalCustomers.toLocaleString("th-TH"), icon: Users, accent: "#7c4dbb" },
    { title: t("dashboard.kpi.totalLeads"), value: kpis.totalLeads.toLocaleString("th-TH"), icon: Users, accent: "#3b6fc9" },
    { title: t("dashboard.kpi.wonDeals"), value: kpis.wonDeals.toLocaleString("th-TH"), icon: Trophy, accent: "#157347" },
    { title: t("dashboard.kpi.lostDeals"), value: kpis.lostDeals.toLocaleString("th-TH"), icon: Frown, accent: "#e05252" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("dashboard.subtitle")}</p>
      </div>

      {!hasBusinessData ? (
        <EmptyState title={t("empty.dashboard.title")} sub={t("empty.dashboard.sub")} />
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {kpiCards.map((kpi) => <KpiCard key={kpi.title} {...kpi} />)}
          </div>

          {/* Revenue chart + category breakdown */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>{t("dashboard.chart.revenue.title")}</h2>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{t("dashboard.chart.revenue.sub")}</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={revenueByMonth.map((r) => ({ ...r, label: monthLabel(r.month) }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.3} /><stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" />
                  <XAxis dataKey="label" tick={{ fill: "#5a7299", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtShort(v)} />
                  <Tooltip content={<RevenueTooltip />} />
                  <Area type="monotone" dataKey="revenue" name={t("dashboard.kpi.totalRevenue")} stroke="#c9a84c" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: "#c9a84c" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>{t("dashboard.chart.category.title")}</h2>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{t("dashboard.chart.category.sub")}</p>
              </div>
              {categoryBreakdown.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-10">{t("empty.products.title")}</p>
              ) : (
                <>
                  <div className="flex justify-center mb-4">
                    <PieChart width={160} height={160}>
                      <Pie data={categoryBreakdown} cx={75} cy={75} innerRadius={50} outerRadius={72} paddingAngle={3} dataKey="count" strokeWidth={0}>
                        {categoryBreakdown.map((entry, i) => <Cell key={entry.categoryId} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  </div>
                  <div className="space-y-2.5">
                    {categoryBreakdown.map((c, i) => (
                      <div key={c.categoryId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                          <span className="text-xs text-muted-foreground truncate">{c.categoryName}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${c.percentage}%`, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                          </div>
                          <span className="text-xs font-mono text-foreground w-10 text-right">{c.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quotation interest summary — real, driven by the quotes prop */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-5 xl:col-span-1">
              <h2 className="text-base font-semibold text-foreground mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>{t("dashboard.interest.title")}</h2>
              <div className="space-y-3">
                {[
                  { label: t(interestLabelKey["น่าสนใจ"]), count: quotes.filter((q) => q.interest === "น่าสนใจ").length, color: "#2aa36b", icon: <ThumbsUp size={13} /> },
                  { label: t(interestLabelKey["ไม่น่าสนใจ"]), count: quotes.filter((q) => q.interest === "ไม่น่าสนใจ").length, color: "#e05252", icon: <ThumbsDown size={13} /> },
                  { label: t("quotation.interest.notEvaluated"), count: quotes.filter((q) => q.interest === null).length, color: "#5a7299", icon: <CircleDot size={13} /> },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${item.color}15` }}>
                      <span style={{ color: item.color }}>{item.icon}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-foreground">{item.label}</span>
                        <span className="text-xs font-mono font-semibold text-foreground">{item.count} {t("quotation.countUnit")}</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${quotes.length ? (item.count / quotes.length) * 100 : 0}%`, background: item.color }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
