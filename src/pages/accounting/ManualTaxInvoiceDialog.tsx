import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Customer } from "../../lib/customers";
import { fetchCustomers } from "../../lib/customers";
import { CustomerSelector } from "../quotation/CustomerSelector";
import { DOC_TYPE_LABELS, issueManualArDocument, type ArDocument } from "../../lib/accounting";
import { ApiError } from "../../lib/apiClient";

interface DraftLine {
  key: number;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
}

const blankLine = (key: number): DraftLine => ({ key, description: "", qty: "1", unit: "", unitPrice: "" });

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

  const handleSubmit = async () => {
    if (!companyName.trim()) { setError("กรุณาระบุชื่อบริษัทลูกค้า"); return; }
    const parsedLines = lines
      .map((l) => ({ description: l.description.trim(), qty: Number(l.qty), unit: l.unit.trim(), unitPrice: Number(l.unitPrice) }))
      .filter((l) => l.description && Number.isFinite(l.qty) && l.qty > 0 && Number.isFinite(l.unitPrice) && l.unitPrice >= 0);
    if (parsedLines.length === 0) { setError("กรุณาระบุรายการอย่างน้อย 1 รายการ (คำอธิบาย จำนวน และราคาต่อหน่วยที่ถูกต้อง)"); return; }

    setBusy(true);
    setError("");
    try {
      const documents = await issueManualArDocument({
        docType,
        customer: { companyName: companyName.trim(), address, taxId, branch, contactName, phone, email },
        paymentType,
        days: paymentType === "Credit" ? Number(days) || null : null,
        lines: parsedLines,
      });
      onIssued(documents);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ออกเอกสารไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            สร้างใบกำกับภาษี (Manual)
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" title="ปิด">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          ออกเอกสารแบบไม่ผูกกับ Scope of Work — ระบบจะออกใบแจ้งหนี้/ใบวางบิล (BI) คู่กันให้อัตโนมัติเหมือนวางบิลตามงานปกติ
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">ประเภทเอกสาร</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as "AR" | "IV")}
              className="w-full h-9 px-2 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
            >
              <option value="AR">{DOC_TYPE_LABELS.AR}</option>
              <option value="IV">{DOC_TYPE_LABELS.IV}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">เงื่อนไขการชำระเงิน</label>
            <div className="flex items-center gap-2">
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as "" | "Cash" | "Credit")}
                className="flex-1 h-9 px-2 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
              >
                <option value="">— ไม่ระบุ —</option>
                <option value="Cash">เงินสด</option>
                <option value="Credit">เครดิต</option>
              </select>
              {paymentType === "Credit" && (
                <input
                  type="number"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  placeholder="วัน"
                  className="w-20 h-9 px-2 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">ลูกค้า (เลือกจากรายชื่อที่บันทึกไว้ หรือพิมพ์เอง)</label>
          <CustomerSelector customers={customers} selectedId={customerId} onSelect={handleSelectCustomer} onClear={handleClearCustomer} disabled={false} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">ชื่อบริษัท *</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">เลขประจำตัวผู้เสียภาษี</label>
            <input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground block mb-1">ที่อยู่</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">สาขา</label>
            <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="สำนักงานใหญ่" className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">ผู้ติดต่อ</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">เบอร์โทร</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">อีเมล</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">รายการ</label>
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.key} className="flex items-center gap-2">
                <input
                  value={l.description}
                  onChange={(e) => updateLine(l.key, { description: e.target.value })}
                  placeholder="รายละเอียด"
                  className="flex-1 h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
                <input
                  type="number"
                  value={l.qty}
                  onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                  placeholder="จำนวน"
                  className="w-20 h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
                <input
                  value={l.unit}
                  onChange={(e) => updateLine(l.key, { unit: e.target.value })}
                  placeholder="หน่วย"
                  className="w-20 h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
                <input
                  type="number"
                  value={l.unitPrice}
                  onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                  placeholder="ราคา/หน่วย"
                  className="w-28 h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
                <button onClick={() => removeLine(l.key)} className="text-muted-foreground hover:text-[#e05252] transition-colors" title="ลบรายการนี้">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button onClick={addLine} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Plus size={13} /> เพิ่มรายการ
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-[#c23f3f]">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">ยกเลิก</button>
          <button
            onClick={() => void handleSubmit()}
            disabled={busy}
            className="px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-50"
          >
            {busy ? "กำลังออกเอกสาร..." : "ออกเอกสาร"}
          </button>
        </div>
      </div>
    </div>
  );
}
