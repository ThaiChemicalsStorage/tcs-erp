import { useEffect, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, LayoutDashboard, Printer } from "lucide-react";
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
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { hasTourCompleted } from "../../lib/tour";
import { ListPageHeader } from "../../components/ui/ListPage";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn } from "../../components/ui/styles";
import { TourReplayButton } from "../../components/TourReplayButton";
import { useUserDirectory } from "../../lib/userDirectory";
import { EmptyState } from "../../components/EmptyState";
import { Tabs } from "../../components/Tabs";
import { tabPanelProps } from "../../components/tabPanelProps";
import { DashboardPeriodFilter, DashboardSalesFilters, type DashboardFilterState } from "./DashboardFilterBar";
import { todayIsoBangkok } from "../../lib/dateRanges";
import { buildDashboardCsv, downloadCsv } from "./csvExport";
import { exportDashboardXlsx } from "./xlsxExport";
import { buildWorkbookSheets, vatLabelOf } from "./reportRows";
import { reportSheetsToPrintSheets } from "./reportPrintSheets";
import { buildDepartmentDashboardSheets } from "../../lib/departmentDashboardExport";
import { downloadXlsx, exportFileName, type ExportSheet } from "../../lib/tableExport";
import { TablePrintDocument } from "../../components/TablePrintDocument";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { printDate } from "../../lib/printFormat";
import { DashboardContentSkeleton, ErrorState } from "./DashboardStates";
import { DashboardDataCache, useDashboardData } from "./useDashboardData";
import { DASHBOARD_TAB_META, DEPARTMENT_META } from "./tabs/tabMeta";
import { fmtLongDate } from "./tabs/countFormat";
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
 * - ดีไซน์ใหม่ (2026-10-01, บอร์ด Dashboard*): หัวหน้าแบบหน้ารายการ (กลุ่มเมนู · ชื่อ · คำทักทาย + วันที่) ช่วงเวลาและ
 *   ปุ่ม "ส่งออก ▾" (Excel/CSV, แท็บขาย) ชิดขวาบนหัว · แถบแท็บไม่มีไอคอน · แท็บขายมีแถวตัวกรองแผนก/พนักงานขาย/VAT ใต้แท็บ
 */
