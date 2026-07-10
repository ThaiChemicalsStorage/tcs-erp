import { lazy, Suspense, useEffect, useState } from "react";
import {
  LayoutDashboard, Settings, Package,
  Search, ChevronRight, Menu, X, ChevronDown,
  LogOut, type LucideIcon, FileText, Users as UsersIcon, ShieldCheck, ScrollText,
} from "lucide-react";
import { type Company, defaultCompany, fetchCompany } from "./lib/storage";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "./lib/products";
import { type JobType, fetchJobTypes } from "./lib/jobTypes";
import { type Quote, fetchQuotes } from "./lib/quotes";
import type { QuotationListFilter } from "./pages/dashboard/DashboardPage";
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
import { NotificationBell } from "./components/NotificationBell";
import { BrandMark } from "./components/BrandMark";
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

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeNav, setActiveNav] = useState<NavKey>("dashboard");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quotationListFilter, setQuotationListFilter] = useState<QuotationListFilter | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [company, setCompany] = useState<Company>(defaultCompany);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);

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

  return (
    <div className="flex h-screen bg-background overflow-hidden font-[Inter,sans-serif] text-foreground print:h-auto print:overflow-visible print:block">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-16"} flex-shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out overflow-hidden print:hidden`}>
        <div className={`flex items-center border-b border-sidebar-border min-h-[68px] transition-all duration-300 ease-in-out ${sidebarOpen ? "gap-3 px-4 py-5" : "justify-center py-5"}`}>
          <BrandMark size={32} variant={sidebarOpen ? "full" : "mark"} theme="dark" />
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {visibleNavItems.map(({ key, icon: Icon, labelKey }) => (
            <button key={key} onClick={() => setActiveNav(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 relative
                ${activeNav === key ? "bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/25" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white border border-transparent"}`}>
              <Icon size={17} className="flex-shrink-0" />
              {sidebarOpen && <span className="text-sm whitespace-nowrap overflow-hidden">{t(labelKey)}</span>}
            </button>
          ))}
        </nav>
        <div className="px-2 py-3 border-t border-sidebar-border">
          <button onClick={() => setActiveNav("settings")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 border ${
              activeNav === "settings" ? "bg-[#c9a84c]/15 text-[#c9a84c] border-[#c9a84c]/25" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white border-transparent"
            }`}>
            <Settings size={17} className="flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">{t("nav.settings")}</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:block">
        <header className="flex items-center gap-4 px-6 py-4 border-b border-border bg-card min-h-[68px] relative print:hidden">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-muted-foreground hover:text-foreground transition-colors">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("topbar.org")}</span>
            <ChevronRight size={13} className="text-muted-foreground" />
            <span className="text-[#c9a84c] font-medium" style={{ fontFamily: "'Playfair Display', serif" }}>{t(NAV_LABEL_KEYS[effectiveNav])}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 focus-within:border-[#c9a84c]/40 transition-colors">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input type="text" placeholder={t("topbar.searchPlaceholder")} className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full" />
          </div>
          <NotificationBell
            notifications={notifications}
            currentUserId={currentUser.id}
            onMarkRead={markNotificationRead}
            onMarkAllRead={markAllNotificationsRead}
            onDelete={deleteNotification}
            onNavigate={(n) => { if (n.relatedQuoteId) setActiveNav("quotations"); }}
          />
          <div className="relative">
            <button onClick={() => setUserMenuOpen((v) => !v)} className="flex items-center gap-2.5 pl-3 border-l border-border">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#a07830] flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                {currentUser.profilePictureDataUrl ? (
                  <img src={currentUser.profilePictureDataUrl} alt={currentUser.fullName} className="w-full h-full object-cover" />
                ) : (
                  initials(currentUser.fullName || "?")
                )}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-xs font-semibold text-foreground leading-tight">{currentUser.fullName}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{roleNameFor(currentUser, roles)}</p>
              </div>
              <ChevronDown size={14} className="text-muted-foreground hidden md:block" />
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
              ? <QuotationPage quotes={quotes} setQuotes={setQuotes} company={company} currentUser={currentUser} users={users} roles={roles} products={products} categories={categories} jobTypes={jobTypes} initialFilter={quotationListFilter} onFilterConsumed={() => setQuotationListFilter(null)} onNotify={refreshNotifications} onAudit={handleAudit} />
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
              : <DashboardPage quotes={quotes} onNavigateToQuotations={navigateToQuotations} />
            }
          </Suspense>
        </div>
      </div>
    </div>
  );
}
