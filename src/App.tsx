import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, Settings, Package,
  ChevronRight, Menu, X, ChevronDown, Loader2, AlertTriangle, RotateCw,
  LogOut, type LucideIcon, FileText, Users as UsersIcon, ShieldCheck, ScrollText, HelpCircle, Contact, Layers, ClipboardList, Truck, BookOpen, Wrench, Receipt,
  Banknote, FileCheck, Wallet, CalendarDays, BarChart3, Boxes, PackagePlus, Briefcase, Package2, Hammer, ShoppingCart, ShoppingBag, Factory,
} from "lucide-react";
import { type Company, defaultCompany, fetchCompany } from "./lib/storage";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "./lib/products";
import { type JobType, fetchJobTypes } from "./lib/jobTypes";
import { type Customer, fetchCustomers } from "./lib/customers";
import { type Quote, type QuotationListFilter, fetchQuotes } from "./lib/quotes";
import { type User, fetchUsers, initials } from "./lib/users";
import { type Role, fetchRoles, hasPermission, userIsSuperAdmin, roleNameFor } from "./lib/roles";
import { resolveNav } from "./lib/navResolution";
import { NavigationGuardContext, useNavigationGuardHost } from "./hooks/useNavigationGuard";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
import { type Department, fetchDepartments } from "./lib/departments";
import { type Team, fetchTeams } from "./lib/teams";
import type { Permission } from "./lib/permissions";
import type { ArDocumentType } from "./lib/accounting";
import type { SearchHit } from "./lib/search";
import { fetchSession, setupSuperAdmin, login, logout } from "./lib/session";
import { ApiError } from "./lib/apiClient";
import {
  type Notification, fetchNotifications,
  markNotificationRead as apiMarkNotificationRead,
  markAllNotificationsRead as apiMarkAllNotificationsRead,
  deleteNotification as apiDeleteNotification,
} from "./lib/notifications";
import { logAudit } from "./lib/auditLog";
import { hasTourCompleted, markTourCompleted } from "./lib/tour";
import { NotificationBell } from "./components/NotificationBell";
import { WhatsNewPanel } from "./components/WhatsNewPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GlobalSearch } from "./components/GlobalSearch";
import { BrandMark } from "./components/BrandMark";
import { useGuidedTour } from "./components/GuidedTour";
import { useI18n, type TranslationKey } from "./lib/i18n";
import type { SetupWizardFields } from "./pages/SetupWizardPage";

const SetupWizardPage = lazy(() => import("./pages/SetupWizardPage").then((m) => ({ default: m.SetupWizardPage })));
const SignInPage = lazy(() => import("./pages/SignInPage").then((m) => ({ default: m.SignInPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const ProductsPage = lazy(() => import("./pages/products/ProductsPage").then((m) => ({ default: m.ProductsPage })));
const QuotationPage = lazy(() => import("./pages/quotation/QuotationPage").then((m) => ({ default: m.QuotationPage })));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const UserManagementPage = lazy(() => import("./pages/admin/UserManagementPage").then((m) => ({ default: m.UserManagementPage })));
const RoleManagementPage = lazy(() => import("./pages/admin/RoleManagementPage").then((m) => ({ default: m.RoleManagementPage })));
const DepartmentManagementPage = lazy(() => import("./pages/admin/DepartmentManagementPage").then((m) => ({ default: m.DepartmentManagementPage })));
const AuditLogPage = lazy(() => import("./pages/admin/AuditLogPage").then((m) => ({ default: m.AuditLogPage })));
const CustomersPage = lazy(() => import("./pages/customers/CustomersPage").then((m) => ({ default: m.CustomersPage })));
const TemplateManagementPage = lazy(() => import("./pages/templates/TemplateManagementPage").then((m) => ({ default: m.TemplateManagementPage })));
const ScopeOfWorkPage = lazy(() => import("./pages/scopeOfWork/ScopeOfWorkPage").then((m) => ({ default: m.ScopeOfWorkPage })));
const DeliveryOrderPage = lazy(() => import("./pages/deliveryOrder/DeliveryOrderPage").then((m) => ({ default: m.DeliveryOrderPage })));
const ProjectPage = lazy(() => import("./pages/project/ProjectPage").then((m) => ({ default: m.ProjectPage })));
const MaterialRequisitionPage = lazy(() => import("./pages/materialRequisition/MaterialRequisitionPage").then((m) => ({ default: m.MaterialRequisitionPage })));
const JobOrderPage = lazy(() => import("./pages/jobOrder/JobOrderPage").then((m) => ({ default: m.JobOrderPage })));
const PurchaseRequestPage = lazy(() => import("./pages/purchaseRequest/PurchaseRequestPage").then((m) => ({ default: m.PurchaseRequestPage })));
const ProductionOrderPage = lazy(() => import("./pages/productionOrder/ProductionOrderPage").then((m) => ({ default: m.ProductionOrderPage })));
const PurchaseOrderPage = lazy(() => import("./pages/purchaseOrder/PurchaseOrderPage").then((m) => ({ default: m.PurchaseOrderPage })));
const ServicePage = lazy(() => import("./pages/service/ServicePage").then((m) => ({ default: m.ServicePage })));
const ServiceTemplateManagement = lazy(() => import("./pages/service/ServiceTemplateManagement").then((m) => ({ default: m.ServiceTemplateManagement })));
const AccountingPage = lazy(() => import("./pages/accounting/AccountingPage").then((m) => ({ default: m.AccountingPage })));
const ArDocumentListPage = lazy(() => import("./pages/accounting/ArDocumentListPage").then((m) => ({ default: m.ArDocumentListPage })));
const ArMonthlyReportPage = lazy(() => import("./pages/accounting/ArMonthlyReportPage").then((m) => ({ default: m.ArMonthlyReportPage })));
const AccountingDashboardPage = lazy(() => import("./pages/accounting/AccountingDashboardPage").then((m) => ({ default: m.AccountingDashboardPage })));
const StockPage = lazy(() => import("./pages/stock/StockPage").then((m) => ({ default: m.StockPage })));
const ProductRequestPage = lazy(() => import("./pages/productRequest/ProductRequestPage").then((m) => ({ default: m.ProductRequestPage })));

// แสดงสถานะกำลังโหลดหน้าย่อยระหว่างรอโหลดโค้ด (Suspense fallback) พร้อมข้อความสำหรับ screen reader
// Loading placeholder shown as the Suspense fallback for every lazy-loaded page, with a screen-reader label
function PageLoading() {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex items-center justify-center p-6" role="status" aria-live="polite">
      <div className="space-y-3 w-full max-w-3xl">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      <span className="sr-only">{t("boot.sectionLoading")}</span>
    </div>
  );
}

// แสดงหน้าจอโหลดตอนเริ่มแอป ระหว่างตรวจสอบ session ครั้งแรก
// Boot-time loading screen shown while the initial session check is in flight
function BootLoading() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center" role="status" aria-live="polite">
      <img src="/logo.png" alt="Thai Chemicals Storage ERP" className="h-14 w-auto object-contain animate-pulse" />
      <span className="sr-only">{t("boot.loading")}</span>
    </div>
  );
}

// แสดงหน้าจอ error พร้อมปุ่มลองใหม่ เมื่อตรวจสอบ session ตอนเริ่มแอปไม่สำเร็จ
// Shown when the initial session check itself fails, with a retry button
function BootError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6" role="alert">
      <div className="flex flex-col items-center text-center gap-3 max-w-sm">
        <div className="w-12 h-12 rounded-full bg-[#e05252]/10 flex items-center justify-center">
          <AlertTriangle size={22} className="text-[#e05252]" />
        </div>
        <p className="text-sm font-medium text-foreground">{t("boot.error.title")}</p>
        <button onClick={onRetry} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
          <RotateCw size={14} /> {t("boot.error.retry")}
        </button>
      </div>
    </div>
  );
}

// แสดงสถานะโหลด/error เฉพาะส่วนเนื้อหา ระหว่างรอข้อมูลที่หน้านั้นๆ ต้องใช้
// Shows a loading/error placeholder for the content area while a page's required data is still in flight
function SectionLoading({ error, onRetry }: { error: boolean; onRetry: () => void }) {
  const { t } = useI18n();
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <AlertTriangle size={20} className="text-[#e05252]" />
        <p className="text-sm text-muted-foreground">{t("boot.sectionError")}</p>
        <button onClick={onRetry} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
          <RotateCw size={12} /> {t("boot.error.retry")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 p-6" role="status" aria-live="polite">
      <Loader2 size={20} className="text-muted-foreground animate-spin" />
      <p className="text-xs text-muted-foreground">{t("boot.sectionLoading")}</p>
    </div>
  );
}

type NavKey = "dashboard" | "quotations" | "quotationTemplates" | "scopeOfWork" | "deliveryOrder" | "service" | "serviceTemplates" | "accounting" | "arDeposit" | "arBilling" | "arReceipt" | "arTaxInvoice" | "arMonthly" | "accountingDashboard" | "project" | "materialRequisition" | "jobOrder" | "purchaseRequest" | "purchasingRequestInbox" | "productionOrder" | "purchaseOrder" | "productionRequisition" | "productionPurchase" | "products" | "stock" | "productRequest" | "customers" | "users" | "roles" | "departments" | "auditLog" | "settings";

