import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, HelpCircle, LayoutDashboard } from "lucide-react";
import type { DriveStep } from "driver.js";
import type { QuotationListFilter } from "../../lib/quotes";
import { fetchDashboardStats, type DashboardFilters, type DashboardStats } from "../../lib/dashboard";
import type { DepartmentDashboardResponse, DepartmentDashboardView } from "../../lib/departmentDashboard";
import type { ArDashboardStats } from "../../lib/accountingDashboard";
import type { Permission } from "../../lib/permissions";
import {
  OPERATIONS_DEPARTMENTS, canSeeDepartmentBlock, dashboardTabHash, resolveInitialTab, tabFromHash, visibleDashboardTabs,
  type DashboardTabKey,
} from "../../lib/dashboardTabs";
import { useI18n } from "../../lib/i18n";
import { useModuleTour } from "../../components/GuidedTour";
import { hasTourCompleted } from "../../lib/tour";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { Tabs } from "../../components/Tabs";
import { tabPanelProps } from "../../components/tabPanelProps";
import { DashboardFilterBar, type DashboardFilterState } from "./DashboardFilterBar";
import { todayIsoBangkok } from "./dateRanges";
import { buildDashboardCsv, downloadCsv } from "./csvExport";
import { exportDashboardXlsx } from "./xlsxExport";
import { DashboardContentSkeleton, ErrorState } from "./DashboardStates";
import { DashboardDataCache, useDashboardData } from "./useDashboardData";
import { DASHBOARD_TAB_META, DEPARTMENT_META } from "./tabs/tabMeta";
import { OverviewTab } from "./tabs/OverviewTab";
import { SalesTab } from "./tabs/SalesTab";
import { ServiceTab } from "./tabs/ServiceTab";
import { PurchasingTab } from "./tabs/PurchasingTab";
import { InventoryTab } from "./tabs/InventoryTab";
import { OperationsTab } from "./tabs/OperationsTab";
import { AccountingDashboardView } from "../accounting/AccountingDashboardPage";

const TAB_STORAGE_PREFIX = "tcs_erp_dashboard_tab:";

