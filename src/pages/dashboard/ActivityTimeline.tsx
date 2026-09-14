import { History } from "lucide-react";
import type { AuditLogEntry } from "../../lib/auditLog";
import { useI18n } from "../../lib/i18n";

// ตารางแสดงกิจกรรมล่าสุด พร้อมลิงก์ไปยังใบเสนอราคาที่เกี่ยวข้อง (ถ้ามี)
// Recent activities table, with a link to the related quotation when available
// `actorLabel` (2026-09-14): the dashboard's ภาพรวม tab shows every department's activity, where
// "พนักงานขาย" would be the wrong column name — it passes a neutral "ผู้ใช้" instead.
export function ActivityTimeline({ entries, onOpenQuote, actorLabel }: { entries: AuditLogEntry[]; onOpenQuote: (quoteId: string) => void; actorLabel?: string }) {
  const { t } = useI18n();
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
        <History size={15} /> {t("dashboard.activity.title")}
      </h2>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">{t("dashboard.activity.empty")}</p>
      ) : (
        <div className="max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className="px-2 py-1.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("dashboard.activity.col.date")}</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{actorLabel ?? t("dashboard.activity.col.salesperson")}</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.activity.col.action")}</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("dashboard.activity.col.quotation")}</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.activity.col.customer")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border/40 last:border-0">
                  <td className="px-2 py-2 text-[10px] text-muted-foreground font-mono whitespace-nowrap">{new Date(e.createdAt).toLocaleString("th-TH")}</td>
                  <td className="px-2 py-2 text-xs text-foreground whitespace-nowrap">
                    {e.userName}
                    <span className="text-muted-foreground"> ({e.roleName})</span>
                  </td>
                  <td className="px-2 py-2 text-xs text-foreground max-w-[220px] truncate" title={e.details || e.action}>{e.action}</td>
                  <td className="px-2 py-2 text-xs font-mono whitespace-nowrap">
                    {e.relatedQuoteId ? (
                      <button onClick={() => onOpenQuote(e.relatedQuoteId!)} className="text-[#c9a84c] hover:underline">{e.relatedQuoteId}</button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-xs text-foreground max-w-[160px] truncate" title={e.relatedCustomerName}>{e.relatedCustomerName || <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
