import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, Settings, Package,
  ChevronRight, Menu, X, ChevronDown, Loader2, AlertTriangle, RotateCw,
  LogOut, type LucideIcon, FileText, Users as UsersIcon, ShieldCheck, ScrollText, HelpCircle, Contact, Layers, ClipboardList, Truck, BookOpen,
} from "lucide-react";
import { type Company, defaultCompany, fetchCompany } from "./lib/storage";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "./lib/products";
import { type JobType, fetchJobTypes } from "./lib/jobTypes";
import { type Customer, fetchCustomers } from "./lib/customers";
import { type Quote, type QuotationListFilter, fetchQuotes } from "./lib/quotes";
import { type User, fetchUsers, initials } from "./lib/users";
import { type Role, fetchRoles, hasPermission, userIsSuperAdmin, roleNameFor } from "./lib/roles";
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
const AuditLogPage = lazy(() => import("./pages/admin/AuditLogPage").then((m) => ({ default: m.AuditLogPage })));
const CustomersPage = lazy(() => import("./pages/customers/CustomersPage").then((m) => ({ default: m.CustomersPage })));
const TemplateManagementPage = lazy(() => import("./pages/templates/TemplateManagementPage").then((m) => ({ default: m.TemplateManagementPage })));
const ScopeOfWorkPage = lazy(() => import("./pages/scopeOfWork/ScopeOfWorkPage").then((m) => ({ default: m.ScopeOfWorkPage })));
const DeliveryOrderPage = lazy(() => import("./pages/deliveryOrder/DeliveryOrderPage").then((m) => ({ default: m.DeliveryOrderPage })));

function PageLoading() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="space-y-3 w-full max-w-3xl">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function BootLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <img src="/logo.png" alt="Thai Chemicals Storage ERP" className="h-14 w-auto object-contain animate-pulse" />
    </div>
  );
}

/** Shown only if the session check itself fails (network/server error) — distinct from `signedOut`
 * (a resolved "you are not logged in" answer). Fixes a previously-documented gap: the boot effect
 * had no error handling at all, so a thrown fetch error left `bootStatus` stuck at `"loading"`
 * forever with no way out — see TODO.md/CHANGELOG.md 2026-07-14 progressive-loading pass. */
function BootError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
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

/** Lightweight per-section placeholder used while *the specific boot-time domain resources a page
 * needs* (see `NAV_RESOURCES` above) are still in flight — the sidebar/header/page chrome around
 * it is already visible by this point (see `bootStatus === "ready"` rendering below), so this only
 * needs to cover the content area, not the whole screen. Deliberately not a full skeleton grid: a
 * page that's purely prop-driven off this data (Quotations/Products/Customers/Users/Roles) would
 * otherwise render a false "no records yet" empty state while data is still loading — showing this
 * instead keeps "loading" and "genuinely empty" visually distinct. Dashboard/AuditLog fetch their
 * own data independently and never show this. */
function SectionLoading({ error, onRetry }: { error: boolean; onRetry: () => void }) {
  const { t } = useI18n();
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={20} className="text-[#e05252]" />
        <p className="text-sm text-muted-foreground">{t("boot.sectionError")}</p>
        <button onClick={onRetry} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
          <RotateCw size={12} /> {t("boot.error.retry")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 p-6">
      <Loader2 size={20} className="text-muted-foreground animate-spin" />
      <p className="text-xs text-muted-foreground">{t("boot.sectionLoading")}</p>
    </div>
  );
}

/** Stable routing identifiers — decoupled from the (now translatable) display label, so switching language never breaks navigation. */
type NavKey = "dashboard" | "quotations" | "quotationTemplates" | "scopeOfWork" | "deliveryOrder" | "products" | "customers" | "users" | "roles" | "auditLog" | "settings";