function readStoredTab(userId: string): string | null {
  try {
    return window.localStorage.getItem(`${TAB_STORAGE_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

function writeStoredTab(userId: string, tab: DashboardTabKey): void {
  try {
    window.localStorage.setItem(`${TAB_STORAGE_PREFIX}${userId}`, tab);
  } catch {
    // ที่เก็บในเบราว์เซอร์ใช้ไม่ได้ (โหมดส่วนตัว ฯลฯ) — แค่จำแท็บไม่ได้ ไม่กระทบอย่างอื่น
  }
}

/** แท็บที่ใช้ตัวเลขจาก `GET /api/dashboard/departments` (ขายกับบัญชีมี endpoint ของตัวเอง) */
function departmentViewOf(tab: DashboardTabKey | null): DepartmentDashboardView | null {
  return tab === "overview" || tab === "service" || tab === "purchasing" || tab === "inventory" || tab === "operations" ? tab : null;
}

/**
 * หน้าแดชบอร์ด — แท็บภาพรวม + แท็บต่อแผนก (2026-09-14)
 *
 * เจ้าของสั่ง *"หน้า Dashboard อยากให้ทำให้ดูง่ายขึ้นแยกแต่ละแผนกอย่างชัดเจนแต่ก็ยังมี Dashboard ที่ดู
 * ข้อมูลรวมได้ทุกอย่างอยู่ด้วย"* และเลือกเองว่าให้เป็น "แท็บในหน้าแดชบอร์ด" · รอบออกแบบใหม่วันเดียวกันเปลี่ยน
 * ทุกแท็บเป็นแดชบอร์ดที่มีกราฟ (docs/DASHBOARD_DESIGN.md) และรวม ผลิต · โครงการ · BD เป็นแท็บเดียว
 *
 * - เห็นเฉพาะแท็บที่มีสิทธิ์ (`src/lib/dashboardTabs.ts` — กติกาเดียวกับเซิร์ฟเวอร์)
 * - ชื่อแท็บรวมมีเฉพาะแผนกที่ผู้ใช้เห็นจริง — คนที่เห็นแค่ผลิตจะเห็นแท็บชื่อ "ผลิต"
 * - แท็บที่เปิดอยู่อยู่ใน URL (`#dashboard/inventory`) และจำไว้ต่อผู้ใช้ — รีเฟรช/ส่งลิงก์แล้วกลับมาที่เดิม
 * - หัวหน้า แถบแท็บ และตัวกรองขึ้นทันที เนื้อหาของแต่ละแท็บโหลดของตัวเอง (shell-first)
 * - ข้อมูลที่โหลดแล้วเก็บไว้จนกว่าหน้าจะถูกปิด สลับแท็บกลับมาไม่ต้องรอใหม่ (`useDashboardData.ts`)
 */
export function DashboardPage({ currentUserId, can, onNavigateToQuotations, onOpenQuote, onNavigatePage }: {
  currentUserId: string;
  can: (permission: Permission) => boolean;
  onNavigateToQuotations: (filter: QuotationListFilter) => void;
  onOpenQuote: (quoteId: string) => void;
  onNavigatePage: (navKey: string) => void;
}) {
  const { t } = useI18n();
  const visibleTabs = visibleDashboardTabs(can);

  const [requestedTab, setRequestedTab] = useState<DashboardTabKey | null>(() => resolveInitialTab({
    hashTab: tabFromHash(window.location.hash),
    storedTab: readStoredTab(currentUserId),
    visible: visibleTabs,
  }));
  // กันกรณีสิทธิ์เปลี่ยนระหว่างเปิดหน้าอยู่ — แท็บที่ไม่มีสิทธิ์แล้วตกไปแท็บแรกที่เห็น (ภาพรวมก็ติ๊กปิดได้ 2026-09-14)
  // · ไม่ได้ติ๊กแท็บไหนเลย = null แสดงหน้าว่างที่บอกให้ไปขอสิทธิ์
  const tab: DashboardTabKey | null = requestedTab && visibleTabs.includes(requestedTab) ? requestedTab : (visibleTabs[0] ?? null);

  useEffect(() => {
    if (!tab) return;
    const target = dashboardTabHash(tab);
    if (window.location.hash !== target) window.history.replaceState(null, "", target);
    writeStoredTab(currentUserId, tab);
  }, [tab, currentUserId]);

  // พิมพ์/วางลิงก์ #dashboard/xxx ขณะอยู่หน้านี้แล้ว — App ไม่ remount หน้า จึงต้องฟังเอง
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash.replace(/^#\/?/, "").split("/")[0] !== "dashboard") return;
      setRequestedTab(tabFromHash(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const [cache] = useState(() => new DashboardDataCache());
  const [filters, setFilters] = useState<DashboardFilterState>({ preset: "all", from: "", to: "", salesperson: "all", department: "all", vatMode: "pre" });
  const [retry, setRetry] = useState(0);
  const reload = () => setRetry((n) => n + 1);

  const canSales = visibleTabs.includes("sales");
  // ภาพรวมใช้ยอดขายของทุกคนในขอบเขตที่ผู้ใช้เห็นเสมอ — ตัวกรองพนักงานขาย/ฝ่ายอยู่ในแท็บขายเท่านั้น
  // จะให้การ์ดขายในภาพรวมถูกกรองด้วยค่าที่มองไม่เห็นบนจอนั้นไม่ได้
  const salesFilters: DashboardFilters = tab === "sales"
    ? { from: filters.from, to: filters.to, salesperson: filters.salesperson, department: filters.department, vatMode: filters.vatMode }
    : { from: filters.from, to: filters.to, salesperson: "all", department: "all", vatMode: filters.vatMode };

  const sales = useDashboardData<DashboardStats>(
    cache, canSales && (tab === "sales" || tab === "overview") ? { kind: "sales", filters: salesFilters, retry } : null,
  );
  const departmentView = departmentViewOf(tab);
  const departments = useDashboardData<DepartmentDashboardResponse>(
    cache, departmentView ? { kind: "departments", view: departmentView, from: filters.from, to: filters.to, retry } : null,
  );
  const ar = useDashboardData<ArDashboardStats>(cache, tab === "overview" && visibleTabs.includes("accounting") ? { kind: "arSnapshot", retry } : null);

  const tabLoading = tab === "sales" ? sales.loading
    : tab === "overview" ? departments.loading || sales.loading || ar.loading
      : departments.loading;
  const hasShownData = tab === "sales" ? !!sales.data : !!departments.data;

  const tabLabel = (key: DashboardTabKey): string => {
    if (key !== "operations") return t(DASHBOARD_TAB_META[key].labelKey);
    const seen = OPERATIONS_DEPARTMENTS.filter((d) => canSeeDepartmentBlock(d, can));
    return seen.length === OPERATIONS_DEPARTMENTS.length
      ? t(DASHBOARD_TAB_META.operations.labelKey)
      : seen.map((d) => t(DEPARTMENT_META[d].labelKey)).join(" · ");
  };

  const tourSteps: DriveStep[] = [
    { element: '[data-tour="dashboard-tabs"]', popover: { title: t("tour.dashboard.tabs.title"), description: t("tour.dashboard.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-filters"]', popover: { title: t("tour.dashboard.filters.title"), description: t("tour.dashboard.filters.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-overview-cards"]', popover: { title: t("tour.dashboard.overviewCards.title"), description: t("tour.dashboard.overviewCards.desc"), side: "top" } },
    { element: '[data-tour="dashboard-export"]', popover: { title: t("tour.dashboard.export.title"), description: t("tour.dashboard.export.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-kpis"]', popover: { title: t("tour.dashboard.kpis.title"), description: t("tour.dashboard.kpis.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-status"]', popover: { title: t("tour.dashboard.status.title"), description: t("tour.dashboard.status.desc"), side: "top" } },
    { element: '[data-tour="dashboard-indepth"]', popover: { title: t("tour.dashboard.indepth.title"), description: t("tour.dashboard.indepth.desc"), side: "top" } },
  ];
  const tour = useModuleTour("dashboard", currentUserId, tourSteps, { autoStart: hasTourCompleted(currentUserId) });

  // สร้างและดาวน์โหลดไฟล์ CSV ของข้อมูลแท็บขายปัจจุบัน
  // Builds and downloads a CSV export of the Sales tab's current data.
  const exportCsv = () => {
    if (!sales.data) return;
    const csv = buildDashboardCsv(sales.data, sales.data.filters);
    downloadCsv(`dashboard-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };
  const [exportingXlsx, setExportingXlsx] = useState(false);
  // สร้างและดาวน์โหลดไฟล์ Excel ของข้อมูลแท็บขาย ชื่อไฟล์มีช่วงวันที่ โหมด VAT และขอบเขตข้อมูลกำกับ
  // 2026-09-07: ยิงขอข้อมูลใหม่พร้อม `includeQuotations` เพื่อให้ได้รายการใบเสนอราคาทีละใบ (ชีต "รายการ
  // ใบเสนอราคา") ซึ่งหน้าจอปกติไม่โหลด ตัวกรองเดิมทุกตัวส่งไปเหมือนกัน ยอดในไฟล์จึงตรงกับที่เห็นบนจอ
  const exportXlsx = () => {
    if (!sales.data || exportingXlsx) return;
    setExportingXlsx(true);
    fetchDashboardStats({ ...salesFilters, includeQuotations: true })
      .then((full) => {
        const period = full.filters.from || full.filters.to
          ? `${full.filters.from || "start"}_${full.filters.to || todayIsoBangkok()}`
          : todayIsoBangkok();
        const vat = full.filters.vatMode === "post" ? "inclVAT" : "preVAT";
        const scope = full.ownDataOnly ? `-${full.visibilityScope}` : "";
        return exportDashboardXlsx(full, full.filters, `dashboard-report-${period}-${vat}${scope}.xlsx`);
      })
      .catch((err) => console.error("[dashboard] export xlsx failed", err))
      .finally(() => setExportingXlsx(false));
  };

  const departmentTabProps = { result: departments, onRetry: reload, onNavigatePage };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div data-tour="dashboard-title">
        <PageHeader
          title={t("dashboard.title")}
          description={t("dashboard.subtitle")}
          actions={
            <>
              {tab !== "accounting" && tabLoading && (
                hasShownData
                  ? <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3.5 h-3.5 rounded-full border-2 border-[#c9a84c] border-t-transparent animate-spin flex-shrink-0" />{t("dashboard.refreshing")}</div>
                  : <div className="w-4 h-4 rounded-full border-2 border-[#c9a84c] border-t-transparent animate-spin" />
              )}
              {tab === "sales" && sales.data?.hasAnyData && (
                <div data-tour="dashboard-export" className="flex items-center gap-2">
                  <button
                    onClick={exportXlsx}
                    disabled={exportingXlsx}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#c9a84c]/40 bg-[#c9a84c]/10 rounded-lg text-foreground hover:bg-[#c9a84c]/20 transition-all disabled:opacity-50 font-medium"
                  >
                    <FileSpreadsheet size={13} className="text-[#c9a84c]" /> {exportingXlsx ? t("dashboard.export.xlsx.loading") : t("dashboard.export.xlsx")}
                  </button>
                  <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                    <Download size={13} /> {t("dashboard.export.csv")}
                  </button>
                </div>
              )}
              <button
                onClick={tour.start}
                title={t("tour.replay")}
                aria-label={t("tour.replay")}
                className="flex items-center justify-center w-8 h-8 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all"
              >
                <HelpCircle size={14} />
              </button>
            </>
          }
        />
      </div>

      {tab === null ? (
        <EmptyState icon={LayoutDashboard} title={t("dashboard.noTabs.title")} description={t("dashboard.noTabs.desc")} />
      ) : (<>
      <div data-tour="dashboard-tabs">
        <Tabs
          items={visibleTabs.map((key) => ({ key, label: tabLabel(key), icon: DASHBOARD_TAB_META[key].icon }))}
          active={tab}
          onChange={setRequestedTab}
          idPrefix="dashboard"
          ariaLabel={t("dashboard.tabs.label")}
        />
      </div>

      {tab !== "accounting" && (
        <div data-tour="dashboard-filters">
          <DashboardFilterBar
            filters={filters}
            onChange={setFilters}
            mode={tab === "sales" ? "full" : "dateOnly"}
            availableSalespeople={sales.data?.availableSalespeople ?? []}
            availableDepartments={sales.data?.availableDepartments ?? []}
            hidePeopleFilters={sales.data?.visibilityScope === "own"}
          />
        </div>
      )}

      <div {...tabPanelProps("dashboard", tab)} className="space-y-6 outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/40 rounded-lg">
        {tab === "overview" && (
          <OverviewTab
            visibleTabs={visibleTabs}
            departments={departments}
            sales={canSales ? sales : null}
            ar={visibleTabs.includes("accounting") ? ar : null}
            onOpenTab={setRequestedTab}
            onOpenQuote={onOpenQuote}
            onOpenPendingApprovals={() => onNavigatePage("pendingApprovals")}
            onRetry={reload}
          />
        )}
        {tab === "sales" && (
          sales.data
            ? <SalesTab stats={sales.data} onNavigateToQuotations={onNavigateToQuotations} refreshAfterAction={reload} />
            : sales.error ? <ErrorState onRetry={reload} /> : <DashboardContentSkeleton />
        )}
        {tab === "service" && <ServiceTab {...departmentTabProps} />}
        {tab === "purchasing" && <PurchasingTab {...departmentTabProps} />}
        {tab === "inventory" && <InventoryTab {...departmentTabProps} />}
        {tab === "operations" && <OperationsTab {...departmentTabProps} />}
        {tab === "accounting" && <AccountingDashboardView />}
      </div>
      </>)}
    </div>
  );
}
