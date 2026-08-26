import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Clock, Loader2, AlertTriangle } from "lucide-react";
import { SignaturePad } from "../../components/SignaturePad";
import {
  fetchCustomerApprovalPublic, respondCustomerApprovalPublic,
  type CustomerApprovalPublicData,
} from "../../lib/serviceReports";
import { ApiError } from "../../lib/apiClient";

/**
 * Public customer-approval page (added 2026-08-10) — rendered WITHOUT the app shell or a session:
 * `src/main.tsx` branches here for the `/approve` path before the auth gate ever runs. The
 * capability key in the URL is the entire authorization (see
 * api/_lib/serviceReportHandler.ts "Customer approval"). Thai-only on purpose, like the printed
 * documents — the reader is the customer, not an ERP user with a language preference.
 * Mobile-first: the link usually arrives in LINE and opens on a phone.
 */
export default function CustomerApprovalPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const reportId = params.get("report") ?? "";
  const key = params.get("key") ?? "";

  // ลิงก์ที่ไม่มีพารามิเตอร์ครบเป็นสถานะที่รู้ได้ตั้งแต่ render แรก — ไม่ต้องผ่าน effect
  const linkMissing = !reportId || !key;
  const [data, setData] = useState<CustomerApprovalPublicData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(!linkMissing);

  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [signature, setSignature] = useState<{ dataUrl: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectName, setRejectName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (linkMissing) return;
    fetchCustomerApprovalPublic(reportId, key)
      .then(setData)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "ไม่พบลิงก์อนุมัติ หรือลิงก์ถูกยกเลิกแล้ว"))
      .finally(() => setLoading(false));
  }, [reportId, key, linkMissing]);

  const submit = async (payload: Parameters<typeof respondCustomerApprovalPublic>[2]) => {
    setSubmitting(true);
    setSubmitError("");
    try {
      setData(await respondCustomerApprovalPublic(reportId, key, payload));
      setMode("idle");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "ส่งคำตอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 size={16} className="animate-spin" /> กำลังโหลดเอกสาร...</div>
      </div>
    );
  }
  if (linkMissing || loadError || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-xl p-6 max-w-sm text-center" role="alert">
          <AlertTriangle size={22} className="text-[#e08a3c] mx-auto mb-2" />
          <p className="text-sm text-foreground">{linkMissing ? "ลิงก์ไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่" : loadError || "ไม่พบลิงก์อนุมัติ"}</p>
        </div>
      </div>
    );
  }

  const { report, approval, companyName, companyLogoDataUrl } = data;
  const pending = approval.status === "pending" && !approval.expired;

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      <header className="bg-[#0b1d3a] px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {companyLogoDataUrl && <img src={companyLogoDataUrl} alt="" className="h-9 w-9 object-contain rounded bg-white/90 p-0.5" />}
          <div>
            <p className="text-[#c9a84c] text-xs font-semibold tracking-wide">{companyName || "TCS ERP"}</p>
            <h1 className="text-white text-base font-semibold leading-tight">รายงานบริการ {report.id}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-5 mt-4 space-y-4">
        {/* สถานะปัจจุบันของการอนุมัติ */}
        {approval.status === "approved" && (
          <div className="bg-[#2aa36b]/10 border border-[#2aa36b]/30 rounded-xl p-4 flex items-start gap-2.5" role="status">
            <CheckCircle2 size={18} className="text-[#207e52] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#207e52]">อนุมัติรายงานนี้เรียบร้อยแล้ว{approval.signedName ? ` โดย ${approval.signedName}` : ""} — ขอบคุณครับ</p>
          </div>
        )}
        {approval.status === "rejected" && (
          <div className="bg-[#e05252]/10 border border-[#e05252]/30 rounded-xl p-4 flex items-start gap-2.5" role="status">
            <XCircle size={18} className="text-[#d22626] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#d22626]">ท่านแจ้งไม่อนุมัติรายงานนี้แล้ว — เจ้าหน้าที่ได้รับเหตุผลของท่านและจะติดต่อกลับ</p>
          </div>
        )}
        {approval.status === "pending" && approval.expired && (
          <div className="bg-[#e08a3c]/10 border border-[#e08a3c]/30 rounded-xl p-4 flex items-start gap-2.5" role="alert">
            <Clock size={18} className="text-[#a75d1a] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#a75d1a]">ลิงก์นี้หมดอายุแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่</p>
          </div>
        )}

        {/* ข้อมูลงาน */}
        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>ข้อมูลงานบริการ</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {/* Field order matches the editor form (ServiceReportEditor.tsx) so the same record
                reads the same way to the engineer who filled it in and the customer who receives
                it. Empty values drop out — most of these are optional, and a customer-facing page
                should never show a labelled blank. `mono` marks a value meant to be read
                character-by-character rather than as prose (DESIGN.md, Numbers/Codes); the printed
                Service Report renders อ้างอิงโปรเจกต์ the same way. */}
            {([
              ["ชื่อบริษัท", report.customerSnapshot.companyName],
              ["ผู้ติดต่อ", report.customerSnapshot.contactName],
              ["สถานที่ให้บริการ", report.serviceLocation],
              // The customer's own reference for this job — often the only thing that ties our
              // SR number to a PO/project on their side, so it is worth the row even though the
              // field is optional in the editor.
              ["อ้างอิงโปรเจกต์/รหัสงาน", report.projectOrJobCode, "mono"],
              ["ระบบที่ให้บริการ", report.serviceSystemName],
              ["ประเภทบริการ", report.serviceType],
              ["วันที่เข้าบริการ", report.inspectionDate],
              ["วันที่ออกรายงาน", report.reportDate],
              ["ผู้เข้าตรวจสอบ", [report.engineerName, ...report.additionalInspectorNames].filter(Boolean).join(", ")],
            ] as [string, string, "mono"?][]).filter(([, v]) => v).map(([label, value, mono]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className={mono ? "text-foreground font-mono" : "text-foreground"}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ผลการตรวจเช็ค */}
        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>ผลการตรวจเช็ค</h2>
          <div className="space-y-4">
            {report.templateSnapshot.sections.map((section) => {
              const sectionValue = report.checklist.find((s) => s.key === section.key);
              if (section.isOptionalAddon && !(sectionValue?.included ?? false)) return null;
              return (
                <div key={section.key}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{section.title}</h3>
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {section.groups.map((group) => {
                      const groupValue = sectionValue?.groups.find((g) => g.key === group.key);
                      return group.items.map((item) => {
                        const value = groupValue?.items.find((it) => it.key === item.key);
                        const status = value?.status ?? "not_selected";
                        return (
                          <div key={`${group.key}-${item.key}`} className="px-3 py-2 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-foreground">{group.title !== item.label ? `${group.title} — ${item.label}` : item.label}</span>
                              {item.kind === "measurement" ? (
                                <span className="font-mono text-foreground whitespace-nowrap">{value?.measurementValue || "-"}</span>
                              ) : status === "normal" ? (
                                <span className="text-[#207e52] text-xs font-medium whitespace-nowrap">✓ ปกติ</span>
                              ) : status === "abnormal" ? (
                                <span className="text-[#d22626] text-xs font-medium whitespace-nowrap">✕ ผิดปกติ</span>
                              ) : (
                                <span className="text-muted-foreground text-xs whitespace-nowrap">-</span>
                              )}
                            </div>
                            {/* รายละเอียด/รูป แสดงทุกสถานะ ไม่ใช่เฉพาะ "ผิดปกติ" — ช่างแนบรูปกับรายการที่
                                ติ๊ก "ปกติ" ได้ ถ้ากรองด้วย status ลูกค้าจะไม่มีวันเห็นรูปพวกนั้นเลย */}
                            {value?.abnormalDetail && (
                              <p className={`text-xs mt-1 ${status === "abnormal" ? "text-[#a75d1a]" : "text-muted-foreground"}`}>{value.abnormalDetail}</p>
                            )}
                            {(value?.photos ?? []).length > 0 && (
                              <div className="grid grid-cols-3 gap-1.5 mt-2">
                                {value!.photos.map((p) => (
                                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                                    {/* object-contain ไม่ใช่ cover — รูปถ่ายหน้างานส่วนใหญ่เป็นแนวตั้ง
                                        พอ cover ลงกรอบเตี้ยกว้าง หัวกับท้ายรูปจะโดนเฉือนทิ้ง */}
                                    <img src={p.url} alt={p.fileName} loading="lazy" className="rounded border border-border w-full h-20 object-contain bg-secondary" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {(report.overallCustomerSummary || report.overallRemark) && (
          <section className="bg-card border border-border rounded-xl p-5 space-y-3">
            {report.overallCustomerSummary && (
              <div>
                <h2 className="text-xs text-muted-foreground mb-1">สรุปภาพรวมการให้บริการ</h2>
                <p className="text-sm whitespace-pre-wrap">{report.overallCustomerSummary}</p>
              </div>
            )}
            {report.overallRemark && (
              <div>
                <h2 className="text-xs text-muted-foreground mb-1">หมายเหตุ</h2>
                <p className="text-sm whitespace-pre-wrap">{report.overallRemark}</p>
              </div>
            )}
          </section>
        )}

        {/* ส่วนตอบรับ */}
        {pending && (
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>การอนุมัติรายงาน</h2>
              <p className="text-xs text-muted-foreground mt-0.5">กรุณาตรวจสอบรายงานด้านบน แล้วลงลายเซ็นเพื่ออนุมัติ หรือแจ้งเหตุผลหากไม่อนุมัติ (ลิงก์ใช้ได้ถึง {approval.expiresAt.slice(0, 10)})</p>
            </div>

            {mode === "idle" && (
              <>
                <SignaturePad
                  dataUrl={signature?.dataUrl ?? ""}
                  signerName={signature?.name ?? report.customerSnapshot.contactName}
                  signedAt={null}
                  allowUpload={false}
                  onConfirm={(sig) => setSignature(sig)}
                  onClear={() => setSignature(null)}
                />
                {submitError && <p role="alert" className="text-xs text-[#e05252]">{submitError}</p>}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => signature && submit({ decision: "approved", signatureDataUrl: signature.dataUrl, signedName: signature.name })}
                    disabled={!signature || submitting}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} อนุมัติรายงาน
                  </button>
                  <button
                    onClick={() => { setMode("reject"); setSubmitError(""); }}
                    disabled={submitting}
                    className="flex-1 px-4 py-2.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-[#e05252] hover:border-[#e05252]/40 transition-all disabled:opacity-50"
                  >
                    ไม่อนุมัติ / แจ้งแก้ไข
                  </button>
                </div>
                {!signature && <p className="text-xs text-muted-foreground">ลงลายเซ็นและกด "ยืนยันลายเซ็น" ก่อน จึงจะกดอนุมัติได้</p>}
              </>
            )}

            {mode === "reject" && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="reject-name" className="text-xs text-muted-foreground block mb-1.5">ชื่อผู้แจ้ง</label>
                  <input
                    id="reject-name" type="text" value={rejectName}
                    onChange={(e) => setRejectName(e.target.value)}
                    placeholder={report.customerSnapshot.contactName || "ชื่อ-นามสกุล"}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-[#c9a84c]/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reject-reason" className="text-xs text-muted-foreground block mb-1.5">เหตุผลที่ไม่อนุมัติ / สิ่งที่ต้องแก้ไข <span className="text-[#e05252]">*</span></label>
                  <textarea
                    id="reject-reason" rows={4} value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-[#c9a84c]/50 focus:outline-none"
                  />
                </div>
                {submitError && <p role="alert" className="text-xs text-[#e05252]">{submitError}</p>}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => submit({ decision: "rejected", rejectReason, signedName: rejectName.trim() || report.customerSnapshot.contactName })}
                    disabled={!rejectReason.trim() || submitting}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm bg-[#e05252] text-white rounded-lg font-semibold hover:bg-[#c94444] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />} ยืนยันไม่อนุมัติ
                  </button>
                  <button
                    onClick={() => setMode("idle")}
                    disabled={submitting}
                    className="flex-1 px-4 py-2.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    ย้อนกลับ
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <p className="text-center text-xs text-muted-foreground pt-2">เอกสารนี้ออกโดยระบบ {companyName || "TCS ERP"} — หากมีข้อสงสัยกรุณาติดต่อเจ้าหน้าที่ที่ดูแลงานของท่าน</p>
      </main>
    </div>
  );
}
