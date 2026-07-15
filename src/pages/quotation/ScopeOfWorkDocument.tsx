import { useEffect, useState } from "react";
import { ChevronRight, Printer, Copy, Save, CheckCircle2, RotateCw, Trash2, Loader2, AlertTriangle } from "lucide-react";
import type { User } from "../../lib/users";
import {
  type ScopeOfWork, type ScopeOfWorkUpdateFields, type ScopeOfWorkSignatory,
  fetchScopeOfWork, updateScopeOfWork, finalizeScopeOfWork, duplicateScopeOfWork,
  refreshScopeOfWorkFromQuotation, deleteScopeOfWork, logScopeOfWorkPrinted, blankScopeOfWorkItem,
} from "../../lib/scopeOfWork";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ScopeOfWorkChecklistGroup } from "./ScopeOfWorkChecklistGroup";
import { ScopeOfWorkItemsEditor } from "./ScopeOfWorkItemsEditor";
import { ScopeOfWorkPrintDocument } from "./ScopeOfWorkPrintDocument";

function toUpdateFields(s: ScopeOfWork): ScopeOfWorkUpdateFields {
  return {
    issueDate: s.issueDate,
    deliveryDate: s.deliveryDate,
    drawingCode: s.drawingCode,
    customerPoNumber: s.customerPoNumber,
    secondaryCode: s.secondaryCode,
    deliveryLocation: s.deliveryLocation,
    shippingContact: s.shippingContact,
    shippingPhone: s.shippingPhone,
    billingContact: s.billingContact,
    billingPhone: s.billingPhone,
    checklistGroups: s.checklistGroups,
    items: s.items,
    paymentConditions: s.paymentConditions,
    remarks: s.remarks,
    seller: s.seller,
    approver: s.approver,
  };
}

function SignatoryEditor({ label, value, onChange, users, disabled }: {
  label: string;
  value: ScopeOfWorkSignatory;
  onChange: (next: ScopeOfWorkSignatory) => void;
  users: User[];
  disabled: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground font-mono mb-1.5">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        <select
          disabled={disabled}
          className="text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none disabled:opacity-60"
          value={value.userId}
          onChange={(e) => {
            const user = users.find((u) => u.id === e.target.value);
            onChange({ ...value, userId: e.target.value, name: user ? user.fullName : value.name });
          }}
        >
          <option value="">— เลือกผู้ใช้งาน (ถ้ามี) —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
        <input
          disabled={disabled}
          className="text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="ชื่อ (พิมพ์เองได้)"
        />
      </div>
      <input
        disabled={disabled}
        type="date"
        className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
        value={value.date}
        onChange={(e) => onChange({ ...value, date: e.target.value })}
      />
    </div>
  );
}

