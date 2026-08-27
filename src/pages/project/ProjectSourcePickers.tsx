import { useEffect, useState } from "react";
import { Search, X, ChevronLeft, FileText, Loader2 } from "lucide-react";
import { fetchAllScopeOfWorks, type ScopeOfWorkListItem } from "../../lib/scopeOfWork";
import {
  fetchAllProjects, fetchProject, fetchProjectsByScope,
  type ProjectListItem, type ProjectItem, type ProjectItemSourcingMethod,
} from "../../lib/project";
import { fetchAllProductionOrders, type ProductionOrderSummary } from "../../lib/productionOrder";
import { EmptyState } from "../../components/EmptyState";
import { useI18n } from "../../lib/i18n";

// กล่องเลือก "ต้นทาง" สำหรับปุ่มกดสร้างในหน้าของแต่ละเอกสารฝ่ายโครงการ (เพิ่ม 2026-08-20 ตามคำขอตรง
// "อยากให้มันสามารถกดสร้างในหน้าของตัวเองได้เลย ตอนกดสร้างก็ขึ้นมาให้เลือกว่าจะมาจากใบไหน") — เดิมสร้าง
// เอกสารทั้ง 3 ประเภทได้จากในหน้าโครงการเท่านั้น หน้ารายการของแต่ละเอกสารมีแต่รายการ ไม่มีปุ่มสร้าง
// รูปแบบเดียวกับ ScopeOfWorkPickerDialog ในหน้าวางบิลตามงาน (ดู AccountingPage.tsx)

const dialogShell = "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4";
const dialogPanel = "bg-card border border-border rounded-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col p-5 gap-3";
const dialogHeading = "text-lg font-semibold text-foreground";
const headingFont = { fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" };
const rowButton = "w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border/60 hover:bg-secondary/40 hover:border-[#c9a84c]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const searchBox = "flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 flex-shrink-0";
const searchInput = "bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full";

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
    </div>
  );
}

/**
 * เลือก Scope of Work เพื่อสร้างโครงการใหม่ — ใช้บนหน้า "โครงการ"
 * Scope of Work already carrying a project is shown disabled rather than hidden, so the user can see
 * *why* it isn't selectable instead of wondering where their job went (the API refuses nothing here —
 * `POST /api/projects` allows several projects per scope — but creating a second one by accident is
 * far more likely to be a mistake than intent, so the UI steers away from it while staying honest).
 */