/** The boot-time domain resources fetched once after sign-in — see `loadDomainData()`/`resourceStatus` below. */
type ResourceKey = "users" | "roles" | "company" | "products" | "categories" | "notifications" | "quotes" | "jobTypes" | "customers";
type ResourceState = "loading" | "ready" | "error";

/**
 * Which boot-time resources a given page actually needs, for per-page loading/error gating
 * (2026-07-14, Codex review High Priority fix — see the `resourceStatus` doc comment in `App()`).
 * Dashboard/AuditLog aren't listed: they fetch their own data and never wait on this at all.
 * "settings" needs `company` (Company Info tab, Super-Admin-only) and `roles` (role name display).
 */
const NAV_RESOURCES: Partial<Record<NavKey, ResourceKey[]>> = {
  quotations: ["quotes", "company", "users", "roles", "products", "categories", "jobTypes", "customers"],
  quotationTemplates: ["jobTypes", "products", "categories"],
  products: ["products", "categories"],
  customers: ["customers"],
  users: ["users", "roles"],
  roles: ["roles", "users"],
  settings: ["company", "roles"],
};

/** Module-scope (not component-local) so it's a referentially stable object across every render —
 * required for `loadDomainData` below to itself be stable under `useCallback`, which is what lets
 * the boot effect's dependency array correctly list it without re-running on every render. */
const INITIAL_RESOURCE_STATUS: Record<ResourceKey, ResourceState> = {
  users: "loading", roles: "loading", company: "loading", products: "loading", categories: "loading",
  notifications: "loading", quotes: "loading", jobTypes: "loading", customers: "loading",
};

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
  { key: "products", icon: Package, labelKey: "nav.products", permission: "products:view" },
  { key: "customers", icon: Contact, labelKey: "nav.customers", permission: "customers:view" },
  { key: "users", icon: UsersIcon, labelKey: "nav.users", permission: "users:manage" },
  { key: "roles", icon: ShieldCheck, labelKey: "nav.roles", permission: "roles:manage" },
  { key: "auditLog", icon: ScrollText, labelKey: "nav.auditLog", permission: "auditLog:view" },
];

/**
 * Sidebar grouping (2026-07-10 UI/UX redesign) — purely a display grouping over the same flat
 * `navItems`/`NavKey` list above, not a new data model. "Leads" still has no group/UI (schema-only,
 * see MODULES/Lead.md) — "Customers" got one 2026-07-14 (Customer master data, used to autofill
 * the Quotation form's Customer selector, see MODULES/Customer.md). No separate "Approvals" group
 * (approval actions live inside the Quotation module's own workflow, there's no dedicated Pending
 * Approvals/Approval History page). The former "Company Profiles" entry (multi-issuer master data)
 * was removed 2026-07-14 — this ERP has exactly one issuer company, so a management page for
 * multiple was unused scope; see docs/MODULES/CompanyProfiles.md "Removed (2026-07-14)."
 * "Scope of Work" got its own top-level entry 2026-07-22 (previously only reachable via a button on
 * the Quotation detail page, with no standalone browse/list view) — per direct user request; a
 * Scope of Work is still only ever *created* from that same Quotation-detail button, this page is
 * purely for browsing/opening ones that already exist. See docs/MODULES/ScopeOfWork.md.
 */
const NAV_GROUPS: { labelKey: TranslationKey; keys: NavKey[] }[] = [
  { labelKey: "nav.group.main", keys: ["dashboard"] },
  { labelKey: "nav.group.sales", keys: ["quotations", "scopeOfWork", "deliveryOrder", "quotationTemplates", "customers"] },
  { labelKey: "nav.group.inventory", keys: ["products"] },
  { labelKey: "nav.group.admin", keys: ["users", "roles", "auditLog"] },
];

const NAV_LABEL_KEYS: Record<NavKey, TranslationKey> = {
  dashboard: "nav.dashboard",
  quotations: "nav.quotations",
  quotationTemplates: "nav.quotationTemplates",
  scopeOfWork: "nav.scopeOfWork",
  deliveryOrder: "nav.deliveryOrder",
  products: "nav.products",
  customers: "nav.customers",
  users: "nav.users",
  roles: "nav.roles",
  auditLog: "nav.auditLog",
  settings: "nav.settings",
};

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

