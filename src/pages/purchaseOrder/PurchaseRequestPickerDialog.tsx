import { useEffect, useState, type KeyboardEvent } from "react";
import { AlertTriangle, FilePlus2, Loader2, Search } from "lucide-react";
import { PickerDialog } from "../../components/ui/Overlays";
import { btn } from "../../components/ui/styles";
import { useI18n } from "../../lib/i18n";
import { fetchAllPurchaseRequests, type PurchaseRequestSummary } from "../../lib/purchaseRequest";
import { formatDisplayDate } from "../../lib/displayDate";

/**
 * เลือกใบขอซื้อต้นทางก่อนสร้างใบสั่งซื้อ
 *
 * **ดีไซน์ใหม่ 2026-09-30:** เดิมคลิกแถวแล้วสร้างใบสั่งซื้อทันที — ตอนนี้คลิกแถว = เลือก (วงกลมแบบ radio)
 * แล้วต้องกดปุ่ม "สร้างใบสั่งซื้อจาก …" ท้ายกล่องเพื่อยืนยัน (เจ้าของอนุมัติ select-then-confirm ทั้งแอป)
 * · ทางเปิดใบเปล่าย้ายไปเป็นปุ่มข้อความมุมซ้ายล่าง ยังกดได้ทันทีเหมือนเดิม
 *
 * แสดงเฉพาะใบที่ **อนุมัติแล้ว (Final)** และ**ผ่านสโตร์มาแล้ว** เพราะเซิร์ฟเวอร์ปฏิเสธทั้งสองกรณีอยู่แล้ว
 * — กรองตรงนี้ไม่ใช่การบังคับสิทธิ์ แต่เพื่อไม่ให้ผู้ใช้เลือกสิ่งที่จะโดนปฏิเสธทีหลัง
 *
 * `storeStage` (2026-09-09): `"pending"` = ยังรอสโตร์เช็คของ · `"closed"` = สโตร์จ่ายจากสต๊อกครบแล้ว
 * ทั้งสองออกใบสั่งซื้อไม่ได้ · ใบเก่าที่ไม่มีฟิลด์นี้ถือว่าผ่าน (วิ่งตรงไปจัดซื้อตามกติกาเดิม)
 *
 * `purchasingStage === "review"` (2026-09-21) ก็โดนเซิร์ฟเวอร์ปฏิเสธเหมือนกัน แต่**ไม่กรองทิ้ง** —
 * ต่างจากสองกรณีข้างบนตรงที่คนเปิดกล่องนี้คือฝ่ายจัดซื้อเอง ซึ่งเป็นคนกดอนุมัติได้ด้วยตัวเอง ซ่อนไป
 * เฉย ๆ จะกลายเป็น "ใบหายไปไหน" · ขึ้นป้าย + คำใบ้ว่าต้องไปกดอะไรก่อนแทน
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
  onPick, onBlank, onCancel, busy = false,
}: {
  onPick: (purchaseRequestId: string) => void;
  onBlank: () => void;
  onCancel: () => void;
  /** กำลังสร้างใบสั่งซื้อ — กันกดซ้ำ */
  busy?: boolean;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<PurchaseRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selectOnKey = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(id); }
  };

  // ป้ายบอกว่าใบนี้ออกใบสั่งซื้อไปแค่ไหนแล้ว (2026-09-21) — ใบที่ครบแล้วยังเลือกได้
  // เพราะเซิร์ฟเวอร์เป็นคนตอบว่าไม่เหลืออะไรให้ซื้อ ไม่ใช่ซ่อนไปเฉย ๆ ให้งง
  const tag = (r: PurchaseRequestSummary) =>
    r.purchasingStage === "review" ? { label: t("purchaseOrder.picker.needsPurchasingApproval"), cls: "bg-[#fdf3e0] text-[#8a5a00]" }
      : r.purchaseState === "full" ? { label: t("purchaseOrder.picker.orderedFull"), cls: "bg-[#e6f4ec] text-[#1b7f4f]" }
      : r.purchaseState === "partial" ? { label: t("purchaseOrder.picker.orderedPartial"), cls: "bg-[#e8f0fb] text-[#1a5fb4]" }
      : null;

  return (
    <PickerDialog
      open
      title={t("purchaseOrder.picker.title")}
      subtitle={t("purchaseOrder.picker.subtitle")}
      onClose={onCancel}
      busy={busy}
      toolbar={
        <>
          <label className="flex-1 min-w-[240px] h-10 px-3 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
            <Search size={16} className="text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("purchaseOrder.picker.searchPlaceholder")}
              aria-label={t("purchaseOrder.picker.searchPlaceholder")}
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none"
            />
          </label>
          {!loading && <span className="text-[13px] text-muted-foreground whitespace-nowrap">{t("purchaseOrder.picker.count").replace("{n}", String(filtered.length))}</span>}
        </>
      }
      // จัดซื้อบางครั้งซื้อโดยไม่มีใบขอซื้อ — ไม่บังคับให้ต้องมีต้นทางเสมอ
      footerNote={
        <button type="button" onClick={onBlank} disabled={busy} title={t("purchaseOrder.picker.blankHint")} className={btn.text}>
          <FilePlus2 size={16} /> {t("purchaseOrder.picker.blank")}
        </button>
      }
      confirmLabel={
        <>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {selectedId ? t("purchaseOrder.picker.confirmFrom").replace("{id}", selectedId) : t("purchaseOrder.createBtn")}
        </>
      }
      confirmDisabled={!selectedId}
      onConfirm={() => { if (selectedId) onPick(selectedId); }}
    >
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12 px-6">{t("purchaseOrder.picker.empty")}</p>
      ) : (
        <>
          <div className="hidden sm:grid grid-cols-[20px_170px_minmax(0,1fr)_190px_120px] gap-x-3.5 items-center px-6 h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173] sticky top-0 z-[1]">
            <span />
            <span>{t("purchaseOrder.picker.col.request")}</span>
            <span>{t("purchaseOrder.picker.col.job")}</span>
            <span>{t("purchaseOrder.picker.col.ordered")}</span>
            <span>{t("purchaseOrder.col.updatedAt")}</span>
          </div>
          <div role="radiogroup" aria-label={t("purchaseOrder.picker.title")}>
            {filtered.map((r) => {
              const on = r.id === selectedId;
              const tg = tag(r);
              return (
                <div
                  key={r.id}
                  role="radio"
                  aria-checked={on}
                  tabIndex={0}
                  onClick={() => setSelectedId(r.id)}
                  onKeyDown={(e) => selectOnKey(e, r.id)}
                  className={`grid grid-cols-[20px_minmax(0,1fr)] sm:grid-cols-[20px_170px_minmax(0,1fr)_190px_120px] gap-x-3.5 gap-y-1 items-center px-6 py-3.5 border-b border-[#eef1f6] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 transition-colors ${on ? "bg-[#eef4fc] hover:bg-[#e3edfa]" : "bg-white hover:bg-[#f8f9fc]"}`}
                >
                  <span aria-hidden="true" className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center ${on ? "border-[#0b1d3a]" : "border-[#a3aec2]"}`}>
                    {on && <span className="w-2 h-2 rounded-full bg-[#0b1d3a]" />}
                  </span>
                  <span className="font-mono text-[13px] font-medium text-foreground">{r.id}</span>
                  <span className={`font-mono text-[13px] truncate col-start-2 sm:col-start-auto ${r.jobCode ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>{r.jobCode || "—"}</span>
                  <span className="col-start-2 sm:col-start-auto">
                    {tg ? (
                      <span className={`h-[22px] px-2 rounded-md text-xs font-semibold inline-flex items-center whitespace-nowrap ${tg.cls}`}>{tg.label}</span>
                    ) : (
                      <span className="text-[#8a97ad]">—</span>
                    )}
                  </span>
                  <span className="text-sm text-[#3d5173] col-start-2 sm:col-start-auto">{formatDisplayDate(r.updatedAt)}</span>
                  {r.purchasingStage === "review" && (
                    <span className="col-start-2 sm:col-span-4 text-[12.5px] text-[#8a5a00] flex items-center gap-1.5">
                      <AlertTriangle size={14} className="flex-shrink-0" />
                      {t("purchaseOrder.picker.needsPurchasingApprovalHint")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </PickerDialog>
  );
}
