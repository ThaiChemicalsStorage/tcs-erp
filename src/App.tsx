import { lazy, Suspense, useEffect, useState } from "react";
import {
  LayoutDashboard, Settings, Package,
  Search, ChevronRight, Menu, X, ChevronDown,
  LogOut, type LucideIcon, FileText, Users as UsersIcon, ShieldCheck, ScrollText,
} from "lucide-react";
import { type Company, loadCompany, saveCompany } from "./lib/storage";
import {
  type Product, type ProductCategory,
  loadProducts, saveProducts, loadCategories, saveCategories,
} from "./lib/products";
import { type Quote, loadQuotes, saveQuotes } from "./lib/quotes";
import {
  type User, loadUsers, saveUsers, findUserByLogin, verifyPassword, newUser, initials,
} from "./lib/users";
import { type Role, loadRoles, saveRoles, hasPermission, userIsSuperAdmin, roleNameFor } from "./lib/roles";
import type { Permission } from "./lib/permissions";
import { loadSession, saveSession, clearSession } from "./lib/session";
import { type Notification, loadNotifications, saveNotifications } from "./lib/notifications";
import { type AuditLogEntry, loadAuditLog, logAudit } from "./lib/auditLog";
import { NotificationBell } from "./components/NotificationBell";
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

interface NavItem {
  icon: LucideIcon;
  label: string;
  permission?: Permission;
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "แดชบอร์ด", permission: "dashboard:view" },
  { icon: FileText, label: "ใบเสนอราคา", permission: "quotations:view" },
  { icon: Package, label: "คลังสินค้า", permission: "products:view" },
  { icon: UsersIcon, label: "จัดการผู้ใช้งาน", permission: "users:manage" },
  { icon: ShieldCheck, label: "บทบาทและสิทธิ์", permission: "roles:manage" },
  { icon: ScrollText, label: "บันทึกการใช้งาน", permission: "auditLog:view" },
];

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

