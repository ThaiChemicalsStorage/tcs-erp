import { lazy, Suspense, useState } from "react";
import {
  LayoutDashboard, Settings, Package,
  Bell, Search, ChevronRight, Menu, X, ChevronDown,
  LogOut, type LucideIcon, FileText,
} from "lucide-react";
import {
  type Company, type UserProfile,
  loadAuthed, saveAuthed, loadCompany, saveCompany, loadUser, saveUser, initials,
} from "./lib/storage";
import {
  type Product, type ProductCategory,
  loadProducts, saveProducts, loadCategories, saveCategories,
} from "./lib/products";
import { type Quote, initialQuotes } from "./lib/quotes";

const SignInPage = lazy(() => import("./pages/SignInPage").then((m) => ({ default: m.SignInPage })));
const SignUpPage = lazy(() => import("./pages/SignUpPage").then((m) => ({ default: m.SignUpPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const ProductsPage = lazy(() => import("./pages/products/ProductsPage").then((m) => ({ default: m.ProductsPage })));
const QuotationPage = lazy(() => import("./pages/quotation/QuotationPage").then((m) => ({ default: m.QuotationPage })));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));

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
  badge?: string;
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "แดชบอร์ด" },
  { icon: FileText, label: "ใบเสนอราคา" },
  { icon: Package, label: "คลังสินค้า" },
];

// ─── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [authed, setAuthed] = useState(() => loadAuthed());
  const [authView, setAuthView] = useState<"signin" | "signup">("signin");

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeNav, setActiveNav] = useState("แดชบอร์ด");
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [company, setCompany] = useState<Company>(() => loadCompany());
  const [user, setUser] = useState<UserProfile>(() => loadUser());
  const [products, setProducts] = useState<Product[]>(() => loadProducts());
  const [categories, setCategories] = useState<ProductCategory[]>(() => loadCategories());

  const updateCompany = (next: Company) => { setCompany(next); saveCompany(next); };
  const updateUser = (next: UserProfile) => { setUser(next); saveUser(next); };
  const updateProducts = (next: Product[]) => { setProducts(next); saveProducts(next); };
  const updateCategories = (next: ProductCategory[]) => { setCategories(next); saveCategories(next); };

  const handleSignIn = (email: string) => {
    if (email) updateUser({ ...user, email });
    setAuthed(true);
    saveAuthed(true);
  };
  const handleSignUp = (name: string, email: string) => {
    updateUser({ ...user, name, email, role: "ผู้ใช้งานใหม่" });
    setAuthed(true);
    saveAuthed(true);
  };
  const handleLogout = () => {
    setAuthed(false);
    saveAuthed(false);
    setUserMenuOpen(false);
    setActiveNav("แดชบอร์ด");
  };

  if (!authed) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        {authView === "signin"
          ? <SignInPage onSignIn={handleSignIn} onSwitchToSignUp={() => setAuthView("signup")} />
          : <SignUpPage onSignUp={handleSignUp} onSwitchToSignIn={() => setAuthView("signin")} />}
      </Suspense>
    );
  }

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
          {navItems.map(({ icon: Icon, label, badge }) => (
            <button key={label} onClick={() => setActiveNav(label)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 relative
                ${activeNav === label ? "bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/25" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white border border-transparent"}`}>
              <Icon size={17} className="flex-shrink-0" />
              {sidebarOpen && <span className="text-sm whitespace-nowrap overflow-hidden">{label}</span>}
              {sidebarOpen && badge && <span className="ml-auto bg-[#c9a84c] text-[#0b1d3a] text-[10px] font-bold font-mono rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{badge}</span>}
              {!sidebarOpen && badge && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#c9a84c]" />}
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
            <span className="text-[#c9a84c] font-medium" style={{ fontFamily: "'Playfair Display', serif" }}>{activeNav}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 focus-within:border-[#c9a84c]/40 transition-colors">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input type="text" placeholder="ค้นหาคำสั่งซื้อ, SKU, ผู้จำหน่าย..." className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full" />
          </div>
          <button className="relative text-muted-foreground hover:text-foreground transition-colors p-2">
            <Bell size={18} />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#c9a84c]" />
          </button>
          <div className="relative">
            <button onClick={() => setUserMenuOpen((v) => !v)} className="flex items-center gap-2.5 pl-3 border-l border-border">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#a07830] flex items-center justify-center text-white text-xs font-bold">{initials(user.name || "?")}</div>
              <div className="text-left hidden md:block">
                <p className="text-xs font-semibold text-foreground leading-tight">{user.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{user.role}</p>
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
            {activeNav === "ใบเสนอราคา"
              ? <QuotationPage quotes={quotes} setQuotes={setQuotes} company={company} user={user} products={products} categories={categories} />
              : activeNav === "ตั้งค่า"
              ? <SettingsPage company={company} onCompanyChange={updateCompany} user={user} onUserChange={updateUser} />
              : activeNav === "คลังสินค้า"
              ? <ProductsPage products={products} onProductsChange={updateProducts} categories={categories} onCategoriesChange={updateCategories} />
              : <DashboardPage quotes={quotes} />
            }
          </Suspense>
        </div>
      </div>
    </div>
  );
}
