import { useEffect, useState } from "react";
import { Loader2, Send, AlertTriangle, Check } from "lucide-react";
import { fetchDepartments, type Department } from "../../lib/departments";
import { sendDeliveryOrderToDepartments, type DeliveryOrder } from "../../lib/deliveryOrder";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";

/**
 * "ส่งใบส่งมอบงานถึงแผนก" (2026-08-20) — เจ้าของขอให้เซลล์ติ๊กส่งเอกสารไปให้แผนกที่เกี่ยวข้อง แล้ว
 * เอกสารไปโผล่ในหน้ารายการของแผนกนั้น (ดู/พิมพ์อย่างเดียว) คล้ายกับ "เอกสารส่งถึง" ของ Scope of Work
 * แต่เป็น **ระดับแผนก** ไม่ใช่เลือกรายคน ตามที่เจ้าของยืนยันไว้
 *
 * รายชื่อแผนกดึงจากตาราง `departments` จริง ไม่ใช่ลิสต์ฮาร์ดโค้ดของ Scope of Work — เพราะการมองเห็น
 * ต้องจับคู่กับ `User.department` ของพนักงานจริง ถ้าใช้ลิสต์คนละชุดกันจะไม่มีใครเห็นอะไรเลย
 */
export function DeliveryOrderDepartmentRouting({
  deliveryOrder, canEdit, onUpdated, showToast,
}: {
  deliveryOrder: DeliveryOrder;
  canEdit: boolean;
  onUpdated: (updated: DeliveryOrder) => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [selected, setSelected] = useState<string[]>(deliveryOrder.sentToDepartmentIds ?? []);
  const [saving, setSaving] = useState(false);
  // จำนวนคนที่เห็นเอกสารจริงหลังกดส่ง — null = ยังไม่ได้กดส่งในรอบนี้
  const [lastRecipientCount, setLastRecipientCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDepartments()
      .then((rows) => { if (!cancelled) setDepartments(rows.filter((d) => d.isActive)); })
      .catch(() => { if (!cancelled) setDepartments([]); });
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = async () => {
    setSaving(true);
    try {
      const { deliveryOrder: updated, recipientCount } = await sendDeliveryOrderToDepartments(deliveryOrder.id, selected);
      onUpdated(updated);
      setLastRecipientCount(recipientCount);
      showToast(recipientCount > 0
        ? t("deliveryOrderDept.sentToast").replace("{count}", String(recipientCount))
        : t("deliveryOrderDept.sentNobodyToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("deliveryOrderDept.errorSend"));
    } finally {
      setSaving(false);
    }
  };

  const saved = deliveryOrder.sentToDepartmentIds ?? [];
  const dirty = selected.length !== saved.length || selected.some((id) => !saved.includes(id));

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 print:hidden">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("deliveryOrderDept.heading")}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t("deliveryOrderDept.hint")}</p>
      </div>

      {departments === null ? (
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      ) : departments.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("deliveryOrderDept.noDepartments")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {departments.map((d) => (
            <label key={d.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${selected.includes(d.id) ? "border-[#c9a84c]/50 bg-[#c9a84c]/5 text-foreground" : "border-border text-muted-foreground hover:text-foreground"} ${!canEdit ? "opacity-60 cursor-not-allowed" : ""}`}>
              <input
                type="checkbox" disabled={!canEdit}
                checked={selected.includes(d.id)}
                onChange={() => toggle(d.id)}
                className="accent-[#c9a84c]"
              />
              {d.name}
            </label>
          ))}
        </div>
      )}

      {/* ความล้มเหลวแบบเงียบที่ต้องกันไว้: ติ๊กแผนกแล้วกดส่ง แต่ไม่มีพนักงานคนไหนถูกตั้งแผนกไว้ตรงกัน
          เลย เอกสารจึงไม่ไปโผล่ที่ใครเลย โดยที่หน้าจอไม่ฟ้องอะไร — ต้องบอกให้ชัดตรงนี้ */}
      {lastRecipientCount === 0 && selected.length > 0 && (
        <div className="flex items-start gap-2 bg-[#e08a3c]/10 border border-[#e08a3c]/30 rounded-lg p-2.5">
          <AlertTriangle size={14} className="text-[#e08a3c] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-foreground leading-relaxed">{t("deliveryOrderDept.nobodyWarning")}</p>
        </div>
      )}
      {lastRecipientCount !== null && lastRecipientCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-[#207e52]">
          <Check size={13} /> {t("deliveryOrderDept.sentToast").replace("{count}", String(lastRecipientCount))}
        </p>
      )}

      {canEdit && (
        <button
          onClick={() => void send()}
          disabled={saving || !dirty}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {t("deliveryOrderDept.send")}
        </button>
      )}
    </div>
  );
}
