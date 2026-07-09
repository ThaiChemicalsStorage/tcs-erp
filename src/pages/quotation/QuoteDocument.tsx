import { useState } from "react";
import {
  ChevronRight, Printer, Copy, Save, Send, CheckCircle2, Building2, Hash, CalendarDays,
  ThumbsUp, ThumbsDown, Trophy, Frown, Ban, XCircle, History,
} from "lucide-react";
import type { Company } from "../../lib/storage";
import type { Product, ProductCategory } from "../../lib/products";
import type { User } from "../../lib/users";
import {
  type Quote, type QuoteStatus, type QuoteInterest, type QuoteLine, type QuoteDraftFields, type ApprovalAction, type QuotePermissions,
  statusIcon, statusStyle, computeTotals, todayIso, plusDaysIso, paymentTermsOptions, approvalActionLabel,
} from "../../lib/quotes";
import { InterestButtons } from "./InterestButtons";
import { LineItemsEditor } from "./LineItemsEditor";
import { PrintDocument } from "./PrintDocument";

const DEFAULT_TERMS = "1. ราคานี้ยังไม่รวมค่าขนส่งและค่าติดตั้ง\n2. ราคามีผลภายใน 30 วันนับจากวันที่ในเอกสาร\n3. การส่งมอบภายใน 45 วันทำการหลังได้รับ PO\n4. การชำระเงินมัดจำ 30% ก่อนเริ่มผลิต";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

const ACTION_ICON: Record<ApprovalAction, React.ReactNode> = {
  submitted: <Send size={13} />,
  approved: <ThumbsUp size={13} />,
  rejected: <ThumbsDown size={13} />,
  sent_to_customer: <Send size={13} />,
  customer_accepted: <CheckCircle2 size={13} />,
  customer_rejected: <XCircle size={13} />,
  marked_won: <Trophy size={13} />,
  marked_lost: <Frown size={13} />,
  cancelled: <Ban size={13} />,
};

