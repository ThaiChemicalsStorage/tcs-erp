import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, FileText, Contact, Package, Menu as MenuIcon, Users as UsersIcon, Layers, ClipboardList,
  Truck, Wrench, Briefcase, Package2, Hammer, ShoppingCart, ShoppingBag, PackageCheck, Calculator, Factory, Receipt, PackagePlus, PackageOpen,
  Loader2, AlertTriangle, RotateCw, X, CornerDownLeft, Clock,
} from "lucide-react";
import {
  fetchGlobalSearch, loadRecentDocs, rememberRecentDoc,
  SEARCH_CATEGORY_ORDER, SEARCH_CATEGORY_LABEL_KEY, countIn, isDocumentCategory,
  type SearchResults, type SearchCategory, type SearchHit, type RecentDoc,
  type SearchQuotationResult, type SearchScopeOfWorkResult, type SearchDocumentResult,
  type SearchCustomerResult, type SearchProductResult, type SearchTemplateResult,
  type SearchUserResult, type SearchPageResult,
} from "../lib/search";
import { statusLabelKey, fmt } from "../lib/quotes";
import { useI18n, type TranslationKey } from "../lib/i18n";

const MIN_QUERY_LENGTH = 2;
/** Must stay in sync with `MAX_QUERY_LENGTH` in `api/_lib/searchShared.ts`. */
const MAX_QUERY_LENGTH = 100;
const DEBOUNCE_MS = 300;
const LISTBOX_ID = "global-search-listbox";

/**
 * The app's global search — one panel, every document.
 *
 * **2026-08-28 redesign.** This was a `w-[26rem]` dropdown anchored under the topbar input, showing
 * 5 results across each of 7 categories. Search now covers 18 categories including every business
 * document in the system, which that dropdown could not hold: 16 groups in a 26rem box is a long
 * scroll for someone who wanted one document. It is now a centred panel with a type-filter rail,
 * and — the part that matters most in practice — a pinned band for a query that looks like a
 * document number, pre-selected so Enter opens it.
 *
 * The entry points are deliberately unchanged: the same topbar box on `lg`+, the same icon button
 * below it, the same Ctrl/Cmd+K. Only what opens is different. And desktop and mobile now render
 * **one** panel that goes full-screen on small viewports, instead of the two duplicated trees the
 * previous version maintained in parallel.
 */

/* ------------------------------------------------------------------ *
 * Category chrome
 * ------------------------------------------------------------------ */

const CATEGORY_ICON: Record<SearchCategory, typeof FileText> = {
  quotations: FileText,
  scopeOfWorks: ClipboardList,
  deliveryOrders: Truck,
  serviceReports: Wrench,
  projects: Briefcase,
  materialRequisitions: Package2,
  jobOrders: Hammer,
  purchaseRequests: ShoppingCart,
  purchaseOrders: ShoppingBag,
  receivingReports: PackageCheck,
  storeReceipts: PackageOpen,
  costControls: Calculator,
  productionOrders: Factory,
  arDocuments: Receipt,
  productRequests: PackagePlus,
  customers: Contact,
  products: Package,
  templates: Layers,
  users: UsersIcon,
  pages: MenuIcon,
};

/**
 * Statuses across the modules, mapped to the established Thai label and the darkened status text
 * colour DESIGN.md's Tinted Pill Rule specifies. Rendered as coloured text rather than a full pill:
 * a pill on every row of a 16-group panel is noise, but the colour still reads as the same status
 * vocabulary used everywhere else. Terminology is taken as-is from each module — "Draft"/"Final"
 * genuinely render in English in this app, and are not retranslated here.
 */
const DOC_STATUS: Record<string, { key?: TranslationKey; literal?: string; color: string }> = {
  Draft: { literal: "Draft", color: "#576f94" },
  PendingApproval: { key: "materialRequisition.status.pendingApproval", color: "#866d28" },
  Final: { literal: "Final", color: "#207e52" },
  Completed: { key: "service.status.completed", color: "#157347" },
  Cancelled: { key: "service.status.cancelled", color: "#657085" },
  Planning: { key: "project.status.planning", color: "#576f94" },
  InProgress: { key: "project.status.inProgress", color: "#366bc6" },
  issued: { key: "accounting.list.status.issued", color: "#207e52" },
  cancelled: { key: "accounting.list.status.cancelled", color: "#657085" },
  Pending: { key: "productRequest.status.pending", color: "#866d28" },
  Approved: { key: "productRequest.status.approved", color: "#207e52" },
  Rejected: { key: "productRequest.status.rejected", color: "#d22626" },
};

