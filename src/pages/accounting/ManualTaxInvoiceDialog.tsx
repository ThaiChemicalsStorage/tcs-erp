import { useEffect, useState } from "react";
import { Plus, Trash2, X, CornerDownRight } from "lucide-react";
import type { Customer } from "../../lib/customers";
import { fetchCustomers } from "../../lib/customers";
import { CustomerSelector } from "../quotation/CustomerSelector";
import { DOC_TYPE_LABEL_KEY, issueManualArDocument, type ArDocument } from "../../lib/accounting";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";

interface DraftLine {
  key: number;
  description: string;
  /** บรรทัดรายละเอียดย่อยใต้คำอธิบายหลัก (เช่น "For Installation") — ใบกำกับภาษีจริงมีบรรทัดย่อยแบบนี้
   * เพิ่ม 2026-08-20 ตามที่เจ้าของแจ้งว่าหน้าสร้างใส่รายละเอียดย่อยไม่ได้ */
  subDetails: string[];
  qty: string;
  unit: string;
  unitPrice: string;
}

const blankLine = (key: number): DraftLine => ({ key, description: "", subDetails: [], qty: "1", unit: "", unitPrice: "" });

// ปุ่ม "+ สร้าง" สไตล์เดียวกับหน้าใบเสนอราคา/ลูกค้า/คลังสินค้า (เพิ่ม 2026-08-18 ตามคำขอตรง "อยากได้เป็น
// แบบที่กดสร้างเหมือนปุ่มในหน้าสร้างใบเสนอราคา") — สร้างใบกำกับภาษี (AR/IV) แบบไม่ผูกกับ Scope of Work เลย
// เหมาะกับงานที่ไม่มีใบเสนอราคา/Scope of Work มาก่อน ลูกค้าเลือกจากรายชื่อที่บันทึกไว้หรือพิมพ์เองก็ได้
// (รูปแบบ pick-or-type เดียวกับ CustomerSelector ในหน้าใบเสนอราคา) ออกพร้อมใบแจ้งหนี้/ใบวางบิล (BI)
// คู่กันในขั้นตอนเดียว เหมือนการออกเอกสารจากงานตามปกติทุกประการ
export function ManualTaxInvoiceDialog({ docType: initialDocType, onClose, onIssued }: {
  docType: "AR" | "IV";
  onClose: () => void;
  onIssued: (documents: ArDocument[]) => void;
}) {
  const { t } = useI18n();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [docType, setDocType] = useState<"AR" | "IV">(initialDocType);
  const [customerId, setCustomerId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branch, setBranch] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [paymentType, setPaymentType] = useState<"" | "Cash" | "Credit">("");
  const [days, setDays] = useState("30");
  const [lines, setLines] = useState<DraftLine[]>([blankLine(1)]);
  // หมายเหตุท้ายเอกสาร — พิมพ์ใต้ตารางรายการ (เช่น เลขที่ PQ/PO, "เป็นค่าบริการหักภาษี ณ ที่จ่ายได้")
  // กรอกทีละบรรทัด แยกด้วยการขึ้นบรรทัดใหม่
  const [remarksText, setRemarksText] = useState("");
  const [nextKey, setNextKey] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchCustomers().then((c) => { if (!cancelled) setCustomers(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleSelectCustomer = (c: Customer) => {
    setCustomerId(c.id);
    setCompanyName(c.companyName);
    setAddress(c.address);
    setTaxId(c.taxId);
    setContactName(c.contactName);
    setPhone(c.phone);
    setEmail(c.email);
  };
  const handleClearCustomer = () => setCustomerId("");

  const updateLine = (key: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const addLine = () => { setLines((prev) => [...prev, blankLine(nextKey)]); setNextKey((n) => n + 1); };
  const removeLine = (key: number) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  const addSubDetail = (key: number) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, subDetails: [...l.subDetails, ""] } : l)));
  const updateSubDetail = (key: number, idx: number, text: string) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, subDetails: l.subDetails.map((sd, i) => (i === idx ? text : sd)) } : l)));
  const removeSubDetail = (key: number, idx: number) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, subDetails: l.subDetails.filter((_, i) => i !== idx) } : l)));

  const handleSubmit = async () => {
    if (!companyName.trim()) { setError(t("accounting.manual.error.companyRequired")); return; }
    const parsedLines = lines
      .map((l) => ({
        description: l.description.trim(),
        subDetails: l.subDetails.map((sd) => sd.trim()).filter(Boolean),
        qty: Number(l.qty), unit: l.unit.trim(), unitPrice: Number(l.unitPrice),
      }))
      .filter((l) => l.description && Number.isFinite(l.qty) && l.qty > 0 && Number.isFinite(l.unitPrice) && l.unitPrice >= 0);
    if (parsedLines.length === 0) { setError(t("accounting.manual.error.lineRequired")); return; }

    setBusy(true);
    setError("");
    try {
      const documents = await issueManualArDocument({
        docType,
        customer: { companyName: companyName.trim(), address, taxId, branch, contactName, phone, email },
        paymentType,
        days: paymentType === "Credit" ? Number(days) || null : null,
        lines: parsedLines,
        remarks: remarksText.split("\n").map((r) => r.trim()).filter(Boolean),
      });
      onIssued(documents);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("accounting.manual.error.issueFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            {t("accounting.manual.title")}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" title={t("accounting.manual.close")}>
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("accounting.manual.description")}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("accounting.manual.field.docType")}</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as "AR" | "IV")}
              className="w-full h-9 px-2 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
            >
              <option value="AR">{t(DOC_TYPE_LABEL_KEY.AR)}</option>
              <option value="IV">{t(DOC_TYPE_LABEL_KEY.IV)}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("accounting.manual.field.paymentType")}</label>
            <div className="flex items-center gap-2">
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as "" | "Cash" | "Credit")}
                className="flex-1 h-9 px-2 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
              >
                <option value="">{t("accounting.manual.paymentType.none")}</option>
                <option value="Cash">{t("accounting.manual.paymentType.cash")}</option>
                <option value="Credit">{t("accounting.manual.paymentType.credit")}</option>
              </select>
              {paymentType === "Credit" && (
                <input
                  type="number"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  placeholder={t("accounting.manual.field.daysPlaceholder")}
                  className="w-20 h-9 px-2 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("accounting.manual.field.customer")}</label>
          <CustomerSelector customers={customers} selectedId={customerId} onSelect={handleSelectCustomer} onClear={handleClearCustomer} disabled={false} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("accounting.manual.field.companyName")}</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("accounting.manual.field.taxId")}</label>
            <input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground block mb-1">{t("accounting.manual.field.address")}</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("accounting.manual.field.branch")}</label>
            <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder={t("accounting.manual.field.branchPlaceholder")} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("accounting.manual.field.contactName")}</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("accounting.manual.field.phone")}</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("accounting.manual.field.email")}</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">{t("accounting.manual.field.lines")}</label>
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.key} className="space-y-1.5 border border-border/50 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <input
                  value={l.description}
                  onChange={(e) => updateLine(l.key, { description: e.target.value })}
                  placeholder={t("accounting.manual.line.description")}
                  className="flex-1 h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
                <input
                  type="number"
                  value={l.qty}
                  onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                  placeholder={t("accounting.manual.line.qty")}
                  className="w-20 h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
                <input
                  value={l.unit}
                  onChange={(e) => updateLine(l.key, { unit: e.target.value })}
                  placeholder={t("accounting.manual.line.unit")}
                  className="w-20 h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
                <input
                  type="number"
                  value={l.unitPrice}
                  onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                  placeholder={t("accounting.manual.line.unitPrice")}
                  className="w-28 h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
                <button onClick={() => removeLine(l.key)} className="text-muted-foreground hover:text-[#e05252] transition-colors" title={t("accounting.manual.line.remove")}>
                  <Trash2 size={14} />
                </button>
              </div>

              {/* บรรทัดรายละเอียดย่อยใต้รายการหลัก — เยื้องเข้ามาให้เห็นชัดว่าเป็นของรายการไหน */}
              {l.subDetails.map((sd, i) => (
                <div key={i} className="flex items-center gap-2 pl-5">
                  <CornerDownRight size={12} className="text-muted-foreground flex-shrink-0" />
                  <input
                    value={sd}
                    onChange={(e) => updateSubDetail(l.key, i, e.target.value)}
                    placeholder={t("accounting.manual.line.subDetailPlaceholder")}
                    className="flex-1 h-8 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                  />
                  <button onClick={() => removeSubDetail(l.key, i)} className="text-muted-foreground hover:text-[#e05252] transition-colors" title={t("accounting.manual.line.removeSubDetail")}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <button onClick={() => addSubDetail(l.key)} className="flex items-center gap-1.5 pl-5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Plus size={12} /> {t("accounting.manual.line.addSubDetail")}
              </button>
              </div>
            ))}
            <button onClick={addLine} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Plus size={13} /> {t("accounting.manual.line.add")}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("accounting.manual.field.remarks")}</label>
          <textarea
            value={remarksText}
            onChange={(e) => setRemarksText(e.target.value)}
            rows={3}
            placeholder={t("accounting.manual.field.remarksPlaceholder")}
            className="w-full px-3 py-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors resize-y"
          />
        </div>

        {error && <p className="text-xs text-[#c23f3f]">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">{t("accounting.manual.btn.cancel")}</button>
          <button
            onClick={() => void handleSubmit()}
            disabled={busy}
            className="px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-50"
          >
            {busy ? t("accounting.manual.btn.issuingBusy") : t("accounting.manual.btn.issue")}
          </button>
        </div>
      </div>
    </div>
  );
}
