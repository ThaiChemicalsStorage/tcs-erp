import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, FileText, Contact, Package, Menu as MenuIcon, Users as UsersIcon, Layers, ClipboardList,
  Loader2, AlertTriangle, RotateCw, X,
} from "lucide-react";
import { fetchGlobalSearch, type SearchResults, type SearchQuotationResult, type SearchCustomerResult, type SearchProductResult, type SearchTemplateResult, type SearchScopeOfWorkResult, type SearchPageResult, type SearchUserResult } from "../lib/search";
import { statusLabelKey } from "../lib/quotes";
import { useI18n } from "../lib/i18n";

const MIN_QUERY_LENGTH = 2;
/** Must stay in sync with `MAX_QUERY_LENGTH` in api/_lib/searchHandler.ts — this is a native HTML
 * `maxLength` constraint (defense-in-depth, bypassable by a modified client), the server-side
 * check there is the real enforcement. Added 2026-07-14, Codex review High Priority fix: the
 * endpoint previously had no upper bound, letting an oversized query force an expensive
 * multi-collection regex scan. */
const MAX_QUERY_LENGTH = 100;
const DEBOUNCE_MS = 300;
/** Desktop dropdown vs. mobile full-screen panel render the same result rows with different DOM
 * `id` namespaces (two live instances would otherwise collide on the same `id`) — see `rowId()`. */
const DESKTOP_LISTBOX_ID = "global-search-listbox-desktop";
const MOBILE_LISTBOX_ID = "global-search-listbox-mobile";

type FlatItem =
  | { type: "quotation"; data: SearchQuotationResult }
  | { type: "customer"; data: SearchCustomerResult }
  | { type: "product"; data: SearchProductResult }
  | { type: "template"; data: SearchTemplateResult }
  | { type: "scopeOfWork"; data: SearchScopeOfWorkResult }
  | { type: "page"; data: SearchPageResult }
  | { type: "user"; data: SearchUserResult };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rowId(idPrefix: string, idx: number): string {
  return `global-search-option-${idPrefix}-${idx}`;
}

/** Wraps every case-insensitive occurrence of `query` inside `text` in a highlighted `<mark>` — simple substring highlighting only, no fuzzy-match spans (matches the task's "highlight if simple and safe" scope). */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!text) return null;
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === trimmed.toLowerCase()
          ? <mark key={i} className="bg-[#c9a84c]/30 text-foreground rounded-sm">{part}</mark>
          : <span key={i}>{part}</span>,
      )}
    </>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

/**
 * Global Search (added 2026-07-14) — replaces the previously non-functional topbar search input
 * (no `value`/`onChange` at all, plus a generic template placeholder mentioning purchase
 * orders/SKU/vendors that don't match this ERP). Debounced (300ms), cancels stale in-flight
 * requests via `AbortController`, keeps the previous result set visible (with a small inline
 * spinner) while a new query is loading rather than flashing to empty — see
 * docs/UI_GUIDELINES.md "Global Search" for the full behavior writeup.
 *
 * Every result category is already RBAC-filtered server-side (`api/_lib/searchHandler.ts`) — this
 * component just renders whatever groups the response actually contains; a category the caller
 * lacks permission for is indistinguishable here from a genuine zero-result search, by design.
 *
 * **2026-07-14, Codex review fix pass**: added a real mobile/narrow-viewport entry point (a
 * `lg:hidden` trigger button opening a full-screen panel — previously the entire feature was
 * `hidden lg:flex` with no visible affordance below 1024px, and Ctrl/Cmd+K silently focused an
 * invisible input) and combobox/listbox ARIA semantics with active-row scroll-into-view.
 */
