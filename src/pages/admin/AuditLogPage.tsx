import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { AuditLogEntry } from "../../lib/auditLog";
import { fetchAuditLog } from "../../lib/auditLog";
import { useI18n } from "../../lib/i18n";

export function AuditLogPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLog().then(setEntries).finally(() => setLoading(false));
  }, []);

  const filtered = entries.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.userName, e.roleName, e.module, e.action, e.details].some((f) => f.toLowerCase().includes(q));
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("nav.auditLog")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("auditLog.totalCount").replace("{n}", String(entries.length))}</p>
        </div>
        <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-full sm:w-72">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("auditLog.searchPlaceholder")} className="bg-transparent text-sm outline-none w-full text-foreground placeholder-muted-foreground" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
              <th className="text-left font-medium px-4 py-3">{t("auditLog.col.datetime")}</th>
              <th className="text-left font-medium px-4 py-3">{t("auditLog.col.user")}</th>
              <th className="text-left font-medium px-4 py-3">{t("auditLog.col.role")}</th>
              <th className="text-left font-medium px-4 py-3">{t("auditLog.col.module")}</th>
              <th className="text-left font-medium px-4 py-3">{t("auditLog.col.action")}</th>
              <th className="text-left font-medium px-4 py-3">{t("auditLog.col.details")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{new Date(e.createdAt).toLocaleString("th-TH")}</td>
                <td className="px-4 py-3 text-xs text-foreground font-medium whitespace-nowrap">{e.userName}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{e.roleName}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{e.module}</td>
                <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/20 whitespace-nowrap">{e.action}</span></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{e.details}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-xs text-muted-foreground py-10">
                  {loading ? t("auditLog.loading") : entries.length === 0 ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-medium text-foreground">{t("empty.auditLog.title")}</span>
                      <span>{t("empty.auditLog.sub")}</span>
                    </div>
                  ) : t("auditLog.noFilterResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
