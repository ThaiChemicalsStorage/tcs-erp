import { lazy, Suspense, useEffect, useState } from "react";
import {
  LayoutDashboard, Settings, Package,
  Search, ChevronRight, Menu, X, ChevronDown,
  LogOut, type LucideIcon, FileText, Users as UsersIcon, ShieldCheck, ScrollText, HelpCircle,
} from "lucide-react";
import { type Company, defaultCompany, fetchCompany } from "./lib/storage";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "./lib/products";
import { type JobType, fetchJobTypes } from "./lib/jobTypes";
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

/** Stable routing identifiers — decoupled from the (now translatable) display label, so switching language never breaks navigation. */
type NavKey = "dashboard" | "quotations" | "products" | "users" | "roles" | "auditLog" | "settings";

interface NavItem {
  key: NavKey;
  icon: LucideIcon;
  labelKey: TranslationKey;
  permission?: Permission;
}

const navItems: NavItem[] = [
  { key: "dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard", permission: "dashboard:view" },
  { key: "quotations", icon: FileText, labelKey: "nav.quotations", permission: "quotations:view" },
  { key: "products", icon: Package, labelKey: "nav.products", permission: "products:view" },
  { key: "users", icon: UsersIcon, labelKey: "nav.users", permission: "users:manage" },
  { key: "roles", icon: ShieldCheck, labelKey: "nav.roles", permission: "roles:manage" },
  { key: "auditLog", icon: ScrollText, labelKey: "nav.auditLog", permission: "auditLog:view" },
];

/**
 * Sidebar grouping (2026-07-10 UI/UX redesign) — purely a display grouping over the same flat
 * `navItems`/`NavKey` list above, not a new data model. Only reflects modules that actually exist
 * today: no "Leads"/"Customers" group (schema-only, no UI yet, see MODULES/Lead.md and
 * MODULES/Customer.md) and no separate "Approvals" group (approval actions live inside the
 * Quotation module's own workflow, there's no dedicated Pending Approvals/Approval History page).
 */
const NAV_GROUPS: { labelKey: TranslationKey; keys: NavKey[] }[] = [
  { labelKey: "nav.group.main", keys: ["dashboard"] },
  { labelKey: "nav.group.sales", keys: ["quotations"] },
  { labelKey: "nav.group.inventory", keys: ["products"] },
  { labelKey: "nav.group.admin", keys: ["users", "roles", "auditLog"] },
];

