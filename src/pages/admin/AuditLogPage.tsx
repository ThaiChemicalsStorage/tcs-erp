import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import type { AuditLogEntry } from "../../lib/auditLog";
import { fetchAuditLog } from "../../lib/auditLog";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListPageHeader, ListCard, ListToolbar, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import { useI18n } from "../../lib/i18n";
import { formatDisplayDate, formatDisplayTime } from "../../lib/displayDate";

/** แถวต่อหน้า — เดิมแสดงทุกแถวในหน้าเดียว (บันทึกสะสมหลายพันแถว) ดีไซน์ใหม่ 2026-09-30 เพิ่มการแบ่งหน้า */
const PAGE_SIZE = 20;

// หน้าแสดงประวัติการใช้งานระบบ (Audit Log) พร้อมช่องค้นหา การแบ่งหน้า และทัวร์แนะนำการใช้งาน
// Displays the audit log with a search box, pagination and a first-run guided tour
export function AuditLogPage({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const { t } = useI18n();

  // ปุ่มเปลี่ยนหน้าขึ้นเมื่อมีรายการแล้วเท่านั้น — ระหว่างโหลดทัวร์ข้ามขั้นนั้นเอง
  const tourSteps: TourStep[] = [
    { element: '[data-tour="audit-search"]', manual: "ch27-4", popover: { title: t("tour.audit.search.title"), description: t("tour.audit.search.desc"), side: "bottom" } },
    { element: '[data-tour="audit-table"]', manual: "ch27-4", popover: { title: t("tour.audit.table.title"), description: t("tour.audit.table.desc"), side: "top" } },
    { element: '[data-tour="audit-pages"]', manual: "ch27-4", popover: { title: t("tour.audit.pages.title"), description: t("tour.audit.pages.desc"), side: "top" } },
  ];
  const tour = useModuleTour("auditLog", currentUserId, tourSteps);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLog().then(setEntries).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => [e.userName, e.roleName, e.module, e.action, e.details].some((f) => f.toLowerCase().includes(q)));
  }, [entries, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.admin")}
        title={t("nav.auditLog")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        description={
          <span className="inline-flex items-center gap-1.5 text-[13px]">
            <Lock size={14} aria-hidden="true" /> {t("auditLog.subtitle")}
          </span>
        }
      />

      <ListCard>
        <div data-tour="audit-search">
          <ListToolbar
            search={search}
            onSearch={(v) => { setSearch(v); setPage(1); }}
            searchPlaceholder={t("auditLog.searchPlaceholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          >
            <span className="text-xs text-muted-foreground">{t("auditLog.searchHint")}</span>
          </ListToolbar>
        </div>

        <div data-tour="audit-table">
          {filtered.length === 0 ? (
            <div role={loading ? "status" : undefined} aria-live={loading ? "polite" : undefined}>
              {loading ? (
                <ListEmpty title={t("auditLog.loading")} />
              ) : entries.length === 0 ? (
                <ListEmpty title={t("empty.auditLog.title")} hint={t("empty.auditLog.sub")} />
              ) : (
                <ListEmpty title={t("auditLog.noFilterResults")} />
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] table-fixed text-sm">
                <thead>
                  <tr className={table.head}>
                    <th className={`${table.th} w-[150px]`}>{t("auditLog.col.datetime")}</th>
                    <th className={`${table.th} w-[220px]`}>{t("auditLog.col.user")}</th>
                    <th className={`${table.th} w-[140px]`}>{t("auditLog.col.module")}</th>
                    <th className={`${table.th} w-[240px]`}>{t("auditLog.col.action")}</th>
                    <th className={table.th}>{t("auditLog.col.details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((e) => {
                    const at = new Date(e.createdAt);
                    return (
                      <tr key={e.id} className="h-[60px] border-b border-[#eef1f6] last:border-b-0 bg-white hover:bg-[#f8f9fc] transition-colors">
                        <td className={table.td}>
                          <span className="block text-foreground whitespace-nowrap">{formatDisplayDate(at)}</span>
                          <span className="block text-xs text-muted-foreground tabular-nums">{formatDisplayTime(at, { seconds: true })}</span>
                        </td>
                        <td className={table.td}>
                          <span className="block font-medium text-foreground truncate" title={e.userName}>{e.userName}</span>
                          <span className="block text-xs text-muted-foreground truncate" title={e.roleName}>{e.roleName}</span>
                        </td>
                        <td className={`${table.td} text-[#3d5173] truncate`} title={e.module}>{e.module}</td>
                        <td className={table.td}>
                          <span className="h-6 px-2 rounded-md bg-[#eef1f6] text-[#26395a] text-xs font-medium font-mono inline-flex items-center max-w-full truncate" title={e.action}>{e.action}</span>
                        </td>
                        <td className={`${table.td} text-[#3d5173]`}>
                          {/* สองบรรทัดแล้วตัด (ไม่ใช่บรรทัดเดียว) — รายละเอียดคือเนื้อหาหลักของบันทึก ข้อความเต็มอยู่ใน title */}
                          <span className="line-clamp-2 break-words leading-snug" title={e.details}>{e.details}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <div data-tour="audit-pages">
            <ListPagination
              page={currentPage}
              pageCount={pageCount}
              from={(currentPage - 1) * PAGE_SIZE + 1}
              to={Math.min(currentPage * PAGE_SIZE, filtered.length)}
              total={filtered.length}
              onPage={setPage}
            />
          </div>
        )}
      </ListCard>
    </div>
  );
}
