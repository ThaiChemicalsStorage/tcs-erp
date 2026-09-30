import { useEffect, useState } from "react";
import { Plus, Trash2, CornerDownRight, FileCheck2, Loader2, AlertCircle } from "lucide-react";
import type { Customer } from "../../lib/customers";
import { fetchCustomers } from "../../lib/customers";
import { CustomerSelector } from "../quotation/CustomerSelector";
import { DOC_TYPE_LABEL_KEY, issueManualArDocument, type ArDocument } from "../../lib/accounting";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { DocumentHeader, DocumentColumns, RailTotalCard, RailCard, NextStepHint } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { Field } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { Pill } from "./accountingUi";
import { manualLineAmount, manualTotals, money } from "./accountingFormat";

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

/** แปลงบรรทัดที่กรอกเป็นรายการที่จะส่งจริง — กติกาเดียวกับเซิร์ฟเวอร์ (มีคำอธิบาย จำนวน > 0 ราคา >= 0) */
function parseLines(lines: DraftLine[]) {
  return lines
    .map((l) => ({
      description: l.description.trim(),
      subDetails: l.subDetails.map((sd) => sd.trim()).filter(Boolean),
      qty: Number(l.qty), unit: l.unit.trim(), unitPrice: Number(l.unitPrice),
    }))
    .filter((l) => l.description && Number.isFinite(l.qty) && l.qty > 0 && Number.isFinite(l.unitPrice) && l.unitPrice >= 0);
}

const LINE_GRID = "grid-cols-[28px_minmax(0,1fr)_96px_104px_150px_150px_36px]";