export function ScopeOfWorkDocument({
  scopeOfWorkId,
  users,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  canCreate,
  onBack,
  onDuplicated,
  showToast,
}: {
  scopeOfWorkId: string;
  users: User[];
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
  onBack: () => void;
  onDuplicated: (newId: string) => void;
  showToast: (msg: string) => void;
}) {
  const [scope, setScope] = useState<ScopeOfWork | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"finalize" | "refresh" | "delete" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // `scope`/`loadError` reset to their initial values (null/false) via a fresh mount whenever
  // `scopeOfWorkId` changes — the parent renders this component with `key={scopeOfWorkId}` for
  // exactly this reason (also closes a real correctness hazard: without a remount, switching to a
  // different record before its fetch resolves could leave the OLD record's data on screen and
  // savable against the NEW id). `reloadKey` only exists for the retry-after-error case, where the
  // reset is triggered directly by the retry button's onClick (see below), not synchronously here
  // — calling setState as the first thing an effect does causes an avoidable extra render cascade
  // (react-hooks/set-state-in-effect), same convention as DashboardPage.tsx's retry pattern.
  useEffect(() => {
    let cancelled = false;
    fetchScopeOfWork(scopeOfWorkId)
      .then((s) => { if (!cancelled) setScope(s); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [scopeOfWorkId, reloadKey]);

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={20} className="text-[#e05252]" />
        <p className="text-sm text-muted-foreground">ไม่สามารถโหลดข้อมูล Scope of Work ได้</p>
        <button onClick={() => { setLoadError(false); setReloadKey((k) => k + 1); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
          <RotateCw size={12} /> ลองใหม่
        </button>
      </div>
    );
  }
  if (!scope) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2.5 p-6">
        <Loader2 size={20} className="text-muted-foreground animate-spin" />
        <p className="text-xs text-muted-foreground">กำลังโหลด Scope of Work...</p>
      </div>
    );
  }

  const isDraft = scope.status === "Draft";
  const editable = canEdit && isDraft;
  const updateField = <K extends keyof ScopeOfWork>(field: K, value: ScopeOfWork[K]) => setScope((prev) => (prev ? { ...prev, [field]: value } : prev));

  const save = async () => {
    if (!scope) return;
    try {
      setSaving(true);
      const updated = await updateScopeOfWork(scope.id, toUpdateFields(scope));
      setScope(updated);
      showToast("บันทึกร่างแล้ว");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!scope) return;
    try {
      await logScopeOfWorkPrinted(scope.id);
    } catch {
      // Printing itself must never be blocked by an audit-log write failure — this only logs.
    }
    window.print();
  };

  const handleDuplicate = async () => {
    if (!scope) return;
    try {
      const created = await duplicateScopeOfWork(scope.id);
      showToast(`ทำสำเนาเป็น ${created.scopeNumber} แล้ว`);
      onDuplicated(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ทำสำเนาไม่สำเร็จ");
    }
  };

  const runConfirmedAction = async () => {
    if (!scope || !confirmAction) return;
    try {
      if (confirmAction === "finalize") {
        const updated = await finalizeScopeOfWork(scope.id);
        setScope(updated);
        showToast("ยืนยันสถานะ Final แล้ว");
      } else if (confirmAction === "refresh") {
        const updated = await refreshScopeOfWorkFromQuotation(scope.id);
        setScope(updated);
        showToast("อัปเดตข้อมูลจากใบเสนอราคาแล้ว");
      } else if (confirmAction === "delete") {
        await deleteScopeOfWork(scope.id);
        showToast("ลบ Scope of Work แล้ว");
        onBack();
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setConfirmAction(null);
    }
  };

  const noSourceItems = scope.items.length === 0;

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> กลับไปใบเสนอราคา
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-medium font-mono" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{scope.scopeNumber}</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isDraft ? "bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20" : "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20"}`}>
          {isDraft ? "Draft" : "Final"}
        </span>

        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {canPrint && (
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <Printer size={13} /> พิมพ์ / PDF
            </button>
          )}
          {canCreate && (
            <button onClick={handleDuplicate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <Copy size={13} /> ทำสำเนา
            </button>
          )}
          {editable && (
            <button onClick={() => setConfirmAction("refresh")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <RotateCw size={13} /> อัปเดตข้อมูลจากใบเสนอราคา
            </button>
          )}
          {editable && (
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              <Save size={13} /> บันทึกร่าง
            </button>
          )}
          {canFinalize && isDraft && (
            <button onClick={() => setConfirmAction("finalize")} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#2aa36b] text-white rounded-lg font-semibold hover:bg-[#238f5c] transition-colors">
              <CheckCircle2 size={13} /> ยืนยัน Final
            </button>
          )}
          {canDelete && (
            <button onClick={() => setConfirmAction("delete")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Trash2 size={13} /> ลบ
            </button>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-5 max-w-5xl mx-auto print:p-0 print:max-w-none">
        {/* Header fields */}
        <div className="bg-card border border-border rounded-xl overflow-hidden print:hidden">
          <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5 print:hidden">
            <p className="text-[#c9a84c] text-xl font-bold font-mono tracking-wider">SCOPE OF WORK</p>
            <p className="text-[#a8bed8] text-xs mt-1">
              จากใบเสนอราคา {scope.quotationNumber} — ประเภทงาน {scope.jobTypeCode || "-"} {scope.jobTypeName}
              {scope.quotationSalesperson && ` — พนักงานขาย ${scope.quotationSalesperson}`}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-b border-border">
            <div className="p-6 border-b sm:border-b-0 sm:border-r border-border space-y-2.5">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">ชื่อลูกค้า</label>
                <input readOnly className="w-full text-sm font-medium text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none opacity-80" value={scope.customerSnapshot.companyName} />
              </div>
              {scope.customerSnapshot.contactName && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">ชื่อผู้ติดต่อ (จากใบเสนอราคา)</label>
                  <input readOnly className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none opacity-80" value={scope.customerSnapshot.contactName} />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">รหัสงาน</label>
                <input readOnly className="w-full text-xs font-mono text-[#c9a84c] font-semibold bg-secondary border border-border rounded-lg px-3 py-2 outline-none" value={scope.scopeNumber} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">รหัสอ้างอิงท้ายงาน (ยังต้องยืนยันความหมายทางธุรกิจ)</label>
                <input disabled={!editable} className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.secondaryCode} onChange={(e) => updateField("secondaryCode", e.target.value)} placeholder="เช่น SK" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">รหัส Drawing</label>
                <input disabled={!editable} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.drawingCode} onChange={(e) => updateField("drawingCode", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">สถานที่ส่งของ</label>
                <input disabled={!editable} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.deliveryLocation} onChange={(e) => updateField("deliveryLocation", e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">ชื่อผู้ติดต่อส่งของ</label>
                  <input disabled={!editable} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.shippingContact} onChange={(e) => updateField("shippingContact", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">เบอร์โทรผู้ติดต่อส่งของ</label>
                  <input disabled={!editable} className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.shippingPhone} onChange={(e) => updateField("shippingPhone", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">ชื่อผู้ติดต่อวางบิล</label>
                  <input disabled={!editable} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.billingContact} onChange={(e) => updateField("billingContact", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">เบอร์โทรผู้ติดต่อวางบิล</label>
                  <input disabled={!editable} className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.billingPhone} onChange={(e) => updateField("billingPhone", e.target.value)} />
                </div>
              </div>
            </div>
            <div className="p-6 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">วันที่</label>
                  <input disabled={!editable} type="date" className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.issueDate} onChange={(e) => updateField("issueDate", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">วันที่ส่งของ/ส่งแบบอนุมัติ</label>
                  <input disabled={!editable} type="date" className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.deliveryDate} onChange={(e) => updateField("deliveryDate", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">เอกสารใบสั่งซื้อเลขที่ (PO)</label>
                <input disabled={!editable} className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.customerPoNumber} onChange={(e) => updateField("customerPoNumber", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">ใบเสนอราคา</label>
                <input readOnly className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none opacity-80" value={scope.quotationNumber} />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed pt-2">
                ข้อมูลลูกค้า/รายการ/ประเภทงาน ถูกดึงมาจากใบเสนอราคาต้นทางโดยอัตโนมัติเมื่อสร้าง Scope of Work นี้ครั้งแรก
                หากใบเสนอราคามีการแก้ไขภายหลัง ใช้ปุ่ม "อัปเดตข้อมูลจากใบเสนอราคา" เพื่อดึงข้อมูลล่าสุดมาแทนที่ (ระบบจะแจ้งเตือนก่อนเขียนทับ)
              </p>
            </div>
          </div>
        </div>

        {/* Checklist groups */}
        <div className="bg-card border border-border rounded-xl p-5 print:hidden">
          <p className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>เช็คลิสต์เงื่อนไขงาน</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {scope.checklistGroups.map((group, idx) => (
              <ScopeOfWorkChecklistGroup
                key={group.key}
                group={group}
                disabled={!editable}
                onChange={(next) => {
                  const groups = [...scope.checklistGroups];
                  groups[idx] = next;
                  updateField("checklistGroups", groups);
                }}
              />
            ))}
          </div>
        </div>

        {noSourceItems && (
          <div className="bg-[#e08a3c]/10 border border-[#e08a3c]/30 rounded-xl p-4 flex items-start gap-3 print:hidden">
            <AlertTriangle size={16} className="text-[#e08a3c] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-foreground font-medium">ใบเสนอราคานี้ยังไม่มีรายการสินค้า/งานสำหรับสร้าง Scope of Work</p>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={onBack} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">กลับไปแก้ไขใบเสนอราคา</button>
                {editable && (
                  <button onClick={() => updateField("items", [blankScopeOfWorkItem()])} className="px-3 py-1.5 text-xs bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium">
                    เพิ่มรายการใน Scope of Work ด้วยตนเอง
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <ScopeOfWorkItemsEditor items={scope.items} onChange={(items) => updateField("items", items)} disabled={!editable} />

        {/* Payment conditions */}
        <div className="bg-card border border-border rounded-xl p-5 print:hidden">
          <p className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>เงื่อนไขการชำระเงิน</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">เงินมัดจำ (%)</label>
              <input disabled={!editable} type="number" min={0} max={100} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.paymentConditions.downPaymentPct ?? ""} onChange={(e) => updateField("paymentConditions", { ...scope.paymentConditions, downPaymentPct: e.target.value === "" ? null : parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">ชำระส่วนที่เหลือ (%)</label>
              <input disabled={!editable} type="number" min={0} max={100} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.paymentConditions.finalPaymentPct ?? ""} onChange={(e) => updateField("paymentConditions", { ...scope.paymentConditions, finalPaymentPct: e.target.value === "" ? null : parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">วิธีการชำระเงิน</label>
              <input disabled={!editable} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.paymentConditions.method} onChange={(e) => updateField("paymentConditions", { ...scope.paymentConditions, method: e.target.value })} placeholder="เช่น Cash, Credit" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">รายละเอียดการชำระเงิน</label>
              <textarea disabled={!editable} rows={3} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed disabled:opacity-60" value={scope.paymentConditions.description} onChange={(e) => updateField("paymentConditions", { ...scope.paymentConditions, description: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">หมายเหตุการชำระเงิน</label>
              <textarea disabled={!editable} rows={2} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed disabled:opacity-60" value={scope.paymentConditions.notes} onChange={(e) => updateField("paymentConditions", { ...scope.paymentConditions, notes: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Remarks + Signatures */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:hidden">
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>หมายเหตุ</p>
            <textarea disabled={!editable} rows={5} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed disabled:opacity-60" value={scope.remarks} onChange={(e) => updateField("remarks", e.target.value)} />
          </div>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <p className="text-xs font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>ผู้ขาย / ผู้อนุมัติ</p>
            <SignatoryEditor label="ผู้ขาย" value={scope.seller} onChange={(v) => updateField("seller", v)} users={users} disabled={!editable} />
            <SignatoryEditor label="ผู้อนุมัติ" value={scope.approver} onChange={(v) => updateField("approver", v)} users={users} disabled={!editable} />
          </div>
        </div>

        <ScopeOfWorkPrintDocument
          scopeOfWork={scope}
          sellerUser={users.find((u) => u.id === scope.seller.userId)}
          approverUser={users.find((u) => u.id === scope.approver.userId)}
        />
      </div>

      <ConfirmDialog
        open={confirmAction === "finalize"}
        title="ยืนยันสถานะ Final"
        message="เมื่อยืนยันแล้ว Scope of Work นี้จะไม่สามารถแก้ไขได้อีก (ใช้ทำสำเนาหากต้องการแก้ไขต่อ) ยืนยันหรือไม่?"
        confirmLabel="ยืนยัน Final"
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "refresh"}
        title="อัปเดตข้อมูลจากใบเสนอราคา"
        message="การอัปเดตจะเขียนทับข้อมูลลูกค้า/รายการ/หมายเหตุ ที่ดึงมาจากใบเสนอราคา ด้วยข้อมูลล่าสุด ส่วนข้อมูลที่กรอกเพิ่มเอง (เช่น ผู้ติดต่อส่งของ/วางบิล เช็คลิสต์ เงื่อนไขการชำระเงิน) จะไม่ถูกแก้ไข ยืนยันหรือไม่?"
        confirmLabel="อัปเดตข้อมูล"
        danger
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        title="ลบ Scope of Work"
        message={`ยืนยันการลบ Scope of Work ${scope.scopeNumber}? รายการนี้จะถูกซ่อนจากหน้ารายการ ปัจจุบันยังไม่มีช่องทางกู้คืนผ่านหน้าจอ`}
        confirmLabel="ลบ"
        danger
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