// ─── Root App ──────────────────────────────────────────────────────────────────

type BootStatus = "loading" | "needsSetup" | "signedOut" | "ready";

export default function App() {
  const { t } = useI18n();
  const [bootStatus, setBootStatus] = useState<BootStatus>("loading");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 768));
  /** Off-canvas drawer state for narrow (<768px, the `md` breakpoint) viewports — decoupled from
   * `sidebarOpen` (the desktop 256px/64px width toggle) since on mobile the sidebar is either fully
   * open as an overlay or fully hidden, never a persistent icon rail. See NAV_EXPANDED below. */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavKey>("dashboard");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quotationListFilter, setQuotationListFilter] = useState<QuotationListFilter | null>(null);
  /** Set by a notification click when it has a `relatedQuoteId` — opens that quote's detail view directly instead of just the module's list, consumed once by QuotationPage then cleared (see below). */
  const [quotationDeepLinkId, setQuotationDeepLinkId] = useState<string | null>(null);
  /** Same deep-link pattern as `quotationDeepLinkId` above, one per module — set by a Global Search
   * result click (see `GlobalSearch.tsx`), consumed once by the target page then cleared. */
  const [customerDeepLinkId, setCustomerDeepLinkId] = useState<string | null>(null);
  const [productDeepLinkId, setProductDeepLinkId] = useState<string | null>(null);
  const [userDeepLinkId, setUserDeepLinkId] = useState<string | null>(null);
  /** Set by a Global Search "Template ใบเสนอราคา" result click — opens the Create Quotation
   * wizard with this Job Type + Template preselected (see QuotationTemplateWizard.tsx). */
  const [quotationTemplateDeepLink, setQuotationTemplateDeepLink] = useState<{ jobTypeCode: string; templateId: string } | null>(null);
  /** Set by a Global Search "Scope of Work" result click (added 2026-07-15, Codex review High
   * Priority fix) — opens the source quotation's detail view, then jumps straight into that Scope
   * of Work's editor (see `QuotationPage.tsx`'s `initialScopeOfWorkDeepLink`). */
  const [scopeOfWorkDeepLink, setScopeOfWorkDeepLink] = useState<{ quotationId: string; scopeOfWorkId: string } | null>(null);
  /** Set by a "scope_of_work_document_sent" notification click (added 2026-07-23) — jumps straight
   * to that record's detail view on the standalone Scope of Work page. Distinct from
   * `scopeOfWorkDeepLink` above (which requires a `quotationId` and opens the quotation-embedded
   * view instead) since a document recipient may not be the quotation's owner/salesperson and this
   * is the more natural landing spot for "a document was sent to me." */
  const [scopeOfWorkDeepLinkId, setScopeOfWorkDeepLinkId] = useState<string | null>(null);
  /** Set by ScopeOfWorkDocument.tsx's "สร้าง/เปิดใบส่งมอบสินค้า" button (added 2026-07-23) — jumps
   * straight to that record's detail view on the standalone Delivery Order page, same pattern as
   * `scopeOfWorkDeepLinkId` above. */
  const [deliveryOrderDeepLinkId, setDeliveryOrderDeepLinkId] = useState<string | null>(null);
  /** Set by the Create Quotation wizard's "สร้าง Template ใหม่สำหรับประเภทงานนี้" action — opens
   * Template Management's create form pre-filled with that Job Type (see
   * `TemplateManagementPage.tsx`'s `initialCreateForJobType` prop). `seq` follows the same
   * monotonic-sequence-number convention as `pageAction` below, for the same reason (a second click
   * while already on the page must still re-fire). */
  const [templateCreateForJobType, setTemplateCreateForJobType] = useState<{ jobTypeCode: string; jobTypeName: string; seq: number } | null>(null);
  const templateCreateSeq = useRef(0);
  /** Set by a Global Search "page action" result (e.g. "Create Quotation," "Product Categories")
   * — `seq` is a monotonic sequence number, not a boolean, so the same result clicked twice in a
   * row still re-fires on the target page (see CustomersPage/ProductsPage's `autoCreateSeq`/
   * `autoViewSeq` props for the consuming side). Cleared once the target page has applied it. */
  const [pageAction, setPageAction] = useState<{ nav: NavKey; action: "create" | "categories"; seq: number } | null>(null);
  const pageActionSeq = useRef(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [company, setCompany] = useState<Company>(defaultCompany);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  /** Same `.catch(() => [])` guard applied at every call site: not every default role holds
   * `customers:view` (Viewer/Approver only get it as a read-only grant, but a hypothetical custom
   * role might not), and `quotations:create` alone is enough to read active customers via the
   * server's carve-out — see api/_lib/customersHandler.ts. A rejection here must not be treated as
   * a real data-load failure (see `loadDomainData` below) — it's an expected, valid 403 for some
   * roles, not an error to surface. */
  const [customers, setCustomers] = useState<Customer[]>([]);

  // ── Progressive boot data loading (2026-07-14, reworked same day — Codex review High Priority
  // fix) ────────────────────────────────────────────────────────────────────────────────────────
  // `bootStatus` flips to `"ready"` as soon as the session check resolves — the sidebar/header
  // shell renders immediately at that point (see the render logic below), *before* any of the bulk
  // domain data (users/roles/quotes/products/etc.) has arrived. The first version of this pass
  // tracked that separate, slower fetch behind ONE flag (`initialDataLoading`) shared by every
  // boot-time resource — which meant navigating straight to e.g. Products still waited on
  // `notifications`/`quotes`/`users`/etc. even though Products only needs `products`/`categories`.
  // An independent Codex review flagged this as still effectively a global blocking gate. Fixed by
  // tracking each resource's own status independently (`resourceStatus`), so a given page's
  // readiness is computed only from the resources *it* actually needs (see `NAV_RESOURCES` above) —
  // Dashboard/AuditLog still don't wait on any of this at all, they fetch their own data.
  const [resourceStatus, setResourceStatus] = useState<Record<ResourceKey, ResourceState>>(INITIAL_RESOURCE_STATUS);
  const [bootError, setBootError] = useState(false);

  const [showTourPrompt, setShowTourPrompt] = useState(false);
  const tour = useGuidedTour(() => {
    setShowTourPrompt(false);
    if (currentUser) markTourCompleted(currentUser.id);
  });

  /**
   * Fires every boot-data fetch independently (not one blocking `Promise.all`) so each domain list
   * populates the UI — and its own `resourceStatus` entry flips to `"ready"`/`"error"` — as soon as
   * *its own* request resolves, rather than every resource (and every page gated on one) waiting
   * for the single slowest of the nine. No shared `Promise.allSettled` gate anymore — each resource
   * is independently observable, which is what lets `NAV_RESOURCES` below compute per-page
   * readiness from only the subset a given page actually needs.
   */
  // `useCallback` with an empty dep array (both here and on `loadDomainData` below) — `setXxx`
  // setters are React-guaranteed stable and `INITIAL_RESOURCE_STATUS` is a module-level constant,
  // so neither function's *real* behavior depends on anything that changes across renders. Making
  // them referentially stable is what lets the boot effect below list `loadDomainData` in its
  // dependency array (satisfying `react-hooks/exhaustive-deps`) without re-running on every render.
  const trackResource = useCallback(<T,>(key: ResourceKey, promise: Promise<T>, onSuccess: (v: T) => void) => {
    promise
      .then((v) => { onSuccess(v); setResourceStatus((s) => ({ ...s, [key]: "ready" })); })
      .catch(() => { setResourceStatus((s) => ({ ...s, [key]: "error" })); });
  }, []);
  const loadDomainData = useCallback(() => {
    setResourceStatus(INITIAL_RESOURCE_STATUS);
    trackResource("users", fetchUsers(), setUsers);
    trackResource("roles", fetchRoles(), setRoles);
    trackResource("company", fetchCompany(), setCompany);
    trackResource("products", fetchProducts(), setProducts);
    trackResource("categories", fetchCategories(), setCategories);
    trackResource("notifications", fetchNotifications(), setNotifications);
    trackResource("quotes", fetchQuotes(), setQuotes);
    trackResource("jobTypes", fetchJobTypes(), setJobTypes);
    // Not every default role holds `customers:view` (see the `customers` state doc comment above) —
    // a 403 here is an expected, valid outcome for some roles, not a real data-load failure, so it
    // resolves as "ready" with an empty list rather than "error" (which would show a retry prompt
    // for something retrying can never fix).
    trackResource("customers", fetchCustomers().catch(() => []), setCustomers);
  }, [trackResource]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let session;
      try {
        session = await fetchSession();
      } catch {
        // Previously unhandled — a thrown network/API error here left `bootStatus` stuck at
        // `"loading"` forever with no way out (documented gap, see TODO.md/CHANGELOG.md
        // 2026-07-14). Now surfaces a real, retryable error screen instead.
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

  // Mobile drawer: Escape closes it, and it never survives a nav change made some other way
  // (e.g. browser back) since it's plain UI state, not routed — no cleanup needed there.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileNavOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  // ── Notification polling (2026-07-24, direct user request) ──────────────────────────────────
  // Notifications were previously fetched once at boot only, so e.g. a "เอกสารส่งถึงคุณ" event
  // never appeared until a full page reload. Polling (not SSE/WebSocket) is deliberate: the
  // current Vercel serverless backend can't hold a connection open, and polling stays portable to
  // the future self-managed server — SSE is recorded as a possible post-migration upgrade in
  // docs/SERVER_MIGRATION_PLAN.md. Skips while the tab is hidden (no wasted requests for a
  // backgrounded tab); a hidden→visible transition and window focus both refetch immediately, so
  // returning to the tab never waits out the remainder of an interval.
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

  // Offers the guided tour once per user, the first time they land on a "ready" session — not
  // forced (see `showTourPrompt`'s Start/Skip banner below), and never shown again once they've
  // either finished or explicitly skipped it (tracked in localStorage, see src/lib/tour.ts).
  // React's "adjust state during rendering" pattern (not an effect — a bare setState call in an
  // effect body trips react-hooks/set-state-in-effect): reacts to `currentUser` changing (i.e.
  // sign-in completing), checked against state (not a ref — refs can't be read/written during
  // render) so it only evaluates once per sign-in, not on every unrelated re-render.
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
  const navigateToCreateTemplateForJobType = (jobTypeCode: string, jobTypeName: string) => {
    templateCreateSeq.current += 1;
    setTemplateCreateForJobType({ jobTypeCode, jobTypeName, seq: templateCreateSeq.current });
    setActiveNav("quotationTemplates");
  };
  /** `navKey` arrives from Global Search as a plain string (see `SearchPageResult` in
   * src/lib/search.ts) — validated against the known `NavKey` union here, at the one place a
   * server-supplied string actually needs to become a real `NavKey`, rather than trusting it
   * blindly or threading an unsafe cast through GlobalSearch.tsx. */
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

  const handleSignIn = async (identifier: string, password: string): Promise<string | null> => {
    const result = await login(identifier, password);
    if (result.error || !result.user) return result.error;
    setCurrentUser(result.user);
    setBootStatus("ready");
    loadDomainData();
    logAudit({ module: "ระบบ", action: "Login", details: "เข้าสู่ระบบสำเร็จ" }).catch(() => {});
    return null;
  };

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

  const visibleNavItems = navItems.filter((item) => !item.permission || hasPermission(currentUser, roles, item.permission));
  const activeNavItem = navItems.find((n) => n.key === activeNav);
  const activeNavAllowed = activeNav === "settings" || !activeNavItem?.permission || hasPermission(currentUser, roles, activeNavItem.permission);
  const effectiveNav = activeNavAllowed ? activeNav : "dashboard";
  // Only the resources `effectiveNav`'s own page actually needs gate it — see `NAV_RESOURCES`
  // above. A page not listed there (Dashboard/AuditLog) is never gated here at all.
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
  // Same flat permission checks QuotationPage.tsx already computes for its own embedded
  // ScopeOfWorkDocument usage — the standalone page (added 2026-07-22) reuses the exact same
  // component, so it needs the exact same props.
  const canCreateScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:create");
  const canEditScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:edit");
  const canFinalizeScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:finalize");
  const canPrintScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:print");
  const canDeleteScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:delete");
  // Delivery Order (added 2026-07-23) — `canViewDeliveryOrder`/`canCreateDeliveryOrder` gate
  // ScopeOfWorkDocument.tsx's "สร้าง/เปิดใบส่งมอบสินค้า" button (passed into both QuotationPage.tsx
  // and ScopeOfWorkPage.tsx, since that same component renders from either); the rest back
  // DeliveryOrderPage.tsx's own detail view, same flat-props convention as Scope of Work above.
  const canViewDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:view");
  const canCreateDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:create");
  const canEditDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:edit");
  const canFinalizeDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:finalize");
  const canPrintDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:print");
  const canDeleteDeliveryOrder = hasPermission(currentUser, roles, "deliveryOrder:delete");
  const isSuperAdmin = userIsSuperAdmin(currentUser, roles);
  // `quotationTemplates:manage` is a legacy superset permission kept for backward compatibility
  // with role assignments made before the granular `quotationTemplates:*` permissions existed (see
  // docs/RBAC.md) — every granular check here also accepts it, so a pre-existing custom role that
  // only ever held `:manage` keeps full access without an admin having to re-save it.
  const hasTemplatePerm = (perm: Permission) => hasPermission(currentUser, roles, "quotationTemplates:manage") || hasPermission(currentUser, roles, perm);
  const canCreateTemplates = hasTemplatePerm("quotationTemplates:create");
  const canEditTemplates = hasTemplatePerm("quotationTemplates:edit");
  const canDuplicateTemplates = hasTemplatePerm("quotationTemplates:duplicate");
  const canActivateTemplates = hasTemplatePerm("quotationTemplates:activate");
  const canArchiveTemplates = hasTemplatePerm("quotationTemplates:archive");
  const canImportTemplates = hasTemplatePerm("quotationTemplates:import");
  /** Whether the sidebar should render its expanded content (group labels, nav text, full brand
   * wordmark) — true on desktop when the user hasn't collapsed it, and always true inside the
   * mobile off-canvas drawer (there's no icon-only state for an overlay, it's open-and-full or
   * closed). Kept separate from `sidebarOpen` itself, which only ever controls desktop width. */
  const navExpanded = sidebarOpen || mobileNavOpen;
  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans text-foreground print:h-auto print:overflow-visible print:block">
      {/* Mobile drawer backdrop */}
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-[#0b1d3a]/50 z-30 md:hidden" onClick={closeMobileNav} aria-hidden="true" />
      )}

      {/* Sidebar — static column on desktop (md+), off-canvas overlay drawer below md */}
      <aside
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
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{t(group.labelKey)}</p>
                )}
                {items.map(({ key, icon: Icon, labelKey }) => (
                  <button key={key} onClick={() => { setActiveNav(key); closeMobileNav(); }} title={navExpanded ? undefined : t(labelKey)}
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
          <button onClick={() => { setActiveNav("settings"); closeMobileNav(); }} title={navExpanded ? undefined : t("nav.settings")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all duration-150 border min-w-0 ${
              activeNav === "settings" ? "bg-[#c9a84c]/15 text-[#c9a84c] border-[#c9a84c]/25" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white border-transparent"
            }`}>
            <Settings size={17} className="flex-shrink-0" />
            {navExpanded && <span className="text-sm truncate min-w-0">{t("nav.settings")}</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:block">
        <header className="flex items-center gap-2 md:gap-4 px-3 md:px-6 py-3 md:py-4 border-b border-border bg-card min-h-[60px] md:min-h-[68px] relative print:hidden">
          <button onClick={() => setMobileNavOpen(true)} aria-label={t("nav.openMenu")} className="md:hidden text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
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
          {/* User manual — deliberately a labeled gold pill, not just an icon, per direct user
              request that anyone who can't use the system immediately sees where the manual is. */}
          <a
            href={encodeURI("/คู่มือการใช้งาน TCS ERP.pdf")}
            target="_blank"
            rel="noreferrer"
            aria-label={t("topbar.manual")}
            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-full border border-[#c9a84c]/60 bg-[#c9a84c]/10 text-[#a07830] hover:bg-[#c9a84c]/20 hover:border-[#c9a84c] transition-all text-xs font-semibold"
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
                if (n.relatedDeliveryOrderId) navigateToDeliveryOrder(n.relatedDeliveryOrderId);
                else if (n.relatedScopeId) navigateToScopeOfWorkStandalone(n.relatedScopeId);
                else if (n.relatedQuoteId) navigateToQuotation(n.relatedQuoteId);
              }}
            />
          </div>
          <div className="relative" data-tour="user-menu">
            <button onClick={() => setUserMenuOpen((v) => !v)} className="flex items-center gap-2.5 pl-3 border-l border-border">
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

        <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:block">
          <ErrorBoundary key={effectiveNav}>
          <Suspense fallback={<PageLoading />}>
            {/* Dashboard and Audit Log fetch their own data independently (see AREA 2 in the
                2026-07-14 progressive-loading pass) — they render immediately regardless of any
                boot-time resource's status. Every other page here is purely prop-driven off the
                boot-time domain fetch (`loadDomainData`), so it shows a lightweight `SectionLoading`
                placeholder instead while *its own required resources* (`NAV_RESOURCES`/
                `pageDataLoading`/`pageDataError` above — not every boot resource) are still in
                flight — rendering the real page early with empty arrays would otherwise look like a
                false "no records yet" empty state. Reworked 2026-07-14 (Codex review High Priority
                fix) from one global flag shared by all nine boot resources to this per-page subset,
                so e.g. navigating straight to Products no longer waits on unrelated resources like
                `notifications`/`quotes` that Products never reads. */}
            {effectiveNav === "dashboard"
              ? <DashboardPage onNavigateToQuotations={navigateToQuotations} onOpenQuote={navigateToQuotation} />
              : effectiveNav === "auditLog"
              ? <AuditLogPage />
              : effectiveNav === "scopeOfWork"
              ? <ScopeOfWorkPage users={users} canEdit={canEditScopeOfWork} canFinalize={canFinalizeScopeOfWork} canPrint={canPrintScopeOfWork} canDelete={canDeleteScopeOfWork} canCreate={canCreateScopeOfWork} canViewDeliveryOrder={canViewDeliveryOrder} canCreateDeliveryOrder={canCreateDeliveryOrder} onOpenDeliveryOrder={navigateToDeliveryOrder} initialScopeOfWorkId={scopeOfWorkDeepLinkId} onScopeOfWorkIdConsumed={() => setScopeOfWorkDeepLinkId(null)} />
              : effectiveNav === "deliveryOrder"
              ? <DeliveryOrderPage company={company} canEdit={canEditDeliveryOrder} canFinalize={canFinalizeDeliveryOrder} canPrint={canPrintDeliveryOrder} canDelete={canDeleteDeliveryOrder} canCreate={canCreateDeliveryOrder} initialDeliveryOrderId={deliveryOrderDeepLinkId} onDeliveryOrderIdConsumed={() => setDeliveryOrderDeepLinkId(null)} />
              : pageDataLoading || pageDataError
              ? <SectionLoading error={pageDataError} onRetry={loadDomainData} />
              : effectiveNav === "quotations"
              ? <QuotationPage quotes={quotes} setQuotes={setQuotes} company={company} currentUser={currentUser} users={users} roles={roles} products={products} categories={categories} jobTypes={jobTypes} customers={customers} initialFilter={quotationListFilter} onFilterConsumed={() => setQuotationListFilter(null)} initialQuoteId={quotationDeepLinkId} onQuoteIdConsumed={() => setQuotationDeepLinkId(null)} initialTemplateSelection={quotationTemplateDeepLink} onTemplateSelectionConsumed={() => setQuotationTemplateDeepLink(null)} initialScopeOfWorkDeepLink={scopeOfWorkDeepLink} onScopeOfWorkDeepLinkConsumed={() => setScopeOfWorkDeepLink(null)} onNotify={refreshNotifications} canCreateTemplate={canCreateTemplates} onCreateTemplateForJobType={navigateToCreateTemplateForJobType} canViewDeliveryOrder={canViewDeliveryOrder} canCreateDeliveryOrder={canCreateDeliveryOrder} onOpenDeliveryOrder={navigateToDeliveryOrder} />
              : effectiveNav === "quotationTemplates"
              ? <TemplateManagementPage jobTypes={jobTypes} products={products} categories={categories} canCreate={canCreateTemplates} canEdit={canEditTemplates} canDuplicate={canDuplicateTemplates} canActivate={canActivateTemplates} canArchive={canArchiveTemplates} canImport={canImportTemplates} initialCreateForJobType={templateCreateForJobType} onCreateForJobTypeConsumed={() => setTemplateCreateForJobType(null)} onCreateQuotationFromTemplate={navigateToTemplate} />
              : effectiveNav === "customers"
              ? <CustomersPage customers={customers} onCustomersChange={setCustomers} canCreate={canCreateCustomers} canEdit={canEditCustomers} canArchive={canArchiveCustomers} initialEditId={customerDeepLinkId} onEditIdConsumed={() => setCustomerDeepLinkId(null)} autoCreateSeq={pageAction?.nav === "customers" && pageAction.action === "create" ? pageAction.seq : null} onAutoActionConsumed={clearPageAction} />
              : effectiveNav === "settings"
              ? <SettingsPage company={company} onCompanyChange={updateCompany} currentUser={currentUser} onUserChange={updateCurrentUser} roles={roles} canManageCompany={canManageCompany} onAudit={handleAudit} />
              : effectiveNav === "products"
              ? <ProductsPage products={products} onProductsChange={updateProducts} categories={categories} onCategoriesChange={updateCategories} initialEditId={productDeepLinkId} onEditIdConsumed={() => setProductDeepLinkId(null)} autoView={pageAction?.nav === "products" ? pageAction.action : null} autoViewSeq={pageAction?.nav === "products" ? pageAction.seq : null} onAutoActionConsumed={clearPageAction} />
              : effectiveNav === "users"
              ? <UserManagementPage users={users} onUsersChange={updateUsers} roles={roles} currentUser={currentUser} isSuperAdmin={isSuperAdmin} onAudit={handleAudit} initialEditId={userDeepLinkId} onEditIdConsumed={() => setUserDeepLinkId(null)} />
              : effectiveNav === "roles" && isSuperAdmin
              ? <RoleManagementPage roles={roles} onRolesChange={updateRoles} users={users} onAudit={handleAudit} />
              : <DashboardPage onNavigateToQuotations={navigateToQuotations} onOpenQuote={navigateToQuotation} />
            }
          </Suspense>
          </ErrorBoundary>
        </div>
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