export function ScopeOfWorkSourcePickerDialog({ onClose, onSelect, allowMultiplePerScope = false, requireFinalScope = true }: {
  onClose: () => void;
  onSelect: (scopeOfWorkId: string) => void;
  /**
   * ปิดการเช็ค "มีโครงการแล้ว" — ใช้กับใบสั่งผลิต ซึ่งงานหนึ่งออกได้หลายใบตามจำนวนสินค้าที่ต้องผลิต
   * (ต่างจากโครงการที่ปกติมีใบเดียวต่อหนึ่งงาน) ตัวเช็คนั้นยิง API ต่อ 1 งาน จึงข้ามไปเลยเมื่อไม่ใช้
   */
  allowMultiplePerScope?: boolean;
  /**
   * บังคับว่า Scope of Work ต้องอนุมัติแล้ว (Final) — จริงๆ ตัวบังคับคือเซิร์ฟเวอร์ ตรงนี้แค่สะท้อนให้
   * โครงการยังคงบังคับ (projectHandler.ts) ส่วนใบสั่งผลิตส่ง false มา เพราะปลดด่านไปแล้ว
   * ตามที่ฝ่ายผลิตขอไว้เมื่อ 2026-08-27
   */
  requireFinalScope?: boolean;
}) {
  const { t } = useI18n();
  const [scopes, setScopes] = useState<ScopeOfWorkListItem[]>([]);
  const [existingByScope, setExistingByScope] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllScopeOfWorks()
      .then(async (list) => {
        if (cancelled) return;
        setScopes(list);
        setLoading(false);
        // แต่ละงานมีโครงการอยู่แล้วหรือยัง — ยิงทีละใบ (ไม่มี endpoint รวม) จึงโหลดหลังแสดงรายการแล้ว
        // เพื่อไม่ให้หน่วงการเปิดกล่อง; ระหว่างรอ ปุ่มยังกดได้ตามปกติ
        if (allowMultiplePerScope) return;
        const pairs = await Promise.all(list.map(async (s) => {
          try {
            const projects = await fetchProjectsByScope(s.id);
            return [s.id, projects[0]?.id ?? ""] as const;
          } catch { return [s.id, ""] as const; }
        }));
        if (!cancelled) setExistingByScope(Object.fromEntries(pairs.filter(([, v]) => v)));
      })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [allowMultiplePerScope]);

  const q = search.trim().toLowerCase();
  const filtered = scopes.filter((s) => !q
    || s.scopeNumber.toLowerCase().includes(q)
    || s.customerName.toLowerCase().includes(q)
    || s.quotationNumber.toLowerCase().includes(q));

  return (
    <div className={dialogShell}>
      <div className={dialogPanel}>
        <div className="flex items-center justify-between">
          <h2 className={dialogHeading} style={headingFont}>{t("project.picker.scope.title")}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" title={t("project.picker.close")}>
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t("project.picker.scope.description")}</p>

        <div className={searchBox}>
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("project.picker.scope.searchPlaceholder")} className={searchInput} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? <SkeletonRows />
            : loadError ? <p className="text-sm text-muted-foreground text-center py-6">{t("project.picker.loadError")}</p>
            : filtered.length === 0 ? (
              <EmptyState icon={FileText} title={t("project.picker.scope.emptyTitle")} description={t("project.picker.scope.emptyDescription")} compact />
            ) : (
              <div className="space-y-1.5">
                {filtered.map((s) => {
                  const taken = !allowMultiplePerScope && Boolean(existingByScope[s.id]);
                  // โครงการยังต้องใช้งานที่อนุมัติแล้ว — ตรงกับด่านฝั่งเซิร์ฟเวอร์ใน handleCreate()
                  // (api/_lib/projectHandler.ts) ส่วนใบสั่งผลิตปลดด่านไปแล้ว จึงส่ง requireFinalScope=false มา
                  const notApproved = requireFinalScope && s.status !== "Final";
                  return (
                    <button key={s.id} onClick={() => { setBusyId(s.id); onSelect(s.id); }} disabled={taken || notApproved || busyId !== null} className={rowButton}>
                      <div className="min-w-0">
                        <p className="text-sm font-mono font-medium text-foreground truncate">{s.scopeNumber}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.customerName} · {s.quotationNumber}</p>
                      </div>
                      {busyId === s.id ? <Loader2 size={14} className="animate-spin text-muted-foreground flex-shrink-0" />
                        : notApproved ? <span className="text-xs text-[#a75d1a] flex-shrink-0">{t("project.picker.scope.notApproved")}</span>
                        : taken ? <span className="text-xs text-muted-foreground flex-shrink-0">{t("project.picker.scope.alreadyHasProject")}</span>
                        : null}
                    </button>
                  );
                })}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

/**
 * เลือกโครงการ แล้วเลือกรายการที่ยังไม่ได้ออกเอกสาร — ใช้บนหน้าใบเบิก-คืนวัสดุ / ใบสั่งงาน / ใบขอซื้อ
 * Two steps in one dialog because the create API needs both ids (`POST /api/X {projectId, itemId}`).
 * Only `itemStatus === "pending"` items are selectable — the same rule the server enforces in
 * `loadPendingProjectItemOrThrow()`, mirrored here so the user never picks a row that will 400.
 * An item pre-assigned to a *different* sourcing branch still shows (the server allows it — creating
 * overwrites `sourcingMethod`), but its current assignment is labelled so the choice is informed.
 */
