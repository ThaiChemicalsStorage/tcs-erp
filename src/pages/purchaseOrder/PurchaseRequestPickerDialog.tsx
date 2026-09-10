import { useEffect, useState } from "react";
import { FileText, Loader2, Search, X } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { fetchAllPurchaseRequests, type PurchaseRequestSummary } from "../../lib/purchaseRequest";
import { formatQuoteDateThai } from "../../lib/quotes";

/**
 * เลือกใบขอซื้อต้นทางก่อนสร้างใบสั่งซื้อ
 *
 * แสดงเฉพาะใบที่ **อนุมัติแล้ว (Final)** และ**ผ่านสโตร์มาแล้ว** เพราะเซิร์ฟเวอร์ปฏิเสธทั้งสองกรณีอยู่แล้ว
 * — กรองตรงนี้ไม่ใช่การบังคับสิทธิ์ แต่เพื่อไม่ให้ผู้ใช้เลือกสิ่งที่จะโดนปฏิเสธทีหลัง
 *
 * `storeStage` (2026-09-09): `"pending"` = ยังรอสโตร์เช็คของ · `"closed"` = สโตร์จ่ายจากสต๊อกครบแล้ว
 * ทั้งสองออกใบสั่งซื้อไม่ได้ · ใบเก่าที่ไม่มีฟิลด์นี้ถือว่าผ่าน (วิ่งตรงไปจัดซื้อตามกติกาเดิม)
 *
 * ดึงด้วย `ownerDepartment=all` เพราะจัดซื้อต้องเห็นงานที่ต้องซื้อของ**ทุกฝ่าย** ไม่ใช่แค่ฝ่ายเดียว
 * (หน้ารายการใบขอซื้อเดิมแยกตามฝ่ายเพราะเป็นมุมมองของฝ่ายผู้ขอ ไม่ใช่ของผู้ซื้อ) · ตัว `all` เปิดเฉพาะ
 * กำแพงแผนก ไม่ได้เปิดกำแพงสิทธิ์ — เซิร์ฟเวอร์ยังกรองด้วยความเป็นเจ้าของใบเหมือนเดิม
 *
 * **บั๊กที่แก้ 2026-09-10:** เดิมยิงสองครั้งด้วย `"project"` + `"production"` ซึ่งพลาด
 * `ownerDepartment: "general"` ที่เพิ่มมาตั้งแต่ 2026-08-28 — คือใบที่ฝ่ายซึ่งไม่มีเอกสารต้นทาง
 * (สโตร์/เซอร์วิส/บัญชี/บุคคล) เปิดเอง · ผลคือใบพวกนั้นอนุมัติแล้ว ผ่านสโตร์แล้ว แต่**ไม่เคยขึ้นใน
 * กล่องเลือกต้นทางเลย** จัดซื้อจึงออกใบสั่งซื้อให้ไม่ได้ ทั้งที่เซิร์ฟเวอร์ยอมรับคำขอนั้นอยู่แล้ว
 * เจอตอนไล่ flow จริงในเบราว์เซอร์ทั้งสาย (สร้าง → อนุมัติ → สโตร์ → จัดซื้อ)
 */
export function PurchaseRequestPickerDialog({
  onPick, onBlank, onCancel,
}: {
  onPick: (purchaseRequestId: string) => void;
  onBlank: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const [rows, setRows] = useState<PurchaseRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchAllPurchaseRequests("all")
      .then((list) => {
        if (cancelled) return;
        setRows(list.filter((r) => r.status === "Final" && r.storeStage !== "pending" && r.storeStage !== "closed"));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || [r.id, r.jobCode].some((v) => (v ?? "").toLowerCase().includes(q)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("purchaseOrder.picker.title")}
        className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-card border border-border rounded-xl shadow-xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("purchaseOrder.picker.title")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("purchaseOrder.picker.subtitle")}</p>
          </div>
          <button onClick={onCancel} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <div className="relative h-9">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("purchaseOrder.picker.searchPlaceholder")}
              className="h-9 w-full pl-9 pr-3 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12 px-5">{t("purchaseOrder.picker.empty")}</p>
          ) : (
            filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => onPick(r.id)}
                className="w-full text-left px-5 py-3 border-b border-border/50 hover:bg-secondary/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-mono font-semibold text-[#c9a84c]">{r.id}</span>
                  <span className="text-xs font-mono text-muted-foreground">{formatQuoteDateThai(r.updatedAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{r.jobCode || "—"}</p>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
          {/* จัดซื้อบางครั้งซื้อโดยไม่มีใบขอซื้อ — ไม่บังคับให้ต้องมีต้นทางเสมอ */}
          <button onClick={onBlank} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <FileText size={13} /> {t("purchaseOrder.picker.blank")}
          </button>
          <button onClick={onCancel} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
