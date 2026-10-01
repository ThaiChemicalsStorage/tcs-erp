import { useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListEmpty } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import { PENDING_KIND_LABEL_KEY } from "./kindLabels";
import { ApiError } from "../../lib/apiClient";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import {
  type PendingApprovalItem, type PendingApprovalKind,
  fetchPendingApprovals, daysWaiting,
} from "../../lib/pendingApprovals";

/**
 * กล่องงานเข้า "เอกสารรออนุมัติ" ข้ามแผนก — เจ้าของขอไว้ 2026-08-28:
 * *"เพิ่มหน้าเอกสารรออนุมัติทุกอย่าง เพราะแบบเฮดคนนึงต้องอนุมัติหลายแผนก"*
 *
 * หน้านี้**ไม่อนุมัติเอง** — กดแถวแล้วเด้งไปที่ตัวเอกสาร ซึ่งเป็นที่เดียวที่ปุ่มอนุมัติอยู่
 * ตั้งใจให้เป็นแบบนั้น: การอนุมัติเอกสารต้องเกิดหลังจากเห็นตัวเอกสาร ไม่ใช่จากแถวในตาราง และแต่ละใบ
 * มีเงื่อนไขก่อนอนุมัติของตัวเอง (Scope of Work ตรวจความครบก่อน ใบสั่งผลิตเติมชื่อผู้อนุมัติให้ ฯลฯ)
 * การทำปุ่มอนุมัติรวมตรงนี้แปลว่าต้องยกตรรกะพวกนั้นมาไว้อีกที่ ซึ่งเป็นวิธีที่มันจะเริ่มเพี้ยนจากกัน
 *
 * เซิร์ฟเวอร์กรองด้วย**สิทธิ์อนุมัติ**ให้แล้ว (ดู `api/_lib/pendingApprovals.ts`) หน้านี้จึงแสดง
 * ทุกอย่างที่ได้รับมา ไม่กรองสิทธิ์ซ้ำ
 *
 * ดีไซน์ใหม่ 2026-09-30 (บอร์ด PendingApprovals): ปุ่มชนิดเอกสาร → แท็บพร้อมจำนวน · ชนิดเอกสารย้ายไปอยู่ใต้เลขที่
 */

const FILTER_ALL = "all";

/** ป้ายชนิดเอกสาร — ใช้ร่วมกับแท็บภาพรวมของแดชบอร์ด ดู kindLabels.ts */
const KIND_LABEL_KEY = PENDING_KIND_LABEL_KEY;

/** รอเกินกี่วันถึงเริ่มเตือน — ไม่ใช่กฎของบริษัท เป็นแค่เส้นให้สายตาจับได้ว่าใบไหนค้างนาน */
const STALE_DAYS = 3;

