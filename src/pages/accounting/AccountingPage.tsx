import { useEffect, useMemo, useState } from "react";
import { FileText, Receipt, ClipboardCheck, ChevronLeft, Loader2, Upload, Printer, CheckCircle2, AlertTriangle } from "lucide-react";
import { fetchAllScopeOfWorks, fetchScopeOfWork, type ScopeOfWorkListItem, type ScopeOfWork } from "../../lib/scopeOfWork";
import {
  openArMilestone, updateArMilestone, uploadArAttachment, issueArDocuments, issueArReceipt,
  fetchArDocuments, fetchArDocument,
  AR_CHECKLIST_LABELS, BILLING_STATUS_LABELS, WORK_CLASSIFICATION_LABELS, DOC_TYPE_LABELS,
  type ArMilestone, type ArDocument, type ArChecklistKey, type ArWorkClassification, type ArBillingStatus,
} from "../../lib/accounting";
import { EmptyState } from "../../components/EmptyState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { ArDocumentPrintDocument, type ArPaidByInvoiceId } from "./ArDocumentPrintDocument";

// หน้าบัญชีลูกหนี้ (Accounts Receivable) — งวดที่ 1: เลือกงาน (Scope of Work) แล้ววางบิลตามงวดงาน
// Accounts Receivable page — Phase 1: pick a job (Scope of Work), then bill it milestone by milestone.
// See docs/MODULES/Accounting.md for the full design writeup and the Phase 1/Phase 2 boundary.
export function AccountingPage({
  canCreate, canIssue,
}: {
  canCreate: boolean;
  canIssue: boolean;
}) {
  const [view, setView] = useState<"list" | "detail">("list");
  const [scopeOfWorks, setScopeOfWorks] = useState<ScopeOfWorkListItem[]>([]);
  // เลขที่บิลมัดจำ (AR) ที่ยังใช้งาน ต่อ Scope of Work — ใช้แจ้งเตือนในทุกงานว่าออกบิลมัดจำแล้วหรือยัง
  // ตามที่บัญชีขอไว้ ("ให้มีการแจ้งเตือนทุกครั้งว่างานนั้นๆ มีการออกบิลมัดจำไปแล้วหรือยัง")
  const [depositDocByScope, setDepositDocByScope] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAllScopeOfWorks(), fetchArDocuments({ docType: "AR", status: "issued" })])
      .then(([list, depositDocs]) => {
        if (cancelled) return;
        setScopeOfWorks(list);
        setDepositDocByScope(Object.fromEntries(depositDocs.map((d) => [d.scopeOfWorkId, d.docNo])));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openScope = (id: string) => { setSelectedId(id); setView("detail"); };
  const backToList = () => setView("list");

  if (view === "detail" && selectedId) {
    return (
      <>
        <ScopeBillingDetail scopeOfWorkId={selectedId} canCreate={canCreate} canIssue={canIssue} onBack={backToList} showToast={toast.show} />
        <Toast message={toast.message} />
      </>
    );
  }

  const filtered = scopeOfWorks.filter((s) =>
    !search.trim()
    || s.scopeNumber.toLowerCase().includes(search.toLowerCase())
    || s.customerName.toLowerCase().includes(search.toLowerCase())
    || s.quotationNumber.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>วางบิลตามงาน</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">เลือกงาน (Scope of Work) เพื่อดูงวดการชำระเงินและออกเอกสารบัญชี</p>
      </div>

      <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-full max-w-md">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาเลขที่งาน / ลูกค้า / เลขที่ใบเสนอราคา"
          className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : loadError ? (
        <div className="text-sm text-muted-foreground">โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="ไม่พบงาน" description="ยังไม่มี Scope of Work ในระบบ หรือไม่พบรายการที่ค้นหา" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-4 py-2.5">เลขที่งาน</th>
                <th className="text-left px-4 py-2.5">ลูกค้า</th>
                <th className="text-left px-4 py-2.5">ใบเสนอราคา</th>
                <th className="text-left px-4 py-2.5">บิลมัดจำ</th>
                <th className="text-left px-4 py-2.5">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openScope(s.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openScope(s.id); } }}
                  className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-foreground">{s.scopeNumber}</td>
                  <td className="px-4 py-3 text-foreground">{s.customerName}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{s.quotationNumber}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {depositDocByScope[s.id] ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20">
                        <CheckCircle2 size={12} /> {depositDocByScope[s.id]}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20">
                        <AlertTriangle size={12} /> ยังไม่ออก
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CHECKLIST_KEYS_FOR: Record<ArWorkClassification, ArChecklistKey[]> = {
  goods: ["poCopy", "deliveryNote"],
  service: ["poCopy", "deliveryNote", "report", "stampDuty", "whtEnvelope"],
  contract: ["poCopy", "deliveryNote", "stampDuty", "bankGuarantee"],
};

function ScopeBillingDetail({
  scopeOfWorkId, canCreate, canIssue, onBack, showToast,
}: {
  scopeOfWorkId: string;
  canCreate: boolean;
  canIssue: boolean;
  onBack: () => void;
  showToast: (msg: string) => void;
}) {
  const [scope, setScope] = useState<ScopeOfWork | null>(null);
  const [documents, setDocuments] = useState<ArDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMilestoneId, setOpenMilestoneId] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<ArMilestone | null>(null);
  const [milestoneLoading, setMilestoneLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [printDoc, setPrintDoc] = useState<ArDocument | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<ArDocument | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);

  // ยอดชำระแล้วต่อใบกำกับภาษี — สำหรับพิมพ์ใบแจ้งหนี้/ใบวางบิล (คอลัมน์ชำระแล้ว/เงินคงค้าง)
  const paidByInvoiceId: ArPaidByInvoiceId = useMemo(() => {
    const map: ArPaidByInvoiceId = {};
    for (const d of documents) {
      if (d.docType !== "RE" || d.status !== "issued") continue;
      for (const line of d.lines) {
        if (line.linkedArDocumentId) map[line.linkedArDocumentId] = d.netTotal;
      }
    }
    return map;
  }, [documents]);

  useEffect(() => {
    if (!printDoc) return;
    const reset = () => setPrintDoc(null);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [printDoc]);

  const handlePrint = async (id: string) => {
    try {
      const doc = await fetchArDocument(id);
      setPrintDoc(doc);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "เปิดเอกสารไม่สำเร็จ");
    }
  };

  // Reusable reload — used after issuing documents (see handleIssue). Not passed directly to
  // useEffect below: it calls setLoading(true) synchronously, which the mount effect avoids by
  // fetching inline instead (loading already starts true via useState) — same pattern
  // ScopeOfWorkPage.tsx's loadList()/mount-effect split already uses.
  const reload = () => {
    setLoading(true);
    Promise.all([fetchScopeOfWork(scopeOfWorkId), fetchArDocuments({ scopeOfWorkId })])
      .then(([s, docs]) => { setScope(s); setDocuments(docs); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchScopeOfWork(scopeOfWorkId), fetchArDocuments({ scopeOfWorkId })])
      .then(([s, docs]) => { if (!cancelled) { setScope(s); setDocuments(docs); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scopeOfWorkId]);

  const openInstallment = async (installmentId: string) => {
    setOpenMilestoneId(installmentId);
    setMilestoneLoading(true);
    try {
      const m = await openArMilestone(scopeOfWorkId, installmentId);
      setMilestone(m);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "เปิดงวดบิลไม่สำเร็จ");
      setOpenMilestoneId(null);
    } finally {
      setMilestoneLoading(false);
    }
  };

  const patchMilestone = async (fields: Partial<Pick<ArMilestone, "workClassification" | "retentionPct" | "checklistState">>) => {
    if (!milestone) return;
    try {
      const updated = await updateArMilestone(milestone.id, fields);
      setMilestone(updated);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    }
  };

  const toggleChecklist = (key: ArChecklistKey) => {
    if (!milestone) return;
    const next = { ...milestone.checklistState, [key]: !milestone.checklistState[key] };
    void patchMilestone({ checklistState: next });
  };

  const handleFileUpload = async (key: ArChecklistKey, file: File) => {
    if (!milestone) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const dataBase64 = dataUrl.split(",")[1] ?? "";
      try {
        const updated = await uploadArAttachment(milestone.id, key, { fileName: file.name, contentType: file.type, dataBase64 });
        setMilestone(updated);
        showToast("แนบไฟล์แล้ว");
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "แนบไฟล์ไม่สำเร็จ");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleIssueReceipt = async () => {
    if (!receiptTarget || receiptBusy) return;
    setReceiptBusy(true);
    try {
      const re = await issueArReceipt(receiptTarget.id);
      showToast(`ออกใบเสร็จรับเงิน ${re.docNo} แล้ว`);
      setReceiptTarget(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ออกใบเสร็จไม่สำเร็จ");
    } finally {
      setReceiptBusy(false);
    }
  };

  const handleIssue = async () => {
    if (!milestone || issuing) return;
    setIssuing(true);
    try {
      const docs = await issueArDocuments(milestone.id);
      showToast(`ออกเอกสาร ${docs.map((d) => d.docNo).join(", ")} แล้ว`);
      setOpenMilestoneId(null);
      setMilestone(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ออกเอกสารไม่สำเร็จ");
    } finally {
      setIssuing(false);
    }
  };

  if (loading || !scope) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Loader2 className="animate-spin text-muted-foreground" size={20} />
      </div>
    );
  }

  const requiredKeys = milestone ? CHECKLIST_KEYS_FOR[milestone.workClassification] : [];
  const alwaysRequired: ArChecklistKey[] = ["poCopy", "deliveryNote"];
  const checklistOk = alwaysRequired.every((k) => milestone?.checklistState[k] === true);

  return (
    <>
    {/* ส่วนแสดงผลบนหน้าจอทั้งหมดต้องซ่อนตอนพิมพ์ — เอกสารพิมพ์ (ArDocumentPrintDocument ด้านล่าง)
        ต้องเป็นสิ่งเดียวที่ออกกระดาษ (pattern เดียวกับ DeliveryOrderDocument's print:hidden blocks) */}
    <div className="flex-1 flex flex-col overflow-y-auto p-6 gap-5 print:hidden">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ChevronLeft size={16} /> กลับไปรายการงาน
      </button>

      <div>
        <h1 className="text-xl font-semibold text-foreground font-mono">{scope.scopeNumber}</h1>
        <p className="text-sm text-muted-foreground mt-1">{scope.customerSnapshot.companyName} · {scope.quotationNumber}</p>
      </div>

      {/* แจ้งเตือนสถานะบิลมัดจำของงานนี้ทุกครั้งที่เปิดดู — ตามที่บัญชีขอไว้ */}
      {(() => {
        const depositDoc = documents.find((d) => d.docType === "AR" && d.status === "issued");
        return depositDoc ? (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#2aa36b]/10 border border-[#2aa36b]/20 text-sm text-[#207e52]">
            <CheckCircle2 size={15} className="flex-shrink-0" />
            งานนี้ออกบิลมัดจำแล้ว — {depositDoc.docNo} ยอด ฿{depositDoc.netTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#e08a3c]/10 border border-[#e08a3c]/20 text-sm text-[#a75d1a]">
            <AlertTriangle size={15} className="flex-shrink-0" />
            งานนี้ยังไม่ได้ออกบิลมัดจำ
          </div>
        );
      })()}

      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">งวดการชำระเงิน</h2>
        <div className="space-y-2">
          {scope.paymentConditions.installments.map((inst) => (
            <div key={inst.id} className="border border-border/60 rounded-lg p-3">
              <button
                onClick={() => openInstallment(inst.id)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{inst.label} — {inst.pct ?? "-"}%</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{inst.paymentType}{inst.days ? ` ${inst.days} วัน` : ""}</p>
                </div>
                {openMilestoneId === inst.id && milestoneLoading && <Loader2 className="animate-spin text-muted-foreground" size={16} />}
              </button>

              {openMilestoneId === inst.id && milestone && (
                <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">สถานะ:</span>
                    <StatusPill status={milestone.billingStatus} />
                  </div>

                  {milestone.billingStatus === "not_billed" ? (
                    <>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-muted-foreground">ประเภทงาน</label>
                        <select
                          value={milestone.workClassification}
                          disabled={!canCreate}
                          onChange={(e) => patchMilestone({ workClassification: e.target.value as ArWorkClassification })}
                          className="bg-secondary border border-border rounded-lg px-2 py-1 text-xs"
                        >
                          {(Object.keys(WORK_CLASSIFICATION_LABELS) as ArWorkClassification[]).map((k) => (
                            <option key={k} value={k}>{WORK_CLASSIFICATION_LABELS[k]}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        {requiredKeys.map((key) => {
                          const checked = milestone.checklistState[key] === true;
                          const attached = milestone.attachmentIds.length > 0; // Phase 1: not per-key tracked, just presence
                          return (
                            <div key={key} className="flex items-center gap-2 text-xs">
                              <input type="checkbox" checked={checked} disabled={!canCreate} onChange={() => toggleChecklist(key)} />
                              <span className="flex-1 text-foreground">{AR_CHECKLIST_LABELS[key]}{alwaysRequired.includes(key) && <span className="text-[#c23f3f]"> *</span>}</span>
                              {canCreate && (
                                <label className="flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer">
                                  <Upload size={12} />
                                  <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(key, f); }} />
                                </label>
                              )}
                              {attached && <span className="text-xs text-muted-foreground">({milestone.attachmentIds.length} ไฟล์)</span>}
                            </div>
                          );
                        })}
                      </div>

                      {canIssue && (
                        <button
                          onClick={handleIssue}
                          disabled={!checklistOk || issuing}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {issuing ? <Loader2 size={13} className="animate-spin" /> : <ClipboardCheck size={13} />}
                          ออกเอกสาร ({milestone.isDownPayment ? "AR" : "IV"} + BI)
                        </button>
                      )}
                      {!checklistOk && <p className="text-xs text-muted-foreground">ต้องแนบสำเนาใบสั่งซื้อ/สัญญา และใบส่งมอบงานก่อนจึงจะออกเอกสารได้</p>}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">งวดนี้ออกเอกสารแล้ว ดูรายการเอกสารด้านล่าง</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {scope.paymentConditions.installments.length === 0 && (
            <p className="text-sm text-muted-foreground">Scope of Work นี้ยังไม่มีงวดการชำระเงิน</p>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">เอกสารที่ออกแล้ว</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีเอกสารที่ออก</p>
        ) : (
          <div className="space-y-1.5">
            {documents.map((d) => {
              // ใบเสร็จที่ยังใช้งานซึ่งอ้างถึงใบกำกับภาษีฉบับนี้ (ผูกผ่าน linkedArDocumentId ในบรรทัดรายการ)
              const receipt = (d.docType === "AR" || d.docType === "IV")
                ? documents.find((re) => re.docType === "RE" && re.status === "issued" && re.lines.some((l) => l.linkedArDocumentId === d.id))
                : undefined;
              return (
                <div key={d.id} className="flex items-center justify-between gap-3 text-sm border-b border-border/40 py-1.5 last:border-0">
                  <div className="flex items-center gap-2">
                    <Receipt size={14} className="text-muted-foreground" />
                    <span className="font-mono text-foreground">{d.docNo}</span>
                    <span className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[d.docType]}</span>
                    {d.status === "cancelled" && <span className="text-xs text-[#c23f3f]">ยกเลิกแล้ว</span>}
                    {receipt && <span className="text-xs text-[#207e52]">รับชำระแล้ว ({receipt.docNo})</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-foreground">฿{d.netTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                    {canIssue && d.status === "issued" && (d.docType === "AR" || d.docType === "IV") && !receipt && (
                      <button
                        onClick={() => setReceiptTarget(d)}
                        className="px-2 py-1 text-xs border border-[#c9a84c]/40 text-[#a5813a] rounded-lg hover:bg-[#c9a84c]/10 transition-colors"
                      >
                        ออกใบเสร็จ
                      </button>
                    )}
                    <button
                      onClick={() => void handlePrint(d.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="พิมพ์"
                    >
                      <Printer size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={receiptTarget !== null}
        title="ออกใบเสร็จรับเงิน"
        message={`ยืนยันการออกใบเสร็จรับเงินสำหรับใบกำกับภาษี ${receiptTarget?.docNo ?? ""} ยอด ${receiptTarget ? receiptTarget.netTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : ""} บาท (ออกเมื่อได้รับชำระเงินแล้วเท่านั้น)`}
        confirmLabel={receiptBusy ? "กำลังออกเอกสาร..." : "ออกใบเสร็จ"}
        busy={receiptBusy}
        onConfirm={() => void handleIssueReceipt()}
        onCancel={() => setReceiptTarget(null)}
      />
    </div>
    {printDoc && <ArDocumentPrintDocument document={printDoc} paidByInvoiceId={paidByInvoiceId} />}
    </>
  );
}

function StatusPill({ status }: { status: ArBillingStatus }) {
  const style: Record<ArBillingStatus, string> = {
    not_billed: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
    billed: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
    work_open: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
    closed: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
  };
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${style[status]}`}>{BILLING_STATUS_LABELS[status]}</span>;
}