type ResourceKey = "users" | "roles" | "departments" | "teams" | "company" | "products" | "categories" | "notifications" | "quotes" | "jobTypes" | "customers";
type ResourceState = "loading" | "ready" | "error";

const NAV_RESOURCES: Partial<Record<NavKey, ResourceKey[]>> = {
  quotations: ["quotes", "company", "users", "roles", "products", "categories", "jobTypes", "customers"],
  quotationTemplates: ["jobTypes", "products", "categories"],
  products: ["products", "categories"],
  stock: ["products", "categories"],
  customers: ["customers"],
  users: ["users", "roles", "departments", "teams"],
  roles: ["roles", "users"],
  departments: ["departments", "teams"],
  settings: ["company", "roles"],
};

const INITIAL_RESOURCE_STATUS: Record<ResourceKey, ResourceState> = {
  users: "loading", roles: "loading", departments: "loading", teams: "loading", company: "loading", products: "loading", categories: "loading",
  notifications: "loading", quotes: "loading", jobTypes: "loading", customers: "loading",
};

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface NavItem {
  key: NavKey;
  icon: LucideIcon;
  labelKey: TranslationKey;
  permission?: Permission;
}

const navItems: NavItem[] = [
  { key: "dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard", permission: "dashboard:view" },
  { key: "quotations", icon: FileText, labelKey: "nav.quotations", permission: "quotations:view" },
  { key: "quotationTemplates", icon: Layers, labelKey: "nav.quotationTemplates", permission: "quotationTemplates:view" },
  { key: "scopeOfWork", icon: ClipboardList, labelKey: "nav.scopeOfWork", permission: "scopeOfWork:view" },
  { key: "deliveryOrder", icon: Truck, labelKey: "nav.deliveryOrder", permission: "deliveryOrder:view" },
  { key: "service", icon: Wrench, labelKey: "nav.service", permission: "service:view" },
  { key: "serviceTemplates", icon: Layers, labelKey: "nav.serviceTemplates", permission: "serviceTemplates:view" },
  // แดชบอร์ดบัญชีอยู่บนสุดของกลุ่ม (ตามคำสั่งเจ้าของ 2026-08-18) — เป็นจุดเริ่มดูภาพรวมก่อนไล่เข้าเอกสารแต่ละใบ
  { key: "accountingDashboard", icon: BarChart3, labelKey: "nav.accountingDashboard", permission: "ar:view" },
  { key: "accounting", icon: Receipt, labelKey: "nav.accounting", permission: "ar:view" },
  // เอกสารบัญชีแต่ละประเภทเป็นหน้าแยกของตัวเอง ("1 ใบคือ 1 หน้า") ตามคำสั่งเจ้าของ 2026-08-18 —
  // เรียงตามลำดับที่เจ้าของแจ้งรายการเอกสารมา ดู docs/MODULES/Accounting.md
  { key: "arDeposit", icon: Banknote, labelKey: "nav.arDeposit", permission: "ar:view" },
  { key: "arBilling", icon: FileCheck, labelKey: "nav.arBilling", permission: "ar:view" },
  { key: "arReceipt", icon: Wallet, labelKey: "nav.arReceipt", permission: "ar:view" },
  { key: "arTaxInvoice", icon: FileText, labelKey: "nav.arTaxInvoice", permission: "ar:view" },
  { key: "arMonthly", icon: CalendarDays, labelKey: "nav.arMonthly", permission: "ar:view" },
  { key: "project", icon: Briefcase, labelKey: "nav.project", permission: "project:view" },
  { key: "materialRequisition", icon: Package2, labelKey: "nav.materialRequisition", permission: "materialRequisition:view" },
  { key: "jobOrder", icon: Hammer, labelKey: "nav.jobOrder", permission: "jobOrder:view" },
  { key: "purchaseRequest", icon: ShoppingCart, labelKey: "nav.purchaseRequest", permission: "purchaseRequest:view" },
  { key: "productionOrder", icon: Factory, labelKey: "nav.productionOrder", permission: "productionOrder:view" },
  // กล่องงานเข้าของฝ่ายจัดซื้อ — หน้าเดียวกับใบขอซื้อ แต่เห็นของทุกฝ่ายรวมกัน (2026-08-28)
  { key: "purchasingRequestInbox", icon: ShoppingCart, labelKey: "nav.purchasingRequestInbox", permission: "purchaseRequest:view" },
  { key: "purchaseOrder", icon: ShoppingBag, labelKey: "nav.purchaseOrder", permission: "purchaseOrder:view" },
  { key: "productionRequisition", icon: Package2, labelKey: "nav.materialRequisition", permission: "materialRequisition:view" },
  { key: "productionPurchase", icon: ShoppingCart, labelKey: "nav.purchaseRequest", permission: "purchaseRequest:view" },
  { key: "products", icon: Package, labelKey: "nav.products", permission: "products:view" },
  { key: "stock", icon: Boxes, labelKey: "nav.stock", permission: "stock:view" },
  { key: "productRequest", icon: PackagePlus, labelKey: "nav.productRequest", permission: "productRequest:view" },
  { key: "customers", icon: Contact, labelKey: "nav.customers", permission: "customers:view" },
  { key: "users", icon: UsersIcon, labelKey: "nav.users", permission: "users:manage" },
  { key: "roles", icon: ShieldCheck, labelKey: "nav.roles", permission: "roles:manage" },
  { key: "departments", icon: Layers, labelKey: "nav.departments", permission: "departments:manage" },
  { key: "auditLog", icon: ScrollText, labelKey: "nav.auditLog", permission: "auditLog:view" },
];

/** เอกสารบัญชีสี่ชนิด อยู่คนละหน้ากัน — ใช้ตอนเปิดเอกสารจากผลค้นหา (2026-08-28) */
const AR_NAV_KEY_BY_DOC_TYPE: Record<ArDocumentType, NavKey> = {
  AR: "arDeposit",
  BI: "arBilling",
  RE: "arReceipt",
  IV: "arTaxInvoice",
};

const NAV_GROUPS: { labelKey: TranslationKey; keys: NavKey[] }[] = [
  { labelKey: "nav.group.main", keys: ["dashboard"] },
  { labelKey: "nav.group.sales", keys: ["quotations", "scopeOfWork", "deliveryOrder", "quotationTemplates", "customers"] },
  { labelKey: "nav.group.service", keys: ["service", "serviceTemplates"] },
  { labelKey: "nav.group.accounting", keys: ["accountingDashboard", "accounting", "arDeposit", "arBilling", "arReceipt", "arTaxInvoice", "arMonthly"] },
  // ใบส่งมอบสินค้าโผล่ใน 3 หมวด (ขาย/โปรเจกต์/ผลิต) โดยตั้งใจ — เป็นโมดูลเดียวกันและข้อมูลชุดเดียวกัน
  // ไม่ได้ก๊อปมาสร้างใหม่ เพราะทั้งสามแผนกใช้เอกสารใบเดียวกัน (เจ้าของยืนยัน 2026-08-20) แค่ให้แต่ละ
  // แผนกเข้าถึงได้จากหมวดของตัวเองแทนที่จะต้องไปหาใต้ "ขาย"
  { labelKey: "nav.group.project", keys: ["project", "materialRequisition", "jobOrder", "purchaseRequest", "deliveryOrder"] },
  { labelKey: "nav.group.production", keys: ["productionOrder", "productionRequisition", "productionPurchase", "deliveryOrder"] },
  { labelKey: "nav.group.purchasing", keys: ["purchasingRequestInbox", "purchaseOrder"] },
  { labelKey: "nav.group.inventory", keys: ["products", "stock", "productRequest"] },
  { labelKey: "nav.group.admin", keys: ["users", "roles", "departments", "auditLog"] },
];

const NAV_LABEL_KEYS: Record<NavKey, TranslationKey> = {
  dashboard: "nav.dashboard",
  quotations: "nav.quotations",
  quotationTemplates: "nav.quotationTemplates",
  scopeOfWork: "nav.scopeOfWork",
  deliveryOrder: "nav.deliveryOrder",
  service: "nav.service",
  serviceTemplates: "nav.serviceTemplates",
  accounting: "nav.accounting",
  arDeposit: "nav.arDeposit",
  arBilling: "nav.arBilling",
  arReceipt: "nav.arReceipt",
  arTaxInvoice: "nav.arTaxInvoice",
  arMonthly: "nav.arMonthly",
  accountingDashboard: "nav.accountingDashboard",
  project: "nav.project",
  materialRequisition: "nav.materialRequisition",
  jobOrder: "nav.jobOrder",
  purchaseRequest: "nav.purchaseRequest",
  productionOrder: "nav.productionOrder",
  purchaseOrder: "nav.purchaseOrder",
  productionRequisition: "nav.materialRequisition",
  productionPurchase: "nav.purchaseRequest",
  purchasingRequestInbox: "nav.purchasingRequestInbox",
  products: "nav.products",
  stock: "nav.stock",
  productRequest: "nav.productRequest",
  customers: "nav.customers",
  users: "nav.users",
  roles: "nav.roles",
  departments: "nav.departments",
  auditLog: "nav.auditLog",
  settings: "nav.settings",
};

