import { useEffect, useState } from "react";
import { Loader2, Send, AlertTriangle, Check } from "lucide-react";
import { fetchDepartments, type Department } from "../../lib/departments";
import { sendDeliveryOrderToDepartments, type DeliveryOrder } from "../../lib/deliveryOrder";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { SectionCard } from "../../components/ui/SectionCard";
import { btn, field } from "../../components/ui/styles";

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
    <SectionCard title={t("deliveryOrderDept.heading")} subtitle={t("deliveryOrderDept.hint")} className="print:hidden">
      <div className="flex flex-col gap-2">
        <span id="do-sendto" className={field.label}>{t("deliveryOrderDept.sendToLabel")}</span>
        {departments === null ? (
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        ) : departments.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("deliveryOrderDept.noDepartments")}</p>
        ) : (
          <div role="group" aria-labelledby="do-sendto" className="flex flex-wrap gap-2">
            {departments.map((d) => {
              const on = selected.includes(d.id);
              return (
                <label
                  key={d.id}
                  className={`h-9 pl-2.5 pr-3 rounded-lg border text-sm inline-flex items-center gap-2 select-none transition-colors ${
                    on ? "border-[#1a5fb4] bg-[#e8f0fb] font-medium text-foreground" : `border-[#c3ccda] bg-white text-foreground ${canEdit ? "hover:border-[#8a97ad]" : ""}`
                  } ${canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                >
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={on}
                    onChange={() => toggle(d.id)}
                    className="w-4 h-4 m-0 accent-[#1a5fb4]"
                  />
                  {d.name}
                </label>
              );
            })}
          </div>
        )}

        {/* ความล้มเหลวแบบเงียบที่ต้องกันไว้: ติ๊กแผนกแล้วกดส่ง แต่ไม่มีพนักงานคนไหนถูกตั้งแผนกไว้ตรงกัน
            เลย เอกสารจึงไม่ไปโผล่ที่ใครเลย โดยที่หน้าจอไม่ฟ้องอะไร — ต้องบอกให้ชัดตรงนี้ */}
        {lastRecipientCount === 0 && selected.length > 0 && (
          <div className="mt-1 flex items-start gap-2 rounded-lg bg-[#fdf3e0] border border-[#f1d8a3] px-3 py-2.5">
            <AlertTriangle size={15} className="text-[#8a5a00] flex-shrink-0 mt-0.5" />
            <p className="text-[13px] text-foreground leading-relaxed">{t("deliveryOrderDept.nobodyWarning")}</p>
          </div>
        )}

        {(canEdit || (lastRecipientCount !== null && lastRecipientCount > 0)) && (
          <div className="flex items-center justify-end gap-3 pt-2 flex-wrap">
            {lastRecipientCount !== null && lastRecipientCount > 0 && (
              <p className="flex-1 flex items-center gap-1.5 text-[13px] text-[#1b7f4f]">
                <Check size={15} /> {t("deliveryOrderDept.sentToast").replace("{count}", String(lastRecipientCount))}
              </p>
            )}
            {canEdit && (
              <button type="button" onClick={() => void send()} disabled={saving || !dirty} className={btn.secondarySm}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {t("deliveryOrderDept.send")}
              </button>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