export function QuoteDocument({
  mode,
  quote,
  nextId,
  company,
  currentUser,
  users,
  products,
  categories,
  permissions,
  onBack,
  onSave,
  onDuplicate,
  onInterestChange,
  onWorkflowAction,
  showToast,
}: {
  mode: "new" | "detail";
  quote?: Quote;
  nextId: string;
  company: Company;
  currentUser: User;
  users: User[];
  products: Product[];
  categories: ProductCategory[];
  permissions: QuotePermissions;
  onBack: () => void;
  onSave: (data: QuoteDraftFields) => void;
  onDuplicate: () => void;
  onInterestChange: (v: QuoteInterest) => void;
  onWorkflowAction: (action: ApprovalAction, comment: string) => void;
  showToast: (msg: string) => void;
}) {
  const isDetail = mode === "detail" && !!quote;

  const [client, setClient] = useState(quote?.client ?? "เมอริเดียน คอร์ป");
  // Derived, not local state: the component doesn't remount on a workflow-driven status change
  // (same `key`, since selectedId is unchanged), so this must always reflect the live prop.
  const quoteStatus: QuoteStatus = quote?.status ?? "ร่าง";
  const [lines, setLines] = useState<QuoteLine[]>(quote?.lines ?? []);
  const [discount, setDiscount] = useState(quote?.discount ?? 0);
  const [salesperson, setSalesperson] = useState(quote?.salesperson ?? currentUser.fullName);
  const [contactName, setContactName] = useState(quote?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(quote?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(quote?.contactEmail ?? "");
  const [address, setAddress] = useState(quote?.address ?? "");
  const [taxId, setTaxId] = useState(quote?.taxId ?? "");
  const [deliveryMethod, setDeliveryMethod] = useState(quote?.deliveryMethod ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(quote?.deliveryAddress ?? "");
  const [project, setProject] = useState(quote?.project ?? "");
  const [poRef, setPoRef] = useState(quote?.poRef ?? "");
  const [paymentTerms, setPaymentTerms] = useState(quote?.paymentTerms ?? paymentTermsOptions[0]);
  const [issueDate, setIssueDate] = useState(quote?.issueDate ?? todayIso());
  const [expiryDate, setExpiryDate] = useState(quote?.expiryDate ?? plusDaysIso(30));
  const [remarks, setRemarks] = useState(quote?.remarks ?? (company.termsAndConditions || DEFAULT_TERMS));

  const [pendingAction, setPendingAction] = useState<ApprovalAction | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionError, setActionError] = useState("");

  const { total } = computeTotals(lines, discount);
  const disabled = !permissions.canEdit;

  const save = (message: string) => {
    onSave({
      client, status: quoteStatus, lines, discount, amount: total,
      salesperson, contactName, contactPhone, contactEmail, address, taxId,
      deliveryMethod, deliveryAddress, project, poRef, paymentTerms, issueDate, expiryDate, remarks,
    });
    showToast(message);
  };

  const commentRequired = pendingAction === "rejected" || pendingAction === "customer_rejected" || pendingAction === "cancelled";
  const openAction = (a: ApprovalAction) => { setPendingAction(a); setActionComment(""); setActionError(""); };
  const confirmAction = () => {
    if (!pendingAction) return;
    if (commentRequired && !actionComment.trim()) { setActionError("กรุณาระบุเหตุผล"); return; }
    onWorkflowAction(pendingAction, actionComment.trim());
    setPendingAction(null);
  };

  // Signature integration: preparer = quote creator (or current user for a brand-new quote); approver = whoever most recently approved.
  const preparerUser = isDetail
    ? users.find((u) => u.id === quote!.createdByUserId)
    : currentUser;
  const lastApprovalEntry = isDetail ? [...quote!.approvalHistory].reverse().find((e) => e.action === "approved") : undefined;
  const approverUser = lastApprovalEntry ? users.find((u) => u.id === lastApprovalEntry.userId) : undefined;
  const preparerDate = isDetail ? quote!.date : fmtDate(todayIso());
  const approverDate = lastApprovalEntry ? fmtDate(lastApprovalEntry.createdAt) : "";

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> ใบเสนอราคา
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-medium" style={{ fontFamily: "'Playfair Display', serif" }}>
          {isDetail ? quote!.id : "สร้างใหม่"}
        </span>

        {isDetail && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[quoteStatus]}`}>
            {statusIcon[quoteStatus]} {quoteStatus}
          </span>
        )}

        {isDetail && (
          <div className="flex items-center gap-2 ml-1 pl-3 border-l border-border">
            <span className="text-xs text-muted-foreground">ความสนใจ:</span>
            <InterestButtons value={quote!.interest} onChange={onInterestChange} />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <Printer size={13} /> พิมพ์ / PDF
          </button>
          {isDetail && (
            <button onClick={onDuplicate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <Copy size={13} /> คัดลอก
            </button>
          )}
          {!disabled && (
            <button onClick={() => save(mode === "new" ? "บันทึกร่างเรียบร้อยแล้ว" : "บันทึกใบเสนอราคาเรียบร้อยแล้ว")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <Save size={13} /> {mode === "new" ? "บันทึกร่าง" : "บันทึก"}
            </button>
          )}

          {permissions.canSubmit && (
            <button onClick={() => openAction("submitted")} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              <Send size={13} /> ส่งขออนุมัติ
            </button>
          )}
          {permissions.canApprove && (
            <button onClick={() => openAction("approved")} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#2aa36b] text-white rounded-lg font-semibold hover:bg-[#238f5c] transition-colors">
              <ThumbsUp size={13} /> อนุมัติ
            </button>
          )}
          {permissions.canReject && (
            <button onClick={() => openAction("rejected")} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#e05252] text-white rounded-lg font-semibold hover:bg-[#c94444] transition-colors">
              <ThumbsDown size={13} /> ปฏิเสธ
            </button>
          )}
          {permissions.canSendToCustomer && (
            <button onClick={() => openAction("sent_to_customer")} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#3b6fc9] text-white rounded-lg font-semibold hover:bg-[#2f5aa3] transition-colors">
              <Send size={13} /> ส่งให้ลูกค้า
            </button>
          )}
          {permissions.canMarkCustomerAccepted && (
            <button onClick={() => openAction("customer_accepted")} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#1f9d8a] text-white rounded-lg font-semibold hover:bg-[#188577] transition-colors">
              <CheckCircle2 size={13} /> ลูกค้ายอมรับ
            </button>
          )}
          {permissions.canMarkCustomerRejected && (
            <button onClick={() => openAction("customer_rejected")} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#e08a3c] text-white rounded-lg font-semibold hover:bg-[#c97627] transition-colors">
              <XCircle size={13} /> ลูกค้าปฏิเสธ
            </button>
          )}
          {permissions.canMarkWon && (
            <button onClick={() => openAction("marked_won")} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#157347] text-white rounded-lg font-semibold hover:bg-[#125f3b] transition-colors">
              <Trophy size={13} /> ปิดการขายสำเร็จ
            </button>
          )}
          {permissions.canMarkLost && (
            <button onClick={() => openAction("marked_lost")} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#8a94a6] text-white rounded-lg font-semibold hover:bg-[#767f90] transition-colors">
              <Frown size={13} /> ปิดการขายไม่สำเร็จ
            </button>
          )}
          {permissions.canCancel && (
            <button onClick={() => openAction("cancelled")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Ban size={13} /> ยกเลิก
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5 max-w-5xl mx-auto print:p-0 print:max-w-none">
        {/* Document header band */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-[#0b1d3a] px-7 py-5 flex items-start justify-between print:hidden">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                {company.logoDataUrl ? (
                  <img src={company.logoDataUrl} alt={company.name} className="h-8 max-w-[140px] object-contain" />
                ) : (
                  <>
                    <div className="w-7 h-7 rounded-md bg-[#c9a84c] flex items-center justify-center">
                      <span className="text-[#0b1d3a] text-xs font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>ท</span>
                    </div>
                    <span className="text-white text-base font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>TCS ERP</span>
                  </>
                )}
              </div>
              <p className="text-[#a8bed8] text-xs mt-1">{company.name} · {company.address}</p>
              <p className="text-[#a8bed8] text-xs">โทร: {company.phone} · อีเมล: {company.email}</p>
            </div>
            <div className="text-right">
              <p className="text-[#c9a84c] text-xl font-bold font-mono tracking-wider">ใบเสนอราคา</p>
              <p className="text-[#a8bed8] text-xs font-mono mt-1">QUOTATION</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#c9a84c]/20 text-[#c9a84c] border border-[#c9a84c]/30">
                {statusIcon[quoteStatus]}
                {quoteStatus}
              </div>
            </div>
          </div>

          {/* Meta fields — editable on screen */}
          <div className="grid grid-cols-2 gap-0 border-b border-border print:hidden">
            <div className="p-6 border-r border-border">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5"><Building2 size={10} /> ข้อมูลลูกค้า</p>
              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">ชื่อลูกค้า / บริษัท</label>
                  <input disabled={disabled} className="w-full text-sm font-medium text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={client} onChange={(e) => setClient(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">ผู้ติดต่อ</label>
                    <input disabled={disabled} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="ชื่อผู้ติดต่อ" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">เบอร์โทร</label>
                    <input disabled={disabled} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="0XX-XXX-XXXX" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">E-mail ผู้ติดต่อ</label>
                  <input disabled={disabled} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="name@company.com" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">ที่อยู่</label>
                  <input disabled={disabled} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ที่อยู่ลูกค้า" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">เลขประจำตัวผู้เสียภาษี</label>
                  <input disabled={disabled} className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">วิธีจัดส่ง</label>
                    <input disabled={disabled} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} placeholder="เช่น จัดส่งทางรถขนส่ง" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">โครงการ</label>
                    <input disabled={disabled} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={project} onChange={(e) => setProject(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">ที่อยู่จัดส่ง</label>
                  <input disabled={disabled} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="หากต่างจากที่อยู่ลูกค้า" />
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5"><Hash size={10} /> รายละเอียดเอกสาร</p>
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">เลขที่ใบเสนอราคา</label>
                    <input readOnly className="w-full text-xs font-mono text-[#c9a84c] font-semibold bg-secondary border border-border rounded-lg px-3 py-2 outline-none" value={isDetail ? quote!.id : nextId} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">อ้างอิง PO</label>
                    <input disabled={disabled} className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={poRef} onChange={(e) => setPoRef(e.target.value)} placeholder="เลขที่ PO ของลูกค้า" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1 flex items-center gap-1"><CalendarDays size={9} /> วันที่ออกเอกสาร</label>
                    <input disabled={disabled} type="date" className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1 flex items-center gap-1"><CalendarDays size={9} /> วันหมดอายุ</label>
                    <input disabled={disabled} type="date" className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">พนักงานขาย</label>
                  <input disabled={disabled} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={salesperson} onChange={(e) => setSalesperson(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">เงื่อนไขการชำระเงิน</label>
                  <select disabled={disabled} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none disabled:opacity-60" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                    {paymentTermsOptions.map((opt) => <option key={opt}>{opt}</option>)}
                  </select>
                </div>
                {isDetail && (
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">ระดับความสนใจของลูกค้า</label>
                    <InterestButtons value={quote!.interest} onChange={onInterestChange} />
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        <LineItemsEditor lines={lines} onChange={setLines} discount={discount} onDiscountChange={setDiscount} products={products} categories={categories} />

        {/* Remarks + Signature — screen preview only; print output is PrintDocument below */}
        <div className="grid grid-cols-2 gap-4 print:hidden">
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>หมายเหตุ / เงื่อนไข</p>
            <textarea rows={5} disabled={disabled} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed disabled:opacity-60"
              value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>ลายมือชื่อผู้มีอำนาจ</p>
            <div className="space-y-3">
              {(["ผู้เสนอราคา", "ผู้อนุมัติ"] as const).map((role) => {
                const isPreparer = role === "ผู้เสนอราคา";
                const signatureUser = isPreparer ? preparerUser : approverUser;
                const printedName = isPreparer ? (preparerUser?.fullName ?? salesperson) : (approverUser?.fullName ?? "");
                const printedDate = isPreparer ? preparerDate : approverDate;
                return (
                  <div key={role}>
                    <p className="text-[10px] text-muted-foreground font-mono mb-1">{role}</p>
                    <div className="h-14 border border-dashed border-border rounded-lg bg-muted/30 flex items-end justify-between px-3 pb-2 relative">
                      {signatureUser?.signatureDataUrl ? (
                        <img src={signatureUser.signatureDataUrl} alt={`ลายเซ็น ${printedName}`} className="absolute left-2 bottom-2 h-9 max-w-[65%] object-contain pointer-events-none" />
                      ) : (
                        <div className="w-full border-b border-border/60" />
                      )}
                      {!isPreparer && company.stampDataUrl && (
                        <img src={company.stampDataUrl} alt="ตราประทับ" className="absolute right-2 top-1 h-12 w-12 object-contain opacity-80 pointer-events-none" />
                      )}
                    </div>
                    <div className="flex justify-between mt-1">
                      <p className="text-[10px] text-muted-foreground font-mono">ชื่อ: {printedName || "................................"}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">วันที่: {printedDate || "..............."}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Approval history */}
        {isDetail && quote!.approvalHistory.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 print:hidden">
            <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', serif" }}>
              <History size={13} /> ประวัติการอนุมัติ
            </p>
            <div className="space-y-2.5">
              {[...quote!.approvalHistory].reverse().map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-xs">
                  <div className="w-6 h-6 rounded-lg bg-[#c9a84c]/10 text-[#c9a84c] flex items-center justify-center flex-shrink-0 mt-0.5">
                    {ACTION_ICON[entry.action]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground">
                      <span className="font-semibold">{entry.userName}</span>
                      <span className="text-muted-foreground"> ({entry.roleName}) — {approvalActionLabel[entry.action]}</span>
                    </p>
                    {entry.comment && <p className="text-muted-foreground mt-0.5">"{entry.comment}"</p>}
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{new Date(entry.createdAt).toLocaleString("th-TH")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[#0b1d3a]/5 border border-[#0b1d3a]/10 rounded-xl p-4 flex items-start gap-3 print:hidden">
          <div className="w-5 h-5 rounded-full bg-[#c9a84c]/20 flex items-center justify-center flex-shrink-0 mt-0.5"><CheckCircle2 size={11} className="text-[#c9a84c]" /></div>
          <p className="text-xs text-muted-foreground leading-relaxed">เอกสารนี้ออกโดยระบบ TCS ERP · ใบเสนอราคาฉบับนี้ไม่ถือเป็นสัญญาผูกพันจนกว่าจะได้รับการยืนยันเป็นลายลักษณ์อักษรจากทั้งสองฝ่าย · สอบถามข้อมูลเพิ่มเติม: info@tcs-erp.co.th หรือ [เบอร์โทรศัพท์]</p>
        </div>

        <PrintDocument
          isDetail={isDetail}
          quote={quote}
          nextId={nextId}
          company={company}
          client={client}
          contactName={contactName}
          contactPhone={contactPhone}
          contactEmail={contactEmail}
          address={address}
          taxId={taxId}
          deliveryMethod={deliveryMethod}
          deliveryAddress={deliveryAddress}
          project={project}
          poRef={poRef}
          paymentTerms={paymentTerms}
          issueDate={issueDate}
          expiryDate={expiryDate}
          lines={lines}
          discount={discount}
          remarks={remarks}
          preparerUser={preparerUser}
          approverUser={approverUser}
          preparerName={preparerUser?.fullName ?? salesperson}
          preparerDate={preparerDate}
          approverName={approverUser?.fullName ?? ""}
          approverDate={approverDate}
        />
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={() => setPendingAction(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5">
            <p className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>{approvalActionLabel[pendingAction]}</p>
            <p className="text-xs text-muted-foreground mb-4">ใบเสนอราคา {isDetail ? quote!.id : ""} — {client}</p>
            <label className="text-xs text-muted-foreground block mb-1.5">
              ความคิดเห็น {commentRequired ? "(จำเป็น — ระบุเหตุผล)" : "(ไม่บังคับ)"}
            </label>
            <textarea
              rows={3}
              className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none"
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
            />
            {actionError && <p className="text-xs text-[#e05252] mt-1.5">{actionError}</p>}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setPendingAction(null)} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">ยกเลิก</button>
              <button
                onClick={confirmAction}
                className={`px-3.5 py-1.5 text-xs rounded-lg font-semibold transition-colors ${commentRequired ? "bg-[#e05252] text-white hover:bg-[#c94444]" : "bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040]"}`}
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