export function GlobalSearch({
  onNavigateToQuotation,
  onNavigateToCustomer,
  onNavigateToProduct,
  onNavigateToUser,
  onNavigateToPage,
  onNavigateToTemplate,
  onNavigateToScopeOfWork,
}: {
  onNavigateToQuotation: (id: string) => void;
  onNavigateToCustomer: (id: string) => void;
  onNavigateToProduct: (id: string) => void;
  onNavigateToUser: (id: string) => void;
  onNavigateToPage: (navKey: string, action?: "create" | "categories") => void;
  /** Opens the Create Quotation wizard with this template's Job Type + Template preselected (see
   * `QuotationTemplateWizard.tsx`'s `initialSelection` prop) rather than just its preview — a
   * Sales user searching for "Wet Scrubber" almost always wants to start a quotation from it, not
   * merely look at it. */
  onNavigateToTemplate: (jobTypeCode: string, templateId: string) => void;
  /** Opens the source quotation's detail view then jumps straight into this Scope of Work's editor
   * — added 2026-07-15, Codex review High Priority fix (Scope of Work previously had no Global
   * Search integration at all). See `QuotationPage.tsx`'s `initialScopeOfWorkDeepLink`. */
  onNavigateToScopeOfWork: (quotationId: string, scopeOfWorkId: string) => void;
}) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const trimmedQuery = query.trim();

  // setLoading(true)/setError(false)/setResults(null) below all live in the *handlers* that
  // trigger them (here, and in `retry` further down) rather than at the top of the effect — the
  // same pattern DashboardPage.tsx's handleFiltersChange/retry already use, for the same reason:
  // calling setState synchronously as the first thing an effect does causes an avoidable extra
  // render cascade (react-hooks/set-state-in-effect). `results` is deliberately NOT cleared just
  // because a new search started (only when the query drops below the minimum length) — the
  // previous results stay on screen with `loading` driving a small spinner instead of a blank
  // flash between keystrokes, per the "previous data stays visible during refetch" requirement.
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim().length < MIN_QUERY_LENGTH) {
      setResults(null);
      setLoading(false);
      setError(false);
      setActiveIndex(-1);
    } else {
      setLoading(true);
      setError(false);
    }
  };
  const retry = () => { setLoading(true); setError(false); setRetryToken((n) => n + 1); };

  // Debounced fetch + stale-request cancellation combined in one effect: the timer delays the
  // request itself (debounce), and the AbortController cancels it if `query` changes again before
  // either the timer or the fetch has resolved (stale-response guard). Every setState call here
  // happens inside an async callback (the timeout, then the fetch's .then/.catch) — never
  // synchronously in the effect body itself. `query` is capped client-side at MAX_QUERY_LENGTH via
  // the input's own `maxLength`, so `trimmedQuery` here can never itself exceed the server's limit.
  useEffect(() => {
    if (trimmedQuery.length < MIN_QUERY_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchGlobalSearch(trimmedQuery, controller.signal)
        .then((r) => { setResults(r); setLoading(false); setActiveIndex(-1); })
        .catch(() => {
          if (controller.signal.aborted) return; // superseded by a newer query — not a real error
          setLoading(false);
          setError(true);
        });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmedQuery, retryToken]);

  const flatItems = useMemo<FlatItem[]>(() => {
    if (!results) return [];
    return [
      ...results.quotations.map((data): FlatItem => ({ type: "quotation", data })),
      ...results.customers.map((data): FlatItem => ({ type: "customer", data })),
      ...results.products.map((data): FlatItem => ({ type: "product", data })),
      ...results.templates.map((data): FlatItem => ({ type: "template", data })),
      ...results.scopeOfWorks.map((data): FlatItem => ({ type: "scopeOfWork", data })),
      ...results.pages.map((data): FlatItem => ({ type: "page", data })),
      ...results.users.map((data): FlatItem => ({ type: "user", data })),
    ];
  }, [results]);

  // Precomputed once per `results` change instead of a mutable counter threaded through render —
  // each group's starting position in `flatItems`, so keyboard nav (`activeIndex`) and click
  // handlers can address any row by a single flat index without a shared mutable variable.
  const groupOffsets = useMemo(() => {
    const r = results;
    let o = 0;
    const quotations = o; o += r?.quotations.length ?? 0;
    const customers = o; o += r?.customers.length ?? 0;
    const products = o; o += r?.products.length ?? 0;
    const templates = o; o += r?.templates.length ?? 0;
    const scopeOfWorks = o; o += r?.scopeOfWorks.length ?? 0;
    const pages = o; o += r?.pages.length ?? 0;
    const users = o;
    return { quotations, customers, products, templates, scopeOfWorks, pages, users };
  }, [results]);

  // Active row scroll-into-view (Codex review Medium fix) — harmless no-op for whichever panel
  // (desktop/mobile) isn't currently rendered/visible, since `document.getElementById` simply
  // returns null for an id that isn't mounted.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(rowId("desktop", activeIndex))?.scrollIntoView({ block: "nearest" });
    document.getElementById(rowId("mobile", activeIndex))?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const hasAnyResults = flatItems.length > 0;
  // Shown as soon as the box is focused/clicked, even before typing — the "type at least 2
  // characters" hint (below) is itself the dropdown's content in that state, per the requirement
  // that clicking/focusing the search box shows a dropdown, not just typing into it.
  const showDropdown = open;

  const activate = (item: FlatItem) => {
    if (item.type === "quotation") onNavigateToQuotation(item.data.id);
    else if (item.type === "customer") onNavigateToCustomer(item.data.id);
    else if (item.type === "product") onNavigateToProduct(item.data.id);
    else if (item.type === "template") onNavigateToTemplate(item.data.jobTypeCode, item.data.id);
    else if (item.type === "scopeOfWork") onNavigateToScopeOfWork(item.data.quotationId, item.data.id);
    else if (item.type === "user") onNavigateToUser(item.data.id);
    else onNavigateToPage(item.data.navKey, item.data.action);
    setOpen(false);
    setMobileOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, isMobilePanel: boolean) => {
    if (e.key === "Escape") {
      setOpen(false);
      setMobileOpen(false);
      if (isMobilePanel) mobileInputRef.current?.blur(); else desktopInputRef.current?.blur();
      return;
    }
    if ((!showDropdown && !isMobilePanel) || flatItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = activeIndex >= 0 ? activeIndex : 0;
      const item = flatItems[idx];
      if (item) activate(item);
    }
  };

  // Ctrl/Cmd+K focuses whichever search UI is actually visible at the current viewport width — a
  // matchMedia check against the same 1024px `lg` breakpoint the two UIs render at, rather than
  // always targeting the desktop input, which previously focused an invisible `display:none`
  // element below `lg` (2026-07-14, Codex review High Priority fix).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
        if (isDesktop) {
          desktopInputRef.current?.focus();
          setOpen(true);
        } else {
          setMobileOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focuses the mobile input as soon as the full-screen panel mounts — the panel has no other way
  // to receive focus (there's no persistent input to already be focused, unlike the desktop box).
  useEffect(() => {
    if (mobileOpen) mobileInputRef.current?.focus();
  }, [mobileOpen]);

  const renderGroup = <T,>(
    idPrefix: string, label: string, icon: React.ReactNode, items: T[], startIndex: number,
    renderItem: (item: T, isActive: boolean, id: string, onClick: () => void) => React.ReactNode,
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="py-1.5">
        <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
          {icon} {label}
        </div>
        {items.map((item, i) => {
          const idx = startIndex + i;
          const isActive = idx === activeIndex;
          return <div key={i}>{renderItem(item, isActive, rowId(idPrefix, idx), () => activate(flatItems[idx]))}</div>;
        })}
      </div>
    );
  };

  const rowCls = (isActive: boolean) =>
    `w-full text-left px-3 py-2 cursor-pointer transition-colors ${isActive ? "bg-[#c9a84c]/10" : "hover:bg-secondary/50"}`;

  /** Same result content rendered into both the desktop dropdown and the mobile full-screen panel
   * — `idPrefix` keeps each instance's row/listbox `id`s distinct so the two never collide in the
   * DOM (only one is ever actually visible at a given viewport width, but both may be mounted). */
  const renderResultsPanel = (idPrefix: string) => (
    <div id={idPrefix === "desktop" ? DESKTOP_LISTBOX_ID : MOBILE_LISTBOX_ID} role="listbox" aria-label={t("topbar.searchAria")} className="flex-1 overflow-y-auto">
      {trimmedQuery.length < MIN_QUERY_LENGTH ? (
        <p className="text-center text-xs text-muted-foreground py-8 px-4">{t("search.before")}</p>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
          <AlertTriangle size={18} className="text-[#e05252]" />
          <p className="text-xs text-muted-foreground">{t("search.error")}</p>
          <button
            onClick={retry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
          >
            <RotateCw size={12} /> {t("search.retry")}
          </button>
        </div>
      ) : !hasAnyResults && !loading ? (
        <div className="text-center py-8 px-4">
          <p className="text-xs text-foreground">{t("search.noResults").replace("{query}", trimmedQuery)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{t("search.noResultsHelper")}</p>
        </div>
      ) : !hasAnyResults && loading ? (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 size={16} className="text-muted-foreground animate-spin" />
        </div>
      ) : (
        <>
          {renderGroup<SearchQuotationResult>(idPrefix, t("search.group.quotations"), <FileText size={11} />, results?.quotations ?? [], groupOffsets.quotations, (item, isActive, id, onClick) => (
            <button id={id} role="option" aria-selected={isActive} className={rowCls(isActive)} onClick={onClick}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground font-mono truncate"><Highlight text={item.id} query={trimmedQuery} /></p>
                <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{fmtDate(item.issueDate)}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate"><Highlight text={item.client} query={trimmedQuery} /> {item.project && `· ${item.project}`}</p>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-[11px] text-muted-foreground">{t(statusLabelKey[item.status as keyof typeof statusLabelKey] ?? "quotation.status.draft")} · {item.salesperson}</span>
                <span className="text-[11px] font-mono text-foreground flex-shrink-0">฿{item.amount.toLocaleString("th-TH")}</span>
              </div>
            </button>
          ))}
          {renderGroup<SearchCustomerResult>(idPrefix, t("search.group.customers"), <Contact size={11} />, results?.customers ?? [], groupOffsets.customers, (item, isActive, id, onClick) => (
            <button id={id} role="option" aria-selected={isActive} className={rowCls(isActive)} onClick={onClick}>
              <p className="text-sm font-medium text-foreground truncate"><Highlight text={item.companyName} query={trimmedQuery} /></p>
              <p className="text-[11px] text-muted-foreground truncate">
                {item.contactName && <Highlight text={item.contactName} query={trimmedQuery} />}
                {item.phone && ` · ${item.phone}`}{item.email && ` · ${item.email}`}
              </p>
            </button>
          ))}
          {renderGroup<SearchProductResult>(idPrefix, t("search.group.products"), <Package size={11} />, results?.products ?? [], groupOffsets.products, (item, isActive, id, onClick) => (
            <button id={id} role="option" aria-selected={isActive} className={rowCls(isActive)} onClick={onClick}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground truncate"><Highlight text={item.name} query={trimmedQuery} /></p>
                <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0"><Highlight text={item.code} query={trimmedQuery} /></span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{item.categoryName} · {item.unit}</p>
            </button>
          ))}
          {renderGroup<SearchTemplateResult>(idPrefix, t("search.group.templates"), <Layers size={11} />, results?.templates ?? [], groupOffsets.templates, (item, isActive, id, onClick) => (
            <button id={id} role="option" aria-selected={isActive} className={rowCls(isActive)} onClick={onClick}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground truncate"><Highlight text={item.templateName} query={trimmedQuery} /></p>
                <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0"><Highlight text={item.jobTypeCode} query={trimmedQuery} /></span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{item.jobTypeName}{item.description && ` · ${item.description}`}</p>
            </button>
          ))}
          {renderGroup<SearchScopeOfWorkResult>(idPrefix, t("search.group.scopeOfWorks"), <ClipboardList size={11} />, results?.scopeOfWorks ?? [], groupOffsets.scopeOfWorks, (item, isActive, id, onClick) => (
            <button id={id} role="option" aria-selected={isActive} className={rowCls(isActive)} onClick={onClick}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground font-mono truncate"><Highlight text={item.scopeNumber} query={trimmedQuery} /></p>
                <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{item.status}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate"><Highlight text={item.customerName} query={trimmedQuery} /> · <Highlight text={item.quotationNumber} query={trimmedQuery} /></p>
              <p className="text-[11px] text-muted-foreground truncate">{item.jobTypeCode} — {item.jobTypeName}</p>
            </button>
          ))}
          {renderGroup<SearchPageResult>(idPrefix, t("search.group.pages"), <MenuIcon size={11} />, results?.pages ?? [], groupOffsets.pages, (item, isActive, id, onClick) => (
            <button id={id} role="option" aria-selected={isActive} className={rowCls(isActive)} onClick={onClick}>
              <p className="text-sm font-medium text-foreground truncate">
                <Highlight text={lang === "en" ? item.titleEn : item.titleTh} query={trimmedQuery} />
              </p>
            </button>
          ))}
          {renderGroup<SearchUserResult>(idPrefix, t("search.group.users"), <UsersIcon size={11} />, results?.users ?? [], groupOffsets.users, (item, isActive, id, onClick) => (
            <button id={id} role="option" aria-selected={isActive} className={rowCls(isActive)} onClick={onClick}>
              <p className="text-sm font-medium text-foreground truncate"><Highlight text={item.fullName} query={trimmedQuery} /></p>
              <p className="text-[11px] text-muted-foreground truncate">{item.roleName} · {item.department || "—"} · {item.email}</p>
            </button>
          ))}
        </>
      )}
    </div>
  );

  const activeRowId = activeIndex >= 0 ? { desktop: rowId("desktop", activeIndex), mobile: rowId("mobile", activeIndex) } : undefined;

  return (
    <>
      {/* Desktop (lg and up): inline input + anchored dropdown, unchanged visual chrome from before. */}
      <div className="hidden lg:flex items-center relative ml-auto">
        <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 focus-within:border-[#c9a84c]/40 transition-colors">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={desktopInputRef}
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls={DESKTOP_LISTBOX_ID}
            aria-activedescendant={activeRowId?.desktop}
            value={query}
            maxLength={MAX_QUERY_LENGTH}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => handleKeyDown(e, false)}
            placeholder={t("topbar.searchPlaceholder")}
            aria-label={t("topbar.searchAria")}
            className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
          />
          {loading
            ? <Loader2 size={13} className="text-muted-foreground animate-spin flex-shrink-0" />
            : <kbd className="hidden xl:inline-block text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5 flex-shrink-0">Ctrl K</kbd>}
        </div>

        {showDropdown && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-2 w-[26rem] max-w-[90vw] bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden flex flex-col max-h-[28rem]">
              {renderResultsPanel("desktop")}
            </div>
          </>
        )}
      </div>

      {/* Mobile/tablet (below lg): icon-only trigger + full-screen search takeover — added
          2026-07-14, Codex review High Priority fix. Previously Global Search had no visible
          affordance at all below the `lg` breakpoint. */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label={t("topbar.searchAria")}
        className="lg:hidden ml-auto text-muted-foreground hover:text-foreground transition-colors p-2"
      >
        <Search size={18} />
      </button>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center gap-2 px-3 py-3 border-b border-border flex-shrink-0">
            <div className="flex-1 flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 focus-within:border-[#c9a84c]/40 transition-colors">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                ref={mobileInputRef}
                type="text"
                role="combobox"
                aria-expanded={mobileOpen}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-controls={MOBILE_LISTBOX_ID}
                aria-activedescendant={activeRowId?.mobile}
                value={query}
                maxLength={MAX_QUERY_LENGTH}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, true)}
                placeholder={t("topbar.searchPlaceholder")}
                aria-label={t("topbar.searchAria")}
                className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
              />
              {loading && <Loader2 size={13} className="text-muted-foreground animate-spin flex-shrink-0" />}
            </div>
            <button onClick={() => setMobileOpen(false)} aria-label={t("search.close")} className="text-muted-foreground hover:text-foreground transition-colors p-2 flex-shrink-0">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col">
            {renderResultsPanel("mobile")}
          </div>
        </div>
      )}
    </>
  );
}
