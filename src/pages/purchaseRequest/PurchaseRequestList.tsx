import { useState, type ReactNode } from "react";
import { ChevronRight, Zap } from "lucide-react";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListCard, ListEmpty, ListPageHeader, ListPagination, ListTabs, ListToolbar } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import type { PurchaseRequestSummary, PurchaseRequestStatus } from "../../lib/purchaseRequest";
import { useI18n } from "../../lib/i18n";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { ApprovalStatusPill, ListDateRangeSelect, StageTag } from "./docShared";
import { UrgentBadge, useAgingLabel, useDaysText } from "./purchasingAging";
import { businessDaysBetween, purchasingTargetDays, todayInThailand } from "../../lib/businessDays";
import { formatDisplayDate } from "../../lib/displayDate";

const PAGE_SIZE = 25;

type StatusTab = "all" | PurchaseRequestStatus;
type StageTab = "forwarded" | "pending" | "all";

/**
 * แถบบนการ์ดรายการ:
 * - `"status"` = แท็บสถานะเอกสาร (ทั้งหมด / Draft / รออนุมัติ / Final) — หน้าของแต่ละฝ่าย
 * - `"stage"` = แท็บขั้นของใบ (ถึงคิวจัดซื้อ / ยังอยู่ที่สโตร์ / ทั้งหมด) — กล่องงานเข้าของจัดซื้อ (2026-09-10)
 * - `"none"` = ไม่มีแท็บ — กล่องของสโตร์ ซึ่งเซิร์ฟเวอร์กรองมาให้แล้วว่าเป็นใบที่รอสโตร์เท่านั้น
 */
export type PurchaseRequestListTabs = "status" | "stage" | "none";

