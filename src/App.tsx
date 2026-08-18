import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, Settings, Package,
  ChevronRight, Menu, X, ChevronDown, Loader2, AlertTriangle, RotateCw,
  LogOut, type LucideIcon, FileText, Users as UsersIcon, ShieldCheck, ScrollText, HelpCircle, Contact, Layers, ClipboardList, Truck, BookOpen, Wrench, Receipt,
  Banknote, FileCheck, Wallet, CalendarDays, BarChart3, Boxes,
} from "lucide-react";
import { type Company, defaultCompany, fetchCompany } from "./lib/storage";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "./lib/products";
import { type JobType, fetchJobTypes } from "./lib/jobTypes";
import { type Customer, fetchCustomers } from "./lib/customers";
import { type Quote, type QuotationListFilter, fetchQuotes } from "./lib/quotes";
import { type User, fetchUsers, initials } from "./lib/users";
import { type Role, fetchRoles, hasPermission, userIsSuperAdmin, roleNameFor, isNavHiddenForUser } from "./lib/roles";
import { type Department, fetchDepartments } from "./lib/departments";
import { type Team, fetchTeams } from "./lib/teams";
import type { Permission } from "./lib/permissions";
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
const ServicePage = lazy(() => import("./pages/service/ServicePage").then((m) => ({ default: m.ServicePage })));
const ServiceTemplateManagement = lazy(() => import("./pages/service/ServiceTemplateManagement").then((m) => ({ default: m.ServiceTemplateManagement })));
const AccountingPage = lazy(() => import("./pages/accounting/AccountingPage").then((m) => ({ default: m.AccountingPage })));
const ArDocumentListPage = lazy(() => import("./pages/accounting/ArDocumentListPage").then((m) => ({ default: m.ArDocumentListPage })));
const ArMonthlyReportPage = lazy(() => import("./pages/accounting/ArMonthlyReportPage").then((m) => ({ default: m.ArMonthlyReportPage })));
const AccountingDashboardPage = lazy(() => import("./pages/accounting/AccountingDashboardPage").then((m) => ({ default: m.AccountingDashboardPage })));
const StockPage = lazy(() => import("./pages/stock/StockPage").then((m) => ({ default: m.StockPage })));

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

type NavKey = "dashboard" | "quotations" | "quotationTemplates" | "scopeOfWork" | "deliveryOrder" | "service" | "serviceTemplates" | "accounting" | "arDeposit" | "arBilling" | "arReceipt" | "arTaxInvoice" | "arMonthly" | "accountingDashboard" | "products" | "stock" | "customers" | "users" | "roles" | "departments" | "auditLog" | "settings";

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
  { key: "products", icon: Package, labelKey: "nav.products", permission: "products:view" },
  { key: "stock", icon: Boxes, labelKey: "nav.stock", permission: "stock:view" },
  { key: "customers", icon: Contact, labelKey: "nav.customers", permission: "customers:view" },
  { key: "users", icon: UsersIcon, labelKey: "nav.users", permission: "users:manage" },
  { key: "roles", icon: ShieldCheck, labelKey: "nav.roles", permission: "roles:manage" },
  { key: "departments", icon: Layers, labelKey: "nav.departments", permission: "departments:manage" },
  { key: "auditLog", icon: ScrollText, labelKey: "nav.auditLog", permission: "auditLog:view" },
];