export function DashboardPage({ currentUserId, can, onNavigateToQuotations, onOpenQuote, onNavigatePage, company }: {
  currentUserId: string;
  /** หัวจดหมายของใบพิมพ์ PDF (2026-10-06) */
  company: Company;
  can: (permission: Permission) => boolean;
  onNavigateToQuotations: (filter: QuotationListFilter) => void;
  onOpenQuote: (quoteId: string) => void;
  onNavigatePage: (navKey: string) => void;
}) {
  const { t, lang } = useI18n();
  const visibleTabs = visibleDashboardTabs(can);
  // ชื่อผู้ใช้สำหรับบรรทัดทักทาย — ทะเบียนผู้ใช้โหลดแบบ best-effort ใน App ยังไม่มา/ไม่มีสิทธิ์ = แสดงแค่วันที่
  const userName = useUserDirectory().byId(currentUserId)?.fullName ?? "";
  const todayText = fmtLongDate(todayIsoBangkok(), lang);
  const greeting = userName ? t("dashboard.header.greeting").replace("{name}", userName).replace("{date}", todayText) : todayText;

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

  // คำแนะนำประจำหน้า (ดีไซน์ 2026-09-30) — ขั้นที่ไม่มีบนแท็บที่เปิดอยู่ถูกข้ามเอง (availableSteps)
  // แท็บภาพรวม: ตัวเลขหลัก · เอกสารรออนุมัติ · สรุปแต่ละแผนก / แท็บขาย: สวิตช์ VAT (คงไว้ตามเจ้าของสั่ง) · ส่งออก · ตัวเลขหลัก
  const tourSteps: TourStep[] = [
    { element: '[data-tour="dashboard-filters"]', manual: "ch4-3", popover: { title: t("tour.dashboard.filters.title"), description: t("tour.dashboard.filters.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-tabs"]', manual: "ch4", popover: { title: t("tour.dashboard.tabs.title"), description: t("tour.dashboard.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-overview-kpis"]', manual: "ch4-4", popover: { title: t("tour.dashboard.overviewKpis.title"), description: t("tour.dashboard.overviewKpis.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-pending"]', manual: "ch5-1", popover: { title: t("tour.dashboard.pending.title"), description: t("tour.dashboard.pending.desc"), side: "left" } },
    { element: '[data-tour="dashboard-overview-cards"]', manual: "ch4-4", popover: { title: t("tour.dashboard.overviewCards.title"), description: t("tour.dashboard.overviewCards.desc"), side: "top" } },
    { element: '[data-tour="dashboard-vat"]', manual: "ch4-1", popover: { title: t("tour.dashboard.vat.title"), description: t("tour.dashboard.vat.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-export"]', manual: "ch4-2", popover: { title: t("tour.dashboard.export.title"), description: t("tour.dashboard.export.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-kpis"]', manual: "ch4-1", popover: { title: t("tour.dashboard.kpis.title"), description: t("tour.dashboard.kpis.desc"), side: "bottom" } },
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

  // ── ส่งออกแท็บภาพรวม/แท็บแผนก (Excel) และ PDF ทุกแท็บยกเว้นบัญชี (2026-10-06, Tuhmo #40) ──
  // ตัวเลขชุดเดียวกับที่จอแสดง (ช่วงวันที่ที่เลือก) · ไฟล์เป็นเอกสาร จึงเป็นภาษาไทยเสมอ (src/lib/departmentDashboardExport.ts)
  const [printSheets, setPrintSheets] = useState<ExportSheet[] | null>(null);
  const [exportingTab, setExportingTab] = useState(false);
  useEffect(() => {
    if (!printSheets) return;
    const reset = () => setPrintSheets(null);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [printSheets]);

  const departmentSheets = (): ExportSheet[] | null => {
    if (!tab || !departments.data) return null;
    const label = tabLabel(tab);
    return buildDepartmentDashboardSheets(departments.data, label, tab !== "overview" ? {} : {
      sales: sales.data ? {
        closedSales: sales.data.kpis.closedSales, wonDeals: sales.data.kpis.wonDeals,
        activeQuotations: sales.data.kpis.activeQuotations, activeQuotationsValue: sales.data.kpis.activeQuotationsValue,
        vatLabel: vatLabelOf(sales.data.filters.vatMode),
      } : null,
      arOutstanding: ar.data ? { net: ar.data.kpis.outstandingNet, count: ar.data.kpis.outstandingCount } : null,
    });
  };
  const exportTabXlsx = () => {
    const sheets = departmentSheets();
    if (!sheets || !tab || exportingTab) return;
    setExportingTab(true);
    downloadXlsx(exportFileName(`dashboard-${tab}`), sheets)
      .catch((err) => console.error("[dashboard] export xlsx failed", err))
      .finally(() => setExportingTab(false));
  };
  const exportPdf = () => {
    if (tab === "sales") {
      if (!sales.data) return;
      setPrintSheets(reportSheetsToPrintSheets(buildWorkbookSheets(sales.data, sales.data.filters)));
      return;
    }
    const sheets = departmentSheets();
    if (sheets) setPrintSheets(sheets);
  };
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };
  const canExportTab = tab !== null && tab !== "sales" && tab !== "accounting" && !!departments.data;

  const departmentTabProps = { result: departments, onRetry: reload, onNavigatePage };

  return (
    <>
    <div className={`flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5 ${printSheets ? "print:hidden" : ""}`}>
      <div data-tour="dashboard-title">
        <ListPageHeader
          module={t("nav.group.main")}
          title={t("dashboard.title")}
          description={greeting}
          help={<TourReplayButton variant="title" onClick={tour.start} />}
          actions={
            <>
              {tab !== null && tab !== "accounting" && tabLoading && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-[#1a5fb4] border-t-transparent animate-spin motion-reduce:animate-none flex-shrink-0" aria-hidden="true" />
                  {hasShownData && t("dashboard.refreshing")}
                </span>
              )}
              {tab !== null && tab !== "accounting" && (
                <div data-tour="dashboard-filters">
                  <DashboardPeriodFilter filters={filters} onChange={setFilters} />
                </div>
              )}
              {tab === "sales" && sales.data?.hasAnyData && (
                <div data-tour="dashboard-export">
                  <MoreMenu
                    trigger={({ open, toggle }) => (
                      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className={open ? btn.secondary.replace("bg-white", "bg-[#f4f6fa]") : btn.secondary}>
                        <Download size={16} className="text-[#3d5173]" /> {t("dashboard.export.menu")}
                        <ChevronDown size={16} className="text-muted-foreground" />
                      </button>
                    )}
                    items={[
                      { key: "xlsx", label: exportingXlsx ? t("dashboard.export.xlsx.loading") : t("dashboard.export.xlsx"), icon: FileSpreadsheet, onSelect: exportXlsx, disabled: exportingXlsx },
                      { key: "csv", label: t("dashboard.export.csv"), icon: FileText, onSelect: exportCsv },
                      { key: "pdf", label: t("dashboard.export.pdf"), icon: Printer, onSelect: exportPdf },
                    ]}
                  />
                </div>
              )}
              {canExportTab && (
                <div data-tour="dashboard-export">
                  <MoreMenu
                    trigger={({ open, toggle }) => (
                      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className={open ? btn.secondary.replace("bg-white", "bg-[#f4f6fa]") : btn.secondary}>
                        <Download size={16} className="text-[#3d5173]" /> {t("dashboard.export.menu")}
                        <ChevronDown size={16} className="text-muted-foreground" />
                      </button>
                    )}
                    items={[
                      { key: "xlsx", label: exportingTab ? t("dashboard.export.xlsx.loading") : t("dashboard.export.xlsx"), icon: FileSpreadsheet, onSelect: exportTabXlsx, disabled: exportingTab },
                      { key: "pdf", label: t("dashboard.export.pdf"), icon: Printer, onSelect: exportPdf },
                    ]}
                  />
                </div>
              )}
            </>
          }
        />
      </div>

      {tab === null ? (
        <EmptyState icon={LayoutDashboard} title={t("dashboard.noTabs.title")} description={t("dashboard.noTabs.desc")} />
      ) : (<>
      <div className="flex flex-col gap-2.5">
        <div data-tour="dashboard-tabs">
          <Tabs
            items={visibleTabs.map((key) => ({ key, label: tabLabel(key) }))}
            active={tab}
            onChange={setRequestedTab}
            idPrefix="dashboard"
            ariaLabel={t("dashboard.tabs.label")}
          />
        </div>
        {tab === "sales" && (
          <DashboardSalesFilters
            filters={filters}
            onChange={setFilters}
            availableSalespeople={sales.data?.availableSalespeople ?? []}
            availableDepartments={sales.data?.availableDepartments ?? []}
            hidePeopleFilters={sales.data?.visibilityScope === "own"}
          />
        )}
      </div>

      <div {...tabPanelProps("dashboard", tab)} className="flex flex-col gap-5 outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 rounded-lg">
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
    {/* ใบพิมพ์ PDF ของแท็บที่เปิดอยู่ — อยู่นอกเนื้อหาจอ (ซึ่งถูกซ่อนตอนพิมพ์ระหว่างนี้) · ทุกตารางต่อกันใต้หัวจดหมายเดียว */}
    {printSheets && <TablePrintDocument sheets={printSheets} companyHeader={companyHeader} docLabel="DASHBOARD" printedAt={printDate(todayIsoBangkok())} />}
    </>
  );
}