// แสดงรายการใบขอซื้อ: แท็บพร้อมจำนวน ค้นหา ช่วงวันที่ ตาราง และแบ่งหน้า (ดีไซน์ใหม่ 2026-09-30)
// Renders the Purchase Request list: counted tabs, search, date range, table and pagination.
export function PurchaseRequestList({
  purchaseRequests,
  currentUserId,
  onOpen,
  headerAction,
  heading,
  moduleLabel,
  showDepartment = false,
  tabs: tabsMode = "status",
}: {
  purchaseRequests: PurchaseRequestSummary[];
  currentUserId: string;
  onOpen: (id: string) => void;
  /** หัวข้อหน้า — ระบุเมื่อหน้านี้ถูกเมาต์เป็นกล่องงานเข้า ที่ไม่ใช่ใบของแผนกใดแผนกหนึ่ง */
  heading?: string;
  /** ชื่อกลุ่มเมนูเล็กเหนือชื่อหน้า (โครงการ / ผลิต / จัดซื้อ / คลังสินค้า) */
  moduleLabel?: string;
  /** เพิ่มคอลัมน์ "แผนก" — จำเป็นเฉพาะมุมมองรวมทุกฝ่าย ที่ไม่รู้จากหน้าเองว่าใบไหนของใคร */
  showDepartment?: boolean;
  tabs?: PurchaseRequestListTabs;
  /** ปุ่ม "+ สร้าง" ของหน้านั้นๆ — หน้า Page เป็นเจ้าของ state ของกล่องเลือกต้นทาง (2026-08-20) */
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  // หน้านี้ถูกเมาต์ 5 ที่ (ใบขอซื้อโครงการ / ผลิต / สโตร์เปิดเอง / กล่องรอสโตร์ / กล่องจัดซื้อ) ด้วยทัวร์เดียวกัน
  // ขั้นที่ไม่มีในหน้านั้น (ปุ่มสร้าง แท็บ คอลัมน์ขั้นหลังอนุมัติ) ถูกข้ามเองตอนเริ่มทัวร์
  const tourSteps: TourStep[] = [
    { element: '[data-tour="pr-create"]', manual: "ch18-3", popover: { title: t("tour.pr.create.title"), description: t("tour.pr.create.desc"), side: "bottom" } },
    tabsMode === "stage"
      ? { element: '[data-tour="pr-tabs"]', manual: "ch18-3", popover: { title: t("tour.pr.stageTabs.title"), description: t("tour.pr.stageTabs.desc"), side: "bottom" } }
      : { element: '[data-tour="pr-tabs"]', manual: "ch16-5", popover: { title: t("tour.pr.tabs.title"), description: t("tour.pr.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="pr-search"]', manual: "ch2-6", popover: { title: t("tour.pr.search.title"), description: t("tour.pr.search.desc"), side: "bottom" } },
    { element: '[data-tour="pr-stage-col"]', manual: "ch18-1", popover: { title: t("tour.pr.stage.title"), description: t("tour.pr.stage.desc"), side: "bottom" } },
    { element: '[data-tour="pr-table"]', popover: { title: t("tour.pr.table.title"), description: t("tour.pr.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("purchaseRequest", currentUserId, tourSteps);
  const departmentLabel: Record<string, string> = {
    project: t("purchaseRequest.dept.project"),
    production: t("purchaseRequest.dept.production"),
    general: t("purchaseRequest.dept.general"),
  };
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  /**
   * ตั้งต้นที่ "ถึงคิวจัดซื้อ" ไม่ใช่ "ทั้งหมด" — เปิดหน้ามาแล้วต้องเห็นงานที่ทำได้จริงก่อน
   * ใบที่ยังรอสโตร์อยู่ดูได้จากแท็บข้าง ๆ ไม่ได้ถูกซ่อนหายไป
   */
  const [stageTab, setStageTab] = useState<StageTab>("forwarded");
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  /** กรองเฉพาะงานด่วน (2026-10-02) */
  const [urgentOnly, setUrgentOnly] = useState(false);
  const agingLabel = useAgingLabel();
  const daysText = useDaysText();
  const today = todayInThailand();
  const [page, setPage] = useState(1);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  /**
   * "ถึงคิวจัดซื้อแล้ว" = อนุมัติแล้ว **และ**สโตร์ส่งต่อมาแล้ว · ใบก่อน 2026-09-09 ไม่มีฟิลด์ `storeStage`
   * เลย ซึ่งแปลว่าวิ่งตรงไปจัดซื้อตามกติกาเดิม จึงนับรวมด้วย — เงื่อนไขเดียวกับ `?storeStage=forwarded`
   * ฝั่งเซิร์ฟเวอร์ (`purchaseRequestHandler.ts`) ถ้าสองที่นี้ไม่ตรงกัน หน้าจอกับ API จะตอบคนละอย่าง
   */
  const atPurchasing = (p: PurchaseRequestSummary) => p.status === "Final" && (p.storeStage === "forwarded" || !p.storeStage);
  const atStore = (p: PurchaseRequestSummary) => p.status === "Final" && p.storeStage === "pending";
  const matchesStage = (p: PurchaseRequestSummary, s: StageTab) => s === "all" || (s === "forwarded" ? atPurchasing(p) : atStore(p));

  const items = purchaseRequests.map((p) => ({ ...p, jobCode: p.jobCode ?? "", status: p.status ?? "Draft" }));
  /** วันทำการที่ใบค้างอยู่ที่จัดซื้อ (นับถึงวันนี้ หรือถึงวันที่ออกใบสั่งซื้อครบ) — null = ยังไม่ถึงจัดซื้อ */
  const purchasingDays = (p: PurchaseRequestSummary) =>
    p.purchasingReceivedAt ? businessDaysBetween(p.purchasingReceivedAt, p.purchasingCompletedAt || today) : null;

  const statusTabs = [
    { key: "all" as const, label: t("quotation.filterAll"), count: items.length },
    { key: "Draft" as const, label: t("materialRequisition.status.draft"), count: items.filter((p) => p.status === "Draft").length },
    { key: "PendingApproval" as const, label: t("materialRequisition.status.pendingApproval"), count: items.filter((p) => p.status === "PendingApproval").length },
    { key: "Final" as const, label: t("materialRequisition.status.final"), count: items.filter((p) => p.status === "Final").length },
  ];
  const stageTabs = [
    { key: "forwarded" as const, label: t("purchaseRequest.stageFilter.forwarded"), count: items.filter((p) => matchesStage(p, "forwarded")).length },
    { key: "pending" as const, label: t("purchaseRequest.stageFilter.pending"), count: items.filter((p) => matchesStage(p, "pending")).length },
    { key: "all" as const, label: t("quotation.filterAll"), count: items.length },
  ];

  const dateRangeResolved = resolveRange(dateRange);
  const filtered = items
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((p) => (tabsMode === "stage" ? matchesStage(p, stageTab)
      : tabsMode === "status" ? statusTab === "all" || p.status === statusTab
      : true))
    .filter((p) => !urgentOnly || p.urgent)
    .filter((p) => !normalizedSearch || [p.id, p.jobCode].some((v) => v.toLowerCase().includes(normalizedSearch)));
  /**
   * กล่องงานเข้าของจัดซื้อ: งานด่วนขึ้นก่อน แล้วเรียงตามค้างนานสุด (2026-10-02) — ใบที่ออกใบสั่งซื้อครบแล้ว
   * ไปอยู่ท้าย · หน้าอื่นคงลำดับเดิมของเซิร์ฟเวอร์ (แก้ไขล่าสุดก่อน)
   */
  if (tabsMode === "stage") {
    const waiting = (p: PurchaseRequestSummary) => !!p.purchasingReceivedAt && !p.purchasingCompletedAt;
    filtered.sort((a, b) => {
      if (waiting(a) !== waiting(b)) return waiting(a) ? -1 : 1;
      if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
      return (purchasingDays(b) ?? -1) - (purchasingDays(a) ?? -1);
    });
  }
  const urgentCount = items.filter((p) => p.urgent).length;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  /** ป้ายขั้นหลังอนุมัติ — สโตร์ (2026-09-09) และจัดซื้อ (2026-09-21) · ใบเก่าที่ไม่มีฟิลด์ไม่ขึ้นป้าย ซึ่งถูกต้อง */
  const stageTags = (p: PurchaseRequestSummary) => {
    if (p.status !== "Final") return [];
    const tags: ReactNode[] = [];
    if (p.storeStage === "pending") tags.push(<StageTag key="store" tone="amber">{t("purchaseRequest.stage.pending")}</StageTag>);
    else if (p.storeStage === "forwarded") tags.push(<StageTag key="store" tone="blue">{t("purchaseRequest.stage.forwarded")}</StageTag>);
    else if (p.storeStage === "closed") tags.push(<StageTag key="store" tone="green">{t("purchaseRequest.stage.closed")}</StageTag>);
    // "review" ไม่ขึ้นป้าย เพราะป้ายสโตร์ "รอจัดซื้อ" บอกอยู่แล้ว
    if (p.purchasingStage === "approved") tags.push(<StageTag key="purchasing" tone="green">{t("purchaseRequestDoc.purchasing.stageBadge")}</StageTag>);
    return tags;
  };

  /**
   * ตัวนับวันทำการ (2026-10-02) — แต่ละหน้าดูคนละช่วง:
   * - กล่องจัดซื้อ: ค้างที่จัดซื้อกี่วัน + ป้ายเทียบเป้า (ปกติ 7 / ด่วน 3)
   * - กล่องสโตร์: รอสโตร์มาแล้วกี่วัน (นับจากวันอนุมัติ)
   * - หน้าของฝ่าย: ส่งขอมาแล้วกี่วัน + บรรทัดย่อยบอกว่าค้างที่ไหน
   */
  const doneText = (n: number) => (n === 0 ? t("purchaseRequest.age.doneSameDay") : t("purchaseRequest.age.doneIn").replace("{n}", String(n)));
  const ageCell = (p: PurchaseRequestSummary): ReactNode => {
    const muted = (text: string) => <span className="text-[13px] text-[#8a97ad]">{text}</span>;
    const pDays = purchasingDays(p);
    const target = purchasingTargetDays(p.urgent);
    if (tabsMode === "stage") {
      if (pDays === null) return muted(t("purchaseRequest.age.notAtPurchasing"));
      if (p.purchasingCompletedAt) {
        // ออกครบแล้ว: เขียว = ทันเป้า · แดง = เกินเป้า (ตัวเลขนี้คือ KPI ของใบนั้นจริง ๆ)
        const late = pDays > target;
        return <span className={`text-[13px] font-semibold ${late ? "text-[#b93636]" : "text-[#1b7f4f]"}`}>{doneText(pDays)}</span>;
      }
      const state = agingLabel(pDays, target);
      return (
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums min-w-[56px]">{daysText(pDays)}</span>
          <StageTag tone={state.tag}>{state.text}</StageTag>
        </span>
      );
    }
    if (tabsMode === "none") {
      const days = p.approvedAt ? businessDaysBetween(p.approvedAt, today) : null;
      return days === null ? muted("—") : <span className="text-sm font-semibold tabular-nums">{daysText(days)}</span>;
    }
    if (p.status === "Draft" || !p.submittedAt) return muted(t("purchaseRequest.age.notSubmitted"));
    const end = p.purchasingCompletedAt || (p.storeStage === "closed" ? p.approvedAt || today : today);
    const total = businessDaysBetween(p.submittedAt, end) ?? 0;
    const finished = !!p.purchasingCompletedAt || p.storeStage === "closed";
    const lateAtPurchasing = !!p.purchasingCompletedAt && pDays !== null && pDays > target;
    const sub = pDays !== null && !p.purchasingCompletedAt
      ? (() => {
          const state = agingLabel(pDays, target);
          return { text: `${t("purchaseRequest.age.atPurchasingShort").replace("{n}", String(pDays))}${state.tone === "ok" ? "" : ` · ${state.text}`}`, tone: state.tone };
        })()
      : null;
    return (
      <span className="flex flex-col leading-tight gap-0.5">
        <span className={`text-sm font-semibold tabular-nums ${lateAtPurchasing ? "text-[#b93636]" : finished ? "text-[#1b7f4f]" : "text-foreground"}`}>
          {finished ? doneText(total) : daysText(total)}
        </span>
        {sub && <span className={`text-xs font-medium ${sub.tone === "over" ? "text-[#b93636]" : sub.tone === "due" ? "text-[#8a5a00]" : "text-muted-foreground"}`}>{sub.text}</span>}
      </span>
    );
  };

  const formCode = <span className="font-mono text-xs">{t("purchaseRequest.pageSubtitle")}</span>;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={<span className="inline-flex items-center gap-2">{moduleLabel}{moduleLabel && <span className="text-[#c3ccda]">·</span>}{formCode}</span>}
        title={heading ?? t("purchaseRequest.pageTitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={headerAction}
      />

      <ListCard>
        <div data-tour="pr-filters">
          {tabsMode !== "none" && (
            <div data-tour="pr-tabs">
              {tabsMode === "status" && (
                <ListTabs tabs={statusTabs} active={statusTab} onChange={resetPage(setStatusTab)} ariaLabel={t("purchaseRequest.tabsAria")} />
              )}
              {tabsMode === "stage" && (
                <ListTabs tabs={stageTabs} active={stageTab} onChange={resetPage(setStageTab)} ariaLabel={t("purchaseRequest.stageTabsAria")} />
              )}
            </div>
          )}
          <div data-tour="pr-search">
            <ListToolbar
              search={searchQuery}
              onSearch={resetPage(setSearchQuery)}
              searchPlaceholder={t("purchaseRequest.searchPlaceholder")}
              count={<span role="status" aria-live="polite">{t("purchaseRequest.stageFilter.count").replace("{n}", String(filtered.length))}</span>}
            >
              <ListDateRangeSelect value={dateRange} onChange={resetPage(setDateRange)} />
              <button
                type="button"
                aria-pressed={urgentOnly}
                onClick={() => { setUrgentOnly((v) => !v); setPage(1); }}
                className={`h-10 px-3 rounded-lg border text-sm font-medium inline-flex items-center gap-2 transition-colors ${urgentOnly ? "border-[#b93636] bg-[#fcebeb] text-[#b93636]" : "border-[#c3ccda] bg-white text-foreground hover:bg-[#f4f6fa]"}`}
              >
                <Zap size={16} aria-hidden="true" /> {t("purchaseRequest.urgent.filter")}
                <span className={`min-w-[22px] h-5 px-1.5 rounded-full text-xs font-semibold inline-flex items-center justify-center ${urgentOnly ? "bg-[#b93636] text-white" : "bg-[#fcebeb] text-[#b93636]"}`}>{urgentCount}</span>
              </button>
            </ListToolbar>
          </div>
        </div>

        <div data-tour="pr-table" className="min-w-0">
          {items.length === 0 ? (
            <ListEmpty title={t("purchaseRequest.empty.title")} hint={t("purchaseRequest.empty.description")} />
          ) : filtered.length === 0 ? (
            <ListEmpty title={t("purchaseRequest.noFilterResults")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className={table.head}>
                    <th className={table.th}>{t("purchaseRequest.col.id")}</th>
                    <th className={table.th}>{t("purchaseRequest.col.jobCode")}</th>
                    {showDepartment && <th className={table.th}>{t("purchaseRequest.col.department")}</th>}
                    <th className={table.th}>{t("purchaseRequest.col.status")}</th>
                    {!showDepartment && <th data-tour="pr-stage-col" className={table.th}>{t("purchaseRequest.col.afterApproval")}</th>}
                    {tabsMode === "stage" && <th className={table.th}>{t("purchaseRequest.col.arrived")}</th>}
                    <th className={table.th} title={t("purchaseRequest.age.rule")}>
                      {tabsMode === "stage" ? t("purchaseRequest.col.ageAtPurchasing")
                        : tabsMode === "none" ? t("purchaseRequest.col.ageAtStore")
                        : t("purchaseRequest.col.ageSinceSubmit")}
                    </th>
                    <th className={`${table.th} w-10`} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => {
                    const tags = stageTags(p);
                    return (
                      <tr
                        key={p.id}
                        tabIndex={0}
                        role="button"
                        aria-label={`${t("purchaseRequest.openRow")} ${p.id}`}
                        onClick={() => onOpen(p.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p.id); } }}
                        className={`${table.row} group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                      >
                        <td className={`${table.td} whitespace-nowrap`}>
                          <span className="flex items-center gap-2">
                            <span className={table.code}>{p.id}</span>
                            {p.urgent && <UrgentBadge />}
                          </span>
                        </td>
                        <td className={`${table.td} font-mono text-[13px] whitespace-nowrap ${p.jobCode ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>{p.jobCode || "—"}</td>
                        {showDepartment && (
                          <td className={table.td}><StageTag tone="grey">{departmentLabel[p.ownerDepartment ?? "project"]}</StageTag></td>
                        )}
                        <td className={table.td}>
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <ApprovalStatusPill status={p.status} />
                            {showDepartment && tags}
                          </span>
                        </td>
                        {!showDepartment && (
                          <td className={table.td}>
                            {tags.length > 0 ? <span className="flex items-center gap-1.5 flex-wrap">{tags}</span> : <span className="text-[#8a97ad]">—</span>}
                          </td>
                        )}
                        {tabsMode === "stage" && (
                          <td className={`${table.td} text-[13px] whitespace-nowrap ${p.purchasingReceivedAt ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>
                            {p.purchasingReceivedAt ? formatDisplayDate(p.purchasingReceivedAt) : "—"}
                          </td>
                        )}
                        <td className={`${table.td} whitespace-nowrap`}>{ageCell(p)}</td>
                        <td className={table.td}>
                          <ChevronRight size={16} className="text-[#a3aec2] group-hover:text-foreground transition-colors ml-auto" aria-hidden="true" />
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
          <ListPagination
            page={currentPage}
            pageCount={pageCount}
            from={(currentPage - 1) * PAGE_SIZE + 1}
            to={Math.min(currentPage * PAGE_SIZE, filtered.length)}
            total={filtered.length}
            onPage={setPage}
          />
        )}
      </ListCard>
    </div>
  );
}