export function ProjectItemSourcePickerDialog({ title, description, onClose, onSelect }: {
  title: string;
  description: string;
  onClose: () => void;
  onSelect: (projectId: string, itemId: string) => void;
}) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ProjectListItem | null>(null);
  const [items, setItems] = useState<ProjectItem[] | null>(null);
  const [itemsError, setItemsError] = useState(false);
  const [busy, setBusy] = useState(false);

  const sourcingLabel: Record<ProjectItemSourcingMethod, string> = {
    unassigned: t("project.sourcing.unassigned"),
    requisition: t("project.sourcing.requisition"),
    jobOrder: t("project.sourcing.jobOrder"),
    purchaseRequest: t("project.sourcing.purchaseRequest"),
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllProjects()
      .then((list) => { if (!cancelled) { setProjects(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openProject = (p: ProjectListItem) => {
    setPicked(p);
    setItems(null);
    setItemsError(false);
    fetchProject(p.id)
      .then((full) => setItems(full.items))
      .catch(() => setItemsError(true));
  };

  const q = search.trim().toLowerCase();
  const filteredProjects = projects.filter((p) => !q
    || p.scopeNumber.toLowerCase().includes(q)
    || p.customerCompanyName.toLowerCase().includes(q));
  const pendingItems = (items ?? []).filter((i) => i.itemStatus === "pending");

  return (
    <div className={dialogShell}>
      <div className={dialogPanel}>
        <div className="flex items-center justify-between">
          <h2 className={dialogHeading} style={headingFont}>{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" title={t("project.picker.close")}>
            <X size={18} />
          </button>
        </div>

        {picked ? (
          <>
            <button onClick={() => { setPicked(null); setItems(null); setItemsError(false); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit">
              <ChevronLeft size={14} /> {t("project.picker.back")}
            </button>
            <p className="text-xs text-muted-foreground">
              {t("project.picker.item.description")} — <span className="font-mono text-foreground">{picked.scopeNumber}</span>
            </p>
            <div className="flex-1 overflow-y-auto">
              {itemsError ? <p className="text-sm text-muted-foreground text-center py-6">{t("project.picker.loadError")}</p>
                : items === null ? <SkeletonRows />
                : pendingItems.length === 0 ? (
                  <EmptyState icon={FileText} title={t("project.picker.item.emptyTitle")} description={t("project.picker.item.emptyDescription")} compact />
                ) : (
                  <div className="space-y-1.5">
                    {pendingItems.map((item) => (
                      <button key={item.id} onClick={() => { setBusy(true); onSelect(picked.id, item.id); }} disabled={busy} className={rowButton}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.quantity ?? "-"} {item.unit}
                            {item.sourcingMethod !== "unassigned" && ` · ${t("project.picker.item.preassigned")} ${sourcingLabel[item.sourcingMethod]}`}
                          </p>
                        </div>
                        {busy && <Loader2 size={14} className="animate-spin text-muted-foreground flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{description}</p>
            <div className={searchBox}>
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("project.picker.project.searchPlaceholder")} className={searchInput} />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? <SkeletonRows />
                : loadError ? <p className="text-sm text-muted-foreground text-center py-6">{t("project.picker.loadError")}</p>
                : filteredProjects.length === 0 ? (
                  <EmptyState icon={FileText} title={t("project.picker.project.emptyTitle")} description={t("project.picker.project.emptyDescription")} compact />
                ) : (
                  <div className="space-y-1.5">
                    {filteredProjects.map((p) => (
                      <button key={p.id} onClick={() => openProject(p)} className={rowButton}>
                        <div className="min-w-0">
                          <p className="text-sm font-mono font-medium text-foreground truncate">{p.scopeNumber}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.customerCompanyName}</p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {p.itemCount} {t("project.picker.project.itemsUnit")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * เลือกใบสั่งผลิตต้นทาง — ใช้บนหน้าใบเบิก-คืนวัสดุ/ใบขอซื้อ "ของฝ่ายผลิต"
 *
 * ฝ่ายผลิตออกเอกสารจากใบสั่งผลิต ไม่ใช่จากรายการในโครงการ จึงเลือกแค่ขั้นเดียว (ไม่มีขั้นเลือกรายการ)
 * — ดู handleCreate() ใน materialRequisitionHandler.ts/purchaseRequestHandler.ts ที่รับ
 * `{ productionOrderId }` เป็นต้นทางทางเลือกแทน `{ projectId, itemId }`
 */
export function ProductionOrderSourcePickerDialog({ title, onClose, onSelect }: {
  title: string;
  onClose: () => void;
  onSelect: (productionOrderId: string) => void;
}) {
  const { t } = useI18n();
  const [orders, setOrders] = useState<ProductionOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllProductionOrders()
      .then((list) => { if (!cancelled) { setOrders(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = orders.filter((o) => !q
    || o.id.toLowerCase().includes(q)
    || o.jobCode.toLowerCase().includes(q)
    || o.customerCompanyName.toLowerCase().includes(q)
    || o.productName.toLowerCase().includes(q));

  return (
    <div className={dialogShell}>
      <div className={dialogPanel}>
        <div className="flex items-center justify-between">
          <h2 className={dialogHeading} style={headingFont}>{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" title={t("project.picker.close")}>
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t("project.picker.productionOrder.description")}</p>

        <div className={searchBox}>
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("productionOrder.searchPlaceholder")} className={searchInput} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? <SkeletonRows />
            : loadError ? <p className="text-sm text-muted-foreground text-center py-6">{t("project.picker.loadError")}</p>
            : filtered.length === 0 ? (
              <EmptyState icon={FileText} title={t("project.picker.productionOrder.emptyTitle")} description={t("project.picker.productionOrder.emptyDescription")} compact />
            ) : (
              <div className="space-y-1.5">
                {filtered.map((o) => (
                  <button key={o.id} onClick={() => { setBusy(true); onSelect(o.id); }} disabled={busy} className={rowButton}>
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-medium text-foreground truncate">{o.documentNumber || o.id}</p>
                      <p className="text-xs text-muted-foreground truncate">{o.jobCode} · {o.customerCompanyName}{o.productName ? ` · ${o.productName}` : ""}</p>
                    </div>
                    {busy && <Loader2 size={14} className="animate-spin text-muted-foreground flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