const NAV_LABEL_KEYS: Record<NavKey, TranslationKey> = {
  dashboard: "nav.dashboard",
  quotations: "nav.quotations",
  products: "nav.products",
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [company, setCompany] = useState<Company>(defaultCompany);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);

  const [showTourPrompt, setShowTourPrompt] = useState(false);
  const tour = useGuidedTour(() => {
    setShowTourPrompt(false);
    if (currentUser) markTourCompleted(currentUser.id);
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await fetchSession();
      if (cancelled) return;
      if (session.needsSetup) { setBootStatus("needsSetup"); return; }
      if (!session.user) { setBootStatus("signedOut"); return; }
      const [userList, roleList, companyData, productList, categoryList, notificationList, quoteList, jobTypeList] = await Promise.all([
        fetchUsers(), fetchRoles(), fetchCompany(), fetchProducts(), fetchCategories(), fetchNotifications(), fetchQuotes(), fetchJobTypes(),
      ]);
      if (cancelled) return;
      setUsers(userList);
      setRoles(roleList);
      setCompany(companyData);
      setProducts(productList);
      setCategories(categoryList);
      setNotifications(notificationList);
      setQuotes(quoteList);
      setJobTypes(jobTypeList);
      setCurrentUser(session.user);
      setBootStatus("ready");
    })();
    return () => { cancelled = true; };
  }, []);

  // Mobile drawer: Escape closes it, and it never survives a nav change made some other way
  // (e.g. browser back) since it's plain UI state, not routed — no cleanup needed there.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileNavOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

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
      const [userList, roleList, companyData, productList, categoryList, notificationList, quoteList, jobTypeList] = await Promise.all([
        fetchUsers(), fetchRoles(), fetchCompany(), fetchProducts(), fetchCategories(), fetchNotifications(), fetchQuotes(), fetchJobTypes(),
      ]);
      setUsers(userList);
      setRoles(roleList);
      setCompany(companyData);
      setProducts(productList);
      setCategories(categoryList);
      setNotifications(notificationList);
      setQuotes(quoteList);
      setJobTypes(jobTypeList);
      setCurrentUser(created);
      setBootStatus("ready");
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
    const found = result.user;
    const [userList, roleList, companyData, productList, categoryList, notificationList, quoteList, jobTypeList] = await Promise.all([
      fetchUsers(), fetchRoles(), fetchCompany(), fetchProducts(), fetchCategories(), fetchNotifications(), fetchQuotes(), fetchJobTypes(),
    ]);
    setUsers(userList);
    setRoles(roleList);
    setCompany(companyData);
    setProducts(productList);
    setCategories(categoryList);
    setNotifications(notificationList);
    setQuotes(quoteList);
    setJobTypes(jobTypeList);
    setCurrentUser(found);
    setBootStatus("ready");
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
    setNotifications([]);
    setQuotes([]);
    setBootStatus("signedOut");
    setUserMenuOpen(false);
    setActiveNav("dashboard");
  };

  const visibleNavItems = navItems.filter((item) => !item.permission || hasPermission(currentUser, roles, item.permission));
  const activeNavItem = navItems.find((n) => n.key === activeNav);
  const activeNavAllowed = activeNav === "settings" || !activeNavItem?.permission || hasPermission(currentUser, roles, activeNavItem.permission);
  const effectiveNav = activeNavAllowed ? activeNav : "dashboard";

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
  const isSuperAdmin = userIsSuperAdmin(currentUser, roles);
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
          <div className="hidden lg:flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 ml-auto focus-within:border-[#c9a84c]/40 transition-colors">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input type="text" placeholder={t("topbar.searchPlaceholder")} className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full" />
          </div>
          <div data-tour="notification-bell" className="ml-auto lg:ml-0 flex-shrink-0">
            <NotificationBell
              notifications={notifications}
              currentUserId={currentUser.id}
              onMarkRead={markNotificationRead}
              onMarkAllRead={markAllNotificationsRead}
              onDelete={deleteNotification}
              onNavigate={(n) => { if (n.relatedQuoteId) navigateToQuotation(n.relatedQuoteId); }}
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
          <Suspense fallback={<PageLoading />}>
            {effectiveNav === "quotations"
              ? <QuotationPage quotes={quotes} setQuotes={setQuotes} company={company} currentUser={currentUser} users={users} roles={roles} products={products} categories={categories} jobTypes={jobTypes} initialFilter={quotationListFilter} onFilterConsumed={() => setQuotationListFilter(null)} initialQuoteId={quotationDeepLinkId} onQuoteIdConsumed={() => setQuotationDeepLinkId(null)} onNotify={refreshNotifications} />
              : effectiveNav === "settings"
              ? <SettingsPage company={company} onCompanyChange={updateCompany} currentUser={currentUser} onUserChange={updateCurrentUser} roles={roles} canManageCompany={canManageCompany} onAudit={handleAudit} />
              : effectiveNav === "products"
              ? <ProductsPage products={products} onProductsChange={updateProducts} categories={categories} onCategoriesChange={updateCategories} />
              : effectiveNav === "users"
              ? <UserManagementPage users={users} onUsersChange={updateUsers} roles={roles} currentUser={currentUser} isSuperAdmin={isSuperAdmin} onAudit={handleAudit} />
              : effectiveNav === "roles" && isSuperAdmin
              ? <RoleManagementPage roles={roles} onRolesChange={updateRoles} users={users} onAudit={handleAudit} />
              : effectiveNav === "auditLog"
              ? <AuditLogPage />
              : <DashboardPage onNavigateToQuotations={navigateToQuotations} onOpenQuote={navigateToQuotation} />
            }
          </Suspense>
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