export function PendingApprovalsPage({ currentUserId, onOpen }: {
  currentUserId: string;
  onOpen: (item: PendingApprovalItem) => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<PendingApprovalItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");
  // ไม่มีใบรอ = ไม่มีจุดให้ชี้ — ทัวร์ไม่ขึ้นและไม่ถูกจำว่าเห็นแล้ว จนกว่าจะมีใบรอครั้งแรก
  const tourSteps: TourStep[] = [
    { element: '[data-tour="pending-count"]', manual: "ch5-1", popover: { title: t("tour.pending.count.title"), description: t("tour.pending.count.desc"), side: "bottom" } },
    { element: '[data-tour="pending-tabs"]', manual: "ch5-1", popover: { title: t("tour.pending.tabs.title"), description: t("tour.pending.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="pending-search"]', manual: "ch5-1", popover: { title: t("tour.pending.search.title"), description: t("tour.pending.search.desc"), side: "bottom" } },
    { element: '[data-tour="pending-waiting"]', manual: "ch5-1", popover: { title: t("tour.pending.waiting.title"), description: t("tour.pending.waiting.desc"), side: "bottom" } },
    { element: '[data-tour="pending-table"]', manual: "ch5-2", popover: { title: t("tour.pending.table.title"), description: t("tour.pending.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("pendingApprovals", currentUserId, tourSteps, { autoStart: items !== null });

  useEffect(() => {
    let cancelled = false;
    fetchPendingApprovals()
      .then((list) => { if (!cancelled) { setItems(list); setLoadError(null); } })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t("pendingApprovals.loadError"));
        setItems([]);
      });
    return () => { cancelled = true; };
  }, [t]);

  // แท็บชนิดเอกสารสร้างจากสิ่งที่ได้รับมาจริง ไม่ใช่ลิสต์ตายตัว — คนที่อนุมัติได้ชนิดเดียวจะเห็นแท็บเดียว
  const kindsPresent = useMemo(() => {
    const seen = new Map<PendingApprovalKind, number>();
    for (const it of items ?? []) seen.set(it.kind, (seen.get(it.kind) ?? 0) + 1);
    return [...seen.entries()];
  }, [items]);

  const q = searchQuery.trim().toLowerCase();
  const filtered = (items ?? [])
    .filter((it) => filterKind === FILTER_ALL || it.kind === filterKind)
    .filter((it) => !q || [it.docNumber, it.party, it.lineage, it.submittedBy, it.id].some((v) => (v ?? "").toLowerCase().includes(q)));

  const tabs = [
    { key: FILTER_ALL, label: t("quotation.filterAll"), count: items?.length ?? 0 },
    ...kindsPresent.map(([kind, count]) => ({ key: kind as string, label: t(KIND_LABEL_KEY[kind]), count })),
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.main")}
        title={t("pendingApprovals.pageTitle")}
        description={t("pendingApprovals.pageSubtitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={items !== null && items.length > 0 ? (
          <span data-tour="pending-count" className="h-8 px-3 rounded-full bg-[#fdf3e0] text-[#8a5a00] text-[13px] font-semibold inline-flex items-center gap-2">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#d89614]" />
            {t("pendingApprovals.totalCount").replace("{n}", String(items.length))}
          </span>
        ) : undefined}
      />

      {loadError && (
        <div role="alert" className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#fcebeb] border border-[#b93636]/20 text-sm text-[#b93636]">
          <AlertTriangle size={15} className="flex-shrink-0" />
          {loadError}
        </div>
      )}

      {items === null ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <ListCard>
          {items.length === 0 ? (
            <EmptyState icon={Inbox} title={t("empty.pendingApprovals.title")} description={t("empty.pendingApprovals.sub")} compact />
          ) : (
            <>
              <div data-tour="pending-tabs"><ListTabs tabs={tabs} active={filterKind} onChange={setFilterKind} ariaLabel={t("pendingApprovals.col.kind")} /></div>
              <div data-tour="pending-search">
              <ListToolbar
                search={searchQuery}
                onSearch={setSearchQuery}
                searchPlaceholder={t("pendingApprovals.searchPlaceholder")}
                count={t("pendingApprovals.docCount").replace("{n}", String(filtered.length))}
              />
              </div>
              {filtered.length === 0 ? (
                <ListEmpty title={t("pendingApprovals.noFilterResults")} />
              ) : (
                <div data-tour="pending-table" className="overflow-x-auto">
                  <table className="w-full min-w-[920px] table-fixed text-sm">
                    <thead>
                      <tr className={table.head}>
                        <th className={`${table.th} w-[210px]`}>{t("pendingApprovals.col.docNumber")}</th>
                        <th className={table.th}>{t("pendingApprovals.col.party")}</th>
                        <th className={`${table.th} w-[210px]`}>{t("pendingApprovals.col.lineage")}</th>
                        <th className={`${table.th} w-[170px]`}>{t("pendingApprovals.col.submittedBy")}</th>
                        <th data-tour="pending-waiting" className={`${table.th} w-[150px]`}>{t("pendingApprovals.col.waiting")}</th>
                        <th className={`${table.th} w-12`}><span className="sr-only">{t("pendingApprovals.openRow")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((it) => {
                        const days = daysWaiting(it.waitingSince);
                        const stale = days >= STALE_DAYS;
                        return (
                          <tr
                            key={`${it.kind}:${it.id}`}
                            tabIndex={0}
                            role="button"
                            aria-label={`${t("pendingApprovals.openRow")} ${it.docNumber || it.party}`}
                            onClick={() => onOpen(it)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(it); } }}
                            className={`${table.row} group cursor-pointer outline-none focus-visible:bg-[#f8f9fc] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                          >
                            <td className={table.td}>
                              <span className="block font-mono text-[13px] font-medium text-foreground truncate">{it.docNumber || t("common.dash")}</span>
                              <span className="block text-xs text-muted-foreground truncate">{t(KIND_LABEL_KEY[it.kind])}</span>
                            </td>
                            <td className={table.td}>
                              <span className="block font-medium text-foreground truncate" title={it.party}>{it.party || t("common.dash")}</span>
                            </td>
                            <td className={table.td}>
                              <span className="block font-mono text-[12.5px] text-[#3d5173] truncate" title={it.lineage}>{it.lineage || t("common.dash")}</span>
                            </td>
                            <td className={table.td}>
                              <span className={`block truncate ${it.submittedBy ? "text-foreground" : "text-[#8a97ad]"}`} title={it.submittedBy}>{it.submittedBy || t("common.dash")}</span>
                            </td>
                            <td className={table.td}>
                              {/* วันที่ที่แสดงคือ "แก้ไขล่าสุด" ไม่ใช่เวลากดส่งจริง สำหรับ 9 ใน 10 ชนิด —
                                  ระบบยังไม่เก็บเวลากดส่ง ดู api/_lib/pendingApprovals.ts */}
                              <span className="flex flex-col items-start gap-0.5 leading-snug">
                                <span className={`h-6 px-2.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${stale ? "bg-[#fdf3e0] text-[#8a5a00]" : "bg-[#eef1f6] text-[#3d5173]"}`}>
                                  <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${stale ? "bg-[#d89614]" : "bg-[#8a97ad]"}`} />
                                  {days === 0 ? t("pendingApprovals.waitingToday") : t("pendingApprovals.waitingDays").replace("{n}", String(days))}
                                </span>
                                <span className="text-xs text-muted-foreground">{it.waitingSince ? formatQuoteDateThai(it.waitingSince.slice(0, 10)) : t("common.dash")}</span>
                              </span>
                            </td>
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
              <div className="flex items-center gap-2 px-5 py-3.5 border-t border-[#eef1f6] text-[13px] text-muted-foreground">
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#d89614] flex-shrink-0" />
                <span>{t("pendingApprovals.footerHint").replace("{n}", String(STALE_DAYS))}</span>
              </div>
            </>
          )}
        </ListCard>
      )}
    </div>
  );
}
