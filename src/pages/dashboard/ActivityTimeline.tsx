import type { AuditLogEntry } from "../../lib/auditLog";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { TD, TH, TR } from "./tabs/dashboardTokens";

// ตารางแสดงกิจกรรมล่าสุด พร้อมลิงก์ไปยังใบเสนอราคาที่เกี่ยวข้อง (ถ้ามี)
// Recent activities table, with a link to the related quotation when available
// `actorLabel` (2026-09-14): the dashboard's ภาพรวม tab shows every department's activity, where
// "พนักงานขาย" would be the wrong column name — it passes a neutral "ผู้ใช้" instead.
// หน้าตาดีไซน์ใหม่ (2026-10-01): การ์ดหัวคั่นเส้น + ตารางแบบหน้ารายการ เลื่อนในการ์ดเมื่อยาว
export function ActivityTimeline({ entries, onOpenQuote, actorLabel, sub }: { entries: AuditLogEntry[]; onOpenQuote: (quoteId: string) => void; actorLabel?: string; sub?: string }) {
  const { t } = useI18n();
  return (
    <ChartCard flush title={t("dashboard.activity.title")} sub={sub}>
      {entries.length === 0 ? (
        <p className="text-[13px] text-muted-foreground text-center py-10">{t("dashboard.activity.empty")}</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-[1]">
              <tr className="bg-[#f8f9fc] border-b border-border text-left">
                <th className={TH}>{t("dashboard.activity.col.date")}</th>
                <th className={TH}>{actorLabel ?? t("dashboard.activity.col.salesperson")}</th>
                <th className={TH}>{t("dashboard.activity.col.action")}</th>
                <th className={TH}>{t("dashboard.activity.col.quotation")}</th>
                <th className={TH}>{t("dashboard.activity.col.customer")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={TR}>
                  <td className={`${TD} text-[13px] text-[#3d5173] tabular-nums whitespace-nowrap`}>{new Date(e.createdAt).toLocaleString("th-TH")}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {e.userName}
                    <span className="text-muted-foreground"> ({e.roleName})</span>
                  </td>
                  <td className={`${TD} max-w-[260px] truncate`} title={e.details || e.action}>{e.action}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {e.relatedQuoteId ? (
                      <button type="button" onClick={() => onOpenQuote(e.relatedQuoteId!)} className="font-mono text-[13px] font-medium text-[#1a5fb4] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 rounded">
                        {e.relatedQuoteId}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={`${TD} max-w-[220px] truncate`} title={e.relatedCustomerName}>{e.relatedCustomerName || <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
