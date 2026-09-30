import { useId, useState } from "react";
import { Boxes, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import type { Product } from "../../lib/products";
import { createCommonTool, setCommonToolStock } from "../../lib/toolHoldings";
import { Drawer } from "../../components/ui/Overlays";
import { Field } from "../../components/ui/Field";
import { btn, field } from "../../components/ui/styles";
import { FormDialog, UnitInput } from "../stock/inventoryUi";

/**
 * เครื่องมือกองกลาง (2026-09-29) — เพิ่มเครื่องมือจากหน้าเครื่องมือประจำทีมโดยตรง และกดรหัส/ชื่อเพื่ออัปเดตยอดสต๊อก
 * ดีไซน์ใหม่ 2026-09-30: เพิ่มเครื่องมือเป็นแผงด้านข้าง (560) · อัปเดตจำนวนเป็นกล่อง 480 แบบใหม่
 * ทั้งสองอย่าง mount เนื้อในเฉพาะตอนเปิด ค่าที่กรอกจึงเริ่มใหม่ทุกครั้ง (แบบเดียวกับ PromptDialog)
 */

function parseQty(v: string): number | null {
  if (v.trim() === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function AddCommonToolDrawer({ open, onSaved, onCancel }: { open: boolean; onSaved: (product: Product) => void; onCancel: () => void }) {
  if (!open) return null;
  return <AddCommonToolPanel onSaved={onSaved} onCancel={onCancel} />;
}

function AddCommonToolPanel({ onSaved, onCancel }: { onSaved: (product: Product) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const formId = useId();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (busy) return;
    if (!name.trim()) { setError(t("toolControl.commonTool.errorName")); return; }
    const n = parseQty(qty);
    if (n === null) { setError(t("toolControl.commonTool.errorQty")); return; }
    setBusy(true);
    setError("");
    try {
      onSaved(await createCommonTool({ code: code.trim() || undefined, name: name.trim(), unit: unit.trim(), qty: n }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("toolControl.commonTool.errorSave"));
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      title={t("toolControl.commonTool.addTitle")}
      subtitle={t("toolControl.commonTool.addHint")}
      onClose={onCancel}
      busy={busy}
      footerRight={(
        <>
          <button type="button" onClick={onCancel} disabled={busy} className={btn.secondary}>{t("toolControl.commonTool.cancel")}</button>
          <button type="submit" form={formId} disabled={busy} className={btn.primary}>
            {busy && <Loader2 size={16} className="animate-spin" />} {t("toolControl.commonTool.addConfirm")}
          </button>
        </>
      )}
    >
      <form id={formId} onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <h3 className="text-[15px] font-semibold text-foreground">{t("toolControl.commonTool.groupInfo")}</h3>
          <Field label={t("toolControl.commonTool.name")} htmlFor="common-tool-name" required>
            <input id="common-tool-name" autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(""); }} className={`${field.input} w-full`} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("toolControl.commonTool.code")} htmlFor="common-tool-code">
              <input id="common-tool-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("toolControl.commonTool.codePlaceholder")} className={`${field.input} w-full font-mono`} />
            </Field>
            <Field label={t("toolControl.commonTool.unit")} htmlFor="common-tool-unit">
              <input id="common-tool-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={`${field.input} w-full`} />
            </Field>
          </div>
        </section>
        <div className="h-px bg-[#eef1f6]" />
        <section className="flex flex-col gap-4">
          <h3 className="text-[15px] font-semibold text-foreground">{t("toolControl.commonTool.groupStock")}</h3>
          <Field label={t("toolControl.commonTool.initialQty")} htmlFor="common-tool-qty" className="w-full sm:w-[240px]">
            <UnitInput id="common-tool-qty" type="number" min={0} value={qty} unit={unit.trim() || undefined}
              onChange={(e) => { setQty(e.target.value); setError(""); }} />
          </Field>
        </section>
        {error && <p className={field.error} role="alert">{error}</p>}
      </form>
    </Drawer>
  );
}

export function CommonToolStockDialog({ product, onSaved, onCancel }: { product: Product; onSaved: (product: Product) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const current = product.stockQty ?? 0;
  const [qty, setQty] = useState(String(current));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = parseQty(qty);
  const diff = n === null ? 0 : n - current;

  const save = async () => {
    if (n === null || qty.trim() === "") { setError(t("toolControl.commonTool.errorQty")); return; }
    if (diff === 0) { onCancel(); return; }
    setBusy(true);
    setError("");
    try {
      onSaved(await setCommonToolStock(product.id, n, note.trim() || undefined));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("toolControl.commonTool.errorSave"));
      setBusy(false);
    }
  };

  return (
    <FormDialog
      icon={Boxes}
      title={t("toolControl.commonTool.stockTitle")}
      description={(
        <>
          <span className="font-mono text-[13px]">{product.code}</span> · {product.name} · {t("toolControl.commonTool.current")}{" "}
          <strong className="font-semibold text-foreground tabular-nums">{current.toLocaleString("th-TH")}</strong> {product.unit}
        </>
      )}
      busy={busy}
      error={error}
      confirmLabel={t("toolControl.commonTool.stockConfirm")}
      onConfirm={() => void save()}
      onCancel={onCancel}
    >
      <Field label={t("toolControl.commonTool.newQty")} htmlFor="common-tool-new-qty" required
        help={diff !== 0 ? (
          <span className={`flex items-center gap-1.5 font-medium ${diff > 0 ? "text-[#1b7f4f]" : "text-[#8a5a00]"}`}>
            {diff > 0 ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
            {(diff > 0 ? t("toolControl.commonTool.diffUp") : t("toolControl.commonTool.diffDown")).replace("{n}", Math.abs(diff).toLocaleString("th-TH")).replace("{unit}", product.unit ?? "")}
          </span>
        ) : undefined}>
        <UnitInput id="common-tool-new-qty" autoFocus type="number" min={0} value={qty} unit={product.unit || undefined} className="w-full sm:w-[220px]"
          onChange={(e) => { setQty(e.target.value); setError(""); }} onFocus={(e) => e.target.select()} />
      </Field>
      <Field label={t("toolControl.commonTool.note")} htmlFor="common-tool-note">
        <input id="common-tool-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("toolControl.commonTool.notePlaceholder")} className={`${field.input} w-full`} />
      </Field>
    </FormDialog>
  );
}
