import { useState, type ReactNode } from "react";
import { ShoppingCart, Search, X } from "lucide-react";
import type { DriveStep } from "driver.js";
import { EmptyState } from "../../components/EmptyState";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import type { PurchaseRequestSummary, PurchaseRequestStatus } from "../../lib/purchaseRequest";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";

const FILTER_ALL = "all";

const statusStyle: Record<PurchaseRequestStatus, string> = {
  Draft: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  PendingApproval: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
  Final: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};

// แสดงตารางรายการใบขอซื้อ พร้อมตัวกรองสถานะและช่องค้นหา
// Renders the Purchase Request list table with a status filter and search box.
export function PurchaseRequestList({
  purchaseRequests,
  currentUserId,
  onOpen,
  headerAction,
  heading,
  showDepartment = false,
  stageFilter = false,
}: {
  purchaseRequests: PurchaseRequestSummary[];
  currentUserId: string;
  onOpen: (id: string) => void;
  /** หัวข้อหน้า — ระบุเมื่อหน้านี้ถูกเมาต์เป็นกล่องงานเข้าของจัดซื้อ ที่ไม่ใช่ใบของแผนกใดแผนกหนึ่ง */
  heading?: string;
  /** เพิ่มคอลัมน์ "แผนก" — จำเป็นเฉพาะมุมมองรวมทุกฝ่าย ที่ไม่รู้จากหน้าเองว่าใบไหนของใคร */
  showDepartment?: boolean;
  /**
   * เปลี่ยนแถบกรองจาก "สถานะเอกสาร" เป็น "ขั้นของใบ" — ใช้กับกล่องงานเข้าของฝ่ายจัดซื้อเท่านั้น (2026-09-10)
   *
   * กล่องนั้นเป็นคิวงาน คำถามของคนเปิดคือ *"ใบไหนถึงคิวฉันแล้ว"* ไม่ใช่ *"ใบไหนเป็นร่าง"* · ก่อนหน้านี้
   * กล่องนี้แสดงทุกใบรวมกันโดยไม่มีตัวกรองขั้นเลย ใบที่ยังรอสโตร์เช็คของอยู่จึงปนมากับงานที่ทำได้จริง
   * (กดออกใบสั่งซื้อแล้วโดน 400) ต่างจากกล่องของสโตร์ที่กรอง `?storeStage=pending` มาตั้งแต่แรก
   */
  stageFilter?: boolean;
  /** ปุ่ม "+ สร้าง" ของหน้านั้นๆ — หน้า Page เป็นเจ้าของ state ของกล่องเลือกต้นทาง (2026-08-20) */
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const statusLabel: Record<PurchaseRequestStatus, string> = { Draft: t("materialRequisition.status.draft"), PendingApproval: t("materialRequisition.status.pendingApproval"), Final: t("materialRequisition.status.final") };
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="pr-filters"]', popover: { title: t("tour.pr.filters.title"), description: t("tour.pr.filters.desc"), side: "bottom" } },
    { element: '[data-tour="pr-table"]', popover: { title: t("tour.pr.table.title"), description: t("tour.pr.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("purchaseRequest", currentUserId, tourSteps);
  const departmentLabel: Record<string, string> = {
    project: t("purchaseRequest.dept.project"),
    production: t("purchaseRequest.dept.production"),
    general: t("purchaseRequest.dept.general"),
  };
  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  /**
   * ตั้งต้นที่ "ถึงคิวจัดซื้อ" ไม่ใช่ "ทั้งหมด" — เปิดหน้ามาแล้วต้องเห็นงานที่ทำได้จริงก่อน
   * ใบที่ยังรอสโตร์อยู่ดูได้จากชิปข้าง ๆ ไม่ได้ถูกซ่อนหายไป
   */
  const [filterStage, setFilterStage] = useState<"forwarded" | "pending" | "all">("forwarded");
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();

  /**
   * "ถึงคิวจัดซื้อแล้ว" = อนุมัติแล้ว **และ**สโตร์ส่งต่อมาแล้ว · ใบก่อน 2026-09-09 ไม่มีฟิลด์ `storeStage`
   * เลย ซึ่งแปลว่าวิ่งตรงไปจัดซื้อตามกติกาเดิม จึงนับรวมด้วย — เงื่อนไขเดียวกับ `?storeStage=forwarded`
   * ฝั่งเซิร์ฟเวอร์ (`purchaseRequestHandler.ts`) ถ้าสองที่นี้ไม่ตรงกัน หน้าจอกับ API จะตอบคนละอย่าง
   */
  const atPurchasing = (p: PurchaseRequestSummary) => p.status === "Final" && (p.storeStage === "forwarded" || !p.storeStage);

  const items = purchaseRequests.map((p) => ({ ...p, jobCode: p.jobCode ?? "", status: p.status ?? "Draft" }));
  const filtered = items
    .filter((p) => (stageFilter
      ? filterStage === "all" || (filterStage === "forwarded" ? atPurchasing(p) : p.status === "Final" && p.storeStage === "pending")
      : filterStatus === FILTER_ALL || p.status === filterStatus))
    .filter((p) => !normalizedSearch || [p.id, p.jobCode].some((v) => v.toLowerCase().includes(normalizedSearch)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{heading ?? t("purchaseRequest.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("purchaseRequest.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          <TourReplayButton onClick={tour.start} />
        </div>
      </div>

      <div data-tour="pr-filters" className="flex items-center gap-3 flex-wrap">
        <div className="relative h-9 w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("purchaseRequest.searchPlaceholder")}
            className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
        {stageFilter ? (
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
            {(["forwarded", "pending", "all"] as const).map((s) => (
              <button key={s} onClick={() => setFilterStage(s)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStage === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
                {s === "all" ? t("quotation.filterAll") : s === "forwarded" ? t("purchaseRequest.stageFilter.forwarded") : t("purchaseRequest.stageFilter.pending")}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
            {([FILTER_ALL, "Draft", "PendingApproval", "Final"] as const).map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
                {s === FILTER_ALL ? t("quotation.filterAll") : statusLabel[s as PurchaseRequestStatus]}
              </button>
            ))}
          </div>
        )}
        {stageFilter && (
          <p className="text-xs text-muted-foreground font-mono" role="status" aria-live="polite">
            {t("purchaseRequest.stageFilter.count").replace("{n}", String(filtered.length))}
          </p>
        )}
      </div>

      <div data-tour="pr-table" className="bg-card border border-border rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={ShoppingCart} title={t("purchaseRequest.empty.title")} description={t("purchaseRequest.empty.description")} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <ShoppingCart size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("purchaseRequest.noFilterResults")}</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {[t("purchaseRequest.col.id"), t("purchaseRequest.col.jobCode"), ...(showDepartment ? [t("purchaseRequest.col.department")] : []), t("purchaseRequest.col.status"), t("purchaseRequest.col.updatedAt")].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                tabIndex={0}
                role="button"
                aria-label={`${t("purchaseRequest.openRow")} ${p.id}`}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p.id); } }}
                className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
              >
                <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{p.id}</td>
                <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{p.jobCode || "—"}</td>
                {showDepartment && (
                  <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{departmentLabel[p.ownerDepartment ?? "project"]}</td>
                )}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[p.status]}`}>
                      {statusLabel[p.status]}
                    </span>
                    {/* ขั้นของสโตร์ (2026-09-09) — ใบที่อนุมัติแล้วยังไม่จบ ต้องผ่านสโตร์ก่อนถึงจัดซื้อ
                        ใบก่อนวันนั้นไม่มีฟิลด์นี้ จึงไม่ขึ้นป้ายอะไรเลย ซึ่งถูกต้อง: มันวิ่งตรงไปจัดซื้อ */}
                    {p.status === "Final" && p.storeStage && (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        p.storeStage === "pending" ? "bg-[#e08a3c]/15 text-[#a75d1a]"
                        : p.storeStage === "forwarded" ? "bg-[#3c7de0]/15 text-[#1a4fa7]"
                        : "bg-[#2aa36b]/15 text-[#1c7a4e]"}`}>
                        {p.storeStage === "pending" ? t("purchaseRequest.stage.pending")
                          : p.storeStage === "forwarded" ? t("purchaseRequest.stage.forwarded")
                          : t("purchaseRequest.stage.closed")}
                      </span>
                    )}
                    {/* ขั้นของจัดซื้อ (2026-09-21) — ป้ายที่สามบอกว่าใบถูกล็อกแล้วพร้อมออกใบสั่งซื้อ
                        ขึ้นเฉพาะตอน "approved" · "review" ไม่ขึ้นป้าย เพราะป้ายสโตร์ "รอจัดซื้อ" บอกอยู่แล้ว */}
                    {p.status === "Final" && p.purchasingStage === "approved" && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#2aa36b]/15 text-[#1c7a4e]">
                        {t("purchaseRequestDoc.purchasing.stageBadge")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(p.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        )}
      </div>
    </div>
  );
}