export default function App() {
  const [users, setUsers] = useState<User[]>(() => loadUsers());
  const [roles, setRoles] = useState<Role[]>(() => loadRoles());
  const [sessionUserId, setSessionUserId] = useState<string | null>(() => loadSession());
  const [notifications, setNotifications] = useState<Notification[]>(() => loadNotifications());
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>(() => loadAuditLog());

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeNav, setActiveNav] = useState("แดชบอร์ด");
  const [quotes, setQuotes] = useState<Quote[]>(() => loadQuotes());
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [company, setCompany] = useState<Company>(() => loadCompany());
  const [products, setProducts] = useState<Product[]>(() => loadProducts());
  const [categories, setCategories] = useState<ProductCategory[]>(() => loadCategories());

  useEffect(() => { saveQuotes(quotes); }, [quotes]);

  const currentUser = users.find((u) => u.id === sessionUserId) ?? null;

  const updateCompany = (next: Company) => { setCompany(next); saveCompany(next); };
  const updateProducts = (next: Product[]) => { setProducts(next); saveProducts(next); };
  const updateCategories = (next: ProductCategory[]) => { setCategories(next); saveCategories(next); };
  const updateUsers = (next: User[]) => { setUsers(next); saveUsers(next); };
  const updateRoles = (next: Role[]) => { setRoles(next); saveRoles(next); };
  const updateCurrentUser = (next: User) => updateUsers(users.map((u) => (u.id === next.id ? next : u)));

  const addNotifications = (newOnes: Notification[]) => {
    if (newOnes.length === 0) return;
    setNotifications((prev) => {
      const next = [...prev, ...newOnes];
      saveNotifications(next);
      return next;
    });
  };
  const markNotificationRead = (id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      saveNotifications(next);
      return next;
    });
  };
  const markAllNotificationsRead = () => {
    if (!currentUser) return;
    setNotifications((prev) => {
      const next = prev.map((n) => (n.recipientUserId === currentUser.id ? { ...n, read: true } : n));
      saveNotifications(next);
      return next;
    });
  };
  const deleteNotification = (id: string) => {
    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id);
      saveNotifications(next);
      return next;
    });
  };

  const handleAudit = (action: string, details: string) => {
    if (!currentUser) return;
    setAuditEntries(logAudit({
      userId: currentUser.id,
      userName: currentUser.fullName,
      roleName: roleNameFor(currentUser, roles),
      module: moduleForAction(action),
      action,
      details,
    }));
  };

  const handleSetupComplete = (fields: SetupWizardFields) => {
    const superAdminRole = roles.find((r) => r.isSuperAdmin) ?? roles[0];
    const created = newUser({
      employeeId: fields.employeeId, fullName: fields.fullName, username: fields.username,
      email: fields.email, password: fields.password, roleKey: superAdminRole.key, status: "active",
    });
    updateUsers([created]);
    updateRoles(roles);
    saveSession(created.id);
    setSessionUserId(created.id);
    setAuditEntries(logAudit({
      userId: created.id, userName: created.fullName, roleName: superAdminRole.name,
      module: "ระบบ", action: "User Created", details: `ตั้งค่าเริ่มต้นระบบ — สร้างบัญชี Super Admin คนแรก (${created.username})`,
    }));
  };

  const handleSignIn = (identifier: string, password: string): string | null => {
    const found = findUserByLogin(users, identifier);
    if (!found || !verifyPassword(password, found.passwordHash)) return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
    if (found.status === "inactive") return "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ";
    saveSession(found.id);
    setSessionUserId(found.id);
    setAuditEntries(logAudit({
      userId: found.id, userName: found.fullName, roleName: roleNameFor(found, roles),
      module: "ระบบ", action: "Login", details: "เข้าสู่ระบบสำเร็จ",
    }));
    return null;
  };

  const handleLogout = () => {
    if (currentUser) {
      setAuditEntries(logAudit({
        userId: currentUser.id, userName: currentUser.fullName, roleName: roleNameFor(currentUser, roles),
        module: "ระบบ", action: "Logout", details: "",
      }));
    }
    clearSession();
    setSessionUserId(null);
    setUserMenuOpen(false);
    setActiveNav("แดชบอร์ด");
  };

  const visibleNavItems = navItems.filter((item) => !item.permission || hasPermission(currentUser, roles, item.permission));
  const activeNavItem = navItems.find((n) => n.label === activeNav);
  const activeNavAllowed = activeNav === "ตั้งค่า" || !activeNavItem?.permission || hasPermission(currentUser, roles, activeNavItem.permission);
  const effectiveNav = activeNavAllowed ? activeNav : "แดชบอร์ด";

  if (users.length === 0) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <SetupWizardPage onComplete={handleSetupComplete} />
      </Suspense>
    );
  }

  if (!currentUser) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
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
        <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border min-h-[68px]">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#c9a84c] flex items-center justify-center">
            <span className="text-[#0b1d3a] text-sm font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>ท</span>
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="text-white text-sm font-semibold whitespace-nowrap leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>TCS ERP</p>
              <p className="text-[#c9a84c] text-[10px] font-mono uppercase tracking-widest">คลังเคมีภัณฑ์ไทย</p>
            </div>
          )}
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {visibleNavItems.map(({ icon: Icon, label }) => (
            <button key={label} onClick={() => setActiveNav(label)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 relative
                ${activeNav === label ? "bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/25" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white border border-transparent"}`}>
              <Icon size={17} className="flex-shrink-0" />
              {sidebarOpen && <span className="text-sm whitespace-nowrap overflow-hidden">{label}</span>}
            </button>
          ))}
        </nav>
        <div className="px-2 py-3 border-t border-sidebar-border">
          <button onClick={() => setActiveNav("ตั้งค่า")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 border ${
              activeNav === "ตั้งค่า" ? "bg-[#c9a84c]/15 text-[#c9a84c] border-[#c9a84c]/25" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white border-transparent"
            }`}>
            <Settings size={17} className="flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">ตั้งค่า</span>}
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
            <span className="text-muted-foreground">องค์กร</span>
            <ChevronRight size={13} className="text-muted-foreground" />
            <span className="text-[#c9a84c] font-medium" style={{ fontFamily: "'Playfair Display', serif" }}>{effectiveNav}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 focus-within:border-[#c9a84c]/40 transition-colors">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input type="text" placeholder="ค้นหาคำสั่งซื้อ, SKU, ผู้จำหน่าย..." className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full" />
          </div>
          <NotificationBell
            notifications={notifications}
            currentUserId={currentUser.id}
            onMarkRead={markNotificationRead}
            onMarkAllRead={markAllNotificationsRead}
            onDelete={deleteNotification}
            onNavigate={(n) => { if (n.relatedQuoteId) setActiveNav("ใบเสนอราคา"); }}
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
                    onClick={() => { setActiveNav("ตั้งค่า"); setUserMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <Settings size={14} className="text-muted-foreground" /> ตั้งค่า
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#e05252] hover:bg-[#e05252]/10 transition-colors"
                  >
                    <LogOut size={14} /> ออกจากระบบ
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:block">
          <Suspense fallback={<PageLoading />}>
            {effectiveNav === "ใบเสนอราคา"
              ? <QuotationPage quotes={quotes} setQuotes={setQuotes} company={company} currentUser={currentUser} users={users} roles={roles} products={products} categories={categories} onNotify={addNotifications} onAudit={handleAudit} />
              : effectiveNav === "ตั้งค่า"
              ? <SettingsPage company={company} onCompanyChange={updateCompany} currentUser={currentUser} onUserChange={updateCurrentUser} roles={roles} canManageCompany={canManageCompany} onAudit={handleAudit} />
              : effectiveNav === "คลังสินค้า"
              ? <ProductsPage products={products} onProductsChange={updateProducts} categories={categories} onCategoriesChange={updateCategories} />
              : effectiveNav === "จัดการผู้ใช้งาน"
              ? <UserManagementPage users={users} onUsersChange={updateUsers} roles={roles} currentUser={currentUser} isSuperAdmin={isSuperAdmin} onAudit={handleAudit} />
              : effectiveNav === "บทบาทและสิทธิ์" && isSuperAdmin
              ? <RoleManagementPage roles={roles} onRolesChange={updateRoles} users={users} onAudit={handleAudit} />
              : effectiveNav === "บันทึกการใช้งาน"
              ? <AuditLogPage entries={auditEntries} />
              : <DashboardPage quotes={quotes} />
            }
          </Suspense>
        </div>
      </div>
    </div>
  );
}