// อ่านหน้าปัจจุบันจาก URL hash เพื่อให้รีเฟรชแล้วไม่เด้งกลับไปหน้า dashboard
// Reads the current page from the URL hash, so a page refresh keeps the user on the same page
function navFromHash(): NavKey | null {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return raw in NAV_LABEL_KEYS ? (raw as NavKey) : null;
}

// แปลงชื่อ action ของ audit log ให้เป็นชื่อโมดูลภาษาไทย
// Maps an audit log action name to its Thai module label
function moduleForAction(action: string): string {
  if (action.startsWith("Quotation") || action === "Status Changed") return "ใบเสนอราคา";
  if (action.startsWith("User") || action === "Password Reset") return "ผู้ใช้งาน";
  if (action.startsWith("Role") || action === "Permission Changed") return "บทบาทและสิทธิ์";
  if (action.startsWith("Company")) return "การตั้งค่า";
  if (action.startsWith("Customer")) return "ลูกค้า";
  if (action.startsWith("Profile") || action.startsWith("Signature")) return "โปรไฟล์";
  if (action.startsWith("Product")) return "คลังสินค้า";
  return "ระบบ";
}

type BootStatus = "loading" | "needsSetup" | "signedOut" | "ready";

// คอมโพเนนต์หลักของแอป จัดการ session, โหลดข้อมูลตั้งต้น, และแสดงผลชั้น sidebar/topbar/หน้าเนื้อหา
// The app's root component — manages the session, loads boot-time data, and renders the sidebar/topbar/page shell
export default function App() {
  const { t } = useI18n();
  const [bootStatus, setBootStatus] = useState<BootStatus>("loading");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 768));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavPanelRef = useRef<HTMLElement>(null);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const [activeNav, setActiveNav] = useState<NavKey>(() => navFromHash() ?? "dashboard");
  // Bumped on every sidebar click (including re-clicking the already-active item) so the page
  // remounts and drops back to its list view — activeNav alone doesn't change when re-clicking
  // the same nav item, so the ErrorBoundary/page key below needs this to force a reset.
  const [navBump, setNavBump] = useState(0);
  // ทุกทางที่พาผู้ใช้ออกจากหน้าปัจจุบันต้องผ่านตัวนี้ — รวมถึงการกดเมนูเดิมซ้ำ เพราะ navBump สั่ง remount
  // ทำให้หน้าเอกสารที่เปิดค้างอยู่ถูกถอดทิ้งเหมือนกัน ถ้าไม่มีอะไรค้าง proceed() จะถูกเรียกทันทีใน tick เดิม
  //
  // Every path that takes the user off the current page routes through this, including re-clicking
  // the already-active nav item: `navBump` remounts the page and destroys an open editor just the
  // same. With nothing at risk it calls `proceed()` synchronously, exactly as before.
  const navGuard = useNavigationGuardHost();
  const guardedNav = navGuard.requestLeave;

  useEffect(() => {
    const onHashChange = () => {
      const nav = navFromHash();
      if (nav) setActiveNav(nav);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quotationListFilter, setQuotationListFilter] = useState<QuotationListFilter | null>(null);
  const [quotationDeepLinkId, setQuotationDeepLinkId] = useState<string | null>(null);
  const [customerDeepLinkId, setCustomerDeepLinkId] = useState<string | null>(null);
  const [productDeepLinkId, setProductDeepLinkId] = useState<string | null>(null);
  const [userDeepLinkId, setUserDeepLinkId] = useState<string | null>(null);
  const [quotationTemplateDeepLink, setQuotationTemplateDeepLink] = useState<{ jobTypeCode: string; templateId: string } | null>(null);
  const [scopeOfWorkDeepLinkId, setScopeOfWorkDeepLinkId] = useState<string | null>(null);
  const [deliveryOrderDeepLinkId, setDeliveryOrderDeepLinkId] = useState<string | null>(null);
  const [projectDeepLinkId, setProjectDeepLinkId] = useState<string | null>(null);
  const [materialRequisitionDeepLinkId, setMaterialRequisitionDeepLinkId] = useState<string | null>(null);
  const [jobOrderDeepLinkId, setJobOrderDeepLinkId] = useState<string | null>(null);
  const [purchaseRequestDeepLinkId, setPurchaseRequestDeepLinkId] = useState<string | null>(null);
  const [productRequestDeepLinkId, setProductRequestDeepLinkId] = useState<string | null>(null);
  const [productionOrderDeepLinkId, setProductionOrderDeepLinkId] = useState<string | null>(null);
  const [purchaseOrderDeepLinkId, setPurchaseOrderDeepLinkId] = useState<string | null>(null);
  // เอกสารบัญชีมีสี่ชนิดอยู่คนละหน้า จึงต้องพก docType มาด้วยเพื่อรู้ว่าจะเปิดหน้าไหน (2026-08-28)
  const [arDocumentDeepLink, setArDocumentDeepLink] = useState<{ docType: ArDocumentType; id: string } | null>(null);
  const [serviceReportDeepLinkId, setServiceReportDeepLinkId] = useState<string | null>(null);
  const [templateCreateForJobType, setTemplateCreateForJobType] = useState<{ jobTypeCode: string; jobTypeName: string; seq: number } | null>(null);
  const templateCreateSeq = useRef(0);
  const [pageAction, setPageAction] = useState<{ nav: NavKey; action: "create" | "categories"; seq: number } | null>(null);
  const pageActionSeq = useRef(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [company, setCompany] = useState<Company>(defaultCompany);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [resourceStatus, setResourceStatus] = useState<Record<ResourceKey, ResourceState>>(INITIAL_RESOURCE_STATUS);
  const [bootError, setBootError] = useState(false);

  const [showTourPrompt, setShowTourPrompt] = useState(false);
  const tour = useGuidedTour(() => {
    setShowTourPrompt(false);
    if (currentUser) markTourCompleted(currentUser.id);
  });

  // ติดตามผลของการโหลดข้อมูลแต่ละอย่างแยกกัน อัปเดตสถานะเป็น ready/error ทันทีที่ request นั้นเสร็จ
  // Tracks one boot-data fetch independently, flipping its own resourceStatus entry to ready/error as soon as it resolves
  const trackResource = useCallback(<T,>(key: ResourceKey, promise: Promise<T>, onSuccess: (v: T) => void) => {
    promise
      .then((v) => { onSuccess(v); setResourceStatus((s) => ({ ...s, [key]: "ready" })); })
      .catch(() => { setResourceStatus((s) => ({ ...s, [key]: "error" })); });
  }, []);
  // ยิงคำขอโหลดข้อมูลตั้งต้นทั้งหมดพร้อมกันแบบแยกอิสระ ไม่รอกันเป็นชุดเดียว
  // Fires every boot-time data fetch independently, rather than one blocking Promise.all
  const loadDomainData = useCallback(() => {
    setResourceStatus(INITIAL_RESOURCE_STATUS);
    trackResource("users", fetchUsers(), setUsers);
    trackResource("roles", fetchRoles(), setRoles);
    trackResource("departments", fetchDepartments(), setDepartments);
    trackResource("teams", fetchTeams(), setTeams);
    trackResource("company", fetchCompany(), setCompany);
    trackResource("products", fetchProducts(), setProducts);
    trackResource("categories", fetchCategories(), setCategories);
    trackResource("notifications", fetchNotifications(), setNotifications);
    trackResource("quotes", fetchQuotes(), setQuotes);
    trackResource("jobTypes", fetchJobTypes(), setJobTypes);
    trackResource("customers", fetchCustomers().catch(() => []), setCustomers);
  }, [trackResource]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let session;
      try {
        session = await fetchSession();
      } catch {
        if (!cancelled) setBootError(true);
        return;
      }
      if (cancelled) return;
      if (session.needsSetup) { setBootStatus("needsSetup"); return; }
      if (!session.user) { setBootStatus("signedOut"); return; }
      setCurrentUser(session.user);
      setBootStatus("ready");
      loadDomainData();
    })();
    return () => { cancelled = true; };
  }, [loadDomainData]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const panel = mobileNavPanelRef.current;
    const items = panel
      ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null)
      : [];
    items[0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMobileNavOpen(false); return; }
      if (e.key !== "Tab" || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    const trigger = mobileNavTriggerRef.current;
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setUserMenuOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [userMenuOpen]);

  useEffect(() => {
    if (bootStatus !== "ready") return;
    const refetch = () => {
      if (document.hidden) return;
      fetchNotifications().then(setNotifications).catch(() => {});
    };
    const intervalId = window.setInterval(refetch, 45_000);
    const onVisibilityChange = () => { if (!document.hidden) refetch(); };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [bootStatus]);

  const [tourCheckedForUserId, setTourCheckedForUserId] = useState<string | null>(null);
  if (bootStatus === "ready" && currentUser && tourCheckedForUserId !== currentUser.id) {
    setTourCheckedForUserId(currentUser.id);
    if (!hasTourCompleted(currentUser.id)) setShowTourPrompt(true);
  }

  const updateCompany = (next: Company) => setCompany(next);
  const updateProducts = (next: Product[]) => setProducts(next);
  const updateCategories = (next: ProductCategory[]) => setCategories(next);
  const updateUsers = (next: User[]) => {
    setUsers(next);
    setCurrentUser((prev) => (prev ? next.find((u) => u.id === prev.id) ?? prev : prev));
  };
  const updateRoles = (next: Role[]) => setRoles(next);
  const updateDepartments = (next: Department[]) => setDepartments(next);
  const updateTeams = (next: Team[]) => setTeams(next);
  const updateCurrentUser = (next: User) => {
    setCurrentUser(next);
    setUsers((prev) => prev.map((u) => (u.id === next.id ? next : u)));
  };

  const navigateToQuotations = (filter: QuotationListFilter) => guardedNav(() => {
    setQuotationListFilter(filter);
    setActiveNav("quotations");
  });
  const navigateToQuotation = (quoteId: string) => guardedNav(() => {
    setQuotationDeepLinkId(quoteId);
    setActiveNav("quotations");
  });
  const navigateToCustomer = (customerId: string) => guardedNav(() => {
    setCustomerDeepLinkId(customerId);
    setActiveNav("customers");
  });
  const navigateToProduct = (productId: string) => guardedNav(() => {
    setProductDeepLinkId(productId);
    setActiveNav("products");
  });
  const navigateToUser = (userId: string) => guardedNav(() => {
    setUserDeepLinkId(userId);
    setActiveNav("users");
  });
  const navigateToTemplate = (jobTypeCode: string, templateId: string) => guardedNav(() => {
    setQuotationTemplateDeepLink({ jobTypeCode, templateId });
    setActiveNav("quotations");
  });
  // 2026-08-28: `navigateToScopeOfWork(quotationId, scopeOfWorkId)` — which opened a Scope of Work
  // nested inside its quotation — was removed along with QuotationPage's matching props. Global
  // Search was its only caller and now uses the standalone navigator below, so every search result
  // in the app follows one rule: it opens the document on that document's own module page.
  const navigateToScopeOfWorkStandalone = (scopeOfWorkId: string) => guardedNav(() => {
    setScopeOfWorkDeepLinkId(scopeOfWorkId);
    setActiveNav("scopeOfWork");
  });
  const navigateToDeliveryOrder = (deliveryOrderId: string) => guardedNav(() => {
    setDeliveryOrderDeepLinkId(deliveryOrderId);
    setActiveNav("deliveryOrder");
  });
  const navigateToProject = (projectId: string) => guardedNav(() => {
    setProjectDeepLinkId(projectId);
    setActiveNav("project");
  });
  // ฝ่ายโครงการกับฝ่ายผลิตใช้เอกสารชนิดเดียวกันแต่คนละหน้า — ผลค้นหาพก ownerDepartment มาบอกว่าหน้าไหน
  // (2026-08-28) ไม่ระบุ = ฝ่ายโครงการ ตรงกับเอกสารเก่าที่ไม่มีฟิลด์นี้ และกับผู้เรียกเดิมทุกจุด
  // "general" มีได้เฉพาะใบขอซื้อ (ใบเบิกของยังมีแค่สองแผนก) แต่ผลค้นหาใช้รูปแบบเดียวกันทุกเอกสาร
  // จึงรับค่าเดียวกันแล้วตกลงหน้าฝ่ายโครงการเป็นค่าเริ่มต้น
  const navigateToMaterialRequisition = (materialRequisitionId: string, ownerDepartment?: "project" | "production" | "general") => guardedNav(() => {
    setMaterialRequisitionDeepLinkId(materialRequisitionId);
    setActiveNav(ownerDepartment === "production" ? "productionRequisition" : "materialRequisition");
  });
  const navigateToJobOrder = (jobOrderId: string) => guardedNav(() => {
    setJobOrderDeepLinkId(jobOrderId);
    setActiveNav("jobOrder");
  });
  const navigateToPurchaseRequest = (purchaseRequestId: string, ownerDepartment?: "project" | "production" | "general") => guardedNav(() => {
    setPurchaseRequestDeepLinkId(purchaseRequestId);
    // ใบของฝ่ายอื่นไม่มีหน้าเป็นของตัวเอง — เปิดในกล่องงานเข้าของจัดซื้อ ซึ่งเป็นหน้าเดียวที่แสดงมันอยู่
    setActiveNav(ownerDepartment === "production" ? "productionPurchase" : ownerDepartment === "general" ? "purchasingRequestInbox" : "purchaseRequest");
  });
  const navigateToProductRequest = (productRequestId: string) => guardedNav(() => {
    setProductRequestDeepLinkId(productRequestId);
    setActiveNav("productRequest");
  });
  const navigateToServiceReport = (serviceReportId: string) => guardedNav(() => {
    setServiceReportDeepLinkId(serviceReportId);
    setActiveNav("service");
  });
  // ใบสั่งผลิตมี state กับ prop รออยู่แล้วตั้งแต่ตอนสร้างโมดูล แต่ไม่เคยมีใครเรียก — ต่อให้ครบ 2026-08-28
  const navigateToProductionOrder = (productionOrderId: string) => guardedNav(() => {
    setProductionOrderDeepLinkId(productionOrderId);
    setActiveNav("productionOrder");
  });
  const navigateToPurchaseOrder = (purchaseOrderId: string) => guardedNav(() => {
    setPurchaseOrderDeepLinkId(purchaseOrderId);
    setActiveNav("purchaseOrder");
  });
  const navigateToArDocument = (docType: ArDocumentType, arDocumentId: string) => guardedNav(() => {
    setArDocumentDeepLink({ docType, id: arDocumentId });
    setActiveNav(AR_NAV_KEY_BY_DOC_TYPE[docType]);
  });
  const navigateToCreateTemplateForJobType = (jobTypeCode: string, jobTypeName: string) => guardedNav(() => {
    templateCreateSeq.current += 1;
    setTemplateCreateForJobType({ jobTypeCode, jobTypeName, seq: templateCreateSeq.current });
    setActiveNav("quotationTemplates");
  });
  // ไปยังหน้าที่ระบุ (มาจากผลค้นหา) พร้อมตรวจสอบว่าเป็น NavKey ที่ถูกต้องก่อน
  // Navigates to the given page (from a search result), validating it as a real NavKey first
  const navigateToPage = (navKey: string, action?: "create" | "categories") => {
    if (!navItems.some((n) => n.key === navKey) && navKey !== "settings") return;
    const key = navKey as NavKey;
    guardedNav(() => {
      if (action) {
        pageActionSeq.current += 1;
        setPageAction({ nav: key, action, seq: pageActionSeq.current });
      }
      setActiveNav(key);
    });
  };
  const clearPageAction = () => setPageAction(null);

  /**
   * เปิดผลค้นหาหนึ่งรายการ — จุดเดียวที่แปลงชนิดของผลลัพธ์เป็นหน้าปลายทาง (2026-08-28)
   *
   * Global Search used to take one `onNavigateTo*` prop per result type. With 16 categories that
   * would have been 18 props on one component, so it now hands back a single discriminated
   * `SearchHit` and this switch picks the navigator — the same shape `NotificationBell` already
   * uses. Every branch goes through the navigators above, so the unsaved-changes guard still runs.
   */
  const openSearchResult = (hit: SearchHit) => {
    switch (hit.category) {
      case "quotations": navigateToQuotation(hit.data.id); break;
      // ไปหน้า Scope of Work ของตัวเอง ไม่ใช่ไปเปิดในหน้าใบเสนอราคาแบบเดิม — ให้ทุกชนิดเหมือนกันหมด
      case "scopeOfWorks": navigateToScopeOfWorkStandalone(hit.data.id); break;
      case "deliveryOrders": navigateToDeliveryOrder(hit.data.id); break;
      case "serviceReports": navigateToServiceReport(hit.data.id); break;
      case "projects": navigateToProject(hit.data.id); break;
      case "jobOrders": navigateToJobOrder(hit.data.id); break;
      case "productionOrders": navigateToProductionOrder(hit.data.id); break;
      case "productRequests": navigateToProductRequest(hit.data.id); break;
      // ใบเบิกของ/ใบขอซื้อ ของฝ่ายผลิตอยู่คนละหน้ากับของฝ่ายโครงการ แม้เป็นเอกสารชนิดเดียวกัน
      case "materialRequisitions": navigateToMaterialRequisition(hit.data.id, hit.data.ownerDepartment); break;
      case "purchaseRequests": navigateToPurchaseRequest(hit.data.id, hit.data.ownerDepartment); break;
      case "purchaseOrders": navigateToPurchaseOrder(hit.data.id); break;
      case "arDocuments": if (hit.data.docType) navigateToArDocument(hit.data.docType, hit.data.id); break;
      case "customers": navigateToCustomer(hit.data.id); break;
      case "products": navigateToProduct(hit.data.id); break;
      case "templates": navigateToTemplate(hit.data.jobTypeCode, hit.data.id); break;
      case "users": navigateToUser(hit.data.id); break;
      case "pages": navigateToPage(hit.data.navKey, hit.data.action); break;
    }
  };

  const refreshNotifications = () => { fetchNotifications().then(setNotifications).catch(() => {}); };
  const markNotificationRead = (id: string) => {
    apiMarkNotificationRead(id).then((updated) => {
      setNotifications((prev) => prev.map((n) => (n.id === id ? updated : n)));
    }).catch(() => {});
  };
  const markAllNotificationsRead = () => {
    apiMarkAllNotificationsRead().then(() => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }).catch(() => {});
  };
  const deleteNotification = (id: string) => {
    apiDeleteNotification(id).then(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }).catch(() => {});
  };

  const handleAudit = (action: string, details: string) => {
    if (!currentUser) return;
    logAudit({ module: moduleForAction(action), action, details }).catch(() => {});
  };

  // ทำขั้นตอนตั้งค่าเริ่มต้นระบบให้เสร็จ สร้างบัญชี Super Admin คนแรก แล้วเข้าสู่ระบบทันที
  // Completes the setup wizard, creates the first Super Admin account, and signs them in
  const handleSetupComplete = async (fields: SetupWizardFields): Promise<string | null> => {
    try {
      const created = await setupSuperAdmin(fields);
      setCurrentUser(created);
      setBootStatus("ready");
      loadDomainData();
      logAudit({
        module: "ระบบ", action: "User Created", details: `ตั้งค่าเริ่มต้นระบบ — สร้างบัญชี Super Admin คนแรก (${created.username})`,
      }).catch(() => {});
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : t("setup.errorGeneric");
    }
  };

  // เข้าสู่ระบบด้วยชื่อผู้ใช้/รหัสผ่าน แล้วโหลดข้อมูลตั้งต้นของแอป
  // Signs the user in with their identifier/password, then loads the app's boot-time data
  const handleSignIn = async (identifier: string, password: string): Promise<string | null> => {
    const result = await login(identifier, password);
    if (result.error || !result.user) return result.error;
    setCurrentUser(result.user);
    setBootStatus("ready");
    loadDomainData();
    logAudit({ module: "ระบบ", action: "Login", details: "เข้าสู่ระบบสำเร็จ" }).catch(() => {});
    return null;
  };

  // ออกจากระบบและล้างข้อมูลทั้งหมดในสถานะกลับสู่ค่าเริ่มต้น
  // Logs the user out and resets all app state back to its defaults
  const handleLogout = async () => {
    if (currentUser) {
      await logAudit({ module: "ระบบ", action: "Logout", details: "" }).catch(() => {});
    }
    await logout();
    setCurrentUser(null);
    setUsers([]);
    setRoles([]);
    setCompany(defaultCompany);
    setProducts([]);
    setCategories([]);
    setJobTypes([]);
    setCustomers([]);
    setNotifications([]);
    setQuotes([]);
    setResourceStatus(INITIAL_RESOURCE_STATUS);
    setBootStatus("signedOut");
    setUserMenuOpen(false);
    setActiveNav("dashboard");
  };

  // การตัดสินว่าจะแสดงหน้าไหน ย้ายไป src/lib/navResolution.ts แล้ว เพื่อให้เขียนเทสต์ตรง ๆ ได้
  // — กฎสำคัญคือ "ยังไม่รู้สิทธิ์ = ยังไม่ตัดสิน" (`decided: false`) ซึ่งเป็นต้นเหตุของอาการเด้งไปหน้าตั้งค่า
  //
  // The decision lives in src/lib/navResolution.ts so it can be tested directly — see the doc
  // comment there for why. `decided` is false while `roles` is still loading; nothing may be
  // rendered from a guess made in that window.
  const rolesReady = resourceStatus.roles !== "loading";
  const { visibleNavItems, effectiveNav, decided: navDecided } = resolveNav({
    activeNav,
    navItems,
    currentUser,
    roles,
    rolesReady,
    settingsKey: "settings",
  });

  // Mirrors the *rendered* page into the hash, not the requested one — so a role landing on (or
  // deep-linking to) a nav item hidden from it ends up with a URL matching what it's actually
  // looking at, and a refresh keeps it there. Declared after effectiveNav because the dependency
  // array is evaluated during render.
  //
  // Gated on bootStatus === "ready" AND roles having actually loaded: every permission check
  // above takes `roles`, and bootStatus flips to "ready" as soon as the session check resolves —
  // loadDomainData() (incl. fetchRoles()) only *starts* at that point, so there's a real render
  // (bootStatus "ready", currentUser set, roles still []) where permission checks still evaluate
  // against an empty role set. Gating on bootStatus alone still hit that window: visibleNavItems
  // still empty, effectiveNav still fell back to "settings", still got written into the hash, and
  // the hashchange listener still permanently overwrote activeNav. Waiting for
  // resourceStatus.roles to leave "loading" (ready or error) closes that window too. This was a
  // real, ~always-reproducible bug: a refresh on any page other than Settings landed back on
  // Settings every time.
  //
  // **2026-08-25**: gating only this effect fixed the URL but not the screen. `effectiveNav` is
  // recomputed every render and fell back to Settings during the same window, so a refresh still
  // *rendered* Settings for a moment before snapping back — reported as "กดรีเฟรชแล้วมันเด้งไป
  // ตั้งค่าแล้วกลับมา". The `rolesReady` guard on `activeNavAllowed` above is the other half.
  useEffect(() => {
    if (bootStatus !== "ready" || resourceStatus.roles === "loading") return;
    const target = `#${effectiveNav}`;
    if (window.location.hash === target) return;
    if (window.location.hash === "") {
      window.history.replaceState(null, "", target);
    } else {
      window.location.hash = target;
    }
  }, [effectiveNav, bootStatus, resourceStatus.roles]);
  const requiredResources = NAV_RESOURCES[effectiveNav] ?? [];
  const pageDataLoading = requiredResources.some((k) => resourceStatus[k] === "loading");
  const pageDataError = requiredResources.some((k) => resourceStatus[k] === "error");

  if (bootError) {
    return <BootError onRetry={() => window.location.reload()} />;
  }

  if (bootStatus === "loading") {
    return <BootLoading />;
  }

  if (bootStatus === "needsSetup") {
    return (
      <Suspense fallback={<BootLoading />}>
        <SetupWizardPage onComplete={handleSetupComplete} />
      </Suspense>
    );
  }

  if (bootStatus === "signedOut" || !currentUser) {
    return (
      <Suspense fallback={<BootLoading />}>
        <SignInPage onSignIn={handleSignIn} />
      </Suspense>
    );
  }

  const canManageCompany = hasPermission(currentUser, roles, "company:manage");
  const canCreateCustomers = hasPermission(currentUser, roles, "customers:create");
  const canEditCustomers = hasPermission(currentUser, roles, "customers:edit");
  const canArchiveCustomers = hasPermission(currentUser, roles, "customers:archive");
  const canCreateScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:create");
  const canEditScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:edit");
  const canFinalizeScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:finalize");
  const canPrintScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:print");
  const canDeleteScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:delete");
  const canChasePoScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:chasePo");
  const canViewDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:view");
  const canCreateDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:create");
  const canEditDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:edit");
  const canFinalizeDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:finalize");
  const canPrintDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:print");
  const canDeleteDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:delete");
  const canViewProject = hasPermission(currentUser, roles, "project:view");
  const canCreateProject = hasPermission(currentUser, roles, "project:create");
  const canEditProject = hasPermission(currentUser, roles, "project:edit");
  const canDeleteProject = hasPermission(currentUser, roles, "project:delete");
  const canCreateMaterialRequisition = hasPermission(currentUser, roles, "materialRequisition:create");
  const canEditMaterialRequisition = hasPermission(currentUser, roles, "materialRequisition:edit");
  const canFinalizeMaterialRequisition = hasPermission(currentUser, roles, "materialRequisition:finalize");
  const canPrintMaterialRequisition = hasPermission(currentUser, roles, "materialRequisition:print");
  const canDeleteMaterialRequisition = hasPermission(currentUser, roles, "materialRequisition:delete");
  const canCreateJobOrder = hasPermission(currentUser, roles, "jobOrder:create");
  const canEditJobOrder = hasPermission(currentUser, roles, "jobOrder:edit");
  const canFinalizeJobOrder = hasPermission(currentUser, roles, "jobOrder:finalize");
  const canPrintJobOrder = hasPermission(currentUser, roles, "jobOrder:print");
  const canDeleteJobOrder = hasPermission(currentUser, roles, "jobOrder:delete");
  const canCreatePurchaseRequest = hasPermission(currentUser, roles, "purchaseRequest:create");
  const canViewPurchaseRequest = hasPermission(currentUser, roles, "purchaseRequest:view");
  const canCreateProductionOrder = hasPermission(currentUser, roles, "productionOrder:create");
  const canEditProductionOrder = hasPermission(currentUser, roles, "productionOrder:edit");
  const canApproveProductionOrder = hasPermission(currentUser, roles, "productionOrder:finalize");
  const canPrintProductionOrder = hasPermission(currentUser, roles, "productionOrder:print");
  const canDeleteProductionOrder = hasPermission(currentUser, roles, "productionOrder:delete");
  const canCreatePurchaseOrder = hasPermission(currentUser, roles, "purchaseOrder:create");
  const canEditPurchaseOrder = hasPermission(currentUser, roles, "purchaseOrder:edit");
  const canApprovePurchaseOrder = hasPermission(currentUser, roles, "purchaseOrder:finalize");
  const canPrintPurchaseOrder = hasPermission(currentUser, roles, "purchaseOrder:print");
  const canDeletePurchaseOrder = hasPermission(currentUser, roles, "purchaseOrder:delete");
  const canEditPurchaseRequest = hasPermission(currentUser, roles, "purchaseRequest:edit");
  const canFinalizePurchaseRequest = hasPermission(currentUser, roles, "purchaseRequest:finalize");
  const canPrintPurchaseRequest = hasPermission(currentUser, roles, "purchaseRequest:print");
  const canDeletePurchaseRequest = hasPermission(currentUser, roles, "purchaseRequest:delete");
  const canCreateService = hasPermission(currentUser, roles, "service:create");
  const canEditService = hasPermission(currentUser, roles, "service:edit");
  const canCompleteService = hasPermission(currentUser, roles, "service:complete");
  const canDeleteService = hasPermission(currentUser, roles, "service:delete");
  const canPrintService = hasPermission(currentUser, roles, "service:print");
  const canCreateServiceTemplates = hasPermission(currentUser, roles, "serviceTemplates:create");
  const canEditServiceTemplates = hasPermission(currentUser, roles, "serviceTemplates:edit");
  const canArchiveServiceTemplates = hasPermission(currentUser, roles, "serviceTemplates:archive");
  const canCreateAr = hasPermission(currentUser, roles, "ar:create");
  const canIssueAr = hasPermission(currentUser, roles, "ar:issue");
  const canCancelAr = hasPermission(currentUser, roles, "ar:cancel");
  const canViewStock = hasPermission(currentUser, roles, "stock:view");
  const canAdjustStock = hasPermission(currentUser, roles, "stock:adjust");
  const canCreateProductRequest = hasPermission(currentUser, roles, "productRequest:create");
  const canReviewProductRequest = hasPermission(currentUser, roles, "productRequest:review");
  const isSuperAdmin = userIsSuperAdmin(currentUser, roles);
  // ตรวจสิทธิ์ template โดยยอมรับสิทธิ์ระดับ manage แบบเก่า (superset) ควบคู่กับสิทธิ์ย่อยแบบใหม่
  // Checks a template permission, accepting the legacy superset "manage" permission alongside the granular one
  const hasTemplatePerm = (perm: Permission) => hasPermission(currentUser, roles, "quotationTemplates:manage") || hasPermission(currentUser, roles, perm);
  const canCreateTemplates = hasTemplatePerm("quotationTemplates:create");
  const canEditTemplates = hasTemplatePerm("quotationTemplates:edit");
  const canDuplicateTemplates = hasTemplatePerm("quotationTemplates:duplicate");
  const canActivateTemplates = hasTemplatePerm("quotationTemplates:activate");
  const canArchiveTemplates = hasTemplatePerm("quotationTemplates:archive");
  const canImportTemplates = hasTemplatePerm("quotationTemplates:import");
  const navExpanded = sidebarOpen || mobileNavOpen;
  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <NavigationGuardContext.Provider value={navGuard.contextValue}>
    <div className="flex h-screen bg-background overflow-hidden font-sans text-foreground print:h-auto print:overflow-visible print:block">
      <UnsavedChangesDialog {...navGuard.dialog} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#c9a84c] focus:text-[#0b1d3a] focus:rounded-lg focus:font-semibold focus:shadow-xl"
      >
        {t("nav.skipToContent")}
      </a>
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-[#0b1d3a]/50 z-30 md:hidden" onClick={closeMobileNav} aria-hidden="true" />
      )}

      <aside
        ref={mobileNavPanelRef}
        role={mobileNavOpen ? "dialog" : undefined}
        aria-modal={mobileNavOpen ? true : undefined}
        aria-label={mobileNavOpen ? t("nav.openMenu") : undefined}
        className={`fixed inset-y-0 left-0 z-40 w-64 md:static md:z-auto md:translate-x-0
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
          ${sidebarOpen ? "md:w-64" : "md:w-16"}
          flex-shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out overflow-hidden print:hidden`}
      >
        <div className={`flex items-center border-b border-sidebar-border min-h-[72px] transition-all duration-300 ease-in-out ${navExpanded ? "gap-3 px-4 py-4" : "justify-center py-4"}`}>
          <BrandMark size={30} variant={navExpanded ? "full" : "mark"} theme="dark" />
          <button onClick={closeMobileNav} aria-label={t("nav.closeMenu")} className="md:hidden ml-auto text-sidebar-foreground hover:text-white transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <nav data-tour="sidebar-nav" className="sidebar-scroll flex-1 px-2 py-4 space-y-3 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            const items = visibleNavItems.filter((item) => group.keys.includes(item.key));
            if (items.length === 0) return null;
            return (
              <div key={group.labelKey} className="space-y-0.5">
                {navExpanded && (
                  <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">{t(group.labelKey)}</p>
                )}
                {items.map(({ key, icon: Icon, labelKey }) => (
                  <button
                    key={key}
                    onClick={() => guardedNav(() => { setActiveNav(key); setNavBump((n) => n + 1); closeMobileNav(); })}
                    title={navExpanded ? undefined : t(labelKey)}
                    aria-label={navExpanded ? undefined : t(labelKey)}
                    aria-current={activeNav === key ? "page" : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all duration-150 relative min-w-0
                      ${activeNav === key ? "bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/25" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white border border-transparent"}`}>
                    <Icon size={17} className="flex-shrink-0" />
                    {navExpanded && <span className="text-sm truncate min-w-0">{t(labelKey)}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="px-2 py-3 border-t border-sidebar-border">
          <button
            onClick={() => guardedNav(() => { setActiveNav("settings"); setNavBump((n) => n + 1); closeMobileNav(); })}
            title={navExpanded ? undefined : t("nav.settings")}
            aria-label={navExpanded ? undefined : t("nav.settings")}
            aria-current={activeNav === "settings" ? "page" : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all duration-150 border min-w-0 ${
              activeNav === "settings" ? "bg-[#c9a84c]/15 text-[#c9a84c] border-[#c9a84c]/25" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white border-transparent"
            }`}>
            <Settings size={17} className="flex-shrink-0" />
            {navExpanded && <span className="text-sm truncate min-w-0">{t("nav.settings")}</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:block">
        <header className="flex items-center gap-2 md:gap-4 px-3 md:px-6 py-3 md:py-4 border-b border-border bg-card min-h-[60px] md:min-h-[68px] relative print:hidden">
          <button ref={mobileNavTriggerRef} onClick={() => setMobileNavOpen(true)} aria-label={t("nav.openMenu")} className="md:hidden text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <Menu size={20} />
          </button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={sidebarOpen ? t("nav.collapseSidebar") : t("nav.expandSidebar")} className="hidden md:block text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="hidden sm:flex items-center gap-1.5 text-sm min-w-0">
            <span className="text-muted-foreground flex-shrink-0">{t("topbar.org")}</span>
            <ChevronRight size={13} className="text-muted-foreground flex-shrink-0" />
            <span className="text-[#c9a84c] font-medium truncate" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t(NAV_LABEL_KEYS[effectiveNav])}</span>
          </div>
          <GlobalSearch currentUserId={currentUser.id} onOpenResult={openSearchResult} />
          {/* 2026-08-07: opens the web manual page (public/manual.html) — replaced the old PDF per
              direct user request for the new document-style manual. That PDF is no longer served:
              c2f91b5 moved it out of public/ as a data-exposure fix (public/ is served
              unauthenticated) to reference/company/คู่มือการใช้งาน TCS ERP.pdf, where it still sits
              on disk, gitignored. public/manual.html is now the ONLY live manual — edit it directly;
              the old docs/manual/user-manual.html PDF source was deleted 2026-08-21. */}
          <a
            href="/manual.html"
            target="_blank"
            rel="noreferrer"
            aria-label={t("topbar.manual")}
            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-full border border-[#c9a84c]/60 bg-[#c9a84c]/10 text-[#866d28] hover:bg-[#c9a84c]/20 hover:border-[#c9a84c] transition-all text-xs font-semibold"
          >
            <BookOpen size={15} className="flex-shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">{t("topbar.manual")}</span>
          </a>
          <div className="flex-shrink-0">
            <WhatsNewPanel currentUserId={currentUser.id} />
          </div>
          <div data-tour="notification-bell" className="flex-shrink-0">
            <NotificationBell
              notifications={notifications}
              currentUserId={currentUser.id}
              onMarkRead={markNotificationRead}
              onMarkAllRead={markAllNotificationsRead}
              onDelete={deleteNotification}
              onNavigate={(n) => {
                if (n.relatedServiceReportId) navigateToServiceReport(n.relatedServiceReportId);
                else if (n.relatedDeliveryOrderId) navigateToDeliveryOrder(n.relatedDeliveryOrderId);
                // เอกสารกลุ่มโครงการ/ผลิต (2026-08-27) — ต้องมาก่อน relatedScopeId เพราะแจ้งเตือนพวกนี้
                // แนบ scope มาด้วยเสมอ (audit ของโมดูลเหล่านี้ผูกกับ scope) ถ้าเช็ค scope ก่อน จะพาไปผิดหน้า
                else if (n.relatedMaterialRequisitionId) navigateToMaterialRequisition(n.relatedMaterialRequisitionId);
                else if (n.relatedPurchaseRequestId) navigateToPurchaseRequest(n.relatedPurchaseRequestId);
                else if (n.relatedProductRequestId) navigateToProductRequest(n.relatedProductRequestId);
                else if (n.relatedScopeId) navigateToScopeOfWorkStandalone(n.relatedScopeId);
                else if (n.relatedQuoteId) navigateToQuotation(n.relatedQuoteId);
              }}
            />
          </div>
          <div className="relative" data-tour="user-menu">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
              aria-label={`${currentUser.fullName} — ${t("nav.settings")}, ${t("topbar.help")}, ${t("topbar.logout")}`}
              className="flex items-center gap-2.5 pl-3 border-l border-border"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#a07830] flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                {currentUser.profilePictureDataUrl ? (
                  <img src={currentUser.profilePictureDataUrl} alt={currentUser.fullName} className="w-full h-full object-cover" />
                ) : (
                  initials(currentUser.fullName || "?")
                )}
              </div>
              <div className="text-left hidden lg:block max-w-[140px]">
                <p className="text-xs font-semibold text-foreground leading-tight truncate">{currentUser.fullName}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{roleNameFor(currentUser, roles)}</p>
              </div>
              <ChevronDown size={14} className="text-muted-foreground hidden lg:block" />
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden py-1">
                  <button
                    onClick={() => guardedNav(() => { setActiveNav("settings"); setUserMenuOpen(false); })}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <Settings size={14} className="text-muted-foreground" /> {t("nav.settings")}
                  </button>
                  <button
                    onClick={() => guardedNav(() => { setUserMenuOpen(false); setActiveNav("dashboard"); setTimeout(() => tour.start(), 150); })}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <HelpCircle size={14} className="text-muted-foreground" /> {t("topbar.help")}
                  </button>
                  <button
                    onClick={() => guardedNav(handleLogout)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#e05252] hover:bg-[#e05252]/10 transition-colors"
                  >
                    <LogOut size={14} /> {t("topbar.logout")}
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col overflow-hidden outline-none print:overflow-visible print:block">
          <ErrorBoundary key={`${effectiveNav}-${navBump}`}>
          <Suspense fallback={<PageLoading />}>
            {/* ยังไม่รู้สิทธิ์ = ยังไม่ควรวาดหน้าไหนทั้งนั้น ไม่งั้นหน้านั้นจะถูกวาดด้วย roles ว่าง แล้วปุ่ม/
                เมนูที่ต้องมีสิทธิ์จะกะพริบโผล่ทีหลัง — รอไม่กี่ร้อยมิลลิวินาทีตรงนี้ตรงไปตรงมากว่า
                Rendering any page before `roles` resolve means rendering it against an empty
                permission set: gated buttons and empty states appear wrong, then pop. A brief,
                honest loading state is better than a page that lies for 200ms. */}
            {!navDecided
              ? <SectionLoading error={false} onRetry={loadDomainData} />
              : effectiveNav === "dashboard"
              ? <DashboardPage currentUserId={currentUser.id} onNavigateToQuotations={navigateToQuotations} onOpenQuote={navigateToQuotation} />
              : effectiveNav === "auditLog"
              ? <AuditLogPage currentUserId={currentUser.id} />
              : effectiveNav === "scopeOfWork"
              ? <ScopeOfWorkPage company={company} users={users} currentUserId={currentUser.id} canEdit={canEditScopeOfWork} canFinalize={canFinalizeScopeOfWork} canPrint={canPrintScopeOfWork} canDelete={canDeleteScopeOfWork} canCreate={canCreateScopeOfWork} canChasePo={canChasePoScopeOfWork} canViewDeliveryOrder={canViewDeliveryOrder} canCreateDeliveryOrder={canCreateDeliveryOrder} onOpenDeliveryOrder={navigateToDeliveryOrder} canViewProject={canViewProject} canCreateProject={canCreateProject} onOpenProject={navigateToProject} initialScopeOfWorkId={scopeOfWorkDeepLinkId} onScopeOfWorkIdConsumed={() => setScopeOfWorkDeepLinkId(null)} />
              : effectiveNav === "deliveryOrder"
              ? <DeliveryOrderPage company={company} currentUserId={currentUser.id} canEdit={canEditDeliveryOrder} canFinalize={canFinalizeDeliveryOrder} canPrint={canPrintDeliveryOrder} canDelete={canDeleteDeliveryOrder} canCreate={canCreateDeliveryOrder} initialDeliveryOrderId={deliveryOrderDeepLinkId} onDeliveryOrderIdConsumed={() => setDeliveryOrderDeepLinkId(null)} />
              : effectiveNav === "project"
              ? <ProjectPage currentUserId={currentUser.id} canEdit={canEditProject} canDelete={canDeleteProject} canCreate={canCreateProject} canCreateMaterialRequisition={canCreateMaterialRequisition} canCreateJobOrder={canCreateJobOrder} canCreatePurchaseRequest={canCreatePurchaseRequest} onOpenMaterialRequisition={navigateToMaterialRequisition} onOpenJobOrder={navigateToJobOrder} onOpenPurchaseRequest={navigateToPurchaseRequest} initialProjectId={projectDeepLinkId} onProjectIdConsumed={() => setProjectDeepLinkId(null)} />
              : effectiveNav === "materialRequisition"
              ? <MaterialRequisitionPage company={company} currentUserId={currentUser.id} canEdit={canEditMaterialRequisition} canFinalize={canFinalizeMaterialRequisition} canPrint={canPrintMaterialRequisition} canDelete={canDeleteMaterialRequisition} canCreate={canCreateMaterialRequisition} initialMaterialRequisitionId={materialRequisitionDeepLinkId} onMaterialRequisitionIdConsumed={() => setMaterialRequisitionDeepLinkId(null)} />
              : effectiveNav === "jobOrder"
              ? <JobOrderPage currentUserId={currentUser.id} canEdit={canEditJobOrder} canFinalize={canFinalizeJobOrder} canPrint={canPrintJobOrder} canDelete={canDeleteJobOrder} canCreate={canCreateJobOrder} initialJobOrderId={jobOrderDeepLinkId} onJobOrderIdConsumed={() => setJobOrderDeepLinkId(null)} />
              : effectiveNav === "purchasingRequestInbox"
              ? <PurchaseRequestPage key="pr-purchasing" ownerDepartment="all" canRequestProductCode={canCreateProductRequest} currentUserId={currentUser.id} canEdit={canEditPurchaseRequest} canFinalize={canFinalizePurchaseRequest} canPrint={canPrintPurchaseRequest} canDelete={canDeletePurchaseRequest} canCreate={canCreatePurchaseRequest} initialPurchaseRequestId={purchaseRequestDeepLinkId} onPurchaseRequestIdConsumed={() => setPurchaseRequestDeepLinkId(null)} />
              : effectiveNav === "purchaseRequest"
              ? <PurchaseRequestPage canRequestProductCode={canCreateProductRequest} currentUserId={currentUser.id} canEdit={canEditPurchaseRequest} canFinalize={canFinalizePurchaseRequest} canPrint={canPrintPurchaseRequest} canDelete={canDeletePurchaseRequest} canCreate={canCreatePurchaseRequest} initialPurchaseRequestId={purchaseRequestDeepLinkId} onPurchaseRequestIdConsumed={() => setPurchaseRequestDeepLinkId(null)} />
              : effectiveNav === "productionRequisition"
              ? <MaterialRequisitionPage key="mr-production" ownerDepartment="production" company={company} currentUserId={currentUser.id} canEdit={canEditMaterialRequisition} canFinalize={canFinalizeMaterialRequisition} canPrint={canPrintMaterialRequisition} canDelete={canDeleteMaterialRequisition} canCreate={canCreateMaterialRequisition} initialMaterialRequisitionId={materialRequisitionDeepLinkId} onMaterialRequisitionIdConsumed={() => setMaterialRequisitionDeepLinkId(null)} />
              : effectiveNav === "productionPurchase"
              ? <PurchaseRequestPage key="pr-production" ownerDepartment="production" canRequestProductCode={canCreateProductRequest} currentUserId={currentUser.id} canEdit={canEditPurchaseRequest} canFinalize={canFinalizePurchaseRequest} canPrint={canPrintPurchaseRequest} canDelete={canDeletePurchaseRequest} canCreate={canCreatePurchaseRequest} initialPurchaseRequestId={purchaseRequestDeepLinkId} onPurchaseRequestIdConsumed={() => setPurchaseRequestDeepLinkId(null)} />
              : effectiveNav === "productionOrder"
              ? <ProductionOrderPage canEdit={canEditProductionOrder} canApprove={canApproveProductionOrder} canPrint={canPrintProductionOrder} canDelete={canDeleteProductionOrder} canCreate={canCreateProductionOrder} initialProductionOrderId={productionOrderDeepLinkId} onProductionOrderIdConsumed={() => setProductionOrderDeepLinkId(null)} />
              : effectiveNav === "purchaseOrder"
              ? <PurchaseOrderPage canCreate={canCreatePurchaseOrder} canEdit={canEditPurchaseOrder} canApprove={canApprovePurchaseOrder} canPrint={canPrintPurchaseOrder} canDelete={canDeletePurchaseOrder} canViewPurchaseRequest={canViewPurchaseRequest} initialPurchaseOrderId={purchaseOrderDeepLinkId} onPurchaseOrderIdConsumed={() => setPurchaseOrderDeepLinkId(null)} />
              : effectiveNav === "service"
              ? <ServicePage currentUserId={currentUser.id} company={company} canCreate={canCreateService} canEdit={canEditService} canComplete={canCompleteService} canDelete={canDeleteService} canPrint={canPrintService} initialServiceReportId={serviceReportDeepLinkId} onServiceReportIdConsumed={() => setServiceReportDeepLinkId(null)} />
              : effectiveNav === "serviceTemplates"
              ? <ServiceTemplateManagement currentUserId={currentUser.id} canCreate={canCreateServiceTemplates} canEdit={canEditServiceTemplates} canArchive={canArchiveServiceTemplates} />
              : effectiveNav === "accounting"
              ? <AccountingPage canCreate={canCreateAr} canIssue={canIssueAr} />
              : effectiveNav === "arDeposit"
              ? <ArDocumentListPage key="AR" docType="AR" initialArDocumentId={arDocumentDeepLink?.docType === "AR" ? arDocumentDeepLink.id : null} onArDocumentIdConsumed={() => setArDocumentDeepLink(null)} canIssue={canIssueAr} canCancel={canCancelAr} canCreate={canCreateAr} canViewStock={canViewStock} canAdjustStock={canAdjustStock} />
              : effectiveNav === "arBilling"
              ? <ArDocumentListPage key="BI" docType="BI" initialArDocumentId={arDocumentDeepLink?.docType === "BI" ? arDocumentDeepLink.id : null} onArDocumentIdConsumed={() => setArDocumentDeepLink(null)} canIssue={canIssueAr} canCancel={canCancelAr} canCreate={canCreateAr} canViewStock={canViewStock} canAdjustStock={canAdjustStock} />
              : effectiveNav === "arReceipt"
              ? <ArDocumentListPage key="RE" docType="RE" initialArDocumentId={arDocumentDeepLink?.docType === "RE" ? arDocumentDeepLink.id : null} onArDocumentIdConsumed={() => setArDocumentDeepLink(null)} canIssue={canIssueAr} canCancel={canCancelAr} canCreate={canCreateAr} canViewStock={canViewStock} canAdjustStock={canAdjustStock} />
              : effectiveNav === "arTaxInvoice"
              ? <ArDocumentListPage key="IV" docType="IV" initialArDocumentId={arDocumentDeepLink?.docType === "IV" ? arDocumentDeepLink.id : null} onArDocumentIdConsumed={() => setArDocumentDeepLink(null)} canIssue={canIssueAr} canCancel={canCancelAr} canCreate={canCreateAr} canViewStock={canViewStock} canAdjustStock={canAdjustStock} />
              : effectiveNav === "arMonthly"
              ? <ArMonthlyReportPage />
              : effectiveNav === "accountingDashboard"
              ? <AccountingDashboardPage />
              : pageDataLoading || pageDataError
              ? <SectionLoading error={pageDataError} onRetry={loadDomainData} />
              : effectiveNav === "quotations"
              ? <QuotationPage quotes={quotes} setQuotes={setQuotes} company={company} currentUser={currentUser} users={users} roles={roles} products={products} categories={categories} jobTypes={jobTypes} customers={customers} initialFilter={quotationListFilter} onFilterConsumed={() => setQuotationListFilter(null)} initialQuoteId={quotationDeepLinkId} onQuoteIdConsumed={() => setQuotationDeepLinkId(null)} initialTemplateSelection={quotationTemplateDeepLink} onTemplateSelectionConsumed={() => setQuotationTemplateDeepLink(null)} onNotify={refreshNotifications} canCreateTemplate={canCreateTemplates} onCreateTemplateForJobType={navigateToCreateTemplateForJobType} canViewDeliveryOrder={canViewDeliveryOrder} canCreateDeliveryOrder={canCreateDeliveryOrder} onOpenDeliveryOrder={navigateToDeliveryOrder} canViewProject={canViewProject} canCreateProject={canCreateProject} onOpenProject={navigateToProject} />
              : effectiveNav === "quotationTemplates"
              ? <TemplateManagementPage jobTypes={jobTypes} products={products} categories={categories} currentUserId={currentUser.id} canCreate={canCreateTemplates} canEdit={canEditTemplates} canDuplicate={canDuplicateTemplates} canActivate={canActivateTemplates} canArchive={canArchiveTemplates} canImport={canImportTemplates} initialCreateForJobType={templateCreateForJobType} onCreateForJobTypeConsumed={() => setTemplateCreateForJobType(null)} onCreateQuotationFromTemplate={navigateToTemplate} />
              : effectiveNav === "customers"
              ? <CustomersPage customers={customers} onCustomersChange={setCustomers} currentUserId={currentUser.id} canCreate={canCreateCustomers} canEdit={canEditCustomers} canArchive={canArchiveCustomers} initialEditId={customerDeepLinkId} onEditIdConsumed={() => setCustomerDeepLinkId(null)} autoCreateSeq={pageAction?.nav === "customers" && pageAction.action === "create" ? pageAction.seq : null} onAutoActionConsumed={clearPageAction} />
              : effectiveNav === "settings"
              ? <SettingsPage company={company} onCompanyChange={updateCompany} currentUser={currentUser} onUserChange={updateCurrentUser} roles={roles} canManageCompany={canManageCompany} onAudit={handleAudit} />
              : effectiveNav === "products"
              ? <ProductsPage products={products} onProductsChange={updateProducts} categories={categories} onCategoriesChange={updateCategories} currentUserId={currentUser.id} initialEditId={productDeepLinkId} onEditIdConsumed={() => setProductDeepLinkId(null)} autoView={pageAction?.nav === "products" ? pageAction.action : null} autoViewSeq={pageAction?.nav === "products" ? pageAction.seq : null} onAutoActionConsumed={clearPageAction} />
              : effectiveNav === "stock"
              ? <StockPage products={products} onProductsChange={updateProducts} categories={categories} canAdjust={canAdjustStock} />
              : effectiveNav === "productRequest"
              ? <ProductRequestPage currentUserId={currentUser.id} canCreate={canCreateProductRequest} canReview={canReviewProductRequest} initialProductRequestId={productRequestDeepLinkId} onProductRequestIdConsumed={() => setProductRequestDeepLinkId(null)} />
              : effectiveNav === "users"
              ? <UserManagementPage users={users} onUsersChange={updateUsers} roles={roles} departments={departments} teams={teams} currentUser={currentUser} isSuperAdmin={isSuperAdmin} onAudit={handleAudit} initialEditId={userDeepLinkId} onEditIdConsumed={() => setUserDeepLinkId(null)} />
              : effectiveNav === "roles" && isSuperAdmin
              ? <RoleManagementPage roles={roles} onRolesChange={updateRoles} users={users} currentUserId={currentUser.id} onAudit={handleAudit} />
              : effectiveNav === "departments" && isSuperAdmin
              ? <DepartmentManagementPage departments={departments} onDepartmentsChange={updateDepartments} teams={teams} onTeamsChange={updateTeams} />
              : <DashboardPage currentUserId={currentUser.id} onNavigateToQuotations={navigateToQuotations} onOpenQuote={navigateToQuotation} />
            }
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {showTourPrompt && (
        <div className="fixed bottom-6 right-6 z-50 w-80 bg-card border border-border rounded-xl shadow-2xl p-4 print:hidden">
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("onboarding.welcome.title")}</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{t("onboarding.welcome.message")}</p>
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={() => { setShowTourPrompt(false); if (currentUser) markTourCompleted(currentUser.id); }}
              className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("onboarding.welcome.skip")}
            </button>
            <button
              onClick={() => guardedNav(() => { setActiveNav("dashboard"); setShowTourPrompt(false); setTimeout(() => tour.start(), 150); })}
              className="px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
            >
              {t("onboarding.welcome.start")}
            </button>
          </div>
        </div>
      )}
    </div>
    </NavigationGuardContext.Provider>
  );
}