/** เลขที่เอกสารขึ้นต้นด้วยอะไร — the legend shown before anything is typed. */
const NUMBER_LEGEND: { prefix: string; key: TranslationKey }[] = [
  { prefix: "Q#", key: "search.group.quotations" },
  { prefix: "MR-", key: "search.group.materialRequisitions" },
  { prefix: "JO-", key: "search.group.jobOrders" },
  { prefix: "PR- FD- ED- SD-", key: "search.group.purchaseRequests" },
  { prefix: "SC-", key: "search.group.productionOrders" },
  { prefix: "SR-", key: "search.group.serviceReports" },
  { prefix: "PO-", key: "search.group.purchaseOrders" },
  { prefix: "RR- RX- RI-", key: "search.group.receivingReports" },
  { prefix: "PD- PP- OU- …", key: "search.legend.storeIssues" },
  { prefix: "JD- FG- TK- …", key: "search.group.storeReceipts" },
  { prefix: "CC-", key: "search.group.costControls" },
];

/* ------------------------------------------------------------------ *
 * Row view model — one shape, sixteen categories
 * ------------------------------------------------------------------ */

interface RowView {
  /** The line a person scans for. Mono when it is a code or a number. */
  primary: string;
  mono: boolean;
  /** Context under it: who it belongs to, and what job it came from. */
  secondary: string;
  status?: { label: string; color: string };
  /** Right-hand column — a date, an amount, or a code. */
  trailing?: string;
}

function joinParts(...parts: (string | undefined)[]): string {
  return parts.filter((p) => p && p.trim().length > 0).join(" · ");
}