// ปุ่ม "+ สร้างใบกำกับภาษี (Manual)" บนหน้ารายการ AR/IV (เพิ่ม 2026-08-18) — สร้างใบกำกับภาษีแบบไม่ผูกกับ
// Scope of Work ลูกค้าเลือกจากรายชื่อที่บันทึกไว้หรือพิมพ์เองก็ได้ (pick-or-type แบบ CustomerSelector ในหน้า
// ใบเสนอราคา) ออกพร้อมใบแจ้งหนี้/ใบวางบิล (BI) คู่กันในขั้นตอนเดียวเหมือนการออกจากงานตามปกติ
// ดีไซน์ใหม่ 2026-09-30: จากกล่องโต้ตอบกลายเป็นหน้าเต็ม (เจ้าของอนุมัติ) — เปิดจากปุ่มเดิม เป็นอีกมุมมองหนึ่งของ
// ArDocumentListPage (ไม่มีเส้นทางใหม่ใน App.tsx) พร้อมกล่องยอดรวมและการ์ด "เอกสารที่จะได้"
export function ManualTaxInvoicePage({ docType: initialDocType, backLabel, onBack, onIssued }: {
  docType: "AR" | "IV";
  backLabel: string;
  onBack: () => void;
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

  const validLines = parseLines(lines);
  const totals = manualTotals(validLines.map((l) => manualLineAmount(l.qty, l.unitPrice)));

  const handleSubmit = async () => {
    if (busy) return;
    if (!companyName.trim()) { setError(t("accounting.manual.error.companyRequired")); return; }
    if (validLines.length === 0) { setError(t("accounting.manual.error.lineRequired")); return; }

    setBusy(true);
    setError("");
    try {
      const documents = await issueManualArDocument({
        docType,
        customer: { companyName: companyName.trim(), address, taxId, branch, contactName, phone, email },
        paymentType,
        days: paymentType === "Credit" ? Number(days) || null : null,
        lines: validLines,
        remarks: remarksText.split("\n").map((r) => r.trim()).filter(Boolean),
      });
      onIssued(documents);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("accounting.manual.error.issueFailed"));
    } finally {
      setBusy(false);
    }
  };

  const input = `${field.input} w-full`;
  const cell = `${field.cell} w-full min-w-0`;

  const documentCard = (
    <SectionCard title={t("accounting.manual.section.document")}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-[18px]">
        <Field label={t("accounting.manual.field.docType")} htmlFor="manual-doc-type">
          <select id="manual-doc-type" value={docType} onChange={(e) => setDocType(e.target.value as "AR" | "IV")} className={input}>
            <option value="AR">{t(DOC_TYPE_LABEL_KEY.AR)}</option>
            <option value="IV">{t(DOC_TYPE_LABEL_KEY.IV)}</option>
          </select>
        </Field>
        <Field label={t("accounting.manual.field.paymentType")} htmlFor="manual-payment-type">
          <select id="manual-payment-type" value={paymentType} onChange={(e) => setPaymentType(e.target.value as "" | "Cash" | "Credit")} className={input}>
            <option value="">{t("accounting.manual.paymentType.none")}</option>
            <option value="Cash">{t("accounting.manual.paymentType.cash")}</option>
            <option value="Credit">{t("accounting.manual.paymentType.credit")}</option>
          </select>
        </Field>
        {paymentType === "Credit" && (
          <Field label={t("accounting.manual.paymentType.credit")} htmlFor="manual-days">
            <span data-field-box className="h-10 rounded-lg border border-[#c3ccda] bg-white flex items-stretch overflow-hidden focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
              <input
                id="manual-days"
                type="number"
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="flex-1 min-w-0 h-full px-3 bg-transparent text-sm text-right tabular-nums text-foreground outline-none"
              />
              <span className="h-full px-3 flex items-center bg-[#f4f6fa] border-l border-border text-[13px] text-[#3d5173]">{t("accounting.manual.field.daysPlaceholder")}</span>
            </span>
          </Field>
        )}
      </div>
    </SectionCard>
  );

  const customerCard = (
    <SectionCard title={t("accounting.list.col.customer")}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-[18px]">
        <Field label={t("accounting.manual.field.customer")} className="sm:col-span-3">
          <CustomerSelector customers={customers} selectedId={customerId} onSelect={handleSelectCustomer} onClear={handleClearCustomer} disabled={false} />
        </Field>
        <Field label={t("accounting.manual.field.company")} required htmlFor="manual-company" className="sm:col-span-2">
          <input id="manual-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={input} />
        </Field>
        <Field label={t("accounting.manual.field.taxId")} htmlFor="manual-tax-id">
          <input id="manual-tax-id" value={taxId} onChange={(e) => setTaxId(e.target.value)} className={`${input} font-mono`} />
        </Field>
        <Field label={t("accounting.manual.field.address")} htmlFor="manual-address" className="sm:col-span-2">
          <input id="manual-address" value={address} onChange={(e) => setAddress(e.target.value)} className={input} />
        </Field>
        <Field label={t("accounting.manual.field.branch")} htmlFor="manual-branch">
          <input id="manual-branch" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder={t("accounting.manual.field.branchPlaceholder")} className={input} />
        </Field>
        <Field label={t("accounting.manual.field.contactName")} htmlFor="manual-contact">
          <input id="manual-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} className={input} />
        </Field>
        <Field label={t("accounting.manual.field.phone")} htmlFor="manual-phone">
          <input id="manual-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
        </Field>
        <Field label={t("accounting.manual.field.email")} htmlFor="manual-email">
          <input id="manual-email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </Field>
      </div>
    </SectionCard>
  );

  const rail = (
    <>
      <RailTotalCard
        label={t("accounting.monthly.kpi.netTotal")}
        amount={`฿${money(totals.netTotal)}`}
        rows={[
          { label: t("accounting.monthly.valueBeforeVat"), value: `฿${money(totals.valueAmount)}` },
          { label: t("accounting.monthly.kpi.vat7"), value: `฿${money(totals.vatAmount)}` },
          { label: t("accounting.manual.field.lines"), value: t("ui.itemCount").replace("{n}", String(validLines.length)) },
        ]}
      />
      <RailCard title={t("accounting.manual.resultDocs")}>
        {[docType, "BI" as const].map((code) => (
          <div key={code} className="flex items-center gap-2.5">
            <span className="h-[22px] px-2 rounded-md bg-[#eef1f6] text-[#3d5173] text-xs font-semibold font-mono inline-flex items-center">{code}</span>
            <span className="text-sm font-medium text-foreground">{t(DOC_TYPE_LABEL_KEY[code])}</span>
          </div>
        ))}
      </RailCard>
      <NextStepHint title={t("accounting.jobBilling.nextStep.title")}>{t("accounting.manual.description")}</NextStepHint>
    </>
  );

  return (
    <div className="flex-1 flex flex-col overflow-y-auto print:hidden doc-form">
      <DocumentHeader
        backLabel={backLabel}
        onBack={onBack}
        number={<span className="font-sans font-semibold">{t("accounting.manual.title")}</span>}
        status={<Pill tone="grey" label={t("accounting.manual.status.draft")} />}
        meta={t("accounting.manual.numberHint")}
        actions={<>
          <button type="button" onClick={onBack} disabled={busy} className={btn.secondary}>{t("accounting.manual.btn.cancel")}</button>
          <button type="button" onClick={() => void handleSubmit()} disabled={busy} className={btn.primary}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <FileCheck2 size={16} />}
            {busy ? t("accounting.manual.btn.issuingBusy") : t("accounting.manual.btn.issue")}
          </button>
        </>}
      >
        {error && (
          <p role="alert" className="mb-3.5 px-3.5 py-2.5 rounded-lg bg-[#fcebeb] border border-[#f3c9c9] text-sm text-[#b93636] flex items-center gap-2">
            <AlertCircle size={16} className="flex-shrink-0" /> {error}
          </p>
        )}
      </DocumentHeader>

      <div className="px-4 md:px-8 pt-6 pb-10 flex flex-col gap-5">
        <DocumentColumns main={<>{documentCard}{customerCard}</>} rail={rail} />

        <SectionCard
          title={t("accounting.manual.field.lines")}
          actions={<span className="text-[13px] text-muted-foreground">{t("ui.itemCount").replace("{n}", String(lines.length))}</span>}
          bodyClassName=""
        >
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className={`grid ${LINE_GRID} gap-2 items-center px-6 ${table.head}`}>
                <span>#</span>
                <span>{t("accounting.manual.line.description")}</span>
                <span className="text-right">{t("accounting.manual.line.qty")}</span>
                <span>{t("accounting.manual.line.unit")}</span>
                <span className="text-right">{t("accounting.manual.line.unitPrice")}</span>
                <span className="text-right">{t("accounting.manual.line.amount")}</span>
                <span />
              </div>
              {lines.map((l, i) => {
                const qty = Number(l.qty);
                const price = Number(l.unitPrice);
                const hasAmount = l.qty !== "" && l.unitPrice !== "" && Number.isFinite(qty) && Number.isFinite(price);
                return (
                  <div key={l.key} className="border-b border-[#eef1f6]">
                    <div className={`grid ${LINE_GRID} gap-2 items-center px-6 pt-2 pb-1`}>
                      <span className="text-[13px] text-muted-foreground">{i + 1}</span>
                      <input aria-label={t("accounting.manual.line.description")} value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} placeholder={t("accounting.manual.line.description")} className={cell} />
                      <input aria-label={t("accounting.manual.line.qty")} type="number" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} placeholder={t("accounting.manual.line.qty")} className={`${cell} text-right tabular-nums`} />
                      <input aria-label={t("accounting.manual.line.unit")} value={l.unit} onChange={(e) => updateLine(l.key, { unit: e.target.value })} placeholder={t("accounting.manual.line.unit")} className={cell} />
                      <input aria-label={t("accounting.manual.line.unitPrice")} type="number" value={l.unitPrice} onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })} placeholder={t("accounting.manual.line.unitPrice")} className={`${cell} text-right tabular-nums`} />
                      <span className="text-right font-semibold tabular-nums text-foreground">{hasAmount ? money(manualLineAmount(qty, price)) : "—"}</span>
                      <button type="button" onClick={() => removeLine(l.key)} aria-label={t("accounting.manual.line.remove")} title={t("accounting.manual.line.remove")} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {/* บรรทัดรายละเอียดย่อยใต้รายการหลัก — เยื้องเข้ามาให้เห็นชัดว่าเป็นของรายการไหน */}
                    {l.subDetails.map((sd, idx) => (
                      <div key={idx} className="grid grid-cols-[28px_minmax(0,1fr)_36px] gap-2 items-center px-6 py-1">
                        <span />
                        <span className="flex items-center gap-2 pl-3 min-w-0">
                          <CornerDownRight size={14} className="text-[#8a97ad] flex-shrink-0" />
                          <input
                            aria-label={t("accounting.manual.line.subDetailPlaceholder")}
                            value={sd}
                            onChange={(e) => updateSubDetail(l.key, idx, e.target.value)}
                            placeholder={t("accounting.manual.line.subDetailPlaceholder")}
                            className={`${field.cell.replace("text-foreground", "text-[#3d5173]")} w-full max-w-[440px]`}
                          />
                        </span>
                        <button type="button" onClick={() => removeSubDetail(l.key, idx)} aria-label={t("accounting.manual.line.removeSubDetail")} title={t("accounting.manual.line.removeSubDetail")} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="pl-[88px] pr-6 pb-2.5">
                      <button type="button" onClick={() => addSubDetail(l.key)} className="h-8 px-2 rounded-lg inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1a5fb4] hover:bg-[#e8f0fb] transition-colors">
                        <Plus size={14} /> {t("accounting.manual.line.addSubDetail")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6 px-6 pt-3 pb-6">
            <button type="button" onClick={addLine} className={`${btn.text} self-start`}>
              <Plus size={16} /> {t("accounting.manual.line.add")}
            </button>
            <div className="w-full md:w-[400px] flex flex-col gap-2.5 pt-2 text-sm">
              <div className="flex justify-between text-[#3d5173]"><span>{t("accounting.monthly.valueBeforeVat")}</span><span className="tabular-nums text-foreground">{money(totals.valueAmount)}</span></div>
              <div className="flex justify-between text-[#3d5173]"><span>{t("accounting.monthly.kpi.vat7")}</span><span className="tabular-nums text-foreground">{money(totals.vatAmount)}</span></div>
              <div className="h-px bg-border my-1" />
              <div className="flex justify-between items-baseline"><span className="font-semibold text-foreground">{t("accounting.monthly.kpi.netTotal")}</span><span className="text-[22px] font-bold tabular-nums text-foreground">฿{money(totals.netTotal)}</span></div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("accounting.manual.section.remarks")}>
          <Field label={t("accounting.manual.field.remarks")} htmlFor="manual-remarks">
            <textarea
              id="manual-remarks"
              value={remarksText}
              onChange={(e) => setRemarksText(e.target.value)}
              rows={4}
              placeholder={t("accounting.manual.field.remarksPlaceholder")}
              className={`${field.textarea} w-full resize-y`}
            />
          </Field>
        </SectionCard>
      </div>
    </div>
  );
}