const NAV_GROUPS: { labelKey: TranslationKey; keys: NavKey[] }[] = [
  { labelKey: "nav.group.main", keys: ["dashboard"] },
  { labelKey: "nav.group.sales", keys: ["quotations", "scopeOfWork", "deliveryOrder", "quotationTemplates", "customers"] },
  { labelKey: "nav.group.service", keys: ["service", "serviceTemplates"] },
  { labelKey: "nav.group.accounting", keys: ["accountingDashboard", "accounting", "arDeposit", "arBilling", "arReceipt", "arTaxInvoice", "arMonthly"] },
  { labelKey: "nav.group.inventory", keys: ["products", "stock"] },
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
  products: "nav.products",
  stock: "nav.stock",
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
  const [scopeOfWorkDeepLink, setScopeOfWorkDeepLink] = useState<{ quotationId: string; scopeOfWorkId: string } | null>(null);
  const [scopeOfWorkDeepLinkId, setScopeOfWorkDeepLinkId] = useState<string | null>(null);
  const [deliveryOrderDeepLinkId, setDeliveryOrderDeepLinkId] = useState<string | null>(null);
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

  const navigateToQuotations = (filter: QuotationListFilter) => {
    setQuotationListFilter(filter);
    setActiveNav("quotations");
  };
  const navigateToQuotation = (quoteId: string) => {
    setQuotationDeepLinkId(quoteId);
    setActiveNav("quotations");
  };
  const navigateToCustomer = (customerId: string) => {
    setCustomerDeepLinkId(customerId);
    setActiveNav("customers");
  };
  const navigateToProduct = (productId: string) => {
    setProductDeepLinkId(productId);
    setActiveNav("products");
  };
  const navigateToUser = (userId: string) => {
    setUserDeepLinkId(userId);
    setActiveNav("users");
  };
  const navigateToTemplate = (jobTypeCode: string, templateId: string) => {
    setQuotationTemplateDeepLink({ jobTypeCode, templateId });
    setActiveNav("quotations");
  };
  const navigateToScopeOfWork = (quotationId: string, scopeOfWorkId: string) => {
    setScopeOfWorkDeepLink({ quotationId, scopeOfWorkId });
    setActiveNav("quotations");
  };
  const navigateToScopeOfWorkStandalone = (scopeOfWorkId: string) => {
    setScopeOfWorkDeepLinkId(scopeOfWorkId);
    setActiveNav("scopeOfWork");
  };
  const navigateToDeliveryOrder = (deliveryOrderId: string) => {
    setDeliveryOrderDeepLinkId(deliveryOrderId);
    setActiveNav("deliveryOrder");
  };
  const navigateToServiceReport = (serviceReportId: string) => {
    setServiceReportDeepLinkId(serviceReportId);
    setActiveNav("service");
  };
  const navigateToCreateTemplateForJobType = (jobTypeCode: string, jobTypeName: string) => {
    templateCreateSeq.current += 1;
    setTemplateCreateForJobType({ jobTypeCode, jobTypeName, seq: templateCreateSeq.current });
    setActiveNav("quotationTemplates");
  };
  // ไปยังหน้าที่ระบุ (มาจากผลค้นหา) พร้อมตรวจสอบว่าเป็น NavKey ที่ถูกต้องก่อน
  // Navigates to the given page (from a search result), validating it as a real NavKey first
  const navigateToPage = (navKey: string, action?: "create" | "categories") => {
    if (!navItems.some((n) => n.key === navKey) && navKey !== "settings") return;
    const key = navKey as NavKey;
    if (action) {
      pageActionSeq.current += 1;
      setPageAction({ nav: key, action, seq: pageActionSeq.current });
    }
    setActiveNav(key);
  };
  const clearPageAction = () => setPageAction(null);

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

  // Two independent filters: permission (can this user reach the page at all) and per-role nav
  // hiding (should this role be *offered* it — see isNavHiddenForRole, presentation only).
  const visibleNavItems = navItems.filter((item) =>
    (!item.permission || hasPermission(currentUser, roles, item.permission))
    && !isNavHiddenForUser(currentUser, roles, item.key));
  // Whichever nav item this role actually sees first — the landing page and the fallback both use
  // it instead of a hardcoded "dashboard", so a role without Dashboard in its sidebar can never end
  // up sitting on a page it has no way to navigate back to.
  const homeNav: NavKey = visibleNavItems[0]?.key ?? "settings";
  const activeNavItem = navItems.find((n) => n.key === activeNav);
  const activeNavAllowed = activeNav === "settings"
    || ((!activeNavItem?.permission || hasPermission(currentUser, roles, activeNavItem.permission))
      && !isNavHiddenForUser(currentUser, roles, activeNav));
  const effectiveNav = activeNavAllowed ? activeNav : homeNav;

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
    <div className="flex h-screen bg-background overflow-hidden font-sans text-foreground print:h-auto print:overflow-visible print:block">
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
        <nav data-tour="sidebar-nav" className="flex-1 px-2 py-4 space-y-3 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            const items = visibleNavItems.filter((item) => group.keys.includes(item.key));
            if (items.length === 0) return null;
            return (
              <div key={group.labelKey} className="space-y-0.5">
                {navExpanded && (
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/70">{t(group.labelKey)}</p>
                )}
                {items.map(({ key, icon: Icon, labelKey }) => (
                  <button
                    key={key}
                    onClick={() => { setActiveNav(key); setNavBump((n) => n + 1); closeMobileNav(); }}
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
            onClick={() => { setActiveNav("settings"); setNavBump((n) => n + 1); closeMobileNav(); }}
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
          <GlobalSearch
            onNavigateToQuotation={navigateToQuotation}
            onNavigateToCustomer={navigateToCustomer}
            onNavigateToProduct={navigateToProduct}
            onNavigateToUser={navigateToUser}
            onNavigateToPage={navigateToPage}
            onNavigateToTemplate={navigateToTemplate}
            onNavigateToScopeOfWork={navigateToScopeOfWork}
          />
          {/* 2026-08-07: opens the web manual page (public/manual.html) — replaced the PDF
              (public/คู่มือการใช้งาน TCS ERP.pdf, kept on disk but no longer linked) per direct
              user request for the new document-style manual. Update public/manual.html directly;
              docs/manual/user-manual.html (the old PDF source) is superseded. */}
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
                    onClick={() => { setActiveNav("settings"); setUserMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <Settings size={14} className="text-muted-foreground" /> {t("nav.settings")}
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); setActiveNav("dashboard"); setTimeout(() => tour.start(), 150); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <HelpCircle size={14} className="text-muted-foreground" /> {t("topbar.help")}
                  </button>
                  <button
                    onClick={handleLogout}
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
            {effectiveNav === "dashboard"
              ? <DashboardPage currentUserId={currentUser.id} onNavigateToQuotations={navigateToQuotations} onOpenQuote={navigateToQuotation} />
              : effectiveNav === "auditLog"
              ? <AuditLogPage currentUserId={currentUser.id} />
              : effectiveNav === "scopeOfWork"
              ? <ScopeOfWorkPage company={company} users={users} currentUserId={currentUser.id} canEdit={canEditScopeOfWork} canFinalize={canFinalizeScopeOfWork} canPrint={canPrintScopeOfWork} canDelete={canDeleteScopeOfWork} canCreate={canCreateScopeOfWork} canChasePo={canChasePoScopeOfWork} canViewDeliveryOrder={canViewDeliveryOrder} canCreateDeliveryOrder={canCreateDeliveryOrder} onOpenDeliveryOrder={navigateToDeliveryOrder} initialScopeOfWorkId={scopeOfWorkDeepLinkId} onScopeOfWorkIdConsumed={() => setScopeOfWorkDeepLinkId(null)} />
              : effectiveNav === "deliveryOrder"
              ? <DeliveryOrderPage company={company} currentUserId={currentUser.id} canEdit={canEditDeliveryOrder} canFinalize={canFinalizeDeliveryOrder} canPrint={canPrintDeliveryOrder} canDelete={canDeleteDeliveryOrder} canCreate={canCreateDeliveryOrder} initialDeliveryOrderId={deliveryOrderDeepLinkId} onDeliveryOrderIdConsumed={() => setDeliveryOrderDeepLinkId(null)} />
              : effectiveNav === "service"
              ? <ServicePage currentUserId={currentUser.id} company={company} canCreate={canCreateService} canEdit={canEditService} canComplete={canCompleteService} canDelete={canDeleteService} canPrint={canPrintService} initialServiceReportId={serviceReportDeepLinkId} onServiceReportIdConsumed={() => setServiceReportDeepLinkId(null)} />
              : effectiveNav === "serviceTemplates"
              ? <ServiceTemplateManagement currentUserId={currentUser.id} canCreate={canCreateServiceTemplates} canEdit={canEditServiceTemplates} canArchive={canArchiveServiceTemplates} />
              : effectiveNav === "accounting"
              ? <AccountingPage canCreate={canCreateAr} canIssue={canIssueAr} />
              : effectiveNav === "arDeposit"
              ? <ArDocumentListPage key="AR" docType="AR" canIssue={canIssueAr} canCancel={canCancelAr} canCreate={canCreateAr} canViewStock={canViewStock} canAdjustStock={canAdjustStock} />
              : effectiveNav === "arBilling"
              ? <ArDocumentListPage key="BI" docType="BI" canIssue={canIssueAr} canCancel={canCancelAr} canCreate={canCreateAr} canViewStock={canViewStock} canAdjustStock={canAdjustStock} />
              : effectiveNav === "arReceipt"
              ? <ArDocumentListPage key="RE" docType="RE" canIssue={canIssueAr} canCancel={canCancelAr} canCreate={canCreateAr} canViewStock={canViewStock} canAdjustStock={canAdjustStock} />
              : effectiveNav === "arTaxInvoice"
              ? <ArDocumentListPage key="IV" docType="IV" canIssue={canIssueAr} canCancel={canCancelAr} canCreate={canCreateAr} canViewStock={canViewStock} canAdjustStock={canAdjustStock} />
              : effectiveNav === "arMonthly"
              ? <ArMonthlyReportPage />
              : effectiveNav === "accountingDashboard"
              ? <AccountingDashboardPage />
              : pageDataLoading || pageDataError
              ? <SectionLoading error={pageDataError} onRetry={loadDomainData} />
              : effectiveNav === "quotations"
              ? <QuotationPage quotes={quotes} setQuotes={setQuotes} company={company} currentUser={currentUser} users={users} roles={roles} products={products} categories={categories} jobTypes={jobTypes} customers={customers} initialFilter={quotationListFilter} onFilterConsumed={() => setQuotationListFilter(null)} initialQuoteId={quotationDeepLinkId} onQuoteIdConsumed={() => setQuotationDeepLinkId(null)} initialTemplateSelection={quotationTemplateDeepLink} onTemplateSelectionConsumed={() => setQuotationTemplateDeepLink(null)} initialScopeOfWorkDeepLink={scopeOfWorkDeepLink} onScopeOfWorkDeepLinkConsumed={() => setScopeOfWorkDeepLink(null)} onNotify={refreshNotifications} canCreateTemplate={canCreateTemplates} onCreateTemplateForJobType={navigateToCreateTemplateForJobType} canViewDeliveryOrder={canViewDeliveryOrder} canCreateDeliveryOrder={canCreateDeliveryOrder} onOpenDeliveryOrder={navigateToDeliveryOrder} />
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
              onClick={() => { setActiveNav("dashboard"); setShowTourPrompt(false); setTimeout(() => tour.start(), 150); }}
              className="px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
            >
              {t("onboarding.welcome.start")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