export function GlobalSearch({
  currentUserId,
  onOpenResult,
}: {
  currentUserId: string;
  /** One handler for every category — `App.tsx` switches on `hit.category` to pick the navigator. */
  onOpenResult: (hit: SearchHit) => void;
}) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  /** `null` = ทั้งหมด. A chosen category re-queries with `types=`, which returns 20 rows, not 3. */
  const [filter, setFilter] = useState<SearchCategory | null>(null);
  const [recents, setRecents] = useState<RecentDoc[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const chipRailRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const trimmedQuery = query.trim();
  const ready = trimmedQuery.length >= MIN_QUERY_LENGTH;

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { day: "numeric", month: "short" }),
    [lang],
  );

  // วันที่ในแผงใช้ภาษาของแอป ไม่ใช่ของเบราว์เซอร์ — หน้าไทยที่ขึ้น "Aug 25" อ่านเหมือนบั๊ก
  const fmtDate = useCallback((iso: string): string => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
  }, [dateFmt]);

  const statusOf = useCallback((raw: string): RowView["status"] => {
    if (!raw) return undefined;
    const meta = DOC_STATUS[raw];
    if (meta) return { label: meta.literal ?? t(meta.key as TranslationKey), color: meta.color };
    // Quotation statuses are already Thai strings with their own established label map.
    const quoteKey = statusLabelKey[raw as keyof typeof statusLabelKey];
    if (quoteKey) return { label: t(quoteKey), color: "#5a7299" };
    return { label: raw, color: "#5a7299" };
  }, [t]);

  /**
   * `restoreFocus` is false when the panel closes *because* a result was opened.
   *
   * Returning focus to the trigger button in that case reopened the panel instantly: closing on
   * Enter moves focus to a `<button>`, and the browser then fires that button's default activation
   * for the very same keypress. Focus belongs on the document the user just opened anyway. It is
   * still restored when the panel is dismissed without going anywhere (Escape, ×, backdrop), where
   * dropping focus on `<body>` would strand a keyboard user.
   */
  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setFilter(null);
    setError(false);
    setActiveIndex(0);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openPanel = useCallback((trigger: HTMLElement | null) => {
    triggerRef.current = trigger;
    setRecents(loadRecentDocs(currentUserId));
    setOpen(true);
  }, [currentUserId]);

  /* ---------------- data ---------------- */

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setActiveIndex(0);
    if (value.trim().length < MIN_QUERY_LENGTH) {
      setResults(null);
      setLoading(false);
      setError(false);
    } else {
      setLoading(true);
      setError(false);
    }
  };

  const retry = () => { setLoading(true); setError(false); setRetryToken((n) => n + 1); };

  useEffect(() => {
    if (!open || trimmedQuery.length < MIN_QUERY_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchGlobalSearch(trimmedQuery, controller.signal, filter ? [filter] : undefined)
        .then((r) => { setResults(r); setLoading(false); setActiveIndex(0); })
        .catch(() => {
          // A superseded request aborts itself; that is not an error worth showing.
          if (controller.signal.aborted) return;
          setLoading(false);
          setError(true);
        });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmedQuery, retryToken, filter, open]);

  /* ---------------- flattening ---------------- */

  /**
   * Every visible row in render order, as one flat list, so the arrow keys are a single index that
   * walks across group boundaries without the user having to think about groups at all. The pinned
   * document-number match is index 0 whenever it exists.
   */
  const flatItems = useMemo<SearchHit[]>(() => {
    if (!results) return [];
    const items: SearchHit[] = [];
    const exact = results.exact;
    if (exact) {
      if (exact.quotation) items.push({ category: "quotations", data: exact.quotation });
      else if (exact.document && isDocumentCategory(exact.category)) {
        items.push({ category: exact.category, data: exact.document });
      }
    }
    const pinnedId = exact?.quotation?.id ?? exact?.document?.id;
    for (const category of SEARCH_CATEGORY_ORDER) {
      if (filter && filter !== category) continue;
      const rows = results[category] as { id: string }[];
      for (const row of rows) {
        // อย่าแสดงซ้ำกับใบที่ปักไว้ด้านบน
        if (pinnedId && row.id === pinnedId && category === exact?.category) continue;
        items.push({ category, data: row } as SearchHit);
      }
    }
    return items;
  }, [results, filter]);

  /** Where each group starts in `flatItems`, so a group heading can be drawn before its first row. */
  const groupStart = useMemo(() => {
    const map = new Map<SearchCategory, number>();
    const pinnedCount = results?.exact ? 1 : 0;
    let index = pinnedCount;
    if (!results) return { map, pinnedCount };
    for (const category of SEARCH_CATEGORY_ORDER) {
      if (filter && filter !== category) continue;
      const rows = results[category] as { id: string }[];
      const visible = rows.filter((r) => !(results.exact && r.id === (results.exact.quotation?.id ?? results.exact.document?.id) && category === results.exact.category));
      if (visible.length > 0) {
        map.set(category, index);
        index += visible.length;
      }
    }
    return { map, pinnedCount };
  }, [results, filter]);

  const chips = useMemo(() => {
    if (!results) return [];
    return SEARCH_CATEGORY_ORDER
      .map((c) => ({ category: c, count: countIn(results, c) }))
      .filter((c) => c.count > 0);
  }, [results]);

  const totalCount = useMemo(
    () => chips.reduce((sum, c) => sum + c.count, 0),
    [chips],
  );

  const hasAnyResults = flatItems.length > 0;

  /* ---------------- activation ---------------- */

  const activate = useCallback((hit: SearchHit) => {
    const view = describe(hit);
    rememberRecentDoc(currentUserId, {
      category: hit.category,
      id: hit.data.id,
      label: view.primary,
      ownerDepartment: "ownerDepartment" in hit.data ? hit.data.ownerDepartment : undefined,
      docType: "docType" in hit.data ? hit.data.docType : undefined,
    });
    onOpenResult(hit);
    close(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, onOpenResult, close, lang, t]);

  const openRecent = (r: RecentDoc) => {
    // A recent entry is only a pointer; the destination re-fetches and re-checks permissions itself.
    onOpenResult({ category: r.category, data: { id: r.id, ownerDepartment: r.ownerDepartment, docType: r.docType } } as SearchHit);
    close(false);
  };

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const item = flatItems[activeIndex];
        if (item) { e.preventDefault(); activate(item); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, flatItems, activeIndex, activate, close]);

  // Ctrl/Cmd+K from anywhere. Unchanged behaviour, one panel now instead of two.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPanel(document.activeElement as HTMLElement | null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openPanel]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`global-search-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Focus trap. The panel is a real modal dialog, so Tab must stay inside it — the previous
  // full-screen mobile search had neither a trap nor a `role="dialog"`.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panel = document.getElementById("global-search-panel");
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('button, input, [href], [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  /** Roving arrow-key movement inside the chip rail — the standard toolbar pattern. Left and Right
   *  are never intercepted while the caret is in the text field, where they belong to editing. */
  const onChipKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const rail = chipRailRef.current;
    if (!rail) return;
    const buttons = Array.from(rail.querySelectorAll<HTMLButtonElement>("button"));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowRight"
      ? Math.min(current + 1, buttons.length - 1)
      : Math.max(current - 1, 0);
    buttons[next]?.focus();
  };

  /* ---------------- row description ---------------- */

  /**
   * Turns any hit into the one row shape the panel renders. Keeping this as a single pure function
   * is what stops sixteen categories from becoming sixteen bespoke row components.
   */
  function describe(hit: SearchHit): RowView {
    switch (hit.category) {
      case "quotations": {
        const d = hit.data as SearchQuotationResult;
        return {
          primary: d.id, mono: true,
          secondary: joinParts(d.client, d.project, d.salesperson),
          status: statusOf(d.status),
          // ใช้ fmt() ของแอป (ทศนิยม 2 ตำแหน่งเสมอ) — toLocaleString ดิบ ๆ ให้ "฿1,065,435.9" ซึ่งอ่านเหมือนพัง
          trailing: `฿${fmt(d.amount)}`,
        };
      }
      case "scopeOfWorks": {
        const d = hit.data as SearchScopeOfWorkResult;
        return {
          primary: d.scopeNumber, mono: true,
          secondary: joinParts(d.customerName, d.quotationNumber, d.jobTypeName),
          status: statusOf(d.status),
        };
      }
      case "customers": {
        const d = hit.data as SearchCustomerResult;
        return { primary: d.companyName, mono: false, secondary: joinParts(d.contactName, d.phone, d.email) };
      }
      case "products": {
        const d = hit.data as SearchProductResult;
        return { primary: d.name, mono: false, secondary: joinParts(d.categoryName, d.unit), trailing: d.code };
      }
      case "templates": {
        const d = hit.data as SearchTemplateResult;
        return { primary: d.templateName, mono: false, secondary: joinParts(d.jobTypeName, d.description), trailing: d.jobTypeCode };
      }
      case "users": {
        const d = hit.data as SearchUserResult;
        return { primary: d.fullName, mono: false, secondary: joinParts(d.roleName, d.department, d.email) };
      }
      case "pages": {
        const d = hit.data as SearchPageResult;
        return { primary: lang === "en" ? d.titleEn : d.titleTh, mono: false, secondary: "" };
      }
      default: {
        const d = hit.data as SearchDocumentResult;
        // Document types with no number of their own (Delivery Order, Project) or none yet assigned
        // (a pending Product Request) fall back to the party line as the thing to read first.
        const primary = d.docNumber || d.party;
        return {
          primary: primary || "—",
          mono: Boolean(d.docNumber),
          secondary: joinParts(d.docNumber ? d.party : undefined, d.lineage),
          status: statusOf(d.status),
          trailing: fmtDate(d.date),
        };
      }
    }
  }

  /* ---------------- rendering ---------------- */

  const renderRow = (hit: SearchHit, index: number) => {
    const view = describe(hit);
    const isActive = index === activeIndex;
    return (
      <button
        key={`${hit.category}-${hit.data.id}-${index}`}
        id={`global-search-option-${index}`}
        role="option"
        aria-selected={isActive}
        onClick={() => activate(hit)}
        onMouseMove={() => setActiveIndex(index)}
        className={`w-full text-left px-4 py-2 transition-colors ${isActive ? "bg-[#c9a84c]/10" : "hover:bg-secondary/50"}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className={`text-sm font-medium text-foreground truncate ${view.mono ? "font-mono" : ""}`}>
            <Highlight text={view.primary} query={trimmedQuery} />
          </p>
          <span className="flex items-baseline gap-2 flex-shrink-0">
            {view.status && (
              <span className="text-xs font-medium" style={{ color: view.status.color }}>{view.status.label}</span>
            )}
            {view.trailing && <span className="text-xs font-mono text-muted-foreground">{view.trailing}</span>}
          </span>
        </div>
        {view.secondary && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            <Highlight text={view.secondary} query={trimmedQuery} />
          </p>
        )}
      </button>
    );
  };

  const renderBody = () => {
    if (!ready) {
      return (
        <div className="px-4 py-5 space-y-5">
          {recents.length > 0 && (
            <div>
              <GroupHeading icon={<Clock size={11} />} label={t("search.recent")} />
              {recents.map((r) => {
                const Icon = CATEGORY_ICON[r.category] ?? FileText;
                return (
                  <button
                    key={`${r.category}-${r.id}`}
                    onClick={() => openRecent(r)}
                    className="w-full text-left px-1 py-1.5 flex items-center gap-2.5 rounded-md hover:bg-secondary/50 transition-colors"
                  >
                    <Icon size={13} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-sm text-foreground font-mono truncate">{r.label}</span>
                    <span className="text-xs text-muted-foreground truncate ml-auto flex-shrink-0">
                      {t(SEARCH_CATEGORY_LABEL_KEY[r.category] as TranslationKey)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div>
            <GroupHeading icon={<Search size={11} />} label={t("search.legendTitle")} />
            <p className="px-1 text-xs text-muted-foreground leading-relaxed mb-2">{t("search.legendHelp")}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-1">
              {NUMBER_LEGEND.map((l) => (
                <div key={l.prefix} className="flex items-center gap-2 min-w-0">
                  <code className="text-xs font-mono text-[#866d28] bg-[#c9a84c]/10 border border-[#c9a84c]/20 rounded px-1.5 py-0.5 flex-shrink-0">
                    {l.prefix}
                  </code>
                  <span className="text-xs text-muted-foreground truncate">{t(l.key)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
          <AlertTriangle size={18} className="text-[#e05252]" />
          <p className="text-xs text-muted-foreground">{t("search.error")}</p>
          <button
            onClick={retry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
          >
            <RotateCw size={12} /> {t("search.retry")}
          </button>
        </div>
      );
    }

    if (!hasAnyResults) {
      return loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={16} className="text-muted-foreground animate-spin" />
        </div>
      ) : (
        <div className="text-center py-10 px-4">
          <p className="text-sm text-foreground">{t("search.noResults").replace("{query}", trimmedQuery)}</p>
          <p className="text-xs text-muted-foreground mt-1.5">{t("search.noResultsHelper")}</p>
        </div>
      );
    }

    const exact = results?.exact;
    const pinned = groupStart.pinnedCount > 0 ? flatItems[0] : null;

    return (
      <>
        {pinned && exact && (
          <div className="pt-2 pb-1 border-b border-border">
            <GroupHeading icon={<CornerDownLeft size={11} />} label={t("search.exactMatch")} accent />
            {renderRow(pinned, 0)}
          </div>
        )}
        <div className="py-1">
          {SEARCH_CATEGORY_ORDER.map((category) => {
            const start = groupStart.map.get(category);
            if (start === undefined) return null;
            const rows = flatItems.slice(start).filter((h) => h.category === category);
            const Icon = CATEGORY_ICON[category];
            return (
              <div key={category} className="py-1">
                <GroupHeading icon={<Icon size={11} />} label={t(SEARCH_CATEGORY_LABEL_KEY[category] as TranslationKey)} />
                {rows.map((hit, i) => renderRow(hit, start + i))}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const activeRowId = hasAnyResults ? `global-search-option-${activeIndex}` : undefined;

  return (
    <>
      {/* ทางเข้าเหมือนเดิมทุกอย่าง — ช่องบนแถบบนที่ lg ขึ้นไป, ปุ่มไอคอนบนจอแคบ */}
      <div className="hidden lg:flex items-center ml-auto">
        <button
          onClick={(e) => openPanel(e.currentTarget)}
          aria-label={t("topbar.searchAria")}
          className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 text-left hover:border-[#c9a84c]/40 focus-visible:border-[#c9a84c]/60 focus-visible:outline-none transition-colors"
        >
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <span className="text-sm text-muted-foreground truncate flex-1">{t("topbar.searchPlaceholder")}</span>
          <kbd className="hidden xl:inline-block text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5 flex-shrink-0">
            Ctrl K
          </kbd>
        </button>
      </div>

      <button
        onClick={(e) => openPanel(e.currentTarget)}
        aria-label={t("topbar.searchAria")}
        className="lg:hidden ml-auto text-muted-foreground hover:text-foreground transition-colors p-2"
      >
        <Search size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:pt-[10vh] sm:px-4">
          <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={() => close()} aria-hidden="true" />
          <div
            id="global-search-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t("topbar.searchAria")}
            className="search-panel-in relative flex flex-col w-full h-full bg-card overflow-hidden sm:h-auto sm:w-[46rem] sm:max-w-full sm:max-h-[72vh] sm:rounded-xl sm:border sm:border-border sm:shadow-xl"
          >
            {/* แถบพิมพ์ */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
              <Search size={16} className="text-muted-foreground flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-controls={LISTBOX_ID}
                aria-activedescendant={activeRowId}
                value={query}
                maxLength={MAX_QUERY_LENGTH}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder={t("search.panelPlaceholder")}
                aria-label={t("topbar.searchAria")}
                className="flex-1 bg-transparent text-base text-foreground placeholder-muted-foreground outline-none min-w-0"
              />
              {loading && <Loader2 size={14} className="text-muted-foreground animate-spin flex-shrink-0" />}
              <button
                onClick={() => close()}
                aria-label={t("search.close")}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* แถบกรองชนิดเอกสาร — โผล่เฉพาะชนิดที่มีผลจริง */}
            {ready && chips.length > 0 && (
              <div
                ref={chipRailRef}
                role="toolbar"
                aria-label={t("search.filterAria")}
                onKeyDown={onChipKeyDown}
                // ห่อบรรทัดแทนการเลื่อนแนวนอน — แถบเลื่อนของ OS วาดเป็นเส้นสีเทาคาดใต้ชิปพอดี อ่านเหมือน
                // รอยต่อของแผง และซ่อนชิปที่เหลือไว้นอกจอ ชนิดเอกสารที่ตรงจริงมักไม่เกินสองบรรทัด
                className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border flex-shrink-0"
              >
                <Chip
                  label={t("search.filterAll")}
                  count={totalCount}
                  active={filter === null}
                  onClick={() => { setFilter(null); setActiveIndex(0); }}
                />
                {chips.map(({ category, count }) => (
                  <Chip
                    key={category}
                    label={t(SEARCH_CATEGORY_LABEL_KEY[category] as TranslationKey)}
                    count={count}
                    active={filter === category}
                    onClick={() => { setFilter(filter === category ? null : category); setActiveIndex(0); }}
                  />
                ))}
              </div>
            )}

            {/* ผลลัพธ์ */}
            <div id={LISTBOX_ID} role="listbox" aria-label={t("topbar.searchAria")} className="flex-1 overflow-y-auto min-h-0">
              {renderBody()}
            </div>

            {/* แถบบอกปุ่มลัด */}
            <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-t border-border flex-shrink-0 text-[10px] text-muted-foreground">
              <KeyHint keys="↑↓" label={t("search.hintMove")} />
              <KeyHint keys="Tab" label={t("search.hintFilter")} />
              <KeyHint keys="↵" label={t("search.hintOpen")} />
              <KeyHint keys="esc" label={t("search.hintClose")} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Small pieces
 * ------------------------------------------------------------------ */

function GroupHeading({ icon, label, accent }: { icon: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-4 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider ${accent ? "text-[#866d28]" : "text-muted-foreground"}`}>
      {icon} {label}
    </div>
  );
}

/** The tinted-pill formula, applied to a filter chip: same vocabulary as every status badge. */
function Chip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 flex-shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-[#c9a84c]/10 text-[#866d28] border-[#c9a84c]/20"
          : "bg-transparent text-muted-foreground border-border hover:border-[#c9a84c]/40 hover:text-foreground"
      }`}
    >
      {label}
      <span className="font-mono text-[10px] opacity-70">{count}</span>
    </button>
  );
}

function KeyHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="font-mono border border-border rounded px-1 py-0.5 leading-none">{keys}</kbd>
      {label}
    </span>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ไฮไลต์ข้อความที่ตรงกับคำค้นหาแบบไม่สนตัวพิมพ์เล็ก-ใหญ่ ด้วย <mark>
// Wraps every case-insensitive match of the query in a highlighted <mark>
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
